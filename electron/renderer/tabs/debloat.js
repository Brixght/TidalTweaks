'use strict';
/* Debloat tab (Pro): checkbox AppX removal + one-click removals + optional
 * Device Manager latency disables (each device toggle confirms first —
 * disabling the wrong device can break audio/USB until re-enabled). */
(function () {
  const TT = window.TT;
  const $ = (id) => document.getElementById(id);

  async function scan() {
    const list = $('debloat-list');
    list.innerHTML = '<div class="spinner"></div>';
    let res;
    try { res = await TT.api.debloat.scan(); }
    catch (e) { res = { ok: false, message: String(e) }; }
    list.innerHTML = '';
    if (!res || !res.ok) {
      list.innerHTML = '<p class="dim">Scan failed: ' + ((res && res.message) || 'unknown') + '</p>';
      return;
    }
    if (!res.apps.length) {
      list.innerHTML = '<p class="dim">✓ No known bloatware found — system is clean!</p>';
      return;
    }
    res.apps.forEach((a) => {
      const row = document.createElement('label');
      row.className = 'file-row check';
      row.style.cursor = 'pointer';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = a.package;
      const box = document.createElement('span');
      box.className = 'box';
      const name = document.createElement('span');
      name.style.cssText = 'flex:1;margin:0 10px';
      name.textContent = `${a.friendly} (${a.package})`;
      row.append(cb, box, name);
      list.appendChild(row);
    });
  }

  async function remove() {
    const pkgs = Array.from(document.querySelectorAll('#debloat-list input:checked')).map((cb) => cb.value);
    if (!pkgs.length) { TT.toast('Select at least one app first.', '', 3000); return; }
    const ok = await TT.confirm({
      title: 'Remove selected apps?',
      body: `${pkgs.length} AppX package(s) will be removed for the current user:\n${pkgs.join('\n')}\n\nReversible via the Microsoft Store.`,
      okText: 'Remove',
    });
    if (!ok) return;
    const res = await TT.api.debloat.remove(pkgs).catch((e) => ({ ok: false, message: String(e) }));
    if (res && res.ok) { TT.toast(res.message, 'success'); scan(); }
    else TT.toast('Removal failed: ' + ((res && res.message) || 'unknown'), 'error', 5000);
  }

  async function loadDevices() {
    const box = $('device-list');
    let res;
    try { res = await TT.api.tweak.devices(); }
    catch (e) { res = { ok: false, message: String(e) }; }
    box.innerHTML = '';
    if (!res || !res.ok) {
      box.innerHTML = '<p class="dim">Device list unavailable (admin may be required).</p>';
      return;
    }
    (res.devices || []).forEach((d) => {
      const row = document.createElement('div');
      row.className = 'startup-row';
      const info = document.createElement('div');
      info.className = 'info';
      const b = document.createElement('b');
      b.textContent = d.name;
      const small = document.createElement('small');
      small.textContent = d.status;
      info.append(b, small);
      const label = document.createElement('label');
      label.className = 'toggle';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = d.enabled !== false;
      const track = document.createElement('span');
      track.className = 'track';
      label.append(cb, track);
      cb.onchange = async () => {
        if (TT.tier < 3) { // fail fast before the confirm modal (Extreme-only)
          cb.checked = !cb.checked;
          TT.toast('🔒 Device disables need Extreme ($30) — opening Settings…', 'gold', 3500);
          TT.switchTab('settings');
          return;
        }
        const wantOff = cb.checked === false;
        const ok = await TT.confirm({
          title: (wantOff ? 'Disable ' : 'Re-enable ') + d.name + '?',
          body: wantOff
            ? 'This device will be disabled via pnputil.\nIf audio/USB/input misbehaves, re-enable it here or run Revert All in Restore.'
            : 'This device will be re-enabled.',
          okText: wantOff ? 'Disable' : 'Enable',
        });
        if (!ok) { cb.checked = !cb.checked; return; }
        const r = await TT.api.tweak.device(d.id, cb.checked).catch((e) => ({ ok: false, message: String(e) }));
        if (r && r.ok) TT.toast(r.message, 'success');
        else { cb.checked = !cb.checked; TT.toast('Failed: ' + ((r && r.message) || 'unknown'), 'error', 5000); }
      };
      row.append(info, label);
      box.appendChild(row);
    });
  }

  // LAZY: the AppX + device scans each spawn PowerShell — run them only on
  // first show, never at app startup. Catalog cards are DOM-only, safe early.
  let loaded = false;
  $('debloat-scan').onclick = scan;
  $('debloat-remove').onclick = remove;
  TT._show.debloat = () => {
    if (loaded) return;
    loaded = true;
    scan();
    loadDevices();
  };
  TT.renderTweaks(document.querySelector('[data-tweaks="debloat"]'), [
    'debloat-onedrive', 'debloat-edge', 'debloat-visual-fx',
    'debloat-no-hibernate', 'debloat-disk-cleanup', 'debloat-chrome-bg',
    'debloat-cortana-app', 'debloat-xbox-app',
  ]);
  TT.renderTweaks(document.querySelector('[data-tweaks="services"]'), [
    'svc-xbox-off', 'svc-printer-off', 'svc-bluetooth-off',
    'svc-maps-off', 'svc-pca-off', 'svc-geo-off',
    'svc-fax-off', 'svc-insider-off', 'svc-touchkbd-off',
  ]);
})();
