# 🌊 TidalTweaks

Windows PC optimization and tweaking tool — **Free + Pro** desktop app built with Electron. Clean glass UI, 150+ reversible tweaks, one-click preset stacks, and safety first (restore points + full undo on everything).

![Windows](https://img.shields.io/badge/Windows-10%20%7C%2011-blue)
![License](https://img.shields.io/badge/license-All%20rights%20reserved-lightgrey)

## ⬇️ Download

Go to [**Releases**](../../releases) and grab `TidalTweaks Setup X.Y.Z.exe`. No Node, Python, or anything else required — download, install, run.

> Windows SmartScreen will warn about an unknown publisher (no paid code-signing cert yet) → **More info → Run anyway**.

## 🛡 Antivirus notice (please read — it's a false positive)

**Yes, Windows Defender or VirusTotal may flag this app. No, it's not a virus.** I'm one person trying to help people speed up their PCs — there is nothing malicious in here, and you don't have to take my word for it:

- **The entire source code is right here on GitHub.** Every PowerShell command, every registry value — read it all before you run anything.
- **Why it flags:** this app legitimately does things that *look* like malware to heuristics — launching PowerShell, editing the registry, disabling services, editing the hosts file. Every PC optimizer and sysadmin tool on earth trips the same heuristics.
- **What it never does:** no passwords or personal data leave your PC, no crypto miners, no backdoors, no autostart entries, no nagging. The only internet it uses is the license check (plus font loading). It even ships with an uninstaller.
- **What to do:** on SmartScreen click *More info → Run anyway*. If Defender quarantines it, restore it and add an exclusion — then compare what it does against the source here.

If anything ever behaves unexpectedly, open an Issue and I'll answer it publicly.

## ✨ Features

**Free forever:** live Dashboard (CPU/RAM/GPU/disks), Junk Cleaner with file preview, Startup Manager, RAM Optimizer, Network Tools (ping graph, DNS), 40+ safe tweaks (Game Bar off, raw mouse, Copilot removal, classic context menu…), 8 one-click game presets (Fortnite, Valorant, Minecraft, Roblox, CoD, Apex, FiveM), restore points + undo, themes, local accounts.

**Pro 👑:** 100+ paid tweaks across Base, Pro & Extreme — Ultimate Performance plan, HAGS, Nagle trio, CPU boost/core-parking/timer resolution, NVIDIA/AMD GPU tweaks, service kills, debloater, privacy lockdown (hosts block, telemetry, Recall), NTFS tuning, bcdedit timer stack — plus Pro preset stacks (Pro Gamer, Ghost, Eco).

**Safety:** every Pro tweak creates a System Restore point, snapshots the old value, and lands in the undo log. *Undo last* or *Revert all* from the Restore tab.

## 👑 Tiers & pricing (one-time, higher tiers include everything below)

| Tier | Price | Unlocks |
|------|-------|---------|
| Free | $0 | Dashboard, cleaner, startup, RAM + network tools, 40+ safe tweaks, 8 game presets |
| Base | $5 | + power plans, visual tuning, safe services, standby janitor (~30 more) |
| Pro | $15 | + full gaming/CPU/network pipeline, debloat, privacy (~70 more) |
| Extreme | $30 | + boot-config, timer resolution, security trade-offs, device surgery |

1. Send payment via Cash App to **$AlwaysBetOnBright**
2. Add **chrome.bright** on Discord — send your receipt **plus the tier name** (BASE / PRO / EXTREME)
3. You'll receive a one-time code for that tier — paste it in Settings → Activate

Each code is single-use and deleted after activation. Upgrades never demote: a Pro code on an Extreme account changes nothing.

## 🛠 Build from source

Requires [Node.js](https://nodejs.org/) 20+ (Electron 33).

```powershell
cd electron
npm.cmd install
npm.cmd start        # run the app
npm.cmd run build    # → electron/dist/TidalTweaks Setup X.Y.Z.exe
```

> `npm` may be blocked by PowerShell's execution policy — use `npm.cmd`, or run
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

## 🔑 License codes (for the seller — offline, no server, no Cloudflare)

Codes are **cryptographically signed** with your private Ed25519 key. The app
verifies them fully offline — there is no backend to deploy, pay for, or maintain.

- Your private key: `Documents\TidalTweaks-Codes\PRIVATE-KEY-do-not-share.pem`
  (created once, **back it up on a USB stick** — lose it and you can never mint
  more codes for this app version; leak it and anyone can mint unlimited codes)
- Your 300 starter codes live next to it (`SIGNED-*-codes.txt`, 100 per tier)
- Mint more anytime, no internet needed:
  `node electron/scripts/mint-codes.js "<key-path>" <base|pro|extreme> <count> [out.txt]`
- Each code activates **once, on that buyer's PC** (burned locally on claim).
  Honest limit: two offline PCs can't compare notes, so a manually-shared code
  could activate a second machine. At $5–30 instant delivery, a non-issue.

## 📁 Project layout

```
electron/
  main.js            # window, IPC, tweak registry, license flow
  preload.js         # sandboxed window.api bridge (renderer has no Node)
  renderer/          # index.html, styles.css, app.js, tabs/*.js
  core/              # tweak engines (cpu/gpu/network/privacy/…), backups, users
  assets/            # icon.ico / icon.png
  scripts/           # afterPack (icon stamp for the installer)
```

## ⚠️ Disclaimer

Tweaks modify Windows. TidalTweaks creates restore points and backups automatically, but you apply tweaks at your own risk — read each confirmation dialog (especially HPET, Secure Boot, and boot-config tweaks) before applying.
