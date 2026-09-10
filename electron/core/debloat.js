'use strict';
/* ============================================================================
 * core/debloat.js — Debloat & cleanup (Pro). AppX scan/remove for the current
 * user only (never -AllUsers removal), plus one-click removals.
 * ========================================================================== */
const { runCmd, runPS, regSetDword } = require('./exec');

// Friendly names for the curated safe-to-remove list (mirrors Python version).
const BLOAT = [
  ['BingNews', 'Bing News'], ['BingWeather', 'Bing Weather'],
  ['GetHelp', 'Get Help'], ['Getstarted', 'Tips / Get Started'],
  ['MicrosoftOfficeHub', 'Office Hub'], ['MicrosoftSolitaireCollection', 'Solitaire'],
  ['People', 'People'], ['SkypeApp', 'Skype'], ['Todos', 'To Do'],
  ['WindowsFeedbackHub', 'Feedback Hub'], ['Xbox.TCUI', 'Xbox TCUI'],
  ['XboxGameOverlay', 'Xbox Game Overlay'], ['XboxGamingOverlay', 'Xbox Gaming Overlay'],
  ['YourPhone', 'Phone Link'], ['ZuneMusic', 'Groove Music'], ['ZuneVideo', 'Movies & TV'],
  ['SpotifyMusic', 'Spotify (preinstalled)'], ['Disney', 'Disney+'],
  ['king.com.', 'Candy Crush & co.'], ['TikTok', 'TikTok'],
  ['Clipchamp', 'Clipchamp'], ['MicrosoftTeams', 'Teams (personal)'],
];

async function scanInstalled() {
  try {
    const r = await runPS('Get-AppxPackage | Select-Object -ExpandProperty Name', 60000);
    if (r.code !== 0) return { ok: false, message: 'Get-AppxPackage failed.' };
    const installed = new Set(r.stdout.split('\n').map((l) => l.trim()).filter(Boolean));
    const found = [];
    for (const [pattern, friendly] of BLOAT) {
      const core = pattern.replace(/\*/g, '').replace(/^\.+|\.+$/g, '');
      for (const name of installed) {
        if (name.toLowerCase().includes(core.toLowerCase())) {
          found.push({ package: name, friendly });
        }
      }
    }
    const seen = new Set();
    const deduped = found.filter((f) => !seen.has(f.package) && seen.add(f.package));
    deduped.sort((a, b) => a.friendly.localeCompare(b.friendly));
    return { ok: true, apps: deduped };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Remove ONLY the packages the user checked (current user, -AllUsers untouched). */
async function removePackages(packages) {
  const list = (packages || []).map((p) => String(p).replace(/'/g, "''")).filter(Boolean);
  if (!list.length) return { ok: false, message: 'No apps selected.' };
  try {
    const stmts = list.map((p) => `Get-AppxPackage -Name '${p}' | Remove-AppxPackage -ErrorAction SilentlyContinue`);
    const r = await runPS(stmts.join('; '), 180000);
    if (r.code !== 0 && (r.stderr || '').trim()) {
      return { ok: false, message: r.stderr.trim().slice(0, 300) };
    }
    return { ok: true, message: `Removed ${list.length} app(s). Leftover tiles vanish after reboot.` };
  } catch (e) { return { ok: false, message: String(e) }; }
}

async function removeOneDrive() {
  try {
    const r = await runCmd('winget', ['uninstall', '--id', 'Microsoft.OneDrive', '-e', '--silent', '--accept-source-agreements'], 180000);
    const out = (r.stdout + r.stderr).toLowerCase();
    if (r.code === 0 || out.includes('successfully uninstalled') || out.includes('no installed package found')) {
      return { ok: true, message: 'OneDrive client removed (files stay in the cloud).' };
    }
    return { ok: false, message: 'winget could not remove OneDrive: ' + (r.stdout + r.stderr).trim().slice(0, 200) };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Edge lives under a versioned folder; locate its setup.exe dynamically. */
async function removeEdge() {
  try {
    const find = await runPS('$d=Get-ChildItem "$env:ProgramFiles(x86)\\Microsoft\\Edge\\Application" -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1; if($d){$s=Join-Path $d.FullName "Installer\\setup.exe"; if(Test-Path $s){$s}}', 30000);
    const setup = (find.stdout || '').trim().split('\n').pop().trim();
    if (!setup || !/setup\.exe$/i.test(setup)) return { ok: false, message: 'Edge installer not found.' };
    const r = await runCmd(setup, ['--uninstall', '--system-level', '--force-uninstall'], 180000);
    if (r.code !== 0) return { ok: false, message: 'Edge uninstaller exited with an error (admin?).' };
    return { ok: true, message: 'Edge removed. (WebView runtime stays — Windows needs it.)' };
  } catch (e) { return { ok: false, message: String(e) }; }
}

async function disableVisualEffects() {
  try {
    const r = await regSetDword('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects', 'VisualFXSetting', 2);
    return r.ok
      ? { ok: true, message: 'Visual effects → Best performance.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

async function disableHibernation() {
  try {
    const r = await runCmd('powercfg', ['-h', 'off'], 60000);
    if (r.code !== 0) return { ok: false, message: 'powercfg -h off failed (admin?)' };
    return { ok: true, message: 'Hibernation off — hiberfil.sys removed.', revert: { kind: 'hibernate', prevOn: true } };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Launch the built-in Disk Cleanup engine (sagerun:1 profile). It shows its
 * own progress UI and can take minutes — we don't block on completion. */
async function runDiskCleanup() {
  try {
    runCmd('cleanmgr', ['/sagerun:1'], 10000); // fire-and-forget by design
    return { ok: true, message: 'Disk Cleanup launched — follow its progress window.', revert: { kind: 'none' } };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Chrome background mode off (enterprise policy key): the browser fully
 * exits instead of idling in the tray. Takes effect for Chrome installs. */
async function chromeBackgroundOff() {
  try {
    const r = await regSetDword('HKLM', 'SOFTWARE\\Policies\\Google\\Chrome', 'BackgroundModeEnabled', 0);
    return r.ok
      ? { ok: true, message: 'Chrome background mode disabled.', revert: r.revert }
      : { ok: false, message: r.message };
  } catch (e) { return { ok: false, message: String(e) }; }
}

module.exports = {
  scanInstalled, removePackages, removeOneDrive, removeEdge,
  disableVisualEffects, disableHibernation, runDiskCleanup, chromeBackgroundOff,
};
