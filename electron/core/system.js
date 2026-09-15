'use strict';
/* ============================================================================
 * core/system.js — boot behavior + NTFS filesystem tweaks.
 * sys-* are safe info/behavior flags (Free); disk-* touch the filesystem
 * layer via fsutil (Pro, admin, current values captured first so undo
 * restores YOUR defaults — verified 2/2 on the dev machine).
 * ========================================================================== */
const { runCmd, regSetDword, regSetString } = require('./exec');

async function wrap(fn) {
  try { return await fn(); }
  catch (e) { return { ok: false, message: String(e) }; }
}

/* Verbose boot/shutdown status: see WHAT Windows is doing instead of dots. */
const verboseBoot = () => wrap(async () => {
  const r = await regSetDword('HKLM', 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System', 'VerboseStatus', 1);
  return r.ok ? { ok: true, message: 'Verbose boot messages on.', revert: r.revert } : r;
});

/* Full technical text on the blue screen (stop code + driver) instead of ":(". */
const bsodDetails = () => wrap(async () => {
  const r = await regSetDword('HKLM', 'SYSTEM\\CurrentControlSet\\Control\\CrashControl', 'DisplayParameters', 1);
  return r.ok ? { ok: true, message: 'BSODs now show technical details.', revert: r.revert } : r;
});

/* Faster shutdown/logoff: auto-end hung apps instead of the "waiting" purgatory. */
const fastShutdown = () => wrap(async () => {
  const a = await regSetDword('HKCU', 'Control Panel\\Desktop', 'AutoEndTasks', 1);
  const b = await regSetString('HKCU', 'Control Panel\\Desktop', 'HungAppTimeout', '1000');
  const c = await regSetString('HKCU', 'Control Panel\\Desktop', 'WaitToKillAppTimeout', '2000');
  for (const r of [a, b, c]) if (!r.ok) return { ok: false, message: r.message };
  return { ok: true, message: 'Shutdown/logoff no longer waits on hung apps.', revert: [a.revert, b.revert, c.revert] };
});

/* Storage Sense on: Windows auto-cleans temp/recycle on a schedule. */
const storageSense = () => wrap(async () => {
  const r = await regSetDword('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\StorageSense\\Parameters\\StoragePolicy', 'AllowStorageSenseGlobal', 1);
  return r.ok ? { ok: true, message: 'Storage Sense enabled.', revert: r.revert } : r;
});

/* Read the CURRENT fsutil value (for honest undo — defaults differ by PC;
 * dev machine showed disablelastaccess=2, disable8dot3=2). */
async function fsutilGet(name) {
  const r = await runCmd('fsutil', ['behavior', 'query', name], 30000);
  const m = (r.stdout || '').match(new RegExp(`${name}\\s*=\\s*(\\d+)`, 'i'));
  return m ? m[1] : null;
}

/* Last-access timestamps off: fewer disk writes on file-heavy systems/HDDs.
 * Reboot to fully apply. Previous value captured → true undo. */
async function noLastAccess() {
  try {
    const prev = await fsutilGet('disablelastaccess');
    const r = await runCmd('fsutil', ['behavior', 'set', 'disablelastaccess', '1'], 60000);
    if (r.code !== 0) return { ok: false, message: 'fsutil failed (run as admin).' };
    return {
      ok: true, message: `Last-access updates off${prev !== null ? ` (was ${prev})` : ''}. Reboot to apply.`,
      revert: prev !== null
        ? { kind: 'cmdline', file: 'fsutil', args: ['behavior', 'set', 'disablelastaccess', prev], label: 'Last-access updates restored.' }
        : { kind: 'none' },
    };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* 8.3 short filenames off: skips legacy name bookkeeping on new files.
 * Ancient (16-bit-era) installers can choke — modal warns. */
async function no8dot3() {
  try {
    const prev = await fsutilGet('disable8dot3');
    const r = await runCmd('fsutil', ['behavior', 'set', 'disable8dot3', '1'], 60000);
    if (r.code !== 0) return { ok: false, message: 'fsutil failed (run as admin).' };
    return {
      ok: true, message: `8.3 filenames off${prev !== null ? ` (was ${prev})` : ''}. Affects new files.`,
      revert: prev !== null
        ? { kind: 'cmdline', file: 'fsutil', args: ['behavior', 'set', 'disable8dot3', prev], label: '8.3 filenames restored.' }
        : { kind: 'none' },
    };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Legacy F8 boot menu (bootmenupolicy Legacy): the classic text menu with
 * Safe Mode on F8 — for troubleshooters who miss it. */
async function bootMenuLegacy() {
  try {
    const { runCmd } = require('./exec');
    const r = await runCmd('bcdedit', ['/set', '{current}', 'bootmenupolicy', 'Legacy'], 30000);
    if (r.code !== 0) return { ok: false, message: 'bcdedit failed (run as admin).' };
    return {
      ok: true, message: 'Legacy F8 boot menu on.',
      revert: { kind: 'bcdedit', args: ['/set', '{current}', 'bootmenupolicy', 'Standard'] },
    };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Minidumps instead of full memory dumps: a crash writes KBs, not GBs. */
async function miniDumps() {
  try {
    const r = await regSetDword('HKLM', 'SYSTEM\\CurrentControlSet\\Control\\CrashControl', 'CrashDumpEnabled', 3);
    return r.ok
      ? { ok: true, message: 'Crash dumps → minidump (256KB, not GBs).', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* No auto-restart after a blue screen: stay on the error so you can read it
 * (pairs with the technical-BSOD tweak). Hold the power button to reboot. */
async function noAutoRebootBSOD() {
  try {
    const r = await regSetDword('HKLM', 'SYSTEM\\CurrentControlSet\\Control\\CrashControl', 'AutoReboot', 0);
    return r.ok
      ? { ok: true, message: 'No auto-reboot on blue screens.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Keep TRIM enabled (DisableDeleteNotify=0): SSDs stay fast and healthy.
 * Previous value captured → true undo (dev default is 0 = enabled). */
async function trimOn() {
  try {
    const prev = await fsutilGet('DisableDeleteNotify');
    const r = await runCmd('fsutil', ['behavior', 'set', 'DisableDeleteNotify', '0'], 60000);
    if (r.code !== 0) return { ok: false, message: 'fsutil failed (run as admin).' };
    return {
      ok: true, message: `TRIM enforced${prev !== null ? ` (was ${prev})` : ''}.`,
      revert: prev !== null
        ? { kind: 'cmdline', file: 'fsutil', args: ['behavior', 'set', 'DisableDeleteNotify', prev], label: 'TRIM setting restored.' }
        : { kind: 'none' },
    };
  } catch (e) { return { ok: false, message: String(e) }; }
}

module.exports = {
  verboseBoot, bsodDetails, fastShutdown, storageSense,
  noLastAccess, no8dot3, trimOn,
  bootMenuLegacy, miniDumps, noAutoRebootBSOD,
};
