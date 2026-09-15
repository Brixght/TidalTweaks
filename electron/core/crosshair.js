'use strict';
/* ============================================================================
 * core/crosshair.js — transparent always-on-top crosshair overlay manager.
 * ----------------------------------------------------------------------------
 * Owns the overlay BrowserWindow lifecycle + the persisted crosshair config.
 * The overlay is a SEPARATE fullscreen window:
 *   • transparent: true, frame: false — no chrome, see-through background
 *   • alwaysOnTop: true ('screen-saver' level) — floats above borderless games
 *   • click-through by default (setIgnoreMouseEvents true) so game input
 *     passes straight through; holding Alt temporarily makes it movable so
 *     the user can Alt+drag the crosshair to a new spot.
 *   • skipTaskbar / focusable:false — never steals game focus, no taskbar icon
 *
 * Config lives in electron-store under the `crosshair` key (last used design)
 * plus `crosshairSaved` (Pro custom designs). Every mutation saves + pushes
 * to the overlay via webContents.send('crosshair:update').
 *
 * Free tier: single layer, presets classic/dot/cross, any color, on/off.
 * Pro tier (tier >= 2, enforced in main.js IPC): multi-layer, full shape
 * library, size/position/opacity sliders, save-custom.
 * ========================================================================== */

let overlay = null;
let deps = null; // { BrowserWindow, screen, store, sendToMain }

const RESET_HOTKEY = 'CommandOrControl+Alt+Shift+R';
const MAX_LAYERS = 5;

/* Free presets + Pro shape library. ids are allow-listed everywhere. */
const FREE_SHAPES = ['classic', 'dot', 'cross'];
const PRO_SHAPES = ['t-shape', 'complex', 'ring', 'double', 'plus-dot'];
const ALL_SHAPES = [...FREE_SHAPES, ...PRO_SHAPES];

const DEFAULT_COLORS = [
  '#22FF88', '#22D3EE', '#F0F', '#FFD21F',
  '#FF4D4D', '#FFFFFF', '#111827', '#9D7BFF',
];

