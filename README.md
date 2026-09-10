# 🌊 TidalTweaks

Windows PC optimization and tweaking tool — **Free + Pro** desktop app built with Electron. Clean glass UI, 120+ reversible tweaks, one-click preset stacks, and safety first (restore points + full undo on everything).

![Windows](https://img.shields.io/badge/Windows-10%20%7C%2011-blue)
![License](https://img.shields.io/badge/license-All%20rights%20reserved-lightgrey)

## ⬇️ Download

Go to [**Releases**](../../releases) and grab `TidalTweaks Setup X.Y.Z.exe`. No Node, Python, or anything else required — download, install, run.

> Windows SmartScreen will warn about an unknown publisher (no paid code-signing cert yet) → **More info → Run anyway**.

## ✨ Features

**Free forever:** live Dashboard (CPU/RAM/GPU/disks), Junk Cleaner with file preview, Startup Manager, RAM Optimizer, Network Tools (ping graph, DNS), 35+ safe tweaks (Game Bar off, raw mouse, Copilot removal, classic context menu…), 8 one-click game presets (Fortnite, Valorant, Minecraft, Roblox, CoD, Apex, FiveM), restore points + undo, themes, local accounts.

**Pro 👑:** 90+ deep tweaks — Ultimate Performance plan, HAGS, Nagle trio, CPU boost/core-parking/timer resolution, NVIDIA/AMD GPU tweaks, service kills, debloater, privacy lockdown (hosts block, telemetry, Recall), NTFS tuning, bcdedit timer stack — plus Pro preset stacks (Pro Gamer, Ghost, Eco).

**Safety:** every Pro tweak creates a System Restore point, snapshots the old value, and lands in the undo log. *Undo last* or *Revert all* from the Restore tab.

## 👑 Get Pro

1. Send payment via Cash App to **$AlwaysBetOnBright**
2. Add **chrome.bright** on Discord and send your payment receipt
3. You'll receive a one-time Pro activation code — paste it in Settings → Activate

Each code is single-use and deleted after activation.

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

## 🔑 Activation server (for the seller)

The app validates codes against a Cloudflare Pages function backed by KV:

1. Create a Cloudflare Pages project with the function in [`cloudflare-validate-code.example.js`](cloudflare-validate-code.example.js) at `functions/api/validate-code.js`
2. Bind a KV namespace called `CODES`
3. Add one-time codes: `wrangler kv:key put --binding=CODES "CODE-HERE" "1"`
4. Paste your `https://<site>.pages.dev/api/validate-code` URL in the app's Settings → Save URL (or bake it into `electron/main.js` → `DEFAULT_API_URL`)

Used codes are deleted from KV on first validation — sharing a code is pointless.

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
