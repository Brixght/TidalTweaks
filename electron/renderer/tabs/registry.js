'use strict';
/* Tweaks tab (Pro): three catalog groups — Performance & CPU, Visual & UI,
 * Advanced system. Every card gets Apply + Revert with confirm modals. */
(function () {
  const TT = window.TT;
  const q = (name) => document.querySelector(`[data-tweaks="${name}"]`);
  TT.renderTweaks(q('cpu'), [
    'cpu-boost-mode', 'cpu-no-throttle', 'cpu-no-interrupt-steering',
    'cpu-timer-serialization', 'cpu-no-energy-est', 'cpu-no-parking',
    'cpu-no-hibernate', 'cpu-min-state-100', 'cpu-no-pcie-link',
    'cpu-bios-utc', 'cpu-fg-priority', 'cpu-no-dynamictick',
    'cpu-tsc-enhanced', 'cpu-no-spec-mit', 'cpu-x2apic', 'cpu-timer-res',
    'cpu-no-idle-states',
  ]);
  TT.renderTweaks(q('system'), [
    'sys-verbose-boot', 'sys-bsod-details', 'sys-fast-shutdown', 'sys-storage-sense',
    'sys-boot-legacy', 'sys-minidump', 'sys-no-bsod-reboot',
  ]);
  TT.renderTweaks(q('disk'), ['disk-no-lastaccess', 'disk-no-8dot3']);
  // Free visual/advanced teasers get their own clearly-labelled subgroups.
  TT.renderTweaks(q('visual-free'), [
    'vis-menu-delay', 'vis-extensions', 'vis-no-sticky',
    'vis-hidden-files', 'vis-transparency-on', 'vis-classic-context',
    'vis-end-task', 'vis-no-taskview', 'vis-no-chat', 'vis-numlock',
    'vis-no-thumbs-network', 'vis-this-pc', 'vis-no-login-blur', 'vis-taskbar-left',
    'vis-no-shadows', 'vis-no-drag-full', 'vis-fx-custom-min',
  ]);
  TT.renderTweaks(q('visual'), [
    'vis-no-peek', 'vis-no-anim', 'vis-no-blur', 'vis-transparency-off',
    'vis-no-toggle-keys', 'vis-no-lockscreen',
  ]);
  TT.renderTweaks(q('advanced-free'), [
    'adv-no-tips', 'adv-no-copilot', 'adv-no-widgets', 'adv-no-news',
    'adv-consumer-feats', 'adv-no-bing', 'adv-no-snap', 'adv-no-search-highlights',
  ]);
  TT.renderTweaks(q('advanced'), [
    'adv-no-indexing', 'adv-no-sysmain', 'adv-no-delivery-opt',
    'adv-no-xbox-bar', 'adv-no-bg-apps', 'adv-no-activity',
    'adv-no-clipboard-hist', 'adv-no-error-report', 'adv-no-driver-updates',
  ]);
})();
