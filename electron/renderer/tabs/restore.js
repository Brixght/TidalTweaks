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

  // LAZY: history file read waits for first show (cheap anyway, but free).
  let loaded = false;
  TT._show.restore = () => { if (!loaded) { loaded = true; history(); } };
})();
