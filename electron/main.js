'use strict';
/* ============================================================================
 * TidalTweaks — Electron main process
 * ----------------------------------------------------------------------------
 * Privileged side of the app. The renderer (UI) is sandboxed and can ONLY
 * talk to this file through the channels exposed in preload.js.
 *
 * Responsibilities:
 *   1. Create the frameless app window (custom titlebar lives in the UI).
 *   2. Run system queries via the `systeminformation` package (CPU/RAM/GPU).
 *   3. Route feature requests to the Node modules in ./core/, which execute
 *      PowerShell / CMD / registry work through core/exec.js.
 *   4. Own the Pro license state via electron-store (code + timestamp only —
 *      no personal data is ever stored).
 *
 * CONFIRMATION: no paid APIs and no payment processors are used anywhere.
 * Pro unlock is a manual Cash App payment; the only network call in the
 * entire app is the one-time license validation POST (see license:validate).
 * ========================================================================== */

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('node:path');
const os = require('node:os');
const Store = require('electron-store');
const si = require('systeminformation');

/* --------------------------------------------------------------------------
 * ACTIVATION URL — how to update it after deploying Cloudflare Pages:
 *
 *   1. Deploy your Pages project (the validate-code function from the
 *      Python version's cloudflare-validate-code.example.js works unchanged —
 *      it only cares about receiving { code } and returning { valid }).
 *   2. Replace the string below with your real URL, e.g.
 *      'https://my-tweaks-site.pages.dev/api/validate-code'
 *   3. Rebuild with `npm run build`.
 *
 * Users can ALSO override it at runtime in Settings → License server URL,
 * which is persisted in electron-store and takes precedence over this value.
 * ------------------------------------------------------------------------ */
const DEFAULT_API_URL = 'https://tidaltweaks.pages.dev/api/validate-code';
const CASHAPP_TAG = '$AlwaysBetOnBright'; // shown in Settings, never sent anywhere

/* electron-store: local persistence (replaces %APPDATA%/TidalTweaks/config.json
 * from the Python version). Only the code + timestamp are stored. */
const store = new Store({
  defaults: {
    pro: false,
    code: null,
    activatedAt: null,
    apiUrl: DEFAULT_API_URL,
    liteMode: 'auto', // 'auto' | 'on' | 'off' — see resolveLite()
    theme: 'tsunami',  // tsunami | abyss | royal | emerald (Settings → Appearance)
    accent: 'blue',    // blue | gold | violet | mint | rose
  },
});
const apiUrl = () => store.get('apiUrl') || DEFAULT_API_URL;

/* LITE MODE — the low-end lifesaver (see fix notes at top of file).
 * 'auto' (default): enable when RAM < 8GB or ≤4 logical cores, detected with
 * node:os only (zero subprocess cost, runs before anything heavy exists).
 * Disabling Chromium's GPU compositing MUST happen before app.ready(), so
 * this block runs at import time. The renderer additionally swaps glass blur
 * for flat panels via body.lite (see renderer/styles.css). */
function resolveLite() {
  const pref = store.get('liteMode');
  if (pref === 'on') return true;
  if (pref === 'off') return false;
  try {
    if (os.totalmem() / 1073741824 < 8) return true;
    if (os.cpus().length <= 4) return true;
  } catch { /* assume full effects */ }
  return false;
}
let LITE = resolveLite();
if (LITE) app.disableHardwareAcceleration();

/* Core tweak modules ( batches 3–4 ). Each exports plain async functions that
 * NEVER touch the UI — they return { ok, message, ... } result objects and
 * throw nothing (they catch internally and report via the result). */
const backup = require('./core/backup');
const users = require('./core/users'); // device-local accounts (see core/users.js)
const cpuTweaks = require('./core/cpu');
const gamingTweaks = require('./core/gpu');
const netTweaks = require('./core/network');
const privacyTweaks = require('./core/privacy');
const debloatTweaks = require('./core/debloat');
const powerTweaks = require('./core/power');
const visualTweaks = require('./core/visual');
const advancedTweaks = require('./core/advanced');
const deviceTweaks = require('./core/devices');
const cleaner = require('./core/cleaner');
const startup = require('./core/startup');
const ram = require('./core/ram');
const systemTweaks = require('./core/system'); // boot behavior + NTFS (sys-*, disk-*)
const presets = require('./core/presets'); // one-click stacks (see core/presets.js)

/* Every tweak id the UI can invoke, mapped to its core module + the backup
 * label used for undo. Registration is centralised here so the renderer only
 * ever sends an id string — it can never inject its own PowerShell. */
