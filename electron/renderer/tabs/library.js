'use strict';
/* Library tab (Free to browse): every tweak in the catalog, searchable and
 * filterable by tier. Rows render through the SAME renderTweaks cards (with
 * their 🔒 buttons + confirm modals), so there is exactly one code path for
 * applying anything. Lazy: builds on first show. */
(function () {
  const TT = window.TT;
  const $ = (id) => document.getElementById(id);
  let built = false;

  function currentFilter() {
    return {
      q: (($('library-search').value || '').trim().toLowerCase()),
      tier: $('library-tier').value,
    };
  }

  function build() {
    const { q, tier } = currentFilter();
    const box = $('library-list');
    box.innerHTML = '';
    const ids = Object.keys(TT.TWEAKS || {}).filter((id) => {
      const meta = TT.TWEAKS[id];
      const need = TT.tierOf(id);
      if (tier === '9' && need > TT.tier) return false; // unlocked for me
      if (tier !== '-1' && tier !== '9' && need !== Number(tier)) return false;
      if (q && !((meta.t + ' ' + meta.d + ' ' + id).toLowerCase().includes(q))) return false;
      return true;
    });
    // Grouped by tier (Free first), alphabetical inside.
    ids.sort((a, b) => (TT.tierOf(a) - TT.tierOf(b)) || a.localeCompare(b));
    const st = TT.tierStats();
    $('library-count').textContent =
      `${st.total} tweaks · ${st.free} free · showing ${ids.length}`;
    if (!ids.length) {
      box.innerHTML = '<p class="dim">No tweaks match. Try a shorter search.</p>';
      return;
    }
    // One container per tier band so FREE cards visually separate from paid.
    let lastTier = -1;
    let group = null;
    ids.forEach((id) => {
      const need = TT.tierOf(id);
      if (need !== lastTier) {
        lastTier = need;
        const h = document.createElement('h3');
        h.style.marginTop = group ? '20px' : '4px';
        h.textContent = `${TT.TIER_NAMES[need]}${need === 0 ? '' : ` — $${TT.TIER_PRICES[need]} one-time`}`;
        const tag = document.createElement('span');
        tag.className = need === 0 ? 'free-tag' : (need === 1 ? 'tier-tag tier-base' : (need === 3 ? 'tier-tag tier-extreme' : 'pro-tag'));
        tag.textContent = (TT.TIER_NAMES[need] || 'FREE').toUpperCase();
        tag.style.marginLeft = '8px';
        h.appendChild(tag);
        box.appendChild(h);
        group = document.createElement('div');
        box.appendChild(group);
      }
      TT.renderTweaks(group, [id], true);
    });
  }

  // renderTweaks registers groups for license-flip re-renders; library groups
  // are rebuilt wholesale instead (simpler with live search text).
  TT._rebuildLibrary = () => { if (built) build(); };
  TT._show.library = () => {
    if (!built) { built = true; build(); }
  };
  $('library-search').addEventListener('input', () => { built = true; build(); });
  $('library-tier').addEventListener('change', () => { built = true; build(); });
})();
