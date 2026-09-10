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
    history: () => ipcRenderer.invoke('restore:history'),
  },

  // — Activation (Cash App code → Cloudflare KV, see main.js for the flow) —
  license: {
    validate: (code) => ipcRenderer.invoke('license:validate', { code }),
    status: () => ipcRenderer.invoke('license:status'),
    deactivate: () => ipcRenderer.invoke('license:deactivate'),
    setApiUrl: (url) => ipcRenderer.invoke('license:set-api-url', { url }),
    setLite: (value) => ipcRenderer.invoke('license:set-lite', { value }),
  },

  // — Appearance (theme + accent, Settings → Appearance) —
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch || {}),
  },

  // — Accounts (device-local, see core/users.js). Passwords only travel at
  //   entry (signup/login/change); everything else passes usernames/roles. —
  auth: {
    signup: (username, password) => ipcRenderer.invoke('auth:signup', { username, password }),
    login: (username, password) => ipcRenderer.invoke('auth:login', { username, password }),
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