const TWEAK_REGISTRY = {
  // — Performance & CPU (core/cpu.js) —
  'cpu-boost-mode': cpuTweaks.setBoostMode,
  'cpu-no-throttle': cpuTweaks.disableThrottling,
  'cpu-no-interrupt-steering': cpuTweaks.disableInterruptSteering,
  'cpu-timer-serialization': cpuTweaks.enableTimerSerialization,
  'cpu-no-energy-est': cpuTweaks.disableEnergyEstimation,
  'cpu-no-parking': cpuTweaks.disableCoreParking,
  'cpu-no-hibernate': cpuTweaks.disableHibernation,
  'cpu-min-state-100': cpuTweaks.setMinProcessorState100,
  'cpu-no-pcie-link': cpuTweaks.disablePcieLinkState,
  'cpu-bios-utc': cpuTweaks.biosClockUTC,
  'cpu-fg-priority': cpuTweaks.setForegroundPriority,
  'cpu-no-dynamictick': cpuTweaks.disableDynamicTick,
  'cpu-tsc-enhanced': cpuTweaks.tscSyncEnhanced,
  'cpu-no-spec-mit': cpuTweaks.disableSpeculativeMitigations,
  'cpu-x2apic': cpuTweaks.enableX2Apic,
  'cpu-timer-res': cpuTweaks.timerResolutionOn,
  'cpu-no-idle-states': cpuTweaks.disableIdleStates,
  // — Gaming & latency (core/gpu.js) —
  'game-power-ultimate': powerTweaks.unlockUltimatePerformance,
  'game-bar-off': gamingTweaks.disableGameBar,
  'game-hags-on': gamingTweaks.enableHAGS,
  'game-no-nagle': gamingTweaks.disableNagle,
  'game-net-throttle-off': gamingTweaks.disableNetworkThrottling,
  'game-sys-responsiveness': gamingTweaks.setSystemResponsiveness,
  'game-input-latency': gamingTweaks.optimizeInputLatency,
  'game-no-hpet': gamingTweaks.disableHPET,
  'game-no-fs-optim': gamingTweaks.disableFullscreenOptimizations,
  'game-mode-master': gamingTweaks.enableGamingMode,
  'game-bg-apps-off': advancedTweaks.disableBackgroundApps,
  'ram-standby-task': ram.standbyTaskOn,
  'game-mode-win-on': gamingTweaks.windowsGameModeOn,
  'game-mouse-raw': gamingTweaks.mouseRawInput,
  'game-keyboard-fast': gamingTweaks.keyboardFastRepeat,
  // — GPU vendor (display adapters only) —
  'gpu-nv-telemetry': gamingTweaks.disableNvidiaTelemetry,
  'gpu-msi-mode': gamingTweaks.enableMSIModeGPU,
  'gpu-amd-ulps': gamingTweaks.disableAMDULPS,
  'gpu-no-mpo': gamingTweaks.disableMPO,
  // Per-saved-list discrete-GPU forcing has its own IPC (needs the exe list);
  // the registry entry below only explains that when poked directly.
  'game-discrete-gpu': gamingTweaks.preferDiscreteGPU,
  // — Network & internet (core/network.js) —
  'net-timed-wait': netTweaks.setTimedWaitDelay,
  'net-max-user-port': netTweaks.setMaxUserPort,
  'net-flush-dns': netTweaks.flushDNS,
  'net-fast-dns-cloudflare': netTweaks.setCloudflareDNS,
  'net-fast-dns-google': netTweaks.setGoogleDNS,
  'net-no-smb-limit': netTweaks.disableSMBBandwidthLimit,
  'net-nic-powersave-off': netTweaks.nicPowersaveOff,
  'net-nic-eco-off': netTweaks.nicEcoOff,
  'net-qos-limit': netTweaks.qosLimitZero,
  'net-reset-stack': netTweaks.resetStack,
  'net-ecn-on': netTweaks.ecnOn,
  'net-rsc-off': netTweaks.rscOff,
  'net-no-tunnel': netTweaks.tunnelsOff,
  'net-adapter-restart': netTweaks.adapterRestart,
  'net-nic-powersave-off': netTweaks.nicPowersaveOff,
  'net-nic-eco-off': netTweaks.nicEcoOff,
  'net-qos-limit': netTweaks.qosLimitZero,
  'net-reset-stack': netTweaks.resetStack,
  // — Privacy & security (core/privacy.js) —
  'priv-no-telemetry': privacyTweaks.disableTelemetry,
  'priv-no-adid': privacyTweaks.disableAdId,
  'priv-no-tailored': privacyTweaks.disableTailoredExperiences,
  'priv-no-suggestions': privacyTweaks.disableAppSuggestions,
  'priv-no-cortana': privacyTweaks.disableCortanaData,
  'priv-no-location': privacyTweaks.disableLocation,
  'priv-block-trackers': privacyTweaks.blockTrackingDomains,
  'priv-no-telemetry-svc': privacyTweaks.disableTelemetryServices,
  'priv-lsa': privacyTweaks.enableLSAProtection,
  'priv-credential-guard': privacyTweaks.enableCredentialGuard,
  'priv-no-llmnr': privacyTweaks.disableLLMNR,
  'priv-no-smb1': privacyTweaks.disableSMB1,
  'priv-no-rdp': privacyTweaks.denyInboundRDP,
  'priv-no-autoplay': privacyTweaks.disableAutoPlay,
  'priv-no-recall': privacyTweaks.disableRecallAI,
  'priv-no-ceip': privacyTweaks.disableCEIP,
  'priv-no-ink-collection': privacyTweaks.disableInkCollection,
  'priv-no-feedback': privacyTweaks.disableFeedbackPrompts,
  'priv-no-camera': privacyTweaks.disableCamera,
  'priv-no-mic': privacyTweaks.disableMicrophone,
  'priv-no-usb-storage': privacyTweaks.blockUSBStorage,
  // — Debloat & cleanup (core/debloat.js) —
  'debloat-onedrive': debloatTweaks.removeOneDrive,
  'debloat-chrome-bg': debloatTweaks.chromeBackgroundOff,
  'debloat-cortana-app': debloatTweaks.removeCortanaApp,
  'debloat-xbox-app': debloatTweaks.removeXboxApp,
  'debloat-edge': debloatTweaks.removeEdge,
  'debloat-visual-fx': debloatTweaks.disableVisualEffects,
  'debloat-no-hibernate': debloatTweaks.disableHibernation,
  'debloat-disk-cleanup': debloatTweaks.runDiskCleanup,
  // — Visual & UI (core/visual.js) —
  'vis-menu-delay': visualTweaks.setMenuDelay0,
  'vis-no-peek': visualTweaks.disableAeroPeek,
  'vis-no-anim': visualTweaks.disableWindowAnimations,
  'vis-no-blur': visualTweaks.disableBlur,
  'vis-transparency-off': visualTweaks.setTransparencyOff,
  'vis-transparency-on': visualTweaks.setTransparencyOn,
  'vis-extensions': visualTweaks.showFileExtensions,
  'vis-hidden-files': visualTweaks.showHiddenFiles,
  'vis-no-sticky': visualTweaks.disableStickyKeys,
  'vis-no-toggle-keys': visualTweaks.disableToggleKeysAudio,
  'vis-classic-context': visualTweaks.classicContextMenu,
  'vis-end-task': visualTweaks.enableEndTask,
  'vis-no-taskview': visualTweaks.hideTaskView,
  'vis-no-chat': visualTweaks.hideChatIcon,
  'vis-numlock': visualTweaks.numlockOnBoot,
  'vis-no-thumbs-network': visualTweaks.noNetworkThumbs,
  'vis-this-pc': visualTweaks.thisPCDefault,
  'vis-no-lockscreen': visualTweaks.noLockScreen,
  'vis-no-login-blur': visualTweaks.noLogonBlur,
  'vis-taskbar-left': visualTweaks.taskbarLeft,
  'vis-classic-clock': visualTweaks.classicClock,
  'vis-no-taskbar-search': visualTweaks.hideTaskbarSearch,
  'vis-taskbar-seconds': visualTweaks.taskbarSeconds,
  'vis-classic-alttab': visualTweaks.classicAltTab,
  'vis-no-shake': visualTweaks.noWindowShake,
  // — Power (core/power.js) —
  'power-ultimate': powerTweaks.unlockUltimatePerformance,
  'power-balanced': powerTweaks.setBalancedPlan,
  'power-no-modern-standby': powerTweaks.disableModernStandby,
  'power-no-usb-suspend': powerTweaks.disableUSBSelectiveSuspend,
  'power-no-disk-sleep': powerTweaks.disableDiskSleep,
  'power-cpu-min-100': powerTweaks.setMinProcessorState100,
  'power-no-pcie': powerTweaks.disablePcieLinkState,
  'power-no-modern-standby': powerTweaks.disableModernStandby,
  'power-lid-nothing': powerTweaks.lidCloseNothing,
  'power-sleep-never': powerTweaks.sleepNever,
  'power-no-auto-hibernate': powerTweaks.noAutoHibernate,
  // — System boot & behavior + NTFS (core/system.js) —
  'sys-verbose-boot': systemTweaks.verboseBoot,
  'sys-bsod-details': systemTweaks.bsodDetails,
  'sys-fast-shutdown': systemTweaks.fastShutdown,
  'sys-storage-sense': systemTweaks.storageSense,
  'disk-no-lastaccess': systemTweaks.noLastAccess,
  'disk-no-8dot3': systemTweaks.no8dot3,
  'sys-boot-legacy': systemTweaks.bootMenuLegacy,
  'sys-minidump': systemTweaks.miniDumps,
  'sys-no-bsod-reboot': systemTweaks.noAutoRebootBSOD,
  // — Advanced (core/advanced.js) —
  'adv-no-indexing': advancedTweaks.disableSearchIndexing,
  'adv-no-sysmain': advancedTweaks.disableSysMain,
  'adv-no-delivery-opt': advancedTweaks.disableDeliveryOptimization,
  'adv-no-xbox-bar': advancedTweaks.disableXboxBar,
  'adv-no-bg-apps': advancedTweaks.disableBackgroundApps,
  'adv-no-activity': advancedTweaks.disableActivityHistory,
  'adv-no-clipboard-hist': advancedTweaks.disableClipboardHistory,
  'adv-no-tips': advancedTweaks.disableTips,
  'adv-no-copilot': advancedTweaks.disableCopilot,
  'adv-no-widgets': advancedTweaks.disableWidgets,
  'adv-no-news': advancedTweaks.disableNewsFeed,
  'adv-consumer-feats': advancedTweaks.disableConsumerFeatures,
  'adv-no-bing': advancedTweaks.disableBingSearch,
  'adv-no-snap': advancedTweaks.disableSnapFlyout,
  'adv-no-search-highlights': advancedTweaks.disableSearchHighlights,
  'adv-no-error-report': advancedTweaks.disableErrorReporting,
  'adv-no-driver-updates': advancedTweaks.disableDriverUpdates,
  'svc-maps-off': advancedTweaks.disableMapsService,
  'svc-pca-off': advancedTweaks.disableCompatAssistant,
  'svc-geo-off': advancedTweaks.disableGeoService,
  'svc-fax-off': advancedTweaks.disableFaxService,
  'svc-insider-off': advancedTweaks.disableInsiderService,
  'svc-touchkbd-off': advancedTweaks.disableTouchKeyboard,
  // — Optional services (Risxn-style kills, but reversible) —
  'svc-xbox-off': advancedTweaks.disableXboxServices,
  'svc-printer-off': advancedTweaks.disablePrinterService,
  'svc-bluetooth-off': advancedTweaks.disableBluetoothService,
  // — Device latency (core/devices.js) — handled via tweak:device (see below)
};

