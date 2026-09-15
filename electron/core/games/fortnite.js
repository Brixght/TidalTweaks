'use strict';
/* ============================================================================
 * core/games/fortnite.js — Potato Graphics profile for Fortnite.
 * ----------------------------------------------------------------------------
 * Edits %localappdata%\FortniteGame\Saved\Config\WindowsClient\
 * GameUserSettings.ini (Performance-Mode-style lows). Safety:
 *   • timestamped backup of the .ini next to the original before touching it
 *   • honors the read-only flag: temporarily clears it to write, then
 *     re-applies it (standard for these tweaks — stops the game client
 *     overwriting your lows on launch)
 *   • returns a { kind:'file' } revert descriptor so Restore → Undo works
 *   • never throws — all failures come back as { ok:false, message }
 * Launch args (-DX11 …) are applied to local Fortnite shortcuts when found;
 * otherwise the result carries copy-paste steps for the Epic Games Launcher.
 * ========================================================================== */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runPS } = require('../exec');
const { setKeys } = require('./ini');

const GAME = {
  id: 'fortnite',
  name: 'Fortnite',
  desc: 'Low-graphics competitive profile',
  icon: '🎯',
  settings: [
    { label: 'VSync off', badge: 'safe' },
    { label: 'Grass off (FPS boost)', badge: 'safe' },
    { label: 'FPS counter on', badge: 'safe' },
    { label: 'Motion blur off', badge: 'safe' },
    { label: 'Mouse acceleration off', badge: 'safe' },
    { label: 'Resolution 1280x720', badge: 'caution' },
    { label: 'Unlimited framerate', badge: 'caution' },
    { label: 'Fullscreen', badge: 'safe' },
    { label: 'View distance lowest', badge: 'caution' },
    { label: 'Anti-aliasing off', badge: 'safe' },
    { label: 'Shadows off', badge: 'caution' },
    { label: 'Post-processing lowest', badge: 'safe' },
    { label: 'Textures lowest', badge: 'safe' },
    { label: 'Effects lowest', badge: 'safe' },
    { label: 'Foliage lowest', badge: 'caution' },
  ],
};

const ENGINE = '[/Script/Engine.GameUserSettings]';
const FORT = '[/Script/FortniteGame.FortGameUserSettings]';

/* [key, value, section] — Performance-Mode focus, 1280x720 default. */
function buildEntries(resolution) {
  const res = resolution === '900p'
    ? { w: '1600', h: '900' }
    : { w: '1280', h: '720' };
  return [
    { section: ENGINE, key: 'bUseVSync', value: 'False' },
    { section: ENGINE, key: 'DesiredScreenWidth', value: res.w },
    { section: ENGINE, key: 'DesiredScreenHeight', value: res.h },
    { section: ENGINE, key: 'FrameRateLimit', value: '0' },
    { section: ENGINE, key: 'FullscreenMode', value: '0' },
    { section: FORT, key: 'bShowGrass', value: 'False' },
    { section: FORT, key: 'bShowFPS', value: 'True' },
    { section: FORT, key: 'bMotionBlur', value: 'False' },
    { section: FORT, key: 'bDisableMouseAcceleration', value: 'True' },
    { section: FORT, key: 'sg.ViewDistanceQuality', value: '0' },
    { section: FORT, key: 'sg.AntiAliasingQuality', value: '0' },
    { section: FORT, key: 'sg.ShadowQuality', value: '0' },
    { section: FORT, key: 'sg.PostProcessQuality', value: '0' },
    { section: FORT, key: 'sg.TextureQuality', value: '0' },
    { section: FORT, key: 'sg.EffectsQuality', value: '0' },
    { section: FORT, key: 'sg.FoliageQuality', value: '0' },
  ];
}

const LAUNCH_ARGS = '-DX11 -USEALLAVAILABLECORES -NOSPLASH -LIMITCLIENTTICKS=120 -NoGlobalIllumination';
const LAUNCH_MANUAL =
  'Epic Games Launcher → Settings → Fortnite → check “Additional Command Line Arguments” → paste: ' + LAUNCH_ARGS;

function configPath() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(local, 'FortniteGame', 'Saved', 'Config', 'WindowsClient', 'GameUserSettings.ini');
}

function detect() {
  const p = configPath();
  return { found: fs.existsSync(p), path: p };
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}
function isWritable(p) {
  try { fs.accessSync(p, fs.constants.W_OK); return true; }
  catch { return false; }
}

