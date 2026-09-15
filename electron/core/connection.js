'use strict';
/* ============================================================================
 * core/connection.js — Online/Offline mode system (local-first, no backend).
 * ----------------------------------------------------------------------------
 * WHY THIS EXISTS WITHOUT A SERVER: every feature in the app runs locally,
 * so "online" here means *this machine can reach the internet*, not *our
 * server is up*. That keeps every promise intact: tweaks, crosshairs,
 * benchmarks and profiles work identically offline; anything that would
 * need a server (leaderboard, marketplace, cloud sync) simply stays
 * disabled/queued until one exists.
 *
 * TOGGLE LOGIC (the whole state machine in one place):
 *   pref = store 'connMode': 'auto' (default) | 'online' | 'offline'
 *   - 'offline'               → always Offline, never probes.
 *   - 'online'                → Online ONLY if a probe succeeds; else the
 *                               caller gets { warning } ("No connection
 *                               detected. Switch to Offline mode?") and the
 *                               effective state stays Offline.
 *   - 'auto' (default)        → probe on request; Online if it succeeds
 *                               within 3s, Offline otherwise. First launch
 *                               therefore lands Online on connected PCs and
 *                               Offline on disconnected ones, exactly per spec.
 * Probes are plain dns.lookup calls (free, no paid APIs, no telemetry —
 * resolving a public hostname sends nothing identifiable anywhere).
 * Failed probes NEVER throw and NEVER crash callers: they resolve Offline.
 * All future online features must check isOnline() before any network call.
 * ========================================================================== */
const dns = require('node:dns').promises;

let store = null;
let memPref = 'auto'; // fallback when init() hasn't run (tests, early boot)
const PROBE_HOSTS = ['google.com', 'cloudflare.com', 'one.one.one.one'];
const PROBE_TIMEOUT_MS = 3000;

function init(options) {
  store = (options && options.store) || null;
  return { ok: true };
}
function getStore() {
  return store;
}
function pref() {
  try {
    if (store) {
      const v = store.get('connMode');
      return v === 'online' || v === 'offline' || v === 'auto' ? v : 'auto';
    }
  } catch { /* fall through to memory */ }
  return memPref;
}

/* Single DNS probe with a hard timeout. Resolves true/false, never rejects. */
function probeOnce(host, ms) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const timer = setTimeout(() => finish(false), ms);
    dns.lookup(host).then(
      () => { clearTimeout(timer); finish(true); },
      () => { clearTimeout(timer); finish(false); }
    );
  });
}

/* Try hosts in order; first success wins (one slow host must not sink us). */
async function checkOnline(timeoutMs) {
  const budget = Math.max(1000, Number(timeoutMs) || PROBE_TIMEOUT_MS);
  try {
    for (const host of PROBE_HOSTS) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await probeOnce(host, budget);
      if (ok) {
        try { store && store.set('connLast', { online: true, at: new Date().toISOString() }); } catch { /* ignore */ }
        return { ok: true, online: true };
      }
    }
  } catch { /* fall through to offline */ }
  try { store && store.set('connLast', { online: false, at: new Date().toISOString() }); } catch { /* ignore */ }
  return { ok: true, online: false };
}

function lastKnown() {
  try {
    const l = store && store.get('connLast');
    if (l && typeof l.online === 'boolean') return l;
  } catch { /* ignore */ }
  return null;
}

/* Effective state WITHOUT probing (instant, for gates): manual pref wins;
 * auto falls back to the last probe result (default Online until the first
 * failed probe says otherwise — first launch probes immediately anyway). */
function getState() {
  const p = pref();
  if (p === 'offline') return { ok: true, mode: 'offline', online: false };
  if (p === 'online') {
    const last = lastKnown();
    return { ok: true, mode: 'online', online: last ? !!last.online : true };
  }
  const last = lastKnown();
  return { ok: true, mode: 'auto', online: last ? !!last.online : true };
}
function isOnline() {
  try { return !!getState().online; } catch { return false; }
}

async function setMode(mode) {
  const m = String(mode || '').toLowerCase();
  if (!['auto', 'online', 'offline'].includes(m)) return { ok: false, message: 'Use auto, online, or offline.' };
  memPref = m;
  try { store && store.set('connMode', m); } catch (e) { return { ok: false, message: String(e) }; }
  if (m === 'offline') return { ok: true, ...(getState()), message: 'Offline mode — everything local keeps working.' };
  // online/auto: verify with a live probe so the UI never lies.
  const probe = await checkOnline(PROBE_TIMEOUT_MS);
  const state = getState();
  if (m === 'online' && !probe.online) {
    return {
      ok: true, ...state,
      warning: 'No connection detected. Switch to Offline mode?',
    };
  }
  return { ok: true, ...state };
}

module.exports = { init, pref, checkOnline, getState, isOnline, setMode, lastKnown, PROBE_TIMEOUT_MS };
