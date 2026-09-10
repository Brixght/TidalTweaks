'use strict';
/* ============================================================================
 * core/startup.js — Free Startup Manager. Sources:
 *   HKCU\...\Run, HKLM\...\Run (via reg.exe) and both Startup folders.
 * Disabling is REVERSIBLE: registry values move to a Run-DisabledByTidal
 * backup key (same trick as the Python version); folder shortcuts are
 * renamed with a .tidal-disabled suffix. Originals are never destroyed.
 * ids look like "HKCU:Discord", "HKLM:SecurityHealth", "FUSER:app.lnk".
 * ========================================================================== */
const fs = require('node:fs');
const path = require('node:path');
const { runCmd, regRead } = require('./exec');

const RUN = 'Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const BACKUP_SUFFIX = '-DisabledByTidal';
const SUFFIX = '.tidal-disabled';

function startupFolders() {
  return [
    { tag: 'FUSER', dir: path.join(process.env.APPDATA || '', 'Microsoft\\Windows\\Start Menu\\Programs\\Startup') },
    { tag: 'FCOMMON', dir: path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft\\Windows\\Start Menu\\Programs\\Startup') },
  ];
}

/* Parse `reg query` value lines: "    Name    REG_SZ    data..." */
async function readRunKey(root) {
  const out = [];
  const r = await runCmd('reg', ['query', `${root}\\${RUN}`], 15000);
  if (r.code !== 0) return out;
  for (const line of (r.stdout || '').split('\n')) {
    const m = line.match(/^\s{2,}(\S.*?)\s{2,}(REG_\S+)\s{2,}([\s\S]*?)\s*$/);
    if (m) out.push({ name: m[1], type: m[2].toUpperCase(), data: m[3] });
  }
  // Subtract anything already sitting in the disabled-backup key.
  const dis = new Set();
  const rb = await runCmd('reg', ['query', `${root}\\${RUN}${BACKUP_SUFFIX}`], 15000);
  if (rb.code === 0) {
    for (const line of (rb.stdout || '').split('\n')) {
      const m = line.match(/^\s{2,}(\S.*?)\s{2,}REG_\S+\s{2,}/);
      if (m) dis.add(m[1]);
    }
  }
  return out.map((v) => ({ ...v, enabled: !dis.has(v.name) }));
}

async function listEntries() {
  try {
    const entries = [];
    for (const root of ['HKCU', 'HKLM']) {
      for (const v of await readRunKey(root)) {
        entries.push({
          id: `${root}:${v.name}`,
          name: v.name,
          command: v.data,
          location: root === 'HKCU' ? 'HKCU · user' : 'HKLM · machine',
          enabled: v.enabled,
        });
      }
    }
    for (const { tag, dir } of startupFolders()) {
      let files = [];
      try { files = fs.readdirSync(dir); } catch { continue; }
      for (const f of files) {
        // Skip Windows housekeeping files — toggling desktop.ini does nothing
        // except rename a system file, and it clutters the list (bug report).
        if (/^(desktop\.ini|thumbs\.db)$/i.test(f)) continue;
        const disabled = f.endsWith(SUFFIX);
        const name = disabled ? f.slice(0, -SUFFIX.length) : f;
        if (!disabled && files.includes(name + SUFFIX)) continue; // hide live twin
        entries.push({
          id: `${tag}:${name}`,
          name,
          command: path.join(dir, f),
          location: tag === 'FUSER' ? 'Folder · user' : 'Folder · machine',
          enabled: !disabled,
        });
      }
    }
    entries.sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name));
    return { ok: true, entries };
  } catch (e) { return { ok: false, message: String(e) }; }
}

async function setRegistryEnabled(root, name, enable) {
  const src = enable ? `${RUN}${BACKUP_SUFFIX}` : RUN;
  const dst = enable ? RUN : `${RUN}${BACKUP_SUFFIX}`;
  const cur = await regRead(root, src, name);
  if (!cur.exists) return { ok: false, message: `'${name}' not found.` };
  const add = await runCmd('reg', ['add', `${root}\\${dst}`, '/v', name, '/t', cur.type, '/d', cur.value, '/f'], 15000);
  if (add.code !== 0) return { ok: false, message: `Could not move value (admin for HKLM?): ${(add.stdout + add.stderr).trim().slice(0, 200)}` };
  await runCmd('reg', ['delete', `${root}\\${src}`, '/v', name, '/f'], 15000);
  return { ok: true, message: `'${name}' ${enable ? 'enabled' : 'disabled'} (reversible).` };
}

async function setFolderEnabled(tag, name, enable) {
  const folder = startupFolders().find((f) => f.tag === tag);
  if (!folder) return { ok: false, message: 'Unknown startup folder.' };
  const live = path.join(folder.dir, name);
  const parked = path.join(folder.dir, name + SUFFIX);
  try {
    if (enable) fs.renameSync(parked, live);
    else fs.renameSync(live, parked);
    return { ok: true, message: `'${name}' ${enable ? 'enabled' : 'disabled'} (reversible).` };
  } catch (e) { return { ok: false, message: `Rename failed: ${String(e).split('\n')[0]} (admin for machine folder?)` }; }
}

async function setEnabled(id, enabled) {
  try {
    const [scope, ...rest] = String(id || '').split(':');
    const name = rest.join(':');
    if (!name) return { ok: false, message: 'Invalid entry id.' };
    if (scope === 'HKCU' || scope === 'HKLM') return setRegistryEnabled(scope, name, !!enabled);
    if (scope === 'FUSER' || scope === 'FCOMMON') return setFolderEnabled(scope, name, !!enabled);
    return { ok: false, message: 'Unknown entry scope.' };
  } catch (e) { return { ok: false, message: String(e) }; }
}

module.exports = { listEntries, setEnabled };
