'use strict';
/* ============================================================================
 * core/ram.js — Free RAM optimizer. Trims idle working sets via the
 * psapi.dll EmptyWorkingSet P/Invoke (same technique the Python version used
 * via ctypes — here via Add-Type). PIDs 0/4 (Idle/System) are never touched;
 * failures per-process are skipped, never fatal. Nothing is closed.
 * ========================================================================== */
const { runPS, runCmd } = require('./exec');
const fs = require('node:fs');
const path = require('node:path');

async function optimize() {
  // JS double-quoted strings; PowerShell single-quoted C# — inner " escaped.
  const script = [
    "$os = Get-CimInstance Win32_OperatingSystem",
    "$before = $os.FreePhysicalMemory; $totalKB = $os.TotalVisibleMemorySize",
    "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class M { [DllImport(\"psapi.dll\")] public static extern bool EmptyWorkingSet(IntPtr h); [DllImport(\"kernel32.dll\")] public static extern IntPtr OpenProcess(int a, bool b, int c); [DllImport(\"kernel32.dll\")] public static extern bool CloseHandle(IntPtr h); }'",
    '$trim = 0; $skip = 0',
    'foreach ($p in Get-Process) { if ($p.Id -le 4) { $skip++; continue } try { $h = [M]::OpenProcess(0x400 -bor 0x8 -bor 0x100, $false, $p.Id); if ($h -eq [IntPtr]::Zero) { $skip++; continue }; if ([M]::EmptyWorkingSet($h)) { $trim++ } else { $skip++ }; [void][M]::CloseHandle($h) } catch { $skip++ } }',
    '$after = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory',
    'Write-Output ("RESULT:$trim|$skip|$before|$after|$totalKB")',
  ].join('; ');
  try {
    const r = await runPS(script, 180000);
    const m = /RESULT:(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)/.exec(r.stdout || '');
    if (!m) return { ok: false, message: 'Optimizer produced no result.' };
    const [, trim, skip, beforeKB, afterKB, totalKB] = m.map(Number);
    const used = (totalKB - afterKB) * 1024;
    return {
      ok: true,
      trimmed: trim,
      skipped: skip,
      freed: Math.max(0, (afterKB - beforeKB) * 1024),
      after: { used, total: totalKB * 1024 },
      message: `Trimmed ${trim} processes.`,
    };
  } catch (e) { return { ok: false, message: String(e) }; }
}

const STANDBY_TASK = 'TidalTweaks Standby Cleaner';

/* Standby-memory janitor on a 15-minute schedule (the ISLC-lite approach):
 * drops a small script in userData + a Scheduled Task that trims idle
 * working sets while you play. Undo deletes the task AND the script. */
async function standbyTaskOn() {
  try {
    let dir = process.cwd();
    try { dir = require('electron').app.getPath('userData'); }
    catch { const b = process.env.APPDATA || process.cwd(); dir = path.join(b, 'TidalTweaks'); }
    fs.mkdirSync(dir, { recursive: true });
    const scriptPath = path.join(dir, 'standby-task.ps1');
    const script = [
      "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class M { [DllImport(\"psapi.dll\")] public static extern bool EmptyWorkingSet(IntPtr h); [DllImport(\"kernel32.dll\")] public static extern IntPtr OpenProcess(int a, bool b, int c); [DllImport(\"kernel32.dll\")] public static extern bool CloseHandle(IntPtr h); }'",
      '$self = $PID',
      'foreach ($p in Get-Process) { if ($p.Id -le 4 -or $p.Id -eq $self) { continue } try { $h = [M]::OpenProcess(0x400 -bor 0x8 -bor 0x100, $false, $p.Id); if ($h -eq [IntPtr]::Zero) { continue }; [void][M]::EmptyWorkingSet($h); [void][M]::CloseHandle($h) } catch { } }',
    ].join('; ');
    fs.writeFileSync(scriptPath, script);
    const del = await runCmd('schtasks', ['/delete', '/tn', STANDBY_TASK, '/f'], 30000);
    void del; // remove any previous copy first (idempotent re-apply)
    const c = await runCmd('schtasks', [
      '/create', '/tn', STANDBY_TASK,
      '/tr', `powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "${scriptPath}"`,
      '/sc', 'minute', '/mo', '15', '/f',
    ], 60000);
    if (c.code !== 0) return { ok: false, message: 'Could not create scheduled task (run as admin).' };
    return {
      ok: true, message: 'Standby janitor scheduled every 15 min.',
      revert: { kind: 'schtask', name: STANDBY_TASK, script: scriptPath },
    };
  } catch (e) { return { ok: false, message: String(e) }; }
}

module.exports = { optimize, standbyTaskOn };
