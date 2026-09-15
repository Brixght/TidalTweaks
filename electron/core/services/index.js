'use strict';
/* ============================================================================
 * core/services/index.js — aggregates the 7 Services-tab sections.
 * Exports SECTIONS (row order + badges/impacts for services:list) and DEFS
 * (full definitions for the generic applier + registry wiring in main.js).
 * Rows are either { def } (new data-driven id) or { ref } (existing tweak
 * id reused verbatim, with optional spec title/desc overrides).
 * Skipped spec rows (no real Windows target, or exact dupes): 29 (dup of
 * Wecsvc), 31 (dup of StartupAppTask), 45/49/50/52 (no such service),
 * 68/86 (no distinct target), 70/75/78/82/83/84/85/87 (no verifiable
 * task path), 80 (dup of Clip license), 107/120/121 (not services).
 * ========================================================================== */
const core = require('./core');
const telemetry = require('./telemetry');
const network = require('./network');
const xbox = require('./xbox');
const tasks = require('./tasks');
const features = require('./features');
const caution = require('./caution');

const DEFS = {};
for (const mod of [core, telemetry, network, xbox, tasks, features, caution]) {
  for (const def of mod.ITEMS || []) DEFS[def.id] = def;
}

/* Confirm-modal text builder for data-driven ids (existing ids reuse their
 * catalog modals). Services/tasks/reg parts compose; warnings lead. */
function modalFor(def) {
  if (def.m) return def.m;
  const parts = [];
  if (def.warn) parts.push(`⚠ ${def.warn}`);
  const svcs = def.services || [];
  if (svcs.length) {
    parts.push(svcs.length > 1
      ? `Will stop and disable ${svcs.length} services (${svcs.map((s) => s.n).join(', ')}).`
      : `Will stop and disable the ${svcs[0].label || svcs[0].n} service (${svcs[0].n}).`);
  }
  const tks = def.tasks || [];
  if (tks.length) {
    parts.push(`Will DISABLE (not delete) ${tks.length} scheduled task(s). Previous states are captured — Undo re-enables exactly what was on. Missing tasks are skipped.`);
  }
  for (const g of def.reg || []) {
    parts.push(`Will set ${g.path} ${g.name}=${g.value}. Previous value captured — Revert restores it.`);
  }
  if (def.runNote) parts.push(def.runNote);
  parts.push('Reversible from Restore → Undo.');
  return parts.join('\n');
}

const R = (ref, badge, impact, extra) => ({ ref, badge, impact, ...(extra || {}) });
const D = (id, badge, impact) => ({ def: id, badge, impact });

