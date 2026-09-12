'use strict';
/* ============================================================================
 * core/presets.js — one-click tweak STACKS (the Risxn "products" idea, done
 * the Tidal way: transparent contents, single restore point, single undo).
 * A preset is { id, title, desc, pro, warn, ids[] }. The runner in main.js
 * creates ONE restore point for the whole stack and logs ONE undo entry, so
 * "Undo last tweak" rolls back the entire preset in one go.
 *
 * CUSTOM PRESETS (local-only, never in git): <userData>/custom-presets.json
 * holds an ARRAY of the same shape. main.js merges them into preset:list, so
 * private stacks (like a machine-specific LowEnd pack) live ONLY on that PC.
 * Shape is validated strictly; entries referencing unknown tweak ids are
 * skipped silently (a typo must never break the built-in list).
 * ========================================================================== */
const fs = require('node:fs');
const path = require('node:path');

const PRESETS = [
  {
    id: 'fps-boost',
    title: 'FPS Boost — starter pack',
    desc: 'Safe one-click wins for any PC. All Free, all HKCU, zero risk.',
    pro: false,
    os: 'both',
    warn: 'Applies 6 safe tweaks: Game Bar off, FSO bypass, Game Mode on, instant menus, Sticky Keys off, DNS flush.\nNo reboot needed.',
    ids: ['game-bar-off', 'game-no-fs-optim', 'game-mode-win-on', 'vis-menu-delay', 'vis-no-sticky', 'net-flush-dns'],
  },
  {
    id: 'pro-gamer',
    title: 'Pro Gamer stack',
    desc: 'The full latency pipeline: power, GPU scheduling, network, input.',
    pro: true,
    os: 'both',
    warn: 'Applies 9 tweaks (Ultimate plan, HAGS, Nagle off, throttling off, responsiveness, input queues, FSO bypass, bg apps off).\nHAGS needs a REBOOT. One restore point covers all nine.',
    ids: [
      'game-power-ultimate', 'game-hags-on', 'game-no-nagle',
      'game-net-throttle-off', 'game-sys-responsiveness', 'game-input-latency',
      'game-no-fs-optim', 'game-bg-apps-off', 'game-bar-off',
    ],
  },
  {
    id: 'ghost',
    title: 'Ghost — privacy lockdown',
    desc: 'All ten privacy tweaks in one click. The tin-foil-hat special.',
    pro: true,
    os: 'both',
    warn: 'Applies all 10 privacy tweaks (telemetry, ad ID, location, hosts block, services, LSA, Credential Guard).\nLSA + Credential Guard need a REBOOT and Secure-Boot-capable hardware.',
    ids: [
      'priv-no-telemetry', 'priv-no-adid', 'priv-no-tailored',
      'priv-no-suggestions', 'priv-no-cortana', 'priv-no-location',
      'priv-block-trackers', 'priv-no-telemetry-svc',
      'priv-lsa', 'priv-credential-guard',
    ],
  },
  {
    id: 'eco',
    title: 'Eco — battery saver',
    desc: 'Balanced plan, quiet background, frosted look back on. Laptops love it.',
    pro: true,
    os: 'both',
    warn: 'Applies 4 tweaks: Balanced power plan, background apps off, delivery optimization off, transparency on.\nUndoes cleanly with one Undo.',
    ids: ['power-balanced', 'adv-no-bg-apps', 'adv-no-delivery-opt', 'vis-transparency-on'],
  },
  // ---- Per-game presets (all FREE) ----------------------------------------
  // Each one applies safe game-ready tweaks AND registers the game's exes
  // into your priority list, so Gaming → "Boost running now" picks them up.
  {
    id: 'game-fortnite',
    title: 'Fortnite ready',
    desc: 'Game Bar off, FSO bypass, instant menus, DNS flush + Fortnite exes saved.',
    pro: false,
    os: 'both',
    games: ['FortniteClient-Win64-Shipping.exe', 'FortniteLauncher.exe'],
    warn: 'Applies 5 safe tweaks and saves 2 Fortnite exes to your priority list.\nThen open Gaming → Boost running now while Fortnite is up.',
    ids: ['game-bar-off', 'game-no-fs-optim', 'game-mouse-raw', 'vis-menu-delay', 'net-flush-dns'],
  },
  {
    id: 'game-valorant',
    title: 'Valorant ready',
    desc: 'No Sticky-Shift popups mid-clutch, FSO bypass + Riot exes saved.',
    pro: false,
    os: 'both',
    games: ['VALORANT-Win64-Shipping.exe', 'RiotClientServices.exe'],
    warn: 'Applies 6 safe tweaks and saves 2 Riot exes.\nNote: Vanguard may reset priorities — re-boost each session.',
    ids: ['game-bar-off', 'game-no-fs-optim', 'game-mouse-raw', 'game-keyboard-fast', 'vis-no-sticky', 'net-flush-dns'],
  },
  {
    id: 'game-minecraft',
    title: 'Minecraft ready',
    desc: 'Distraction-free Java setup + launcher exes saved for boosting.',
    pro: false,
    os: 'both',
    games: ['javaw.exe', 'MinecraftLauncher.exe', 'Minecraft.Windows.exe'],
    warn: 'Applies 3 safe tweaks and saves Java + launcher exes.\nTip: allocate RAM in the launcher (Installations → More Options → -Xmx4G).',
    ids: ['game-bar-off', 'vis-no-sticky', 'adv-no-tips'],
  },
  {
    id: 'game-cod',
    title: 'Call of Duty ready',
    desc: 'Low-ping starter: Nagle stays Pro, but DNS flush + FSO bypass help free.',
    pro: false,
    os: 'both',
    games: ['cod.exe'],
    warn: 'Applies 6 safe tweaks and saves cod.exe.\nIf your install uses a different exe, add it in Gaming → Priority for my games.',
    ids: ['game-bar-off', 'game-no-fs-optim', 'game-mouse-raw', 'game-keyboard-fast', 'net-flush-dns', 'vis-no-sticky'],
  },
  {
    id: 'lowend-pc',
    title: 'Low-End PC pack',
    desc: 'Safe speed for weak desktops: background drag killed, FX flattened, updates quieted. No boot edits, no reboot needed.',
    os: 'both',
    warn: 'Applies 19 safe tweaks (Base tier and below). Nothing here needs a reboot. Fully reversible from Restore.',
    ids: ['game-bar-off', 'game-no-fs-optim', 'game-mode-win-on', 'game-mouse-raw', 'vis-menu-delay', 'vis-no-shadows', 'vis-no-drag-full', 'vis-fx-custom-min', 'vis-no-sticky', 'debloat-visual-fx', 'adv-no-bg-apps', 'adv-no-delivery-opt', 'adv-no-tips', 'net-flush-dns', 'sys-fast-shutdown', 'power-no-usb-suspend', 'adv-no-search-highlights', 'vis-no-taskview', 'adv-no-copilot'],
  },
  {
    id: 'lowend-laptop',
    title: 'Low-End Laptop pack',
    desc: 'The PC pack plus cooling-first power, auto RAM trimming and Balanced-friendly tweaks for thin, hot chassis.',
    os: 'both',
    warn: 'Applies 23 tweaks (Base tier and below). Keep it plugged in and cooled. Fully reversible from Restore.',
    ids: ['game-bar-off', 'game-no-fs-optim', 'game-mode-win-on', 'game-mouse-raw', 'vis-menu-delay', 'vis-no-shadows', 'vis-no-drag-full', 'vis-fx-custom-min', 'vis-no-sticky', 'debloat-visual-fx', 'adv-no-bg-apps', 'adv-no-delivery-opt', 'adv-no-tips', 'net-flush-dns', 'sys-fast-shutdown', 'power-no-usb-suspend', 'adv-no-search-highlights', 'vis-no-taskview', 'adv-no-copilot', 'power-active-cooling', 'ram-standby-task', 'power-balanced', 'sys-storage-sense'],
  },
  {
    id: 'midend-pc',
    title: 'Mid-Range PC pack',
    desc: 'Low-end base plus the real performance pipeline: boost, throttling off, HAGS, Nagle trio, indexing off, Ultimate plan.',
    os: 'both',
    warn: 'Applies 33 tweaks (Pro tier). HAGS needs a REBOOT to take effect. Fully reversible from Restore.',
    ids: ['game-bar-off', 'game-no-fs-optim', 'game-mode-win-on', 'game-mouse-raw', 'vis-menu-delay', 'vis-no-shadows', 'vis-no-drag-full', 'vis-fx-custom-min', 'vis-no-sticky', 'debloat-visual-fx', 'adv-no-bg-apps', 'adv-no-delivery-opt', 'adv-no-tips', 'net-flush-dns', 'sys-fast-shutdown', 'power-no-usb-suspend', 'adv-no-search-highlights', 'vis-no-taskview', 'adv-no-copilot', 'cpu-boost-mode', 'cpu-no-throttle', 'game-hags-on', 'game-no-nagle', 'game-net-throttle-off', 'game-sys-responsiveness', 'game-input-latency', 'net-timed-wait', 'net-max-user-port', 'power-ultimate', 'adv-no-indexing', 'adv-no-sysmain', 'debloat-chrome-bg', 'net-fast-dns-cloudflare'],
  },
  {
    id: 'midend-laptop',
    title: 'Mid-Range Laptop pack',
    desc: 'Mid-range PC stack minus the furnace settings, plus active cooling. Performance without melting the keyboard.',
    os: 'both',
    warn: 'Applies 33 tweaks (Pro tier). Skips Aggressive boost and min-state lock to protect thermals. HAGS needs a REBOOT. Fully reversible.',
    ids: ['game-bar-off', 'game-no-fs-optim', 'game-mode-win-on', 'game-mouse-raw', 'vis-menu-delay', 'vis-no-shadows', 'vis-no-drag-full', 'vis-fx-custom-min', 'vis-no-sticky', 'debloat-visual-fx', 'adv-no-bg-apps', 'adv-no-delivery-opt', 'adv-no-tips', 'net-flush-dns', 'sys-fast-shutdown', 'power-no-usb-suspend', 'adv-no-search-highlights', 'vis-no-taskview', 'adv-no-copilot', 'cpu-no-throttle', 'game-hags-on', 'game-no-nagle', 'game-net-throttle-off', 'game-sys-responsiveness', 'game-input-latency', 'net-timed-wait', 'net-max-user-port', 'power-ultimate', 'adv-no-indexing', 'adv-no-sysmain', 'debloat-chrome-bg', 'net-fast-dns-cloudflare', 'power-active-cooling'],
  },
  {
    id: 'highend-pc',
    title: 'High-End PC pack',
    desc: 'Everything: bcdedit timer stack, Spectre mitigations off, timer resolution, MSI mode, NIC surgery. For rigs with headroom.',
    os: 'both',
    warn: 'Applies 45 tweaks (Extreme tier) including BOOT CONFIG edits (HPET, dynamictick, TSC, x2apic) and a SECURITY TRADE-OFF (Spectre mitigations off).\nREBOOT REQUIRED. Only for machines you can afford to troubleshoot. Fully reversible from Restore + reboot.',
    ids: ['game-bar-off', 'game-no-fs-optim', 'game-mode-win-on', 'game-mouse-raw', 'vis-menu-delay', 'vis-no-shadows', 'vis-no-drag-full', 'vis-fx-custom-min', 'vis-no-sticky', 'debloat-visual-fx', 'adv-no-bg-apps', 'adv-no-delivery-opt', 'adv-no-tips', 'net-flush-dns', 'sys-fast-shutdown', 'power-no-usb-suspend', 'adv-no-search-highlights', 'vis-no-taskview', 'adv-no-copilot', 'cpu-boost-mode', 'cpu-no-throttle', 'game-hags-on', 'game-no-nagle', 'game-net-throttle-off', 'game-sys-responsiveness', 'game-input-latency', 'net-timed-wait', 'net-max-user-port', 'power-ultimate', 'adv-no-indexing', 'adv-no-sysmain', 'debloat-chrome-bg', 'net-fast-dns-cloudflare', 'cpu-no-parking', 'cpu-fg-priority', 'game-no-hpet', 'cpu-no-dynamictick', 'cpu-tsc-enhanced', 'cpu-no-spec-mit', 'cpu-x2apic', 'cpu-timer-res', 'gpu-msi-mode', 'net-nic-powersave-off', 'net-nic-eco-off', 'power-no-pcie'],
  },
  {
    id: 'highend-laptop',
    title: 'High-End Laptop pack',
    desc: 'High-end stack minus the security trade-off and idle-tick edits, plus active cooling. Max fps you can actually sustain.',
    os: 'both',
    warn: 'Applies 44 tweaks (Extreme tier: HPET, TSC, x2APIC, timer resolution included).\nSkips Spectre-mitigation removal and dynamic-tick edits to protect battery/security. REBOOT REQUIRED. Fully reversible.',
    ids: ['game-bar-off', 'game-no-fs-optim', 'game-mode-win-on', 'game-mouse-raw', 'vis-menu-delay', 'vis-no-shadows', 'vis-no-drag-full', 'vis-fx-custom-min', 'vis-no-sticky', 'debloat-visual-fx', 'adv-no-bg-apps', 'adv-no-delivery-opt', 'adv-no-tips', 'net-flush-dns', 'sys-fast-shutdown', 'power-no-usb-suspend', 'adv-no-search-highlights', 'vis-no-taskview', 'adv-no-copilot', 'cpu-boost-mode', 'cpu-no-throttle', 'game-hags-on', 'game-no-nagle', 'game-net-throttle-off', 'game-sys-responsiveness', 'game-input-latency', 'net-timed-wait', 'net-max-user-port', 'power-ultimate', 'adv-no-indexing', 'adv-no-sysmain', 'debloat-chrome-bg', 'net-fast-dns-cloudflare', 'cpu-no-parking', 'cpu-fg-priority', 'game-no-hpet', 'cpu-tsc-enhanced', 'cpu-x2apic', 'cpu-timer-res', 'gpu-msi-mode', 'net-nic-powersave-off', 'net-nic-eco-off', 'power-no-pcie', 'power-active-cooling'],
  },
  {
    id: 'overdrive',
    title: 'Tidal Overdrive — EVERYTHING',
    desc: 'The whole arsenal in one click: gaming + CPU + network + debloat stacks. For a fresh-feeling machine in ~5 minutes.',
    os: 'both',
    warn: 'Applies ~55 tweaks (Extreme tier): full gaming, CPU, network and debloat stacks including BOOT edits, Spectre-mitigation removal, timer resolution, NIC surgery, OneDrive/Cortana/Xbox app removal and a network-stack reset.\nREBOOT REQUIRED (twice ideally: once after, to settle drivers). VPN clients need re-setup after the stack reset. Edge is NOT touched. Takes several minutes — watch the log. Fully reversible EXCEPT removed apps (reinstall from Store).',
    ids: ['game-mode-master', 'game-power-ultimate', 'game-bar-off', 'game-hags-on', 'game-no-nagle', 'game-net-throttle-off', 'game-sys-responsiveness', 'game-input-latency', 'game-no-hpet', 'game-no-fs-optim', 'game-bg-apps-off', 'game-mode-win-on', 'game-mouse-raw', 'game-keyboard-fast', 'gpu-msi-mode', 'cpu-boost-mode', 'cpu-no-throttle', 'cpu-no-interrupt-steering', 'cpu-timer-serialization', 'cpu-no-energy-est', 'cpu-no-parking', 'cpu-no-hibernate', 'cpu-min-state-100', 'cpu-no-pcie-link', 'cpu-bios-utc', 'cpu-fg-priority', 'cpu-no-dynamictick', 'cpu-tsc-enhanced', 'cpu-no-spec-mit', 'cpu-x2apic', 'cpu-timer-res', 'cpu-no-idle-states', 'net-timed-wait', 'net-max-user-port', 'net-flush-dns', 'net-no-smb-limit', 'net-nic-powersave-off', 'net-nic-eco-off', 'net-qos-limit', 'net-reset-stack', 'net-ecn-on', 'net-rsc-off', 'net-no-tunnel', 'net-adapter-restart', 'debloat-onedrive', 'debloat-visual-fx', 'debloat-no-hibernate', 'debloat-disk-cleanup', 'debloat-chrome-bg', 'debloat-cortana-app', 'debloat-xbox-app', 'power-no-usb-suspend', 'power-no-disk-sleep', 'adv-no-indexing', 'adv-no-sysmain', 'adv-no-delivery-opt', 'adv-no-xbox-bar', 'adv-no-bg-apps', 'vis-no-anim', 'vis-fx-custom-min', 'sys-fast-shutdown'],
  },
];

