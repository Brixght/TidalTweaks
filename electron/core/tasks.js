'use strict';
/* ============================================================================
 * core/tasks.js — scheduled-task disables for the Services tab (Pro).
 * schtasks /Change /Disable with the previous State captured per task, so
 * Restore → Undo re-enables exactly what was on ({ kind:'schtask-toggle' }
 * in core/backup.js). Missing tasks are skipped (editions vary); already-
 * disabled tasks report as such. Never throws.
 * ========================================================================== */
const { runCmd } = require('./exec');

/* Previous State of a task path, or null when the task doesn't exist. */
async function taskState(task) {
  try {
    const r = await runCmd('schtasks', ['/Query', '/TN', task, '/V', '/FO', 'LIST'], 30000);
    if (r.code !== 0) return null;
    const m = /Status:\s*([A-Za-z ]+)/.exec(r.stdout || '');
    return m ? m[1].trim() : 'Unknown';
  } catch { return null; }
}

async function disableTask(task) {
  const prev = await taskState(task);
  if (prev === null) return { ok: true, missing: true };
  if (/disabled/i.test(prev)) return { ok: true, already: true };
  try {
    const r = await runCmd('schtasks', ['/Change', '/TN', task, '/Disable'], 60000);
    if (r.code !== 0) return { ok: false, message: `Could not disable '${task}' (run as admin).` };
    return { ok: true, revert: { kind: 'schtask-toggle', task, prev } };
  } catch (e) { return { ok: false, message: String(e) }; }
}

async function disableTaskGroup(tasks) {
  const reverts = [];
  let off = 0, already = 0, missing = 0;
  for (const task of tasks) {
    const r = await disableTask(task);
    if (r.ok && r.revert) { reverts.push(r.revert); off++; }
    else if (r.ok && r.already) already++;
    else if (r.ok && r.missing) missing++;
    else return { ok: false, message: r.message, revert: reverts };
  }
  return { ok: true, off, already, missing, revert: reverts };
}

const TELEMETRY_TASKS = [
  '\\Microsoft\\Windows\\Application Experience\\Microsoft Compatibility Appraiser',
  '\\Microsoft\\Windows\\Application Experience\\ProgramDataUpdater',
  '\\Microsoft\\Windows\\Application Experience\\StartupAppTask',
  '\\Microsoft\\Windows\\Customer Experience Improvement Program\\Consolidator',
  '\\Microsoft\\Windows\\Customer Experience Improvement Program\\KernelCeipTask',
  '\\Microsoft\\Windows\\Customer Experience Improvement Program\\UsbCeip',
];

const MAINT_TASKS = [
  '\\Microsoft\\Windows\\TaskScheduler\\Idle Maintenance',
  '\\Microsoft\\Windows\\TaskScheduler\\Regular Maintenance',
];

function summarize(label, r) {
  const parts = [];
  if (r.off) parts.push(`${r.off} disabled`);
  if (r.already) parts.push(`${r.already} already off`);
  if (r.missing) parts.push(`${r.missing} not present`);
  return `${label}: ${parts.join(', ') || 'nothing to do'}.`;
}

async function disableTelemetryTasks() {
  try {
    const r = await disableTaskGroup(TELEMETRY_TASKS);
    if (!r.ok) return { ok: false, message: r.message };
    return { ok: true, message: summarize('Telemetry tasks', r), revert: r.revert.length ? r.revert : { kind: 'none' } };
  } catch (e) { return { ok: false, message: String(e) }; }
}

async function disableMaintenanceTasks() {
  try {
    const r = await disableTaskGroup(MAINT_TASKS);
    if (!r.ok) return { ok: false, message: r.message };
    return {
      ok: true,
      message: summarize('Idle/regular maintenance', r) + ' Run maintenance manually from Control Panel → Security and Maintenance when wanted.',
      revert: r.revert.length ? r.revert : { kind: 'none' },
    };
  } catch (e) { return { ok: false, message: String(e) }; }
}

module.exports = {
  taskState, disableTask, disableTelemetryTasks, disableMaintenanceTasks,
  TELEMETRY_TASKS, MAINT_TASKS,
};
