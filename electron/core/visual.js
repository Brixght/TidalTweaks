'use strict';
/* ============================================================================
 * core/visual.js — Visual & UI tweaks (Pro). All HKCU, all instant-feel,
 * all one reg write each. Safe: worst case the desktop looks plainer.
 * ========================================================================== */
const { regSetDword, regSetString } = require('./exec');

async function wrap(fn) {
  try { return await fn(); }
  catch (e) { return { ok: false, message: String(e) }; }
}

/* MenuShowDelay 400 → 0: menus appear instantly. */
const setMenuDelay0 = () => wrap(async () => {
  const r = await regSetString('HKCU', 'Control Panel\\Desktop', 'MenuShowDelay', '0');
  return r.ok ? { ok: true, message: 'Menus now appear instantly.', revert: r.revert } : r;
});

/* EnableAeroPeek=0: no taskbar-hover desktop preview. */
const disableAeroPeek = () => wrap(async () => {
  const r = await regSetDword('HKCU', 'Software\\Microsoft\\Windows\\DWM', 'EnableAeroPeek', 0);
  return r.ok ? { ok: true, message: 'Aero Peek disabled.', revert: r.revert } : r;
});

/* MinAnimate=0: windows snap instead of animating. */
const disableWindowAnimations = () => wrap(async () => {
  const r = await regSetString('HKCU', 'Control Panel\\Desktop\\WindowMetrics', 'MinAnimate', '0');
  return r.ok ? { ok: true, message: 'Window animations off.', revert: r.revert } : r;
});

/* EnableBlurBehind=0: flat surfaces, cheaper compositing. */
const disableBlur = () => wrap(async () => {
  const r = await regSetDword('HKCU', 'Software\\Microsoft\\Windows\\DWM', 'EnableBlurBehind', '0');
  return r.ok ? { ok: true, message: 'Blur effects off.', revert: r.revert } : r;
});

const setTransparencyOff = () => wrap(async () => {
  const r = await regSetDword('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', 'EnableTransparency', 0);
  return r.ok ? { ok: true, message: 'Transparency off.', revert: r.revert } : r;
});

const setTransparencyOn = () => wrap(async () => {
  const r = await regSetDword('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize', 'EnableTransparency', 1);
  return r.ok ? { ok: true, message: 'Transparency on.', revert: r.revert } : r;
});

/* HideFileExt=0: show .exe/.txt extensions (also anti-phishing). */
const showFileExtensions = () => wrap(async () => {
  const r = await regSetDword('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', 'HideFileExt', 0);
  return r.ok ? { ok: true, message: 'File extensions now visible.', revert: r.revert } : r;
});

/* Hidden=1: show hidden files/folders in Explorer. */
const showHiddenFiles = () => wrap(async () => {
  const r = await regSetDword('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', 'Hidden', 1);
  return r.ok ? { ok: true, message: 'Hidden files now visible.', revert: r.revert } : r;
});

/* StickyKeys flags=506: no 5×-Shift popup mid-game. */
const disableStickyKeys = () => wrap(async () => {
  const r = await regSetString('HKCU', 'Control Panel\\Accessibility\\StickyKeys', 'Flags', '506');
  return r.ok ? { ok: true, message: 'Sticky Keys popup disabled.', revert: r.revert } : r;
});

/* ToggleKeys Flags=58: silence the NumLock/CapsLock beep. */
const disableToggleKeysAudio = () => wrap(async () => {
  const r = await regSetString('HKCU', 'Control Panel\\Accessibility\\ToggleKeys', 'Flags', '58');
  return r.ok ? { ok: true, message: 'Toggle Keys beep disabled.', revert: r.revert } : r;
});

/* Classic Win10 right-click menu (Win11): write an empty default value under
 * the magic CLSID key. Needs reg /ve (default value) — hence custom code.
 * Undo deletes the whole CLSID key we created (parent included, so no empty
 * husk is left behind). If the subkey already exists we leave it untouched. */
const classicContextMenu = () => wrap(async () => {
  const { runCmd } = require('./exec');
  const root = 'HKCU';
  const parent = 'Software\\Classes\\CLSID\\{86ca1aa0-34aa-4e8b-a509-50c905bae2a2}';
  const sub = `${parent}\\InprocServer32`;
  // Key-exists check (not /v '': reg.exe can't query an empty-named value,
  // so presence of the SUBKEY is the pre-existence signal).
  const pre = await runCmd('reg', ['query', `${root}\\${sub}`], 15000);
  if (pre.code === 0) return { ok: true, message: 'Classic menu key already present — left untouched.', revert: { kind: 'none' } };
  const r = await runCmd('reg', ['add', `${root}\\${sub}`, '/ve', '/t', 'REG_SZ', '/d', '', '/f'], 15000);
  if (r.code !== 0) return { ok: false, message: 'reg add failed.' };
  return {
    ok: true,
    message: 'Classic context menu restored (restart Explorer to see it).',
    revert: { kind: 'regkey', root, path: parent },
  };
});

