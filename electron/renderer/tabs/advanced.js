'use strict';
/* Advanced tab (Pro): low-level memory/kernel + GPU/scheduling tweaks.
 * Section 1 MEMORY & KERNEL is mostly new (core/memory.js + the 0.5ms
 * timer holder); Section 2 GPU & SCHEDULING reuses proven ids from the
 * Gaming/Power/Tweaks tabs — same catalog, same confirm modals, same undo.
 * Restore points + registry snapshots + toasts all ride on the shared
 * tweak runner (main.js), including for Caution tweaks. */
(function () {
  const TT = window.TT;
  const $ = (id) => document.getElementById(id);

  TT.renderTweaks(document.querySelector('[data-tweaks="adv-memory"]'), [
    'mem-no-compression', 'mem-large-cache', 'mem-no-prefetch', 'cpu-timer-res',
  ]);
  TT.renderTweaks(document.querySelector('[data-tweaks="adv-gpu"]'), [
    'game-hags-on', 'game-no-fs-optim', 'gpu-msi-mode', 'cpu-no-dynamictick',
    'game-bg-apps-off', 'adv-bg-policy', 'disk-no-8dot3', 'disk-no-lastaccess',
    'mem-no-pagefile-clear', 'disk-trim-on', 'power-no-aoac',
    'power-no-modern-standby', 'adv-ndu-off', 'cpu-distribute-timers',
    'mem-paging-exec', 'cpu-timer-serialization',
  ]);

  const unl = $('adv-unlock');
  if (unl) unl.onclick = () => {
    if (TT.pro) return;
    TT.toast('🔒 Advanced tweaks need Pro ($15) — opening Settings…', 'gold', 3500);
    TT.switchTab('settings');
  };
  TT._show.advanced = async () => {
    try { await TT.refreshLicense(false); } catch (e) { /* best-effort */ }
    const banner = $('adv-banner');
    if (banner) banner.hidden = TT.pro;
    if (unl) {
      unl.textContent = TT.pro ? 'Pro active ✓' : '👑 Unlock · $15';
      unl.disabled = TT.pro;
      unl.style.opacity = TT.pro ? '0.6' : '1';
    }
  };
})();
