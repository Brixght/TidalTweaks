'use strict';
/* BIOS tab (Pro): guided firmware checklist — these settings live in the
 * BIOS and can't be applied programmatically, so each row opens a modal with
 * vendor-specific menu paths + steps and a Copy-settings button. Free users
 * see the full list (preview) with 🔒 locks; clicking a locked row shows the
 * preview text. Motherboard vendor is auto-detected via WMI (bios:detect)
 * and selects the matching vendor tab + menu path automatically. */
(function () {
  const TT = window.TT;
  const $ = (id) => document.getElementById(id);
  const api = () => TT.api.bios;
  const isPro = () => TT && (TT.pro || (TT.tier || 0) >= 2);

  const PREVIEW_TEXT = "You're seeing everything the Pro tier unlocks. Buy it once and it's yours for good.";
  const VENDORS = [
    { id: 'asus', label: 'ASUS' },
    { id: 'msi', label: 'MSI' },
    { id: 'gigabyte', label: 'Gigabyte' },
    { id: 'asrock', label: 'ASRock' },
  ];
  const VENDOR_LABEL = { asus: 'ASUS', msi: 'MSI', gigabyte: 'Gigabyte', asrock: 'ASRock', other: 'your board' };

  const GUIDES = [
    {
      id: 'rebar', title: 'Enable Resizable BAR', tag: 'guide', badge: 'safe', impact: 3,
      desc: 'Walks you through enabling ReBAR for GPU throughput.',
      values: ['Above 4G Decoding = Enabled', 'Re-Size BAR Support = Enabled', 'CSM = Disabled (pure UEFI boot)'],
      vendors: {
        asus: {
          menu: 'Advanced → PCI Subsystem Settings → Re-Size BAR',
          steps: [
            'Reboot and press Del / F2 to enter the UEFI BIOS.',
            'Switch to Advanced Mode (F7) if you land in EZ Mode.',
            'Go to Advanced → PCI Subsystem Settings.',
            'Set Above 4G Decoding to Enabled.',
            'Set Re-Size BAR Support to Enabled.',
            'Go to Boot → CSM and set Launch CSM to Disabled (pure UEFI).',
            'Press F10 → Save & Exit. Confirm ReBAR in GPU-Z or the NVIDIA/AMD panel.',
          ],
        },
        msi: {
          menu: 'Settings → Advanced → PCI Subsystem Settings → Re-Size BAR',
          steps: [
            'Reboot and press Del to enter the BIOS (Click BIOS 5).',
            'Go to Settings → Advanced → PCI Subsystem Settings.',
            'Set Above 4G Decoding to Enabled.',
            'Set Re-Size BAR Support to Enabled.',
            'Go to Settings → Boot and set Boot Mode Select to UEFI (CSM off).',
            'Press F10 → Save & Exit. Confirm ReBAR in GPU-Z or the NVIDIA/AMD panel.',
          ],
        },
        gigabyte: {
          menu: 'Settings → IO Ports → Re-Size BAR Support',
          steps: [
            'Reboot and press Del to enter the BIOS.',
            'Go to Settings → IO Ports.',
            'Set Above 4G Decoding to Enabled.',
            'Set Re-Size BAR Support to Enabled.',
            'Go to Boot → CSM Support and set it to Disabled (UEFI boot).',
            'Press F10 → Save & Exit. Confirm ReBAR in GPU-Z or the NVIDIA/AMD panel.',
          ],
        },
        asrock: {
          menu: 'Advanced → PCI Configuration → Clever Access Memory',
          steps: [
            'Reboot and press Del / F2 to enter the UEFI setup.',
            'Go to Advanced → PCI Configuration.',
            'Set Above 4G Decoding to Enabled.',
            'Set Clever Access Memory (Re-Size BAR) to Enabled.',
            'Go to Boot → CSM and set it to Disabled (pure UEFI).',
            'Press F10 → Save & Exit. Confirm ReBAR in GPU-Z or the NVIDIA/AMD panel.',
          ],
        },
      },
    },
    {
      id: 'xmp', title: 'Enable XMP / EXPO profile', tag: 'guide', badge: 'caution', impact: 3,
      desc: 'Applies your rated memory speed and timings.',
      values: ['XMP / EXPO Profile = Enabled (Profile 1)', 'DRAM Frequency = kit rating (e.g. 6000 MT/s)', 'DRAM Voltage = Auto (as per kit)'],
      vendors: {
        asus: {
          menu: 'AI Tweaker → Ai Overclock Tuner → XMP / EXPO',
          steps: [
            'Reboot and press Del / F2 to enter the UEFI BIOS.',
            'Switch to Advanced Mode (F7). Go to AI Tweaker.',
            'Set Ai Overclock Tuner to XMP I (Intel) or EXPO I (AMD).',
            'Check the DRAM Frequency matches your kit rating.',
            'Leave DRAM Voltage on Auto unless your kit specifies otherwise.',
            'Press F10 → Save & Exit. Stress-test (TM5 / MemTest) before calling it stable.',
          ],
        },
        msi: {
          menu: 'OC → A-XMP / EXPO profile',
          steps: [
            'Reboot and press Del to enter Click BIOS 5.',
            'Click the A-XMP (Intel) or EXPO (AMD) button at the top, or go to OC.',
            'Select Profile 1 and confirm the DRAM frequency matches your kit.',
            'Leave DRAM Voltage on Auto unless your kit specifies otherwise.',
            'Press F10 → Save & Exit. Stress-test (TM5 / MemTest) before calling it stable.',
          ],
        },
        gigabyte: {
          menu: 'Tweaker → Extreme Memory Profile',
          steps: [
            'Reboot and press Del to enter the BIOS.',
            'Go to the Tweaker tab.',
            'Set Extreme Memory Profile (X.M.P. / EXPO) to Profile 1.',
            'Confirm the memory multiplier matches your kit rating.',
            'Leave DRAM Voltage on Auto unless your kit specifies otherwise.',
            'Press F10 → Save & Exit. Stress-test (TM5 / MemTest) before calling it stable.',
          ],
        },
        asrock: {
          menu: 'OC Tweaker → Load XMP / EXPO Setting',
          steps: [
            'Reboot and press Del / F2 to enter the UEFI setup.',
            'Go to OC Tweaker.',
            'Set Load XMP Setting (Intel) or Load EXPO Setting (AMD) to the kit profile.',
            'Confirm the DRAM frequency matches your kit rating.',
            'Leave DRAM Voltage on Auto unless your kit specifies otherwise.',
            'Press F10 → Save & Exit. Stress-test (TM5 / MemTest) before calling it stable.',
          ],
        },
      },
    },
    {
      id: 'cstates', title: 'Disable C-States', tag: 'guide', badge: 'caution', impact: 2,
      desc: 'Reduces idle-to-load transition latency on desktops.',
      values: ['CPU C-States = Disabled', 'Package C-State Limit = C0/C1 (max performance)'],
      vendors: {
        asus: {
          menu: 'Advanced → CPU Configuration → C-States',
          steps: [
            'Reboot and press Del / F2 to enter the UEFI BIOS.',
            'Switch to Advanced Mode (F7). Go to Advanced → CPU Configuration.',
            'Set CPU C-States to Disabled.',
            'If present, set Package C-State Limit to C0/C1.',
            'Skip this tweak on laptops — it raises idle heat and kills battery.',
            'Press F10 → Save & Exit. Expect higher idle temps; that is the trade.',
          ],
        },
        msi: {
          menu: 'OC → CPU Features → C-State',
          steps: [
            'Reboot and press Del to enter Click BIOS 5.',
            'Go to OC → CPU Features (Intel) or Settings → Advanced → CPU Features.',
            'Set C-State (CPU C-States) to Disabled.',
            'If present, set Package C-State Limit to C0/C1.',
            'Skip this tweak on laptops — it raises idle heat and kills battery.',
            'Press F10 → Save & Exit. Expect higher idle temps; that is the trade.',
          ],
        },
        gigabyte: {
          menu: 'Settings → Platform Power → CPU C-States',
          steps: [
            'Reboot and press Del to enter the BIOS.',
            'Go to Settings → Platform Power (or Tweaker → Advanced CPU Settings).',
            'Set CPU C-States / C-State Support to Disabled.',
            'If present, set Package C-State Limit to C0/C1.',
            'Skip this tweak on laptops — it raises idle heat and kills battery.',
            'Press F10 → Save & Exit. Expect higher idle temps; that is the trade.',
          ],
        },
        asrock: {
          menu: 'Advanced → CPU Configuration → CPU C States Support',
          steps: [
            'Reboot and press Del / F2 to enter the UEFI setup.',
            'Go to Advanced → CPU Configuration.',
            'Set CPU C States Support to Disabled.',
            'If present, set Package C-State Limit to C0/C1.',
            'Skip this tweak on laptops — it raises idle heat and kills battery.',
            'Press F10 → Save & Exit. Expect higher idle temps; that is the trade.',
          ],
        },
      },
    },
  ];

  let board = null; // { vendor, manufacturer, product } from WMI
  let modalGuide = null;
  let modalVendor = 'asus';

  function badgeEl(badge) {
    const s = document.createElement('span');
    if (badge === 'safe') { s.className = 'safe-tag'; s.textContent = 'Safe'; }
    else { s.className = 'caution-tag'; s.textContent = 'Caution'; }
    return s;
  }
  function dotsEl(n) {
    const s = document.createElement('span');
    s.className = 'impact';
    s.title = `Impact ${n}/3`;
    for (let i = 0; i < n; i++) {
      const d = document.createElement('i');
      s.appendChild(d);
    }
    return s;
  }

  function vendorMenuPath(g, vendor) {
    const v = (g.vendors && g.vendors[vendor]) || null;
    if (!v) return '';
    return `${VENDOR_LABEL[vendor] || vendor}: ${v.menu}`;
  }

  function render() {
    const pro = isPro();
    const unl = $('bios-unlock');
    if (unl) {
      unl.textContent = pro ? 'Pro active ✓' : '👑 Unlock · $15';
      unl.disabled = pro;
      unl.style.opacity = pro ? '0.6' : '1';
    }
    const banner = $('bios-banner');
    if (banner) banner.hidden = pro; // preview banner is for Free users
    const bl = $('bios-board');
    if (bl) {
      const man = board && board.ok ? `${(board.manufacturer || '').trim()} ${(board.product || '').trim()}`.trim() : '';
      if (man && board.vendor && board.vendor !== 'other') {
        bl.textContent = `Detected board: ${man} — showing matching menu paths.`;
      } else if (man) {
        bl.textContent = `Detected board: ${man} — no vendor-specific paths for it, pick your closest match inside each guide.`;
      } else {
        bl.textContent = 'Motherboard not detected — pick your vendor inside each guide.';
      }
    }
    const box = $('bios-list');
    if (!box) return;
    box.innerHTML = '';
    GUIDES.forEach((g) => {
      const row = document.createElement('div');
      row.className = 'bios-row' + (pro ? '' : ' locked');
      const info = document.createElement('div');
      info.className = 'bios-info';
      const title = document.createElement('b');
      title.textContent = `${g.title} `;
      const tag = document.createElement('span');
      tag.className = 'os-tag';
      tag.textContent = g.tag;
      title.append(' ', tag, ' ', badgeEl(g.badge), ' ');
      title.appendChild(dotsEl(g.impact));
      const desc = document.createElement('p');
      desc.textContent = g.desc;
      info.append(title, desc);
      // Detected-vendor menu path, right under the description.
      if (board && board.ok && board.vendor && board.vendor !== 'other') {
        const mp = document.createElement('p');
        mp.className = 'dim bios-path';
        mp.textContent = vendorMenuPath(g, board.vendor);
        info.appendChild(mp);
      }
      const lock = document.createElement('span');
      lock.className = 'bios-lock';
      lock.textContent = pro ? '›' : '🔒';
      lock.title = pro ? 'Open guide' : 'Guide needs Pro';
      row.append(info, lock);
      row.onclick = () => {
        if (!isPro()) {
          TT.toast(`👁 Preview. ${PREVIEW_TEXT}`, 'gold', 5000);
          TT.switchTab('settings');
          return;
        }
        openModal(g);
      };
      box.appendChild(row);
    });
  }

  /* ------------------------------ guide modal ---------------------------- */
  function openModal(g) {
    modalGuide = g;
    modalVendor = (board && board.ok && g.vendors[board.vendor]) ? board.vendor : 'asus';
    paintModal();
    $('bios-modal').hidden = false;
  }
  function closeModal() {
    $('bios-modal').hidden = true;
    modalGuide = null;
  }
  function paintModal() {
    const g = modalGuide;
    if (!g) return;
    $('bios-m-title').textContent = g.title;
    const v = g.vendors[modalVendor];
    $('bios-m-path').textContent = v ? `${VENDOR_LABEL[modalVendor]}: ${v.menu}` : '';
    const vt = $('bios-m-vendors');
    vt.innerHTML = '';
    VENDORS.forEach((vd) => {
      const b = document.createElement('button');
      b.className = 'btn secondary small' + (vd.id === modalVendor ? ' active-vendor' : '');
      b.textContent = vd.label;
      b.onclick = () => { modalVendor = vd.id; paintModal(); };
      vt.appendChild(b);
    });
    const st = $('bios-m-steps');
    st.innerHTML = '';
    const ol = document.createElement('ol');
    (v ? v.steps : []).forEach((s) => {
      const li = document.createElement('li');
      li.textContent = s;
      ol.appendChild(li);
    });
    st.appendChild(ol);
    $('bios-m-values').textContent = (g.values || []).join('\n');
  }
  async function copySettings() {
    const g = modalGuide;
    const text = g ? (g.values || []).join('\n') : '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      TT.toast('Settings copied — paste them next to your BIOS screen.', 'success', 3000);
    } catch (e) {
      try {
        const pre = $('bios-m-values');
        const range = document.createRange();
        range.selectNodeContents(pre);
        const sel = getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        TT.toast('Copy it manually (Ctrl+C).', '', 3500);
      } catch (e2) { TT.toast('Copy failed.', 'error', 3000); }
    }
  }

  async function detectBoard() {
    try {
      const r = await api().detect();
      if (r && r.ok) board = r;
      else board = null;
    } catch (e) { board = null; }
    render();
  }

  function wire() {
    const unl = $('bios-unlock');
    if (unl) unl.onclick = () => {
      if (isPro()) return;
      TT.toast('🔒 BIOS guides need Pro ($15) — opening Settings…', 'gold', 3500);
      TT.switchTab('settings');
    };
    const close = $('bios-m-close');
    if (close) close.onclick = closeModal;
    const backdrop = document.querySelector('#bios-modal .modal-backdrop');
    if (backdrop) backdrop.onclick = closeModal;
    const copy = $('bios-m-copy');
    if (copy) copy.onclick = copySettings;
    document.addEventListener('keydown', (e) => {
      const m = $('bios-modal');
      if (e.key === 'Escape' && m && !m.hidden) closeModal();
    });
  }

  TT._show.bios = async () => {
    try { await TT.refreshLicense(false); } catch (e) { /* tier read is best-effort */ }
    render();
    detectBoard();
  };
  wire();
  render();
})();