const SECTIONS = [
  {
    id: 'aggressive', title: 'AGGRESSIVE - ADVANCED USERS ONLY',
    rows: [
      D('svc-wuauserv-off', 'advanced', 3),
      R('mem-no-prefetch', 'advanced', 2, { t: 'Disable Prefetch + Superfetch (registry)', d: 'Fully turns off prefetching. Can slow first-launch of apps.', danger: true, check: 'I understand this may break Windows features.' }),
      D('svc-defender-rtm-off', 'advanced', 3),
      D('svc-kill-trio', 'advanced', 3),
      D('svc-nuke-telemetry', 'advanced', 3),
      D('svc-dosvc-off', 'safe', 3),
      D('task-update-start-off', 'caution', 2),
      D('adv-driver-search-off', 'caution', 2),
      D('svc-bcastdvr-off', 'safe', 2),
    ],
  },
  {
    id: 'telemetry', title: 'DIAGNOSTIC & TELEMETRY SERVICES',
    rows: [
      D('svc-dps-off', 'safe', 2), D('svc-wappush-off', 'safe', 2),
      D('task-ait-agent', 'safe', 1), D('task-autochk-proxy', 'safe', 1),
      D('task-device-metadata', 'safe', 1), D('svc-sense-atp', 'safe', 1),
      D('svc-wecsvc', 'safe', 1), D('svc-graphicsperf', 'safe', 1),
      D('svc-wdi-host', 'safe', 1), D('svc-wdi-sys', 'safe', 1),
      D('svc-dshub', 'safe', 1), D('task-error-queue', 'safe', 1),
      D('task-dmclient', 'safe', 1), D('task-dmclient-dl', 'safe', 1),
      D('task-kernel-ceip', 'safe', 1), D('task-winsat-power', 'safe', 1),
      D('task-progdata-upd', 'safe', 1), D('task-diag-scheduled', 'safe', 1),
      D('task-setup-cleanup', 'safe', 1), D('task-pi-sqm', 'safe', 1),
      D('task-device-info', 'safe', 1), D('task-device-user', 'safe', 1),
      D('task-disk-collector', 'safe', 1), D('task-disk-resolver', 'safe', 1),
      D('task-disk-footprint', 'safe', 1), D('task-usb-ceip', 'safe', 1),
    ],
  },
  {
    id: 'network', title: 'NETWORK & DNS SERVICES',
    rows: [
      D('reg-dns-ttl', 'safe', 2), D('cmd-chimney-off', 'caution', 2),
      D('svc-fdphost-off', 'safe', 1), D('svc-fdrespub-off', 'safe', 1),
      D('svc-nettcp-off', 'safe', 1), D('svc-wfds-off', 'safe', 1),
      D('svc-wcn-off', 'safe', 1), D('task-wininet-cache', 'safe', 1),
      D('task-workfolders-logon', 'safe', 1), D('svc-smsrouter-off', 'safe', 1),
      D('svc-rasauto-off', 'safe', 1),
      R('adv-ndu-off', 'caution', 1, { t: 'Disable Network Data Usage driver', d: 'Frees memory used by usage tracking.' }),
    ],
  },
  {
    id: 'xbox', title: 'XBOX SERVICES',
    note: 'Caution if you use Xbox — rows auto-skip when the Xbox app is installed.',
    rows: [
      D('svc-xbox-auth', 'caution', 2), D('svc-xbox-save', 'caution', 2),
      D('svc-xbox-net', 'caution', 2),
    ],
  },
  {
    id: 'tasks', title: 'SCHEDULED TASKS',
    note: 'Safe for everyone. Tasks are DISABLED, never deleted.',
    rows: [
      D('task-auto-join', 'safe', 1), D('task-bt-uninstall', 'safe', 1),
      D('task-cloudhost', 'safe', 1), D('svc-dusm-off', 'safe', 1),
      D('task-family-monitor', 'safe', 1), D('task-family-refresh', 'safe', 1),
      D('task-location-dialog', 'safe', 1), D('task-location-notif', 'safe', 1),
      D('task-mrt-offer', 'safe', 1), D('task-maps-toast', 'safe', 1),
      D('task-maps-update', 'safe', 1), D('task-offline-sync', 'safe', 1),
      D('task-pca-patchdb', 'safe', 1), D('task-push-login', 'safe', 1),
      D('task-push-reg', 'safe', 1), D('task-retail-cleanup', 'safe', 1),
      D('task-speech-model', 'safe', 1), D('task-startup-app', 'safe', 1),
      D('task-clip-license', 'safe', 1), D('task-tz-sync', 'safe', 1),
    ],
  },
  {
    id: 'features', title: 'FEATURE SERVICES',
    note: 'Disable if unused — each card warns what breaks.',
    rows: [
      D('svc-ajrouter-off', 'safe', 1), D('svc-assignedaccess-off', 'safe', 1),
      D('svc-branchcache-off', 'safe', 1), D('svc-capture-off', 'safe', 1),
      D('svc-cdp-off', 'safe', 1), D('svc-pimindex-off', 'safe', 1),
      D('svc-devicepicker-off', 'safe', 1), D('svc-devicesflow-off', 'safe', 1),
      D('svc-entapp-off', 'safe', 1), D('svc-homegroup-listener-off', 'safe', 1),
      D('svc-homegroup-provider-off', 'safe', 1), D('svc-msg-off', 'safe', 1),
      D('svc-mixedreality-off', 'safe', 1), D('svc-wpdbusenum-off', 'safe', 1),
      D('svc-printnotify-off', 'safe', 1), D('svc-sensordata-off', 'safe', 1),
      D('svc-sensr-off', 'safe', 1), D('svc-sensor-off', 'safe', 1),
      D('svc-sharedpc-off', 'safe', 1), D('svc-scdeviceenum-off', 'safe', 1),
      D('svc-scpolicy-off', 'safe', 1), D('svc-spatial-off', 'safe', 1),
      D('svc-sti-off', 'safe', 1), D('svc-onesync-off', 'safe', 1),
      D('svc-sgrm-off', 'safe', 1),
      R('svc-touchkbd-off', 'safe', 1, { t: 'Disable Touch Keyboard and Handwriting', d: 'Only if you have NO touchscreen — else your keyboard vanishes.' }),
      D('svc-userdata-off', 'safe', 1), D('svc-unistore-off', 'safe', 1),
      D('svc-wallet-off', 'safe', 1),
      R('svc-geo-off', 'safe', 1, { t: 'Disable location services', d: 'System location backend off.' }),
    ],
  },
  {
    id: 'caution', title: 'CAUTION SERVICES',
    note: 'Break features — only disable hardware you positively do not use.',
    rows: [
      D('svc-btavctp-off', 'caution', 2), D('svc-cbdhsvc-off', 'caution', 2),
      D('svc-sessionenv-off', 'caution', 2), D('svc-umrdp-off', 'caution', 2),
      D('svc-sstp-off', 'caution', 2),
    ],
  },
];

/* services:list payload: refs stay skeletal (renderer resolves titles from
 * the tweak catalog + row overrides); new ids carry full meta + modal. */
function listPayload() {
  return SECTIONS.map((s) => ({
    id: s.id,
    title: s.title,
    note: s.note || null,
    rows: s.rows.map((r) => {
      if (r.ref) return { id: r.ref, badge: r.badge, impact: r.impact, t: r.t || null, d: r.d || null, danger: !!r.danger, check: r.check || null };
      const def = DEFS[r.def];
      if (!def) return null;
      return {
        id: def.id, t: def.t, d: def.d, m: modalFor(def),
        badge: r.badge, impact: r.impact,
        danger: !!def.danger, check: def.check || null,
      };
    }).filter(Boolean),
  }));
}

module.exports = { SECTIONS, DEFS, modalFor, listPayload };