/* ==========================================================================
 * Window
 * ========================================================================== */
let win = null;

// Single instance: focus the existing window instead of opening a second copy.
if (!app.requestSingleInstanceLock()) app.quit();

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 640,
    // Frameless: the renderer draws its own titlebar (see renderer/index.html).
    // backgroundColor avoids a white flash while the page loads.
    frame: false,
    backgroundColor: '#0D2140',
    show: false, // reveal only when ready (no blank-window flicker)
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, // renderer has NO direct Node access
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());

  // Keep the renderer's maximise/restore glyph in sync with the real state.
  win.on('maximize', () => win.webContents.send('win:state', { maximized: true }));
  win.on('unmaximize', () => win.webContents.send('win:state', { maximized: false }));

  // Never let pages navigate away / open popups inside the app shell.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url); // e.g. Cash App / mail links open in the browser
    return { action: 'deny' };
  });

  // Crash guard (fix #2 fallout): if the renderer GPU process dies on a weak
  // iGPU, reload once or twice instead of sitting on a white screen forever.
  let crashes = 0;
  win.webContents.on('render-process-gone', (_e, details) => {
    crashes++;
    if (crashes <= 2 && win) {
      console.error(`renderer gone (${details.reason}), reloading…`);
      win.reload();
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
// The 0.5ms timer holder (cpu-timer-res) only lives while the app runs —
// kill strays synchronously on quit so no invisible behavior change lingers.
app.on('before-quit', () => {
  try {
    require('node:child_process').spawnSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
        `Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*TidalTweaks-TimerRes*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`],
      { windowsHide: true, timeout: 15000 }
    );
  } catch { /* best effort — OS reclaims on reboot regardless */ }
});

/* ==========================================================================
 * Window controls (called by the custom titlebar buttons in the renderer)
 * ========================================================================== */
ipcMain.handle('win:minimize', () => win && win.minimize());
ipcMain.handle('win:toggle-max', () => {
  if (!win) return { maximized: false };
  win.isMaximized() ? win.unmaximize() : win.maximize();
  return { maximized: win.isMaximized() };
});
ipcMain.handle('win:close', () => win && win.close());
ipcMain.handle('win:is-maximized', () => (win ? win.isMaximized() : false));

/* ==========================================================================
 * Dashboard stats — split in two so the 2s poll stays cheap (fix #3):
 *   sys:live   — currentLoad + mem + uptime only. No WMI, no GPU enumeration.
 *   sys:static — cpu brand, GPUs, OS, disks. Cached 60s; the UI calls it once.
 * ========================================================================== */
ipcMain.handle('sys:live', async () => {
  try {
    const [load, mem, time] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.time(),
    ]);
    return {
      ok: true,
      cpu: { usage: Math.round(load.currentLoad || 0) },
      ram: {
        total: mem.total || 0,
        used: mem.used || 0,
        available: mem.available || 0,
        pct: mem.total ? Math.round((mem.used / mem.total) * 100) : 0,
      },
      uptimeSec: time.uptime || 0,
    };
  } catch (err) {
    return { ok: false, message: String((err && err.message) || err) };
  }
});

