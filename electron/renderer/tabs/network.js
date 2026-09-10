'use strict';
/* Network tab: Free ping (8.8.8.8/1.1.1.1) with a LIVE animated latency
 * graph drawn on <canvas>, DNS lookup, latency placeholder — plus the Pro
 * "Internet tweaks" group rendered from the shared catalog in app.js. */
(function () {
  const TT = window.TT;
  const $ = (id) => document.getElementById(id);
  const samples = []; // rolling ping history (ms), max 40 points

  // Canvas latency graph: gradient area + glowing line, redrawn per sample.
  function drawGraph() {
    const cv = $('ping-graph');
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);
    if (!samples.length) {
      ctx.fillStyle = '#7C93B5';
      ctx.font = '12px Inter, sans-serif';
      ctx.fillText('Run a ping test to draw the graph…', 16, H / 2);
      return;
    }
    const max = Math.max(100, ...samples) * 1.15;
    const px = (i) => 10 + (i / 39) * (W - 20);
    const py = (v) => H - 12 - (Math.min(v, max) / max) * (H - 30);
    // Area fill
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(91,141,246,0.45)');
    grad.addColorStop(1, 'rgba(91,141,246,0.02)');
    ctx.beginPath();
    samples.forEach((v, i) => { i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v)); });
    ctx.lineTo(px(samples.length - 1), H);
    ctx.lineTo(px(0), H);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    // Glowing line
    ctx.beginPath();
    samples.forEach((v, i) => { i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v)); });
    ctx.strokeStyle = '#5B8DF6';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(91,141,246,0.8)';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
    // Last-value label
    const last = samples[samples.length - 1];
    ctx.fillStyle = '#E7E9EE';
    ctx.font = 'bold 13px Inter, sans-serif';
    ctx.fillText(`${Math.round(last)} ms`, W - 62, py(last) - 8);
  }

  async function ping() {
    const host = ($('ping-host').value || '').trim() || '8.8.8.8';
    $('ping-out').textContent = `Pinging ${host}…`;
    let res;
    try { res = await TT.api.net.ping(host); }
    catch (e) { res = { ok: false, message: String(e) }; }
    if (!res || !res.ok) {
      $('ping-out').textContent = `✗ ${host} unreachable.`;
      TT.toast('Ping failed: ' + ((res && res.message) || 'host unreachable'), 'error');
      return;
    }
    // Feed each echo reply into the graph one at a time (animated feel).
    for (const ms of (res.samples || [res.avgMs])) {
      samples.push(ms);
      if (samples.length > 40) samples.shift();
      drawGraph();
      await new Promise((r) => setTimeout(r, 120));
    }
    $('ping-out').textContent = `✓ ${host}: avg ${Math.round(res.avgMs)} ms · loss ${res.lossPct}%`;
  }

  async function dns() {
    const host = ($('dns-host').value || '').trim() || 'google.com';
    $('dns-out').textContent = `Resolving ${host}…`;
    let res;
    try { res = await TT.api.net.dns(host); }
    catch (e) { res = { ok: false, message: String(e) }; }
    $('dns-out').textContent = (res && res.ok)
      ? `✓ ${host} → ${(res.ips || []).join(', ')} (${res.ms} ms)`
      : `✗ Failed: ${(res && res.message) || 'unknown'}`;
  }

  async function latency() {
    $('lat-out').textContent = 'Measuring…';
    const out = [];
    for (const h of ['8.8.8.8', '1.1.1.1']) {
      try {
        const r = await TT.api.net.ping(h);
        out.push(`• ${h}: ${r && r.ok ? Math.round(r.avgMs) + ' ms' : 'unreachable'}`);
      } catch (e) { out.push(`• ${h}: failed`); }
    }
    $('lat-out').textContent = out.join('\n');
  }

  $('ping-go').onclick = ping;
  $('dns-go').onclick = dns;
  $('lat-go').onclick = latency;
  TT.renderTweaks(document.querySelector('[data-tweaks="net-free"]'), [
    'net-flush-dns', 'net-qos-limit',
  ]);
  TT.renderTweaks(document.querySelector('[data-tweaks="net"]'),
    ['net-timed-wait', 'net-max-user-port',
     'net-fast-dns-cloudflare', 'net-fast-dns-google', 'net-no-smb-limit',
     'net-nic-powersave-off', 'net-nic-eco-off', 'net-reset-stack']);
  drawGraph();
})();
