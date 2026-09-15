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
 *   • pushes live: every mutation broadcasts 'crosshair:update' to the
 *     overlay AND the main window, so the overlay redraws in real time.
 *
 * Config lives in electron-store under the `crosshair` key (last used design)
 * plus `crosshairSaved` (Pro custom designs — array of {name, at, config}).
 *
 * Layer model (v2): { id, shape, color, length, thickness, gap,
 *   outline: { enabled, thickness, color }, centerDot: { enabled }, visible }
 * Shapes: cross, dot-plus, dot, t, x, ring — ALL Free. Everything else
 * (layers, sizes, outline, dot, position, saving) is Pro-gated in main.js.
 * ========================================================================== */

let overlay = null;
let deps = null; // { BrowserWindow, screen, store, getMainWindow }

const RESET_HOTKEY = 'CommandOrControl+Alt+Shift+R';
const MAX_LAYERS = 5;
const MAX_SAVED = 20;

/* Shape library — all six are Free (Pro gates layers/sizes, not shapes). */
const ALL_SHAPES = ['cross', 'dot-plus', 'dot', 't', 'x', 'ring'];
const FREE_SHAPES = [...ALL_SHAPES];
const SHAPE_LABEL = {
  cross: 'cross', 'dot-plus': 'dot+', dot: 'dot', t: 't', x: 'x', ring: 'ring',
};

const DEFAULT_COLORS = [
  '#22FF88', '#22D3EE', '#FF4DFF', '#FFD21F',
  '#FF4D4D', '#FFFFFF', '#111827', '#8B5CF6',
];

/* v1 → v2 shape migration (old preset names from 2.4.2 configs). */
const LEGACY_SHAPE = {
  classic: 'cross', dot: 'dot', cross: 'x',
  't-shape': 't', complex: 'cross', ring: 'ring',
  double: 'ring', 'plus-dot': 'dot-plus',
};
function mapShape(s) {
  s = String(s || 'cross');
  if (ALL_SHAPES.includes(s)) return s;
  return LEGACY_SHAPE[s] || 'cross';
}

function defaultOutline() {
  return { enabled: false, thickness: 1, color: '#000000' };
}
function defaultCenterDot() {
  return { enabled: false };
}

function defaultLayer(shape, color) {
  return {
    id: `layer-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
    shape: mapShape(shape),
    color: isHexColor(color) ? color : '#22FF88',
    length: 10,
    thickness: 2,
    gap: 4,
    outline: defaultOutline(),
    centerDot: defaultCenterDot(),
    visible: true,
  };
}

function defaultConfig() {
  return {
    enabled: false,
    layers: [{ ...defaultLayer('cross', '#22FF88'), id: 'layer-1' }],
    x: 0, // global position offset px from screen center (Position section)
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
function sanitizeOutline(raw) {
  const d = defaultOutline();
  if (!raw || typeof raw !== 'object') return d;
  return {
    enabled: !!raw.enabled,
    thickness: clamp(raw.thickness, 1, 6, 1),
    color: isHexColor(raw.color) ? raw.color : d.color,
  };
}
function sanitizeLayer(raw, fallbackColor) {
  if (!raw || typeof raw !== 'object') return defaultLayer('cross', fallbackColor);
  // v1 migration: size → length, preset → shape, top-level color fallback.
  const legacyLen = raw.size !== undefined ? raw.size : raw.length;
  return {
    id: String(raw.id || `layer-${Date.now().toString(36)}`).slice(0, 64),
    shape: mapShape(raw.shape || raw.preset),
    color: isHexColor(raw.color) ? raw.color : (isHexColor(fallbackColor) ? fallbackColor : '#22FF88'),
    length: clamp(legacyLen, 2, 60, 10),
    thickness: clamp(raw.thickness, 1, 12, 2),
    gap: clamp(raw.gap, 0, 24, 4),
    outline: sanitizeOutline(raw.outline),
    centerDot: { enabled: !!(raw.centerDot && raw.centerDot.enabled) },
    visible: raw.visible !== false,
  };
}
function sanitizeConfig(raw) {
  const d = defaultConfig();
  if (!raw || typeof raw !== 'object') return d;
  const fallbackColor = isHexColor(raw.color) ? raw.color : '#22FF88';
  let layers = Array.isArray(raw.layers) && raw.layers.length
    ? raw.layers.slice(0, MAX_LAYERS).map((l) => sanitizeLayer(l, fallbackColor))
    : [{ ...defaultLayer(mapShape(raw.preset), fallbackColor), id: 'layer-1' }];
  if (!layers.length) layers = [{ ...defaultLayer('cross', fallbackColor), id: 'layer-1' }];
  return {
    enabled: !!raw.enabled,
    layers,
    x: clamp(raw.x, -2000, 2000, 0),
    y: clamp(raw.y, -2000, 2000, 0),
  };
}
function sanitizeSaved(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((s) => s && typeof s === 'object')
    .slice(0, MAX_SAVED)
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
/* One-way notice pipe (Pro-gate feedback for the global hotkey, which has
 * no IPC return path): the tab toasts it. */
function notifyMain(message) {
  try {
    const main = deps && typeof deps.getMainWindow === 'function' ? deps.getMainWindow() : null;
    if (main && !main.isDestroyed()) main.webContents.send('crosshair:notice', { message: String(message || '') });
  } catch { /* ignore */ }
}
function persist(cfg) {
  try {
    const store = getStore();
    if (store) store.set('crosshair', cfg);
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
      return { width: s.width, height: s.height };
    }
  } catch { /* fall through */ }
  return { width: 1920, height: 1080 };
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

  // Push current config once the page is ready (real-time thereafter).
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
  persist(next);
  syncVisibility();
  return { ok: true, config: next };
}

function toggle(enabled) {
  const cur = getConfig();
  const next = typeof enabled === 'boolean' ? enabled : !cur.enabled;
  return setConfig({ enabled: next });
}

/* Recenter: snap the whole crosshair back to the primary-screen center.
 * (Position section: "Moves the whole crosshair, not just this layer.") */
function resetToCenter() {
  const res = setConfig({ x: 0, y: 0 });
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
 * Alt released → click-through again. */
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

/* Nudge the whole crosshair drawing (Alt+drag deltas, arrow buttons). */
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
  ALL_SHAPES,
  FREE_SHAPES,
  SHAPE_LABEL,
  DEFAULT_COLORS,
  MAX_LAYERS,
  MAX_SAVED,
  init,
  ensureWindow,
  getConfig,
  getSaved,
  setConfig,
  toggle,
  resetToCenter,
  setMovable,
  nudge,
  syncVisibility,
  notifyMain,
  destroy,
  defaultConfig,
  defaultLayer,
  sanitizeConfig,
};
