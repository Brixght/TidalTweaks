'use strict';
/* Dashboard tab (Free): cheap live poll (load/mem/uptime every 2.5s) plus a
 * heavy static snapshot (cpu model/gpu/os/disks) loaded ONCE on first show.
 * Rings sweep via stroke-dashoffset (CSS transition), numbers glide via
 * TT.countUp — the "alive" feel without the WMI-every-2-seconds cost. */
(function () {
  const TT = window.TT;
  const CIRC = 326.73; // 2πr, r=52 — matches .ring-fg dasharray in styles.css
  const $ = (id) => document.getElementById(id);
  let timer = null;
  let staticLoaded = false;

  function setRing(el, pct) {
    const p = Math.min(100, Math.max(0, Number(pct) || 0));
    el.style.strokeDashoffset = String(CIRC * (1 - p / 100));
  }

  async function live() {
    let s;
    try { s = await TT.api.sys.live(); }
    catch (e) { return; } // transient failure — next tick retries, never crash
    if (!s || !s.ok) return;
    TT.countUp($('stat-cpu-pct'), s.cpu.usage, { suffix: '%' });
    setRing($('ring-cpu'), s.cpu.usage);
    TT.countUp($('stat-ram-pct'), s.ram.pct, { suffix: '%' });
    setRing($('ring-ram'), s.ram.pct);
    $('stat-ram-detail').textContent =
      `${TT.fmtBytes(s.ram.used)} / ${TT.fmtBytes(s.ram.total)}`;
    // Uptime ticks here too (static snapshot doesn't include it).
    const up = $('stat-uptime');
    if (up.dataset.host !== undefined) up.textContent = `${TT.fmtUptime(s.uptimeSec)} · ${up.dataset.host}`;
  }

  async function statics() {
    if (staticLoaded) return;
    let s;
    try { s = await TT.api.sys.static(); }
    catch (e) { return; }
    if (!s || !s.ok) return;
    staticLoaded = true;
    $('stat-cpu-model').textContent =
      `${s.cpu.model} · ${s.cpu.physical}C/${s.cpu.logical}T` +
      (s.cpu.speedGHz ? ` @ ${Number(s.cpu.speedGHz).toFixed(1)} GHz` : '');
    $('stat-gpu').textContent = (s.gpu && s.gpu.length ? s.gpu.slice(0, 2).join(' · ') : 'Unknown GPU');
    $('stat-os').textContent = `${s.os.name} (${s.os.arch})`;
    $('stat-build').textContent = s.os.build || '—';
    // Compatibility heads-up (the honest-TOS touch): 24H2+ (build 26100+)
    // reshuffles internals, so aggressive tweaks deserve extra caution there.
    const warn = $('compat-warn');
    if (warn) {
      const buildNum = parseInt(String(s.os.build || '').match(/(\d+)/)?.[1] || '0', 10);
      if (buildNum >= 26100) {
        warn.hidden = false;
        warn.textContent = `⚠ Windows build ${buildNum} (24H2+) detected — some deep tweaks (HAGS, VBS, HPET) are less predictable here. Restore points are created automatically, but go easy.`;
      } else warn.hidden = true;
    }
    const up = $('stat-uptime');
    up.dataset.host = s.os.hostname || '';
    const dl = $('disk-list');
    dl.innerHTML = '';
    (s.disks || []).forEach((d) => {
      const row = document.createElement('div');
      row.style.marginBottom = '10px';
      const label = document.createElement('div');
      label.className = 'dim';
      label.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:4px';
      const name = document.createElement('span');
      name.textContent = `${d.mount || d.fs}`;
      const vals = document.createElement('span');
      vals.textContent = `${TT.fmtBytes(d.used)} / ${TT.fmtBytes(d.size)} · ${Math.round(d.pct)}%`;
      label.append(name, vals);
      const bar = document.createElement('div');
      bar.className = 'bar';
      const fill = document.createElement('div');
      fill.className = 'bar-fill';
      // rAF so the CSS width transition animates from the old value
      requestAnimationFrame(() => { fill.style.width = Math.min(100, d.pct) + '%'; });
      bar.appendChild(fill);
      row.append(label, bar);
      dl.appendChild(row);
    });
  }

  // Poll only while the dashboard is visible — switching away pauses the
  // interval so background tabs cost nothing on low-end machines.
  function visible() {
    const p = $('page-dashboard');
    return p && p.classList.contains('active');
  }
  TT._show.dashboard = () => {
    statics();
    live();
    if (!timer) timer = setInterval(() => { if (visible()) live(); }, 2500);
  };
  statics();
  live();
  timer = setInterval(() => { if (visible()) live(); }, 2500);
})();
