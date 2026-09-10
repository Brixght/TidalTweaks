'use strict';
/* ============================================================================
 * core/gpu.js — Gaming & latency tweaks (all Pro, all reversible).
 * Covers: Game Bar/DVR, HAGS, Nagle, network throttling, responsiveness,
 * input queues, HPET (careful!), fullscreen optimizations, master toggle.
 * ========================================================================== */
const { runCmd, runPS, regSetDword } = require('./exec');

// Set several DWORDs under one key, collecting revert descriptors.
async function setMany(root, subkey, pairs) {
  const reverts = [];
  for (const [name, val] of pairs) {
    const r = await regSetDword(root, subkey, name, val);
    if (!r.ok) return { ok: false, message: `${name}: ${r.message}` };
    reverts.push(r.revert);
  }
  return { ok: true, reverts };
}

async function disableGameBar() {
  try {
    const a = await setMany('HKCU', 'System\\GameConfigStore', [['AppCaptureEnabled', 0], ['GameDVR_Enabled', 0]]);
    if (!a.ok) return { ok: false, message: a.message };
    const b = await regSetDword('HKLM', 'SOFTWARE\\Microsoft\\PolicyManager\\default\\ApplicationManagement\\AllowGameDVR', 'value', 0);
    const reverts = [...a.reverts, ...(b.ok ? [b.revert] : [])];
    return { ok: true, message: 'Game Bar / Game DVR disabled.', revert: reverts };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* HwSchMode=2: GPU schedules its own VRAM. Needs reboot + modern GPU. */
async function enableHAGS() {
  try {
    const r = await regSetDword('HKLM', 'SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers', 'HwSchMode', 2);
    return r.ok
      ? { ok: true, message: 'HAGS enabled — reboot to take effect.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* TcpAckFrequency=1 + TCPNoDelay=1 + TcpDelAckTicks=0 on EVERY adapter
 * interface under Tcpip\Parameters\Interfaces. The full classic trio (most
 * guides list one value and do nothing — all three land on the right key). */
async function disableNagle() {
  try {
    const list = await runCmd('reg', ['query', 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces'], 15000);
    if (list.code !== 0) return { ok: false, message: 'No network interfaces found.' };
    const ifaces = list.stdout.split('\n')
      .map((l) => l.trim())
      .filter((l) => /^HKEY_LOCAL_MACHINE/i.test(l))
      .map((l) => l.replace(/^HKEY_LOCAL_MACHINE\\/i, ''));
    if (!ifaces.length) return { ok: false, message: 'No network interfaces found.' };
    const reverts = [];
    for (const iface of ifaces) {
      const a = await regSetDword('HKLM', iface, 'TcpAckFrequency', 1);
      const b = await regSetDword('HKLM', iface, 'TCPNoDelay', 1);
      const c = await regSetDword('HKLM', iface, 'TcpDelAckTicks', 0);
      if (!a.ok || !b.ok || !c.ok) return { ok: false, message: `Failed on ${iface}` };
      reverts.push(a.revert, b.revert, c.revert);
    }
    return { ok: true, message: `Nagle off + instant ACKs on ${ifaces.length} adapter(s).`, revert: reverts };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* NetworkThrottlingIndex=0xffffffff: Windows stops capping game traffic. */
async function disableNetworkThrottling() {
  try {
    const r = await regSetDword('HKLM', 'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile', 'NetworkThrottlingIndex', 4294967295);
    return r.ok
      ? { ok: true, message: 'Network throttling disabled.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* SystemResponsiveness=10: only 10% of CPU reserved for background tasks. */
async function setSystemResponsiveness() {
  try {
    const r = await regSetDword('HKLM', 'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile', 'SystemResponsiveness', 10);
    return r.ok
      ? { ok: true, message: 'System responsiveness → games-first (10).', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Bigger keyboard/mouse queues (20) + zeroed key-response delays. */
async function optimizeInputLatency() {
  try {
    const a = await regSetDword('HKLM', 'SYSTEM\\CurrentControlSet\\Services\\mouclass\\Parameters', 'MouseDataQueueSize', 20);
    const b = await regSetDword('HKLM', 'SYSTEM\\CurrentControlSet\\Services\\kbdclass\\Parameters', 'KeyboardDataQueueSize', 20);
    const { regSetString } = require('./exec');
    const c = await regSetString('HKCU', 'Control Panel\\Accessibility\\Keyboard Response', 'DelayBeforeAcceptance', '0');
    const dd = await regSetString('HKCU', 'Control Panel\\Accessibility\\Keyboard Response', 'AutoRepeatDelay', '0');
    for (const r of [a, b, c, dd]) if (!r.ok) return { ok: false, message: r.message };
    return { ok: true, message: 'Input queues optimized.', revert: [a.revert, b.revert, c.revert, dd.revert] };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* bcdedit /deletevalue useplatformclock. Boot-config edit — risky on some
 * boards, which is why the UI modal carries the ⚠ warning. */
async function disableHPET() {
  try {
    const r = await runCmd('bcdedit', ['/deletevalue', 'useplatformclock'], 30000);
    const out = (r.stdout + r.stderr).toLowerCase();
    if (r.code !== 0 && !out.includes('not exist') && !out.includes('could not')) {
      return { ok: false, message: 'bcdedit failed (run as admin): ' + (r.stdout + r.stderr).trim().slice(0, 200) };
    }
    return { ok: true, message: 'HPET platform-clock override removed.', revert: { kind: 'bcdedit', args: ['/set', 'useplatformclock', 'true'] } };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Disable fullscreen optimizations GLOBALLY via the GameDVR FSE flags
 * (per-exe flags are impractical to enumerate; these two values achieve the
 * same bypass for exclusive-fullscreen games). */
async function disableFullscreenOptimizations() {
  try {
    const r = await setMany('HKCU', 'System\\GameConfigStore', [['GameDVR_FSEBehaviorMode', 2], ['GameDVR_DXGIHonorFSEWindowsCompatible', 1]]);
    if (!r.ok) return { ok: false, message: r.message };
    return { ok: true, message: 'Fullscreen optimizations bypassed.', revert: r.reverts };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Master toggle: boost foreground game + game-bar off + HAGS + high-perf.
 * Sub-results are merged; their revert descriptors are concatenated so one
 * Undo rolls the whole combo back. */
async function enableGamingMode() {
  try {
    // 1) Raise the FOREGROUND window's game to High priority via user32.
    // (JS double-quoted strings; PowerShell single quotes inside — no nesting.)
    const boostScript = [
      "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class W { [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow(); [DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p); }'",
      '$h=[W]::GetForegroundWindow(); $p=0; [void][W]::GetWindowThreadProcessId($h,[ref]$p)',
      '$proc=Get-Process -Id $p -ErrorAction SilentlyContinue',
      'if ($proc) { $proc.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::High; Write-Output ("BOOSTED:" + $proc.ProcessName) } else { Write-Output "NOGAME" }',
    ].join('; ');
    const boost = await runPS(boostScript, 30000);
    const boosted = /BOOSTED:(.+)/.exec(boost.stdout);

    const steps = [
      ['Game Bar off', await disableGameBar()],
      ['HAGS on', await enableHAGS()],
    ];
    const power = require('./power');
    steps.push(['High Performance plan', await power.setHighPerformance()]);
    const reverts = [];
    const summary = steps.map(([name, r]) => {
      if (r && r.ok) {
        if (r.revert) (Array.isArray(r.revert) ? reverts.push(...r.revert) : reverts.push(r.revert));
        return `✓ ${name}`;
      }
      return `✗ ${name}: ${(r && r.message) || 'failed'}`;
    });
    if (boosted) summary.unshift(`✓ Boosted '${boosted[1].trim()}' to High priority`);
    else summary.unshift('• No game window detected for priority boost');
    const okCount = summary.filter((s) => s.startsWith('✓')).length;
    return { ok: okCount >= 3, message: `Gaming Mode ${okCount}/${summary.length}:\n${summary.join('\n')}`, revert: reverts };
  } catch (e) { return { ok: false, message: String(e) }; }
}

module.exports = {
  disableGameBar, enableHAGS, disableNagle, disableNetworkThrottling,
  setSystemResponsiveness, optimizeInputLatency, disableHPET,
  disableFullscreenOptimizations, enableGamingMode,
  disableNvidiaTelemetry, enableMSIModeGPU, disableAMDULPS, boostSavedGames,
  windowsGameModeOn, mouseRawInput, keyboardFastRepeat,
  disableMPO, preferDiscreteGPU,
};

/* Multiplane Overlay off (OverlayTestMode=5): Microsoft's documented
 * workaround for flicker/stutter on some GPU+monitor combos. If nothing
 * changes for you, revert — MPO helps battery life on laptops. */
async function disableMPO() {
  try {
    const r = await regSetDword('HKLM', 'SOFTWARE\\Microsoft\\Windows\\Dwm', 'OverlayTestMode', 5);
    return r.ok
      ? { ok: true, message: 'Multiplane Overlay disabled — reboot to judge.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Force HIGH-PERFORMANCE GPU per saved game exe (laptops that wrongly pick
 * the iGPU): writes GpuPreference=2 into DirectX UserGpuPreferences.
 * Previous per-exe values are captured for true undo. */
async function preferDiscreteGPU(names) {
  try {
    const { regSetString } = require('./exec');
    const clean = [...new Set((names || []).map((n) => String(n).trim()))]
      .filter((n) => /^[\w\-. ]{1,60}\.exe$/i.test(n))
      .slice(0, 20);
    if (!clean.length) return { ok: false, message: 'No game exes saved yet.' };
    const base = 'Software\\Microsoft\\DirectX\\UserGpuPreferences';
    const reverts = [];
    for (const exe of clean) {
      const r = await regSetString('HKCU', base, exe, 'GpuPreference=2;');
      if (!r.ok) return { ok: false, message: `Failed on ${exe}` };
      reverts.push(r.revert);
    }
    return { ok: true, message: `Discrete GPU forced for ${clean.length} game(s).`, revert: reverts };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Windows Game Mode ON (the real one — reduces background activity for the
 * foreground game). Distinct from Game Bar/DVR, which stay OFF. */
async function windowsGameModeOn() {
  try {
    const r = await regSetDword('HKCU', 'Software\\Microsoft\\GameBar', 'AllowAutoGameMode', 1);
    return r.ok
      ? { ok: true, message: 'Windows Game Mode enabled.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Raw mouse feel: "Enhance pointer precision" (acceleration) OFF via the
 * classic Speed/Threshold triple-zero. Instantly revertible. */
async function mouseRawInput() {
  try {
    const { regSetString } = require('./exec');
    const a = await regSetString('HKCU', 'Control Panel\\Mouse', 'MouseSpeed', '0');
    const b = await regSetString('HKCU', 'Control Panel\\Mouse', 'MouseThreshold1', '0');
    const c = await regSetString('HKCU', 'Control Panel\\Mouse', 'MouseThreshold2', '0');
    for (const r of [a, b, c]) if (!r.ok) return { ok: false, message: r.message };
    return { ok: true, message: 'Pointer precision (accel) off — 1:1 mouse.', revert: [a.revert, b.revert, c.revert] };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Fastest key repeat: delay 0 (~250ms), rate 31 (~30 chars/sec). */
async function keyboardFastRepeat() {
  try {
    const { regSetString } = require('./exec');
    const a = await regSetString('HKCU', 'Control Panel\\Keyboard', 'KeyboardDelay', '0');
    const b = await regSetString('HKCU', 'Control Panel\\Keyboard', 'KeyboardSpeed', '31');
    if (!a.ok || !b.ok) return { ok: false, message: a.message || b.message };
    return { ok: true, message: 'Keyboard repeat → fastest.', revert: [a.revert, b.revert] };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* NvTelemetryContainer: NVIDIA's telemetry service. Drivers (and GeForce
 * Experience, if installed) keep working — only the telemetry pipe stops. */
async function disableNvidiaTelemetry() {
  try {
    const { scGetStart } = require('./exec');
    const prev = await scGetStart('NvTelemetryContainer');
    if (prev === 'unknown') return { ok: false, message: 'NvTelemetryContainer not found (no NVIDIA driver?).' };
    await runPS('sc.exe stop NvTelemetryContainer 2>$null; sc.exe config NvTelemetryContainer start= disabled', 60000);
    return { ok: true, message: 'NVIDIA telemetry service disabled.', revert: { kind: 'service', name: 'NvTelemetryContainer', prevStart: prev } };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* MSI mode on DISPLAY adapters only (MSISupported=1): message-signalled
 * interrupts cut DPC latency vs legacy line interrupts. NEEDS REBOOT.
 * Scoped to PCI display devices (VEN_10DE/1002/8086) — audio/USB untouched. */
async function enableMSIModeGPU() {
  try {
    const list = await runPS(
      'Get-PnpDevice -Class Display -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -match "^PCI\\\\VEN_(10DE|1002|8086)" } | Select-Object -ExpandProperty InstanceId',
      60000
    );
    const ids = (list.stdout || '').split('\n').map((l) => l.trim()).filter((l) => /^PCI\\/i.test(l));
    if (!ids.length) return { ok: false, message: 'No PCI display adapters found.' };
    const reverts = [];
    for (const id of ids) {
      const short = id.replace(/^[^\\]*\\/, ''); // Enum path below HKLM\SYSTEM\CurrentControlSet\Enum
      const sub = `SYSTEM\\CurrentControlSet\\Enum\\${short}\\Device Parameters\\Interrupt Management\\MessageSignaledInterruptProperties`;
      const r = await regSetDword('HKLM', sub, 'MSISupported', 1);
      if (!r.ok) return { ok: false, message: `Failed on ${short.slice(0, 40)}…` };
      reverts.push(r.revert);
    }
    return { ok: true, message: `MSI mode on for ${ids.length} GPU(s) — REBOOT required.`, revert: reverts };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* AMD ULPS off (EnableUlps=0): stops Ultra-Low-Power-State gating of the
 * second GPU — a classic stutter source on AMD laptops/multi-GPU desktops. */
async function disableAMDULPS() {
  try {
    const list = await runPS(
      'Get-PnpDevice -Class Display -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.InstanceId -match "^PCI\\\\VEN_1002" } | Select-Object -ExpandProperty InstanceId',
      60000
    );
    const ids = (list.stdout || '').split('\n').map((l) => l.trim()).filter((l) => /^PCI\\/i.test(l));
    if (!ids.length) return { ok: false, message: 'No AMD display adapters found.' };
    const reverts = [];
    for (const id of ids) {
      const short = id.replace(/^[^\\]*\\/, '');
      const sub = `SYSTEM\\CurrentControlSet\\Enum\\${short}\\Device Parameters`;
      const r = await regSetDword('HKLM', sub, 'EnableUlps', 0);
      if (!r.ok) return { ok: false, message: `Failed on ${short.slice(0, 40)}…` };
      reverts.push(r.revert);
    }
    return { ok: true, message: `ULPS off on ${ids.length} AMD GPU(s) — REBOOT required.`, revert: reverts };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Boost the user's SAVED game exes (Settings-persisted list) to High — the
 * generic version of per-game priority lists. Names are strictly validated
 * (*.exe only); priorities reset when games restart, hence "per session". */
async function boostSavedGames(names) {
  try {
    const clean = [...new Set((names || []).map((n) => String(n).trim()))]
      .filter((n) => /^[\w\-. ]{1,60}\.exe$/i.test(n))
      .slice(0, 20);
    if (!clean.length) return { ok: false, message: 'No game exes saved yet — add some first.' };
    const stmts = clean.map((n) => {
      const base = n.replace(/\.exe$/i, '').replace(/'/g, "''");
      return `$p=Get-Process -Name '${base}' -ErrorAction SilentlyContinue; if($p){$p|ForEach-Object{$_.PriorityClass='High'};Write-Output 'BOOSTED:${base}'}`;
    });
    const r = await runPS(stmts.join('; '), 60000);
    const hits = [...(r.stdout || '').matchAll(/BOOSTED:(.+)/g)].map((m) => m[1].trim());
    return {
      ok: true,
      message: hits.length
        ? `Boosted to High: ${hits.join(', ')}. (Resets when games restart.)`
        : 'None of your saved games are running right now.',
      revert: { kind: 'none' },
    };
  } catch (e) { return { ok: false, message: String(e) }; }
}