let staticCache = null;
let staticAt = 0;
ipcMain.handle('sys:static', async () => {
  try {
    if (staticCache && Date.now() - staticAt < 60000) return staticCache;
    const [cpu, gpu, os, disks] = await Promise.all([
      si.cpu(),
      si.graphics(),
      si.osInfo(),
      si.fsSize(),
    ]);
    staticCache = {
      ok: true,
      cpu: {
        model: cpu.brand || cpu.manufacturer || 'Unknown CPU',
        physical: cpu.physicalCores || 0,
        logical: cpu.cores || 0,
        speedGHz: cpu.speed || 0,
      },
      gpu: (gpu.controllers || []).map((c) => c.model).filter(Boolean),
      os: {
        name: `${os.distro || 'Windows'} ${os.release || ''}`.trim(),
        build: os.build || '',
        arch: os.arch || '',
        hostname: os.hostname || '',
      },
      disks: (disks || []).map((d) => ({
        fs: d.fs || d.mount || '',
        mount: d.mount || '',
        size: d.size || 0,
        used: d.used || 0,
        pct: d.use || 0,
      })),
    };
    staticAt = Date.now();
    return staticCache;
  } catch (err) {
    return { ok: false, message: String((err && err.message) || err) };
  }
});

/* ==========================================================================
 * Free features — thin wrappers over core modules
 * ========================================================================== */
