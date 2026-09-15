'use strict';
/* ============================================================================
 * core/games/marvelrivals.js — Potato Graphics profile for Marvel Rivals.
 * ----------------------------------------------------------------------------
 * Edits %localappdata%\Marvel\Saved\Config\Windows\Scalability.ini
 * (all scalability groups to minimum + reduced resolution quality). Safety:
 *   • timestamped backup(s) before touching anything
 *   • bonus pass: if the sibling GameUserSettings.ini exists, resolution is
 *     set to 1280x720 there too (best-effort, backed up separately)
 *   • returns file revert descriptor(s) so Restore → Undo works
 *   • never throws — all failures come back as { ok:false, message }
 * ========================================================================== */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { setKeys } = require('./ini');

const GAME = {
  id: 'rivals',
  name: 'Marvel Rivals',
  desc: 'Low-graphics competitive profile',
  icon: '🦸',
  settings: [
    { label: 'Resolution quality 70%', badge: 'caution' },
    { label: 'Shadows lowest', badge: 'caution' },
    { label: 'View distance lowest', badge: 'caution' },
    { label: 'Foliage lowest', badge: 'caution' },
    { label: 'Anti-aliasing lowest', badge: 'safe' },
    { label: 'Post-processing lowest', badge: 'safe' },
    { label: 'Textures lowest', badge: 'safe' },
    { label: 'Effects lowest', badge: 'safe' },
    { label: 'Shading lowest', badge: 'safe' },
    { label: 'Resolution 1280x720', badge: 'caution' },
  ],
};

const SG = '[ScalabilityGroups]';
const ENGINE = '[/Script/Engine.GameUserSettings]';

function baseDir() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(local, 'Marvel', 'Saved', 'Config', 'Windows');
}
function configPath() {
  return path.join(baseDir(), 'Scalability.ini');
}
function userSettingsPath() {
  return path.join(baseDir(), 'GameUserSettings.ini');
}

function detect() {
  const p = configPath();
  return { found: fs.existsSync(p), path: p };
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

async function apply() {
  const ini = configPath();
  if (!fs.existsSync(ini)) {
    return { ok: false, message: 'Marvel Rivals config not found — launch the game once so it generates Scalability.ini, then retry.' };
  }
  let text;
  try { text = fs.readFileSync(ini, 'utf8'); }
  catch (e) { return { ok: false, message: 'Cannot read Scalability.ini: ' + String(e) }; }

  const backup = `${ini}.tidaltweaks-bak-${stamp()}`;
  try { fs.copyFileSync(ini, backup); }
  catch (e) { return { ok: false, message: 'Could not back up Scalability.ini: ' + String(e) }; }

  const entries = [
    { section: SG, key: 'sg.ResolutionQuality', value: '70' },
    { section: SG, key: 'sg.ViewDistanceQuality', value: '0' },
    { section: SG, key: 'sg.AntiAliasingQuality', value: '0' },
    { section: SG, key: 'sg.ShadowQuality', value: '0' },
    { section: SG, key: 'sg.PostProcessQuality', value: '0' },
    { section: SG, key: 'sg.TextureQuality', value: '0' },
    { section: SG, key: 'sg.EffectsQuality', value: '0' },
    { section: SG, key: 'sg.FoliageQuality', value: '0' },
    { section: SG, key: 'sg.ShadingQuality', value: '0' },
  ];
  const { text: next, changed, added } = setKeys(text, entries);
  try {
    fs.writeFileSync(ini, next);
  } catch (e) {
    try { fs.copyFileSync(backup, ini); } catch { /* best effort */ }
    return { ok: false, message: 'Could not write Scalability.ini. Backup kept.' };
  }

  const reverts = [{ kind: 'file', path: ini, backup }];
  const lines = [`Scalability groups to minimum · ${changed.length} updated, ${added.length} added (backup saved).`];

  // Bonus pass: pin 1280x720 in the sibling GameUserSettings.ini if present.
  const gs = userSettingsPath();
  if (fs.existsSync(gs)) {
    try {
      const gsText = fs.readFileSync(gs, 'utf8');
      const gsBackup = `${gs}.tidaltweaks-bak-${stamp()}`;
      fs.copyFileSync(gs, gsBackup);
      const r = setKeys(gsText, [
        { section: ENGINE, key: 'DesiredScreenWidth', value: '1280' },
        { section: ENGINE, key: 'DesiredScreenHeight', value: '720' },
      ]);
      fs.writeFileSync(gs, r.text);
      reverts.push({ kind: 'file', path: gs, backup: gsBackup });
      lines.push('Resolution pinned to 1280x720 in GameUserSettings.ini (backed up).');
    } catch (e) {
      lines.push('Resolution pin skipped: ' + String(e).slice(0, 120));
    }
  }

  return {
    ok: true,
    message: 'Potato Graphics applied for Marvel Rivals. Restart your game to see the changes.',
    details: lines,
    revert: reverts,
  };
}

module.exports = { GAME, configPath, detect, apply };
