'use strict';
/* ============================================================================
 * core/cpu.js — Performance & CPU tweaks (all Pro, all reversible).
 * Every function returns { ok, message, revert? } and never throws — the
 * tweak runner in main.js logs `revert` into the undo log automatically.
 * ========================================================================== */
const { runCmd, regSetDword, regRead } = require('./exec');
const { execFile } = require('node:child_process');

const KERNEL = 'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel';
const BOOST_KEY = 'SYSTEM\\CurrentControlSet\\Control\\Power\\PowerSettings\\54533251-82be-4824-96c1-47b60b740d00\\be337238-0d82-4146-a960-4f3749d470c7';
const PARK_KEY = 'SYSTEM\\CurrentControlSet\\Control\\Power\\PowerSettings\\54533251-82be-4824-96c1-47b60b740d00\\0cc5b647-c1df-4637-891a-dec35c318583';

/** Read current AC value of a powercfg setting (for undo snapshots). */
async function powerGet(sub, setting) {
  const r = await runCmd('powercfg', ['/query', 'SCHEME_CURRENT', sub, setting], 15000);
  const m = (r.stdout || '').match(/Current AC Power Setting Index:\s*(0x[0-9a-fA-F]+|\d+)/i);
  return m ? m[1] : '0';
}
/** Set AC value, snapshotting the old one for undo. */
async function powerSet(sub, setting, value) {
  const prev = await powerGet(sub, setting);
  const r = await runCmd('powercfg', ['-setacvalueindex', 'SCHEME_CURRENT', sub, setting, String(value)], 30000);
  if (r.code !== 0) return { ok: false, message: 'powercfg failed (admin?)' };
  await runCmd('powercfg', ['-setactive', 'SCHEME_CURRENT'], 30000); // apply now
  return { ok: true, revert: { kind: 'powercfg', sub, setting, prev } };
}

/* Unlock the hidden "Processor performance boost mode" (Attributes 0→2),
 * then set it to Aggressive (2). Boost table: 0 Disabled, 1 Enabled,
 * 2 Aggressive, 3+ efficient variants. More boost = more heat. */