function list() {
  return PRESETS.map((p) => ({ ...p }));
}
function get(id) {
  return PRESETS.find((p) => p.id === id) || null;
}

/* Read custom presets from a userData dir. Returns shape-validated entries
 * (unknown tweak ids are filtered by the CALLER against TWEAK_REGISTRY —
 * this module must stay UI/registry-agnostic). Never throws. */
function listCustom(userDataDir) {
  try {
    const raw = fs.readFileSync(path.join(String(userDataDir || ''), 'custom-presets.json'), 'utf8');
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((p) => p && typeof p === 'object')
      .map((p) => ({
        id: String(p.id || '').trim(),
        title: String(p.title || '').trim().slice(0, 80),
        desc: String(p.desc || '').trim().slice(0, 500),
        warn: String(p.warn || '').trim().slice(0, 800),
        os: p.os === 'win11' || p.os === 'win10' ? p.os : 'both',
        ids: Array.isArray(p.ids) ? p.ids.map((x) => String(x)) : [],
        games: Array.isArray(p.games) ? p.games.map((x) => String(x)).slice(0, 20) : [],
        custom: true,
      }))
      .filter((p) => p.id && p.title && p.ids.length > 0);
  } catch {
    return []; // missing/corrupt file = no customs, built-ins unaffected
  }
}

module.exports = { list, get, listCustom };
