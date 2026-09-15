'use strict';
/* Crosshair tab — granular per-layer controls (screenshot spec).
 * Free: 6 shapes (Cross/Dot+/Dot/T/X/Ring), layer-1 color, on/off toggle.
 * Pro (tier >= 2, enforced in main): MY CROSSHAIRS save/load, LAYERS add/
 * remove/visibility, SIZE sliders, OUTLINE toggle+thickness+color, CENTER
 * DOT toggle, POSITION sliders + Recenter + 1px nudge arrows. Purple #8B5CF6
 * marks every Pro control; locked sections grey out with a 🔒 Pro badge. */
(function () {
  const TT = window.TT;
  const $ = (id) => document.getElementById(id);
  const api = () => TT.api.crosshair;

  const SHAPES = [
    { id: 'cross', label: 'Cross' },
    { id: 'dot-plus', label: 'Dot+' },
    { id: 'dot', label: 'Dot' },
    { id: 't', label: 'T' },
    { id: 'x', label: 'X' },
    { id: 'ring', label: 'Ring' },
  ];
  const SHAPE_LABEL = { cross: 'cross', 'dot-plus': 'dot+', dot: 'dot', t: 't', x: 'x', ring: 'ring' };
  const COLORS = ['#22FF88', '#22D3EE', '#FF4DFF', '#FFD21F', '#FF4D4D', '#FFFFFF', '#111827', '#8B5CF6'];

  let cfg = null;
  let saved = [];
  let selId = null;
  let pushTimer = null;
  const isPro = () => TT && (TT.pro || (TT.tier || 0) >= 2);

  function selIndex() {
    if (!cfg || !cfg.layers) return 0;
    const i = cfg.layers.findIndex((l) => l.id === selId);
    return i >= 0 ? i : 0;
  }
  function selLayer() {
    if (!cfg || !cfg.layers || !cfg.layers.length) return null;
    return cfg.layers[selIndex()];
  }

  /* ------------------------- shape tile icons ---------------------------- */
  function shapeIcon(shape, color) {
    const c = color || '#22FF88';
    const cx = 17, cy = 17, half = 11, gap = 3.5, t = 2.6;
    const L = (x1, y1, x2, y2) =>
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${t}" stroke-linecap="round"/>`;
    const C = (r, fill, strokeC, w) =>
      `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill ? c : 'none'}"${fill ? '' : ` stroke="${strokeC || c}" stroke-width="${w || t}"`}/>`;
    let inner = '';
    if (shape === 'dot') inner = C(7, true);
    else if (shape === 'dot-plus') inner = L(cx - half, cy, cx - gap, cy) + L(cx + gap, cy, cx + half, cy) + L(cx, cy - half, cx, cy - gap) + L(cx, cy + gap, cx, cy + half) + C(2.6, true);
    else if (shape === 't') inner = L(cx - half, cy - 6, cx + half, cy - 6) + L(cx, cy - 6, cx, cy + 9);
    else if (shape === 'x') inner = L(cx - 8, cy - 8, cx + 8, cy + 8) + L(cx - 8, cy + 8, cx + 8, cy - 8);
    else if (shape === 'ring') inner = C(10, false) + C(1.8, true);
    else inner = L(cx - half, cy, cx - gap, cy) + L(cx + gap, cy, cx + half, cy) + L(cx, cy - half, cx, cy - gap) + L(cx, cy + gap, cx, cy + half);
    return `<svg viewBox="0 0 34 34" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
  }

  /* ----------------- preview (mirrors overlay drawing) ------------------- */
  function drawLayerPreview(g, NS, l, cx, cy) {
    const len = Number(l.length) || 10;
    const th = Number(l.thickness) || 2;
    const gap = Number(l.gap) || 0;
    const col = l.color || '#22FF88';
    const ol = l.outline || {};
    const useOl = !!ol.enabled;
    const olTh = Number(ol.thickness) || 1;
    const olCol = ol.color || '#000000';
    const dot = !!(l.centerDot && l.centerDot.enabled);
    const dotR = Math.max(2, th);
    const half = gap + len;
    const mkLine = (x1, y1, x2, y2, c, w) => {
      const e = document.createElementNS(NS, 'line');
      e.setAttribute('x1', x1); e.setAttribute('y1', y1);
      e.setAttribute('x2', x2); e.setAttribute('y2', y2);
      e.setAttribute('stroke', c); e.setAttribute('stroke-width', w);
      e.setAttribute('stroke-linecap', 'round');
      g.appendChild(e);
    };
    const mkFill = (r, c) => {
      const e = document.createElementNS(NS, 'circle');
      e.setAttribute('cx', cx); e.setAttribute('cy', cy);
      e.setAttribute('r', r); e.setAttribute('fill', c);
      g.appendChild(e);
    };
    const mkRing = (r, c, w) => {
      const e = document.createElementNS(NS, 'circle');
      e.setAttribute('cx', cx); e.setAttribute('cy', cy); e.setAttribute('r', r);
      e.setAttribute('fill', 'none'); e.setAttribute('stroke', c);
      e.setAttribute('stroke-width', w);
      g.appendChild(e);
    };
    const shape = (pass) => {
      const w = pass === 0 ? th + 2 * olTh : th;
      const c = pass === 0 ? olCol : col;
      const sh = l.shape || 'cross';
      if (sh === 'dot') mkFill(Math.max(2, len / 2) + (pass === 0 ? olTh : 0), c);
      else if (sh === 'ring') {
        mkRing(len + (pass === 0 ? olTh : 0), c, w);
        if (pass === 1) mkFill(Math.max(1.2, th * 0.5), c);
      } else if (sh === 'x') {
        const d = half * 0.75;
        mkLine(cx - d, cy - d, cx + d, cy + d, c, w);
        mkLine(cx - d, cy + d, cx + d, cy - d, c, w);
      } else if (sh === 't') {
        mkLine(cx - half, cy - half * 0.55, cx + half, cy - half * 0.55, c, w);
        mkLine(cx, cy - half * 0.55, cx, cy + half * 0.8, c, w);
      } else {
        mkLine(cx - half, cy, cx - gap, cy, c, w);
        mkLine(cx + gap, cy, cx + half, cy, c, w);
        mkLine(cx, cy - half, cx, cy - gap, c, w);
        mkLine(cx, cy + gap, cx, cy + half, c, w);
        if (sh === 'dot-plus' || (pass === 1 && dot)) mkFill(dotR + (pass === 0 ? olTh : 0), c);
        else if (pass === 0 && dot) mkFill(dotR + olTh, c);
      }
      if (pass === 1 && dot && sh !== 'cross' && sh !== 'dot-plus') mkFill(dotR, c);
      if (pass === 0 && dot && useOl && sh !== 'cross' && sh !== 'dot-plus' && sh !== 'dot' && sh !== 'ring') mkFill(dotR + olTh, c);
    };
    if (useOl) shape(0);
    shape(1);
  }
  function renderPreview() {
    const svg = $('ch-preview-svg');
    if (!svg || !cfg) return;
    const NS = 'http://www.w3.org/2000/svg';
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const cx = 100 + (Number(cfg.x) || 0) * 0.12;
    const cy = 80 + (Number(cfg.y) || 0) * 0.12;
    (cfg.layers || []).forEach((l) => {
      if (l.visible === false) return;
      const g = document.createElementNS(NS, 'g');
      drawLayerPreview(g, NS, l, cx, cy);
      svg.appendChild(g);
    });
  }

  /* -------------------------------- renders ------------------------------ */
  function needPro(msg) {
    TT.toast(msg || 'That needs Pro ($15) — opening Settings…', 'gold', 3500);
    TT.switchTab('settings');
  }

  function renderLocks() {
    const pro = isPro();
    document.querySelectorAll('#page-crosshair [data-lock]').forEach((el) => {
      el.textContent = pro ? 'Pro' : '🔒 Pro';
      el.classList.toggle('unlocked', pro);
    });
    ['ch-sec-layers', 'ch-sec-size', 'ch-sec-outline', 'ch-sec-dot', 'ch-sec-position'].forEach((id) => {
      const sec = $(id);
      if (sec) sec.classList.toggle('locked', !pro);
    });
    // Sliders + color inputs in locked sections: hard-disable for Free.
    ['ch-len', 'ch-thick', 'ch-gap', 'ch-ol-thick', 'ch-ol-custom', 'ch-x', 'ch-y'].forEach((id) => {
      const el = $(id);
      if (el) {
        el.disabled = !pro;
        el.title = pro ? '' : 'Requires Pro';
      }
    });
    ['ch-outline-toggle', 'ch-dot-toggle'].forEach((id) => {
      const el = $(id);
      if (el) el.title = pro ? '' : 'Requires Pro';
    });
    ['ch-n-left', 'ch-n-up', 'ch-n-down', 'ch-n-right', 'ch-reset'].forEach((id) => {
      const el = $(id);
      if (el) el.title = pro ? '' : 'Requires Pro';
    });
    const save = $('ch-save');
    if (save) {
      save.innerHTML = pro ? 'Save current' : '🔒 Save current';
      save.title = pro ? '' : 'Saving custom designs needs Pro';
    }
    const add = $('ch-add-layer');
    if (add) {
      add.innerHTML = pro ? '+ Add' : '🔒 + Add';
      add.title = pro ? '' : 'Layers need Pro';
    }
    const banner = $('ch-banner-text');
    if (banner) {
      banner.textContent = pro
        ? 'Pro active — layers, sizes, outline, center dot, position and saving are all unlocked.'
        : "You're on the free crosshair. Six shapes, in any color you like. Pro unlocks layers, sizes, outline, center dot, position, and lets you save your own designs.";
    }
    const unlock = $('ch-unlock');
    if (unlock) {
      unlock.textContent = pro ? 'Pro active ✓' : 'Unlock · $15';
      unlock.disabled = pro;
      unlock.style.opacity = pro ? '0.6' : '1';
    }
  }

  function renderSaved() {
    const box = $('ch-saved');
    if (!box) return;
    box.innerHTML = '';
    if (!saved.length) {
      box.innerHTML = '<p class="dim">Nothing saved yet. Build a crosshair you like, then hit Save current to keep it.</p>';
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
        if (r && r.ok === false) {
          if (/Pro/.test(r.message || '')) return needPro(r.message);
          TT.toast(r.message || 'Failed.', 'error', 4000);
          return;
        }
        await refresh();
        TT.toast('Loaded.', 'success', 2200);
      };
      const del = document.createElement('button');
      del.className = 'ch-mini-btn danger';
      del.textContent = '✕';
      del.title = 'Delete saved design';
      del.onclick = async () => {
        if (!isPro()) return needPro();
        const ok = await TT.confirm({ title: `Delete “${s.name}”?`, body: 'This saved design will be removed.', okText: 'Delete' });
        if (!ok) return;
        const r = await api().deleteSaved(i).catch((e) => ({ ok: false, message: String(e) }));
        if (r && r.ok === false) { TT.toast(r.message || 'Failed.', 'error', 4000); return; }
        if (r && r.saved) saved = r.saved;
        else await refresh();
        renderSaved();
      };
      row.append(b, small, load, del);
      box.appendChild(row);
    });
  }

  function renderLayers() {
    const box = $('ch-layers');
    if (!box || !cfg) return;
    box.innerHTML = '';
    (cfg.layers || []).forEach((l, i) => {
      const row = document.createElement('div');
      row.className = 'ch-layer-row' + (i === selIndex() ? ' selected' : '') + (l.visible === false ? ' hidden-layer' : '');
      row.title = isPro() ? 'Click to edit this layer' : 'Layers need Pro';
      const sw = document.createElement('span');
      sw.className = 'ch-layer-swatch';
      sw.style.background = l.color || '#22FF88';
      sw.title = isPro() ? 'Toggle visibility' : 'Layers need Pro';
      sw.onclick = (e) => {
        e.stopPropagation();
        if (!isPro()) return needPro();
        selId = l.id;
        const layers = (cfg.layers || []).map((x) => (x.id === l.id ? { ...x, visible: !(x.visible !== false) } : x));
        cfg = { ...cfg, layers };
        renderLayers(); renderPreview();
        pushLayersNow();
      };
      const b = document.createElement('b');
      b.textContent = `Layer ${i + 1} - ${SHAPE_LABEL[l.shape] || l.shape} - ${Number(l.thickness) || 2}px`;
      const rm = document.createElement('button');
      rm.className = 'ch-mini-btn danger';
      rm.textContent = '✕';
      rm.title = 'Remove layer';
      rm.onclick = async (e) => {
        e.stopPropagation();
        if (!isPro()) return needPro();
        if ((cfg.layers || []).length <= 1) { TT.toast('Keep at least one layer.', '', 2500); return; }
        const r = await api().removeLayer(l.id).catch((er) => ({ ok: false, message: String(er) }));
        if (r && r.ok === false) { TT.toast(r.message || 'Failed.', 'error', 4000); return; }
        if (selId === l.id) selId = null;
        if (r && r.config) { cfg = r.config; paintAll(); }
        else await refresh();
      };
      row.onclick = () => {
        if (!isPro() && (cfg.layers || []).length > 1) return needPro();
        selId = l.id;
        paintAll();
      };
      row.append(sw, b, rm);
      box.appendChild(row);
    });
  }

  function renderShapes() {
    const box = $('ch-shapes');
    const l = selLayer();
    if (!box || !l) return;
    const title = $('ch-shape-title');
    if (title) title.textContent = `SHAPE - LAYER ${selIndex() + 1}`;
    box.innerHTML = '';
    SHAPES.forEach((s) => {
      const el = document.createElement('div');
      el.className = 'ch-shape' + (l.shape === s.id ? ' selected' : '');
      el.title = s.label;
      el.innerHTML = shapeIcon(s.id, l.color) + `<span>${s.label}</span><i class="ch-sel-dot"></i>`;
      el.onclick = () => selectShape(s.id);
      box.appendChild(el);
    });
  }

  function renderColors() {
    const box = $('ch-colors');
    const l = selLayer();
    if (!box || !l) return;
    box.innerHTML = '';
    COLORS.forEach((c) => {
      const el = document.createElement('div');
      el.className = 'ch-swatch' + (String(l.color).toLowerCase() === c.toLowerCase() ? ' selected' : '');
      el.style.background = c;
      el.title = c;
      el.onclick = () => setColor(c);
      box.appendChild(el);
    });
    const custom = $('ch-custom-color');
    if (custom && document.activeElement !== custom) {
      custom.value = /^#[0-9a-f]{6}$/i.test(l.color || '') ? l.color : '#22ff88';
    }
  }

  function setSlider(id, vid, val, suffix) {
    const el = $(id), lab = $(vid);
    if (el && document.activeElement !== el) el.value = String(val);
    if (lab) lab.textContent = `${val}${suffix || ''}`;
  }
  function renderSize() {
    const l = selLayer();
    if (!l) return;
    setSlider('ch-len', 'ch-len-v', Number(l.length) || 10, ' px');
    setSlider('ch-thick', 'ch-thick-v', Number(l.thickness) || 2, ' px');
    setSlider('ch-gap', 'ch-gap-v', Number(l.gap) || 0, ' px');
  }
  function renderOutline() {
    const l = selLayer();
    if (!l) return;
    const tgl = $('ch-outline-toggle');
    if (tgl && document.activeElement !== tgl) tgl.checked = !!(l.outline && l.outline.enabled);
    setSlider('ch-ol-thick', 'ch-ol-thick-v', (l.outline && Number(l.outline.thickness)) || 1, ' px');
    const sw = $('ch-ol-swatch');
    if (sw) sw.style.background = (l.outline && l.outline.color) || '#000000';
    const custom = $('ch-ol-custom');
    if (custom && document.activeElement !== custom) {
      custom.value = /^#[0-9a-f]{6}$/i.test((l.outline && l.outline.color) || '') ? l.outline.color : '#000000';
    }
  }
  function renderDot() {
    const l = selLayer();
    const tgl = $('ch-dot-toggle');
    if (tgl && l && document.activeElement !== tgl) tgl.checked = !!(l.centerDot && l.centerDot.enabled);
  }
  function renderPosition() {
    if (!cfg) return;
    setSlider('ch-x', 'ch-x-v', Number(cfg.x) || 0, ' px');
    setSlider('ch-y', 'ch-y-v', Number(cfg.y) || 0, ' px');
  }
  function renderToggle() {
    const btn = $('ch-toggle');
    if (!btn || !cfg) return;
    const on = !!cfg.enabled;
    btn.classList.toggle('on', on);
    btn.innerHTML = on ? '⏻&nbsp; Turn crosshair off' : '⏻&nbsp; Turn crosshair on';
  }

  function paintAll() {
    if (!cfg) return;
    if (!cfg.layers || !cfg.layers.length) return;
    if (!cfg.layers.some((l) => l.id === selId)) selId = cfg.layers[0].id;
    renderLocks();
    renderSaved();
    renderLayers();
    renderShapes();
    renderColors();
    renderSize();
    renderOutline();
    renderDot();
    renderPosition();
    renderToggle();
    renderPreview();
  }

  /* -------------------------------- actions ------------------------------ */
  async function refresh() {
    try {
      const r = await api().get();
      if (r && r.ok !== false && r.config) {
        cfg = r.config;
        if (Array.isArray(r.saved)) saved = r.saved;
        paintAll();
      }
    } catch (e) { /* main unreachable — keep last paint */ }
  }

  async function selectShape(shape) {
    if (!isPro()) {
      const r = await api().set({ shape }).catch((e) => ({ ok: false, message: String(e) }));
      if (r && r.ok === false) { TT.toast(r.message || 'Failed.', 'error', 4000); return; }
      if (r && r.config) { cfg = r.config; paintAll(); }
      else await refresh();
      return;
    }
    updateSelLayer({ shape });
  }

  async function setColor(color) {
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return;
    if (!isPro() && selIndex() === 0) {
      const r = await api().set({ color }).catch((e) => ({ ok: false, message: String(e) }));
      if (r && r.ok === false) { TT.toast(r.message || 'Failed.', 'error', 4000); return; }
      if (r && r.config) { cfg = r.config; paintAll(); }
      else await refresh();
      return;
    }
    if (!isPro()) return needPro();
    updateSelLayer({ color });
  }

  /* Patch the SELECTED layer (Pro). */
  function updateSelLayer(patch, immediate) {
    if (!isPro()) return needPro();
    const i = selIndex();
    const layers = (cfg.layers || []).map((l, j) => (j === i ? { ...l, ...patch } : l));
    cfg = { ...cfg, layers };
    // Optimistic repaint for 60fps slider feel; persist debounced.
    renderLayers(); renderShapes(); renderColors();
    renderSize(); renderOutline(); renderDot(); renderPreview();
    if (pushTimer) clearTimeout(pushTimer);
    if (immediate) {
      pushLayersNow();
    } else {
      pushTimer = setTimeout(pushLayersNow, 140);
    }
  }
  async function pushLayersNow() {
    if (!cfg) return;
    const r = await api().set({ layers: cfg.layers }).catch((e) => ({ ok: false, message: String(e) }));
    if (r && r.ok === false) {
      if (/Pro/.test(r.message || '')) return needPro(r.message);
      TT.toast(r.message || 'Failed.', 'error', 4000);
      return;
    }
    if (r && r.config) { cfg = r.config; paintAll(); }
  }

  function pushPosition(patch) {
    if (!isPro()) return needPro();
    cfg = { ...cfg, ...patch };
    renderPosition(); renderPreview();
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => {
      const r = await api().set(patch).catch((e) => ({ ok: false, message: String(e) }));
      if (r && r.ok === false) {
        if (/Pro/.test(r.message || '')) return needPro(r.message);
        TT.toast(r.message || 'Failed.', 'error', 4000);
        return;
      }
      if (r && r.config) { cfg = r.config; paintAll(); }
    }, 140);
  }

  /* --------------------------------- wiring ------------------------------ */
  function wire() {
    const tgl = $('ch-toggle');
    if (tgl) tgl.onclick = async () => {
      const r = await api().toggle(!cfg?.enabled).catch((e) => ({ ok: false, message: String(e) }));
      if (r && r.config) { cfg = r.config; paintAll(); }
      else await refresh();
      TT.toast(cfg && cfg.enabled ? 'Crosshair ON — Alt+drag to move (Pro).' : 'Crosshair OFF.', cfg && cfg.enabled ? 'success' : '', 2500);
    };
    const rst = $('ch-reset');
    if (rst) rst.onclick = async () => {
      if (!isPro()) return needPro('Recenter needs Pro — activate in Settings.');
      const r = await api().reset().catch((e) => ({ ok: false, message: String(e) }));
      if (r && r.ok === false) {
        if (/Pro/.test(r.message || '')) return needPro(r.message);
        TT.toast(r.message || 'Failed.', 'error', 4000);
        return;
      }
      if (r && r.config) { cfg = r.config; paintAll(); }
      else await refresh();
      TT.toast('Crosshair recentered.', 'success', 2200);
    };
    const unl = $('ch-unlock');
    if (unl) unl.onclick = () => TT.switchTab('settings');
    const custom = $('ch-custom-color');
    if (custom) custom.oninput = () => setColor(custom.value);
    const olCustom = $('ch-ol-custom');
    if (olCustom) olCustom.oninput = () => {
      if (!isPro()) return needPro();
      const l = selLayer();
      const ol = { ...((l && l.outline) || {}), color: olCustom.value };
      updateSelLayer({ outline: ol });
    };
    const add = $('ch-add-layer');
    if (add) add.onclick = async () => {
      if (!isPro()) return needPro();
      const l = selLayer();
      const r = await api().addLayer((l && l.shape) || 'cross').catch((e) => ({ ok: false, message: String(e) }));
      if (r && r.ok === false) {
        if (/Pro/.test(r.message || '')) return needPro(r.message);
        TT.toast(r.message || 'Failed.', 'error', 4000);
        return;
      }
      if (r && r.config) {
        cfg = r.config;
        selId = cfg.layers[cfg.layers.length - 1].id;
        paintAll();
        TT.toast('Layer added.', 'success', 2200);
      } else await refresh();
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

    // Pro sliders (selected layer).
    const bindLayer = (id, fn) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('input', () => {
        if (!isPro()) return;
        fn(Number(el.value));
      });
    };
    bindLayer('ch-len', (v) => updateSelLayer({ length: v }));
    bindLayer('ch-thick', (v) => updateSelLayer({ thickness: v }));
    bindLayer('ch-gap', (v) => updateSelLayer({ gap: v }));
    bindLayer('ch-ol-thick', (v) => {
      const l = selLayer();
      updateSelLayer({ outline: { ...((l && l.outline) || {}), thickness: v } });
    });
    // Position sliders (whole crosshair).
    const bindPos = (id, key) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('input', () => pushPosition({ [key]: Number(el.value) }));
    };
    bindPos('ch-x', 'x');
    bindPos('ch-y', 'y');
    // 1px nudge arrows.
    const nudge = (dx, dy) => async () => {
      if (!isPro()) return needPro('Nudging needs Pro — activate in Settings.');
      const r = await api().nudge(dx, dy).catch((e) => ({ ok: false, message: String(e) }));
      if (r && r.ok === false) {
        if (/Pro/.test(r.message || '')) return needPro(r.message);
        TT.toast(r.message || 'Failed.', 'error', 4000);
        return;
      }
      if (r && r.config) { cfg = r.config; renderPosition(); renderPreview(); renderToggle(); }
      else await refresh();
    };
    const nl = $('ch-n-left'); if (nl) nl.onclick = nudge(-1, 0);
    const nr = $('ch-n-right'); if (nr) nr.onclick = nudge(1, 0);
    const nu = $('ch-n-up'); if (nu) nu.onclick = nudge(0, -1);
    const nd = $('ch-n-down'); if (nd) nd.onclick = nudge(0, 1);

    // Outline + center-dot toggles (selected layer, Pro).
    const olTgl = $('ch-outline-toggle');
    if (olTgl) olTgl.onchange = () => {
      if (!isPro()) { olTgl.checked = !olTgl.checked; return needPro(); }
      const l = selLayer();
      updateSelLayer({ outline: { ...((l && l.outline) || {}), enabled: olTgl.checked } }, true);
    };
    const dotTgl = $('ch-dot-toggle');
    if (dotTgl) dotTgl.onchange = () => {
      if (!isPro()) { dotTgl.checked = !dotTgl.checked; return needPro(); }
      updateSelLayer({ centerDot: { enabled: dotTgl.checked } }, true);
    };

    // Live sync: hotkey recenters + Alt+drag nudges push here too.
    try {
      if (api().onUpdate) api().onUpdate((next) => {
        if (!next || typeof next !== 'object') return;
        const incoming = next.config || next;
        if (!incoming || !Array.isArray(incoming.layers)) return;
        cfg = incoming;
        paintAll();
      });
    } catch (e) { /* subscription is best-effort */ }
    // Pro-gate feedback for the global hotkey (no IPC return path).
    try {
      if (api().onNotice) api().onNotice((msg) => {
        const text = (msg && msg.message) || 'Crosshair notice.';
        if (/Pro/.test(text)) needPro(text);
        else TT.toast(text, '', 3000);
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
