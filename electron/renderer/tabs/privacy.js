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
    'priv-no-camera', 'priv-no-mic', 'priv-no-usb-storage',
  ];
  TT.renderTweaks(document.querySelector('[data-tweaks="privacy"]'), PRIV_IDS);

  document.getElementById('privacy-all').onclick = async () => {
    if (TT.tier < 2) { // bulk action is Pro-only even though cards show locks
      TT.toast('🔒 Harden-all needs Pro ($15) — opening Settings…', 'gold', 3500);
      TT.switchTab('settings');
      return;
    }
    // Extreme items (LSA, Credential Guard) are skipped unless owned —
    // no point showing "denied" toasts for things the tier system already labels.
    const mine = PRIV_IDS.filter((id) => TT.tierOf(id) <= TT.tier);
    const skipped = PRIV_IDS.filter((id) => TT.tierOf(id) > TT.tier);
    const ok = await TT.confirm({
      title: 'Harden all privacy settings?',
      body: `${mine.length} tweaks will be applied (telemetry, ad ID, location, hosts block, services${mine.includes('priv-lsa') ? ', LSA, Credential Guard' : ''}).\nA restore point is created first.` +
        (mine.includes('priv-lsa') ? '\nLSA / Credential Guard need a REBOOT.' : '') +
        (skipped.length ? `\n\nSkipped (needs ${[...new Set(skipped.map((id) => TT.TIER_NAMES[TT.tierOf(id)]))].join('/')}): ${skipped.length} item(s) — apply them individually after upgrading.` : ''),
      okText: 'Harden all',
    });
    if (!ok) return;
    // Same loading screen as presets, driven manually (these are direct
    // tweak calls, not a preset:apply run, so there are no main events).
    TT.progress.show(`Privacy hardening (${mine.length} tweaks)`, mine.length, 'privacy-harden');
    let done = 0;
    let step = 0;
    for (const id of mine) {
      step++;
      const meta = (TT.TWEAKS || {})[id] || {};
      try {
        const r = await TT.api.tweak.apply(id);
        if (r && r.ok) {
          done++;
          const card = document.querySelector(`[data-tweak="${id}"]`);
          if (card) card.classList.add('applied');
          TT.progress.step(step, mine.length, meta.t || id, true);
        } else TT.progress.step(step, mine.length, `${meta.t || id} — ${(r && r.message) || 'failed'}`, false);
      } catch (e) { TT.progress.step(step, mine.length, `${meta.t || id} — ${String(e)}`, false); }
    }
    TT.progress.done(`Privacy hardening: ${done}/${mine.length} applied.` +
      (skipped.length ? ` (${skipped.length} Extreme skipped.)` : ''),
      done === mine.length);
    if (TT.refreshRestore) TT.refreshRestore();
  };
})();
