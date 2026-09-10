'use strict';
/* Privacy tab (Pro): privacy & security group + "Harden all" master button.
 * Harden-all asks ONE master confirmation, then applies each tweak in turn
 * and reports a combined x/y summary (failures become toasts, never throws). */
(function () {
  const TT = window.TT;
  const PRIV_IDS = [
    'priv-no-autoplay', 'priv-no-feedback', // free first — visible without scrolling
    'priv-no-telemetry', 'priv-no-adid', 'priv-no-tailored',
    'priv-no-suggestions', 'priv-no-cortana', 'priv-no-location',
    'priv-block-trackers', 'priv-no-telemetry-svc',
    'priv-lsa', 'priv-credential-guard', // both carry reboot warnings
    'priv-no-llmnr', 'priv-no-smb1', 'priv-no-rdp',
    'priv-no-recall', 'priv-no-ceip', 'priv-no-ink-collection',
  ];
  TT.renderTweaks(document.querySelector('[data-tweaks="privacy"]'), PRIV_IDS);

  document.getElementById('privacy-all').onclick = async () => {
    if (!TT.pro) { // bulk action is Pro-only even though cards show locks
      TT.toast('🔒 Harden-all needs Pro — opening Settings…', 'gold', 3500);
      TT.switchTab('settings');
      return;
    }
    const ok = await TT.confirm({
      title: 'Harden all privacy settings?',
      body: `${PRIV_IDS.length} tweaks will be applied (telemetry, ad ID, location, hosts block, services, LSA, Credential Guard).\nA restore point is created first.\nLSA / Credential Guard need a REBOOT.`,
      okText: 'Harden all',
    });
    if (!ok) return;
    let done = 0;
    for (const id of PRIV_IDS) {
      try {
        const r = await TT.api.tweak.apply(id);
        if (r && r.ok) {
          done++;
          const card = document.querySelector(`[data-tweak="${id}"]`);
          if (card) card.classList.add('applied');
        } else TT.toast(`${id}: ${(r && r.message) || 'failed'}`, 'error');
      } catch (e) { TT.toast(`${id}: ${String(e)}`, 'error'); }
    }
    TT.toast(`Privacy hardening: ${done}/${PRIV_IDS.length} applied.`,
      done === PRIV_IDS.length ? 'success' : '', 5000);
    if (TT.refreshRestore) TT.refreshRestore();
  };
})();
