'use strict';
/* ============================================================================
 * TidalTweaks — preload bridge (runs with Node privileges, renderer does not)
 * ----------------------------------------------------------------------------
 * The renderer (UI) is sandboxed: nodeIntegration OFF, contextIsolation ON.
 * It CANNOT require('child_process') or touch PowerShell directly. Every
 * privileged action goes through `window.api`, which forwards to exactly the
 * IPC channels defined below — nothing else is reachable from the UI.
 * ========================================================================== */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // — Frameless window controls (custom titlebar) —
  win: {
    minimize: () => ipcRenderer.invoke('win:minimize'),
    toggleMax: () => ipcRenderer.invoke('win:toggle-max'),
    close: () => ipcRenderer.invoke('win:close'),
    isMaximized: () => ipcRenderer.invoke('win:is-maximized'),
    // cb receives { maximized: bool } whenever the OS window state changes
    onState: (cb) => ipcRenderer.on('win:state', (_e, state) => cb(state)),
  },

  // — Dashboard: sys:live is the cheap 2s poll (load/mem/uptime);
  //   sys:static is the heavy one-shot (cpu model/gpu/os/disks, cached 60s) —
  sys: {
    live: () => ipcRenderer.invoke('sys:live'),
    static: () => ipcRenderer.invoke('sys:static'),
  },

  // — Cleaner (Free) —
  cleaner: {
    scan: () => ipcRenderer.invoke('cleaner:scan'),
    clean: (opts) => ipcRenderer.invoke('cleaner:clean', opts || {}),
  },

  // — Startup Manager (Free). id = "<hive>:<name>", e.g. "HKCU:Discord" —
  startup: {
    list: () => ipcRenderer.invoke('startup:list'),
    set: (id, enabled) => ipcRenderer.invoke('startup:set', { id, enabled }),
  },

  // — RAM Optimizer (Free) —
  ram: {
    optimize: () => ipcRenderer.invoke('ram:optimize'),
  },

  // — Network Tools (Free ping/DNS) —
  net: {
    ping: (host) => ipcRenderer.invoke('net:ping', { host }),
    dns: (host) => ipcRenderer.invoke('net:dns', { host }),
  },

  // — Debloater scan/remove (Pro-gated in main) —
  debloat: {
    scan: () => ipcRenderer.invoke('debloat:scan'),
    remove: (packages) => ipcRenderer.invoke('debloat:remove', { packages }),
  },

  // — Generic Pro tweak runner. `id` must be a key of TWEAK_REGISTRY in
  //   main.js — arbitrary commands can never be passed through here. —
  tweak: {
    apply: (id) => ipcRenderer.invoke('tweak:apply', { id }),
    revert: (id) => ipcRenderer.invoke('tweak:revert', { id }),
    device: (id, enabled) => ipcRenderer.invoke('tweak:device', { id, enabled }),
    devices: () => ipcRenderer.invoke('tweak:devices'),
  },

  // — Preset stacks (one restore point + one undo for the whole bundle) —
  preset: {
    list: () => ipcRenderer.invoke('preset:list'),
    apply: (id) => ipcRenderer.invoke('preset:apply', { id }),
    // Live step events {preset, phase, index, total, id, ok, message}.
    // Returns an unsubscribe function — callers must clean up.
    onProgress: (cb) => {
      const listener = (_e, msg) => cb(msg);
      ipcRenderer.on('preset:progress', listener);
      return () => ipcRenderer.removeListener('preset:progress', listener);
    },
  },

  // — Saved-games priority boost (Free) —
  game: {
    boostList: (names) => ipcRenderer.invoke('game:boost-list', { names }),
    gpuPref: () => ipcRenderer.invoke('game:gpu-pref'),
  },

  // — Restore points + undo (available to everyone) —
  restore: {
    create: (label) => ipcRenderer.invoke('restore:create', { label }),
    undoLast: () => ipcRenderer.invoke('restore:undo-last'),
    revertAll: () => ipcRenderer.invoke('restore:revert-all'),
    factoryReset: () => ipcRenderer.invoke('restore:factory-reset'),
    history: () => ipcRenderer.invoke('restore:history'),
  },

  // — Activation (offline signed codes — see core/license.js, no network) —
  license: {
    validate: (code) => ipcRenderer.invoke('license:validate', { code }),
    status: () => ipcRenderer.invoke('license:status'),
    deactivate: () => ipcRenderer.invoke('license:deactivate'),
    setLite: (value) => ipcRenderer.invoke('license:set-lite', { value }),
  },

  // — Appearance (theme + accent, Settings → Appearance) —
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch || {}),
  },

  // — Crosshair overlay (separate transparent always-on-top window) —
  // — BIOS tab: WMI motherboard detect (informational, ungated — guides
  //   are static text locked client-side) —
  bios: {
    detect: () => ipcRenderer.invoke('bios:detect'),
  },
  // — Services tab structure (ungated; Pro enforced at apply time) —
  services: {
    list: () => ipcRenderer.invoke('services:list'),
  },
  // — Connection mode (local detect; gates future server features) —
  conn: {
    get: () => ipcRenderer.invoke('conn:get'),
    check: () => ipcRenderer.invoke('conn:check'),
    set: (mode) => ipcRenderer.invoke('conn:set', { mode }),
    onState: (cb) => {
      const listener = (_e, state) => cb(state);
      ipcRenderer.on('conn:state', listener);
      return () => ipcRenderer.removeListener('conn:state', listener);
    },
  },
  // — Benchmarks (local workloads; measuring is free, history is local) —
  bench: {
    runTest: (test, durationMs) => ipcRenderer.invoke('bench:run-test', { test, durationMs }),
    history: () => ipcRenderer.invoke('bench:history'),
    save: (run) => ipcRenderer.invoke('bench:save', { run }),
  },
  // — Game profiles (bundles + auto-apply; tier enforced at apply time) —
  profiles: {
    list: () => ipcRenderer.invoke('profiles:list'),
    apply: (id) => ipcRenderer.invoke('profiles:apply', { id }),
    revert: (id) => ipcRenderer.invoke('profiles:revert', { id }),
    create: (profile) => ipcRenderer.invoke('profiles:create', { profile }),
    remove: (id) => ipcRenderer.invoke('profiles:delete', { id }),
    exportJson: (id) => ipcRenderer.invoke('profiles:export', { id }),
    importJson: (data) => ipcRenderer.invoke('profiles:import', { data }),
    encode: (id) => ipcRenderer.invoke('profiles:encode', { id }),
    decode: (code) => ipcRenderer.invoke('profiles:decode', { code }),
    setAuto: (id, enabled) => ipcRenderer.invoke('profiles:set-auto', { id, enabled }),
  },
  // — Potato Graphics profiles (Pro-gated in main; list/detect/launch-args
  //   are informational and visible to everyone) —
  potato: {
    list: () => ipcRenderer.invoke('potato:list'),
    detect: () => ipcRenderer.invoke('potato:detect'),
    apply: (game, resolution) => ipcRenderer.invoke('potato:apply', { game, resolution }),
    launchArgs: (game) => ipcRenderer.invoke('potato:launch-args', { game }),
  },
  //   get/set/toggle/reset go through main (Pro-gated there); onUpdate
  //   subscribes to live pushes for the overlay + the tab preview.
  crosshair: {
    get: () => ipcRenderer.invoke('crosshair:get'),
    set: (patch) => ipcRenderer.invoke('crosshair:set', patch || {}),
    toggle: (enabled) => ipcRenderer.invoke('crosshair:toggle', { enabled }),
    reset: () => ipcRenderer.invoke('crosshair:reset'),
    setMovable: (movable) => ipcRenderer.invoke('crosshair:set-movable', { movable: !!movable }),
    nudge: (dx, dy) => ipcRenderer.invoke('crosshair:nudge', { dx, dy }),
    addLayer: (shape) => ipcRenderer.invoke('crosshair:add-layer', { shape }),
    removeLayer: (id) => ipcRenderer.invoke('crosshair:remove-layer', { id }),
    save: (name) => ipcRenderer.invoke('crosshair:save', { name }),
    deleteSaved: (index) => ipcRenderer.invoke('crosshair:delete-saved', { index }),
    loadSaved: (index) => ipcRenderer.invoke('crosshair:load-saved', { index }),
    onUpdate: (cb) => {
      const listener = (_e, cfg) => cb(cfg);
      ipcRenderer.on('crosshair:update', listener);
      return () => ipcRenderer.removeListener('crosshair:update', listener);
    },
    // One-way notices from main (e.g. Pro-gate feedback for the global
    // recenter hotkey, which has no IPC return path for a toast).
    onNotice: (cb) => {
      const listener = (_e, msg) => cb(msg);
      ipcRenderer.on('crosshair:notice', listener);
      return () => ipcRenderer.removeListener('crosshair:notice', listener);
    },
  },

  // — Accounts (device-local, see core/users.js). Identity is email-based;
  //   login takes { email, password, remember }, signup takes
  //   { displayName, email, password, referralCode, remember }. —
  auth: {
    signup: (data) => ipcRenderer.invoke('auth:signup', data || {}),
    login: (email, password, remember) => ipcRenderer.invoke('auth:login', { email, password, remember }),
    logout: () => ipcRenderer.invoke('auth:logout'),
    session: () => ipcRenderer.invoke('auth:session'),
    list: () => ipcRenderer.invoke('auth:list'),
    setRole: (username, role) => ipcRenderer.invoke('auth:set-role', { username, role }),
    resetPassword: (username, newPassword) => ipcRenderer.invoke('auth:reset-password', { username, newPassword }),
    deleteUser: (username) => ipcRenderer.invoke('auth:delete-user', { username }),
    changePassword: (oldPassword, newPassword) => ipcRenderer.invoke('auth:change-password', { oldPassword, newPassword }),
  },

  // — Owner-panel passphrase (second lock past login; owner role only) —
  owner: {
    hasPassphrase: () => ipcRenderer.invoke('owner:has-passphrase'),
    setPassphrase: (passphrase) => ipcRenderer.invoke('owner:set-passphrase', { passphrase }),
    verifyPassphrase: (passphrase) => ipcRenderer.invoke('owner:verify-passphrase', { passphrase }),
  },
});
