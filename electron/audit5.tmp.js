'use strict';
// FULL audit: modules load, registry<->catalog, FREE/BASE/EXTREME parity,
// preset validity, UI render coverage, tier counts for the pricing panel.
const fs = require('node:fs');
let fails = 0;
const check = (cond, msg) => { if (!cond) { console.log('FAIL:', msg); fails++; } else console.log('ok:', msg); };

for (const f of fs.readdirSync('core')) {
  if (!f.endsWith('.js')) continue;
  try { require('./core/' + f); }
  catch (e) { console.log('LOAD FAIL:', f, '-', e.message); fails++; }
}

const main = fs.readFileSync('main.js', 'utf8');
const app = fs.readFileSync('renderer/app.js', 'utf8');
const reg = new Set([...main.matchAll(/'([a-z0-9-]+)':\s*\w+\.\w+/g)].map((m) => m[1]));
const cat = new Set([...app.matchAll(/'([a-z0-9-]+)':\s*\{/g)].map((m) => m[1]));
check(reg.size === cat.size && [...reg].every((x) => cat.has(x)) && [...cat].every((x) => reg.has(x)), `registry<->catalog (${reg.size}/${cat.size})`);

const setOf = (src, name) => new Set([...src.match(new RegExp(name + ' = new Set\\(\\[([\\s\\S]*?)\\]\\)'))[1].matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]));
for (const name of ['BASE_TWEAKS', 'EXTREME_TWEAKS']) {
  const a = setOf(main, name);
  const b = new Set([...app.match(new RegExp(name.replace('TWEAKS', 'IDS') + ' = new Set\\(\\[([\\s\\S]*?)\\]\\)'))[1].matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]));
  check(a.size === b.size && [...a].every((x) => b.has(x)), `${name} parity (${a.size})`);
  check([...a].every((x) => reg.has(x)), `${name} all executable`);
}
const freeMain = new Set([...main.match(/FREE_TWEAKS = new Set\(\[([\s\S]*?)\]\)/)[1].matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]));
const freeCat = new Set([...app.matchAll(/'([a-z0-9-]+)':\s*\{\s*free:\s*true/g)].map((m) => m[1]));
check(JSON.stringify([...freeMain].sort()) === JSON.stringify([...freeCat].sort()), `free parity (${freeMain.size})`);
// tier sets must not overlap each other or FREE
const baseM = setOf(main, 'BASE_TWEAKS');
const extM = setOf(main, 'EXTREME_TWEAKS');
check(
  [...baseM].every((x) => !freeMain.has(x) && !extM.has(x)) && [...extM].every((x) => !freeMain.has(x)),
  'tier sets disjoint'
);

const presets = require('./core/presets').list();
for (const p of presets) check(p.ids.every((id) => reg.has(id)), `preset '${p.id}' (${p.ids.length})`);

// UI render coverage: every id passed to renderTweaks must exist in catalog.
const rendered = new Set();
for (const f of fs.readdirSync('renderer/tabs')) {
  if (!f.endsWith('.js')) continue;
  const src = fs.readFileSync('renderer/tabs/' + f, 'utf8');
  // collect ids inside renderTweaks(...) calls and array literals of tweak ids
  for (const m of src.matchAll(/'([a-z]+-[a-z0-9-]+)'/g)) rendered.add(m[1]);
}
const renderedTweaks = [...rendered].filter((id) => cat.has(id) || reg.has(id));
const renderedUnknown = [...rendered].filter((id) => !cat.has(id) && !reg.has(id) && !['pro-tag', 'free-tag', 'os-tag', 'startup-row', 'file-row', 'tweak-card', 'tweak-list', 'nav-item'].includes(id));
check(renderedUnknown.length === 0, renderedUnknown.length ? `unknown rendered ids: ${renderedUnknown.join(',')}` : 'all rendered ids known');
const unrendered = [...reg].filter((id) => ![...rendered].includes(id));
console.log(`rendered tweak ids: ${renderedTweaks.length}, never rendered in any tab: ${unrendered.length ? unrendered.join(',') : 'none'}`);

// tier counts for the pricing panel
const t = (id) => freeMain.has(id) ? 0 : baseM.has(id) ? 1 : extM.has(id) ? 3 : 2;
const c = [0, 0, 0, 0];
[...reg].forEach((id) => c[t(id)]++);
console.log(`TIER COUNTS: total=${reg.size} free=${c[0]} base=${c[1]} pro=${c[2]} extreme=${c[3]} | cumBase=${c[0] + c[1]} cumPro=${c[0] + c[1] + c[2]}`);
console.log(fails ? `${fails} FAILURES` : 'STATIC AUDIT PASSED');
process.exit(fails ? 1 : 0);
