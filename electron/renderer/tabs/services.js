'use strict';
/* Services tab (Pro): 7 collapsible sections of service/task rows driven by
 * services:list (core/services/index.js) — the single source of truth.
 * Free users see everything with grey padlocks + the preview banner;
 * clicking a lock shows the preview text. Pro users get Apply (with the
 * row's confirm modal — red + understanding-checkbox for Aggressive rows)
 * and Revert per row, all riding the shared tweak runner + undo log.
 * The search bar filters rows by name in real time. */
(function () {
  const TT = window.TT;
  const $ = (id) => document.getElementById(id);
  const isPro = () => TT && (TT.pro || (TT.tier || 0) >= 2);

  const PREVIEW_TEXT = "You're seeing everything the Pro tier unlocks. Buy it once and it's yours for good.";

  let sections = [];
  let query = '';

  function badgeEl(badge) {
    const s = document.createElement('span');
    if (badge === 'advanced') { s.className = 'adv-tag'; s.textContent = 'Advanced'; }
    else if (badge === 'caution') { s.className = 'caution-tag'; s.textContent = 'Caution'; }
    else { s.className = 'safe-tag'; s.textContent = 'Safe'; }
    return s;
  }
  function dotsEl(n) {
    const s = document.createElement('span');
    s.className = 'impact';
    s.title = `Impact ${n}/3`;
    for (let i = 0; i < Math.min(3, Math.max(1, Number(n) || 1)); i++) {
      s.appendChild(document.createElement('i'));
    }
    return s;
  }

  /* Row meta: new ids arrive complete from services:list; ref rows resolve
   * titles/modals from the shared tweak catalog (+ row overrides). */
  function metaOf(row) {
    if (row.t) return { t: row.t, d: row.d || '', m: row.m || '', danger: !!row.danger, check: row.check || null };
    const c = (TT.TWEAKS && TT.TWEAKS[row.id]) || { t: row.id, d: '', m: '' };
    return { t: row.t || c.t, d: row.d || c.d, m: c.m || '', danger: !!row.danger, check: row.check || null };
  }

  function needPro() {
    TT.toast(`👁 Preview. ${PREVIEW_TEXT}`, 'gold', 4500);
    TT.switchTab('settings');
  }

  async function applyRow(row) {
    const meta = metaOf(row);
    const ok = await TT.confirm({
      title: meta.t, body: meta.m || meta.d || '',
      okText: row.danger ? 'Apply anyway' : 'Apply',
      danger: meta.danger, check: meta.check,
    });
    if (!ok) return;
    let res;
    try { res = await TT.api.tweak.apply(row.id); }
    catch (e) { res = { ok: false, message: String(e) }; }
    if (res && res.ok) {
      TT.toast(res.message || 'Applied.', 'success', 5000);
      if (window.TT && window.TT.refreshRestore) window.TT.refreshRestore();
    } else {
      TT.toast((res && res.message) || 'Failed.', 'error', 6000);
    }
  }

  async function revertRow(row) {
    let res;
    try { res = await TT.api.tweak.revert(row.id); }
    catch (e) { res = { ok: false, message: String(e) }; }
    TT.toast((res && res.message) || 'Nothing to revert.', res && res.ok ? 'success' : '', 4500);
  }

  function rowMatches(row) {
    if (!query) return true;
    const meta = metaOf(row);
    return `${meta.t} ${meta.d} ${row.id}`.toLowerCase().includes(query);
  }

  function render() {
    const pro = isPro();
    const box = $('svc-sections');
    if (!box) return;
    box.innerHTML = '';
    if (!sections.length) {
      box.innerHTML = '<p class="dim">Loading services…</p>';
      return;
    }
    let shown = 0;
    sections.forEach((sec) => {
      const rows = (sec.rows || []).filter(rowMatches);
      if (query && !rows.length) return; // hide empty sections while searching
      shown += rows.length;
      const wrap = document.createElement('div');
      wrap.className = 'svc-sec';
      const head = document.createElement('div');
      head.className = 'svc-sec-head';
      const title = document.createElement('b');
      title.textContent = `${sec.title} (${rows.length})`;
      const chev = document.createElement('span');
      chev.className = 'svc-chev';
      chev.textContent = '▾';
      head.append(title, chev);
      head.onclick = () => wrap.classList.toggle('collapsed');
      // Searching auto-expands; otherwise start expanded.
      if (query) wrap.classList.remove('collapsed');
      wrap.appendChild(head);
      if (sec.note) {
        const note = document.createElement('p');
        note.className = 'dim svc-note';
        note.textContent = sec.note;
        wrap.appendChild(note);
      }
      const list = document.createElement('div');
      list.className = 'svc-rows';
      rows.forEach((row) => {
        const meta = metaOf(row);
        const card = document.createElement('div');
        card.className = 'tweak-card' + (row.danger ? ' svc-danger' : '');
        const info = document.createElement('div');
        info.className = 'tweak-info';
        const b = document.createElement('b');
        b.textContent = meta.t + ' ';
        b.appendChild(badgeEl(row.badge));
        b.append(' ', dotsEl(row.impact));
        const p = document.createElement('p');
        p.textContent = meta.d;
        info.append(b, p);
        const actions = document.createElement('div');
        actions.className = 'tweak-actions';
        if (!pro) {
          const lock = document.createElement('button');
          lock.className = 'btn secondary';
          lock.textContent = '🔒';
          lock.title = `${meta.t} needs Pro`;
          lock.onclick = needPro;
          actions.appendChild(lock);
        } else {
          const apply = document.createElement('button');
          apply.className = 'btn ' + (row.danger ? 'danger' : 'primary');
          apply.textContent = 'Apply';
          apply.onclick = () => applyRow(row);
          const revert = document.createElement('button');
          revert.className = 'btn secondary';
          revert.textContent = 'Revert';
          revert.onclick = () => revertRow(row);
          actions.append(apply, revert);
        }
        card.append(info, actions);
        list.appendChild(card);
      });
      wrap.appendChild(list);
      box.appendChild(wrap);
    });
    if (query && !shown) box.innerHTML = '<p class="dim">No services match that search.</p>';
  }

  async function refresh() {
    try {
      const r = await TT.api.services.list();
      if (r && r.ok && Array.isArray(r.sections)) sections = r.sections;
    } catch (e) { /* main unreachable */ }
    render();
  }

  function wire() {
    const unl = $('svc-unlock');
    if (unl) unl.onclick = () => {
      if (isPro()) return;
      TT.toast('🔒 Service tweaks need Pro ($15) — opening Settings…', 'gold', 3500);
      TT.switchTab('settings');
    };
    const search = $('svc-search');
    if (search) search.oninput = () => {
      query = (search.value || '').trim().toLowerCase();
      render();
    };
  }

  TT._show.services = async () => {
    try { await TT.refreshLicense(false); } catch (e) { /* best-effort */ }
    const banner = $('svc-banner');
    if (banner) banner.hidden = isPro();
    const unl = $('svc-unlock');
    if (unl) {
      unl.textContent = isPro() ? 'Pro active ✓' : '👑 Unlock · $15';
      unl.disabled = isPro();
      unl.style.opacity = isPro() ? '0.6' : '1';
    }
    await refresh();
  };
  wire();
  refresh();
})();
