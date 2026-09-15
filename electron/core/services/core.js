'use strict';
/* Section 1: AGGRESSIVE - ADVANCED USERS ONLY. Update/Defender/combo kills.
 * Every Advanced-badged row carries danger + the understanding checkbox
 * (enforced by the confirm modal); a restore point lands automatically via
 * the shared tweak runner. Reuses mem-no-prefetch (existing id, row-level
 * title/desc override in index.js). */
const { runPS, runCmd } = require('../exec');

/* Defender real-time off. Tamper Protection blocks this on stock Windows —
 * detected and reported honestly instead of failing cryptically. */
async function defenderOff() {
  try {
    const r = await runPS('Set-MpPreference -DisableRealtimeMonitoring $true', 60000);
    const out = (r.stdout + r.stderr).toLowerCase();
    if (r.code !== 0) {
      if (out.includes('tamper')) {
        return { ok: false, message: 'Blocked by Tamper Protection — turn it off in Windows Security → Virus & threat protection → Manage settings first.' };
      }
      return { ok: false, message: 'Set-MpPreference failed (run as admin).' };
    }
    return {
      ok: true,
      message: 'Defender real-time protection OFF.',
      revert: { kind: 'cmdline', file: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', 'Set-MpPreference -DisableRealtimeMonitoring $false'], label: 'Defender real-time protection back on.' },
    };
  } catch (e) { return { ok: false, message: String(e) }; }
}

const CHECK = 'I understand this may break Windows features.';

const ITEMS = [
  {
    id: 'svc-wuauserv-off', t: 'Disable Windows Update service', badge: 'advanced', impact: 3,
    d: "Stops updates entirely. Re-enable to get security patches - don't leave off long-term.",
    danger: true, check: CHECK,
    warn: 'No security patches land while this is off. Re-enable monthly, patch, then re-disable.',
    services: [{ n: 'wuauserv', label: 'Windows Update' }],
  },
  {
    id: 'svc-defender-rtm-off', t: 'Disable Defender real-time protection', badge: 'advanced', impact: 3,
    d: 'Turns off live antivirus scanning. Big process cut but lowers security - temporary use only.',
    danger: true, check: CHECK,
    warn: 'Re-enables after reboot unless Tamper Protection stays off. Never browse untrusted files while off.',
    run: defenderOff,
  },
  {
    id: 'svc-kill-trio', t: 'Kill Superfetch + Search + Spooler', badge: 'advanced', impact: 3,
    d: 'Disables all three at once for maximum reduction. Breaks printing & search indexing.',
    danger: true, check: CHECK,
    warn: 'Printing stops and Start-menu search goes on-demand until reverted.',
    services: [
      { n: 'SysMain', label: 'SysMain' },
      { n: 'WSearch', label: 'Windows Search' },
      { n: 'Spooler', label: 'Print Spooler' },
    ],
  },
  {
    id: 'svc-nuke-telemetry', t: 'Nuke all telemetry collectors', badge: 'advanced', impact: 3,
    d: 'Disables every diagnostic/telemetry collector service. Breaks Feedback & some troubleshooters.',
    danger: true, check: CHECK,
    warn: 'Feedback Hub and some troubleshooters stop working until reverted.',
    services: [
      { n: 'DiagTrack', label: 'Diagnostic Tracking' },
      { n: 'dmwappushservice', label: 'WAP Push' },
      { n: 'WerSvc', label: 'Windows Error Reporting' },
      { n: 'PcaSvc', label: 'Compatibility Assistant' },
    ],
    tasks: [
      '\\Microsoft\\Windows\\Application Experience\\Microsoft Compatibility Appraiser',
      '\\Microsoft\\Windows\\Application Experience\\ProgramDataUpdater',
      '\\Microsoft\\Windows\\Application Experience\\StartupAppTask',
      '\\Microsoft\\Windows\\Customer Experience Improvement Program\\Consolidator',
      '\\Microsoft\\Windows\\Customer Experience Improvement Program\\KernelCeipTask',
      '\\Microsoft\\Windows\\Customer Experience Improvement Program\\UsbCeip',
      '\\Microsoft\\Windows\\PI\\Sqm-Tasks',
    ],
  },
  {
    id: 'svc-dosvc-off', t: 'Disable Delivery Optimization', badge: 'safe', impact: 3,
    d: 'Stops peer-to-peer update sharing eating bandwidth.',
    warn: 'Store downloads fall back to direct Microsoft servers.',
    services: [{ n: 'DoSvc', label: 'Delivery Optimization' }],
    reg: [{ root: 'HKLM', path: 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\DeliveryOptimization\\Config', name: 'DODownloadMode', value: 0 }],
  },
  {
    id: 'task-update-start-off', t: 'Disable Update Scheduled Start', badge: 'caution', impact: 2,
    d: 'Starts Windows Update on a schedule.',
    warn: 'Scheduled update starts stop — check for updates manually.',
    tasks: ['\\Microsoft\\Windows\\UpdateOrchestrator\\Schedule Start'],
  },
  {
    id: 'adv-driver-search-off', t: 'Disable automatic driver search', badge: 'caution', impact: 2,
    d: 'Stops driver auto-downloads.',
    warn: 'New devices will not pull drivers automatically — install GPU drivers manually.',
    reg: [{ root: 'HKLM', path: 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\DriverSearching', name: 'SearchOrderConfig', value: 0 }],
  },
  {
    id: 'svc-bcastdvr-off', t: 'Disable Broadcast DVR user service', badge: 'safe', impact: 2,
    d: 'Game broadcasting component.',
    services: [{ n: 'BcastDVRUserService', label: 'Broadcast DVR' }],
  },
];

module.exports = { ITEMS, defenderOff };
