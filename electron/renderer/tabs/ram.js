'use strict';
/* RAM Optimizer tab (Free): before/after animated bars + EmptyWorkingSet
 * trim of idle processes (system-critical PIDs are skipped in core/ram.js). */
(function () {
  const TT = window.TT;
  const $ = (id) => document.getElementById(id);

  function paint(used, total) {
    const pct = total ? (used / total) * 100 : 0;
    TT.countUp($('ram-big'), pct, { decimals: 0, suffix: '% used' });
    $('ram-detail').textContent = `${TT.fmtBytes(used)} / ${TT.fmtBytes(total)}`;
    $('ram-bar').style.width = Math.min(100, pct) + '%';
  }

  async function poll() {
    try {
      const s = await TT.api.sys.live();
      if (s && s.ok) paint(s.ram.used, s.ram.total);
    } catch (e) { /* next poll retries */ }
  }

  async function optimize() {
    $('ram-status').textContent = 'Trimming idle working sets…';
    let before = null;
    try {
      const s = await TT.api.sys.live();
      if (s && s.ok) before = s.ram;
    } catch (e) { /* non-fatal */ }
    let res;
    try { res = await TT.api.ram.optimize(); }
    catch (e) { res = { ok: false, message: String(e) }; }
    if (!res || !res.ok) {
      $('ram-status').textContent = '';
      TT.toast('RAM optimize failed: ' + ((res && res.message) || 'unknown'), 'error', 5000);
      return;
    }
    // Before bar → short beat → after bar, so the drop is VISIBLE.
    if (before) paint(before.used, before.total);
    setTimeout(() => {
      paint(res.after.used, res.after.total);
      $('ram-status').textContent =
        `Trimmed ${res.trimmed} processes · freed ~${TT.fmtBytes(res.freed)}.`;
      TT.toast(`RAM optimized — ~${TT.fmtBytes(res.freed)} freed!`, 'success');
    }, 450);
  }

  $('ram-go').onclick = optimize;
  $('ram-refresh').onclick = poll;
  // Standby janitor (Base): scheduled 15-min trims. Goes through the normal
  // tweak runner so it gets a restore point + undo entry like everything else.
  const schedBtn = $('ram-schedule');
  if (schedBtn) schedBtn.onclick = async () => {
    const ok = await TT.confirm({
      title: 'Schedule standby janitor?',
      body: 'A "TidalTweaks Standby Cleaner" task will trim idle memory every 15 minutes.\nUndo (Restore tab) deletes the task AND its script.',
      okText: 'Schedule',
    });
    if (!ok) return;
    const r = await TT.api.tweak.apply('ram-standby-task').catch((e) => ({ ok: false, message: String(e) }));
    TT.toast((r && r.message) || 'Failed.', r && r.ok ? 'success' : 'error', 5000);
    if (r && r.ok && TT.refreshRestore) TT.refreshRestore();
  };
  TT._show.ram = poll;
  poll();
})();
