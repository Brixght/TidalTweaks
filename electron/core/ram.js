'use strict';
/* ============================================================================
 * core/ram.js — Free RAM optimizer. Trims idle working sets via the
 * psapi.dll EmptyWorkingSet P/Invoke (same technique the Python version used
 * via ctypes — here via Add-Type). PIDs 0/4 (Idle/System) are never touched;
 * failures per-process are skipped, never fatal. Nothing is closed.
 * ========================================================================== */
const { runPS } = require('./exec');

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

module.exports = { optimize };
