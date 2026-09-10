'use strict';
/* ============================================================================
 * core/backup.js — safety net: restore points + undo log + revert-all.
 * ----------------------------------------------------------------------------
 * Two layers of protection (same philosophy as the Python version):
 *   1. System Restore points via Checkpoint-Computer before Pro tweaks
 *      (Windows allows roughly one per day — frequency-limit errors are
 *      treated as success since a recent point already exists).
 *   2. Surgical undo log (undo.json in Electron's userData folder): every
 *      applied tweak appends { id, at, revert } where `revert` is the
 *      descriptor(s) captured by core/exec.js BEFORE the change.
 *      Undo Last / Revert One / Revert All replay those descriptors.
 * Revert descriptor kinds: reg | service | file | power | powercfg | device |
 * dns | hibernate | bcdedit | none. Handlers live in applyRevert() below.
 * ========================================================================== */
const fs = require('node:fs');
const path = require('node:path');
const { runPS, runCmd } = require('./exec');

function dataDir() {
  try {
    // Main process: Electron gives us a per-user data folder.
    return require('electron').app.getPath('userData');
  } catch {
    const base = process.env.APPDATA || process.cwd();
    const d = path.join(base, 'TidalTweaks');
    fs.mkdirSync(d, { recursive: true });
    return d;
  }
}
const logPath = () => path.join(dataDir(), 'undo.json');

