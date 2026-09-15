'use strict';
/* ============================================================================
 * core/power.js — Power management tweaks (Pro). Ultimate Performance unlock,
 * USB suspend, disk sleep, CPU min-state, PCIe link-state.
 * ========================================================================== */
const { runCmd } = require('./exec');

const ULTIMATE_GUID = 'e9a42b02-d5df-448d-aa00-03f14749eb61';
const HIGH_PERF_GUID = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';

/** Currently active scheme GUID (for undo snapshots). */
async function activeScheme() {
  const r = await runCmd('powercfg', ['/getactivescheme'], 15000);
  const m = (r.stdout || '').match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  return m ? m[0] : null;
}

async function powerGet(sub, setting) {
  const r = await runCmd('powercfg', ['/query', 'SCHEME_CURRENT', sub, setting], 15000);
  const m = (r.stdout || '').match(/Current AC Power Setting Index:\s*(0x[0-9a-fA-F]+|\d+)/i);
  return m ? m[1] : '0';
}

async function powerSet(sub, setting, value) {
  const prev = await powerGet(sub, setting);
  const r = await runCmd('powercfg', ['-setacvalueindex', 'SCHEME_CURRENT', sub, setting, String(value)], 30000);
  if (r.code !== 0) return { ok: false, message: 'powercfg failed (admin?)' };
  await runCmd('powercfg', ['-setactive', 'SCHEME_CURRENT'], 30000);
  return { ok: true, revert: { kind: 'powercfg', sub, setting, prev } };
}

/* Duplicate the hidden Ultimate scheme, then activate it. If the SKU lacks
 * it, fall back to High Performance rather than failing outright. */