function defaultLayer(shape, color) {
  return {
    id: `layer-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
    shape: ALL_SHAPES.includes(shape) ? shape : 'classic',
    size: 22,
    thickness: 3,
    opacity: 1,
    x: 0, // offset px from screen center (0,0 = dead center)
    y: 0,
    visible: true,
  };
}

function defaultConfig() {
  return {
    enabled: false,
    preset: 'classic',
    color: '#22FF88',
    // Single-layer equivalent of preset+color (Free). Pro appends layers.
    layers: [{ ...defaultLayer('classic', '#22FF88'), id: 'layer-1' }],
    // Global fine-tuning (Pro sliders). Kept separate so Free stays simple.
    size: 22,
    thickness: 3,
    opacity: 1,
    x: 0,
    y: 0,
  };
}

/* ------------------------- validation / sanitizing ------------------------ */
function clamp(n, lo, hi, fallback) {
  n = Number(n);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}
function isHexColor(s) {
  return typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s);
}
function sanitizeLayer(raw) {
  const d = defaultLayer('classic');
  if (!raw || typeof raw !== 'object') return d;
  return {
    id: String(raw.id || d.id).slice(0, 64),
    shape: ALL_SHAPES.includes(raw.shape) ? raw.shape : 'classic',
    size: clamp(raw.size, 4, 120, 22),
    thickness: clamp(raw.thickness, 1, 12, 3),
    opacity: clamp(raw.opacity, 0.1, 1, 1),
    x: clamp(raw.x, -2000, 2000, 0),
    y: clamp(raw.y, -2000, 2000, 0),
    visible: raw.visible !== false,
  };
}
function sanitizeConfig(raw) {
  const d = defaultConfig();
  if (!raw || typeof raw !== 'object') return d;
  const layers = Array.isArray(raw.layers) && raw.layers.length
    ? raw.layers.slice(0, MAX_LAYERS).map(sanitizeLayer)
    : [{ ...defaultLayer(FREE_SHAPES.includes(raw.preset) ? raw.preset : 'classic'), id: 'layer-1' }];
  return {
    enabled: !!raw.enabled,
    preset: ALL_SHAPES.includes(raw.preset) ? raw.preset : 'classic',
    color: isHexColor(raw.color) ? raw.color : d.color,
    layers,
    size: clamp(raw.size, 4, 120, 22),
    thickness: clamp(raw.thickness, 1, 12, 3),
    opacity: clamp(raw.opacity, 0.1, 1, 1),
    x: clamp(raw.x, -2000, 2000, 0),
    y: clamp(raw.y, -2000, 2000, 0),
  };
}
function sanitizeSaved(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((s) => s && typeof s === 'object')
    .slice(0, 20)
    .map((s) => ({
      name: String(s.name || 'Custom').slice(0, 40),
      at: String(s.at || new Date().toISOString()).slice(0, 32),
      config: sanitizeConfig(s.config),
    }));
}

/* ------------------------------- persistence ------------------------------ */
function getStore() {
  return deps && deps.store ? deps.store : null;
}
function getConfig() {
  try {
    const store = getStore();
    if (!store) return defaultConfig();
    return sanitizeConfig(store.get('crosshair'));
  } catch { return defaultConfig(); }
}
function getSaved() {
  try {
    const store = getStore();
    if (!store) return [];
    return sanitizeSaved(store.get('crosshairSaved'));
  } catch { return []; }
}
function pushToOverlay(cfg) {
  try {
    if (overlay && !overlay.isDestroyed()) {
      overlay.webContents.send('crosshair:update', cfg);
    }
  } catch { /* overlay is cosmetic; stored config is source of truth */ }
}
function pushToMain(cfg) {
  try {
    const main = deps && typeof deps.getMainWindow === 'function' ? deps.getMainWindow() : null;
    if (main && !main.isDestroyed()) main.webContents.send('crosshair:update', cfg);
  } catch { /* main may be closed */ }
}
function persist(cfg) {
  try {
    const store = getStore();
    if (store) {
      store.set('crosshair', cfg);
      // Back-compat mirror: settings:get/set also expose `crosshair`.
    }
  } catch { /* never throw from persistence */ }
  pushToOverlay(cfg);
  pushToMain(cfg);
  return cfg;
}

/* ------------------------------- overlay window --------------------------- */
function init(options) {
  // Called once from main.js: init({ BrowserWindow, screen, store, getMainWindow })
  deps = options || {};
  return { ok: true };
}

function primarySize() {
  try {
    const { screen } = deps || {};
    if (screen) {
      const d = screen.getPrimaryDisplay();
      const s = (d && d.size) || { width: 1920, height: 1080 };
      const scale = (d && d.scaleFactor) || 1;
      return { width: s.width, height: s.height, scale };
    }
  } catch { /* fall through */ }
  return { width: 1920, height: 1080, scale: 1 };
}

function ensureWindow() {
  if (overlay && !overlay.isDestroyed()) return overlay;
  if (!deps || !deps.BrowserWindow) return null;
  const { BrowserWindow } = deps;
  const { width, height } = primarySize();
  const path = require('node:path');

  overlay = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    movable: false, // we move the DRAWING (x/y), not the window (fullscreen)
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false, // never steal game focus
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Stay above (borderless/windowed) games. 'screen-saver' beats most overlays.
  try { overlay.setAlwaysOnTop(true, 'screen-saver'); } catch { /* ignore */ }
  try { overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); } catch { /* ignore */ }
  // Click-through: game clicks pass straight through to the game.
  try { overlay.setIgnoreMouseEvents(true, { forward: true }); } catch { /* ignore */ }
  try { overlay.setFullScreenable(false); } catch { /* ignore */ }

  overlay.loadFile(path.join(__dirname, '..', 'renderer', 'crosshair-overlay.html'));
  // Never navigate away / never open popups from the overlay.
  try {
    overlay.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  } catch { /* ignore */ }

  // Push current config once the page is ready.
  overlay.webContents.once('did-finish-load', () => pushToOverlay(getConfig()));

  overlay.on('closed', () => { overlay = null; });
  syncVisibility();
  return overlay;
}

/* Show/hide follows config.enabled — game overlay only exists when ON. */
function syncVisibility() {
  try {
    if (!overlay || overlay.isDestroyed()) return;
    const cfg = getConfig();
    if (cfg.enabled) {
      if (!overlay.isVisible()) overlay.showInactive();
      try { overlay.setAlwaysOnTop(true, 'screen-saver'); } catch { /* ignore */ }
    } else if (overlay.isVisible()) {
      overlay.hide();
    }
  } catch { /* ignore */ }
}

function setConfig(patch) {
  const cur = getConfig();
  const next = sanitizeConfig({ ...cur, ...(patch || {}) });
  // Keep preset+color in sync with layer[0] for the Free single-layer model.
  persist(next);
  syncVisibility();
  return { ok: true, config: next };
}

function setLayers(layers) {
  const cur = getConfig();
  const clean = (Array.isArray(layers) ? layers : []).slice(0, MAX_LAYERS).map(sanitizeLayer);
  if (!clean.length) return { ok: false, message: 'Keep at least one layer.' };
  return setConfig({ layers: clean });
}

function toggle(enabled) {
  const cur = getConfig();
  const next = typeof enabled === 'boolean' ? enabled : !cur.enabled;
  return setConfig({ enabled: next });
}

/* Ctrl+Alt+Shift+R: snap crosshair (global + all layers) back to dead center
 * of the PRIMARY screen. Window itself stays fullscreen; drawing recenters. */
function resetToCenter() {
  const cur = getConfig();
  const layers = cur.layers.map((l) => ({ ...l, x: 0, y: 0 }));
  const res = setConfig({ x: 0, y: 0, layers });
  // Re-assert fullscreen geometry in case the display layout changed.
  try {
    if (overlay && !overlay.isDestroyed()) {
      const { width, height } = primarySize();
      overlay.setBounds({ x: 0, y: 0, width, height });
    }
  } catch { /* best effort */ }
  return res;
}

/* Alt held → movable (overlay accepts mouse for Alt+drag).
 * Alt released → click-through again. Called from overlay key handlers
 * AND from the global Alt poller fallback in main.js. */
function setMovable(movable) {
  try {
    ensureWindow();
    if (overlay && !overlay.isDestroyed()) {
      overlay.setIgnoreMouseEvents(!movable, { forward: true });
    }
    return { ok: true, movable: !!movable };
  } catch (err) {
    return { ok: false, message: String((err && err.message) || err) };
  }
}

/* Nudge the crosshair drawing (used by Alt+drag deltas from the overlay). */
function nudge(dx, dy) {
  const cur = getConfig();
  const nx = clamp(cur.x + (Number(dx) || 0), -2000, 2000, cur.x);
  const ny = clamp(cur.y + (Number(dy) || 0), -2000, 2000, cur.y);
  return setConfig({ x: nx, y: ny });
}

function destroy() {
  try {
    if (overlay && !overlay.isDestroyed()) overlay.destroy();
  } catch { /* ignore */ }
  overlay = null;
}

module.exports = {
  RESET_HOTKEY,
  FREE_SHAPES,
  PRO_SHAPES,
  ALL_SHAPES,
  DEFAULT_COLORS,
  MAX_LAYERS,
  init,
  ensureWindow,
  getConfig,
  getSaved,
  setConfig,
  setLayers,
  toggle,
  resetToCenter,
  setMovable,
  nudge,
  syncVisibility,
  destroy,
  defaultConfig,
  sanitizeConfig,
};
