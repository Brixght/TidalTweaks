'use strict';
/* ============================================================================
 * core/memory.js — low-level memory-management tweaks (Pro).
 * Compression store, system cache balance, prefetcher, pagefile clearing
 * and paging executive. Registry writes snapshot for undo (regSetDword);
 * the MMAgent toggle reverts via Enable-MMAgent. Never throws.
 * ========================================================================== */
const { runPS, regSetDword } = require('./exec');

const MEM = 'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management';

/* Disable-MMAgent -mc: kills the compression store (less CPU churn, but the
 * RAM it used to save now stays resident — 16GB+ rigs won't notice). */
async function disableCompression() {
  try {
    const r = await runPS('Disable-MMAgent -mc', 60000);
    const out = (r.stdout + r.stderr).toLowerCase();
    if (r.code !== 0 && !out.includes('already')) {
      return { ok: false, message: 'Disable-MMAgent failed (run as admin).' };
    }
    return {
      ok: true, message: 'Memory compression off (compression store freed).',
      revert: { kind: 'cmdline', file: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', 'Enable-MMAgent -mc'], label: 'Memory compression re-enabled.' },
    };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* LargeSystemCache=1: favors the system working set / paged pool balance
 * for desktops doing heavy file + game I/O. NEEDS REBOOT. */
async function largeSystemCache() {
  try {
    const r = await regSetDword('HKLM', MEM, 'LargeSystemCache', 1);
    return r.ok
      ? { ok: true, message: 'Large system cache on — REBOOT.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Prefetcher + Superfetch off: pointless disk churn on NVMe/SSD systems
 * (SysMain service kill lives separately as adv-no-sysmain). */
async function prefetchOff() {
  try {
    const a = await regSetDword('HKLM', `${MEM}\\PrefetchParameters`, 'EnablePrefetcher', 0);
    const b = await regSetDword('HKLM', `${MEM}\\PrefetchParameters`, 'EnableSuperfetch', 0);
    if (!a.ok || !b.ok) return { ok: false, message: a.message || b.message };
    return { ok: true, message: 'Prefetch + Superfetch off — REBOOT to settle.', revert: [a.revert, b.revert] };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* ClearPageFileAtShutdown=0: removes a slow, pointless shutdown step
 * (wiping the pagefile buys nothing on an encrypted/home PC). */
async function pagefileNoClear() {
  try {
    const r = await regSetDword('HKLM', MEM, 'ClearPageFileAtShutdown', 0);
    return r.ok
      ? { ok: true, message: 'Pagefile wipe at shutdown off (faster shutdowns).', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* DisablePagingExecutive=1: keeps kernel + drivers resident instead of
 * paging them to disk. NEEDS REBOOT. Needs RAM headroom — skip on 8GB. */
async function pagingExecutive() {
  try {
    const r = await regSetDword('HKLM', MEM, 'DisablePagingExecutive', 1);
    return r.ok
      ? { ok: true, message: 'Kernel locked in RAM — REBOOT.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

module.exports = {
  disableCompression, largeSystemCache, prefetchOff,
  pagefileNoClear, pagingExecutive,
};
