'use strict';
/* ============================================================================
 * core/cleaner.js — Free cleaner. scan() walks %TEMP%, C:\Windows\Temp,
 * Prefetch (7+ days old only — safer), and Chromium/Firefox caches with
 * plain Node fs (fast, no shell needed), capped so huge disks can't hang it.
 * clean() deletes ONLY the paths the UI passes (user-checked) + optionally
 * empties the recycle bin via Clear-RecycleBin. Locked files are skipped and
 * counted, never fatal.
 * ========================================================================== */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { runPS } = require('./exec');

const MAX_FILES = 2000; // scan cap: keeps the UI snappy on messy drives

function browserCacheDirs() {
  const local = process.env.LOCALAPPDATA || '';
  const roaming = process.env.APPDATA || '';
  const dirs = [
    'Google\\Chrome\\User Data\\Default\\Cache', 'Google\\Chrome\\User Data\\Default\\Code Cache',
    'Microsoft\\Edge\\User Data\\Default\\Cache', 'Microsoft\\Edge\\User Data\\Default\\Code Cache',
    'BraveSoftware\\Brave-Browser\\User Data\\Default\\Cache',
    'Opera Software\\Opera Stable\\Cache',
  ].map((d) => path.join(local, ...d.split('\\')));
  // Firefox: every profile's cache2/startupCache/thumbnails
  for (const base of [path.join(local, 'Mozilla', 'Firefox', 'Profiles'), path.join(roaming, 'Mozilla', 'Firefox', 'Profiles')]) {
    try {
      for (const prof of fs.readdirSync(base)) {
        for (const sub of ['cache2', 'startupCache', 'thumbnails']) dirs.push(path.join(base, prof, sub));
      }
    } catch { /* no Firefox profiles — fine */ }
  }
  return dirs.filter((d) => { try { return fs.statSync(d).isDirectory(); } catch { return false; } });
}

/* Walk one dir, collecting { path, size }. prefetchOnly → files older than 7d. */
function walk(dir, out, prefetchOnly) {
  if (out.length >= MAX_FILES) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  const cutoff = Date.now() - 7 * 86400 * 1000;
  for (const e of entries) {
    if (out.length >= MAX_FILES) return;
    const full = path.join(dir, e.name);
    try {
      if (e.isDirectory() && !e.isSymbolicLink()) walk(full, out, prefetchOnly);
      else if (e.isFile() || e.isSymbolicLink()) {
        const st = fs.statSync(full);
        if (prefetchOnly && st.mtimeMs > cutoff) continue; // keep fresh prefetch
        if (st.size >= 0) out.push({ path: full, size: st.size });
      }
    } catch { /* locked file — skip silently */ }
  }
}

function recycleBinBytes() {
  // COM Shell recycle bin size; wrapped — failure just means "unknown".
  return runPS(
    '$s=(New-Object -ComObject Shell.Application).NameSpace(10).Items()|Measure-Object -Property Size -Sum; if($s.Sum){$s.Sum}else{0}',
    30000
  ).then((r) => Number((r.stdout || '').trim().split('\n').pop()) || 0)
    .catch(() => 0);
}

async function scan() {
  try {
    const roots = [];
    if (os.tmpdir()) roots.push({ dir: os.tmpdir(), prefetch: false });
    const winTemp = path.join(process.env.SystemRoot || 'C:\\Windows', 'Temp');
    roots.push({ dir: winTemp, prefetch: false });
    roots.push({ dir: path.join(process.env.SystemRoot || 'C:\\Windows', 'Prefetch'), prefetch: true });
    for (const d of browserCacheDirs()) roots.push({ dir: d, prefetch: false });

    const files = [];
    for (const { dir, prefetch } of roots) {
      try { if (fs.statSync(dir).isDirectory()) walk(dir, files, prefetch); }
      catch { /* missing dir — skip */ }
    }
    files.sort((a, b) => b.size - a.size); // biggest junk first
    const totalFiles = files.reduce((a, f) => a + f.size, 0);
    const bin = await recycleBinBytes();
    return { ok: true, files, totalBytes: totalFiles + bin, recycleBytes: bin, truncated: files.length >= MAX_FILES };
  } catch (e) { return { ok: false, message: String(e) }; }
}

async function clean(opts) {
  const paths = ((opts && opts.paths) || []).map(String);
  let freed = 0, deleted = 0, errors = 0;
  for (const p of paths) {
    try {
      let size = 0;
      try { size = fs.statSync(p).size; } catch { /* stat first, best effort */ }
      fs.rmSync(p, { force: true, recursive: false });
      freed += size;
      deleted++;
    } catch { errors++; } // locked/in-use — counted, not fatal
  }
  if (opts && opts.includeRecycleBin) {
    try {
      const before = await recycleBinBytes();
      await runPS('Clear-RecycleBin -Force -ErrorAction SilentlyContinue', 60000);
      freed += before;
    } catch { errors++; }
  }
  return { ok: true, freed, deleted, errors, message: `Freed ${freed} bytes.` };
}

module.exports = { scan, clean };