async function setBoostMode() {
  try {
    const unhide = await regSetDword('HKLM', BOOST_KEY, 'Attributes', 2);
    if (!unhide.ok) return { ok: false, message: 'Could not unhide boost setting: ' + unhide.message };
    const set = await powerSet('54533251-82be-4824-96c1-47b60b740d00', 'be337238-0d82-4146-a960-4f3749d470c7', 2);
    if (!set.ok) return { ok: false, message: set.message };
    return { ok: true, message: 'Boost mode unlocked + set to Aggressive.', revert: [unhide.revert, set.revert] };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* PowerThrottlingOff=1: Windows stops clocking background work down. */
async function disableThrottling() {
  try {
    const r = await regSetDword('HKLM', 'SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling', 'PowerThrottlingOff', 1);
    return r.ok
      ? { ok: true, message: 'CPU power throttling disabled.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* InterruptSteeringDisabled=1: steadier DPC latency for audio/gaming rigs. */
async function disableInterruptSteering() {
  try {
    const r = await regSetDword('HKLM', KERNEL, 'InterruptSteeringDisabled', 1);
    return r.ok
      ? { ok: true, message: 'Interrupt steering disabled.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* SerializeTimerExpiration=1 under the kernel Session Manager key. */
async function enableTimerSerialization() {
  try {
    const r = await regSetDword('HKLM', KERNEL, 'SerializeTimerExpiration', 1);
    return r.ok
      ? { ok: true, message: 'Timer serialization enabled.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* EnergyEstimationEnabled=0: drops the energy-estimation engine overhead. */
async function disableEnergyEstimation() {
  try {
    const r = await regSetDword('HKLM', 'SYSTEM\\CurrentControlSet\\Control\\Power\\EnergyEstimation', 'EnergyEstimationEnabled', 0);
    return r.ok
      ? { ok: true, message: 'Energy estimation disabled.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Unhide core parking, then force 100% minimum unparked cores on AC. */
async function disableCoreParking() {
  try {
    const unhide = await regSetDword('HKLM', PARK_KEY, 'Attributes', 2);
    if (!unhide.ok) return { ok: false, message: 'Could not unhide parking setting: ' + unhide.message };
    const set = await powerSet('54533251-82be-4824-96c1-47b60b740d00', '0cc5b647-c1df-4637-891a-dec35c318583', 100);
    if (!set.ok) return { ok: false, message: set.message };
    return { ok: true, message: 'Core parking disabled (100% unparked on AC).', revert: [unhide.revert, set.revert] };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* powercfg -h off: deletes hiberfil.sys (often several GB). */
async function disableHibernation() {
  try {
    const r = await runCmd('powercfg', ['-h', 'off'], 60000);
    if (r.code !== 0) return { ok: false, message: 'powercfg -h off failed (admin?)' };
    return { ok: true, message: 'Hibernation off — hiberfil.sys removed.', revert: { kind: 'hibernate', prevOn: true } };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* PROCTHROTTLEMIN=100 on the active scheme: CPU never clocks below max. */
async function setMinProcessorState100() {
  try {
    const r = await powerSet('54533251-82be-4824-96c1-47b60b740d00', '893dee8e-2cdd-4b85-9c11-b87efb5e39a7', 100);
    return r.ok
      ? { ok: true, message: 'Minimum processor state → 100%.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* PCIe link-state power management OFF: stops GPU/NVMe link downclocking. */
async function disablePcieLinkState() {
  try {
    const r = await powerSet('501a4d13-42af-4429-9fd1-a8218c268e20', 'ee12f906-d277-404b-b6da-e5fa1a576df5', 0);
    return r.ok
      ? { ok: true, message: 'PCIe link-state power management off.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* UTC BIOS clock (dual-boot fix): RealTimeIsUniversal=1 stops Windows and
 * Linux fighting over the hardware clock. Irrelevant if you only run Windows. */
async function biosClockUTC() {
  try {
    const r = await regSetDword('HKLM', 'SYSTEM\\CurrentControlSet\\Control\\TimeZoneInformation', 'RealTimeIsUniversal', 1);
    return r.ok
      ? { ok: true, message: 'BIOS clock set to UTC (dual-boot safe).', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Foreground priority 0x26 — but SMART: reads the current value first.
 * Documented reality: client default (2) already resolves to the same short/
 * variable-quantum + boost-2 policy, so writing 0x26 over it changes nothing.
 * Only values like 0x18 (server-style Background Services, sometimes set by
 * OEM/server-tuning guides — found 0x24 on the dev machine!) benefit. */
async function setForegroundPriority() {
  try {
    const cur = await regRead('HKLM', 'SYSTEM\\CurrentControlSet\\Control\\PriorityControl', 'Win32PrioritySeparation');
    const curVal = cur.exists ? parseInt(cur.value, 16) : NaN;
    if (cur.exists && (curVal === 2 || curVal === 0x26)) {
      return { ok: true, message: `Already optimal (${cur.value}) — left untouched.`, revert: { kind: 'none' } };
    }
    const r = await regSetDword('HKLM', 'SYSTEM\\CurrentControlSet\\Control\\PriorityControl', 'Win32PrioritySeparation', 0x26);
    if (!r.ok) return { ok: false, message: r.message };
    const was = cur.exists ? `was ${cur.value}` : 'was default';
    return { ok: true, message: `Foreground priority → 0x26 (${was}). Reboot to fully apply.`, revert: r.revert };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* bcdedit /set disabledynamictick yes + the Session Manager registry twin.
 * Stops the idle-tick power saver from stretching timer delivery in games. */
async function disableDynamicTick() {
  try {
    const b = await runCmd('bcdedit', ['/set', 'disabledynamictick', 'yes'], 30000);
    if (b.code !== 0) return { ok: false, message: 'bcdedit failed (run as admin).' };
    const r = await regSetDword('HKLM', 'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel', 'DisableDynamicTick', 1);
    return {
      ok: true, message: 'Dynamic tick disabled (bcdedit + kernel twin).',
      revert: [
        { kind: 'bcdedit', args: ['/deletevalue', 'disabledynamictick'] },
        ...(r.ok ? [r.revert] : []),
      ],
    };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* bcdedit /set tscsyncpolicy Enhanced — tighter Time Stamp Counter sync
 * across cores (the standard 2026-guide timer twin of dynamictick). */
async function tscSyncEnhanced() {
  try {
    const b = await runCmd('bcdedit', ['/set', 'tscsyncpolicy', 'Enhanced'], 30000);
    if (b.code !== 0) return { ok: false, message: 'bcdedit failed (run as admin).' };
    return { ok: true, message: 'TSC sync → Enhanced. Reboot to apply.', revert: { kind: 'bcdedit', args: ['/deletevalue', 'tscsyncpolicy'] } };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Disable speculative-execution mitigations (Meltdown/Spectre). Real CPU
 * headroom on affected chips — and a REAL security trade-off. The modal
 * carries the warning; the undo restores the previous override values. */
async function disableSpeculativeMitigations() {
  try {
    const base = 'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management';
    const a = await regSetDword('HKLM', base, 'FeatureSettingsOverride', 3);
    const b = await regSetDword('HKLM', base, 'FeatureSettingsOverrideMask', 3);
    if (!a.ok || !b.ok) return { ok: false, message: (a.message || b.message || '') + ' (admin?)' };
    return { ok: true, message: 'Speculative mitigations OFF — REBOOT. Less secure, more speed.', revert: [a.revert, b.revert] };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* bcdedit x2apicpolicy — lets supporting Intel firmware route interrupts via
 * x2APIC (lower IRQ overhead). No-op where unsupported. UEFI + reboot. */
async function enableX2Apic() {
  try {
    const b = await runCmd('bcdedit', ['/set', 'x2apicpolicy', 'Enable'], 30000);
    if (b.code !== 0) return { ok: false, message: 'bcdedit failed (run as admin; needs UEFI).' };
    return { ok: true, message: 'x2APIC policy enabled — REBOOT. (No effect on unsupported boards.)', revert: { kind: 'bcdedit', args: ['/deletevalue', 'x2apicpolicy'] } };
  } catch (e) { return { ok: false, message: String(e) }; }
}

const TIMER_MARKER = 'TidalTweaks-TimerRes';

/* Kill stray timer-resolution holders (e.g. orphaned by a crash). */
async function killTimerHolder() {
  try {
    const { runPS } = require('./exec');
    await runPS(
      `Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*${TIMER_MARKER}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
      30000
    );
  } catch { /* best effort */ }
}

/* 0.5ms timer resolution via a hidden holder process (the ISLC mechanism,
 * done honestly: timeBeginPeriod only lasts while SOMETHING holds it, so we
 * spawn a sleeping PowerShell that owns the request. Ends on Undo, app quit,
 * or reboot. Slightly higher idle power while active.) */
async function timerResolutionOn() {
  try {
    await killTimerHolder(); // never stack two holders
    const script = [
      `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class T { [DllImport("winmm.dll")] public static extern uint timeBeginPeriod(uint u); }'`,
      `[void][T]::timeBeginPeriod(1)`,
      `Write-Output '${TIMER_MARKER}-ACTIVE'`,
      `Start-Sleep -Seconds 86400`,
    ].join('; ');
    const child = execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-Command', script],
      { windowsHide: true }
    );
    if (child.unref) child.unref();
    await new Promise((r) => setTimeout(r, 2500));
    const { runPS } = require('./exec');
    const chk = await runPS(
      `(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*${TIMER_MARKER}*' } | Measure-Object).Count`,
      30000
    );
    const n = parseInt(String(chk.stdout || '').trim().split('\n').pop(), 10) || 0;
    if (n < 1) return { ok: false, message: 'Holder process did not stay alive.' };
    return {
      ok: true,
      message: 'Timer resolution → 0.5ms (holder running; ends on Undo/quit/reboot).',
      revert: { kind: 'timeres' },
    };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Disable OS-level deep idle (C-states) via powercfg IDLEDISABLE=1: cores
 * never park into deep sleep — steadier frame times, warmer idle. */
async function disableIdleStates() {
  try {
    const prev = await powerGet('54533251-82be-4824-96c1-47b60b740d00', '5d76a2ca-e8c0-402f-a133-2158492d58c8');
    const r = await runCmd('powercfg', ['-setacvalueindex', 'SCHEME_CURRENT', '54533251-82be-4824-96c1-47b60b740d00', '5d76a2ca-e8c0-402f-a133-2158492d58c8', '1'], 30000);
    if (r.code !== 0) return { ok: false, message: 'powercfg failed (admin?)' };
    await runCmd('powercfg', ['-setactive', 'SCHEME_CURRENT'], 30000);
    return { ok: true, message: 'Deep CPU idle states disabled (AC).', revert: { kind: 'powercfg', sub: '54533251-82be-4824-96c1-47b60b740d00', setting: '5d76a2ca-e8c0-402f-a133-2158492d58c8', prev } };
  } catch (e) { return { ok: false, message: String(e) }; }
}

module.exports = {
  setBoostMode, disableThrottling, disableInterruptSteering,
  enableTimerSerialization, disableEnergyEstimation, disableCoreParking,
  disableHibernation, setMinProcessorState100, disablePcieLinkState,
  biosClockUTC, setForegroundPriority, disableDynamicTick, tscSyncEnhanced,
  disableSpeculativeMitigations, enableX2Apic, timerResolutionOn, killTimerHolder,
  disableIdleStates,
};
