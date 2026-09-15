'use strict';
/* ============================================================================
 * core/benchmark.js — standardized LOCAL benchmarks (zero deps, zero network).
 * ----------------------------------------------------------------------------
 * Time-boxed workloads (Quick 30s / Standard 2m / Deep 5m): the same code
 * runs for the whole budget and the SCORE is throughput, so before/after
 * runs on one machine are directly comparable. Chunked with setImmediate
 * yields so the main process keeps answering IPC mid-run. NEVER throws —
 * every entry returns { ok, ... }.
 *
 *   cpu  — single-core (trial-division prime sieve) + multi-core (same sieve
 *           fanned out over worker_threads, stdlib only) + interleaved f64
 *           matrix multiplies. Scores are relative kilo-ops/sec, documented
 *           here so runs stay comparable across app versions.
 *   ram  — 64MB Buffer write/read/copy loops → GB/s, plus a typed-array
 *           pointer chase → latency ns/op (an estimate: JS can't pin caches,
 *           so treat latency as comparative, not lab-grade).
 *   disk — 100MB file in the OS temp dir (deleted afterwards): sequential
 *           write/read in 1MB chunks → MB/s, random 4K read/write → IOPS.
 * GPU lives in the renderer (WebGL canvas, renderer/tabs/benchmark.js) —
 * Chromium-only APIs can't run in the main process. The tab combines all
 * four into the overall score + history graph.
 * History: <userData>/benchmarks/history.json (userData IS %APPDATA%/
 * TidalTweaks on Windows). saveRun caps the file so it can't grow forever.
 * ========================================================================== */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Worker } = require('node:worker_threads');

const DURATIONS = { quick: 30000, standard: 120000, deep: 300000 };
const HISTORY_CAP = 500;

function nowMs() {
  return Number(process.hrtime.bigint()) / 1e6;
}
/* Yield back to the event loop so IPC (and app quit) stays responsive
 * during long synchronous number-crunching stretches. */
function breathe() {
  return new Promise((resolve) => setImmediate(resolve));
}

/* ------------------------------- CPU ------------------------------------ */
/* Trial-division prime count over [2, limit). Small, branchy, cache-hostile
 * — a fair single-thread integer workout. */
function countPrimes(limit) {
  if (limit < 3) return 1;
  let count = 1; // '2'
  for (let n = 3; n < limit; n += 2) {
    let prime = true;
    const root = Math.sqrt(n);
    for (let d = 3; d <= root; d += 2) {
      if (n % d === 0) { prime = false; break; }
    }
    if (prime) count++;
  }
  return count;
}
/* Dense f64 matrix multiply (N=48): the floating-point counterweight. */
function matmulSum(n) {
  const a = new Float64Array(n * n);
  const b = new Float64Array(n * n);
  const c = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) { a[i] = (i % 13) * 0.5; b[i] = (i % 7) * 0.25; }
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < n; k++) {
      const aik = a[i * n + k];
      for (let j = 0; j < n; j++) c[i * n + j] += aik * b[k * n + j];
    }
  }
  let s = 0;
  for (let i = 0; i < n * n; i += 7) s += c[i];
  return s; // checksum keeps the JIT honest (dead code would be eliminated)
}

async function cpuSingle(budgetMs) {
  const t0 = nowMs();
  const end = t0 + budgetMs;
  let primes = 0, matmuls = 0, limit = 20000;
  let lastYield = t0;
  while (nowMs() < end) {
    primes += countPrimes(limit);
    matmuls += 1;
    matmulSum(48);
    limit = limit >= 60000 ? 20000 : limit + 5000; // vary working set
    if (nowMs() - lastYield > 60) { await breathe(); lastYield = nowMs(); }
  }
  const secs = (nowMs() - t0) / 1000;
  const ops = primes + matmuls * 200;
  return { ops, secs, score: Math.round(ops / Math.max(secs, 0.001)) };
}

/* Multi-core: the same sieve fanned across workers (one per logical core,
 * capped at 8 so weak machines aren't swamped). Workers are spawned from an
 * eval'd string — no extra files, stdlib only. */
