'use strict';
/* Section 3: NETWORK & DNS SERVICES. Reuses adv-ndu-off (existing id, row
 * override in index.js). Chimney is deprecated on modern builds — the setter
 * reports that honestly instead of failing cryptically. */
const { runCmd } = require('../exec');

async function chimneyOff() {
  try {
    const r = await runCmd('netsh', ['interface', 'tcp', 'set', 'global', 'chimney=disabled'], 30000);
    const out = ((r.stdout || '') + (r.stderr || '')).toLowerCase();
    if (r.code !== 0) {
      if (/not supported|deprecated|no such|invalid|syntax/i.test(out)) {
        return { ok: false, message: 'Chimney offload not supported on this Windows build — nothing changed.' };
      }
      return { ok: false, message: 'netsh failed (run as admin).' };
    }
    return {
      ok: true, message: 'TCP chimney offload disabled.',
      revert: { kind: 'cmdline', file: 'netsh', args: ['interface', 'tcp', 'set', 'global', 'chimney=automatic'], label: 'Chimney back to automatic.' },
    };
  } catch (e) { return { ok: false, message: String(e) }; }
}

const S = (n, label) => ({ n, label });

const ITEMS = [
  {
    id: 'reg-dns-ttl', t: 'Extend DNS cache TTL', badge: 'safe', impact: 2,
    d: 'Fewer repeat DNS lookups.',
    warn: 'Stale records linger longer — flush DNS if a site moves.',
    reg: [{ root: 'HKLM', path: 'SYSTEM\\CurrentControlSet\\Services\\Dnscache\\Parameters', name: 'MaxCacheTtl', value: 86400 }],
  },
  {
    id: 'cmd-chimney-off', t: 'Disable TCP chimney offload assist', badge: 'caution', impact: 2,
    d: 'Avoids NIC offload latency quirks.',
    warn: 'Deprecated on modern Windows — skipped cleanly where unsupported.',
    run: chimneyOff,
  },
  { id: 'svc-fdphost-off', t: 'Disable Function Discovery Provider', badge: 'safe', impact: 1, d: 'Network discovery provider host.', services: [S('FDPHost', 'Function Discovery Provider')] },
  { id: 'svc-fdrespub-off', t: 'Disable Function Discovery Resource Publication', badge: 'safe', impact: 1, d: 'Announces this PC on the network. Breaks network discovery of this machine.', services: [S('FDResPub', 'Function Discovery Publication')] },
  { id: 'svc-nettcp-off', t: 'Disable Net.Tcp Port Sharing', badge: 'safe', impact: 1, d: 'Shares TCP ports between WCF apps. Rarely used.', services: [S('NetTcpPortSharing', 'Net.Tcp Port Sharing')] },
  { id: 'svc-wfds-off', t: 'Disable Wi-Fi Direct Services', badge: 'safe', impact: 1, d: 'Wi-Fi Direct connection manager.', services: [S('WFDSConMgrSvc', 'Wi-Fi Direct Services')] },
  { id: 'svc-wcn-off', t: 'Disable Windows Connect Now', badge: 'safe', impact: 1, d: 'WPS-style device setup protocol.', services: [S('WCNCSVC', 'Windows Connect Now')] },
  { id: 'task-wininet-cache', t: 'Disable WinINet Cache Task', badge: 'safe', impact: 1, d: 'WinINet cache maintenance task.', tasks: ['\\Microsoft\\Windows\\Wininet\\CacheTask'] },
  { id: 'task-workfolders-logon', t: 'Disable Work Folders Logon Sync', badge: 'safe', impact: 1, d: 'Work Folders sync at logon. Enterprise-only.', tasks: ['\\Microsoft\\Windows\\Work Folders\\Work Folders Logon Synchronization'] },
  { id: 'svc-smsrouter-off', t: 'Disable SMS Router', badge: 'safe', impact: 1, d: 'Routes text messages to apps. Dead on desktops.', services: [S('SmsRouter', 'SMS Router')] },
  { id: 'svc-rasauto-off', t: 'Disable Remote Access Auto Connection', badge: 'safe', impact: 1, d: 'Auto-dials remote connections. Dial-up era leftover.', services: [S('RasAuto', 'Remote Access Auto Connection')] },
];

module.exports = { ITEMS, chimneyOff };
