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
 * CONFIRMATION: no paid APIs, no payment processors, no servers at all.
 * Pro unlock is a manual Cash App payment for a signed offline code;
 * the app makes ZERO license network calls (see license:validate).
 * ========================================================================== */

const { app, BrowserWindow, ipcMain, shell, screen, globalShortcut } = require('electron');
const path = require('node:path');
const os = require('node:os');
const Store = require('electron-store');
const si = require('systeminformation');

const CASHAPP_TAG = '$AlwaysBetOnBright'; // shown in Settings, never sent anywhere

/* electron-store: local persistence. Only settings + local license state. */
const store = new Store({
  defaults: {
    pro: false,
    code: null,
    activatedAt: null,
    liteMode: 'auto', // 'auto' | 'on' | 'off' — see resolveLite()
    theme: 'tsunami',  // tsunami | abyss | royal | emerald (Settings → Appearance)
    accent: 'blue',    // blue | gold | violet | mint | rose
    // Crosshair overlay: last used design (see core/crosshair.js) + Pro saves.
    crosshair: null,
    crosshairSaved: [],
  },
});

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
const crosshair = require('./core/crosshair'); // transparent overlay (see core/crosshair.js)

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
  'vis-no-shadows': visualTweaks.noShadows,
  'vis-no-drag-full': visualTweaks.noDragFull,
  'vis-fx-custom-min': visualTweaks.fxCustomMin,
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
  'power-active-cooling': powerTweaks.activeCooling,
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

  // Closing the main shell quits the app AND the crosshair overlay (the
  // overlay alone must never keep the process alive headless).
  win.on('closed', () => {
    win = null;
    try { crosshair.destroy(); } catch { /* ignore */ }
    if (process.platform !== 'darwin') app.quit();
  });
}

