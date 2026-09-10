'use strict';
/* Settings tab: activation panel (Cash App code → Cloudflare KV), license
 * server URL override, danger-zone revert-all, about.
 * On success: confetti + gold toast + instant unlock (see refreshLicense). */
(function () {
  const TT = window.TT;
  const $ = (id) => document.getElementById(id);

  async function paint() {
    let s;
    try { s = await TT.api.license.status(); }
    catch (e) { $('license-status').textContent = 'Status unavailable.'; return; }
    $('license-status').textContent = s.pro
      ? `👑 PRO ACTIVE since ${(s.activatedAt || '').slice(0, 10)} — all tweaks unlocked.`
      : 'FREE version — activate Pro to unlock every tweak below the PRO divider.';
    $('api-url').value = s.apiUrl || '';
    $('account-line').textContent = s.username
      ? `Signed in as ${s.username} (${s.role})${s.pro ? ' · 👑 Pro' : ' · Free'}.`
      : 'Not signed in.';
    // Lite-mode toggle reflects the stored preference (auto/on/off).
    const liteSel = $('lite-mode');
    if (liteSel) liteSel.value = s.litePref || 'auto';
    const liteNote = $('lite-note');
    if (liteNote) liteNote.textContent = s.lite
      ? 'Lite mode is ACTIVE (flat panels, no GPU effects).'
      : 'Full glass effects are on.';
  }

  $('license-go').onclick = async () => {
    const code = ($('license-code').value || '').trim();
    if (!code) { TT.toast('Paste a code first.', '', 3000); return; }
    TT.toast('Validating code…', '', 2000);
    let res;
    try { res = await TT.api.license.validate(code); }
    catch (e) { res = { ok: false, message: String(e) }; }
    if (res && res.ok) {
      $('license-code').value = '';
      await TT.refreshLicense(true); // true → confetti celebration 🎉
      paint();
    } else {
      TT.toast((res && res.message) || 'Invalid or already used code.', 'error', 4500);
    }
  };
  // Enter key submits the code (small UX touch, big feel).
  $('license-code').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('license-go').click();
  });
  // Click-to-copy the seller's Discord (clipboard API with manual fallback).
  const dtag = $('discord-tag');
  if (dtag) dtag.onclick = async () => {
    try {
      await navigator.clipboard.writeText('chrome.bright');
      TT.toast('Discord copied: chrome.bright — send your receipt there.', 'success');
    } catch (e) {
      const range = document.createRange();
      range.selectNodeContents(dtag);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      TT.toast('Copy it manually: chrome.bright', '', 3500);
    }
  };
  $('license-check').onclick = async () => {
    await TT.refreshLicense(false);
    paint();
    TT.toast(TT.pro ? 'Pro is active. 👑' : 'Free version — no active license.', TT.pro ? 'gold' : '', 3000);
  };
  $('license-deactivate').onclick = async () => {
    await TT.api.license.deactivate().catch(() => {});
    await TT.refreshLicense(false);
    paint();
    TT.toast('Pro deactivated — back to Free.', '', 3000);
  };
  $('api-save').onclick = async () => {
    const r = await TT.api.license.setApiUrl($('api-url').value).catch((e) => ({ ok: false, message: String(e) }));
    TT.toast(r && r.ok ? 'License server URL saved.' : ('Invalid URL: ' + ((r && r.message) || '')), r && r.ok ? 'success' : 'error');
    paint();
  };
  const liteSel = $('lite-mode');
  if (liteSel) liteSel.onchange = async () => {
    const r = await TT.api.license.setLite(liteSel.value).catch((e) => ({ ok: false, message: String(e) }));
    if (r && r.ok) {
      await TT.refreshLicense(false); // applies body.lite instantly (CSS half)
      paint();
      TT.toast('Saved. Restart the app for the full effect.', 'success');
    } else TT.toast('Failed: ' + ((r && r.message) || 'unknown'), 'error');
  };
  $('settings-revert-all').onclick = async () => {
    const ok = await TT.confirm({
      title: 'Revert ALL changes?',
      body: 'Every backup saved by TidalTweaks will be restored to its original value.',
      okText: 'Revert all',
    });
    if (!ok) return;
    const r = await TT.api.restore.revertAll().catch((e) => ({ ok: false, message: String(e) }));
    TT.toast((r && r.message) || '', r && r.ok ? 'success' : 'error', 5000);
  };

  // — Account: change password (needs current one) + log out (reloads to gate)
  $('account-change-pw').onclick = async () => {
    const cur = await TT.confirm({
      title: 'Change password', body: 'Enter your current password:',
      input: { placeholder: 'Current password', password: true }, okText: 'Next',
    });
    if (cur === null) return;
    const nw = await TT.confirm({
      title: 'Change password', body: 'Enter the new password (4+ characters):',
      input: { placeholder: 'New password', password: true }, okText: 'Change',
    });
    if (nw === null) return;
    const r = await TT.api.auth.changePassword(cur, nw).catch((e) => ({ ok: false, message: String(e) }));
    TT.toast((r && r.message) || '', r && r.ok ? 'success' : 'error', 4000);
  };
  $('account-logout').onclick = async () => {
    await TT.api.auth.logout().catch(() => {});
    location.reload(); // back through the auth gate, clean state
  };

  // — Appearance: theme + accent apply instantly, no restart.
  const themeSel = $('theme-select');
  const accentSel = $('accent-select');
  async function paintAppearance() {
    try {
      const g = await TT.api.settings.get();
      if (g && g.ok) {
        if (themeSel) themeSel.value = g.theme;
        if (accentSel) accentSel.value = g.accent;
      }
    } catch (e) { /* defaults stand */ }
  }
  // Each theme ships a native accent; picking a theme re-pairs it, picking
  // an accent keeps your explicit choice.
  const NATIVE_ACCENT = { tsunami: 'blue', abyss: 'blue', royal: 'violet', emerald: 'mint', crimson: 'rose', sunset: 'orange', arctic: 'blue', mono: 'silver' };
  async function pushAppearance(fromTheme) {
    const theme = themeSel.value;
    const accent = fromTheme ? (NATIVE_ACCENT[theme] || 'blue') : accentSel.value;
    if (fromTheme) accentSel.value = accent;
    const r = await TT.api.settings.set({ theme, accent })
      .catch((e) => ({ ok: false, message: String(e) }));
    if (r && r.ok) {
      document.body.dataset.theme = r.theme;
      document.body.dataset.accent = r.accent;
    } else TT.toast('Theme failed: ' + ((r && r.message) || 'unknown'), 'error');
  }
  if (themeSel) themeSel.onchange = () => pushAppearance(true);
  if (accentSel) accentSel.onchange = () => pushAppearance(false);

  TT._show.settings = () => { paint(); paintAppearance(); };
  paint();
  paintAppearance();
})();