ipcMain.handle('cleaner:scan', () => cleaner.scan());
ipcMain.handle('cleaner:clean', (_e, opts) => cleaner.clean(opts || {}));
ipcMain.handle('startup:list', () => startup.listEntries());
ipcMain.handle('startup:set', (_e, { id, enabled }) => startup.setEnabled(id, enabled));
ipcMain.handle('ram:optimize', () => ram.optimize());
ipcMain.handle('net:ping', (_e, { host }) => netTweaks.ping(host));
ipcMain.handle('net:dns', (_e, { host }) => netTweaks.dnsLookup(host));
ipcMain.handle('debloat:scan', () => {
  if (!proActive()) return { ok: false, message: 'Debloater scan needs Pro — activate in Settings.' };
  return debloatTweaks.scanInstalled();
});
ipcMain.handle('debloat:remove', (_e, { packages }) => {
  if (!proActive()) return { ok: false, message: 'App removal needs Pro — activate in Settings.' };
  return debloatTweaks.removePackages(packages || []);
});

/* A handful of demonstrably safe (HKCU-only or best-effort) tweaks are FREE
 * so the Gaming and Tweaks tabs aren't Pro-only billboards. Everything else
 * needs activation. This set MUST mirror the `free: true` flags in the
 * renderTweaks catalog (renderer/app.js) — the UI hides the button, but THIS
 * check is the real gate (the renderer can never be trusted). */
const FREE_TWEAKS = new Set([
  'game-bar-off', 'game-no-fs-optim',                         // Gaming teasers (HKCU)
  'vis-menu-delay', 'vis-extensions', 'vis-no-sticky',         // Tweaks teasers (HKCU)
  'vis-hidden-files', 'vis-transparency-on', 'adv-no-tips',    // more safe HKCU views
  'net-flush-dns',                                            // harmless, instant (Free)
  // Declutter wave — all single-write, instantly revertible:
  'adv-no-copilot', 'adv-no-widgets', 'adv-no-news', 'adv-consumer-feats',
  'adv-no-bing', 'adv-no-snap', 'vis-classic-context', 'vis-end-task',
  'vis-no-taskview', 'vis-no-chat', 'vis-numlock', 'cpu-bios-utc',
  // Research batch — safe/declarative = Free; deep/security = Pro:
  'game-mode-win-on', 'game-mouse-raw', 'game-keyboard-fast',
  'net-qos-limit', 'priv-no-autoplay', 'priv-no-feedback',
  'vis-no-thumbs-network', 'vis-this-pc', 'vis-no-login-blur', 'vis-taskbar-left',
  'adv-no-search-highlights',
  'sys-verbose-boot', 'sys-bsod-details', 'sys-fast-shutdown', 'sys-storage-sense',
  'vis-classic-clock', 'vis-no-taskbar-search', 'vis-taskbar-seconds',
  'vis-classic-alttab', 'vis-no-shake',
]);

/* Device Manager latency disables (Pro). id comes from a fixed allow-list in
 * core/devices.js — arbitrary device ids are rejected there. */
ipcMain.handle('tweak:device', (_e, { id, enabled }) => {
  if (!tierAtLeast(3)) return { ok: false, message: 'Device disables are Extreme-only ($30).' };
  return deviceTweaks.setDeviceEnabled(id, enabled !== false ? false : true);
});
ipcMain.handle('tweak:devices', () => deviceTweaks.listDevices());

/* Who may use Pro right now? The LOGGED-IN account's flag, or the legacy
 * device-wide flag from before accounts existed (auto-migrated on login). */
function accountTier() {
  const me = users.session();
  if (me && typeof me.tier === 'number') return me.tier;
  if (store.get('pro')) return 2; // pre-tier legacy device flag counts as Pro
  return 0;
}
const tierAtLeast = (n) => accountTier() >= n;
const proActive = () => tierAtLeast(2); // legacy alias (debloat bulk actions)

/* TIER MODEL — Free 0, Base $5, Pro $15, Extreme $30. Higher tiers unlock
 * everything below plus their own set (cumulative). Canonical lists live
 * HERE; the renderer mirrors them for badges/locks (audited in CI spirit by
 * the check script — keep both sides identical).
 *   FREE_TWEAKS: safe/declarative, no gate at all.
 *   BASE_TWEAKS: everyday wins (power plans, visual, safe services/updates).
 *   EXTREME_TWEAKS: boot-config, security trade-offs, destructive-adjacent.
 *   default (listed nowhere): Pro. */
