'use strict';
/* ============================================================================
 * TidalTweaks — app shell logic (runs in the sandboxed renderer)
 * ----------------------------------------------------------------------------
 * Owns everything cross-cutting so tab scripts stay tiny:
 *   • custom titlebar buttons + maximise glyph sync
 *   • sidebar router + sliding #nav-glider pill (GPU translateY, 300ms)
 *   • toast notifications (slide-in bottom-right, auto-dismiss)
 *   • confirmAction() modal — EVERY Pro tweak must pass through it
 *   • CSS confetti celebration on Pro unlock
 *   • TWEAKS catalog: id → { title, desc, modal } rendered by tab scripts
 *   • license state → edition badge, Pro-lock overlays, crown colours
 *   • helpers: fmtBytes, fmtUptime, countUp (animated number transitions)
 * Tab scripts (tabs/*.js) consume all of this via window.TT.
 * ========================================================================== */
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const api = window.api;

  // Outside Electron (e.g. opening index.html directly) there is no bridge —
  // say so plainly instead of failing with cryptic errors.
  if (!api) {
    document.body.innerHTML =
      '<div style="display:flex;height:100vh;align-items:center;justify-content:center;font-family:sans-serif;color:#E7E9EE;background:#0D2140">' +
      '<p>Run with <b>&nbsp;npm start&nbsp;</b> — this UI needs the Electron shell.</p></div>';
    return;
  }

  /* ------------------------------ helpers -------------------------------- */
  function fmtBytes(n) {
    n = Number(n) || 0;
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(1)} ${units[i]}`;
  }
  function fmtUptime(sec) {
    sec = Math.floor(Number(sec) || 0);
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
    return (d > 0 ? `${d}d ` : '') + `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  /* Animated number transition: tweens the displayed value over ~350ms with
   * requestAnimationFrame (buttery count-up AND count-down). */
  function countUp(el, to, opts) {
    opts = opts || {};
    const decimals = opts.decimals || 0, suffix = opts.suffix || '';
    const from = parseFloat((el.dataset.v || '0').replace(/[^0-9.\-]/g, '')) || 0;
    const dur = 350, t0 = performance.now();
    cancelAnimationFrame(el._raf || 0);
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3); // easeOutCubic — matches the CSS feel
      const v = from + (to - from) * e;
      el.textContent = v.toFixed(decimals) + suffix;
      if (k < 1) el._raf = requestAnimationFrame(step);
      else el.dataset.v = String(to);
    };
    el._raf = requestAnimationFrame(step);
  }

  /* ------------------------------ toasts --------------------------------- */
  function toast(msg, type, ms) {
    const root = $('#toast-root');
    const el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = msg;
    root.appendChild(el);
    while (root.children.length > 4) root.firstChild.remove(); // keep stack short
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 260);
    }, ms || 3400);
  }

  /* --------------------------- confirm modal ------------------------------
   * Returns a Promise<boolean> normally. With { input: {placeholder,
   * password} } it shows a text field and resolves to the typed string on OK
   * (or null on cancel) — used for password resets etc. With
   * { danger: true } the OK button turns red; with { check: 'label' } a
   * checkbox must be ticked before OK enables (aggressive Services rows). */
  function confirmAction(opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const root = $('#modal-root');
      $('#modal-title').textContent = opts.title || 'Are you sure?';
      $('#modal-body').textContent = opts.body || '';
      const okBtn = $('#modal-ok');
      okBtn.textContent = opts.okText || 'Apply';
      okBtn.className = 'btn ' + (opts.danger ? 'danger' : 'primary');
      const input = $('#modal-input');
      const useInput = !!opts.input;
      input.hidden = !useInput;
      if (useInput) {
        input.value = (opts.input && opts.input.value) || '';
        input.placeholder = (opts.input && opts.input.placeholder) || '';
        input.type = (opts.input && opts.input.password) ? 'password' : 'text';
      }
      // Understanding checkbox (unchecked → OK disabled).
      const checkWrap = $('#modal-check-wrap');
      const checkBox = $('#modal-check');
      const useCheck = !!opts.check;
      if (checkWrap) {
        checkWrap.hidden = !useCheck;
        if (useCheck) {
          $('#modal-check-label').textContent = opts.check;
          checkBox.checked = false;
          okBtn.disabled = true;
          checkBox.onchange = () => { okBtn.disabled = !checkBox.checked; };
        } else {
          okBtn.disabled = false;
          checkBox.onchange = null;
        }
      }
      root.hidden = false;
      if (useInput) setTimeout(() => input.focus(), 60);
      const done = (v) => {
        $('#modal-ok').onclick = $('#modal-cancel').onclick = null;
        input.onkeydown = null;
        if (checkBox) checkBox.onchange = null;
        root.hidden = true;
        input.hidden = true;
        if (checkWrap) checkWrap.hidden = true;
        okBtn.disabled = false;
        okBtn.className = 'btn primary';
        resolve(v);
      };
      $('#modal-ok').onclick = () => done(useInput ? input.value : true);
      $('#modal-cancel').onclick = () => done(useInput ? null : false);
      if (useInput) input.onkeydown = (e) => { if (e.key === 'Enter') $('#modal-ok').click(); };
      $('.modal-backdrop', root).onclick = () => done(useInput ? null : false);
    });
  }

  /* ------------------------------ confetti -------------------------------- */
  // Pure-CSS confetti burst for the Pro unlock celebration (no libraries).
  function confettiBurst() {
    const root = $('#confetti-root');
    const colors = ['#5B8DF6', '#E8B23A', '#86EFAC', '#E7E9EE', '#7AA5FF'];
    for (let i = 0; i < 90; i++) {
      const p = document.createElement('div');
      p.className = 'confetti';
      p.style.left = Math.random() * 100 + 'vw';
      p.style.background = colors[i % colors.length];
      p.style.animationDuration = 1.6 + Math.random() * 1.6 + 's';
      p.style.transform = `rotate(${Math.random() * 360}deg)`;
      root.appendChild(p);
      setTimeout(() => p.remove(), 3400);
    }
  }

  /* ==========================================================================
   * TWEAK CATALOG — every Pro tweak in the app.
   *   id:    must match a key of TWEAK_REGISTRY in main.js (the ONLY ids the
   *          main process will execute — anything else is rejected).
   *   modal: exact text shown in the confirmation dialog before applying.
   * Tab scripts render groups of these via renderTweaks().
   * ========================================================================== */
  const TWEAKS = {
    'cpu-no-idle-states': { os: 'both', t: 'Disable deep CPU idle (C-states)', d: 'Cores never park into deep sleep — steadier frame times, warmer idle.', m: 'Will set IDLEDISABLE=1 on the active power scheme (AC).\nExpect higher idle temps/power. Reversible.' },
    // ————— Gaming & latency —————
    'game-mode-master': { t: 'Gaming Mode master toggle', d: 'Priority boost + Game Bar/DVR off + HAGS + High Performance plan in one click.', m: 'Will: raise the foreground game to High priority, disable Game Bar & Game DVR capture, enable GPU scheduling (HAGS), and switch to the High Performance power plan.\nHAGS needs a reboot to take effect.' },
    'game-power-ultimate': { t: 'Ultimate Performance power plan', d: 'Unlocks and activates the hidden Ultimate Performance scheme.', m: 'Will run: powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61 and set it active.\nOn editions without the scheme it falls back to High Performance.' },
    'game-bar-off': { free: true, t: 'Disable Game Bar & Game DVR', d: 'Kills background game recording overhead (AppCaptureEnabled=0, GameDVR_Enabled=0).', m: 'Will set HKCU\\System\\GameConfigStore AppCaptureEnabled=0 and GameDVR_Enabled=0, plus the AllowGameDVR policy.\nReversible from Restore → Undo.' },
    'game-hags-on': { t: 'Hardware-Accelerated GPU Scheduling', d: 'Lets the GPU schedule its own VRAM — lower latency (HwSchMode=2).', m: 'Will set HKLM\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers HwSchMode=2.\nREQUIRES ADMIN + REBOOT. If your GPU/driver is old this can cause instability.' },
    'game-no-nagle': { t: "Disable Nagle's algorithm", d: 'Full trio per adapter: TcpAckFrequency=1, TCPNoDelay=1, TcpDelAckTicks=0.', m: 'Will write all three values under every interface in HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces.\nHelps games with frequent small TCP packets; does not lower ping itself.' },
    'game-net-throttle-off': { t: 'Disable network throttling', d: 'NetworkThrottlingIndex=0xffffffff — stops Windows capping game traffic.', m: 'Will set NetworkThrottlingIndex=0xffffffff under HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile.' },
    'game-sys-responsiveness': { t: 'System responsiveness priority', d: 'SystemResponsiveness=10 — the lowest value Windows actually honors.', m: 'Will set SystemResponsiveness=10 (percent) in the Multimedia SystemProfile key.\nHonest note: values below 10 are clamped back to 20 by Windows, so 10 is the real minimum — guides saying "0" are wrong.' },
    'game-input-latency': { t: 'Input latency optimization', d: 'Mouse/Keyboard queue sizes + zeroed repeat delays for snappier input.', m: 'Will set MouseDataQueueSize=20, KeyboardDataQueueSize=20, DelayBeforeAcceptance=0, AutoRepeatDelay=0.' },
    'game-no-hpet': { t: 'Disable HPET', d: 'Removes the platform-clock override (bcdedit /deletevalue useplatformclock).', m: '⚠ WARNING: this edits the boot configuration and CAN cause stutter or boot issues on some systems.\nA restore point will be created first, but only proceed if you know your board timer is solid.' },
    'game-no-fs-optim': { free: true, t: 'Disable fullscreen optimizations', d: 'Per-game flag so exclusive-fullscreen games bypass the DWM overlay.', m: 'Will set the DisableFullscreenOptimizations compatibility flag for game executables.' },
    'game-bg-apps-off': { t: 'Disable background apps', d: 'Stops UWP apps burning CPU behind your game.', m: 'Will set BackgroundAppGlobalToggle=0 under HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications.' },
    'game-mode-win-on': { free: true, os: 'both', t: 'Windows Game Mode ON', d: 'The real Game Mode — Windows deprioritizes background work for the game.', m: 'Will set AllowAutoGameMode=1.\nDifferent from Game Bar/DVR (which stay off).' },
    'game-mouse-raw': { free: true, os: 'both', t: 'Raw mouse (no acceleration)', d: 'Pointer precision OFF — true 1:1 mouse movement.', m: 'Will zero MouseSpeed/MouseThreshold1/MouseThreshold2.\nRe-apply in-game sensitivity afterwards.' },
    'game-keyboard-fast': { free: true, os: 'both', t: 'Fastest key repeat', d: 'Minimal delay, maximum repeat rate for movement keys.', m: 'Will set KeyboardDelay=0 and KeyboardSpeed=31.' },
    'game-discrete-gpu': { os: 'both', t: 'Force discrete GPU for saved games', d: 'Writes GpuPreference=2 per saved exe — laptops stop picking the iGPU.', m: 'Will set GpuPreference=2 for every exe in your Gaming → priority list.\nUses the SAVED list — use the "Force discrete GPU" button there so it sends your list. Previous per-exe values are captured for undo.' },
    'gpu-no-mpo': { os: 'both', t: 'Multiplane Overlay off', d: "Microsoft's documented flicker/stutter workaround for odd GPU+monitor combos.", m: 'Will set OverlayTestMode=5.\nIf nothing changes for you, revert — MPO helps laptop battery life.' },
    // ————— GPU vendor (display adapters only) —————
    'gpu-nv-telemetry': { t: 'Disable NVIDIA telemetry', d: 'Stops + disables the NvTelemetryContainer service. Drivers keep working.', m: 'Will stop and disable the NvTelemetryContainer service.\nNVIDIA drivers and GeForce Experience keep working — only the telemetry pipe stops.' },
    'gpu-msi-mode': { t: 'GPU MSI mode (lower DPC latency)', d: 'MSISupported=1 on display adapters — interrupts instead of legacy lines.', m: 'Will set MSISupported=1 on your PCI display adapter(s).\nREQUIRES REBOOT. Skips audio/USB devices entirely.' },
    'gpu-amd-ulps': { t: 'Disable AMD ULPS', d: 'EnableUlps=0 — stops second-GPU power-gating stutter.', m: 'Will set EnableUlps=0 on AMD display adapter(s).\nREQUIRES REBOOT. Only appears useful on AMD graphics.' },
    // ————— Network & internet (Pro group inside the Network tab) —————
    'net-timed-wait': { t: 'Faster port recycling (TcpTimedWaitDelay=30)', d: 'Frees closed connections sooner — helps heavy browsing/gaming.', m: 'Will set TcpTimedWaitDelay=30 under HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters. Default is 240s.' },
    'net-max-user-port': { t: 'More ephemeral ports (MaxUserPort=65534)', d: 'Raises the outbound-connection ceiling for busy networks.', m: 'Will set MaxUserPort=65534 in the Tcpip Parameters key. Default is 5000.' },
    'net-flush-dns': { free: true, t: 'Flush DNS cache', d: 'Runs ipconfig /flushdns — fixes stale/poisoned lookups.', m: 'Will run: ipconfig /flushdns. Instant, harmless, no reboot needed.' },
    'net-fast-dns-cloudflare': { t: 'Use Cloudflare DNS (1.1.1.1)', d: 'Sets 1.1.1.1 / 1.0.0.1 on the active adapter via netsh.', m: 'Will reconfigure the active network adapter DNS servers to 1.1.1.1 and 1.0.0.1 via netsh.\nBrief (1–2s) connection blip expected.' },
    'net-fast-dns-google': { t: 'Use Google DNS (8.8.8.8)', d: 'Sets 8.8.8.8 / 8.8.4.4 on the active adapter via netsh.', m: 'Will reconfigure the active network adapter DNS servers to 8.8.8.8 and 8.8.4.4 via netsh.\nBrief (1–2s) connection blip expected.' },
    'net-no-smb-limit': { t: 'Disable SMB bandwidth limiting', d: 'Removes the WAU policy cap on local file transfers.', m: 'Will write the WAU value under HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer.' },
    'net-nic-powersave-off': { os: 'both', t: 'NIC power saving off', d: 'PnPCapabilities=24 — Windows stops napping network adapters mid-game.', m: 'Will set PnPCapabilities=24 on every NIC device key.\nReboot to apply. Laptops on battery will drain slightly faster.' },
    'net-nic-eco-off': { os: 'both', t: 'Disable NIC eco features', d: 'Kills Interrupt Moderation, Green Ethernet, wake-patterns; forces RSS on.', m: 'Will flip eco advanced-properties to Disabled per up adapter (unsupported names are skipped — drivers vary) and set Receive Side Scaling to Enabled.\nReboot to apply.' },
    'net-qos-limit': { free: true, os: 'both', t: 'QoS bandwidth cap → 0%', d: 'Forces the reservable-bandwidth policy to zero. Honestly minor on Win10/11.', m: 'Will set NonBestEffortLimit=0.\nTruth in advertising: modern Windows does not reserve bandwidth the way the old myth claims — this just guarantees nothing can throttle.' },
    'net-reset-stack': { os: 'both', t: 'Reset network stack', d: 'winsock + IP reset. The classic "nothing else fixed it" repair.', m: '⚠ Will run netsh winsock reset + netsh int ip reset.\nYou MUST reboot after. VPN/virtual adapters may need re-setup.' },
    'net-ecn-on': { os: 'both', t: 'Explicit Congestion Notification on', d: 'Better behavior on lossy/bufferbloated paths (hotel Wi-Fi, bad nodes).', m: 'Will run netsh interface tcp set global ecncapability=enabled.\nReversible to disabled.' },
    'net-rsc-off': { os: 'both', t: 'Receive Segment Coalescing off', d: 'Trades a little bulk throughput for lower, steadier latency.', m: 'Will run netsh interface tcp set global rsc=disabled.\nIf downloads get slower, revert.' },
    'net-no-tunnel': { os: 'both', t: 'Dead transition tunnels off', d: 'Disables Teredo/6to4/ISATAP — less surface, fewer weird tunnels.', m: 'Will disable all three transition technologies.\n⚠ Xbox party chat uses Teredo — revert if party chat breaks.' },
    'net-adapter-restart': { os: 'both', t: 'Restart network adapters', d: 'Disable → enable every up adapter. The classic repair button.', m: 'Will bounce every active physical adapter.\n5–10s connection blip, no reboot. Nothing is uninstalled.' },
    'net-fast-dns-pair': { os: 'both', t: 'Low-latency DNS pair (1.1.1.1 + 8.8.8.8)', d: 'Cloudflare primary, Google secondary on every active adapter — if one resolver hiccups, the other answers.', m: 'Will set static DNS 1.1.1.1 (primary) + 8.8.8.8 (secondary) on every UP adapter via netsh.\nPrevious servers (or DHCP) are captured for undo. Brief DNS blip possible.' },
    'net-dns-tune': { os: 'both', t: 'Flush + tune DNS cache', d: 'Flushes the resolver cache and stops remembering failed lookups.', m: 'Will run ipconfig /flushdns and set MaxNegativeCacheTtl=0.\nSlightly more upstream queries after failures — the price of fresh answers. Reversible.' },
    'net-no-neg-cache': { os: 'both', t: 'No negative DNS caching', d: 'Failed lookups retry immediately instead of being remembered.', m: 'Will set MaxNegativeCacheTtl=0 under the Dnscache Parameters key.\nMore upstream queries after NXDOMAINs — negligible on broadband. Reversible.' },
    'net-no-delack': { os: 'both', t: 'Disable delayed ACK', d: 'TcpAckFrequency=1 + TcpDelAckTicks=0 per adapter — ACKs go out immediately.', m: 'Will write both values under every interface in Tcpip\\Parameters\\Interfaces.\nSlightly more upstream ACK traffic; lower latency in twitch games. Reversible.' },
    'net-delack-zero': { os: 'both', t: 'Zero delayed ACK ticks', d: 'TcpDelAckTicks=0 per adapter — completes the Nagle disable.', m: 'Pairs with Disable delayed ACK (which sets the same value alongside TcpAckFrequency).\nApply both for the full effect. Reversible.' },
    'net-tcp-heuristics': { os: 'both', t: 'Scaling heuristics off', d: 'Stops Windows overriding your TCP window-scaling decisions.', m: 'Will run netsh int tcp set heuristics disabled.\nPrevious state is captured for undo.' },
    'net-tcp-scale': { os: 'both', t: 'TCP window scaling on', d: 'Autotuning normal + Receive Side Scaling for modern-link throughput.', m: 'Will set autotuninglevel=normal and rss=enabled.\nBoth are Windows defaults — this repairs machines where something changed them. Previous values captured for undo.' },
    'net-tcp-autotune': { os: 'both', t: 'TCP autotuning normal', d: 'Balanced window scaling for steady throughput.', m: 'Will set autotuninglevel=normal.\nPairs with TCP window scaling (which also enables RSS). Previous value captured for undo.' },
    'net-tcp-sack': { os: 'both', t: 'Selective ACK on', d: 'Recovers from packet loss faster.', m: 'Will set sack=enabled.\nThe Windows default — repairs drift. Previous value captured for undo.' },
    // ————— Performance & CPU —————
    'cpu-boost-mode': { t: 'Processor boost mode (unlock + Aggressive)', d: 'Unhides the boost setting (Attributes 0→2) then sets Aggressive.', m: 'Will set Attributes=2 on be337238-0d82-4146-a960-4f3749d470c7 to unhide it, then set the boost policy to Aggressive (3).\nMore boost = more heat. Watch thermals on laptops.' },
    'cpu-no-throttle': { t: 'Disable CPU power throttling', d: 'PowerThrottlingOff=1 — stops Windows parking/clocking down cores.', m: 'Will set PowerThrottlingOff=1 in the power policy keys. Higher idle power draw.' },
    'cpu-no-interrupt-steering': { t: 'Disable interrupt steering', d: 'InterruptSteeringDisabled=1 — steadier DPC latency for audio/games.', m: 'Will set InterruptSteeringDisabled=1 under HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\kernel.' },
    'cpu-timer-serialization': { t: 'Timer serialization', d: 'SerializeTimerExpiration=1 — smoother timer coalescing behaviour.', m: 'Will set SerializeTimerExpiration=1 in the kernel Session Manager key.' },
    'cpu-no-energy-est': { t: 'Disable energy estimation', d: 'EnergyEstimationEnabled=0 — removes EET overhead.', m: 'Will set EnergyEstimationEnabled=0. Battery-life estimates become less accurate.' },
    'cpu-no-parking': { t: 'Disable core parking (100% minimum)', d: 'Unhides the parking setting and forces all cores unparked.', m: 'Will unhide the core-parking power setting and set minimum unparked cores to 100% on AC.\nHigher idle temps/power.' },
    'cpu-no-hibernate': { t: 'Disable hibernation', d: 'powercfg -h off — deletes hiberfil.sys, frees GBs of disk.', m: 'Will run: powercfg -h off and remove hiberfil.sys.\nYou lose Hibernate + Fast Startup. Sleep still works.' },
    'cpu-min-state-100': { t: 'Processor minimum state 100%', d: 'CPU never clocks below max on the active plan.', m: 'Will set PROCTHROTTLEMIN=100 on the active power scheme via powercfg.\nExpect higher idle power and fan noise.' },
    'cpu-no-pcie-link': { t: 'Disable PCIe link-state power mgmt', d: 'Stops the GPU/NVMe link downclocking mid-game (stutter source).', m: 'Will set the PCIe link-state setting to Off (0) on the active power scheme.' },
    'cpu-bios-utc': { free: true, os: 'both', t: 'UTC BIOS clock (dual-boot fix)', d: 'Stops Windows and Linux fighting over the hardware clock.', m: 'Will set RealTimeIsUniversal=1 under HKLM\\SYSTEM\\CurrentControlSet\\Control\\TimeZoneInformation.\nPointless if you only run Windows — harmless either way.' },
    'cpu-fg-priority': { os: 'both', t: 'Foreground priority 0x26 (smart)', d: 'Reads the current value first — only writes if something set a server-style policy.', m: 'Will READ Win32PrioritySeparation first.\nIf it is already 2 or 0x26 (normal desktops), nothing is written.\nIf it is 0x18 or anything else, it is set to 0x26 (short quantums + foreground boost).\nReboot to fully apply. Honest version: on most PCs this changes nothing, which the app will tell you.' },
    'cpu-no-dynamictick': { os: 'both', t: 'Disable dynamic tick', d: 'bcdedit + kernel twin — stops idle-tick stretching during games.', m: 'Will run bcdedit /set disabledynamictick yes and set DisableDynamicTick=1 in the kernel key.\nSlightly higher idle power. Reboot to apply.' },
    'cpu-tsc-enhanced': { os: 'both', t: 'TSC sync Enhanced', d: 'Tighter timestamp-counter sync across cores (standard timer tweak).', m: 'Will run bcdedit /set tscsyncpolicy Enhanced.\nReboot to apply. Pairs with dynamic-tick off.' },
    'cpu-no-spec-mit': { os: 'both', t: 'Disable Spectre/Meltdown mitigations', d: 'Real CPU headroom on affected chips — at a real security cost.', m: '⚠ WARNING: this turns OFF speculative-execution protections (FeatureSettingsOverride=3).\nFaster on some CPUs, genuinely less safe against malicious code.\nOnly for gaming-only machines. REBOOT required.' },
    'cpu-x2apic': { os: 'both', t: 'Enable x2APIC policy', d: 'Modern interrupt routing on supporting Intel firmware (no-op elsewhere).', m: 'Will run bcdedit /set x2apicpolicy Enable.\nUEFI + REBOOT required. Harmless where unsupported.' },
    'cpu-timer-res': { os: 'both', t: '0.5ms timer resolution (live)', d: 'The highest-value latency tweak — held by a tiny hidden process.', m: 'Will start a hidden PowerShell that requests 0.5ms timer resolution (the ISLC mechanism, done transparently).\nSlightly higher idle power while active. Ends on Undo, app quit, or reboot — nothing permanent is written.' },
    // ————— Visual & UI —————
    'vis-menu-delay': { free: true, t: 'Instant menus (MenuShowDelay=0)', d: 'Menus pop immediately instead of the 400ms fade.', m: 'Will set HKCU\\Control Panel\\Desktop MenuShowDelay=0 (default 400).\nTakes effect for newly opened menus.' },
    'vis-no-peek': { t: 'Disable Aero Peek', d: 'EnableAeroPeek=0 — no more desktop preview lag on hover.', m: 'Will set EnableAeroPeek=0 under HKCU\\Software\\Microsoft\\Windows\\DWM.' },
    'vis-no-anim': { t: 'Disable window animations', d: 'MinAnimate=0 — windows snap open instantly.', m: 'Will set MinAnimate=0 under HKCU\\Control Panel\\Desktop\\WindowMetrics.' },
    'vis-no-blur': { t: 'Disable blur effects', d: 'EnableBlurBehind=0 — cheaper compositing on weak GPUs.', m: 'Will set EnableBlurBehind=0. Transparent surfaces become flat.' },
    'vis-transparency-off': { t: 'Transparency OFF', d: 'EnableTransparency=0 — maximum snappiness.', m: 'Will disable Windows transparency effects.' },
    'vis-transparency-on': { free: true, t: 'Transparency ON', d: 'EnableTransparency=1 — restore the frosted look.', m: 'Will re-enable Windows transparency effects.' },
    'vis-extensions': { free: true, t: 'Show file extensions', d: 'HideFileExt=0 — see .exe vs .txt at a glance (also safer).', m: 'Will set HideFileExt=0 in Explorer Advanced settings.' },
    'vis-hidden-files': { free: true, t: 'Show hidden files', d: 'Hidden=1 — reveal AppData-style folders in Explorer.', m: 'Will set Hidden=1 in Explorer Advanced settings.' },
    'vis-no-sticky': { free: true, t: 'Disable Sticky Keys popup', d: 'No more accessibility prompt after 5× Shift in games.', m: 'Will set the StickyKeys flags value to 506.' },
    'vis-no-toggle-keys': { t: 'Disable Toggle Keys audio', d: 'Silences the NumLock beep (Flags=58).', m: 'Will set ToggleKeys Flags=58.' },
    'vis-classic-context': { free: true, os: 'win11', t: 'Classic right-click menu', d: 'Bring back the full Windows 10 context menu. No more "Show more options".', m: 'Will write an empty default value under the {86ca1aa0-…} CLSID key.\nRestart Explorer (or reboot) to see it. Undo removes the key.' },
    'vis-end-task': { free: true, os: 'win11', t: 'Taskbar End Task button', d: 'Right-click any taskbar app → End task. Task Manager speedrun.', m: 'Will set TaskbarEndTask=1 under TaskbarDeveloperSettings.' },
    'vis-no-taskview': { free: true, os: 'both', t: 'Hide Task View button', d: 'Declutters the taskbar (Win+Tab still works).', m: 'Will set ShowTaskViewButton=0.' },
    'vis-no-chat': { free: true, os: 'win11', t: 'Hide Teams Chat icon', d: 'Removes the pinned Chat icon from the Windows 11 taskbar.', m: 'Will set TaskbarMn=0.' },
    'vis-numlock': { free: true, os: 'both', t: 'NumLock on at boot', d: 'Numpad works immediately at the login screen.', m: 'Will set InitialKeyboardIndicators=2.' },
    'vis-no-thumbs-network': { free: true, os: 'both', t: 'No thumbs.db on network', d: 'Stops Explorer writing/locking thumbnail caches across shares.', m: 'Will set DisableThumbsDBOnNetworkFolders=1.' },
    'vis-this-pc': { free: true, os: 'both', t: 'Explorer opens to This PC', d: 'Skips Quick Access/Home on every new window.', m: 'Will set LaunchTo=1.' },
    'vis-no-lockscreen': { os: 'both', t: 'Skip the lock screen', d: 'Straight to the sign-in prompt, no swipe/click first.', m: 'Will set NoLockScreen=1. Your password/PIN is still required.' },
    'vis-no-login-blur': { free: true, os: 'both', t: 'No logon-screen blur', d: 'Snappier sign-in paint, less GPU work.', m: 'Will set DisableAcrylicBackgroundOnLogon=1.' },
    'vis-taskbar-left': { free: true, os: 'win11', t: 'Taskbar buttons left', d: 'Classic left alignment on Windows 11.', m: 'Will set TaskbarAl=0 (restart Explorer to see it).' },
    'vis-classic-clock': { free: true, os: 'win11', t: 'Classic clock flyout', d: 'Old-style taskbar clock panel on Windows 11.', m: 'Will set UseWin32TrayClockExperience=0.' },
    'vis-no-taskbar-search': { free: true, os: 'win11', t: 'Hide taskbar Search box', d: 'Declutters the bar (Win+S still searches).', m: 'Will set SearchboxTaskbarMode=0.' },
    'vis-taskbar-seconds': { free: true, os: 'win11', t: 'Clock shows seconds', d: 'Taskbar clock with seconds precision.', m: 'Will set SecondsInSystemClock=1.' },
    'vis-classic-alttab': { free: true, os: 'both', t: 'Classic Alt+Tab switcher', d: 'XP-style icon grid instead of thumbnails.', m: 'Will set AltTabSettings=1.' },
    'vis-no-shake': { free: true, os: 'both', t: 'Aero Shake off', d: 'Shaking a window stops minimizing everything else.', m: 'Will set DisallowShaking=1.' },
    'vis-no-shadows': { free: true, os: 'both', t: 'Icon + taskbar shadows off', d: 'One less compositing pass per frame for weak GPUs.', m: 'Will set ListviewShadow=0 and TaskbarAnimations=0.' },
    'vis-no-drag-full': { free: true, os: 'both', t: 'Outlines while dragging', d: 'Windows stop repainting their contents mid-drag.', m: 'Will set DragFullWindows=0. You will see an outline instead of the live window.' },
    'vis-fx-custom-min': { free: true, os: 'both', t: 'Micro-animation bundle off', d: 'Kills combobox, listbox, selection, tooltip + cursor shadows in one shot.', m: 'Will zero 5 animation values (ComboBox, ListBoxSmoothScrolling, SelectionFade, TooltipAnimation, CursorShadow).\nThe "uncheck everything" recipe, reversible.' },
    // ————— Advanced system —————
    'adv-no-indexing': { t: 'Disable Search indexing (WSearch)', d: 'Stops the indexer hammering your disk in the background.', m: 'Will stop and disable the WSearch service.\nStart-menu search still works, just slower on huge drives.' },
    'adv-no-sysmain': { t: 'Disable SysMain (Superfetch)', d: 'Great for SSDs — stops pointless prefetch disk churn.', m: 'Will stop and disable the SysMain service. Recommended on SSDs; HDD users may prefer to keep it.' },
    'adv-no-delivery-opt': { t: 'Disable Update delivery optimization', d: 'DODownloadMode=0 — your PC stops uploading updates to strangers.', m: 'Will set DODownloadMode=0 under DeliveryOptimization\\Config.' },
    'adv-no-xbox-bar': { t: 'Disable Xbox Game Bar', d: 'AppCaptureEnabled=0 + GameDVR_Enabled=0 — zero capture overhead.', m: 'Will disable Game Bar capture flags (same as the Gaming tab switch).' },
    'adv-no-bg-apps': { t: 'Disable background apps', d: 'BackgroundAppGlobalToggle=0 — UWP apps stay dead when closed.', m: 'Will set the global background-apps toggle to 0.' },
    'adv-no-activity': { t: 'Disable Activity History', d: 'EnableActivityFeed=0 + PublishUserActivities=0 — Timeline stops logging.', m: 'Will disable Activity Feed publishing in HKLM policies.' },
    'adv-no-clipboard-hist': { t: 'Disable Clipboard History', d: 'EnableClipboardHistory=0 — Win+V history off.', m: 'Will disable cloud clipboard history.' },
    'adv-no-tips': { free: true, t: 'Disable tips & suggestions', d: 'SoftLandingEnabled=0 — no more "suggested" apps and tips.', m: 'Will disable SoftLanding and SubscribedContent suggestion flags.' },
    'adv-no-copilot': { free: true, os: 'both', t: 'Disable Copilot', d: 'Kills Copilot + hides its taskbar button.', m: 'Will set TurnOffWindowsCopilot=1 (HKCU policy) and hide the taskbar button.\nReversible — the button comes back on Revert.' },
    'adv-no-widgets': { free: true, os: 'win11', t: 'Disable Widgets board', d: 'TaskbarDa=0 — no more weather widget eating RAM.', m: 'Will set TaskbarDa=0. Win+W stops working until reverted.' },
    'adv-no-news': { free: true, os: 'win10', t: 'Remove News & Interests feed', d: 'De-clutters the Windows 10 taskbar.', m: 'Will set ShellFeedsTaskbarViewMode=2 (feed off, icon optional).' },
    'adv-consumer-feats': { free: true, os: 'win10', t: 'Block sponsored apps', d: 'DisableWindowsConsumerFeatures=1 — no auto-installed Candy Crush.', m: 'Will set the CloudContent policy to 1 (needs admin).\nOnly affects future suggestions, not installed apps.' },
    'adv-no-bing': { free: true, os: 'both', t: 'Bing out of Start search', d: 'Start-menu searches stay local and instant.', m: 'Will set DisableSearchBoxSuggestions=1.' },
    'adv-no-snap': { free: true, os: 'win11', t: 'Disable Snap flyout', d: 'Hovering maximize stops popping the layout picker (Win+arrows still snap).', m: 'Will set EnableSnapAssistFlyout=0.' },
    'adv-no-search-highlights': { free: true, os: 'both', t: 'Search highlights off', d: 'Kills the ad-like rotating panel in Start search.', m: 'Will set IsDynamicSearchBoxEnabled=0.' },
    'adv-no-error-report': { os: 'both', t: 'Error Reporting off', d: 'No more "looking for a solution" hangs after crashes.', m: 'Will set Disabled=1 under Windows Error Reporting.\nCrash logs stop being sent to Microsoft.' },
    'adv-no-driver-updates': { os: 'both', t: 'Block driver updates via WU', d: 'Stops Windows Update overwriting your GPU drivers. The classic rage-source.', m: 'Will set ExcludeWUDriversInQualityUpdate=1.\nSecurity + feature updates keep flowing; update GPU drivers manually.' },
    'svc-maps-off': { os: 'both', t: 'Disable Maps service', d: 'Downloaded Maps Manager — useless without offline maps.', m: 'Will stop + disable MapsBroker. Offline maps stop working.' },
    'svc-pca-off': { os: 'both', t: 'Disable Compatibility Assistant', d: 'Stops the "this program might not have installed correctly" nag service.', m: 'Will stop + disable PcaSvc.' },
    'svc-geo-off': { os: 'both', t: 'Disable Geolocation service', d: 'System location backend off (pairs with Privacy → location).', m: 'Will stop + disable lfsvc. Apps lose location access.' },
    'svc-fax-off': { os: 'both', t: 'Disable Fax service', d: 'It is not 2004 anymore.', m: 'Will stop + disable the Fax service.' },
    'svc-insider-off': { os: 'both', t: 'Disable Insider service', d: 'No preview builds, no wisvc background work.', m: 'Will stop + disable wisvc.' },
    'svc-touchkbd-off': { os: 'both', t: 'Disable Touch Keyboard service', d: 'Only if you have NO touchscreen — else your keyboard vanishes.', m: '⚠ Will stop + disable TabletInputService.\nTouchscreen/pen users: SKIP THIS. Absent on most desktops (then it reports "nothing to do").' },
    'adv-no-search-highlights': { free: true, os: 'both', t: 'Search highlights off', d: 'Kills the ad-like rotating panel in Start search.', m: 'Will set IsDynamicSearchBoxEnabled=0.' },
    'adv-no-error-report': { os: 'both', t: 'Error Reporting off', d: 'No more "looking for a solution" hangs after crashes.', m: 'Will set Disabled=1 under Windows Error Reporting.\nCrash logs stop being sent to Microsoft.' },
    'adv-no-driver-updates': { os: 'both', t: 'Block driver updates via WU', d: 'Stops Windows Update overwriting your GPU drivers. The classic rage-source.', m: 'Will set ExcludeWUDriversInQualityUpdate=1.\nSecurity + feature updates keep flowing; update GPU drivers manually.' },
    // ————— Optional services (Risxn-style kills, but reversible) —————
    'svc-xbox-off': { t: 'Disable Xbox services', d: 'XblAuthManager, XblGameSave, XboxGipSvc, XboxNetApiSvc → disabled.', m: 'Will stop and disable the four Xbox services.\nXbox app sign-in and Game Bar companions stop working. Reversible.' },
    'svc-printer-off': { t: 'Disable Print Spooler', d: 'Spooler → disabled. For PCs that never print.', m: 'Will stop and disable the Print Spooler.\nYou will NOT be able to print until re-enabled.' },
    'svc-bluetooth-off': { t: 'Disable Bluetooth services', d: 'bthserv → disabled. For desktops with no BT hardware.', m: 'Will stop and disable the Bluetooth service.\nBT audio and devices may drop until re-enabled.' },
    // ————— Services tab additions (services + scheduled tasks) —————
    'svc-remote-reg': { os: 'both', t: 'Disable Remote Registry', d: 'Closes remote registry access for a security win.', m: 'Will stop and disable the Remote Registry service.\nNothing on a home PC needs remote registry. Reversible.' },
    'svc-bits-off': { os: 'both', t: 'Disable Background Transfer (BITS)', d: 'Background file transfer used by Windows Update.', m: '⚠ Will stop and disable BITS.\nWindows Update and Store downloads may stall until re-enabled. Only for metered/offline-style setups.' },
    'svc-trkwks-off': { os: 'both', t: 'Disable Distributed Link Tracking', d: 'Maintains NTFS links across the network. Rarely needed.', m: 'Will stop and disable the TrkWks service.\nStale network shortcuts may not self-heal. Reversible.' },
    'svc-gameinput-off': { os: 'both', t: 'Disable GameInput service', d: 'GameInput API backend. Skip if controllers act up.', m: 'Will stop and disable the GameInput service.\nIf a gamepad stops working afterwards, revert. Reversible.' },
    'svc-parental-off': { os: 'both', t: 'Disable Parental Controls', d: 'Family Safety backend. Only if no child accounts need it.', m: '⚠ Will stop and disable Parental Controls (WpcMonSvc).\nFamily Safety screen-time and filters stop working. Reversible.' },
    'svc-netbios-off': { os: 'both', t: 'Disable TCP/IP NetBIOS Helper', d: 'Legacy name resolution. Ancient printers may need it.', m: 'Will stop and disable the NetBIOS Helper (lmhosts).\nVery old network printers/shares can break. Reversible.' },
    'svc-telephony-off': { os: 'both', t: 'Disable Telephony', d: 'Dial-up/fax modem backend. Dead tech on most PCs.', m: 'Will stop and disable the Telephony service.\nFax modems and dial-up stop working. Reversible.' },
    'svc-themes-off': { os: 'both', t: 'Disable Windows Themes service', d: 'Only if you do not care about visual themes.', m: '⚠ Will stop and disable the Themes service.\nWindows falls back to the basic un-themed look until re-enabled.' },
    'svc-hyperv-off': { os: 'both', t: 'Disable Hyper-V services', d: 'Host virtualization off. Only if you never virtualize.', m: '⚠ Will stop and disable the Hyper-V host services (vmms, HvHost).\nVirtual machines, Docker Desktop and WSL2 distros will NOT start until re-enabled. Skip if you use any of them.' },
    'task-telemetry-off': { os: 'both', t: 'Disable telemetry scheduled tasks', d: 'Clears CEIP, compatibility appraiser and related tasks.', m: 'Will DISABLE (not delete) 6 tasks under Application Experience + Customer Experience Improvement Program.\nPrevious states are captured — Undo re-enables exactly what was on. Missing tasks are skipped.' },
    'task-maintenance-off': { os: 'both', t: 'Disable maintenance auto-runs', d: 'Stops idle-time automatic maintenance from interrupting.', m: '⚠ Will DISABLE Idle + Regular Maintenance tasks.\nWindows stops its idle-time tune-ups — run them manually from Control Panel → Security and Maintenance when wanted. Undo re-enables.' },
    // ————— Privacy & security —————
    'priv-no-telemetry': { t: 'Disable telemetry', d: 'AllowTelemetry=0 — minimum diagnostic data to Microsoft.', m: 'Will set AllowTelemetry=0 under HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection.' },
    'priv-no-adid': { t: 'Disable advertising ID', d: 'Per-app ad tracking ID off (HKCU AdvertisingInfo).', m: 'Will set HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\AdvertisingInfo Enabled=0.' },
    'priv-no-tailored': { t: 'Disable tailored experiences', d: 'DoNotUseTailoredExperiencesWithDiagnosticData=1.', m: 'Will block diagnostic-data-driven personalised tips/ads.' },
    'priv-no-suggestions': { t: 'Disable app suggestions', d: 'Kills Start-menu suggested content flags.', m: 'Will set SubscribedContent-338388Enabled=0 and 353694Enabled=0.' },
    'priv-no-cortana': { t: 'Disable Cortana data collection', d: 'Policy-blocks Cortana; file search keeps working.', m: 'Will set the AllowCortana policy to 0.' },
    'priv-no-location': { t: 'Disable location tracking', d: 'DisableLocation=1 — system-wide location off.', m: 'Will set DisableLocation=1 under HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\LocationAndSensors.\nMaps/Find-my-device stop working.' },
    'priv-block-trackers': { t: 'Block tracking domains (hosts)', d: 'Redirects Microsoft/ad telemetry domains to 0.0.0.0 — with backup.', m: 'Will BACK UP C:\\Windows\\System32\\drivers\\etc\\hosts, then append 0.0.0.0 entries for ~15 telemetry/ad domains and flush DNS.\nRestore → Revert all restores the backup.' },
    'priv-no-telemetry-svc': { t: 'Disable telemetry services', d: 'Stops + disables DiagTrack and dmwappushservice.', m: 'Will run: sc stop/config DiagTrack and dmwappushservice → disabled.\nREQUIRES ADMIN.' },
    'priv-lsa': { t: 'Enable LSA Protection', d: 'RunAsPPL=1 — hardens LSASS against credential theft.', m: 'Will set RunAsPPL=1 under HKLM\\SYSTEM\\CurrentControlSet\\Control\\Lsa.\nREQUIRES REBOOT. Misconfigured drivers can rarely cause boot loops — restore point created first.' },
    'priv-credential-guard': { t: 'Enable Credential Guard / VBS / HVCI', d: 'Virtualization-based security for credentials.', m: 'Will enable VBS/HVCI policy keys.\nREQUIRES REBOOT + UEFI/Secure Boot capable hardware. Can conflict with some anti-cheats and old drivers.' },
    'priv-no-llmnr': { os: 'both', t: 'Disable LLMNR', d: 'Stops multicast name leaks (classic responder-attack vector).', m: 'Will set EnableMulticast=0 under the DNSClient policy key.' },
    'priv-no-smb1': { os: 'both', t: 'Remove SMBv1 protocol', d: 'Kills the WannaCry-era attack surface via DISM (takes ~1 min).', m: 'Will run DISM /Online /Disable-Feature SMB1Protocol.\nOnly ancient scanners/printers still need v1. Reboot to finish.' },
    'priv-no-rdp': { os: 'both', t: 'Deny inbound Remote Desktop', d: 'Network-side RDP door shut. Do NOT apply if you remote into this PC.', m: '⚠ Will set fDenyTSConnections=1.\nIf YOU use Remote Desktop to reach this machine, you will lock yourself out. Outbound RDP (you connecting elsewhere) is unaffected.' },
    'priv-no-autoplay': { free: true, os: 'both', t: 'AutoPlay off (all drives)', d: 'USB sticks can no longer auto-launch anything.', m: 'Will set NoDriveTypeAutoRun=255 for your user.' },
    'priv-no-recall': { os: 'win11', t: 'Disable Recall / AI analysis', d: 'The documented kill-switch for screenshot Recall on Copilot+ PCs.', m: 'Will set DisableAIDataAnalysis=1 under the WindowsAI policy key.\nOnly meaningful on Windows 11 24H2+ Copilot+ hardware.' },
    'priv-no-ceip': { os: 'both', t: 'Disable CEIP', d: 'Customer Experience Improvement Program off.', m: 'Will set CEIPEnable=0.' },
    'priv-no-ink-collection': { os: 'both', t: 'Block ink/typing collection', d: 'Stops pen + typing personalization telemetry.', m: 'Will set RestrictImplicitTextCollection=1 and RestrictImplicitInkCollection=1.' },
    'priv-no-feedback': { free: true, os: 'both', t: 'Feedback prompts → Never', d: 'Windows stops asking you to rate it.', m: 'Will set NumberOfSIUFInPeriod=0.' },
    'priv-no-camera': { os: 'both', t: 'Camera kill-switch', d: 'Enterprise policy: apps get black frames.', m: 'Will set AllowCamera=0.\nBreaks video calls until reverted.' },
    'priv-no-mic': { os: 'both', t: 'Microphone kill-switch', d: 'Enterprise policy: apps get silence.', m: 'Will set AllowMicrophone=0.\nBreaks voice chat until reverted.' },
    'priv-no-usb-storage': { os: 'both', t: 'Block USB storage devices', d: 'Thumb drives stop mounting. Keyboards/mice unaffected.', m: 'Will set USBSTOR Start=4.\nYour OWN flash drives stop working too until reverted. Reboot to enforce.' },
    // ————— Power —————
    'power-ultimate': { t: 'Ultimate Performance plan', d: 'Unlock + activate the hidden top-tier power scheme.', m: 'Will run powercfg -duplicatescheme e9a42b02-… then set it active (High Performance fallback if unsupported).' },
    'power-balanced': { t: 'Balanced power plan', d: 'Back to the stock Balanced scheme — the universal "put it back".', m: 'Will activate the Balanced power scheme (381b4222-…). Use after benchmarking or as the Eco preset anchor.' },
    'power-no-modern-standby': { os: 'both', t: 'Real S3 sleep (no Modern Standby)', d: 'Kills "hot bag" drain on supporting laptops.', m: 'Will set CsEnabled=0.\nREQUIRES REBOOT. If the key is absent your board does not support it.' },
    'power-lid-nothing': { os: 'both', t: 'Lid close = do nothing (AC)', d: 'For docked laptops driving external monitors.', m: 'Will set lid action to 0 on AC power only.\n⚠ Bag-carriers beware: closing the lid will NOT sleep a plugged-in laptop.' },
    'power-sleep-never': { os: 'both', t: 'Never sleep on AC', d: 'For downloads, servers and overnight renders.', m: 'Will set the sleep timeout to 0 (never) on AC.\nScreen may still dim — that is a separate timer.' },
    'power-no-auto-hibernate': { os: 'both', t: 'Never auto-hibernate', d: 'Sleep stays sleep — no surprise hiberfil writes.', m: 'Will set the hibernate-after timer to 0.' },
    'power-active-cooling': { os: 'both', t: 'Active cooling policy', d: 'Fans ramp BEFORE clocks drop. For laptops that lose fps after 10 minutes.', m: 'Will set the cooling policy to Active on AC.\nLouder, faster, longer. If your fans already scream, this changes little.' },
    // ————— System boot & behavior (all Free) —————
    'sys-verbose-boot': { free: true, os: 'both', t: 'Verbose boot messages', d: 'See WHAT Windows is doing instead of spinning dots.', m: 'Will set VerboseStatus=1.' },
    'sys-bsod-details': { free: true, os: 'both', t: 'Technical BSODs', d: 'Blue screens show the stop code + driver instead of ":(".', m: 'Will set DisplayParameters=1. Invaluable the one time you need it.' },
    'sys-fast-shutdown': { free: true, os: 'both', t: 'Fast shutdown/logoff', d: 'Auto-ends hung apps instead of the "waiting" purgatory.', m: 'Will set AutoEndTasks=1, HungAppTimeout=1000, WaitToKillAppTimeout=2000.' },
    'sys-storage-sense': { free: true, os: 'both', t: 'Storage Sense on', d: 'Windows auto-cleans temp + recycle on a schedule.', m: 'Will enable the global Storage Sense policy.' },
    'sys-boot-legacy': { os: 'both', t: 'Legacy F8 boot menu', d: 'Classic text boot menu with Safe Mode on F8.', m: 'Will run bcdedit /set bootmenupolicy Legacy.\nFor troubleshooters who miss F8.' },
    'sys-minidump': { os: 'both', t: 'Minidumps, not full dumps', d: 'A crash writes KBs instead of GBs of RAM to disk.', m: 'Will set CrashDumpEnabled=3 (small memory dump).' },
    'sys-no-bsod-reboot': { os: 'both', t: 'No auto-reboot on blue screens', d: 'Stay on the error so you can read it. Pairs with technical BSODs.', m: 'Will set AutoReboot=0.\nHold the power button to reboot. You were warned.' },
    // ————— Filesystem NTFS (Pro, admin — values captured first) —————
    'disk-no-lastaccess': { os: 'both', t: 'Last-access timestamps off', d: 'Fewer disk writes on file-heavy systems. Your current value is captured for undo.', m: 'Will run fsutil behavior set disablelastaccess 1.\nUndo restores YOUR previous value (checked live on this PC: defaults differ). Reboot to fully apply.' },
    'disk-no-8dot3': { os: 'both', t: '8.3 short filenames off', d: 'Skips legacy name bookkeeping on new files.', m: 'Will run fsutil behavior set disable8dot3 1 (previous value captured for undo).\nAncient 16-bit-era installers can choke — modern software is unaffected.' },
    'ram-standby-task': { os: 'both', t: 'Standby janitor (scheduled)', d: 'Trims idle memory every 15 min via a scheduled task. ISLC-lite.', m: 'Will write a script to your app-data folder and create the "TidalTweaks Standby Cleaner" task (every 15 min).\nUndo deletes BOTH the task and the script. Use the RAM tab button.' },
    'power-no-usb-suspend': { t: 'Disable USB selective suspend', d: 'Stops USB devices (mice, DACs) micro-sleeping and crackling.', m: 'Will disable USB selective suspend on the active power scheme.' },
    'power-no-disk-sleep': { t: 'Never sleep hard disks', d: 'Disk idle timeout → 0 — no spin-up stutter.', m: 'Will set the disk idle timeout to 0 (never) on the active scheme.' },
    'power-cpu-min-100': { t: 'Processor minimum 100%', d: 'Same as the CPU-tab switch, from the Power tab.', m: 'Will set PROCTHROTTLEMIN=100 on the active scheme. Higher idle power.' },
    'power-no-pcie': { t: 'PCIe link-state OFF', d: 'Same as the CPU-tab switch, from the Power tab.', m: 'Will set the PCIe link-state setting to Off on the active scheme.' },
    // ————— Debloat one-clicks (checkbox list lives in the Debloat tab too) —
    'debloat-onedrive': { t: 'Remove OneDrive', d: 'winget uninstall Microsoft.OneDrive + leftover cleanup.', m: 'Will uninstall OneDrive via winget.\nYour OneDrive FILES stay in the cloud; the local sync client is removed. Reversible by reinstalling OneDrive.' },
    'debloat-edge': { t: 'Remove Microsoft Edge', d: 'Edge setup.exe --uninstall --system-level.', m: '⚠ WARNING: Edge is deeply integrated (Widgets, WebView, Outlook links depend on it).\nSome Windows features may misbehave. A restore point is created first — proceed only if you have another browser.' },
    'debloat-visual-fx': { t: 'Disable visual effects', d: 'VisualFXSetting=2 — Adjust for best performance.', m: 'Will set VisualFXSetting=2 (best performance). Windows will look flat but feel instant.' },
    'debloat-no-hibernate': { t: 'Disable hibernation', d: 'powercfg -h off — reclaims hiberfil.sys gigabytes.', m: 'Same as the CPU-tab switch: Hibernate + Fast Startup go away, Sleep stays.' },
    'debloat-disk-cleanup': { t: 'Run Disk Cleanup', d: 'cleanmgr /sagerun:1 — the built-in deep cleaner.', m: 'Will launch the Windows Disk Cleanup engine (Update backups, thumbnails, etc.). Can take several minutes.' },
    'debloat-chrome-bg': { os: 'both', t: 'Chrome: no background mode', d: 'Chrome fully exits instead of idling in the tray.', m: 'Will set the BackgroundModeEnabled enterprise policy to 0.\nTakes effect for Chrome installs (restart Chrome).' },
    'debloat-cortana-app': { os: 'both', t: 'Remove Cortana app', d: 'Removes the Cortana AppX package for your user.', m: 'Will remove Microsoft.549981C3F5F10 via Remove-AppxPackage.\nReinstall from the Store if you miss her.' },
    'debloat-xbox-app': { os: 'both', t: 'Remove Xbox app', d: 'Removes the Xbox AppX — GamingServices left alone.', m: 'Will remove Microsoft.XboxApp only.\nStore games and Game Bar companions keep working.' },
    // ————— Memory & kernel (Advanced tab) —————
    'mem-no-compression': { os: 'both', t: 'Memory compression off', d: 'Frees CPU by turning off the compression store (16GB+ rigs won\'t miss the RAM).', m: 'Will run Disable-MMAgent -mc.\nTrade-off: the RAM compression used to save now stays resident. Reversible with one Undo.' },
    'mem-large-cache': { os: 'both', t: 'Large system cache', d: 'Adjusts the paged pool / cache balance for desktops doing heavy file + game I/O.', m: 'Will set LargeSystemCache=1.\nREQUIRES REBOOT. Server-flavored tuning — revert if anything feels off.' },
    'mem-no-prefetch': { os: 'both', t: 'Prefetch + Superfetch off', d: 'Recommended for NVMe drives to cut idle disk churn.', m: 'Will set EnablePrefetcher=0 and EnableSuperfetch=0.\nREBOOT to settle. HDD users should skip this (or keep SysMain).' },
    'mem-no-pagefile-clear': { os: 'both', t: 'No pagefile wipe at shutdown', d: 'Removes a slow shutdown step that buys nothing on home PCs.', m: 'Will set ClearPageFileAtShutdown=0.\nTakes effect on the next shutdown. Reversible.' },
    'mem-paging-exec': { os: 'both', t: 'Kernel locked in RAM', d: 'Stops the kernel paging to disk. Needs RAM headroom — skip on 8GB.', m: 'Will set DisablePagingExecutive=1.\nREQUIRES REBOOT. Do not apply on 8GB machines.' },
    'cpu-distribute-timers': { os: 'both', t: 'Distribute timers across cores', d: 'Spreads timer interrupts instead of piling them on core 0.', m: 'Will set DistributeTimers=1 in the kernel key.\nREQUIRES REBOOT. Pairs with timer serialization.' },
    'adv-bg-policy': { os: 'both', t: 'Block background apps (machine policy)', d: 'Policy-level force-deny covering all users — survives per-user toggles.', m: 'Will set LetAppsRunInBackground=2 under the AppPrivacy policy key.\nStronger than the per-user switch. Reversible.' },
    'adv-ndu-off': { os: 'both', t: 'Network Data Usage driver off', d: 'Frees memory used by usage tracking (Ndu.sys).', m: 'Will stop and disable the Ndu service.\nSettings → Network usage stats stop updating. Reversible.' },
    'power-no-aoac': { os: 'both', t: 'Connected Standby off', d: 'Stops background network wake (PlatformAoAcOverride=0).', m: 'Will set PlatformAoAcOverride=0.\nREQUIRES REBOOT. Pairs with Modern Standby off for real S3 sleep.' },
    'disk-trim-on': { os: 'both', t: 'Keep TRIM enabled', d: 'Maintains SSD health and speed (enforces DisableDeleteNotify=0).', m: 'Will enforce DisableDeleteNotify=0 via fsutil (your previous value is captured for undo).\nAlready the default on healthy machines — this repairs drift.' },
  };

  /* TIER MIRROR — must match main.js BASE_TWEAKS/EXTREME_TWEAKS/FREE flags
   * exactly (the audit script diffs both sides). Tier of an id:
   *   free flag → 0 · BASE set → 1 · EXTREME set → 3 · otherwise → 2 (Pro).
   * Higher tiers include everything below (cumulative unlocks). */
  const TIER_NAMES = ['Free', 'Base', 'Pro', 'Extreme'];
  const TIER_PRICES = [0, 5, 15, 30];
  const BASE_IDS = new Set([
    'power-ultimate', 'power-balanced', 'power-no-usb-suspend', 'power-no-disk-sleep',
    'power-lid-nothing', 'power-sleep-never', 'power-no-auto-hibernate',
    'power-active-cooling',
    'vis-no-peek', 'vis-no-anim', 'vis-no-blur', 'vis-transparency-off', 'vis-no-toggle-keys',
    'adv-no-delivery-opt', 'adv-no-bg-apps', 'adv-no-activity', 'adv-no-clipboard-hist',
    'adv-no-xbox-bar', 'debloat-visual-fx', 'debloat-disk-cleanup',
    'debloat-no-hibernate', 'cpu-no-hibernate',
    'sys-boot-legacy', 'sys-minidump', 'sys-no-bsod-reboot',
    'net-ecn-on', 'net-no-tunnel', 'net-adapter-restart', 'ram-standby-task',
    'game-bg-apps-off', 'net-timed-wait', 'net-max-user-port',
  ]);
  const EXTREME_IDS = new Set([
    'game-no-hpet', 'cpu-no-dynamictick', 'cpu-tsc-enhanced', 'cpu-no-spec-mit',
    'cpu-x2apic', 'cpu-timer-res',
    'priv-lsa', 'priv-credential-guard', 'debloat-edge',
    'priv-no-rdp', 'priv-no-smb1', 'net-reset-stack',
  ]);
  /* IMPACT — expected effect per tweak, 1 (minor) to 3 (biggest wins).
   * Unlisted tweaks default to 2. Rendered as purple dots on every card
   * (BIOS/Network rows use the same scale). */
  const IMPACT = {
    'game-mode-master': 3, 'game-power-ultimate': 3, 'power-ultimate': 3,
    'game-hags-on': 3, 'game-no-nagle': 3, 'game-net-throttle-off': 3,
    'net-qos-limit': 3, 'net-fast-dns-pair': 3, 'net-no-delack': 3,
    'net-delack-zero': 3, 'cpu-timer-res': 3, 'cpu-no-parking': 3,
    'cpu-min-state-100': 3, 'adv-no-sysmain': 3,
    'cpu-boost-mode': 3, 'cpu-no-spec-mit': 3, 'power-no-pcie': 3,
    'cpu-no-pcie-link': 3, 'debloat-visual-fx': 3, 'ram-standby-task': 3,
    'task-telemetry-off': 3, 'priv-no-telemetry-svc': 3,
    'net-dns-tune': 1, 'net-no-neg-cache': 1, 'net-tcp-sack': 1,
    'net-flush-dns': 1, 'vis-taskbar-seconds': 1, 'vis-classic-clock': 1,
    'vis-numlock': 1, 'vis-no-taskview': 1, 'vis-no-chat': 1,
    'game-no-fs-optim': 3, 'gpu-msi-mode': 3,
    'game-bg-apps-off': 3, 'adv-bg-policy': 3, 'mem-no-compression': 3,
    'disk-no-8dot3': 1, 'disk-no-lastaccess': 1, 'mem-no-pagefile-clear': 1,
    'adv-ndu-off': 1,
    'cpu-bios-utc': 1, 'priv-no-feedback': 1, 'priv-no-autoplay': 1,
    'adv-no-tips': 1, 'sys-verbose-boot': 1, 'sys-bsod-details': 1,
    'vis-classic-alttab': 1, 'vis-no-shake': 1, 'debloat-chrome-bg': 1,
    'svc-maps-off': 1, 'svc-pca-off': 1, 'svc-geo-off': 1, 'svc-fax-off': 1,
    'svc-printer-off': 1, 'svc-bluetooth-off': 1, 'svc-remote-reg': 1,
    'svc-trkwks-off': 1, 'svc-gameinput-off': 1, 'svc-parental-off': 1,
    'svc-netbios-off': 1, 'svc-telephony-off': 1, 'svc-themes-off': 1,
    'svc-bits-off': 2, 'svc-xbox-off': 2, 'svc-hyperv-off': 2,
    'task-maintenance-off': 2,
    'svc-insider-off': 1, 'svc-touchkbd-off': 1, 'sys-minidump': 1,
    'vis-menu-delay': 1, 'vis-extensions': 1, 'vis-hidden-files': 1,
    'vis-no-sticky': 1, 'vis-no-toggle-keys': 1, 'vis-no-taskbar-search': 1,
    'vis-no-thumbs-network': 1, 'debloat-cortana-app': 1, 'adv-no-news': 1,
  };
  function impactOf(id) {
    const meta = TWEAKS[id];
    const v = (meta && meta.impact) || IMPACT[id] || 2;
    return Math.min(3, Math.max(1, Number(v) || 2));
  }
  /* REBOOT — tweaks that need a restart to take effect. Rendered as a
   * ⟲ badge on every card (all tabs). */
  const REBOOT_IDS = new Set([
    'game-hags-on', 'gpu-msi-mode', 'gpu-amd-ulps',
    'cpu-no-dynamictick', 'cpu-tsc-enhanced', 'cpu-x2apic', 'cpu-no-spec-mit',
    'cpu-distribute-timers', 'cpu-timer-serialization',
    'power-no-modern-standby', 'power-no-aoac',
    'mem-large-cache', 'mem-no-prefetch', 'mem-paging-exec',
    'net-nic-powersave-off', 'net-nic-eco-off', 'net-reset-stack',
    'priv-lsa', 'priv-credential-guard', 'priv-no-smb1',
  ]);
  function tierOf(id) {
    const meta = TWEAKS[id];
    if (meta && meta.free) return 0;
    if (BASE_IDS.has(id)) return 1;
    if (EXTREME_IDS.has(id)) return 3;
    return 2;
  }
  function tierStats() {
    const ids = Object.keys(TWEAKS);
    const c = [0, 0, 0, 0];
    ids.forEach((id) => c[tierOf(id)]++);
    return {
      total: ids.length, free: c[0], base: c[1], pro: c[2], extreme: c[3],
      cumBase: c[0] + c[1], cumPro: c[0] + c[1] + c[2],
    };
  }
  /* Render a group of tweak cards into `container`.
   * Free users SEE every tweak (transparency builds trust) but Pro-only cards
   * get a 🔒 button that routes to Settings — no blanket overlays, so the
   * FREE-tagged tweaks stay usable. Apply ALWAYS confirms first.
   * Groups re-render automatically when the license flips (see refreshLicense),
   * so unlocking instantly swaps every 🔒 for a live button. */
  const tweakRenders = []; // { container, ids } — replayed on license change
  function renderTweaks(container, ids, skipRegister) {
    if (!container) return;
    if (!skipRegister) tweakRenders.push({ container, ids });
    container.innerHTML = '';
    for (const id of ids) {
      const meta = TWEAKS[id];
      if (!meta) continue;
      const need = tierOf(id);
      const locked = licenseState.tier < need;
      const card = document.createElement('div');
      card.className = 'tweak-card';
      card.dataset.tweak = id;
      const info = document.createElement('div');
      info.className = 'tweak-info';
      const b = document.createElement('b');
      b.textContent = meta.t;
      // Tier badge ALWAYS visible: FREE (green) / BASE (blue) / PRO (gold) /
      // EXTREME (red). This is the Free-vs-paid separation at a glance.
      const tag = document.createElement('span');
      if (need === 0) { tag.className = 'free-tag'; tag.textContent = 'FREE'; }
      else if (need === 1) { tag.className = 'tier-tag tier-base'; tag.textContent = 'BASE'; }
      else if (need === 3) { tag.className = 'tier-tag tier-extreme'; tag.textContent = 'EXTREME'; }
      else { tag.className = 'pro-tag'; tag.textContent = 'PRO'; }
      b.append(' ', tag);
      // OS badge: which Windows this tweak is for. 'both' (default) shows a
      // compact 10·11; win10/win11-only tweaks get an explicit label.
      const osv = meta.os || 'both';
      const osBadge = document.createElement('span');
      osBadge.className = 'os-tag';
      osBadge.textContent = osv === 'both' ? '10 · 11' : (osv === 'win11' ? 'Win 11' : 'Win 10');
      osBadge.title = osv === 'both' ? 'Works on Windows 10 and 11' : ('Windows ' + (osv === 'win11' ? '11' : '10') + ' only');
      b.append(' ', osBadge);
      // Impact dots: 1–3 purple, same scale as the BIOS/Network rows.
      const imp = impactOf(id);
      const dots = document.createElement('span');
      dots.className = 'impact';
      dots.title = `Impact ${imp}/3`;
      for (let i = 0; i < imp; i++) dots.appendChild(document.createElement('i'));
      b.append(' ', dots);
      if (REBOOT_IDS.has(id)) {
        const rb = document.createElement('span');
        rb.className = 'reboot-tag';
        rb.textContent = '⟲ reboot';
        rb.title = 'Requires a restart to take effect';
        b.append(' ', rb);
      }
      const p = document.createElement('p');
      p.textContent = meta.d;
      info.append(b, p);
      const actions = document.createElement('div');
      actions.className = 'tweak-actions';
      const applyBtn = document.createElement('button');
      if (locked) {
        applyBtn.className = 'btn secondary';
        applyBtn.textContent = `🔒 ${TIER_NAMES[need]}`;
        applyBtn.title = `Requires TidalTweaks ${TIER_NAMES[need]} ($${TIER_PRICES[need]})`;
        applyBtn.onclick = () => {
          toast(`🔒 '${meta.t}' needs ${TIER_NAMES[need]} ($${TIER_PRICES[need]}) — opening Settings…`, 'gold', 3500);
          switchTab('settings');
        };
      } else {
        applyBtn.className = 'btn primary';
        applyBtn.textContent = 'Apply';
        applyBtn.onclick = () => applyTweak(id, card);
      }
      actions.appendChild(applyBtn);
      if (!locked) {
        const revertBtn = document.createElement('button');
        revertBtn.className = 'btn secondary';
        revertBtn.textContent = 'Revert';
        revertBtn.onclick = () => revertTweak(id, card);
        actions.appendChild(revertBtn);
      }
      card.append(info, actions);
      container.appendChild(card);
    }
  }

  async function applyTweak(id, card) {
    const meta = TWEAKS[id] || { t: id, m: 'Apply this tweak?' };
    const ok = await confirmAction({ title: meta.t, body: meta.m || '', okText: 'Apply' });
    if (!ok) return;
    if (card) card.classList.remove('applied');
    const res = await api.tweak.apply(id).catch((e) => ({ ok: false, message: String(e) }));
    if (res && res.ok) {
      if (card) card.classList.add('applied'); // green check ring
      toast(res.message || 'Applied.', 'success');
      if (window.TT && window.TT.refreshRestore) window.TT.refreshRestore();
    } else {
      toast((res && res.message) || 'Failed.', 'error', 5000); // never crash — toast it
    }
  }

  async function revertTweak(id, card) {
    const res = await api.tweak.revert(id).catch((e) => ({ ok: false, message: String(e) }));
    if (res && res.ok) {
      if (card) card.classList.remove('applied');
      toast(res.message || 'Reverted.', 'success');
    } else {
      toast((res && res.message) || 'Nothing to revert.', '', 4000);
    }
  }

  /* ------------------------------ license ------------------------------- */
  const licenseState = { pro: false, tier: 0, activatedAt: null, cashapp: '', username: null, role: null };

  async function refreshLicense(celebrate) {
    try {
      const s = await api.license.status();
      const wasTier = licenseState.tier || 0;
      Object.assign(licenseState, s);
      if (typeof licenseState.tier !== 'number') licenseState.tier = 0;
      const badge = $('#edition-badge');
      const names = ['FREE', 'BASE', 'PRO 👑', 'EXTREME 👑'];
      const classes = ['free', 'base', 'pro', 'pro'];
      badge.textContent = names[licenseState.tier] || 'FREE';
      badge.className = 'edition ' + (classes[licenseState.tier] || 'free');
      document.body.classList.toggle('is-pro', licenseState.tier >= 2);
      // Lite mode: flat panels + no GPU compositing (see styles.css body.lite).
      document.body.classList.toggle('lite', !!s.lite);
      // Personal greeting (the Risxn "Welcome, User!" touch — we have accounts).
      const dashTitle = $('#dash-title');
      if (dashTitle) dashTitle.textContent = s.username ? `Welcome, ${s.displayName || s.username}!` : 'Dashboard';
      // Owner section is revealed by role (main process re-checks on every
      // owner IPC call, so hiding here is UX, not security).
      const ownerBtn = $('#nav-owner');
      if (ownerBtn) ownerBtn.hidden = s.role !== 'owner';
      // License UPGRADED? Re-render every tweak group so 🔒 buttons swap
      // live without a restart + fire the unlock celebration.
      if (licenseState.tier !== wasTier) {
        tweakRenders.forEach((g) => renderTweaks(g.container, g.ids, true));
        // Library page builds wholesale (search text) — rebuild it too.
        if (window.TT && window.TT._rebuildLibrary) {
          try { window.TT._rebuildLibrary(); } catch (e) { /* next show rebuilds */ }
        }
      }
      if (licenseState.tier > wasTier && celebrate) {
        confettiBurst(); // the unlock celebration
        toast(`${TIER_NAMES[licenseState.tier]} unlocked — enjoy. 🎉`, 'gold', 5000);
      }
      return s;
    } catch (e) {
      toast('Could not read license status: ' + String(e), 'error');
      return licenseState;
    }
  }

  /* ------------------------------ appearance ------------------------------
   * Theme + accent from the main-process store (Settings → Appearance).
   * Applied BEFORE the boot splash is removed, so there's zero flash. */
  async function applyAppearance() {
    try {
      const s = await api.settings.get();
      if (s && s.ok) {
        document.body.dataset.theme = s.theme || 'tsunami';
        document.body.dataset.accent = s.accent || 'blue';
      }
    } catch (e) { /* defaults in CSS stand */ }
  }

  /* ------------------------------ auth gate -------------------------------
   * No session → auth overlay instead of the app. Login/signup reload the
   * window (fast, local) for a guaranteed-clean state. */
  function authError(msg) {
    const el = $('#auth-error');
    el.textContent = msg || '';
    el.hidden = !msg;
  }
  function wireAuth() {
    const show = (which) => {
      $('#auth-login').hidden = which !== 'login';
      $('#auth-signup').hidden = which !== 'signup';
      $('#auth-tab-login').className = 'btn ' + (which === 'login' ? 'primary' : 'secondary');
      $('#auth-tab-signup').className = 'btn ' + (which === 'signup' ? 'primary' : 'secondary');
      authError('');
    };
    $('#auth-tab-login').onclick = () => show('login');
    $('#auth-tab-signup').onclick = () => show('signup');
    const doLogin = async () => {
      const r = await api.auth.login($('#login-email').value, $('#login-pass').value, $('#login-remember').checked)
        .catch((e) => ({ ok: false, message: String(e) }));
      if (r && r.ok) location.reload();
      else authError((r && r.message) || 'Sign in failed.');
    };
    const doSignup = async () => {
      const p1 = $('#signup-pass').value || '';
      if (p1 !== ($('#signup-pass2').value || '')) { authError('Passwords do not match.'); return; }
      const r = await api.auth.signup({
        displayName: $('#signup-name').value,
        email: $('#signup-email').value,
        password: p1,
        referralCode: $('#signup-ref').value,
        remember: $('#signup-remember').checked,
      }).catch((e) => ({ ok: false, message: String(e) }));
      if (r && r.ok) {
        try { sessionStorage.setItem('tt-hello-owner', r.first ? '1' : ''); } catch (e) { /* ignore */ }
        location.reload();
      } else authError((r && r.message) || 'Sign up failed.');
    };
    $('#login-go').onclick = doLogin;
    $('#signup-go').onclick = doSignup;
    ['login-email', 'login-pass'].forEach((id) => $('#' + id).addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); }));
    ['signup-name', 'signup-email', 'signup-pass', 'signup-pass2', 'signup-ref'].forEach((id) => $('#' + id).addEventListener('keydown', (e) => { if (e.key === 'Enter') doSignup(); }));
    show('login');
  }

  /* ------------------------------ router --------------------------------- */
  const order = ['dashboard', 'cleaner', 'startup', 'ram', 'network', 'presets', 'library', 'tips', 'benchmark', 'profiles', 'gaming',
    'registry', 'debloat', 'privacy', 'power', 'crosshair', 'potato', 'bios', 'advanced', 'services', 'restore', 'settings', 'owner'];
  let current = 'dashboard';

  function switchTab(id) {
    if (!order.includes(id)) return;
    // Belt-and-braces: the main process enforces owner on IPC, this just
    // stops curious clicks from landing on a page they can't use.
    if (id === 'owner' && licenseState.role !== 'owner') return;
    current = id;
    $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
    $$('.page').forEach((p) => p.classList.toggle('active', p.id === 'page-' + id));
    moveGlider();
    // Let the newly shown tab refresh itself (tabs register onShow hooks).
    if (window.TT && window.TT._show && window.TT._show[id]) {
      try { window.TT._show[id](); } catch (e) { console.error(e); }
    }
  }

  // Slide the highlight pill to the active nav item. Uses getBoundingClientRect
  // (not offsetTop) so the math survives scrolling, zoom and sidebar collapse.
  function moveGlider() {
    const nav = $('#nav');
    const btn = document.querySelector('.nav-item[data-tab="' + current + '"]');
    const glider = $('#nav-glider');
    if (!nav || !btn || !glider) return;
    const n = nav.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    glider.style.height = b.height + 'px';
    glider.style.transform = `translateY(${b.top - n.top + nav.scrollTop}px)`;
  }

  /* Collapsible sidebar (hamburger, top-left). Slides via margin-left so the
   * content area fluidly takes the space. Preference persists in localStorage
   * (renderer-only UI pref — no IPC round-trip needed). */
  function wireSidebar() {
    const apply = (hidden) => {
      document.body.classList.toggle('nav-hidden', hidden);
      try { localStorage.setItem('tt-nav-hidden', hidden ? '1' : '0'); } catch (e) { /* private mode */ }
      setTimeout(moveGlider, 320); // re-seat the glider after the slide
    };
    let hidden = false;
    try { hidden = localStorage.getItem('tt-nav-hidden') === '1'; } catch (e) { /* ignore */ }
    if (hidden) document.body.classList.add('nav-hidden');
    $('#btn-nav').onclick = () => apply(!document.body.classList.contains('nav-hidden'));
  }

  /* ------------------------------ conn dot ------------------------------
   * Titlebar presence + the gate every future online feature must check
   * (TT.conn.isOnline()). Paints from conn:get, then follows live pushes.
   * Grey while unknown so the UI never claims Online before the probe. */
  const connState = { mode: 'auto', online: false, known: false };
  function paintConnDot() {
    const dot = $('#conn-dot');
    if (!dot) return;
    dot.classList.toggle('online', connState.known && connState.online);
    dot.querySelector('em').textContent = !connState.known ? '…' : (connState.online ? 'Online' : 'Offline');
    dot.title = !connState.known
      ? 'Checking connection…'
      : (connState.online ? `Online (mode: ${connState.mode})` : `Offline (mode: ${connState.mode}) — everything local still works`);
  }
  async function refreshConn() {
    try {
      const s = await api.conn.get();
      if (s && s.ok !== false) {
        connState.mode = s.mode || 'auto';
        connState.online = !!s.online;
        connState.known = true;
        paintConnDot();
      }
    } catch (e) { /* dot stays grey — never crash the shell */ }
    return connState;
  }
  function wireConn() {
    paintConnDot();
    try {
      if (api.conn.onState) {
        api.conn.onState((s) => {
          if (!s || typeof s !== 'object') return;
          if (s.mode) connState.mode = s.mode;
          if (typeof s.online === 'boolean') connState.online = s.online;
          connState.known = true;
          paintConnDot();
        });
      }
    } catch (e) { /* subscription is best-effort */ }
    refreshConn();
  }
  function wireTitlebar() {
    $('#btn-min').onclick = () => api.win.minimize();
    $('#btn-max').onclick = () => api.win.toggleMax();
    $('#btn-close').onclick = () => api.win.close();
    $('#titlebar').addEventListener('dblclick', (e) => {
      if (e.target.closest('.tb-controls')) return;
      api.win.toggleMax();
    });
    const sync = (m) => {
      $('#glyph-max').hidden = !!m.maximized;
      $('#glyph-restore').hidden = !m.maximized;
    };
    api.win.onState(sync);
    api.win.isMaximized().then((m) => sync({ maximized: !!m })).catch(() => {});
  }

  /* -------------------------------- init --------------------------------- */
  document.addEventListener('DOMContentLoaded', async () => {
    $$('.nav-item').forEach((b) => {
      b.onclick = () => switchTab(b.dataset.tab);
    });
    wireTitlebar();
    wireSidebar();
    wireConn();
    window.addEventListener('resize', moveGlider);
    $('#nav').addEventListener('scroll', moveGlider, { passive: true });
    wireAuth();
    // Auth gate: without a session the app shell stays hidden behind the
    // login/signup overlay (nothing polls, nothing spawns).
    let sess = null;
    try { sess = await api.auth.session(); } catch (e) { /* main unreachable */ }
    const boot = $('#boot');
    if (!sess || !sess.user) {
      $('#auth-root').hidden = false;
      if (boot) boot.remove();
      return;
    }
    await refreshLicense(false);
    await applyAppearance();
    try {
      if (sessionStorage.getItem('tt-hello-owner') === '1') {
        sessionStorage.removeItem('tt-hello-owner');
        setTimeout(() => toast('Welcome! Your account is the owner. 👑', 'gold', 5000), 600);
      }
    } catch (e) { /* ignore */ }
    moveGlider();
    switchTab('dashboard');
    // Remove the boot splash (if JS/CSS failed, it stays as an error hint
    // instead of leaving the user on a blank white window).
    if (boot) boot.remove();
  });

  /* ------- preset progress overlay (the loading screen) -------
   * Long applies (restore point + dozens of tweaks) finally narrate
   * themselves: title → live step log with ✓/✗ → summary, instead of a
   * silent freeze followed by one toast. Main-process step events feed the
   * open session; renderer-driven loops (privacy harden-all) drive it
   * manually through the same show/step/done calls. */
  const progressSession = { open: false, id: null, total: 0, doneCount: 0 };
  function progressShow(title, total, id) {
    if (progressSession.open) return false; // one overlay at a time
    progressSession.open = true;
    progressSession.id = id || null;
    progressSession.total = total || 0;
    progressSession.doneCount = 0;
    $('#progress-title').textContent = title || 'Working…';
    $('#progress-sub').textContent = total
      ? 'Do not close the app — a restore point was already created.'
      : 'Working…';
    $('#progress-fill').style.width = '0%';
    $('#progress-log').innerHTML = '';
    $('#progress-close').hidden = true;
    $('#progress-root').hidden = false;
    return true;
  }
  function progressLogLine(label, ok) {
    const log = $('#progress-log');
    const div = document.createElement('div');
    div.className = 'plog-row' + (ok === true ? ' ok' : ok === false ? ' bad' : '');
    div.textContent = (ok === true ? '✓ ' : ok === false ? '✗ ' : '• ') + label;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight; // follow the tail like a terminal
  }
  function progressStep(index, total, label, ok) {
    if (!progressSession.open) return;
    progressSession.doneCount++;
    if (total) $('#progress-fill').style.width = Math.round((index / total) * 100) + '%';
    $('#progress-sub').textContent = total ? `Step ${index} of ${total}…` : 'Working…';
    progressLogLine(label, ok);
  }
  function progressDone(summary, success) {
    if (!progressSession.open) return;
    $('#progress-fill').style.width = '100%';
    $('#progress-sub').textContent = summary || 'Done.';
    const close = $('#progress-close');
    close.hidden = false;
    close.className = 'btn ' + (success === false ? 'danger' : 'primary');
    close.onclick = progressHide;
  }
  function progressHide() {
    progressSession.open = false;
    progressSession.id = null;
    $('#progress-root').hidden = true;
  }
  // Single persistent subscription: main-process step events land here and
  // are routed to the open session (stale/other-preset events ignored).
  try {
    api.preset.onProgress((msg) => {
      if (!progressSession.open || !msg || msg.preset !== progressSession.id) return;
      if (msg.phase === 'restore') {
        $('#progress-sub').textContent = 'Restore point secured — applying tweaks…';
        progressLogLine('Restore point created', true);
      } else if (msg.phase === 'step') {
        const meta = (typeof TWEAKS !== 'undefined' && TWEAKS[msg.id]) || null;
        progressStep(msg.index, msg.total, (meta && meta.t) || msg.id, msg.ok);
      }
    });
  } catch (e) { /* preload bridge unreachable — overlay still works manually */ }
  const progress = {
    show: progressShow, step: progressStep, done: progressDone, hide: progressHide,
    get open() { return progressSession.open; },
  };

  // Public surface for tabs/*.js (TWEAKS lets presets.js print stack contents).
  window.TT = {
    toast, confirm: confirmAction, confetti: confettiBurst,
    fmtBytes, fmtUptime, countUp, TWEAKS, TIER_NAMES, TIER_PRICES,
    tierOf, tierStats, progress,
    renderTweaks, applyTweak, revertTweak,
    refreshLicense, switchTab,
    get pro() { return licenseState.tier >= 2; }, // legacy: "pro content" gate
    get tier() { return licenseState.tier || 0; },
    get tierName() { return TIER_NAMES[licenseState.tier] || 'Free'; },
    get api() { return api; },
    conn: {
      // Gate for future online features: `if (!TT.conn.isOnline()) …`.
      isOnline() { return connState.known && !!connState.online; },
      get mode() { return connState.mode; },
      refresh: refreshConn,
    },
    _show: {}, // tabs register onShow callbacks: TT._show.ram = fn
  };
})();
