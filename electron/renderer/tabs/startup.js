'use strict';
/* Startup Manager tab (Free): HKCU/HKLM Run keys + Startup folders.
 * Animated toggle switches; disabling backs the original value up first so
 * every change is reversible (core/startup.js). Toggles are non-destructive
 * by design, so no confirmation modal — failures surface as toasts. */
(function () {
  const TT = window.TT;
  const $ = (id) => document.getElementById(id);

  async function refresh() {
    const list = $('startup-list');
    list.innerHTML = '<div class="spinner"></div>';
    let res;
    try { res = await TT.api.startup.list(); }
    catch (e) { res = { ok: false, message: String(e) }; }
    list.innerHTML = '';
    if (!res || !res.ok) {
      list.innerHTML = '<p class="dim">Could not read startup entries: ' +
        ((res && res.message) || 'unknown error') + '</p>';
      return;
    }
    if (!res.entries.length) {
      list.innerHTML = '<p class="dim">No startup entries found.</p>';
      return;
    }
    res.entries.forEach((e) => {
      const row = document.createElement('div');
      row.className = 'startup-row';
      const info = document.createElement('div');
      info.className = 'info';
      const b = document.createElement('b');
      b.textContent = e.name;
      const small = document.createElement('small');
      small.textContent = e.command || '';
      small.title = e.command || '';
      info.append(b, small);
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = e.location;
      const label = document.createElement('label');
      label.className = 'toggle';
      label.title = e.enabled ? 'Click to disable' : 'Click to enable';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!e.enabled;
      const track = document.createElement('span');
      track.className = 'track';
      label.append(cb, track);
      cb.onchange = async () => {
        cb.disabled = true;
        const r = await TT.api.startup.set(e.id, cb.checked).catch((err) => ({ ok: false, message: String(err) }));
        cb.disabled = false;
        if (r && r.ok) {
          TT.toast(`${cb.checked ? 'Enabled' : 'Disabled'} '${e.name}'`, 'success');
        } else {
          cb.checked = !cb.checked; // snap back on failure
          TT.toast('Failed: ' + ((r && r.message) || 'unknown error'), 'error', 5000);
        }
      };
      row.append(info, badge, label);
      list.appendChild(row);
    });
  }

  // LAZY: nothing runs until the user first opens this tab — keeps app
  // startup to one cheap dashboard poll instead of a PowerShell stampede.
  let loaded = false;
  $('startup-refresh').onclick = refresh;
  TT._show.startup = () => { if (!loaded) { loaded = true; refresh(); } };
})();