const TIER_NAMES = ['Free', 'Base', 'Pro', 'Extreme'];
const TIER_PRICES = [0, 5, 15, 30];
const BASE_TWEAKS = new Set([
  'power-ultimate', 'power-balanced', 'power-no-usb-suspend', 'power-no-disk-sleep',
  'power-lid-nothing', 'power-sleep-never', 'power-no-auto-hibernate',
  'vis-no-peek', 'vis-no-anim', 'vis-no-blur', 'vis-transparency-off', 'vis-no-toggle-keys',
  'adv-no-delivery-opt', 'adv-no-bg-apps', 'adv-no-activity', 'adv-no-clipboard-hist',
  'adv-no-xbox-bar', 'debloat-visual-fx', 'debloat-disk-cleanup',
  'debloat-no-hibernate', 'cpu-no-hibernate',
  'sys-boot-legacy', 'sys-minidump', 'sys-no-bsod-reboot',
  'net-ecn-on', 'net-no-tunnel', 'net-adapter-restart', 'ram-standby-task',
  'game-bg-apps-off', 'net-timed-wait', 'net-max-user-port',
]);
const EXTREME_TWEAKS = new Set([
  'game-no-hpet', 'cpu-no-dynamictick', 'cpu-tsc-enhanced', 'cpu-no-spec-mit',
  'cpu-x2apic', 'cpu-timer-res',
  'priv-lsa', 'priv-credential-guard', 'debloat-edge',
  'priv-no-rdp', 'priv-no-smb1', 'net-reset-stack',
]);
function tierOf(id) {
  if (FREE_TWEAKS.has(id)) return 0;
  if (BASE_TWEAKS.has(id)) return 1;
  if (EXTREME_TWEAKS.has(id)) return 3;
  return 2;
}
const requester = () => users.session(); // sanitized {username, role, ...} | null
const isOwner = () => { const me = requester(); return !!(me && me.role === 'owner'); };

/* ==========================================================================
 * Pro tweak runner — the ONLY way the UI applies a tweak.
 * Flow: require Pro → confirm modal (renderer) → restore point → run core fn
 * → append to undo log (core/backup.js) so Undo/Revert-All can roll it back.
 * ========================================================================== */
ipcMain.handle('tweak:apply', async (_e, { id }) => {
  const need = tierOf(id);
  if (accountTier() < need) {
    return { ok: false, message: `This tweak requires TidalTweaks ${TIER_NAMES[need]} ($${TIER_PRICES[need]}).` };
  }
  const fn = TWEAK_REGISTRY[id];
  if (typeof fn !== 'function') return { ok: false, message: `Unknown tweak: ${id}` };
  try {
    await backup.ensureRestorePoint(`TidalTweaks ${id}`);
    const res = await fn();
    if (res && res.ok) backup.logChange({ id, at: new Date().toISOString(), revert: res.revert || null });
    return res;
  } catch (err) {
    return { ok: false, message: String((err && err.message) || err) };
  }
});

/* Revert a single tweak. Free tweaks stay revertable without Pro (a free
 * user must never be stranded with an un-undoable change). */
ipcMain.handle('tweak:revert', async (_e, { id }) => {
  // Free tweaks stay revertable without any tier (never strand a free user).
  if (tierOf(id) !== 0 && accountTier() < tierOf(id)) {
    return { ok: false, message: `Reverting this needs ${TIER_NAMES[tierOf(id)]} (your backup is kept).` };
  }
  try {
    return await backup.revertOne(id);
  } catch (err) {
    return { ok: false, message: String((err && err.message) || err) };
  }
});

/* ==========================================================================
 * Preset stacks — ONE restore point + ONE undo entry for the whole bundle.
 * Per-tweak modals are replaced by a single preset confirm listing every
 * included tweak (renderer builds it from preset:list + the TT catalog).
 * ========================================================================== */
/* Preset tier = the highest tier of anything inside (computed server-side,
 * so the client can never downgrade a stack's requirement). */
function presetTier(p) {
  return Math.max(0, ...p.ids.map((tid) => tierOf(tid)));
}
ipcMain.handle('preset:list', () => ({
  ok: true,
  presets: presets.list().map((p) => ({ ...p, tier: presetTier(p), tierName: TIER_NAMES[presetTier(p)] })),
}));
ipcMain.handle('preset:apply', async (_e, { id }) => {
  const p = presets.get(String(id || ''));
  if (!p) return { ok: false, message: 'Unknown preset.' };
  const need = presetTier(p);
  if (accountTier() < need) {
    return { ok: false, message: `This preset requires TidalTweaks ${TIER_NAMES[need]} ($${TIER_PRICES[need]}).` };
  }
  try {
    await backup.ensureRestorePoint(`TidalTweaks preset ${p.id}`);
    const reverts = [];
    const lines = [];
    let done = 0;
    for (const tid of p.ids) {
      const fn = TWEAK_REGISTRY[tid];
      if (typeof fn !== 'function') { lines.push(`✗ ${tid}: unknown tweak`); continue; }
      try {
        const r = await fn();
        if (r && r.ok) {
          done++;
          if (r.revert) (Array.isArray(r.revert) ? reverts.push(...r.revert) : reverts.push(r.revert));
          lines.push(`✓ ${tid}`);
        } else lines.push(`✗ ${tid}: ${(r && r.message) || 'failed'}`);
      } catch (err) { lines.push(`✗ ${tid}: ${String((err && err.message) || err)}`); }
    }
    // Free presets contain only free tweaks, so no gate check per item needed;
    // a Pro preset already passed the gate above.
    if (done > 0) backup.logChange({ id: 'preset:' + p.id, at: new Date().toISOString(), revert: reverts });
    // Game presets also register exes into the priority-games list (validated
    // shape, merged case-insensitively, capped at 20).
    let gamesNote = '';
    if (p.games && p.games.length) {
      const clean = [...new Set(p.games.map((n) => String(n).trim()))]
        .filter((n) => /^[\w\-. ]{1,60}\.exe$/i.test(n))
        .slice(0, 20);
      const cur = Array.isArray(store.get('priorityGames')) ? store.get('priorityGames') : [];
      const merged = [...cur];
      clean.forEach((n) => {
        if (!merged.some((m) => String(m).toLowerCase() === n.toLowerCase())) merged.push(n);
      });
      store.set('priorityGames', merged.slice(0, 20));
      if (clean.length) gamesNote = ` + 🎮 ${clean.length} game exe(s) saved`;
    }
    return {
      ok: done === p.ids.length,
      message: `${p.title}: ${done}/${p.ids.length} applied${gamesNote}.`,
      details: lines,
    };
  } catch (err) {
    return { ok: false, message: String((err && err.message) || err) };
  }
});

