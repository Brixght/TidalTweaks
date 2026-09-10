'use strict';
/* ============================================================================
 * core/exec.js — the ONLY place that spawns processes or touches the registry.
 * ----------------------------------------------------------------------------
 * Every tweak module calls these helpers instead of rolling its own shell
 * code. Rules enforced here:
 *   • powershell.exe always runs -NoProfile -NonInteractive (fast, no hangs)
 *   • every call has a timeout and NEVER throws — results are data
 *   • reg.exe (built into Windows) is used for registry work: no extra deps,
 *     and regSet() ALWAYS snapshots the previous value first so undo works
 * Revert descriptors produced here look like:
 *   { kind:'reg', root, path, name, prev:{ exists, type, value } }
 * and are executed by core/backup.js.
 * ========================================================================== */
const { execFile } = require('node:child_process');

/** Run any executable, never throw. → { code, stdout, stderr } */
function runCmd(file, args, timeoutMs) {
  return new Promise((resolve) => {
    execFile(
      file, args || [],
      { timeout: timeoutMs || 60000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        resolve({
          code: err && typeof err.code === 'number' ? err.code : (err ? 1 : 0),
          stdout: String(stdout || ''),
          stderr: String(stderr || ''),
          timedOut: !!(err && err.killed),
        });
      }
    );
  });
}

/** Run a PowerShell snippet. → { code, stdout, stderr } */
function runPS(script, timeoutMs) {
  return runCmd(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    timeoutMs || 120000
  );
}

function escRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Read one registry value via `reg query`. → { exists, type, value } */
async function regRead(root, subkey, name) {
  const r = await runCmd('reg', ['query', `${root}\\${subkey}`, '/v', name], 15000);
  if (r.code !== 0) return { exists: false };
  // Output line looks like: "    MenuShowDelay    REG_SZ    400"
  const m = r.stdout.match(new RegExp(`^\\s*${escRe(name)}\\s+(REG_\\S+)\\s+(.+?)\\s*$`, 'mi'));
  if (!m) return { exists: false };
  return { exists: true, type: m[1].toUpperCase(), value: m[2] };
}

/** Set a DWORD value (with backup). value = number. */
async function regSetDword(root, subkey, name, value) {
  const prev = await regRead(root, subkey, name);
  const r = await runCmd('reg', ['add', `${root}\\${subkey}`, '/v', name, '/t', 'REG_DWORD', '/d', String(value), '/f'], 15000);
  if (r.code !== 0) return { ok: false, message: (r.stdout + r.stderr).trim().slice(0, 300) || 'reg add failed (admin?)' };
  return { ok: true, revert: { kind: 'reg', root, path: subkey, name, prev } };
}

/** Set a string value (with backup). */
async function regSetString(root, subkey, name, value) {
  const prev = await regRead(root, subkey, name);
  const r = await runCmd('reg', ['add', `${root}\\${subkey}`, '/v', name, '/t', 'REG_SZ', '/d', String(value), '/f'], 15000);
  if (r.code !== 0) return { ok: false, message: (r.stdout + r.stderr).trim().slice(0, 300) || 'reg add failed (admin?)' };
  return { ok: true, revert: { kind: 'reg', root, path: subkey, name, prev } };
}

module.exports = { runCmd, runPS, regRead, regSetDword, regSetString, scGetStart };

/** `sc qc` → previous start type ('auto'|'manual'|'disabled'|...). */
async function scGetStart(svc) {
  const r = await runCmd('sc.exe', ['qc', svc], 15000);
  const m = (r.stdout || '').match(/START_TYPE\s*:\s*\d+\s+(\S+)/i);
  const word = (m && m[1] || '').toUpperCase();
  if (word.includes('DISABLED')) return 'disabled';
  if (word.includes('AUTO')) return 'auto';
  if (word.includes('DEMAND')) return 'demand'; // manual
  return word.toLowerCase() || 'unknown';
}
