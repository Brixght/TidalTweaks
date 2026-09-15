# Changelog — TidalTweaks

All notable changes, newest first. Version numbers match GitHub Releases
(`TidalTweaks Setup X.Y.Z.exe`). Same-day releases happen when a fix can't
wait — a higher number is always the one to download.

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