/* Boost the saved game list to High (Free — Gaming tab priority card). */
ipcMain.handle('game:boost-list', (_e, { names }) => gamingTweaks.boostSavedGames(names || []));

/* Force discrete GPU for the saved list (Pro — reads the same stored list,
 * so the renderer never sends exes for this one). */
ipcMain.handle('game:gpu-pref', async () => {
  if (accountTier() < 2) return { ok: false, message: 'Discrete-GPU forcing needs Pro ($15).' };
  const list = Array.isArray(store.get('priorityGames')) ? store.get('priorityGames') : [];
  await backup.ensureRestorePoint('TidalTweaks game-discrete-gpu');
  const r = await gamingTweaks.preferDiscreteGPU(list);
  if (r && r.ok) backup.logChange({ id: 'game-discrete-gpu', at: new Date().toISOString(), revert: r.revert });
  return r;
});

/* ==========================================================================
 * Safety: restore points + undo (Restore tab, available to everyone)
 * ========================================================================== */
ipcMain.handle('restore:create', (_e, { label } = {}) => backup.createRestorePoint(label));
ipcMain.handle('restore:undo-last', () => backup.undoLast());
ipcMain.handle('restore:revert-all', () => backup.revertAll());
ipcMain.handle('restore:history', () => backup.history());

/* ==========================================================================
 * Activation — same flow as the Python version, step by step:
 *   1. User pays manually via Cash App to $AlwaysBetOnBright and receives a
 *      one-time code (no payment code exists in this app at all).
 *   2. Renderer POSTs { code } to the Cloudflare Pages function
 *      (DEFAULT_API_URL, overridable in Settings).
 *   3. The Pages function looks the code up in KV: found → DELETES it
 *      permanently and returns { valid: true }; missing → { valid: false }
 *      with HTTP 400. Single-use is enforced server-side.
 *   4. On { valid: true } we persist { pro:true, code, activatedAt } in
 *      electron-store and unlock instantly. On failure we store nothing.
 * Node 18+ has a global fetch, so no HTTP library is needed.
 * ========================================================================== */
ipcMain.handle('license:validate', async (_e, { code }) => {
  const clean = String(code || '').trim();
  if (!clean) return { ok: false, message: 'Please paste a code first.' };
  // Pro attaches to the LOGGED-IN account (the auth gate guarantees one, but
  // never trust the renderer — verify again here).
  const me = users.session();
  if (!me) return { ok: false, message: 'Log in first, then activate.' };
  let res;
  try {
    res = await fetch(apiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: clean }),
    });
  } catch (err) {
    return { ok: false, message: `Could not reach license server: ${String((err && err.message) || err)}` };
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    return { ok: false, message: `Bad server response (HTTP ${res.status}).` };
  }
  if (res.ok && data && data.valid === true) {
    // Per-tier codes: the KV VALUE names the tier ("base"|"pro"|"extreme").
    // Legacy values ("1", "true", missing) mean Pro. Server is authoritative.
    const rawTier = String((data && data.tier) || '').toLowerCase().trim();
    const tier = rawTier === 'base' ? 1 : rawTier === 'extreme' ? 3 : 2;
    users.setTier(me.username, tier, clean); // code is single-use: KV already deleted it
    return { ok: true, message: `${TIER_NAMES[tier]} activated for '${me.username}' — welcome to the fast lane.` };
  }
  // Server returns { valid:false } with 400 for unknown/already-used codes.
  return { ok: false, message: 'Invalid or already used code.' };
});

ipcMain.handle('license:status', () => {
  const me = users.session();
  const tier = accountTier();
  return {
    pro: tier >= 2,
    tier,
    tierName: TIER_NAMES[tier] || 'Free',
    activatedAt: (me && me.activatedAt) || store.get('activatedAt') || null,
    apiUrl: apiUrl(),
    cashapp: CASHAPP_TAG,
    lite: LITE, // effective lite mode (after auto-detection)
    litePref: store.get('liteMode') || 'auto',
    username: (me && me.username) || null,
    role: (me && me.role) || null,
  };
});

ipcMain.handle('license:set-lite', (_e, { value } = {}) => {
  // 'auto' | 'on' | 'off'. GPU-compositing change needs a restart to bite;
  // the CSS half (body.lite) applies instantly via refreshLicense().
  const v = String(value || 'auto').toLowerCase();
  if (!['auto', 'on', 'off'].includes(v)) return { ok: false, message: 'Use auto, on, or off.' };
  store.set('liteMode', v);
  LITE = resolveLite();
  return { ok: true, lite: LITE, litePref: v };
});

/* Appearance settings (Settings → Appearance). Device-level like liteMode —
 * themes are a display preference, not per-account data. */