/* Taskbar End Task button (Win11): TaskbarEndTask=1. */
const enableEndTask = () => wrap(async () => {
  const r = await regSetDword('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced\\TaskbarDeveloperSettings', 'TaskbarEndTask', 1);
  return r.ok ? { ok: true, message: 'End Task added to taskbar right-click.', revert: r.revert } : r;
});

/* Hide Task View button: ShowTaskViewButton=0. */
const hideTaskView = () => wrap(async () => {
  const r = await regSetDword('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', 'ShowTaskViewButton', 0);
  return r.ok ? { ok: true, message: 'Task View button hidden.', revert: r.revert } : r;
});

/* Hide Teams Chat icon (Win11): TaskbarMn=0. */
const hideChatIcon = () => wrap(async () => {
  const r = await regSetDword('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', 'TaskbarMn', 0);
  return r.ok ? { ok: true, message: 'Chat icon hidden.', revert: r.revert } : r;
});

/* NumLock on at boot: InitialKeyboardIndicators=2. */
const numlockOnBoot = () => wrap(async () => {
  const r = await regSetString('HKCU', 'Control Panel\\Keyboard', 'InitialKeyboardIndicators', '2');
  return r.ok ? { ok: true, message: 'NumLock will be on at boot.', revert: r.revert } : r;
});

/* No thumbs.db on network folders: stops Explorer writing junk (and waiting
 * on locks) across SMB shares. */
const noNetworkThumbs = () => wrap(async () => {
  const r = await regSetDword('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', 'DisableThumbsDBOnNetworkFolders', 1);
  return r.ok ? { ok: true, message: 'Network-folder thumbnails cache off.', revert: r.revert } : r;
});

/* Explorer opens to This PC instead of Quick Access/Home. */
const thisPCDefault = () => wrap(async () => {
  const r = await regSetDword('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', 'LaunchTo', 1);
  return r.ok ? { ok: true, message: 'Explorer now opens to This PC.', revert: r.revert } : r;
});

/* No lock screen ( straight to login): NoLockScreen=1. */
const noLockScreen = () => wrap(async () => {
  const r = await regSetDword('HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\Personalization', 'NoLockScreen', 1);
  return r.ok ? { ok: true, message: 'Lock screen skipped (straight to sign-in).', revert: r.revert } : r;
});

/* No acrylic blur on the logon screen: snappier sign-in paint. */
const noLogonBlur = () => wrap(async () => {
  const r = await regSetDword('HKLM', 'SOFTWARE\\Policies\\Microsoft\\Windows\\System', 'DisableAcrylicBackgroundOnLogon', 1);
  return r.ok ? { ok: true, message: 'Logon-screen blur off.', revert: r.revert } : r;
});

/* Taskbar buttons left (Win11): TaskbarAl=0. */
const taskbarLeft = () => wrap(async () => {
  const r = await regSetDword('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', 'TaskbarAl', 0);
  return r.ok ? { ok: true, message: 'Taskbar aligned left (restart Explorer to see it).', revert: r.revert } : r;
});

/* Classic taskbar clock flyout (Win11): UseWin32TrayClockExperience=0. */
const classicClock = () => wrap(async () => {
  const r = await regSetDword('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', 'UseWin32TrayClockExperience', 0);
  return r.ok ? { ok: true, message: 'Classic clock flyout restored.', revert: r.revert } : r;
});

/* Hide the taskbar Search box (Win11): SearchboxTaskbarMode=0. Win+S works. */
const hideTaskbarSearch = () => wrap(async () => {
  const r = await regSetDword('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\Search', 'SearchboxTaskbarMode', 0);
  return r.ok ? { ok: true, message: 'Taskbar search box hidden.', revert: r.revert } : r;
});

/* Seconds in the taskbar clock (Win11): SecondsInSystemClock=1. */
const taskbarSeconds = () => wrap(async () => {
  const r = await regSetDword('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', 'SecondsInSystemClock', 1);
  return r.ok ? { ok: true, message: 'Taskbar clock shows seconds.', revert: r.revert } : r;
});

/* Classic XP-style Alt+Tab switcher: AltTabSettings=1. */
const classicAltTab = () => wrap(async () => {
  const r = await regSetDword('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer', 'AltTabSettings', 1);
  return r.ok ? { ok: true, message: 'Classic Alt+Tab switcher on.', revert: r.revert } : r;
});

/* Aero Shake off: windows stop minimizing when you shake one. */
const noWindowShake = () => wrap(async () => {
  const r = await regSetDword('HKCU', 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced', 'DisallowShaking', 1);
  return r.ok ? { ok: true, message: 'Aero Shake disabled.', revert: r.revert } : r;
});

module.exports = {
  setMenuDelay0, disableAeroPeek, disableWindowAnimations, disableBlur,
  setTransparencyOff, setTransparencyOn, showFileExtensions,
  showHiddenFiles, disableStickyKeys, disableToggleKeysAudio,
  classicContextMenu, enableEndTask, hideTaskView, hideChatIcon, numlockOnBoot,
  noNetworkThumbs, thisPCDefault, noLockScreen, noLogonBlur, taskbarLeft,
  classicClock, hideTaskbarSearch, taskbarSeconds, classicAltTab, noWindowShake,
};
