'use strict';
/* ============================================================================
 * core/profiles.js — per-game optimization profiles (tweak bundles + runtime
 * extras). Prebuilt profiles use FREE-safe tweak ids only, so every one of
 * the 12 applies on a Free account; the extras (HAGS, Ultimate power plan,
 * crosshair sync, Potato auto-apply) engage when the tier allows and are
 * otherwise skipped with a note — never a failure. Custom profiles may mix
 * any tier and are whole-gated like preset stacks.
 *
 * Share codes are SELF-CONTAINED (no server, no registry): zlib-deflated
 * JSON → base64url with a sha check, prefixed TT1P-. Paste decodes to the
 * exact profile locally. (The 12-char TT-XXXX format needs a hosted code
 * registry, which this offline app deliberately has no backend for.)
 *
 * Custom profiles: <userData>/profiles/custom.json (strict shape validation;
 * unknown tweak ids are rejected at import, never silently stored).
 * NEVER throws — all entries return { ok, ... }.
 * ========================================================================== */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { runCmd, runPS } = require('./exec');

const CATEGORIES = ['FPS', 'Battle Royale', 'Sandbox', 'Racing', 'MOBA', 'Custom'];
const SHARE_PREFIX = 'TT1P-';

/* Process priority for RUNNING game processes (Windows resets it on exit,
 * so this is transient by nature — no undo entry needed). */
