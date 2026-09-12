'use strict';
/* Presets tab: one-click tweak STACKS (the "products" idea, Tidal-style).
 * Contents are printed from the shared TT.TWEAKS catalog BEFORE confirming,
 * so a preset never applies anything sight-unseen. Pro presets show 🔒 for
 * free users; the FPS Boost starter pack is free for everyone. */
(function () {
  const TT = window.TT;
  const $ = (id) => document.getElementById(id);
  let loaded = false;

  async function load() {
    const box = $('preset-list');
    box.innerHTML = '<div class="spinner"></div>';
    let res;
    try { res = await TT.api.preset.list(); }
    catch (e) { res = { ok: false, message: String(e) }; }
    box.innerHTML = '';
    if (!res || !res.ok || !res.presets.length) {
      box.innerHTML = '<p class="dim">No presets available.</p>';
      return;
    }
    res.presets.forEach((p) => {
      const card = document.createElement('div');
      card.className = 'glass card';
      const h = document.createElement('h3');
      h.textContent = p.title + '  ';
      const tag = document.createElement('span');
      const pt = p.tier || 0;
      tag.className = pt === 0 ? 'free-tag' : (pt === 1 ? 'tier-tag tier-base' : (pt === 3 ? 'tier-tag tier-extreme' : 'pro-tag'));
      tag.textContent = (TT.TIER_NAMES[pt] || 'FREE').toUpperCase();
      if (p.custom) {
        // Local-only stack (custom-presets.json): never shipped, never synced.
        const mine = document.createElement('span');
        mine.className = 'os-tag';
        mine.textContent = 'CUSTOM · THIS PC ONLY';
        mine.style.marginLeft = '8px';
        h.append(mine, ' ');
      }
      h.appendChild(tag);
      const desc = document.createElement('p');
      desc.className = 'dim';
      desc.textContent = p.desc;
      // OS + game-exe line: which Windows, and whether exes get registered.
      const sub = document.createElement('p');
      sub.className = 'dim';
      const osv = p.os || 'both';
      sub.textContent = `🖥 ${osv === 'both' ? 'Windows 10 · 11' : (osv === 'win11' ? 'Windows 11' : 'Windows 10')}` +
        ((p.games && p.games.length) ? ` · 🎮 saves: ${p.games.join(', ')}` : '');
      // Transparent contents in a SCROLLABLE box: a 61-tweak stack must never
      // push its own Apply button off the card (same for the confirm modal).
      const ul = document.createElement('div');
      ul.className = 'preset-includes';
      ul.style.margin = '10px 0';
      (p.ids || []).forEach((tid) => {
        const meta = (TT.TWEAKS || {})[tid];
        const row = document.createElement('div');
        row.className = 'file-row';
        const a = document.createElement('span');
        a.textContent = '• ' + ((meta && meta.t) || tid);
        row.appendChild(a);
        ul.appendChild(row);
      });
      const row = document.createElement('div');
      row.className = 'row';
      row.style.marginBottom = '0';
      const btn = document.createElement('button');
      const need = p.tier || 0;
      const locked = TT.tier < need;
      btn.className = 'btn ' + (locked ? 'secondary' : (need >= 2 ? 'gold' : 'primary'));
      btn.textContent = locked ? `🔒 ${TT.TIER_NAMES[need]}` : `⚡ Apply ${(p.ids || []).length} tweaks`;
      btn.onclick = () => applyPreset(p, locked);
      row.appendChild(btn);
      card.append(h, desc, sub, ul, row);
      box.appendChild(card);
    });
  }

  async function applyPreset(p, locked) {
    const need = p.tier || 0;
    if (locked) {
      TT.toast(`🔒 '${p.title}' needs ${TT.TIER_NAMES[need]} ($${TT.TIER_PRICES[need]}) — opening Settings…`, 'gold', 3500);
      TT.switchTab('settings');
      return;
    }
    const names = (p.ids || []).map((tid) => '• ' + (((TT.TWEAKS || {})[tid] || {}).t || tid)).join('\n');
    const ok = await TT.confirm({
      title: p.title,
      body: `${p.warn || ''}\n\nIncluded:\n${names}\n\nOne restore point covers everything, and one Undo rolls it all back.`,
      okText: `Apply ${p.ids.length} tweaks`,
    });
    if (!ok) return;
    // Loading screen: title + live step log streamed from the main process.
    // Steps appear as they land; the summary below is authoritative.
    TT.progress.show(`${p.title} (${p.ids.length} tweaks)`, p.ids.length, p.id);
    const res = await TT.api.preset.apply(p.id).catch((e) => ({ ok: false, message: String(e) }));
    TT.progress.done((res && res.message) || 'Preset failed.', !!(res && res.ok));
    if (res && res.ok) TT.confetti();
    if (TT.refreshRestore) TT.refreshRestore();
    load(); // re-seat Pro/FREE states (a preset can't activate, but cheap)
  }

  TT._show.presets = () => { if (!loaded) { loaded = true; load(); } };
})();
