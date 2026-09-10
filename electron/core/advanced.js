'use strict';
/* ============================================================================
 * core/advanced.js — Advanced system tweaks (Pro): services off (SysMain,
 * Search), delivery optimization, Xbox bar, background apps, activity,
 * clipboard history, tips. Service stops snapshot start types for undo.
 * ========================================================================== */
const { runPS, regSetDword, scGetStart } = require('./exec');

async function wrap(fn) {
  try { return await fn(); }
  catch (e) { return { ok: false, message: String(e) }; }
}

/* Stop + disable a service, remembering its start type. Needs admin. */
async function disableService(svc, label) {
  const prev = await scGetStart(svc);
  const r = await runPS(`sc.exe stop ${svc} 2>$null; sc.exe config ${svc} start= disabled`, 60000);
  const out = (r.stdout + r.stderr).toLowerCase();
  // Service isn't installed (e.g. TabletInputService on desktops): that is
  // success — there is nothing to disable. (Proven on the dev machine.)
  if (prev === 'unknown' && (out.includes('does not exist') || out.includes('0x424'))) {
    return { ok: true, message: `${label}: not installed — nothing to do.`, revert: { kind: 'none' } };
  }
  if (/FAILED|ACCESS|DENIED/i.test(r.stdout + r.stderr) && prev === 'unknown') {
    return { ok: false, message: `Could not touch ${svc} (run as admin).` };
  }
  return { ok: true, message: `${label} disabled.`, revert: { kind: 'service', name: svc, prevStart: prev } };
}

/* WSearch: the disk-hammering indexer. Start-menu search still works. */
const disableSearchIndexing = () => wrap(() => disableService('WSearch', 'Windows Search indexing'));
/* SysMain (Superfetch): pointless churn on SSDs. */
const disableSysMain = () => wrap(() => disableService('SysMain', 'SysMain (Superfetch)'));