async function setPriority(processNames, level) {
  const cls = level === 'above-normal' ? 'AboveNormal' : 'High';
  const names = [...new Set((processNames || []).map((n) => String(n).trim()))]
    .filter((n) => /^[\w\-. ]{1,60}\.exe$/i.test(n))
    .slice(0, 8);
  if (!names.length) return { ok: false, message: 'No valid process names.' };
  try {
    const stmts = names.map((n) => {
      const base = n.replace(/\.exe$/i, '').replace(/'/g, "''");
      return `$p=Get-Process -Name '${base}' -ErrorAction SilentlyContinue; if($p){$p|ForEach-Object{$_.PriorityClass=[System.Diagnostics.ProcessPriorityClass]::${cls}};Write-Output 'BOOSTED:${base}'}`;
    });
    const r = await runPS(stmts.join('; '), 60000);
    const hits = [...(r.stdout || '').matchAll(/BOOSTED:(.+)/g)].map((m) => m[1].trim());
    return {
      ok: true,
      message: hits.length ? `Priority → ${cls}: ${hits.join(', ')}.` : 'Game not running — priority applies on next launch via Auto-apply.',
      boosted: hits,
    };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Running-process snapshot (lowercased exe names) for auto-apply detection. */
async function listRunning() {
  try {
    const r = await runCmd('tasklist', ['/FO', 'CSV', '/NH'], 30000);
    if (r.code !== 0) return new Set();
    const set = new Set();
    for (const m of (r.stdout || '').matchAll(/"([^"]+\.exe)"/gi)) set.add(m[1].toLowerCase());
    return set;
  } catch { return new Set(); }
}

/* Free-safe tweak bundles per game (every id must exist in TWEAK_REGISTRY —
 * verified by the repo check script, never duplicated here). */
const PREBUILT = [
  {
    id: 'game-fortnite', name: 'Fortnite', category: 'Battle Royale', icon: '🏝️',
    processes: ['FortniteClient-Win64-Shipping.exe'],
    tweaks: ['game-bar-off', 'game-no-fs-optim', 'game-mode-win-on', 'game-mouse-raw', 'vis-no-sticky', 'vis-menu-delay', 'net-flush-dns'],
    priority: 'high', hags: true, power: 'ultimate',
    crosshair: { shape: 'dot', color: '#22FF88' },
    potato: 'fortnite',
    launchOptions: '-USEALLAVAILABLECORES -NOSPLASH -LIMITCLIENTTICKS=120',
  },
  {
    id: 'game-valorant', name: 'Valorant', category: 'FPS', icon: '🎯',
    processes: ['VALORANT-Win64-Shipping.exe'],
    tweaks: ['game-bar-off', 'game-no-fs-optim', 'game-mode-win-on', 'game-mouse-raw', 'game-keyboard-fast', 'vis-no-sticky', 'net-flush-dns'],
    priority: 'high', hags: true, power: 'ultimate',
    crosshair: { shape: 'cross', color: '#22D3EE' },
    potato: null,
    launchOptions: '-high -USEALLAVAILABLECORES',
  },
  {
    id: 'game-cs2', name: 'CS2', category: 'FPS', icon: '💣',
    processes: ['cs2.exe'],
    tweaks: ['game-bar-off', 'game-no-fs-optim', 'game-mode-win-on', 'game-mouse-raw', 'vis-no-sticky', 'net-flush-dns', 'net-qos-limit'],
    priority: 'high', hags: true, power: 'ultimate',
    crosshair: { shape: 'cross', color: '#22FF88' },
    potato: null,
    launchOptions: '-novid -high +fps_max 0',
  },
  {
    id: 'game-apex', name: 'Apex Legends', category: 'Battle Royale', icon: '🔻',
    processes: ['r5apex.exe'],
    tweaks: ['game-bar-off', 'game-no-fs-optim', 'game-mode-win-on', 'game-mouse-raw', 'vis-no-sticky', 'net-flush-dns'],
    priority: 'high', hags: true, power: 'ultimate',
    crosshair: { shape: 'dot', color: '#FFD21F' },
    potato: null,
    launchOptions: '-novid -high',
  },
  {
    id: 'game-cod', name: 'Call of Duty', category: 'Battle Royale', icon: '🪖',
    processes: ['cod.exe'],
    tweaks: ['game-bar-off', 'game-no-fs-optim', 'game-mode-win-on', 'game-mouse-raw', 'game-keyboard-fast', 'vis-no-sticky', 'net-flush-dns'],
    priority: 'high', hags: true, power: 'ultimate',
    crosshair: { shape: 'dot', color: '#FFFFFF' },
    potato: null,
    launchOptions: '-d3d11 -high',
  },
  {
    id: 'game-minecraft', name: 'Minecraft', category: 'Sandbox', icon: '⛏️',
    processes: ['javaw.exe', 'Minecraft.Windows.exe'],
    tweaks: ['game-bar-off', 'vis-no-sticky', 'vis-menu-delay', 'adv-no-tips'],
    priority: 'above-normal', hags: false, power: null,
    crosshair: null, potato: null,
    launchOptions: '-Xmx4G -Xms4G',
  },
  {
    id: 'game-roblox', name: 'Roblox', category: 'Sandbox', icon: '🧱',
    processes: ['RobloxPlayerBeta.exe'],
    tweaks: ['game-bar-off', 'game-no-fs-optim', 'game-mode-win-on', 'vis-no-sticky'],
    priority: 'high', hags: false, power: null,
    crosshair: null, potato: null,
    launchOptions: '',
  },
  {
    id: 'game-fivem', name: 'FiveM', category: 'Sandbox', icon: '🚗',
    processes: ['FiveM.exe', 'GTA5.exe'],
    tweaks: ['game-bar-off', 'game-no-fs-optim', 'game-mode-win-on', 'game-mouse-raw', 'vis-no-sticky', 'net-flush-dns'],
    priority: 'high', hags: false, power: 'ultimate',
    crosshair: { shape: 'dot', color: '#FF4DFF' },
    potato: null,
    launchOptions: '-high',
  },
  {
    id: 'game-gta5', name: 'GTA V', category: 'Sandbox', icon: '🌆',
    processes: ['GTA5.exe'],
    tweaks: ['game-bar-off', 'game-no-fs-optim', 'game-mode-win-on', 'vis-no-sticky', 'vis-menu-delay'],
    priority: 'high', hags: false, power: null,
    crosshair: null, potato: null,
    launchOptions: '-high -nomemrestrict -noprecache',
  },
  {
    id: 'game-rocket-league', name: 'Rocket League', category: 'Racing', icon: '🚀',
    processes: ['RocketLeague.exe'],
    tweaks: ['game-bar-off', 'game-no-fs-optim', 'game-mode-win-on', 'game-mouse-raw', 'vis-no-sticky'],
    priority: 'high', hags: false, power: null,
    crosshair: null, potato: null,
    launchOptions: '-high',
  },
  {
    id: 'game-lol', name: 'League of Legends', category: 'MOBA', icon: '⚔️',
    processes: ['League of Legends.exe'],
    tweaks: ['game-bar-off', 'game-mode-win-on', 'vis-no-sticky', 'vis-menu-delay'],
    priority: 'above-normal', hags: false, power: null,
    crosshair: null, potato: null,
    launchOptions: '-high',
  },
  {
    id: 'game-ow2', name: 'Overwatch 2', category: 'FPS', icon: '🍊',
    processes: ['Overwatch.exe'],
    tweaks: ['game-bar-off', 'game-no-fs-optim', 'game-mode-win-on', 'game-mouse-raw', 'vis-no-sticky', 'net-flush-dns'],
    priority: 'high', hags: true, power: 'ultimate',
    crosshair: { shape: 'cross', color: '#FB923C' },
    potato: null,
    launchOptions: '-high',
  },
];

/* ------------------------- custom store --------------------------------- */
function profilesDir() {
  try {
    const base = require('electron').app.getPath('userData');
    return path.join(base, 'profiles');
  } catch {
    return path.join(os.tmpdir(), 'tidaltweaks-profiles');
  }
}
function customFile() {
  return path.join(profilesDir(), 'custom.json');
}
function readCustom() {
  try {
    const raw = fs.readFileSync(customFile(), 'utf8');
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((p) => validateProfile(p).ok);
  } catch { return []; }
}
function writeCustom(arr) {
  fs.mkdirSync(profilesDir(), { recursive: true });
  fs.writeFileSync(customFile(), JSON.stringify(arr, null, 2));
}

/* Shape validation (tweak-id existence is checked in main.js, which owns
 * TWEAK_REGISTRY — core must stay registry-agnostic). */
function validateProfile(p) {
  if (!p || typeof p !== 'object') return { ok: false, message: 'Not a profile object.' };
  if (typeof p.id !== 'string' || !/^[a-z0-9-]{1,40}$/.test(p.id)) return { ok: false, message: 'Bad profile id.' };
  if (typeof p.name !== 'string' || p.name.trim().length < 2 || p.name.trim().length > 40) {
    return { ok: false, message: 'Name must be 2–40 characters.' };
  }
  if (!CATEGORIES.includes(p.category)) return { ok: false, message: `Category must be one of: ${CATEGORIES.join(', ')}.` };
  if (p.icon !== undefined && (typeof p.icon !== 'string' || [...p.icon].length > 4)) {
    return { ok: false, message: 'Icon must be a short emoji.' };
  }
  if (!Array.isArray(p.tweaks) || p.tweaks.length > 40 || p.tweaks.some((t) => typeof t !== 'string')) {
    return { ok: false, message: 'Tweaks must be an array of tweak ids (max 40).' };
  }
  if (p.processes !== undefined && (!Array.isArray(p.processes) || p.processes.length > 8 ||
      p.processes.some((n) => !/^[\w\-. ]{1,60}\.exe$/i.test(String(n))))) {
    return { ok: false, message: 'Bad process list.' };
  }
  if (p.priority !== undefined && p.priority !== null && !['high', 'above-normal'].includes(p.priority)) {
    return { ok: false, message: 'Priority must be high or above-normal.' };
  }
  if (p.power !== undefined && p.power !== null && p.power !== 'ultimate') {
    return { ok: false, message: 'Power must be ultimate or omitted.' };
  }
  if (p.launchOptions !== undefined && (typeof p.launchOptions !== 'string' || p.launchOptions.length > 300)) {
    return { ok: false, message: 'Launch options too long.' };
  }
  if (p.crosshair !== undefined && p.crosshair !== null && typeof p.crosshair !== 'object') {
    return { ok: false, message: 'Bad crosshair block.' };
  }
  if (p.potato !== undefined && p.potato !== null && typeof p.potato !== 'string') {
    return { ok: false, message: 'Bad potato preset.' };
  }
  return { ok: true };
}

/* ------------------------- share codes ---------------------------------- */
function sha8(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 8);
}
function encodeShare(profile) {
  try {
    const json = JSON.stringify(profile);
    const b64 = zlib.deflateSync(Buffer.from(json, 'utf8')).toString('base64url');
    return { ok: true, code: `${SHARE_PREFIX}${sha8(json)}-${b64}` };
  } catch (e) { return { ok: false, message: String(e) }; }
}
function decodeShare(code) {
  try {
    const clean = String(code || '').trim().replace(/\s+/g, '');
    if (!clean.startsWith(SHARE_PREFIX)) return { ok: false, message: 'Not a profile share code (TT1P-…).' };
    const rest = clean.slice(SHARE_PREFIX.length);
    const dash = rest.indexOf('-');
    if (dash < 0) return { ok: false, message: 'Bad share code shape.' };
    const sum = rest.slice(0, dash);
    const json = zlib.inflateSync(Buffer.from(rest.slice(dash + 1), 'base64url')).toString('utf8');
    if (sha8(json) !== sum.toLowerCase()) return { ok: false, message: 'Share code corrupted (checksum mismatch).' };
    const profile = JSON.parse(json);
    const v = validateProfile(profile);
    if (!v.ok) return { ok: false, message: 'Shared profile invalid: ' + v.message };
    return { ok: true, profile };
  } catch {
    return { ok: false, message: 'Could not decode that share code.' };
  }
}

module.exports = {
  CATEGORIES, SHARE_PREFIX, PREBUILT,
  setPriority, listRunning,
  readCustom, writeCustom, validateProfile,
  encodeShare, decodeShare,
};