const SIEVE_WORKER = `
  const { parentPort, workerData } = require('node:worker_threads');
  function countPrimes(limit, start) {
    let count = 0;
    for (let n = Math.max(3, start); n < limit; n += 2) {
      let prime = true;
      const root = Math.sqrt(n);
      for (let d = 3; d <= root; d += 2) { if (n % d === 0) { prime = false; break; } }
      if (prime) count++;
    }
    return count;
  }
  const t0 = Date.now();
  const end = t0 + workerData.budgetMs;
  let total = 0, base = workerData.seed;
  while (Date.now() < end) { total += countPrimes(base + 40000, base); base += 40000 * workerData.stride; }
  parentPort.postMessage({ primes: total, ms: Date.now() - t0 });
`;
function runWorker(budgetMs, seed, stride) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      const w = new Worker(SIEVE_WORKER, { eval: true, workerData: { budgetMs, seed, stride } });
      const timer = setTimeout(() => { try { w.terminate(); } catch { /* ignore */ } finish({ primes: 0, ms: budgetMs }); }, budgetMs + 15000);
      w.on('message', (m) => { clearTimeout(timer); finish(m); });
      w.on('error', () => { clearTimeout(timer); finish({ primes: 0, ms: budgetMs }); });
      w.on('exit', () => { clearTimeout(timer); finish({ primes: 0, ms: budgetMs }); });
    } catch { finish({ primes: 0, ms: budgetMs }); }
  });
}
async function cpuBench(budgetMs) {
  const cores = Math.max(1, Math.min(8, (os.cpus() || []).length || 1));
  const [single, ...multi] = await Promise.all([
    cpuSingle(Math.min(budgetMs, 20000)), // single-thread slice (bounded)
    ...Array.from({ length: Math.max(0, cores - 0) }, (_, i) =>
      runWorker(budgetMs, 3 + i * 7919, cores)),
  ]);
  // Multi score uses the full-budget worker pool; single uses its own slice.
  const mPrimes = multi.reduce((a, m) => a + (m.primes || 0), 0);
  const mSecs = budgetMs / 1000;
  const multiScore = Math.round(mPrimes / Math.max(mSecs, 0.001));
  return {
    ok: true,
    cores,
    single: single.score,
    multi: multiScore,
    // Combined test score (mean of both) for overall-score math + count-up.
    score: Math.round((single.score + multiScore) / 2),
    detail: { singleOps: single.ops, multiPrimes: mPrimes },
  };
}

/* ------------------------------- RAM ------------------------------------ */
async function ramBench(budgetMs) {
  const SIZE = 64 * 1024 * 1024;
  const buf = Buffer.allocUnsafe(SIZE);
  const src = Buffer.allocUnsafe(SIZE);
  src.fill(0xab);
  const end = nowMs() + budgetMs;
  let written = 0, read = 0, copied = 0, acc = 0;
  const t0 = nowMs();
  let lastYield = t0;
  while (nowMs() < end) {
    buf.fill((written & 0xff) || 1); written += SIZE;
    for (let i = 0; i < SIZE; i += 4096) acc += buf[i];
    read += SIZE;
    src.copy(buf); copied += SIZE;
    if (nowMs() - lastYield > 60) { await breathe(); lastYield = nowMs(); }
  }
  const secs = (nowMs() - t0) / 1000;
  // Latency: pointer chase over a shuffled Uint32 index array (L3-sized).
  const N = 1 << 20;
  const idx = new Uint32Array(N);
  let s = 123456789;
  for (let i = 0; i < N; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; idx[i] = s % N; }
  const OPS = 2000000;
  const l0 = nowMs();
  let p = 0;
  for (let i = 0; i < OPS; i++) p = idx[p];
  const latencyNs = ((nowMs() - l0) / OPS) * 1e6;
  if (acc === 0 && p === -1) await breathe(); // use the checksums (never true, never optimized out cleanly)
  const gb = (n) => (n / 1073741824) / Math.max(secs, 0.001);
  const readGBs = gb(read), writeGBs = gb(written), copyGBs = gb(copied);
  return {
    ok: true,
    readGBs: Math.round(readGBs * 100) / 100,
    writeGBs: Math.round(writeGBs * 100) / 100,
    latencyNs: Math.round(latencyNs * 10) / 10,
    score: Math.round((readGBs + writeGBs + copyGBs) / 3 * 100),
  };
}

