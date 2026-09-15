'use strict';
/* ============================================================================
 * core/services/apply.js — generic applier for data-driven service/task rows.
 * An item def: { id, services?[{n,label}], tasks?[], reg?[{root,path,name,
 * value}], run? (async fn), xboxCheck? }. Every writer snapshots first:
 * services keep their start type (scGetStart), tasks keep their State,
 * registry keeps the previous value (regSetDword). Missing services/tasks
 * report as "not present" (Win10 vs Win11 variance) instead of failing.
 * Never throws — failures return { ok:false, message, revert } with whatever
 * was already applied, so Undo rolls back the partial run.
 * ========================================================================== */
const { runCmd, runPS, regSetDword, scGetStart } = require('../exec');
const tasksMod = require('../tasks');

async function disableSvc(n) {
  const prev = await scGetStart(n);
  if (prev === 'unknown') {
    const probe = await runCmd('sc.exe', ['query', n], 15000);
    const out = (probe.stdout + probe.stderr).toLowerCase();
    if (probe.code !== 0 && (out.includes('does not exist') || out.includes('0x424') || out.includes('1060'))) {
      return { state: 'missing' };
    }
  }
  if (prev === 'disabled') return { state: 'already' };
  const r = await runPS(`sc.exe stop ${n} 2>$null; sc.exe config ${n} start= disabled`, 60000);
  const out = (r.stdout + r.stderr).toLowerCase();
  if (/failed|access|denied/i.test(out) && prev === 'unknown') {
    return { state: 'failed', message: `Could not touch ${n} (run as admin).` };
  }
  return { state: 'disabled', revert: { kind: 'service', name: n, prevStart: prev === 'unknown' ? 'demand' : prev } };
}

async function applyItem(def) {
  try {
    if (def.xboxCheck) {
      const x = await xboxAppPresent();
      if (x.present) {
        return { ok: false, message: `Xbox app detected (${x.found}) — skipped. Uninstall it first if you really want these services off.` };
      }
    }
    const reverts = [];
    let did = 0, already = 0;
    const missing = [];
    for (const s of def.services || []) {
      const r = await disableSvc(s.n);
      if (r.state === 'disabled') { did++; if (r.revert) reverts.push(r.revert); }
      else if (r.state === 'already') already++;
      else if (r.state === 'missing') missing.push(s.label || s.n);
      else return { ok: false, message: r.message || `Failed on ${s.n}.`, revert: reverts };
    }
    for (const t of def.tasks || []) {
      const r = await tasksMod.disableTask(t);
      if (r.ok && r.revert) { did++; reverts.push(r.revert); }
      else if (r.ok && r.already) already++;
      else if (r.ok && r.missing) missing.push(t.split('\\').pop());
      else return { ok: false, message: r.message || `Failed on ${t}.`, revert: reverts };
    }
    for (const g of def.reg || []) {
      const r = await regSetDword(g.root, g.path, g.name, g.value);
      if (!r.ok) return { ok: false, message: r.message, revert: reverts };
      did++;
      reverts.push(r.revert);
    }
    if (def.run) {
      const r = await def.run();
      if (!r.ok) { if (r.revert) (Array.isArray(r.revert) ? reverts.push(...r.revert) : reverts.push(r.revert)); return { ok: false, message: r.message, revert: reverts }; }
      did++;
      if (r.revert) (Array.isArray(r.revert) ? reverts.push(...r.revert) : reverts.push(r.revert));
    }
    const parts = [];
    if (did) parts.push(`${did} disabled`);
    if (already) parts.push(`${already} already off`);
    if (missing.length) parts.push(`${missing.length} not present (${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''})`);
    return {
      ok: true,
      message: `${def.t}: ${parts.join(', ') || 'nothing to do'}.`,
      revert: reverts.length ? reverts : { kind: 'none' },
    };
  } catch (e) { return { ok: false, message: String(e) }; }
}

/* Xbox presence check (Appx): per-service Xbox rows skip when the app that
 * needs them is installed. */
async function xboxAppPresent() {
  try {
    const r = await runPS(
      `(Get-AppxPackage -Name Microsoft.XboxApp -ErrorAction SilentlyContinue | Select-Object -First 1).Name; (Get-AppxPackage -Name Microsoft.GamingServices -ErrorAction SilentlyContinue | Select-Object -First 1).Name`,
      30000
    );
    const found = (r.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean);
    return { present: found.length > 0, found: found.join(', ') };
  } catch { return { present: false, found: '' }; }
}

module.exports = { applyItem, xboxAppPresent };
