'use strict';
/* ============================================================================
 * core/network.js — ping/DNS diagnostics (Free) + internet tweaks (Pro).
 * ========================================================================== */
const dns = require('node:dns').promises;
const { runCmd, runPS, regSetDword } = require('./exec');

/** Ping via ping.exe; parse per-reply times, average and loss. */
async function ping(host) {
  const h = String(host || '').trim() || '8.8.8.8';
  if (!/^[A-Za-z0-9.\-:]+$/.test(h)) return { ok: false, message: 'Invalid host.' };
  try {
    const r = await runCmd('ping', ['-n', '4', '-w', '1000', h], 30000);
    const out = r.stdout || '';
    const samples = [];
    const re = /time[=<]\s*(\d+)\s*ms/gi;
    let m;
    while ((m = re.exec(out)) !== null) samples.push(Number(m[1]));
    const loss = /Lost\s*=\s*\d+\s*\((\d+)%\s*loss\)/i.exec(out);
    const avg = /Average\s*=\s*(\d+)\s*ms/i.exec(out);
    if (!samples.length) return { ok: false, message: 'Host unreachable.' };
    return {
      ok: true,
      avgMs: avg ? Number(avg[1]) : Math.round(samples.reduce((a, b) => a + b, 0) / samples.length),
      lossPct: loss ? Number(loss[1]) : 0,
      samples,
    };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/** DNS lookup with Node's resolver + timing (no shell needed). */
async function dnsLookup(host) {
  const h = String(host || '').trim() || 'google.com';
  const t0 = Date.now();
  try {
    const [v4, v6] = await Promise.all([
      dns.resolve4(h).catch(() => []),
      dns.resolve6(h).catch(() => []),
    ]);
    const ips = [...v4, ...v6];
    if (!ips.length) return { ok: false, message: 'No records found.' };
    return { ok: true, ips, ms: Date.now() - t0 };
  } catch (e) { return { ok: false, message: String((e && e.message) || e) }; }
}

/* TcpTimedWaitDelay=30 (default 240s): closed connections recycle faster. */
async function setTimedWaitDelay() {
  try {
    const r = await regSetDword('HKLM', 'SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters', 'TcpTimedWaitDelay', 30);
    return r.ok
      ? { ok: true, message: 'TcpTimedWaitDelay → 30s.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* MaxUserPort=65534 (default 5000): far more concurrent outbound sockets. */
async function setMaxUserPort() {
  try {
    const r = await regSetDword('HKLM', 'SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters', 'MaxUserPort', 65534);
    return r.ok
      ? { ok: true, message: 'MaxUserPort → 65534.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

async function flushDNS() {
  try {
    const r = await runCmd('ipconfig', ['/flushdns'], 30000);
    if (r.code !== 0) return { ok: false, message: 'ipconfig /flushdns failed.' };
    return { ok: true, message: 'DNS cache flushed.', revert: { kind: 'none' } };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Point the active (Up, physical) adapter at the given DNS pair via
 * Set-DnsClientServerAddress. Previous servers are snapshotted for undo. */
async function setDNS(servers, label) {
  try {
    const script = [
      '$a = Get-NetAdapter -Physical | Where-Object { $_.Status -eq "Up" } | Select-Object -First 1',
      'if (-not $a) { Write-Output "NOADAPTER"; exit }',
      '$prev = (Get-DnsClientServerAddress -InterfaceAlias $a.InterfaceAlias -AddressFamily IPv4 -ErrorAction SilentlyContinue).ServerAddresses',
      `Set-DnsClientServerAddress -InterfaceAlias $a.InterfaceAlias -ServerAddresses ${servers.map((s) => `"${s}"`).join(',')}`,
      'Write-Output ("ALIAS:" + $a.InterfaceAlias)',
      'Write-Output ("PREV:" + (($prev | Where-Object { $_ -notlike "fec0*" }) -join ","))',
    ].join('; ');
    const r = await runPS(script, 60000);
    const out = r.stdout || '';
    if (out.includes('NOADAPTER')) return { ok: false, message: 'No active network adapter found.' };
    const alias = (/ALIAS:(.+)/.exec(out) || [])[1]?.trim();
    const prevStr = (/PREV:(.*)/.exec(out) || [])[1]?.trim();
    if (!alias) return { ok: false, message: 'Could not identify the active adapter.' };
    const prev = (prevStr || '').split(',').map((s) => s.trim()).filter(Boolean);
    return { ok: true, message: `${label} DNS set on '${alias}'.`, revert: { kind: 'dns', alias, prev } };
  } catch (e) { return { ok: false, message: String(e) }; }
}

const setCloudflareDNS = () => setDNS(['1.1.1.1', '1.0.0.1'], 'Cloudflare');
const setGoogleDNS = () => setDNS(['8.8.8.8', '8.8.4.4'], 'Google');

/* Remove the WAU SMB bandwidth policy cap. */
async function disableSMBBandwidthLimit() {
  try {
    const r = await regSetDword('HKLM', 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer', 'WAU', 0);
    return r.ok
      ? { ok: true, message: 'SMB bandwidth limiting disabled.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* NIC power saving off: PnPCapabilities=24 on every NIC class key with a
 * driver attached — stops Windows napping network adapters mid-game. */
async function nicPowersaveOff() {
  try {
    const base = 'SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e972-e325-11ce-bfc1-08002be10318}';
    const list = await runCmd('reg', ['query', `HKLM\\${base}`], 15000);
    if (list.code !== 0) return { ok: false, message: 'NIC class key not found.' };
    const subs = list.stdout.split('\n')
      .map((l) => l.trim())
      .filter((l) => /\\\d{4}$/.test(l))
      .map((l) => l.replace(/^HKEY_LOCAL_MACHINE\\/i, ''));
    const reverts = [];
    let touched = 0;
    for (const sub of subs) {
      // Only touch keys that actually describe a NIC (have DriverDesc).
      let has = false;
      try {
        const q = await runCmd('reg', ['query', `HKLM\\${sub}`, '/v', 'DriverDesc'], 15000);
        has = q.code === 0;
      } catch { has = false; }
      if (!has) continue;
      const r = await regSetDword('HKLM', sub, 'PnPCapabilities', 24);
      if (!r.ok) return { ok: false, message: `Failed on ${sub.slice(-4)}` };
      reverts.push(r.revert);
      touched++;
    }
    if (!touched) return { ok: false, message: 'No NIC devices found.' };
    return { ok: true, message: `NIC power saving off on ${touched} adapter(s). Reboot to apply.`, revert: reverts };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Kill NIC eco/green/wake "features" + force RSS on, per up adapter. Tries
 * each well-known DisplayName; unsupported names are skipped per adapter
 * (different vendors name things differently). Needs admin. */
async function nicEcoOff() {
  const OFFS = ['Interrupt Moderation', 'Energy-Efficient Ethernet', 'Green Ethernet', 'Power Saving Mode', 'Ultra Low Power Mode', 'Reduce Speed On Power Down', 'Wake on Magic Packet', 'Wake on Pattern Match'];
  try {
    const changed = [];
    for (const name of OFFS) {
      const script = [
        '$done=@()',
        'Get-NetAdapter -Physical | Where-Object { $_.Status -eq "Up" } | ForEach-Object {',
        `  try { $prev=(Get-NetAdapterAdvancedProperty -Name $_.Name -DisplayName '${name}' -ErrorAction Stop).DisplayValue; Set-NetAdapterAdvancedProperty -Name $_.Name -DisplayName '${name}' -DisplayValue 'Disabled' -ErrorAction Stop -NoRestart; $done+=($_.Name+'|'+$prev) } catch {} }`,
        '$done -join "`n"',
      ].join('; ');
      const r = await runPS(script, 60000);
      for (const line of (r.stdout || '').split('\n')) {
        const m = line.trim().match(/^(.+)\|(.+)$/);
        if (m && !/^\s*$/.test(m[1])) changed.push({ alias: m[1].trim(), display: name, prev: m[2].trim() });
      }
    }
    // RSS on (receive-side scaling helps multi-core throughput).
    await runPS(`Get-NetAdapter -Physical | Where-Object { $_.Status -eq "Up" } | ForEach-Object { try { Set-NetAdapterAdvancedProperty -Name $_.Name -DisplayName 'Receive Side Scaling' -DisplayValue 'Enabled' -ErrorAction Stop -NoRestart } catch {} }`, 60000);
    if (!changed.length) return { ok: false, message: 'No supported eco settings found (driver names vary).' };
    return {
      ok: true, message: `Disabled ${changed.length} NIC eco feature(s). Reboot to apply.`,
      revert: changed.map((c) => ({ kind: 'netadv', alias: c.alias, display: c.display, prev: c.prev })),
    };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* QoS packet-scheduler cap → 0. Honest note: modern Windows doesn't reserve
 * bandwidth the way the old myth claims — this just forces the policy to 0
 * so nothing CAN throttle. Harmless either way. */
async function qosLimitZero() {
  try {
    const r = await regSetDword('HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\Psched', 'NonBestEffortLimit', 0);
    return r.ok
      ? { ok: true, message: 'QoS reservable-bandwidth cap → 0%.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Full network-stack reset (winsock + IP). The classic "nothing else fixed
 * it" repair: drops VPN/virtual adapters' configs too, needs a REBOOT. */
async function resetStack() {
  try {
    await runPS('netsh winsock reset | Out-Null; netsh int ip reset | Out-Null', 120000);
    return { ok: true, message: 'Stack reset issued — REBOOT now. Re-run VPN clients afterwards.', revert: { kind: 'none' } };
  } catch (e) { return { ok: false, message: String(e) }; }
}

module.exports = {
  ping, dnsLookup, setTimedWaitDelay, setMaxUserPort, flushDNS,
  setCloudflareDNS, setGoogleDNS, disableSMBBandwidthLimit,
  nicPowersaveOff, nicEcoOff, qosLimitZero, resetStack,
};
