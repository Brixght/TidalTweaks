'use strict';
/* Potato Graphics tab (Pro): one-click low-graphics profiles for competitive
 * games. Free users see the preview banner + game list with 🔒 locks;
 * clicking a locked card shows the preview text. Pro users get Apply buttons
 * that run the core/games/* modules (timestamped backup + undo-log entry),
 * then toast the restart reminder. Game metadata (names, settings, Safe /
 * Caution badges) comes from main via potato:list — single source of truth. */
(function () {
  const TT = window.TT;
  const $ = (id) => document.getElementById(id);
  const api = () => TT.api.potato;
  const isPro = () => TT && (TT.pro || (TT.tier || 0) >= 2);

  const PREVIEW_TEXT = 'Potato Graphics needs Pro and an NVIDIA card. Buy Pro once and it is yours for good — it includes this and every other tool.';

  let games = [];
  let detected = {};

  function badgeEl(badge) {
    const s = document.createElement('span');
    if (badge === 'safe') { s.className = 'safe-tag'; s.textContent = 'Safe'; }
    else { s.className = 'caution-tag'; s.textContent = 'Caution'; }
    return s;
  }

  function render() {
    const pro = isPro();
    // Unlock button mirrors the license state.
    const unl = $('pot-unlock');
    if (unl) {
      unl.textContent = pro ? 'Pro active ✓' : 'Unlock · $15';
      unl.disabled = pro;
      unl.style.opacity = pro ? '0.6' : '1';
    }
    const box = $('pot-list');
    if (!box) return;
    box.innerHTML = '';
    if (!games.length) {
      box.innerHTML = '<p class="dim">Loading profiles…</p>';
      return;
    }
    games.forEach((g) => {
      const card = document.createElement('div');
      card.className = 'pot-card';
      const icon = document.createElement('div');
      icon.className = 'pot-icon';
      icon.textContent = g.icon || '🎮';
      const info = document.createElement('div');
      info.className = 'pot-info';
      const title = document.createElement('b');
      title.textContent = g.name + ' ';
      const tag = document.createElement('span');
      tag.className = 'pro-tag pro-purple';
      tag.textContent = 'PRO';
      title.appendChild(tag);
      const desc = document.createElement('p');
      desc.textContent = g.desc || 'Low-graphics competitive profile';
      info.append(title, desc);
      // Per-setting chips with Safe / Caution badges.
      const chips = document.createElement('div');
      chips.className = 'pot-settings';
      (g.settings || []).forEach((s) => {
        const chip = document.createElement('span');
        chip.className = 'pot-chip';
        chip.textContent = s.label + ' ';
        chip.appendChild(badgeEl(s.badge));
        chips.appendChild(chip);
      });
      info.appendChild(chips);
      const det = detected[g.id];
      const dline = document.createElement('p');
      dline.className = 'dim pot-detect';
      dline.textContent = det
        ? (det.found ? '✓ Game config found.' : 'Config not found — launch the game once to generate it.')
        : '';
      info.appendChild(dline);
      const actions = document.createElement('div');
      actions.className = 'pot-actions';
      const btn = document.createElement('button');
      if (pro) {
        btn.className = 'btn primary';
        btn.textContent = 'Apply';
        btn.onclick = () => applyGame(g);
      } else {
        btn.className = 'btn secondary pot-locked';
        btn.textContent = '🔒';
        btn.title = `${g.name} needs Pro — click for preview`;
        btn.onclick = () => TT.toast(`👁 Preview. ${PREVIEW_TEXT}`, 'gold', 6000);
      }
      actions.appendChild(btn);
      card.append(icon, info, actions);
      box.appendChild(card);
    });
  }

  async function applyGame(g) {
    const ok = await TT.confirm({
      title: `Apply Potato Graphics for ${g.name}?`,
      body: `Backs up your current config first (timestamped copy + Restore-tab undo).\nLaunch args are added to local shortcuts when found.\nRestart ${g.name} afterwards to see the changes.`,
      okText: 'Apply profile',
    });
    if (!ok) return;
    TT.toast(`Applying Potato Graphics for ${g.name}…`, '', 2500);
    let r;
    try { r = await api().apply(g.id); }
    catch (e) { r = { ok: false, message: String(e) }; }
    if (r && r.ok) {
      TT.toast(r.message || `Potato Graphics applied for ${g.name}. Restart your game to see the changes.`, 'success', 5000);
      if (window.TT && window.TT.refreshRestore) window.TT.refreshRestore();
    } else {
      TT.toast((r && r.message) || 'Failed.', 'error', 6000);
    }
  }

  async function paintGpu() {
    const el = $('pot-gpu');
    if (!el) return;
    try {
      const s = await TT.api.sys.static();
      const names = (s && s.ok && s.gpu && s.gpu.length) ? s.gpu.slice(0, 2).join(' · ') : 'Unknown GPU';
      const nv = /nvidia/i.test(names);
      el.textContent = `Detected GPU: ${names}${nv ? '' : ' — profiles are config-file tweaks and apply to any GPU.'}`;
    } catch (e) { el.textContent = ''; }
  }

  async function refresh() {
    try {
      const l = await api().list();
      if (l && l.ok && Array.isArray(l.games)) games = l.games;
    } catch (e) { /* main unreachable */ }
    try {
      const d = await api().detect();
      if (d && d.ok && d.games) detected = d.games;
    } catch (e) { /* detection is best-effort */ }
    render();
  }

  function wire() {
    const unl = $('pot-unlock');
    if (unl) unl.onclick = () => {
      if (isPro()) return;
      TT.toast('🔒 Potato Graphics needs Pro ($15) — opening Settings…', 'gold', 3500);
      TT.switchTab('settings');
    };
  }

  TT._show.potato = async () => {
    try { await TT.refreshLicense(false); } catch (e) { /* tier read is best-effort */ }
    paintGpu();
    await refresh();
  };
  wire();
  paintGpu();
  refresh();
})();