const disableDeliveryOptimization = () => wrap(async () => {
  const r = await regSetDword('HKLM', 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\DeliveryOptimization\\Config', 'DODownloadMode', 0);
  return r.ok ? { ok: true, message: 'Delivery Optimization off (no P2P uploads).', revert: r.revert } : r;
});

const disableXboxBar = () => wrap(async () => {
  const gpu = require('./gpu');
  return gpu.disableGameBar(); // single implementation, shared
});

const disableBackgroundApps = () => wrap(async () => {
  const r = await regSetDword('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications', 'BackgroundAppGlobalToggle', 0);
  return r.ok ? { ok: true, message: 'Background apps disabled.', revert: r.revert } : r;
});

const disableActivityHistory = () => wrap(async () => {
  const a = await regSetDword('HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\System', 'EnableActivityFeed', 0);
  const b = await regSetDword('HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\System', 'PublishUserActivities', 0);
  if (!a.ok || !b.ok) return { ok: false, message: a.message || b.message };
  return { ok: true, message: 'Activity History disabled.', revert: [a.revert, b.revert] };
});

const disableClipboardHistory = () => wrap(async () => {
  const r = await regSetDword('HKCU', 'Software\\Microsoft\\Clipboard', 'EnableClipboardHistory', 0);
  return r.ok ? { ok: true, message: 'Clipboard History disabled.', revert: r.revert } : r;
});

const disableTips = () => wrap(async () => {
  const a = await regSetDword('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', 'SoftLandingEnabled', 0);
  const b = await regSetDword('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\ContentDeliveryManager', 'SubscribedContent-338389Enabled', 0);
  if (!a.ok || !b.ok) return { ok: false, message: a.message || b.message };
  return { ok: true, message: 'Tips & suggestions disabled.', revert: [a.revert, b.revert] };
});

/* Stop + disable a LIST of services with one undo entry (Risxn-style service
 * kills, but reversible — the originals just switch them off blindly). */
async function disableServicesList(svcs, label) {
  try {
    const reverts = [];
    for (const s of svcs) {
      const r = await disableService(s, s);
      if (!r.ok) return { ok: false, message: r.message };
      reverts.push(r.revert);
    }
    return { ok: true, message: `${label} disabled.`, revert: reverts };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* The four Xbox services. Kills Game Bar companions + Xbox app sign-in. */
const disableXboxServices = () => wrap(() =>
  disableServicesList(['XblAuthManager', 'XblGameSave', 'XboxGipSvc', 'XboxNetApiSvc'], 'Xbox services'));

/* Print Spooler. Printers stop working until re-enabled — modal says so. */
const disablePrinterService = () => wrap(() => disableService('Spooler', 'Print Spooler'));

/* Bluetooth Handsfree service. BT audio/devices may drop until re-enabled. */
const disableBluetoothService = () => wrap(() => disableService('bthserv', 'Bluetooth service'));

/* Copilot off, HKCU-only (no admin): policy key + taskbar button. */
const disableCopilot = () => wrap(async () => {
  const a = await regSetDword('HKCU', 'Software\\Policies\\Microsoft\\Windows\\WindowsCopilot', 'TurnOffWindowsCopilot', 1);
  const b = await regSetDword('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', 'ShowCopilotButton', 0);
  if (!a.ok || !b.ok) return { ok: false, message: a.message || b.message };
  return { ok: true, message: 'Copilot disabled + taskbar button hidden.', revert: [a.revert, b.revert] };
});

/* Widgets board off (Win11): TaskbarDa=0. */
const disableWidgets = () => wrap(async () => {
  const r = await regSetDword('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', 'TaskbarDa', 0);
  return r.ok ? { ok: true, message: 'Widgets board disabled.', revert: r.revert } : r;
});

/* News & Interests feed off (Win10 taskbar): ShellFeedsTaskbarViewMode=2. */
const disableNewsFeed = () => wrap(async () => {
  const r = await regSetDword('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\Feeds', 'ShellFeedsTaskbarViewMode', 2);
  return r.ok ? { ok: true, message: 'News & Interests feed removed.', revert: r.revert } : r;
});

/* Sponsored/block suggestions (Win10): DisableWindowsConsumerFeatures=1. */
const disableConsumerFeatures = () => wrap(async () => {
  const r = await regSetDword('HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\CloudContent', 'DisableWindowsConsumerFeatures', 1);
  return r.ok ? { ok: true, message: 'Sponsored app suggestions blocked.', revert: r.revert } : r;
});

/* Bing out of Start search: DisableSearchBoxSuggestions=1. */
const disableBingSearch = () => wrap(async () => {
  const r = await regSetDword('HKCU', 'Software\\Policies\\Microsoft\\Windows\\Explorer', 'DisableSearchBoxSuggestions', 1);
  return r.ok ? { ok: true, message: 'Start search is local-only now.', revert: r.revert } : r;
});

/* Snap flyout off (Win11): EnableSnapAssistFlyout=0. */
const disableSnapFlyout = () => wrap(async () => {
  const r = await regSetDword('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', 'EnableSnapAssistFlyout', 0);
  return r.ok ? { ok: true, message: 'Snap flyout disabled (Win+arrows still snap).', revert: r.revert } : r;
});

/* Start-search highlights (the ad-like rotating panel) off. */
const disableSearchHighlights = () => wrap(async () => {
  const r = await regSetDword('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\SearchSettings', 'IsDynamicSearchBoxEnabled', 0);
  return r.ok ? { ok: true, message: 'Search highlights off.', revert: r.revert } : r;
});

/* Windows Error Reporting off (no more "looking for a solution" hangs). */
const disableErrorReporting = () => wrap(async () => {
  const r = await regSetDword('HKLM', 'SOFTWARE\\Microsoft\\Windows\\Windows Error Reporting', 'Disabled', 1);
  return r.ok ? { ok: true, message: 'Error Reporting disabled.', revert: r.revert } : r;
});

/* Stop Windows Update swapping your GPU drivers (THE classic rage-source):
 * ExcludeWUDriversInQualityUpdate=1. Security updates keep flowing. */
const disableDriverUpdates = () => wrap(async () => {
  const r = await regSetDword('HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate', 'ExcludeWUDriversInQualityUpdate', 1);
  return r.ok ? { ok: true, message: 'Driver updates via Windows Update blocked.', revert: r.revert } : r;
});

/* Extra background-service kills (all reversible via start-type snapshot).
 * Only offered, never forced — Zwift-style "disable everything" packs break
 * printing, Bluetooth and touchscreens, so each is its own toggle with its
 * own warning. */
const disableMapsService = () => wrap(() => disableService('MapsBroker', 'Downloaded Maps Manager'));
const disableCompatAssistant = () => wrap(() => disableService('PcaSvc', 'Program Compatibility Assistant'));
const disableGeoService = () => wrap(() => disableService('lfsvc', 'Geolocation Service'));
const disableFaxService = () => wrap(() => disableService('Fax', 'Fax service'));
const disableInsiderService = () => wrap(() => disableService('wisvc', 'Windows Insider service'));
const disableTouchKeyboard = () => wrap(() => disableService('TabletInputService', 'Touch Keyboard service'));

module.exports = {
  disableSearchIndexing, disableSysMain, disableDeliveryOptimization,
  disableXboxBar, disableBackgroundApps, disableActivityHistory,
  disableClipboardHistory, disableTips, disableService,
  disableXboxServices, disablePrinterService, disableBluetoothService,
  disableCopilot, disableWidgets, disableNewsFeed, disableConsumerFeatures,
  disableBingSearch, disableSnapFlyout,
  disableSearchHighlights, disableErrorReporting, disableDriverUpdates,
  disableMapsService, disableCompatAssistant, disableGeoService,
  disableFaxService, disableInsiderService, disableTouchKeyboard,
};
