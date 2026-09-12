'use strict';
/* Restore tab (FREE for everyone): manual restore points, undo-last,
 * revert-all, and the change history log from core/backup.js. */
(function () {
  const TT = window.TT;
  const $ = (id) => document.getElementById(id);

  async function history() {
    const box = $('restore-history');
    let res;
    try { res = await TT.api.restore.history(); }
    catch (e) { res = { ok: false, message: String(e) }; }
    box.innerHTML = '';
    const rows = (res && res.history) || [];
    if (!rows.length) {
      box.innerHTML = '<p class="dim">No changes logged yet.</p>';
      return;
    }
    rows.slice().reverse().forEach((h) => {
      const div = document.createElement('div');
      div.className = 'file-row';
      const a = document.createElement('span');
      a.textContent = h.id;
      const b = document.createElement('span');
      b.textContent = (h.at || '').replace('T', ' ').slice(0, 19);
      div.append(a, b);
      box.appendChild(div);
    });
  }
  TT.refreshRestore = history; // app.js calls this after every applied tweak

  $('restore-create').onclick = async () => {
    $('restore-status').textContent = 'Creating restore point… (can take a minute)';
    const r = await TT.api.restore.create('TidalTweaks manual').catch((e) => ({ ok: false, message: String(e) }));
    $('restore-status').textContent = (r && r.message) || '';
    TT.toast((r && r.message) || '', r && r.ok ? 'success' : 'error', 5000);
  };
  $('restore-undo').onclick = async () => {
    const r = await TT.api.restore.undoLast().catch((e) => ({ ok: false, message: String(e) }));
    TT.toast((r && r.message) || '', r && r.ok ? 'success' : '', 4000);
    history();
  };
  $('restore-all').onclick = async () => {
    const ok = await TT.confirm({
      title: 'Revert ALL changes?',
      body: 'Every backup saved by TidalTweaks (registry values, hosts file, services) will be restored.\n\nSystem Restore points are NOT rolled back automatically — use Windows System Restore for that.',
      okText: 'Revert all',
    });
    if (!ok) return;
    const r = await TT.api.restore.revertAll().catch((e) => ({ ok: false, message: String(e) }));
    TT.toast((r && r.message) || '', r && r.ok ? 'success' : 'error', 5000);
    history();
  };
  // Factory reset: same undo log, taken to zero — plus the power plan parked
  // on Balanced and an honest list of what needs manual action (removed apps
  // can't reinstall themselves). Runs under the loading screen.
  const factoryBtn = $('restore-factory');
  if (factoryBtn) factoryBtn.onclick = async () => {
    const ok = await TT.confirm({
      title: 'Factory reset all tweaks?',
      body: 'This removes EVERY tweak on record and parks the power plan on Balanced — back to stock.\n\nAnything already listed as manual-action (removed apps, uninstalled programs) will still need YOU: Microsoft Store reinstalls, etc.\nSystem Restore points are untouched.',
      okText: 'Reset everything',
    });
    if (!ok) return;
    TT.progress.show('Factory reset — removing all tweaks', 0, 'factory-reset');
    const r = await TT.api.restore.factoryReset().catch((e) => ({ ok: false, message: String(e) }));
    if (r && r.details && Array.isArray(r.details)) {
      // Surface the per-line report (including the manual-action list).
      const log = document.getElementById('progress-log');
      r.details.forEach((line) => {
        const div = document.createElement('div');
        div.className = 'plog-row' + (/NOT auto-reverted/.test(line) ? ' bad' : ' ok');
        div.textContent = line;
        if (log) { log.appendChild(div); log.scrollTop = log.scrollHeight; }
      });
    }
    TT.progress.done((r && r.message) || 'Factory reset failed.', !!(r && r.ok));
    history();
  };

  // LAZY: history file read waits for first show (cheap anyway, but free).
  let loaded = false;
  TT._show.restore = () => { if (!loaded) { loaded = true; history(); } };
})();