async function unlockUltimatePerformance() {
  try {
    const prev = await activeScheme();
    const dup = await runCmd('powercfg', ['-duplicatescheme', ULTIMATE_GUID], 30000);
    const dupOut = (dup.stdout + dup.stderr).toLowerCase();
    let guid = ULTIMATE_GUID;
    if (dup.code !== 0 && !/already|exist/.test(dupOut)) {
      const m = (dup.stdout || '').match(/[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}/);
      if (m) guid = m[0]; // duplicated a copy — activate whatever came back
    }
    let act = await runCmd('powercfg', ['-setactive', guid], 30000);
    if (act.code !== 0) {
      await runCmd('powercfg', ['-setactive', HIGH_PERF_GUID], 30000);
      return { ok: true, message: 'Ultimate plan unlocked (High Performance activated as fallback).', revert: prev ? { kind: 'power', prevGuid: prev } : { kind: 'none' } };
    }
    return { ok: true, message: 'Ultimate Performance unlocked & activated.', revert: prev ? { kind: 'power', prevGuid: prev } : { kind: 'none' } };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* High Performance without touching the Ultimate scheme (Gaming Mode combo). */
async function setHighPerformance() {
  try {
    const prev = await activeScheme();
    const r = await runCmd('powercfg', ['-setactive', HIGH_PERF_GUID], 30000);
    if (r.code !== 0) return { ok: false, message: 'Could not set High Performance (admin?)' };
    return { ok: true, message: 'Power plan → High Performance.', revert: prev ? { kind: 'power', prevGuid: prev } : { kind: 'none' } };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* USB selective suspend OFF (SUB_USB 48e6b7a6-50f5-4782-a5d4-53bb8f07e226). */
async function disableUSBSelectiveSuspend() {
  try {
    const r = await powerSet('2a737441-1930-4402-8d77-b2bebba308a3', '48e6b7a6-50f5-4782-a5d4-53bb8f07e226', 0);
    return r.ok
      ? { ok: true, message: 'USB selective suspend disabled.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Turn off hard disk after → 0 = never (SUB_DISK 0012ee47-9041-4b5d-9b77-535fba8b1442). */
async function disableDiskSleep() {
  try {
    const r = await powerSet('0012ee47-9041-4b5d-9b77-535fba8b1442', '6738e2c4-e8a5-485d-be70-f59d6016b920', 0);
    return r.ok
      ? { ok: true, message: 'Hard disks never sleep on AC.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

async function setMinProcessorState100() {
  try {
    const cpu = require('./cpu');
    return cpu.setMinProcessorState100(); // single implementation, shared
  } catch (e) { return { ok: false, message: String(e) }; }
}

async function disablePcieLinkState() {
  try {
    const cpu = require('./cpu');
    return cpu.disablePcieLinkState(); // single implementation, shared
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Balanced scheme (the Eco preset's anchor + the universal "put it back"
 * for Ultimate/High Performance). GUID 381b4222-f694-41f0-9685-ff5bb260df2e. */
async function setBalancedPlan() {
  try {
    const prev = await activeScheme();
    const r = await runCmd('powercfg', ['-setactive', '381b4222-f694-41f0-9685-ff5bb260df2e'], 30000);
    if (r.code !== 0) return { ok: false, message: 'Could not set Balanced (admin?)' };
    return { ok: true, message: 'Power plan → Balanced.', revert: prev ? { kind: 'power', prevGuid: prev } : { kind: 'none' } };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Modern Standby (CsEnabled=0): restores real S3 sleep on supporting
 * laptops — no more "hot bag" drain. NEEDS REBOOT. Absent key = unsupported. */
async function disableModernStandby() {
  try {
    const { regSetDword } = require('./exec');
    const r = await regSetDword('HKLM', 'SYSTEM\\CurrentControlSet\\Control\\Power', 'CsEnabled', 0);
    return r.ok
      ? { ok: true, message: 'Modern Standby off (S3 sleep back) — REBOOT.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Connected Standby (PlatformAoAcOverride=0): stops the always-on network
 * wake path that pairs with Modern Standby. NEEDS REBOOT. */
async function disableAoAc() {
  try {
    const { regSetDword } = require('./exec');
    const r = await regSetDword('HKLM', 'SYSTEM\\CurrentControlSet\\Control\\Power', 'PlatformAoAcOverride', 0);
    return r.ok
      ? { ok: true, message: 'Connected Standby off — REBOOT.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Lid close = do nothing (AC only): for docked laptops driving monitors.
 * Bag-carriers beware — your laptop stays ON when you shut it. */
async function lidCloseNothing() {
  try {
    const r = await powerSet('4f971e89-eebd-4455-a8de-9e59040e7347', '5ca83367-6e45-459f-a27b-476b1d01c0a', 0);
    return r.ok
      ? { ok: true, message: 'Lid close → do nothing (on AC).', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Sleep timeout → never (AC): for downloads, servers, long renders. */
async function sleepNever() {
  try {
    const r = await powerSet('238c9fa8-0aad-41ed-83f4-97be242c8f20', '29f6c1db-86da-48c5-9fdb-f2b67b1f44da', 0);
    return r.ok
      ? { ok: true, message: 'Sleep disabled on AC (screen may still dim).', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Auto-hibernate timeout → never: sleep stays sleep, no surprise hiberfil. */
async function noAutoHibernate() {
  try {
    const r = await powerSet('238c9fa8-0aad-41ed-83f4-97be242c8f20', '94ac6d29-73a4-41a6-809d-63a15c97f4b5', 0);
    return r.ok
      ? { ok: true, message: 'Auto-hibernate off.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Active cooling policy (AC): fans ramp BEFORE clocks drop. Laptops that
 * "mysteriously" lose fps after 10 minutes are usually heat-throttling on a
 * passive policy — this flips the order. Louder, faster, longer. */
async function activeCooling() {
  try {
    const r = await powerSet('54533251-82be-4824-96c1-47b60b740d00', '94d3a615-a899-4ac5-ae2b-e4d8f634367f', 1);
    return r.ok
      ? { ok: true, message: 'Cooling policy → Active (fans first).', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

module.exports = {
  unlockUltimatePerformance, setHighPerformance, setBalancedPlan,
  disableUSBSelectiveSuspend, disableDiskSleep,
  setMinProcessorState100, disablePcieLinkState, disableModernStandby,
  disableAoAc, lidCloseNothing, sleepNever, noAutoHibernate, activeCooling,
};
