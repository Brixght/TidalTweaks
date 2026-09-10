'use strict';
/* ============================================================================
 * core/devices.js — Device Manager latency disables (Pro, Reddit/YouTube set).
 * Strict allow-list: ONLY these friendly-name patterns can be toggled, so a
 * compromised/mistyped renderer message can never disable arbitrary hardware.
 * Implemented with Get-PnpDevice + pnputil (admin required).
 * ========================================================================== */
const { runCmd, runPS } = require('./exec');

// [match-pattern, display name] — patterns are matched case-insensitively.
const ALLOW_LIST = [
  ['Controller Emulation', 'AMD Controller Emulation'],
  ['Crash Defender', 'AMD Crash Defender'],
  ['Composite Bus Enumerator', 'Composite Bus Enumerator'],
  ['High Precision Event Timer', 'High Precision Event Timer (HPET)'],
  ['Hyper-V Virtualization Infrastructure Driver', 'Microsoft Hyper-V Virtualization Infrastructure Driver'],
  ['Virtual Drive Enumerator', 'Microsoft Virtual Drive Enumerator'],
  ['NDIS Virtual Network Adapter Enumerator', 'NDIS Virtual Network Adapter Enumerator'],
  ['Remote Desktop Device Redirector Bus', 'Remote Desktop Device Redirector Bus'],
  ['System Speaker', 'System Speaker'],
];

async function listDevices() {
  try {
    const conds = ALLOW_LIST.map(([p]) => `$_.FriendlyName -match '${p.replace(/'/g, "''")}'`).join(' -or ');
    const script = `Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { ${conds} } | Select-Object FriendlyName, InstanceId, Status | ConvertTo-Json -Compress`;
    const r = await runPS(script, 60000);
    if (r.code !== 0) return { ok: false, message: 'Could not enumerate devices (admin?).' };
    let arr;
    try {
      const parsed = JSON.parse((r.stdout || '').trim().split('\n').pop() || '[]');
      arr = Array.isArray(parsed) ? parsed : [parsed];
    } catch { return { ok: false, message: 'Could not parse device list.' }; }
    return {
      ok: true,
      devices: arr.filter((d) => d && d.InstanceId).map((d) => ({
        id: String(d.InstanceId),
        name: String(d.FriendlyName || d.InstanceId),
        status: String(d.Status || 'Unknown'),
        enabled: String(d.Status || '').toUpperCase() === 'OK',
      })),
    };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* setDeviceEnabled(id, disable):
 *   main.js calls this as setDeviceEnabled(id, enabled!==false ? false : true)
 *   i.e. the 2nd arg is a DISABLE flag (true = turn the device OFF).
 * The id must belong to a device whose name matches the allow-list. */
async function setDeviceEnabled(id, disable) {
  const instanceId = String(id || '');
  if (!instanceId || /["\n\r]/.test(instanceId)) return { ok: false, message: 'Invalid device id.' };
  try {
    // Re-verify allow-list membership at apply time (never trust the caller).
    const list = await listDevices();
    const dev = (list.devices || []).find((d) => d.id.toLowerCase() === instanceId.toLowerCase());
    if (!dev) return { ok: false, message: 'Device not in the latency allow-list.' };
    const flag = disable ? '/disable-device' : '/enable-device';
    const r = await runCmd('pnputil', [flag, `"${instanceId}"`, '/force'], 60000);
    if (r.code !== 0) {
      return { ok: false, message: `pnputil failed (run as admin): ${(r.stdout + r.stderr).trim().slice(0, 200)}` };
    }
    return {
      ok: true,
      message: `'${dev.name}' ${disable ? 'disabled' : 're-enabled'}.`,
      // Undo flips the flag back.
      revert: { kind: 'device', instanceId, disabled: !!disable },
    };
  } catch (e) { return { ok: false, message: String(e) }; }
}

module.exports = { listDevices, setDeviceEnabled, ALLOW_LIST };
