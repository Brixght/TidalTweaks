'use strict';
/* Gaming tab (Pro except where tagged FREE): free starters, the performance
 * stack (Ultimate plan lives in the Power tab — no duplicates), GPU-vendor
 * tweaks, and the per-game priority card (saved exe list lives in Settings
 * storage, boosted per session since Windows resets priorities on reboot). */
(function () {
  const TT = window.TT;
  const $ = (id) => document.getElementById(id);

  TT.renderTweaks(document.querySelector('[data-tweaks="gaming-free"]'), [
    'game-bar-off', 'game-no-fs-optim',
    'game-mode-win-on', 'game-mouse-raw', 'game-keyboard-fast',
  ]);
  TT.renderTweaks(document.querySelector('[data-tweaks="gaming"]'), [
    'game-mode-master',
    'game-hags-on',
    'game-no-nagle',
    'game-net-throttle-off',
    'game-sys-responsiveness',
    'game-input-latency',
    'game-no-hpet', // carries the ⚠ boot-config warning in its modal text
    'game-bg-apps-off',
  ]);
  TT.renderTweaks(document.querySelector('[data-tweaks="gpu-vendor"]'), [
    'gpu-nv-telemetry', 'gpu-msi-mode', 'gpu-amd-ulps', 'gpu-no-mpo',
  ]);

  /* ---- Per-game priority (FREE): the user's own exe list ---- */
  let games = [];
  function paintGames() {
    const box = $('priority-list');
    box.innerHTML = '';
    if (!games.length) {
      box.innerHTML = '<p class="dim">No games saved yet — add your first .exe above.</p>';
      return;
    }
    games.forEach((g) => {
      const row = document.createElement('div');
      row.className = 'file-row';
      const name = document.createElement('span');
      name.textContent = '🎮 ' + g;
      const rm = document.createElement('button');
      rm.className = 'btn secondary';
      rm.style.cssText = 'padding:4px 10px;font-size:11px';
      rm.textContent = '✕';
      rm.title = 'Remove';
      rm.onclick = async () => {
        games = games.filter((x) => x !== g);
        await saveGames();
      };
      row.append(name, rm);
      box.appendChild(row);
    });
  }
  async function saveGames() {
    const r = await TT.api.settings.set({ priorityGames: games }).catch(() => ({ ok: false }));
    if (r && r.ok && Array.isArray(r.priorityGames)) games = r.priorityGames;
    paintGames();
  }
  async function loadGames() {
    try {
      const g = await TT.api.settings.get();
      if (g && g.ok && Array.isArray(g.priorityGames)) games = g.priorityGames;
    } catch (e) { /* keep empty */ }
    paintGames();
  }
  $('priority-add').onclick = async () => {
    const v = ($('priority-exe').value || '').trim();
    if (!/^[\w\-. ]{1,60}\.exe$/i.test(v)) {
      TT.toast('Enter a valid .exe name, e.g. FortniteClient-Win64-Shipping.exe', 'error', 4000);
      return;
    }
    if (games.some((g) => g.toLowerCase() === v.toLowerCase())) {
      TT.toast('Already in your list.', '', 2500);
      return;
    }
    games.push(v);
    $('priority-exe').value = '';
    await saveGames();
    TT.toast(`'${v}' saved.`, 'success');
  };
  $('priority-exe').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('priority-add').click(); });
  $('priority-boost').onclick = async () => {
    const r = await TT.api.game.boostList(games).catch((e) => ({ ok: false, message: String(e) }));
    TT.toast((r && r.message) || 'Boost failed.', r && r.ok ? 'success' : 'error', 4500);
  };
  // Discrete-GPU forcing reads the SAME saved list server-side (Pro).
  const gpuBtn = $('priority-gpu');
  if (gpuBtn) gpuBtn.onclick = async () => {
    const ok = await TT.confirm({
      title: 'Force discrete GPU?',
      body: `Writes GpuPreference=2 (high performance) for all ${games.length} saved game(s).\nLaptops stop launching them on the iGPU.\nPrevious per-game values are captured for undo.`,
      okText: 'Force discrete GPU',
    });
    if (!ok) return;
    const r = await TT.api.game.gpuPref().catch((e) => ({ ok: false, message: String(e) }));
    TT.toast((r && r.message) || 'Failed.', r && r.ok ? 'success' : 'error', 5000);
  };
  loadGames();
})();