/* Best-effort: append our flags to local Fortnite shortcuts (.lnk) via
 * WScript.Shell. Never fails the profile — falls back to manual steps. */
async function applyLaunchArgs() {
  const desks = [path.join(os.homedir(), 'Desktop'), 'C:\\Users\\Public\\Desktop'];
  const lnks = [];
  for (const d of desks) {
    try {
      for (const f of fs.readdirSync(d)) {
        if (/^fortnite.*\.lnk$/i.test(f)) lnks.push(path.join(d, f));
      }
    } catch { /* desktop unreadable — skip */ }
  }
  if (!lnks.length) return { applied: false, manual: LAUNCH_MANUAL };
  const flags = LAUNCH_ARGS.split(' ');
  const applied = [];
  for (const lnk of lnks) {
    const q = lnk.replace(/'/g, "''");
    const want = flags.map((f) => f.replace(/'/g, "''"));
    const ps =
      `$sh = New-Object -ComObject WScript.Shell; ` +
      `$l = $sh.CreateShortcut('${q}'); ` +
      `$cur = [string]$l.Arguments; ` +
      `$add = @('${want.join("','")}') | Where-Object { $cur -notlike \"*$_*\" }; ` +
      `if ($add.Count -gt 0) { $l.Arguments = ($cur + ' ' + ($add -join ' ')).Trim(); $l.Save(); Write-Output 'saved' } ` +
      `else { Write-Output 'already' }`;
    try {
      const r = await runPS(ps, 30000);
      if (r.code === 0) applied.push(lnk);
    } catch { /* one bad shortcut must not sink the rest */ }
  }
  if (!applied.length) return { applied: false, manual: LAUNCH_MANUAL };
  return { applied: true, shortcuts: applied, args: LAUNCH_ARGS };
}

async function apply(opts = {}) {
  const ini = configPath();
  if (!fs.existsSync(ini)) {
    return { ok: false, message: 'Fortnite config not found — launch Fortnite once so it generates GameUserSettings.ini, then retry.' };
  }
  let text;
  try { text = fs.readFileSync(ini, 'utf8'); }
  catch (e) { return { ok: false, message: 'Cannot read GameUserSettings.ini: ' + String(e) }; }

  // Timestamped backup BEFORE anything is touched.
  const backup = `${ini}.tidaltweaks-bak-${stamp()}`;
  try { fs.copyFileSync(ini, backup); }
  catch (e) { return { ok: false, message: 'Could not back up GameUserSettings.ini: ' + String(e) }; }

  // Read-only dance: clear to write, re-apply afterwards if it was set.
  const wasReadOnly = !isWritable(ini);
  if (wasReadOnly) {
    try { fs.chmodSync(ini, 0o666); }
    catch (e) { return { ok: false, message: 'Config is read-only and could not be unlocked: ' + String(e) }; }
  }

  const res = opts.resolution === '900p' ? '1600x900' : '1280x720';
  const { text: next, changed, added } = setKeys(text, buildEntries(opts.resolution));
  try {
    fs.writeFileSync(ini, next);
  } catch (e) {
    try { fs.copyFileSync(backup, ini); } catch { /* best effort */ }
    return { ok: false, message: 'Could not write GameUserSettings.ini. Backup kept.' };
  }
  let roNote = '';
  if (wasReadOnly) {
    try { fs.chmodSync(ini, 0o444); roNote = ' Read-only re-applied so the client keeps your lows.'; }
    catch { roNote = ' (Could not re-apply read-only — the client may overwrite these.)'; }
  }

  const launch = await applyLaunchArgs();
  const lines = [
    `Resolution ${res} · ${changed.length} updated, ${added.length} added (backup saved).${roNote}`,
  ];
  if (launch.applied) lines.push(`Launch args added to ${launch.shortcuts.length} shortcut(s): ${LAUNCH_ARGS}`);
  else lines.push('No Fortnite shortcut found — ' + launch.manual);

  return {
    ok: true,
    message: 'Potato Graphics applied for Fortnite. Restart your game to see the changes.',
    details: lines,
    revert: { kind: 'file', path: ini, backup },
  };
}

module.exports = { GAME, configPath, detect, apply, getLaunchArgs: () => LAUNCH_ARGS, applyLaunchArgs };
