# Changelog — TidalTweaks

All notable changes, newest first. Version numbers match GitHub Releases
(`TidalTweaks Setup X.Y.Z.exe`). Same-day releases happen when a fix can't
wait — a higher number is always the one to download.

## v2.4.4

- **Benchmark tab (free)**: CPU single/multi (prime sieve + worker-thread
  fan-out), RAM bandwidth + latency, disk MB/s + IOPS (self-cleaning 100MB
  file), 30s WebGL GPU scene. Quick/Standard/Deep durations, before/after
  deltas, history graph, CSV/JSON/PNG export — every run stamped with the
  active tweak list.
- **Game Profiles tab**: 12 prebuilt per-game bundles (all Free-safe) with
  priority boost, launch options and extras; 15s auto-apply watchdog with
  revert-on-exit; customs, JSON import/export, self-contained TT1P- share
  codes (no server needed).
- **Connection mode**: local online detection (plain DNS, no backend),
  Auto/Online/Offline toggle in Settings, titlebar Online dot, honest
  no-connection warning. Everything local works fully offline.
- **Potato Graphics tab (Pro)**: Fortnite + Marvel Rivals low-graphics
  profiles with timestamped backups, read-only handling and undo.
- **BIOS guides tab (Pro)**: ReBAR, XMP/EXPO and C-State walkthroughs with
  per-vendor paths (WMI auto-detect) and copy-ready values.
- **Advanced tab (Pro)**: memory compression, large cache, prefetch,
  paging executive, NDU, timers, AoAc standby, TRIM and more — with a new
  ⟲ reboot badge everywhere it applies.
- **Services tab (Pro)**: 7 collapsible sections, ~110 rows (services +
  scheduled tasks) with Safe/Caution/Advanced badges, impact dots, search,
  red-checkbox danger modals, per-row undo.
- **Network tab rework**: DNS & Adapter + Latency & Throughput sections, 9
  new TCP/DNS tweaks (pairs, delayed-ACK steps, heuristics, SACK…), impact
  dots on every tweak card app-wide.
- **Accounts**: email login, display names, remember-me, local referral
  codes with signup counts and affiliate balances in Settings.

## v2.4.3

- **Crosshair tab redesign (screenshot spec)**: MY CROSSHAIRS on top with
  purple Save current, LAYERS with visibility squares and stacking explainer,
  SHAPE picker (Cross/Dot+/Dot/T/X/Ring, all Free) with purple selection dot,
  Pro-locked SIZE (Length/Thickness/Gap), OUTLINE (toggle + thickness + color),
  CENTER DOT toggle, and POSITION (Recenter + H/V sliders + 1px nudge arrows).
  Purple #8B5CF6 accents, 🔒 Pro badges, greyed locked sections. Old designs
  migrate automatically. Recenter/nudge are Pro-gated, including the hotkey.

## v2.4.2

- **Crosshair overlay tab**: separate transparent always-on-top window for
  borderless games — click-through, Alt+drag to move, Ctrl+Alt+Shift+R to
  recenter. Free: Classic/Dot/Cross presets in any color. Pro: layered
  crosshairs, T-Shape/Complex/Ring/Double/Plus-Dot library, size/position/
  opacity sliders, save-custom designs.

## v2.4.1

- **Scrollable preset + modal lists**: 60-tweak stacks no longer push their
  own Apply button off-screen.
- **Preset effectiveness pass**: every preset audited — no dead ids, no
  duplicates, no self-cancelling pairs, correct tiers.
- **Tips & Tricks tab**: what tweaks can't fix — RAM/SSD/XMP, Fortnite
  settings, thermals, lag-vs-stutter diagnosis, match-day hygiene.

## v2.4.0

- **Preset loading screen**: long applies now narrate themselves — live
  step-by-step log with ✓/✗, progress bar, and a summary. Same screen drives
  Privacy harden-all. Nothing is clickable mid-run on purpose.
- **Factory reset**: one button removes every tweak on record, parks the
  power plan on Balanced, and honestly lists what needs manual action
  (removed apps can't reinstall themselves).
- **4 new low-end tweaks**: shadowless UI, outline-dragging, micro-animation
  bundle, active cooling policy.
- **7 machine-class presets + Tidal Overdrive**: Low/Mid/High × PC/Laptop
  plus a ~55-tweak everything-stack with explicit warnings.
- **Game presets trimmed to Fortnite** (plus your local LowEnd pack):
  Roblox, Apex and FiveM packs removed.
- **3 gradient themes**: Inferno, Candy, Toxic.

## v2.3.0

- **Local custom presets**: private one-click stacks via
  `<userData>/custom-presets.json` — local-only, never in git, never synced.
- Docs for the custom-preset format in README.

## v2.2.0

- **Offline signed activation**: license server deleted, activation works
  with zero internet. Ed25519-signed per-tier codes, single-use per machine.
- **Expiring codes**: every code carries a signed expiry date — shared codes
  rot instead of living forever. Legacy codes keep working.

## v2.1.0

- **4 pricing tiers**: Free / Base $5 / Pro $15 / Extreme $30, cumulative
  unlocks, per-tier codes, pricing panel with live tweak counts.
- **Owner panel + accounts**: device-local sign up/login, passphrase-gated
  Owner panel, roles.
- **Themes + accents**: 8 themes, 8 accents, Lite mode for weak GPUs.
- **Antivirus notice**: honest false-positive explainer (README + in-app).

## v2.0.0

- First public release: Dashboard, Cleaner, Startup Manager, RAM Optimizer,
  Network Tools, Gaming/Tweaks/Debloat/Privacy/Power tabs, preset stacks,
  restore points + full undo, Free/Pro activation.