function readLog() {
  try {
    const raw = fs.readFileSync(logPath(), 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function writeLog(arr) {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(logPath(), JSON.stringify(arr, null, 2));
}

/** Append one applied change to the undo log. */
function logChange(entry) {
  const log = readLog();
  log.push(entry);
  writeLog(log);
}

/** Create a System Restore point. Frequency-limit failures count as OK. */
async function createRestorePoint(label) {
  const safe = String(label || 'TidalTweaks').replace(/["']/g, '').slice(0, 100);
  const r = await runPS(`Checkpoint-Computer -Description "${safe}" -RestorePointType "MODIFY_SETTINGS"`, 180000);
  const combined = `${r.stdout}\n${r.stderr}`.toLowerCase();
  if (r.code === 0) return { ok: true, message: 'Restore point created.' };
  if (combined.includes('frequency') || combined.includes('already') || combined.includes('sequence')) {
    return { ok: true, message: 'Recent restore point already exists — continuing.' };
  }
  return { ok: false, message: `Could not create restore point: ${(r.stdout + r.stderr).trim().slice(0, 250) || 'unknown error (admin?)'}` };
}

/** Alias used by the tweak runner in main.js (one call, same semantics). */
const ensureRestorePoint = (label) => createRestorePoint(label);

/** Execute a single revert descriptor. Never throws. */
async function applyRevert(d) {
  if (!d || d.kind === 'none') return { ok: true, message: 'Nothing to undo for this change.' };
  try {
    switch (d.kind) {
      case 'reg': { // restore previous value, or delete if it didn't exist
        if (!d.prev || !d.prev.exists) {
          await runCmd('reg', ['delete', `${d.root}\\${d.path}`, '/v', d.name, '/f'], 15000);
          return { ok: true, message: `Removed ${d.name}.` };
        }
        await runCmd('reg', ['add', `${d.root}\\${d.path}`, '/v', d.name, '/t', d.prev.type, '/d', d.prev.value, '/f'], 15000);
        return { ok: true, message: `Restored ${d.name}.` };
      }
      case 'service': { // sc config start= <auto|demand|disabled>
        const mode = d.prevStart === 'auto' ? 'auto' : d.prevStart === 'disabled' ? 'disabled' : 'demand';
        await runCmd('sc.exe', ['config', d.name, `start=`, mode], 30000);
        return { ok: true, message: `Service ${d.name} start type restored (${mode}).` };
      }
      case 'file': { // copy the timestamped backup over the live file
        fs.copyFileSync(d.backup, d.path);
        return { ok: true, message: `Restored ${path.basename(d.path)} from backup.` };
      }
      case 'power': { // re-activate the previous scheme GUID
        await runCmd('powercfg', ['-setactive', d.prevGuid], 30000);
        return { ok: true, message: 'Previous power plan re-activated.' };
      }
      case 'powercfg': { // restore one powercfg AC value
        await runCmd('powercfg', ['-setacvalueindex', 'SCHEME_CURRENT', d.sub, d.setting, d.prev], 30000);
        await runCmd('powercfg', ['-setactive', 'SCHEME_CURRENT'], 30000);
        return { ok: true, message: 'Power setting restored.' };
      }
      case 'device': { // d.disable === what WAS applied; flip it back
        const flag = d.disabled ? '/enable-device' : '/disable-device';
        await runCmd('pnputil', [flag, `"${d.instanceId}"`, '/force'], 60000);
        return { ok: true, message: 'Device state restored.' };
      }
      case 'dns': { // restore previous servers, or DHCP if there were none
        if (!d.prev || !d.prev.length) {
          await runPS(`netsh interface ip set dns "${d.alias}" dhcp`, 30000);
        } else {
          await runPS(`netsh interface ip set dns "${d.alias}" static ${d.prev[0]} primary`, 30000);
          if (d.prev[1]) await runPS(`netsh interface ip add dns "${d.alias}" ${d.prev[1]} index=2`, 30000);
        }
        return { ok: true, message: 'DNS servers restored.' };
      }
      case 'hibernate': {
        await runCmd('powercfg', d.prevOn ? ['-h', 'on'] : ['-h', 'off'], 60000);
        return { ok: true, message: 'Hibernation setting restored.' };
      }
      case 'bcdedit': {
        await runCmd('bcdedit', d.args, 30000);
        return { ok: true, message: 'Boot setting restored.' };
      }
      case 'cmdline': { // generic captured command (fsutil, DISM, …)
        await runCmd(d.file, d.args || [], 300000);
        return { ok: true, message: d.label || 'Command reverted.' };
      }
      case 'netadv': { // NIC advanced property back to its captured value
        await runPS(`Set-NetAdapterAdvancedProperty -Name "${d.alias}" -DisplayName '${d.display}' -DisplayValue '${d.prev}' -ErrorAction SilentlyContinue -NoRestart`, 60000);
        return { ok: true, message: `NIC '${d.display}' restored.` };
      }
      case 'timeres': { // kill the 0.5ms holder process (see core/cpu.js)
        await require('./cpu').killTimerHolder();
        return { ok: true, message: 'Timer-resolution holder stopped.' };
      }
      case 'schtask': { // delete our scheduled task + its script file
        await runCmd('schtasks', ['/delete', '/tn', d.name, '/f'], 30000);
        try { require('node:fs').rmSync(d.script, { force: true }); } catch { /* gone already */ }
        return { ok: true, message: `Scheduled task '${d.name}' removed.` };
      }
      case 'regkey': { // whole-key backup: delete the key we created
        await runCmd('reg', ['delete', `${d.root}\\${d.path}`, '/f'], 15000);
        return { ok: true, message: 'Registry key removed.' };
      }
      default:
        return { ok: false, message: `Unknown revert kind: ${d.kind}` };
    }
  } catch (err) {
    return { ok: false, message: String((err && err.message) || err) };
  }
}

/** Apply descriptor OR array of descriptors, collecting messages. */
async function applyReverts(revert) {
  const list = Array.isArray(revert) ? revert : [revert];
  const msgs = [];
  let okCount = 0;
  for (const d of list) {
    const r = await applyRevert(d);
    if (r.ok) okCount++;
    msgs.push(r.message);
  }
  return { ok: okCount === list.length, message: msgs.join(' ') };
}

async function revertOne(id) {
  const log = readLog();
  const idx = log.map((e) => e.id).lastIndexOf(id);
  if (idx < 0) return { ok: false, message: 'No saved backup for this tweak yet.' };
  const [entry] = log.splice(idx, 1);
  writeLog(log);
  return applyReverts(entry.revert);
}

async function undoLast() {
  const log = readLog();
  const entry = log.pop();
  if (!entry) return { ok: false, message: 'Nothing to undo — history is empty.' };
  writeLog(log);
  const r = await applyReverts(entry.revert);
  return { ok: r.ok, message: `Undid '${entry.id}': ${r.message}` };
}

async function revertAll() {
  const log = readLog();
  if (!log.length) return { ok: false, message: 'No saved changes to revert.' };
  let okCount = 0;
  for (const entry of log.slice().reverse()) {
    const r = await applyReverts(entry.revert);
    if (r.ok) okCount++;
  }
  writeLog([]);
  return { ok: true, message: `Reverted ${okCount}/${log.length} change(s).` };
}

function history() {
  return { ok: true, history: readLog() };
}

module.exports = {
  dataDir, logChange, createRestorePoint, ensureRestorePoint,
  revertOne, undoLast, revertAll, history,
};
