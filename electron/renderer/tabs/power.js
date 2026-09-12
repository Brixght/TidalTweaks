'use strict';
/* Power tab (Pro): power-management group from the shared catalog. */
(function () {
  const TT = window.TT;
  TT.renderTweaks(document.querySelector('[data-tweaks="power"]'), [
    'power-ultimate',
    'power-balanced',
    'power-no-modern-standby',
    'power-lid-nothing',
    'power-sleep-never',
    'power-no-auto-hibernate',
    'power-active-cooling',
    'power-no-usb-suspend',
    'power-no-disk-sleep',
    'power-cpu-min-100',
    'power-no-pcie',
  ]);
})();
