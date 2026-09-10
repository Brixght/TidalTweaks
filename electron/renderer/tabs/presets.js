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
      tag.className = p.pro ? 'pro-tag' : 'free-tag';
      tag.textContent = p.pro ? 'PRO' : 'FREE';
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
      // Transparent contents: every included tweak by name.
      const ul = document.createElement('div');
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
      const locked = p.pro && !TT.pro;
      btn.className = 'btn ' + (locked ? 'secondary' : (p.pro ? 'gold' : 'primary'));
      btn.textContent = locked ? '🔒 Pro' : `⚡ Apply ${(p.ids || []).length} tweaks`;
      btn.onclick = () => applyPreset(p, locked);
      row.appendChild(btn);
      card.append(h, desc, sub, ul, row);
      box.appendChild(card);
    });
  }

  async function applyPreset(p, locked) {
    if (locked) {
      TT.toast(`🔒 '${p.title}' needs Pro — opening Settings…`, 'gold', 3500);
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
    const res = await TT.api.preset.apply(p.id).catch((e) => ({ ok: false, message: String(e) }));
    if (res && res.ok) {
      TT.toast(res.message, 'success', 5000);
      TT.confetti();
    } else {
      TT.toast((res && res.message) || 'Preset failed.', 'error', 6000);
      if (res && res.details) console.info('[preset]', p.id, res.details);
    }
    if (TT.refreshRestore) TT.refreshRestore();
    load(); // re-seat Pro/FREE states (a preset can't activate, but cheap)
  }

  TT._show.presets = () => { if (!loaded) { loaded = true; load(); } };
})();
