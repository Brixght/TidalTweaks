'use strict';
/* ============================================================================
 * core/privacy.js — Privacy & security tweaks (all Pro, all reversible).
 * The hosts-file block keeps a timestamped backup in Electron's userData dir
 * (same idea as %APPDATA% backups in the Python version).
 * ========================================================================== */
const fs = require('node:fs');
const path = require('node:path');
const { runPS, runCmd, regSetDword, scGetStart } = require('./exec');

function userData() {
  try { return require('electron').app.getPath('userData'); }
  catch {
    const d = path.join(process.env.APPDATA || process.cwd(), 'TidalTweaks');
    fs.mkdirSync(d, { recursive: true });
    return d;
  }
}

async function disableTelemetry() {
  try {
    const r = await regSetDword('HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection', 'AllowTelemetry', 0);
    return r.ok
      ? { ok: true, message: 'Telemetry disabled (AllowTelemetry=0).', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

async function disableAdId() {
  try {
    const r = await regSetDword('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo', 'Enabled', 0);
    return r.ok
      ? { ok: true, message: 'Advertising ID disabled.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

async function disableTailoredExperiences() {
  try {
    const r = await regSetDword('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\Privacy', 'DoNotUseTailoredExperiencesWithDiagnosticData', 1);
    return r.ok
      ? { ok: true, message: 'Tailored experiences disabled.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

async function disableAppSuggestions() {
  try {
    const base = 'Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager';
    const a = await regSetDword('HKCU', base, 'SubscribedContent-338388Enabled', 0);
    const b = await regSetDword('HKCU', base, 'SubscribedContent-353694Enabled', 0);
    if (!a.ok || !b.ok) return { ok: false, message: a.message || b.message };
    return { ok: true, message: 'App suggestions disabled.', revert: [a.revert, b.revert] };
  } catch (e) { return { ok: false, message: String(e) }; }
}

async function disableCortanaData() {
  try {
    const r = await regSetDword('HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\Windows Search', 'AllowCortana', 0);
    return r.ok
      ? { ok: true, message: 'Cortana data collection disabled.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

async function disableLocation() {
  try {
    const r = await regSetDword('HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\LocationAndSensors', 'DisableLocation', 1);
    return r.ok
      ? { ok: true, message: 'Location tracking disabled.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

const TRACKING_DOMAINS = [
  'vortex.data.microsoft.com', 'vortex-win.data.microsoft.com',
  'telecommand.telemetry.microsoft.com', 'oca.telemetry.microsoft.com',
  'sqm.telemetry.microsoft.com', 'watson.telemetry.microsoft.com',
  'redir.metaservices.microsoft.com', 'choice.microsoft.com',
  'df.telemetry.microsoft.com', 'reports.wes.df.telemetry.microsoft.com',
  'services.wes.df.telemetry.microsoft.com', 'settings-sandbox.data.microsoft.com',
  'vortex-sandbox.data.microsoft.com', 'ad.doubleclick.net', 'ads.mopub.com',
];
const HOSTS = 'C:\\Windows\\System32\\drivers\\etc\\hosts';
const MARK_BEGIN = '# BEGIN TIDALTWEAKS-BLOCK';
const MARK_END = '# END TIDALTWEAKS-BLOCK';

/* Backup hosts → strip any old TidalTweaks block → append fresh 0.0.0.0
 * entries → flush DNS. Idempotent: re-running replaces, never duplicates. */
async function blockTrackingDomains() {
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupFile = path.join(userData(), `hosts.backup-${ts}`);
    try { fs.copyFileSync(HOSTS, backupFile); }
    catch (e) { return { ok: false, message: 'Could not back up hosts file (run as admin).' }; }
    let text;
    try { text = fs.readFileSync(HOSTS, 'utf8'); }
    catch (e) { return { ok: false, message: 'Cannot read hosts file: ' + String(e) }; }
    const cleaned = [];
    let inBlock = false;
    for (const ln of text.split('\n')) {
      if (ln.includes(MARK_BEGIN)) { inBlock = true; continue; }
      if (ln.includes(MARK_END)) { inBlock = false; continue; }
      if (!inBlock) cleaned.push(ln);
    }
    const block = [MARK_BEGIN, ...TRACKING_DOMAINS.map((d) => `0.0.0.0 ${d}`), MARK_END];
    try {
      fs.writeFileSync(HOSTS, cleaned.join('\n').replace(/\s+$/, '') + '\n' + block.join('\n') + '\n');
    } catch (e) {
      try { fs.copyFileSync(backupFile, HOSTS); } catch { /* best effort */ }
      return { ok: false, message: 'Could not write hosts file (run as admin). Backup kept.' };
    }
    await runCmd('ipconfig', ['/flushdns'], 30000);
    return {
      ok: true,
      message: `Blocked ${TRACKING_DOMAINS.length} tracking domains (backup saved).`,
      revert: { kind: 'file', path: HOSTS, backup: backupFile },
    };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Stop + disable DiagTrack and dmwappushservice, snapshotting start types. */
async function disableTelemetryServices() {
  try {
    const prevDiag = await scGetStart('DiagTrack');
    const prevPush = await scGetStart('dmwappushservice');
    await runPS('sc.exe stop DiagTrack 2>$null; sc.exe config DiagTrack start= disabled; sc.exe stop dmwappushservice 2>$null; sc.exe config dmwappushservice start= disabled', 60000);
    return {
      ok: true, message: 'Telemetry services disabled.',
      revert: [
        { kind: 'service', name: 'DiagTrack', prevStart: prevDiag },
        { kind: 'service', name: 'dmwappushservice', prevStart: prevPush },
      ],
    };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* RunAsPPL=1: LSASS runs as a Protected Process Light — needs reboot. */
async function enableLSAProtection() {
  try {
    const r = await regSetDword('HKLM', 'SYSTEM\\CurrentControlSet\\Control\\Lsa', 'RunAsPPL', 1);
    return r.ok
      ? { ok: true, message: 'LSA Protection enabled — REBOOT required.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* VBS/HVCI policy keys. Real enablement also needs UEFI + Secure Boot,
 * which we can't conjure — the modal text says exactly that. */
async function enableCredentialGuard() {
  try {
    const a = await regSetDword('HKLM', 'SYSTEM\\CurrentControlSet\\Control\\DeviceGuard', 'EnableVirtualizationBasedSecurity', 1);
    const b = await regSetDword('HKLM', 'SYSTEM\\CurrentControlSet\\Control\\DeviceGuard', 'RequirePlatformSecurityFeatures', 1);
    if (!a.ok || !b.ok) return { ok: false, message: (a.message || b.message || '') + ' (admin?)' };
    return { ok: true, message: 'Credential Guard/VBS policy set — REBOOT required (needs UEFI + Secure Boot).', revert: [a.revert, b.revert] };
  } catch (e) { return { ok: false, message: String(e) }; }
}

module.exports = {
  disableTelemetry, disableAdId, disableTailoredExperiences,
  disableAppSuggestions, disableCortanaData, disableLocation,
  blockTrackingDomains, disableTelemetryServices,
  enableLSAProtection, enableCredentialGuard,
  disableLLMNR, disableSMB1, denyInboundRDP, disableAutoPlay,
  disableRecallAI, disableCEIP, disableInkCollection, disableFeedbackPrompts,
};

/* LLMNR off: stops multicast name-resolution leaks (responder-attack vector). */
async function disableLLMNR() {
  try {
    const r = await regSetDword('HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows NT\\DNSClient', 'EnableMulticast', 0);
    return r.ok
      ? { ok: true, message: 'LLMNR disabled.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* SMBv1 protocol off (DISM, slow ~1min): kills the WannaCry-era attack
 * surface. Only legacy scanners/printers still need v1. */
async function disableSMB1() {
  try {
    const r = await runCmd('DISM.exe', ['/Online', '/Disable-Feature', '/FeatureName:SMB1Protocol', '/NoRestart'], 300000);
    if (r.code !== 0) return { ok: false, message: 'DISM failed (run as admin).' };
    return {
      ok: true, message: 'SMBv1 removed. Reboot to finish.',
      revert: { kind: 'cmdline', file: 'DISM.exe', args: ['/Online', '/Enable-Feature', '/FeatureName:SMB1Protocol', '/NoRestart'], label: 'SMBv1 re-enabled (reboot).' },
    };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Deny inbound Remote Desktop. Locks the door from the network side — if YOU
 * RDP into this PC, say no (modal warns). */
async function denyInboundRDP() {
  try {
    const r = await regSetDword('HKLM', 'SYSTEM\\CurrentControlSet\\Control\\Terminal Server', 'fDenyTSConnections', 1);
    return r.ok
      ? { ok: true, message: 'Inbound Remote Desktop denied.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* AutoPlay/AutoRun off for all drives (255): USB sticks can't auto-launch. */
async function disableAutoPlay() {
  try {
    const r = await regSetDword('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer', 'NoDriveTypeAutoRun', 255);
    return r.ok
      ? { ok: true, message: 'AutoPlay off for all drives.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Recall/AI data analysis off (Win11 24H2+ Copilot+ PCs): the documented
 * kill-switch for screenshot Recall + AI Explorer pipelines. */
async function disableRecallAI() {
  try {
    const r = await regSetDword('HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsAI', 'DisableAIDataAnalysis', 1);
    return r.ok
      ? { ok: true, message: 'Recall/AI data analysis disabled.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Customer Experience Improvement Program off. */
async function disableCEIP() {
  try {
    const r = await regSetDword('HKLM', 'SOFTWARE\\Microsoft\\SQMClient\\Windows', 'CEIPEnable', 0);
    return r.ok
      ? { ok: true, message: 'CEIP disabled.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Inking & typing personalization off (tablet/pen data collection). */
async function disableInkCollection() {
  try {
    const base = 'SOFTWARE\\Policies\\Microsoft\\Windows\\TabletPC';
    const a = await regSetDword('HKLM', base, 'RestrictImplicitTextCollection', 1);
    const b = await regSetDword('HKLM', base, 'RestrictImplicitInkCollection', 1);
    if (!a.ok || !b.ok) return { ok: false, message: a.message || b.message };
    return { ok: true, message: 'Ink/typing data collection blocked.', revert: [a.revert, b.revert] };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* "How likely are you to recommend Windows?" → never asks again. */
async function disableFeedbackPrompts() {
  try {
    const r = await regSetDword('HKCU', 'Software\\Microsoft\\Siuf\\Rules', 'NumberOfSIUFInPeriod', 0);
    return r.ok
      ? { ok: true, message: 'Feedback prompts set to Never.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}