app.whenReady().then(() => {
  createWindow();
  // Crosshair overlay: separate transparent always-on-top window (see core/).
  try {
    crosshair.init({ BrowserWindow, screen, store, getMainWindow: () => win });
    crosshair.ensureWindow();
  } catch (e) { console.error('crosshair init failed:', String((e && e.message) || e)); }
  // Global hotkey: snap the crosshair back to the primary-screen center.
  // Recenter is a Position (Pro) feature — Free presses get a notice toast
  // in the main window instead of moving anything.
  try {
    globalShortcut.register(crosshair.RESET_HOTKEY, () => {
      try {
        if (accountTier() < 2) {
          crosshair.ensureWindow();
          crosshair.notifyMain('🔒 Recenter needs Pro ($15) — activate in Settings.');
          return;
        }
        crosshair.resetToCenter();
      } catch (e) { /* ignore */ }
    });
  } catch (e) { console.error('hotkey register failed:', String((e && e.message) || e)); }
  app.on('activate', () => {
    if (!win || win.isDestroyed()) createWindow();
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
  try { globalShortcut.unregisterAll(); } catch { /* ignore */ }
  try { crosshair.destroy(); } catch { /* ignore */ }
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
  'vis-no-shadows', 'vis-no-drag-full', 'vis-fx-custom-min',
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
  'power-active-cooling',
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
/* One-way progress pings for the loading overlay (renderer subscribes via
 * preset.onProgress). Fire-and-forget: a dead window must never break tweaks. */
function sendProgress(msg) {
  try {
    if (win && !win.isDestroyed()) win.webContents.send('preset:progress', msg);
  } catch { /* overlay is cosmetic; the tweak result is what matters */ }
}
/* Built-ins PLUS validated customs from <userData>/custom-presets.json.
 * Customs with unknown ids (typos, removed tweaks) are dropped here so one
 * bad private entry can never break the built-in list. */
function allPresets() {
  const builtins = presets.list();
  let customs = [];
  try {
    customs = presets
      .listCustom(app.getPath('userData'))
      .filter((p) => p.ids.every((tid) => typeof TWEAK_REGISTRY[tid] === 'function'));
  } catch {
    customs = [];
  }
  return [...builtins, ...customs];
}
ipcMain.handle('preset:list', () => ({
  ok: true,
  presets: allPresets().map((p) => ({ ...p, tier: presetTier(p), tierName: TIER_NAMES[presetTier(p)] })),
}));
ipcMain.handle('preset:apply', async (_e, { id }) => {
  const p = allPresets().find((x) => x.id === String(id || ''));
  if (!p) return { ok: false, message: 'Unknown preset.' };
  const need = presetTier(p);
  if (accountTier() < need) {
    return { ok: false, message: `This preset requires TidalTweaks ${TIER_NAMES[need]} ($${TIER_PRICES[need]}).` };
  }
  try {
    await backup.ensureRestorePoint(`TidalTweaks preset ${p.id}`);
    sendProgress({ preset: p.id, phase: 'restore', index: 0, total: p.ids.length });
    const reverts = [];
    const lines = [];
    let done = 0;
    let step = 0;
    for (const tid of p.ids) {
      step++;
      const fn = TWEAK_REGISTRY[tid];
      if (typeof fn !== 'function') {
        lines.push(`✗ ${tid}: unknown tweak`);
        sendProgress({ preset: p.id, phase: 'step', index: step, total: p.ids.length, id: tid, ok: false });
        continue;
      }
      try {
        const r = await fn();
        if (r && r.ok) {
          done++;
          if (r.revert) (Array.isArray(r.revert) ? reverts.push(...r.revert) : reverts.push(r.revert));
          lines.push(`✓ ${tid}`);
          sendProgress({ preset: p.id, phase: 'step', index: step, total: p.ids.length, id: tid, ok: true });
        } else {
          lines.push(`✗ ${tid}: ${(r && r.message) || 'failed'}`);
          sendProgress({ preset: p.id, phase: 'step', index: step, total: p.ids.length, id: tid, ok: false, message: (r && r.message) || 'failed' });
        }
      } catch (err) {
        lines.push(`✗ ${tid}: ${String((err && err.message) || err)}`);
        sendProgress({ preset: p.id, phase: 'step', index: step, total: p.ids.length, id: tid, ok: false });
      }
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
 * Factory reset — remove ALL tweaks and start from scratch. Replays the
 * entire undo log (newest first), then parks the power plan on Balanced.
 * Honest accounting included: entries with no revert data (AppX removals,
 * Edge/OneDrive uninstalls, one-shot repairs) CANNOT come back by themselves
 * and are reported by id so the user knows exactly what needs manual action
 * (Microsoft Store reinstall, etc.). The System Restore safety net still
 * applies for anything the log can't express.
 * ========================================================================== */
function revertEntryIsManual(entry) {
  const revs = Array.isArray(entry.revert) ? entry.revert : [entry.revert];
  return !revs.length || revs.every((r) => !r || r.kind === 'none');
}
ipcMain.handle('restore:factory-reset', async () => {
  try {
    const hist = backup.history();
    const entries = (hist && hist.history) || [];
    if (!entries.length) return { ok: false, message: 'Nothing to reset — no tweaks on record.' };
    // Snapshot the manual-action list BEFORE revertAll wipes the log.
    const manual = entries.filter(revertEntryIsManual).map((e) => e.id);
    const r = await backup.revertAll();
    let powerMsg = '';
    try {
      const pr = await powerTweaks.setBalancedPlan();
      powerMsg = pr && pr.ok ? ' Power plan parked on Balanced.' : '';
    } catch { /* power reset is best-effort on top of a completed revert */ }
    const lines = [`${r.message || 'Revert complete.'}${powerMsg}`];
    if (manual.length) {
      lines.push(`NOT auto-reverted (${manual.length}) — needs manual action: ${manual.join(', ')}. AppX removals come back via the Microsoft Store; uninstalled programs need reinstalling.`);
    } else {
      lines.push('Everything on record was reverted automatically.');
    }
    return { ok: true, message: lines[0], details: lines, manual };
  } catch (err) {
    return { ok: false, message: String((err && err.message) || err) };
  }
});
ipcMain.handle('restore:create', (_e, { label } = {}) => backup.createRestorePoint(label));
ipcMain.handle('restore:undo-last', () => backup.undoLast());
ipcMain.handle('restore:revert-all', () => backup.revertAll());
ipcMain.handle('restore:history', () => backup.history());

/* ==========================================================================
 * Activation — OFFLINE signed codes (no server, no Cloudflare, no network):
 *   1. User pays manually via Cash App to $AlwaysBetOnBright, DMs the seller
 *      on Discord with receipt + tier, receives a TT1-* code.
 *   2. license:validate runs core/license.claimCode: Ed25519 signature check
 *      (unforgeable) + per-machine single-use bookkeeping.
 *   3. Tier attaches to the LOGGED-IN account; unlock is instant.
 * No payment code and no license network call exist anywhere in this app.
 * ========================================================================== */
const license = require('./core/license');

ipcMain.handle('license:validate', async (_e, { code }) => {
  // Tier attaches to the LOGGED-IN account (the auth gate guarantees one, but
  // never trust the renderer — verify again here).
  const me = users.session();
  if (!me) return { ok: false, message: 'Log in first, then activate.' };
  try {
    return license.claimCode(code, me.username);
  } catch (err) {
    return { ok: false, message: String((err && err.message) || err) };
  }
});

ipcMain.handle('license:status', () => {
  const me = users.session();
  const tier = accountTier();
  return {
    pro: tier >= 2,
    tier,
    tierName: TIER_NAMES[tier] || 'Free',
    activatedAt: (me && me.activatedAt) || store.get('activatedAt') || null,
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
const THEMES = ['tsunami', 'abyss', 'royal', 'emerald', 'crimson', 'sunset', 'arctic', 'mono', 'inferno', 'candy', 'toxic'];
const ACCENTS = ['blue', 'gold', 'violet', 'mint', 'rose', 'cyan', 'orange', 'silver'];
ipcMain.handle('settings:get', () => ({
  ok: true,
  theme: THEMES.includes(store.get('theme')) ? store.get('theme') : 'tsunami',
  accent: ACCENTS.includes(store.get('accent')) ? store.get('accent') : 'blue',
  priorityGames: Array.isArray(store.get('priorityGames')) ? store.get('priorityGames') : [],
  // Last used crosshair design (Crosshair tab). Sanitized in core/crosshair.js.
  crosshair: crosshair.getConfig(),
  crosshairSaved: crosshair.getSaved(),
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
  // Persisted crosshair design (Crosshair tab auto-saves on every change).
  if (patch.crosshair !== undefined) {
    try { crosshair.setConfig(patch.crosshair || {}); } catch { /* ignore */ }
  }
  return { ok: true, theme: store.get('theme'), accent: store.get('accent'), priorityGames: store.get('priorityGames') || [], crosshair: crosshair.getConfig() };
});

/* ==========================================================================
 * Crosshair overlay — separate transparent always-on-top window.
 * Free: 6 shapes (cross/dot-plus/dot/t/x/ring), layer-1 color, on/off.
 * Pro (tier >= 2, enforced HERE): layers, all size sliders, outline,
 * center dot, position (recenter/nudge), save/load customs. The renderer
 * only mirrors locks for UX — these checks are the real gate.
 * ========================================================================== */
const crosshairProRequired = () => 'That crosshair feature needs Pro ($15) — activate in Settings.';
ipcMain.handle('crosshair:get', () => {
  try {
    crosshair.ensureWindow();
    return { ok: true, config: crosshair.getConfig(), saved: crosshair.getSaved() };
  } catch (err) {
    return { ok: false, message: String((err && err.message) || err) };
  }
});
ipcMain.handle('crosshair:set', (_e, patch = {}) => {
  try {
    crosshair.ensureWindow();
    const p = { ...(patch || {}) };
    // Pro gate: free may only flip enabled, pick a shape, or recolor layer 1.
    if (accountTier() < 2) {
      if (p.layers !== undefined || p.x !== undefined || p.y !== undefined) {
        return { ok: false, message: crosshairProRequired() };
      }
      const allowed = {};
      if (p.enabled !== undefined) allowed.enabled = !!p.enabled;
      const cur = crosshair.getConfig();
      const l0 = { ...(cur.layers[0] || crosshair.defaultConfig().layers[0]) };
      if (p.shape !== undefined) {
        if (!crosshair.FREE_SHAPES.includes(String(p.shape))) {
          return { ok: false, message: 'Unknown shape.' };
        }
        l0.shape = String(p.shape);
      }
      if (p.color !== undefined) {
        if (!/^#[0-9a-fA-F]{6}$/.test(String(p.color))) return { ok: false, message: 'Bad color.' };
        l0.color = String(p.color);
      }
      if (p.shape !== undefined || p.color !== undefined) allowed.layers = [l0, ...cur.layers.slice(1)];
      return crosshair.setConfig(allowed);
    }
    return crosshair.setConfig(p);
  } catch (err) {
    return { ok: false, message: String((err && err.message) || err) };
  }
});
ipcMain.handle('crosshair:toggle', (_e, { enabled } = {}) => {
  try {
    crosshair.ensureWindow();
    return crosshair.toggle(enabled);
  } catch (err) {
    return { ok: false, message: String((err && err.message) || err) };
  }
});
ipcMain.handle('crosshair:reset', () => {
  if (accountTier() < 2) return { ok: false, message: crosshairProRequired() };
  try {
    crosshair.ensureWindow();
    return crosshair.resetToCenter();
  } catch (err) {
    return { ok: false, message: String((err && err.message) || err) };
  }
});
ipcMain.handle('crosshair:set-movable', (_e, { movable } = {}) => {
  try { return crosshair.setMovable(!!movable); }
  catch (err) { return { ok: false, message: String((err && err.message) || err) }; }
});
ipcMain.handle('crosshair:nudge', (_e, { dx, dy } = {}) => {
  if (accountTier() < 2) return { ok: false, message: crosshairProRequired() };
  try {
    crosshair.ensureWindow();
    return crosshair.nudge(Number(dx) || 0, Number(dy) || 0);
  } catch (err) {
    return { ok: false, message: String((err && err.message) || err) };
  }
});
ipcMain.handle('crosshair:add-layer', (_e, { shape } = {}) => {
  if (accountTier() < 2) return { ok: false, message: crosshairProRequired() };
  try {
    crosshair.ensureWindow();
    const cur = crosshair.getConfig();
    if (cur.layers.length >= crosshair.MAX_LAYERS) {
      return { ok: false, message: `Max ${crosshair.MAX_LAYERS} layers.` };
    }
    const s = crosshair.ALL_SHAPES.includes(String(shape)) ? String(shape) : 'cross';
    const layers = [...cur.layers, { ...crosshair.defaultLayer(s, (cur.layers[0] && cur.layers[0].color) || '#22FF88') }];
    return crosshair.setConfig({ layers });
  } catch (err) {
    return { ok: false, message: String((err && err.message) || err) };
  }
});
ipcMain.handle('crosshair:remove-layer', (_e, { id } = {}) => {
  if (accountTier() < 2) return { ok: false, message: crosshairProRequired() };
  try {
    const cur = crosshair.getConfig();
    if (cur.layers.length <= 1) return { ok: false, message: 'Keep at least one layer.' };
    return crosshair.setConfig({ layers: cur.layers.filter((l) => l.id !== String(id)) });
  } catch (err) {
    return { ok: false, message: String((err && err.message) || err) };
  }
});
ipcMain.handle('crosshair:save', (_e, { name } = {}) => {
  if (accountTier() < 2) return { ok: false, message: crosshairProRequired() };
  try {
    const cfg = crosshair.getConfig();
    const saved = crosshair.getSaved();
    const entry = { name: String(name || `Custom ${saved.length + 1}`).slice(0, 40), at: new Date().toISOString(), config: cfg };
    const next = [...saved, entry].slice(-crosshair.MAX_SAVED);
    store.set('crosshairSaved', next);
    return { ok: true, message: `Saved “${entry.name}”.`, saved: next };
  } catch (err) {
    return { ok: false, message: String((err && err.message) || err) };
  }
});
ipcMain.handle('crosshair:delete-saved', (_e, { index } = {}) => {
  if (accountTier() < 2) return { ok: false, message: crosshairProRequired() };
  try {
    const saved = crosshair.getSaved();
    const i = Number(index);
    if (!Number.isInteger(i) || i < 0 || i >= saved.length) return { ok: false, message: 'Saved design not found.' };
    const next = saved.filter((_, j) => j !== i);
    store.set('crosshairSaved', next);
    return { ok: true, message: 'Deleted.', saved: next };
  } catch (err) {
    return { ok: false, message: String((err && err.message) || err) };
  }
});
ipcMain.handle('crosshair:load-saved', (_e, { index } = {}) => {
  try {
    const saved = crosshair.getSaved();
    const entry = saved[Number(index)];
    if (!entry) return { ok: false, message: 'Saved design not found.' };
    // Multi-layer customs are Pro; single-layer designs load on Free.
    if (accountTier() < 2 && (entry.config.layers || []).length > 1) {
      return { ok: false, message: crosshairProRequired() };
    }
    return crosshair.setConfig({ ...entry.config, enabled: crosshair.getConfig().enabled });
  } catch (err) {
    return { ok: false, message: String((err && err.message) || err) };
  }
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