/* ------------------------------- Disk ----------------------------------- */
async function diskBench(budgetMs) {
  const dir = path.join(os.tmpdir(), `tidaltweaks-bench-${process.pid}-${Date.now()}`);
  const file = path.join(dir, 'test100m.dat');
  const TOTAL = 100 * 1024 * 1024;
  const CHUNK = 1024 * 1024;
  const chunk = Buffer.allocUnsafe(CHUNK);
  chunk.fill(0x5a);
  fs.mkdirSync(dir, { recursive: true });
  const split = [0.3, 0.3, 0.2, 0.2]; // seqWrite, seqRead, randRead, randWrite
  try {
    // Sequential write
    let t0 = nowMs();
    const endW = t0 + budgetMs * split[0];
    let wBytes = 0;
    const fdW = fs.openSync(file, 'w');
    try {
      while (nowMs() < endW && wBytes < TOTAL) {
        fs.writeSync(fdW, chunk, 0, CHUNK);
        wBytes += CHUNK;
      }
    } finally { fs.closeSync(fdW); }
    const wSecs = (nowMs() - t0) / 1000;
    // Sequential read
    t0 = nowMs();
    const endR = t0 + budgetMs * split[1];
    let rBytes = 0;
    const size = Math.min(wBytes || TOTAL, TOTAL);
    const fdR = fs.openSync(file, 'r');
    const rbuf = Buffer.allocUnsafe(CHUNK);
    try {
      while (nowMs() < endR) {
        const n = fs.readSync(fdR, rbuf, 0, CHUNK, rBytes % Math.max(size, 1));
        if (n <= 0) break;
        rBytes += n;
      }
    } finally { fs.closeSync(fdR); }
    const rSecs = (nowMs() - t0) / 1000;
    // Random 4K IOPS (read, then write) over whatever got written
    const span = Math.max(4096, size - 4096);
    const small = Buffer.allocUnsafe(4096);
    async function iops(kind, frac) {
      const end = nowMs() + budgetMs * frac;
      let ops = 0;
      const t = nowMs();
      const fd = fs.openSync(file, kind === 'read' ? 'r' : 'r+');
      try {
        while (nowMs() < end) {
          const off = Math.floor(Math.random() * (span / 4096)) * 4096;
          if (kind === 'read') { if (fs.readSync(fd, small, 0, 4096, off) <= 0) break; }
          else fs.writeSync(fd, small, 0, 4096, off);
          ops++;
          if (ops % 200 === 0) await breathe();
        }
      } finally { fs.closeSync(fd); }
      const secs = (nowMs() - t) / 1000;
      return Math.round(ops / Math.max(secs, 0.001));
    }
    const randRead = await iops('read', split[2]);
    const randWrite = await iops('write', split[3]);
    const seqWriteMBs = (wBytes / 1048576) / Math.max(wSecs, 0.001);
    const seqReadMBs = (rBytes / 1048576) / Math.max(rSecs, 0.001);
    return {
      ok: true,
      seqWriteMBs: Math.round(seqWriteMBs * 10) / 10,
      seqReadMBs: Math.round(seqReadMBs * 10) / 10,
      randReadIOPS: randRead,
      randWriteIOPS: randWrite,
      score: Math.round(seqWriteMBs + seqReadMBs + randRead / 100 + randWrite / 100),
    };
  } catch (e) {
    return { ok: false, message: /ENOSPC/i.test(String(e)) ? 'Disk full — free space and retry.' : String((e && e.message) || e) };
  } finally {
    try { fs.rmSync(file, { force: true }); fs.rmdirSync(dir); } catch { /* best effort */ }
  }
}

/* ----------------------------- Dispatch --------------------------------- */
async function runTest(test, durationMs) {
  const budget = Math.min(300000, Math.max(5000, Number(durationMs) || 30000));
  try {
    if (test === 'cpu') return await cpuBench(budget);
    if (test === 'ram') return await ramBench(budget);
    if (test === 'disk') return await diskBench(budget);
    return { ok: false, message: `Unknown benchmark: ${test}` };
  } catch (e) { return { ok: false, message: String((e && e.message) || e) }; }
}

/* ----------------------------- History ---------------------------------- */
function historyDir() {
  try {
    const base = require('electron').app.getPath('userData');
    return path.join(base, 'benchmarks');
  } catch {
    return path.join(os.tmpdir(), 'tidaltweaks-benchmarks');
  }
}
function historyFile() {
  return path.join(historyDir(), 'history.json');
}
function loadHistory() {
  try {
    const raw = fs.readFileSync(historyFile(), 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function saveRun(run) {
  try {
    fs.mkdirSync(historyDir(), { recursive: true });
    const arr = loadHistory();
    arr.push({ at: new Date().toISOString(), ...(run || {}) });
    while (arr.length > HISTORY_CAP) arr.shift();
    fs.writeFileSync(historyFile(), JSON.stringify(arr, null, 2));
    return { ok: true, count: arr.length };
  } catch (e) { return { ok: false, message: String((e && e.message) || e) }; }
}

module.exports = {
  DURATIONS, HISTORY_CAP,
  runTest, cpuBench, ramBench, diskBench,
  loadHistory, saveRun, historyFile,
};
