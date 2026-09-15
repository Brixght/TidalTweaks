'use strict';
/* Benchmark tab (Free): standardized before/after measurement.
 * CPU/RAM/Disk run in the main process (core/benchmark.js, time-boxed);
 * GPU runs HERE on a WebGL canvas (Chromium-only API, always 30s per its
 * spec while other tests follow the picked duration). Every completed test
 * saves to local history (<userData>/benchmarks/history.json) with the
 * tweak ids that were on record — exports and comparisons show them.
 * Overall score = mean of the present test scores (rounded). */
(function () {
  const TT = window.TT;
  const $ = (id) => document.getElementById(id);
  const api = () => TT.api.bench;

  const DUR_MS = { quick: 30000, standard: 120000, deep: 300000 };
  const GPU_MS = 30000; // GPU test is fixed-length per spec (frames in 30s)
  let duration = 'quick';
  let running = false;
  let history = [];
  let session = {}; // latest in-page results { cpu, ram, disk, gpu }

  /* ------------------------------ helpers ------------------------------- */
  function setBusy(test, busy) {
    const bar = $(`bench-${test}-bar`);
    if (bar) {
      bar.classList.toggle('bench-busy', busy); // shimmer sweep (CSS keyframes)
      if (busy) bar.style.width = '100%';
    }
  }
  function setScore(test, value) {
    const el = $(`bench-${test}-score`);
    if (el && typeof value === 'number') TT.countUp(el, value); // animated count-up
    else if (el) el.textContent = '–';
  }
  function status(msg) {
    const el = $('bench-status');
    if (el) el.textContent = msg;
  }
  function setButtons(disabled) {
    ['bench-run-all', 'bench-run-cpu', 'bench-run-ram', 'bench-run-gpu', 'bench-run-disk',
     'bench-compare-go', 'bench-export-csv', 'bench-export-json', 'bench-export-png'].forEach((id) => {
      const el = $(id);
      if (el) el.disabled = disabled;
    });
    document.querySelectorAll('.bench-dur').forEach((b) => { b.disabled = disabled; });
  }
  function overall(run) {
    const scores = [run.cpu && run.cpu.score, run.ram && run.ram.score,
      run.disk && run.disk.score, run.gpu && run.gpu.score]
      .filter((s) => typeof s === 'number');
    if (!scores.length) return null;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }
  function runLabel(run, i) {
    const d = new Date(run.at || Date.now());
    const o = overall(run);
    return `#${i + 1} ${d.toLocaleString()} · ${o === null ? 'partial' : o + ' pts'}`;
  }

  /* --------------------------- CPU/RAM/Disk ----------------------------- */
  async function runCore(test) {
    setBusy(test, true);
    status(`Running ${test.toUpperCase()}… (${Math.round(DUR_MS[duration] / 1000)}s, app stays usable)`);
    let res;
    try { res = await api().runTest(test, DUR_MS[duration]); }
    catch (e) { res = { ok: false, message: String(e) }; }
    setBusy(test, false);
    const bar = $(`bench-${test}-bar`);
    if (bar) bar.style.width = res && res.ok ? '100%' : '0%';
    if (!res || !res.ok) {
      setScore(test, null);
      $(`bench-${test}-detail`).textContent = `✗ ${((res && res.message) || 'failed')}`;
      TT.toast(`${test.toUpperCase()} failed: ${(res && res.message) || 'unknown'}`, 'error', 5000);
      return null;
    }
    session[test] = res;
    paintCore(test, res);
    return res;
  }
  function paintCore(test, res) {
    setScore(test, res.score);
    const d = $(`bench-${test}-detail`);
    if (!d) return;
    if (test === 'cpu') {
      d.textContent = `Single ${res.single} · Multi ${res.multi} · ${res.cores} threads`;
      const cores = $('bench-cpu-cores');
      if (cores) cores.textContent = `${res.cores} threads`;
    } else if (test === 'ram') {
      d.textContent = `Read ${res.readGBs} GB/s · Write ${res.writeGBs} GB/s · ${res.latencyNs} ns`;
    } else if (test === 'disk') {
      d.textContent = `Seq ${res.seqReadMBs}/${res.seqWriteMBs} MB/s · Rand ${res.randReadIOPS}/${res.randWriteIOPS} IOPS`;
    }
  }

  /* -------------------------------- GPU --------------------------------- */
  function gpuGL(canvas) {
    try {
      return canvas.getContext('webgl', { antialias: false }) ||
        canvas.getContext('experimental-webgl', { antialias: false });
    } catch (e) { return null; }
  }
  /* Fixed 30s scene: a grid of rotating colored triangles. Frame times are
   * collected every rAF; score = avg FPS × 10 (documented, comparable). */
  function runGpu() {
    return new Promise((resolve) => {
      const canvas = $('bench-gpu-canvas');
      const gl = canvas && gpuGL(canvas);
      if (!gl) {
        resolve({ ok: false, message: 'WebGL unavailable in this window.' });
        return;
      }
      const vs = 'attribute vec2 p;uniform float t;uniform float k;void main(){float a=t*(0.5+k*0.13);mat2 r=mat2(cos(a),-sin(a),sin(a),cos(a));gl_Position=vec4(r*(p*0.7+vec2(float(int(k/8))*0.22-0.16,float(int(mod(k,8.0)))*0.22-0.77)),0.0,1.0);}';
      const fs = 'precision mediump float;uniform float k;void main(){gl_FragColor=vec4(abs(sin(k*1.7)),abs(sin(k*2.3+2.0)),abs(sin(k*3.1+4.0)),1.0);}';
      function shader(type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        return gl.COMPILE_STATUS && gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
      }
      const v = shader(gl.VERTEX_SHADER, vs);
      const f = shader(gl.FRAGMENT_SHADER, fs);
      if (!v || !f) { resolve({ ok: false, message: 'Shader compile failed.' }); return; }
      const prog = gl.createProgram();
      gl.attachShader(prog, v);
      gl.attachShader(prog, f);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { resolve({ ok: false, message: 'Shader link failed.' }); return; }
      gl.useProgram(prog);
      // One small triangle, instanced 48× via the k uniform.
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0.5, -0.45, -0.4, 0.45, -0.4]), gl.STATIC_DRAW);
      const locP = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(locP);
      gl.vertexAttribPointer(locP, 2, gl.FLOAT, false, 0, 0);
      const locT = gl.getUniformLocation(prog, 't');
      const locK = gl.getUniformLocation(prog, 'k');
      gl.viewport(0, 0, canvas.width, canvas.height);
      const times = [];
      const t0 = performance.now();
      const end = t0 + GPU_MS;
      let last = t0;
      let frames = 0;
      setBusy('gpu', true);
      status('Running GPU… (30s WebGL scene)');
      (function frame(now) {
        const dt = now - last;
        last = now;
        times.push(dt);
        frames++;
        const t = (now - t0) / 1000;
        gl.clearColor(0.04, 0.07, 0.14, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        for (let k = 0; k < 48; k++) {
          gl.uniform1f(locT, t);
          gl.uniform1f(locK, k);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        if (now < end) requestAnimationFrame(frame);
        else {
          setBusy('gpu', false);
          const secs = (now - t0) / 1000;
          const avgFps = frames / secs;
          const worst = Math.max(...times);
          const minFps = 1000 / (worst || 16.7);
          resolve({
            ok: true,
            frames, secs: Math.round(secs * 10) / 10,
            avgFps: Math.round(avgFps * 10) / 10,
            minFps: Math.round(minFps * 10) / 10,
            score: Math.round(avgFps * 10),
          });
        }
      })(t0);
    });
  }
  async function runGpuTest() {
    const res = await runGpu();
    const bar = $('bench-gpu-bar');
    if (bar) bar.style.width = res && res.ok ? '100%' : '0%';
    if (!res || !res.ok) {
      setScore('gpu', null);
      $('bench-gpu-detail').textContent = `✗ ${((res && res.message) || 'failed')}`;
      TT.toast('GPU test failed: ' + ((res && res.message) || 'unknown'), 'error', 5000);
      return null;
    }
    session.gpu = res;
    setScore('gpu', res.score);
    $('bench-gpu-detail').textContent = `Avg ${res.avgFps} FPS · Min ${res.minFps} FPS · ${res.frames} frames`;
    return res;
  }

  /* ------------------------------ saving -------------------------------- */
  async function saveSession() {
    if (!session.cpu && !session.ram && !session.disk && !session.gpu) return;
    try {
      const r = await api().save({
        durationMs: DUR_MS[duration], duration,
        cpu: session.cpu || null, ram: session.ram || null,
        disk: session.disk || null, gpu: session.gpu || null,
        overall: overall(session),
      });
      if (r && r.ok) await refreshHistory();
    } catch (e) { TT.toast('Save failed: ' + String(e), 'error', 4000); }
  }
  /* Single-test saves carry ONLY the test that just ran (nulls elsewhere),
   * so history never mixes fresh numbers with stale session leftovers.
   * Run-all saves one complete entry instead. */
  async function saveSingle(test, res) {
    if (!res) return;
    try {
      const entry = { durationMs: DUR_MS[duration], duration, overall: res.score || null };
      entry[test] = res;
      const r = await api().save(entry);
      if (r && r.ok) await refreshHistory();
    } catch (e) { TT.toast('Save failed: ' + String(e), 'error', 4000); }
  }

  async function runAll() {
    if (running) return;
    running = true;
    setButtons(true);
    session = {};
    status('Benchmark running — CPU first…');
    await runCore('cpu');
    await runCore('ram');
    await runGpuTest();
    await runCore('disk');
    await saveSession();
    status('Done — run saved to history.');
    TT.toast('Benchmark complete — run saved.', 'success', 3500);
    running = false;
    setButtons(false);
  }

  /* --------------------------- compare ---------------------------------- */
  const METRICS = [
    ['Overall', (r) => overall(r), 'high', (v) => `${v} pts`],
    ['CPU single', (r) => r.cpu && r.cpu.single, 'high', (v) => `${v}`],
    ['CPU multi', (r) => r.cpu && r.cpu.multi, 'high', (v) => `${v}`],
    ['RAM read', (r) => r.ram && r.ram.readGBs, 'high', (v) => `${v} GB/s`],
    ['RAM write', (r) => r.ram && r.ram.writeGBs, 'high', (v) => `${v} GB/s`],
    ['RAM latency', (r) => r.ram && r.ram.latencyNs, 'low', (v) => `${v} ns`],
    ['Disk seq read', (r) => r.disk && r.disk.seqReadMBs, 'high', (v) => `${v} MB/s`],
    ['Disk seq write', (r) => r.disk && r.disk.seqWriteMBs, 'high', (v) => `${v} MB/s`],
    ['Disk rand read', (r) => r.disk && r.disk.randReadIOPS, 'high', (v) => `${v} IOPS`],
    ['Disk rand write', (r) => r.disk && r.disk.randWriteIOPS, 'high', (v) => `${v} IOPS`],
    ['GPU avg', (r) => r.gpu && r.gpu.avgFps, 'high', (v) => `${v} FPS`],
    ['GPU min', (r) => r.gpu && r.gpu.minFps, 'high', (v) => `${v} FPS`],
  ];
  function compare() {
    const box = $('bench-compare-out');
    const a = history[Number($('bench-compare-a').value)];
    const b = history[Number($('bench-compare-b').value)];
    if (!a || !b) { box.innerHTML = '<p class="dim">Pick two runs to compare.</p>'; return; }
    box.innerHTML = '';
    METRICS.forEach(([label, get, better, fmt]) => {
      const va = get(a), vb = get(b);
      if (typeof va !== 'number' || typeof vb !== 'number') return;
      const row = document.createElement('div');
      row.className = 'bench-delta';
      const name = document.createElement('b');
      name.textContent = `${label}: ${fmt(va)} → ${fmt(vb)}`;
      const arrow = document.createElement('span');
      const diff = vb - va;
      const pct = va !== 0 ? Math.abs(diff / va) * 100 : 0;
      const good = diff === 0 ? 'flat' : ((diff > 0) === (better === 'high') ? 'up' : 'down');
      arrow.className = good;
      arrow.textContent = good === 'flat' ? `= 0%` : `${good === 'up' ? '▲' : '▼'} ${pct.toFixed(1)}%`;
      row.append(name, arrow);
      box.appendChild(row);
    });
    if (!box.children.length) box.innerHTML = '<p class="dim">No overlapping metrics between those runs.</p>';
  }

  /* --------------------------- history ---------------------------------- */
  function filteredHistory() {
    const days = Number($('bench-hist-range').value || 30);
    if (!days) return history;
    const cut = Date.now() - days * 86400000;
    return history.filter((r) => new Date(r.at || 0).getTime() >= cut);
  }
  function drawHistoryGraph() {
    const cv = $('bench-hist-graph');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    const runs = filteredHistory().map((r) => ({ at: r.at, o: overall(r) })).filter((p) => p.o !== null);
    if (runs.length < 1) {
      ctx.fillStyle = '#7C93B5';
      ctx.font = '12px Inter, sans-serif';
      ctx.fillText(runs.length ? 'Not enough scored runs yet.' : 'No runs in range — run a benchmark first.', 16, H / 2);
      return;
    }
    const vals = runs.map((p) => p.o);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const span = Math.max(1, hi - lo);
    const px = (i) => 14 + (runs.length < 2 ? (W - 28) / 2 : (i / (runs.length - 1)) * (W - 28));
    const py = (v) => H - 18 - ((v - lo) / span) * (H - 44);
    // Area + glowing line (same GPU-composited canvas language as ping graph).
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(52,211,153,0.4)');
    grad.addColorStop(1, 'rgba(52,211,153,0.02)');
    ctx.beginPath();
    runs.forEach((p, i) => { i ? ctx.lineTo(px(i), py(p.o)) : ctx.moveTo(px(i), py(p.o)); });
    if (runs.length > 1) { ctx.lineTo(px(runs.length - 1), H); ctx.lineTo(px(0), H); }
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.beginPath();
    runs.forEach((p, i) => {
      const x = px(i), y = py(p.o);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      ctx.fillStyle = '#34D399';
      ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
      ctx.beginPath();
      if (i) ctx.moveTo(px(i - 1), py(runs[i - 1].o)); else ctx.moveTo(x, y);
      ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#34D399';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(52,211,153,0.8)';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#E7E9EE';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.fillText(`${lo} – ${hi} pts`, 14, 16);
  }
  function paintHistory() {
    drawHistoryGraph();
    const list = $('bench-hist-list');
    if (list) {
      list.innerHTML = '';
      const runs = filteredHistory().slice().reverse();
      if (!runs.length) list.innerHTML = '<p class="dim">No runs in this range.</p>';
      runs.slice(0, 30).forEach((r) => {
        const row = document.createElement('div');
        row.className = 'file-row';
        const name = document.createElement('span');
        const o = overall(r);
        name.textContent = `${new Date(r.at).toLocaleString()} · ${o === null ? 'partial' : o + ' pts'} · ${(r.tweaks || []).length} tweaks active`;
        name.title = (r.tweaks || []).join(', ') || 'no tweaks on record';
        row.appendChild(name);
        list.appendChild(row);
      });
    }
    // Compare dropdowns always span full history (newest preselected).
    ['bench-compare-a', 'bench-compare-b'].forEach((id, k) => {
      const sel = $(id);
      if (!sel) return;
      const cur = sel.value;
      sel.innerHTML = '';
      history.forEach((r, i) => {
        const o = document.createElement('option');
        o.value = String(i);
        o.textContent = runLabel(r, i);
        sel.appendChild(o);
      });
      if (history.length > 1) sel.value = k === 0 ? String(history.length - 2) : String(history.length - 1);
      else if (cur) sel.value = cur;
    });
  }
  async function refreshHistory() {
    try {
      const r = await api().history();
      if (r && r.ok && Array.isArray(r.runs)) history = r.runs;
    } catch (e) { /* keep last paint */ }
    paintHistory();
  }

  /* ---------------------------- exports --------------------------------- */
  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function csvCell(v) {
    const s = String(v === null || v === undefined ? '' : v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  function exportCSV() {
    const rows = filteredHistory();
    if (!rows.length) { TT.toast('Nothing to export in this range.', '', 2500); return; }
    const head = ['date', 'overall', 'cpu_single', 'cpu_multi', 'ram_read_gbs', 'ram_write_gbs',
      'ram_latency_ns', 'disk_seq_read', 'disk_seq_write', 'disk_rand_read', 'disk_rand_write',
      'gpu_avg_fps', 'gpu_min_fps', 'tweaks_active'];
    const lines = [head.join(',')];
    rows.forEach((r) => {
      lines.push([
        r.at, overall(r),
        r.cpu && r.cpu.single, r.cpu && r.cpu.multi,
        r.ram && r.ram.readGBs, r.ram && r.ram.writeGBs, r.ram && r.ram.latencyNs,
        r.disk && r.disk.seqReadMBs, r.disk && r.disk.seqWriteMBs,
        r.disk && r.disk.randReadIOPS, r.disk && r.disk.randWriteIOPS,
        r.gpu && r.gpu.avgFps, r.gpu && r.gpu.minFps,
        (r.tweaks || []).join('|'),
      ].map(csvCell).join(','));
    });
    download(`tidaltweaks-benchmarks-${Date.now()}.csv`, lines.join('\n'), 'text/csv');
    TT.toast(`Exported ${rows.length} run(s) to CSV — tweak list included.`, 'success', 3500);
  }
  function exportJSON() {
    const rows = filteredHistory();
    if (!rows.length) { TT.toast('Nothing to export in this range.', '', 2500); return; }
    download(`tidaltweaks-benchmarks-${Date.now()}.json`, JSON.stringify(rows, null, 2), 'application/json');
    TT.toast(`Exported ${rows.length} run(s) to JSON.`, 'success', 3500);
  }
  /* PNG: a self-drawn summary card of the latest run (no screenshot libs). */
  function exportPNG() {
    const run = history[history.length - 1];
    if (!run) { TT.toast('Run a benchmark first.', '', 2500); return; }
    const cv = document.createElement('canvas');
    cv.width = 640; cv.height = 360;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#0D2140';
    ctx.fillRect(0, 0, 640, 360);
    ctx.fillStyle = '#5B8DF6';
    ctx.font = 'bold 26px Inter, sans-serif';
    ctx.fillText('TidalTweaks Benchmark', 28, 48);
    ctx.fillStyle = '#A9C0DD';
    ctx.font = '14px Inter, sans-serif';
    ctx.fillText(new Date(run.at).toLocaleString(), 28, 74);
    const o = overall(run);
    ctx.fillStyle = '#E7E9EE';
    ctx.font = 'bold 64px Inter, sans-serif';
    ctx.fillText(o === null ? '–' : String(o), 28, 150);
    ctx.fillStyle = '#7C93B5';
    ctx.font = '14px Inter, sans-serif';
    ctx.fillText('OVERALL SCORE', 30, 172);
    const lines = [
      `CPU  single ${run.cpu ? run.cpu.single : '–'} · multi ${run.cpu ? run.cpu.multi : '–'}`,
      `RAM  ${run.ram ? `${run.ram.readGBs}/${run.ram.writeGBs} GB/s · ${run.ram.latencyNs} ns` : '–'}`,
      `Disk ${(run.disk ? `${run.disk.seqReadMBs}/${run.disk.seqWriteMBs} MB/s` : '–')}`,
      `GPU  ${run.gpu ? `${run.gpu.avgFps} avg / ${run.gpu.minFps} min FPS` : '–'}`,
      `Tweaks active: ${(run.tweaks || []).length}${(run.tweaks || []).length ? ' (' + run.tweaks.slice(0, 6).join(', ') + ((run.tweaks.length > 6) ? '…' : '') + ')' : ''}`,
    ];
    ctx.fillStyle = '#E7E9EE';
    ctx.font = '14px Inter, sans-serif';
    lines.forEach((l, i) => ctx.fillText(l, 28, 208 + i * 26));
    const a = document.createElement('a');
    a.href = cv.toDataURL('image/png');
    a.download = `tidaltweaks-benchmark-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 500);
    TT.toast('Exported latest run to PNG.', 'success', 3500);
  }

  /* ------------------------------ wiring -------------------------------- */
  function wire() {
    document.querySelectorAll('.bench-dur').forEach((b) => {
      if (b.dataset.dur === duration) b.classList.add('active-dur');
      b.onclick = () => {
        duration = b.dataset.dur;
        document.querySelectorAll('.bench-dur').forEach((x) => x.classList.toggle('active-dur', x === b));
        status(`Duration: ${b.textContent.trim()}.`);
      };
    });
    $('bench-run-all').onclick = runAll;
    $('bench-run-cpu').onclick = async () => {
      if (running) return;
      running = true; setButtons(true);
      const res = await runCore('cpu');
      await saveSingle('cpu', res);
      running = false; setButtons(false);
      status('CPU done — run saved.');
    };
    $('bench-run-ram').onclick = async () => {
      if (running) return;
      running = true; setButtons(true);
      const res = await runCore('ram');
      await saveSingle('ram', res);
      running = false; setButtons(false);
      status('RAM done — run saved.');
    };
    $('bench-run-gpu').onclick = async () => {
      if (running) return;
      running = true; setButtons(true);
      const res = await runGpuTest();
      await saveSingle('gpu', res);
      running = false; setButtons(false);
      status('GPU done — run saved.');
    };
    $('bench-run-disk').onclick = async () => {
      if (running) return;
      running = true; setButtons(true);
      const res = await runCore('disk');
      await saveSingle('disk', res);
      running = false; setButtons(false);
      status('Disk done — run saved.');
    };
    $('bench-compare-go').onclick = compare;
    $('bench-hist-range').onchange = paintHistory;
    $('bench-export-csv').onclick = exportCSV;
    $('bench-export-json').onclick = exportJSON;
    $('bench-export-png').onclick = exportPNG;
  }

  TT._show.benchmark = async () => {
    // Cores badge + history repaint every time the tab opens.
    try {
      const s = await TT.api.sys.static();
      if (s && s.ok) {
        const cores = $('bench-cpu-cores');
        if (cores) cores.textContent = `${s.cpu.physical}C/${s.cpu.logical}T`;
      }
    } catch (e) { /* badge is cosmetic */ }
    await refreshHistory();
  };
  wire();
  refreshHistory();
})();
