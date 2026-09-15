'use strict';
/* Crosshair tab (freemium): transparent always-on-top overlay for games.
 * Free: 3 presets (Classic/Dot/Cross), any color, on/off toggle.
 * Pro (tier >= 2, enforced in main): layered crosshairs, full shape library
 * (T-Shape/Complex/Ring/Double/Plus-Dot), size/position/opacity sliders,
 * Save-current custom designs. Purple accent marks every Pro control. */
(function () {
  const TT = window.TT;
  const $ = (id) => document.getElementById(id);
  const api = () => TT.api.crosshair;

  const FREE_SHAPES = ['classic', 'dot', 'cross'];
  const ALL_SHAPES = ['classic', 'dot', 'cross', 't-shape', 'complex', 'ring', 'double', 'plus-dot'];
  const SHAPE_LABEL = {
    classic: 'Classic', dot: 'Dot', cross: 'Cross',
    't-shape': 'T-Shape', complex: 'Complex', ring: 'Ring',
    double: 'Double', 'plus-dot': 'Plus-Dot',
  };
  const COLORS = ['#22FF88', '#22D3EE', '#FF4DFF', '#FFD21F', '#FF4D4D', '#FFFFFF', '#111827', '#9D7BFF'];

  let cfg = null;
  let saved = [];
  let saveTimer = null;
  const isPro = () => TT && (TT.pro || (TT.tier || 0) >= 2);

  /* ------------------------- mini SVG icon builders ------------------------ */
  function shapeSVG(shape, color) {
    const c = color || '#22FF88';
    const s = 34, cx = 17, cy = 17, half = 11, gap = 3.5, t = 2.4;
    const L = (x1, y1, x2, y2) =>
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${t}" stroke-linecap="round"/>`;
    const C = (r, fill, w) =>
      fill
        ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}"/>`
        : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c}" stroke-width="${w || t}"/>`;
    let inner = '';
    if (shape === 'dot') inner = C(5, true);
    else if (shape === 'cross') inner = L(cx - 8, cy - 8, cx + 8, cy + 8) + L(cx - 8, cy + 8, cx + 8, cy - 8);
    else if (shape === 't-shape') inner = L(cx - half, cy - 8, cx + half, cy - 8) + L(cx, cy - 8, cx, cy + 9);
    else if (shape === 'ring') inner = C(10, false) + C(1.8, true);
    else if (shape === 'double') inner = C(11, false) + C(6, false, 1.6) + C(1.8, true);
    else if (shape === 'plus-dot') inner = L(cx - half, cy, cx - gap, cy) + L(cx + gap, cy, cx + half, cy) + L(cx, cy - half, cx, cy - gap) + L(cx, cy + gap, cx, cy + half) + C(2.2, true);
    else if (shape === 'complex') inner = L(cx - half, cy, cx - gap, cy) + L(cx + gap, cy, cx + half, cy) + L(cx, cy - half, cx, cy - gap) + L(cx, cy + gap, cx, cy + half) + C(8, false, 1.4) + C(1.8, true);
    else inner = L(cx - half, cy, cx - gap, cy) + L(cx + gap, cy, cx + half, cy) + L(cx, cy - half, cx, cy - gap) + L(cx, cy + gap, cx, cy + half);
    return `<svg viewBox="0 0 ${s} ${s}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
  }

  /* Preview (right column): same shapes, composited layers, scaled to fit. */
  function renderPreview() {
    const svg = $('ch-preview-svg');
    if (!svg || !cfg) return;
    const NS = 'http://www.w3.org/2000/svg';
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const cx0 = 100, cy0 = 80;
    const layers = (cfg.layers && cfg.layers.length ? cfg.layers : [{ shape: cfg.preset, size: cfg.size, thickness: cfg.thickness, opacity: cfg.opacity, x: 0, y: 0, visible: true }]);
    const k = 1.15; // preview scale
    layers.forEach((l) => {
      if (l.visible === false) return;
      const g = document.createElementNS(NS, 'g');
      const cx = cx0 + ((Number(cfg.x) || 0) * 0.12) + ((Number(l.x) || 0) * 0.12);
      const cy = cy0 + ((Number(cfg.y) || 0) * 0.12) + ((Number(l.y) || 0) * 0.12);
      const size = (Number(l.size) || 22) * k;
      const th = Math.max(1.4, (Number(l.thickness) || 3) * 0.8);
      const half = size / 2, gap = Math.max(2, size * 0.2);
      const col = cfg.color || '#22FF88';
      const op = l.opacity != null ? l.opacity : 1;
      const mkLine = (x1, y1, x2, y2) => {
        const e = document.createElementNS(NS, 'line');
        e.setAttribute('x1', x1); e.setAttribute('y1', y1);
        e.setAttribute('x2', x2); e.setAttribute('y2', y2);
        e.setAttribute('stroke', col); e.setAttribute('stroke-width', th);
        e.setAttribute('stroke-linecap', 'round'); e.setAttribute('opacity', op);
        g.appendChild(e);
      };
      const mkDot = (r, x, y) => {
        const e = document.createElementNS(NS, 'circle');
        e.setAttribute('cx', x == null ? cx : x); e.setAttribute('cy', y == null ? cy : y);
        e.setAttribute('r', r); e.setAttribute('fill', col); e.setAttribute('opacity', op);
        g.appendChild(e);
      };
      const mkRing = (r, w) => {
        const e = document.createElementNS(NS, 'circle');
        e.setAttribute('cx', cx); e.setAttribute('cy', cy); e.setAttribute('r', r);
        e.setAttribute('fill', 'none'); e.setAttribute('stroke', col);
        e.setAttribute('stroke-width', w || th); e.setAttribute('opacity', op);
        g.appendChild(e);
      };
      const sh = l.shape || 'classic';
      if (sh === 'dot') mkDot(Math.max(2.5, size * 0.22));
      else if (sh === 'cross') { const d = half * 0.75; mkLine(cx - d, cy - d, cx + d, cy + d); mkLine(cx - d, cy + d, cx + d, cy - d); }
      else if (sh === 't-shape') { mkLine(cx - half, cy - half * 0.7, cx + half, cy - half * 0.7); mkLine(cx, cy - half * 0.7, cx, cy + half * 0.8); }
      else if (sh === 'ring') { mkRing(half); mkDot(1.8); }
      else if (sh === 'double') { mkRing(half); mkRing(half * 0.55, Math.max(1, th * 0.7)); mkDot(1.8); }
      else if (sh === 'plus-dot') { mkLine(cx - half, cy, cx - gap, cy); mkLine(cx + gap, cy, cx + half, cy); mkLine(cx, cy - half, cx, cy - gap); mkLine(cx, cy + gap, cx, cy + half); mkDot(Math.max(2, th * 0.7)); }
      else if (sh === 'complex') { mkLine(cx - half, cy, cx - gap, cy); mkLine(cx + gap, cy, cx + half, cy); mkLine(cx, cy - half, cx, cy - gap); mkLine(cx, cy + gap, cx, cy + half); mkRing(half * 0.72, Math.max(1, th * 0.55)); mkDot(1.8); }
      else { mkLine(cx - half, cy, cx - gap, cy); mkLine(cx + gap, cy, cx + half, cy); mkLine(cx, cy - half, cx, cy - gap); mkLine(cx, cy + gap, cx, cy + half); }
      svg.appendChild(g);
    });
  }

  /* -------------------------------- renders -------------------------------- */
  function renderPresets() {
    const box = $('ch-presets');
    if (!box || !cfg) return;
    box.innerHTML = '';
    ALL_SHAPES.forEach((shape) => {
      const free = FREE_SHAPES.includes(shape);
      const locked = !free && !isPro();
      const el = document.createElement('div');
      el.className = 'ch-preset' + (cfg.preset === shape ? ' selected' : '') + (locked ? ' locked' : '');
      el.title = locked ? `${SHAPE_LABEL[shape]} needs Pro` : SHAPE_LABEL[shape];
      el.innerHTML = shapeSVG(shape, cfg.color) +
        `<span>${SHAPE_LABEL[shape]}</span>` +
        `<span class="ch-badge ${free ? 'free' : 'pro'}">${free ? 'Free' : 'Pro'}</span>`;
      el.onclick = () => selectPreset(shape, locked);
      box.appendChild(el);
    });
  }

  function renderColors() {
    const box = $('ch-colors');
    if (!box || !cfg) return;
    box.innerHTML = '';
    COLORS.forEach((c) => {
      const el = document.createElement('div');
      el.className = 'ch-swatch' + (String(cfg.color).toLowerCase() === c.toLowerCase() ? ' selected' : '');
      el.style.background = c;
      el.title = c;
      el.onclick = () => setColor(c);
      box.appendChild(el);
    });
    const custom = $('ch-custom-color');
    if (custom && !COLORS.map((x) => x.toLowerCase()).includes(String(cfg.color).toLowerCase())) {
      custom.value = /^#[0-9a-f]{6}$/i.test(cfg.color) ? cfg.color : '#22ff88';
    } else if (custom) {
      custom.value = String(cfg.color || '#22ff88').toLowerCase();
    }
  }

  function renderSaved() {
    const box = $('ch-saved');
    if (!box) return;
    box.innerHTML = '';
    if (!saved.length) {
      box.innerHTML = '<p class="dim">Nothing saved yet. Build a crosshair you like, then Save current.</p>';
      return;
    }
    saved.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'ch-saved-row';
      const b = document.createElement('b');
      b.textContent = `◈ ${s.name}`;
      const small = document.createElement('small');
      small.textContent = `${(s.config.layers || []).length} layer(s)`;
      const load = document.createElement('button');
      load.className = 'ch-mini-btn';
      load.textContent = 'Load';
      load.onclick = async () => {
        const r = await api().loadSaved(i).catch((e) => ({ ok: false, message: String(e) }));
        if (r && r.ok === false && /Pro/.test(r.message || '')) return needPro(r.message);
        if (r && r.config) { cfg = r.config; paintAll(); }
        else await refresh();
        TT.toast((r && r.message) || 'Loaded.', r && r.ok === false ? 'error' : 'success');
      };
      row.append(b, small, load);
      box.appendChild(row);
    });
  }

  function renderLayers() {
    const box = $('ch-layers');
    if (!box || !cfg) return;
    const pro = isPro();
    box.innerHTML = '';
    (cfg.layers || []).forEach((l, i) => {
      const row = document.createElement('div');
      row.className = 'ch-layer-row';
      const dot = document.createElement('span');
      dot.className = 'ch-layer-dot';
      dot.style.background = cfg.color || '#22FF88';
      const b = document.createElement('b');
      b.textContent = `Layer ${i + 1} · ${SHAPE_LABEL[l.shape] || l.shape}`;
      const badge = document.createElement('span');
      badge.className = 'ch-badge pro';
      badge.textContent = 'Pro';
      const rm = document.createElement('button');
      rm.className = 'ch-mini-btn danger';
      rm.textContent = '✕';
      rm.title = pro ? 'Remove layer' : 'Layers need Pro';
      rm.onclick = async () => {
        if (!isPro()) return needPro();
        if ((cfg.layers || []).length <= 1) { TT.toast('Keep at least one layer.', '', 2500); return; }
        const r = await api().removeLayer(l.id).catch((e) => ({ ok: false, message: String(e) }));
        if (r && r.ok === false) { TT.toast(r.message || 'Failed.', 'error', 4000); return; }
        if (r && r.config) { cfg = r.config; paintAll(); }
        else await refresh();
      };
      row.append(dot, b, badge, rm);
      if (!pro) row.style.opacity = '0.75';
      box.appendChild(row);
    });
    const add = $('ch-add-layer');
    if (add) {
      add.textContent = pro ? '+ Add' : '🔒 + Add';
      add.classList.toggle('locked', !pro);
    }
    const card = document.querySelector('.ch-pro-card');
    if (card) card.classList.toggle('locked-pro', !pro);
  }

  function renderToggle() {
    const btn = $('ch-toggle');
    if (!btn || !cfg) return;
    const on = !!cfg.enabled;
    btn.classList.toggle('on', on);
    btn.innerHTML = on ? '⏻&nbsp; Turn crosshair off' : '⏻&nbsp; Turn crosshair on';
    const banner = $('ch-banner-text');
    if (banner) {
      banner.textContent = isPro()
        ? 'Pro active — layers, shapes, sizes, positions and saving are all unlocked.'
        : "You're on the free crosshair. Three presets, in any color you like. Pro unlocks layers, shapes, sizes and position, and lets you save your own designs.";
    }
    const unlock = $('ch-unlock');
    if (unlock) {
      unlock.textContent = isPro() ? 'Pro active ✓' : 'Unlock · $15';
      unlock.disabled = isPro();
      unlock.style.opacity = isPro() ? '0.6' : '1';
    }
  }

  function renderSliders() {
    if (!cfg) return;
    const map = [['ch-size', 'ch-size-v', cfg.size, ''], ['ch-thick', 'ch-thick-v', cfg.thickness, ''],
      ['ch-opacity', 'ch-op-v', Math.round((cfg.opacity || 1) * 100), '%'],
      ['ch-x', 'ch-x-v', cfg.x, ''], ['ch-y', 'ch-y-v', cfg.y, '']];
    map.forEach(([id, vid, val, suf]) => {
      const el = $(id), lab = $(vid);
      if (!el) return;
      if (document.activeElement !== el) el.value = String(val == null ? el.value : (id === 'ch-opacity' ? Math.round((cfg.opacity || 1) * 100) : val));
      if (lab) lab.textContent = String(id === 'ch-opacity' ? Math.round((cfg.opacity || 1) * 100) + '%' : val) + (suf && id !== 'ch-opacity' ? '' : '');
    });
    // First layer mirrors the global sliders in the preview math.
    const save = $('ch-save');
    if (save) {
      save.textContent = isPro() ? 'Save current' : '🔒 Save current';
      save.classList.toggle('locked', !isPro());
    }
  }

  function paintAll() {
    renderPresets();
    renderColors();
    renderSaved();
    renderLayers();
    renderToggle();
    renderSliders();
    renderPreview();
  }

  /* -------------------------------- actions -------------------------------- */
  function needPro(msg) {
    TT.toast(msg || 'That needs Pro ($15) — opening Settings…', 'gold', 3500);
    TT.switchTab('settings');
  }

  async function selectPreset(shape, locked) {
    if (locked) return needPro(`“${SHAPE_LABEL[shape]}” needs Pro — activate in Settings.`);
    const patch = { preset: shape };
    // Pro shapes also retarget the first layer; free shapes stay single-layer.
    if (cfg && cfg.layers && cfg.layers.length) {
      patch.layers = cfg.layers.map((l, i) => (i === 0 ? { ...l, shape } : l));
    }
    const r = await api().set(patch).catch((e) => ({ ok: false, message: String(e) }));
    if (r && r.ok === false) {
      if (/Pro/.test(r.message || '')) return needPro(r.message);
      TT.toast(r.message || 'Failed.', 'error', 4000);
      return;
    }
    if (r && r.config) { cfg = r.config; paintAll(); }
    else await refresh();
  }

  async function setColor(color) {
    const r = await api().set({ color }).catch((e) => ({ ok: false, message: String(e) }));
    if (r && r.ok === false) { TT.toast(r.message || 'Failed.', 'error', 4000); return; }
    if (r && r.config) { cfg = r.config; paintAll(); }
    else await refresh();
  }

  function queueProPush(patch) {
    // Debounce slider drags: 120ms, Pro-gated server-side.
    if (!isPro()) return needPro();
    if (saveTimer) clearTimeout(saveTimer);
    // Optimistic local paint for 60fps slider feel.
    cfg = { ...(cfg || {}), ...(patch || {}) };
    if (patch.size != null || patch.thickness != null || patch.opacity != null) {
      cfg.layers = (cfg.layers || []).map((l) => ({
        ...l,
        size: patch.size != null ? patch.size : l.size,
        thickness: patch.thickness != null ? patch.thickness : l.thickness,
        opacity: patch.opacity != null ? patch.opacity : l.opacity,
      }));
    }
    renderPreview();
    renderSliders();
    saveTimer = setTimeout(async () => {
      const full = { ...patch };
      if (patch.size != null || patch.thickness != null || patch.opacity != null) {
        full.layers = cfg.layers;
      }
      const r = await api().set(full).catch((e) => ({ ok: false, message: String(e) }));
      if (r && r.ok === false) {
        if (/Pro/.test(r.message || '')) return needPro(r.message);
        TT.toast(r.message || 'Failed.', 'error', 4000);
        return;
      }
      if (r && r.config) { cfg = r.config; paintAll(); }
    }, 140);
  }

  async function refresh() {
    try {
      const r = await api().get();
      if (r && r.ok !== false && r.config) {
        cfg = r.config;
        saved = Array.isArray(r.saved) ? r.saved : saved;
        try {
          const g = await TT.api.settings.get();
          if (g && g.ok && Array.isArray(g.crosshairSaved)) saved = g.crosshairSaved;
        } catch (e) { /* saved list is best-effort */ }
        paintAll();
      }
    } catch (e) { /* main unreachable — keep last paint */ }
  }

  /* --------------------------------- wiring -------------------------------- */
  function wire() {
    const tgl = $('ch-toggle');
    if (tgl) tgl.onclick = async () => {
      const r = await api().toggle(!cfg?.enabled).catch((e) => ({ ok: false, message: String(e) }));
      if (r && r.config) { cfg = r.config; paintAll(); }
      else await refresh();
      TT.toast(cfg && cfg.enabled ? 'Crosshair ON — Alt+drag to move.' : 'Crosshair OFF.', cfg && cfg.enabled ? 'success' : '', 2500);
    };
    const rst = $('ch-reset');
    if (rst) rst.onclick = async () => {
      const r = await api().reset().catch((e) => ({ ok: false, message: String(e) }));
      if (r && r.config) { cfg = r.config; paintAll(); }
      else await refresh();
      TT.toast('Crosshair recentered.', 'success', 2200);
    };
    const unl = $('ch-unlock');
    if (unl) unl.onclick = () => TT.switchTab('settings');
    const custom = $('ch-custom-color');
    if (custom) custom.oninput = () => setColor(custom.value);
    const add = $('ch-add-layer');
    if (add) add.onclick = async () => {
      if (!isPro()) return needPro();
      const r = await api().addLayer(cfg?.preset || 'classic').catch((e) => ({ ok: false, message: String(e) }));
      if (r && r.ok === false) {
        if (/Pro/.test(r.message || '')) return needPro(r.message);
        TT.toast(r.message || 'Failed.', 'error', 4000);
        return;
      }
      if (r && r.config) { cfg = r.config; paintAll(); TT.toast('Layer added.', 'success', 2200); }
      else await refresh();
    };
    const save = $('ch-save');
    if (save) save.onclick = async () => {
      if (!isPro()) return needPro('Saving custom designs needs Pro — activate in Settings.');
      const name = await TT.confirm({
        title: 'Save current crosshair',
        body: 'Name this design:',
        input: { placeholder: 'e.g. Valorant main', value: '' },
        okText: 'Save current',
      });
      if (name === null || String(name).trim() === '') return;
      const r = await api().save(String(name).trim().slice(0, 40)).catch((e) => ({ ok: false, message: String(e) }));
      if (r && r.ok === false) {
        if (/Pro/.test(r.message || '')) return needPro(r.message);
        TT.toast(r.message || 'Failed.', 'error', 4000);
        return;
      }
      if (r && r.saved) saved = r.saved;
      else await refresh();
      renderSaved();
      TT.toast('Design saved.', 'success', 2500);
    };
    // Pro sliders.
    const bind = (id, fn) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('input', () => fn(Number(el.value)));
      el.addEventListener('change', () => { if (!isPro()) needPro(); });
    };
    bind('ch-size', (v) => queueProPush({ size: v }));
    bind('ch-thick', (v) => queueProPush({ thickness: v }));
    bind('ch-opacity', (v) => queueProPush({ opacity: v / 100 }));
    bind('ch-x', (v) => queueProPush({ x: v }));
    bind('ch-y', (v) => queueProPush({ y: v }));

    // Live sync: hotkey recenters + Alt+drag nudges push here too.
    try {
      if (api().onUpdate) api().onUpdate((next) => {
        if (!next || typeof next !== 'object') return;
        // Overlay pushes full config; settings pushes may wrap — accept both.
        const incoming = next.config || next;
        if (!incoming || typeof incoming.preset !== 'string') return;
        const structChanged =
          !cfg ||
          incoming.preset !== cfg.preset ||
          incoming.color !== cfg.color ||
          (incoming.layers || []).length !== (cfg.layers || []).length ||
          (incoming.layers || []).some((l, i) => !cfg.layers[i] || l.shape !== cfg.layers[i].shape);
        cfg = incoming;
        if (structChanged) paintAll();
        else {
          // Overlay nudge storms: repaint cheap parts only at 60fps-friendly cost.
          renderPreview();
          renderSliders();
          renderToggle();
        }
      });
    } catch (e) { /* subscription is best-effort */ }
  }

  TT._show.crosshair = async () => {
    try { await TT.refreshLicense(false); } catch (e) { /* tier read is best-effort */ }
    await refresh();
  };
  wire();
  refresh();
})();