const THEMES = ['tsunami', 'abyss', 'royal', 'emerald', 'crimson', 'sunset', 'arctic', 'mono'];
const ACCENTS = ['blue', 'gold', 'violet', 'mint', 'rose', 'cyan', 'orange', 'silver'];
ipcMain.handle('settings:get', () => ({
  ok: true,
  theme: THEMES.includes(store.get('theme')) ? store.get('theme') : 'tsunami',
  accent: ACCENTS.includes(store.get('accent')) ? store.get('accent') : 'blue',
  priorityGames: Array.isArray(store.get('priorityGames')) ? store.get('priorityGames') : [],
}));
ipcMain.handle('settings:set', (_e, patch = {}) => {
  if (patch.theme !== undefined) {
    if (!THEMES.includes(patch.theme)) return { ok: false, message: 'Unknown theme.' };
    store.set('theme', patch.theme);
  }
  if (patch.accent !== undefined) {
    if (!ACCENTS.includes(patch.accent)) return { ok: false, message: 'Unknown accent.' };
    store.set('accent', patch.accent);
  }
  // Saved per-game exe list (Gaming tab → priority card). Strict shape:
  // ≤20 strings, each a plausible *.exe name. Validated AGAIN at boost time.
  if (patch.priorityGames !== undefined) {
    if (!Array.isArray(patch.priorityGames)) return { ok: false, message: 'Bad game list.' };
    const clean = [...new Set(patch.priorityGames.map((n) => String(n).trim()))]
      .filter((n) => /^[\w\-. ]{1,60}\.exe$/i.test(n))
      .slice(0, 20);
    store.set('priorityGames', clean);
  }
  return { ok: true, theme: store.get('theme'), accent: store.get('accent'), priorityGames: store.get('priorityGames') || [] };
});

/* ==========================================================================
 * Accounts — sign up / log in / owner management (see core/users.js).
 * Passwords never cross IPC in either direction except at entry; hashes stay
 * in the main process. Owner-only routes re-check the role on EVERY call.
 * The Owner PANEL has one more lock: the device passphrase (owner:* below).
 * ========================================================================== */
ipcMain.handle('auth:signup', (_e, { username, password }) => users.signup(username, password));

ipcMain.handle('auth:login', (_e, { username, password }) => {
  const r = users.login(username, password);
  if (r.ok && store.get('pro')) {
    // One-time migration: a device license from before accounts existed
    // moves onto the first account that logs in. Runs exactly once.
    users.setPro(r.user.username, store.get('code'));
    store.set('pro', false);
    store.set('code', null);
    store.set('activatedAt', null);
  }
  return r;
});

ipcMain.handle('auth:logout', () => users.logout());
ipcMain.handle('auth:session', () => ({ user: users.session() }));

ipcMain.handle('auth:list', () => {
  if (!isOwner()) return { ok: false, message: 'Owner only.' };
  return users.list();
});
ipcMain.handle('auth:set-role', (_e, { username, role }) => {
  const me = requester();
  if (!me || me.role !== 'owner') return { ok: false, message: 'Owner only.' };
  if (me.username.toLowerCase() === String(username || '').toLowerCase() && role !== 'owner') {
    return { ok: false, message: 'You cannot demote yourself.' };
  }
  return users.setRole(username, role);
});
ipcMain.handle('auth:reset-password', (_e, { username, newPassword }) => {
  if (!isOwner()) return { ok: false, message: 'Owner only.' };
  return users.resetPassword(username, newPassword);
});
ipcMain.handle('auth:delete-user', (_e, { username }) => {
  const me = requester();
  if (!me || me.role !== 'owner') return { ok: false, message: 'Owner only.' };
  return users.deleteUser(username, me.username);
});
ipcMain.handle('auth:change-password', (_e, { oldPassword, newPassword }) => {
  const me = requester();
  if (!me) return { ok: false, message: 'Not logged in.' };
  return users.changePassword(me.username, oldPassword, newPassword);
});

/* Owner-panel passphrase: second lock on the Owner panel, on top of login.
 * Owner role required for all three (check EVERY call — the renderer decides
 * nothing). The secret itself never leaves the main process. */
ipcMain.handle('owner:has-passphrase', () => {
  if (!isOwner()) return { ok: false, message: 'Owner only.' };
  return users.ownerHasPass();
});
ipcMain.handle('owner:set-passphrase', (_e, { passphrase }) => {
  if (!isOwner()) return { ok: false, message: 'Owner only.' };
  return users.ownerSetPass(passphrase);
});
ipcMain.handle('owner:verify-passphrase', (_e, { passphrase }) => {
  if (!isOwner()) return { ok: false, message: 'Owner only.' };
  return users.ownerVerifyPass(passphrase);
});

ipcMain.handle('license:deactivate', () => {
  const me = users.session();
  if (me) users.clearPro(me.username);
  // Also clear any pre-accounts legacy device flag.
  store.set('pro', false);
  store.set('code', null);
  store.set('activatedAt', null);
  return { ok: true };
});

ipcMain.handle('license:set-api-url', (_e, { url }) => {
  const clean = String(url || '').trim();
  if (!/^https?:\/\/.+/i.test(clean)) return { ok: false, message: 'URL must start with http(s)://' };
  store.set('apiUrl', clean);
  return { ok: true, apiUrl: clean };
});

