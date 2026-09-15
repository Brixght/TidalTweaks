'use strict';
/* Profiles tab (Free tab, per-profile tiers): 12 prebuilt game cards grouped
 * under category headers with counts, plus customs. Apply runs one restore
 * point + one undo; Auto-apply watches processes and reverts on exit;
 * Duplicate/Export/Share/Import/Redeem move profiles as JSON or self-
 * contained TT1P- codes (paste = exact profile, no server involved). */
(function () {
  const TT = window.TT;
  const $ = (id) => document.getElementById(id);
  const api = () => TT.api.profiles;

  const CAT_ORDER = ['FPS', 'Battle Royale', 'Sandbox', 'Racing', 'MOBA', 'Custom'];
  let profiles = [];

  function tierBadge(tier) {
    const s = document.createElement('span');
    if (tier === 0) { s.className = 'free-tag'; s.textContent = 'FREE'; }
    else if (tier === 1) { s.className = 'tier-tag tier-base'; s.textContent = 'BASE'; }
    else if (tier === 3) { s.className = 'tier-tag tier-extreme'; s.textContent = 'EXTREME'; }
    else { s.className = 'pro-tag'; s.textContent = 'PRO'; }
    return s;
  }

  function extrasLine(p) {
    const bits = [];
    if (p.priority) bits.push(`priority ${p.priority}`);
    if (p.hags) bits.push('HAGS');
    if (p.power) bits.push(p.power);
    if (p.crosshair) bits.push(`crosshair ${p.crosshair.shape}`);
    if (p.potato) bits.push(`potato:${p.potato}`);
    if (p.launchOptions) bits.push('launch options');
    return bits.join(' · ');
  }

  function render() {
    const box = $('prof-list');
    if (!box) return;
    box.innerHTML = '';
    if (!profiles.length) {
      box.innerHTML = '<p class="dim">No profiles found.</p>';
      return;
    }
    CAT_ORDER.forEach((cat) => {
      const items = profiles.filter((p) => (p.category || 'Custom') === cat);
      if (!items.length) return;
      const head = document.createElement('div');
      head.className = 'prof-cat-head';
      head.innerHTML = `<b>${cat}</b><span class="badge">${items.length}</span>`;
      box.appendChild(head);
      const grid = document.createElement('div');
      grid.className = 'prof-grid';
      items.forEach((p) => grid.appendChild(card(p)));
      box.appendChild(grid);
    });
  }

  function card(p) {
    const el = document.createElement('div');
    el.className = 'prof-card';
    const top = document.createElement('div');
    top.className = 'prof-top';
    const icon = document.createElement('span');
    icon.className = 'prof-icon';
    icon.textContent = p.icon || '🎮';
    const name = document.createElement('b');
    name.textContent = p.name + ' ';
    name.appendChild(tierBadge(p.tier || 0));
    if (p.auto) {
      const a = document.createElement('span');
      a.className = 'os-tag';
      a.textContent = 'AUTO';
      a.title = 'Auto-applies when the game launches';
      name.append(' ', a);
    }
    top.append(icon, name);
    const meta = document.createElement('p');
    meta.className = 'dim';
    meta.textContent = `${(p.tweaks || []).length} tweaks${p.processes && p.processes.length ? ` · watches ${p.processes[0]}` : ''}`;
    const details = document.createElement('div');
    details.className = 'prof-details';
    details.hidden = true;
    const chips = document.createElement('div');
    chips.className = 'pot-settings';
    (p.tweaks || []).forEach((t) => {
      const c = document.createElement('span');
      c.className = 'pot-chip';
      c.textContent = t;
      chips.appendChild(c);
    });
    details.appendChild(chips);
    const ex = extrasLine(p);
    if (ex) {
      const e = document.createElement('p');
      e.className = 'dim';
      e.textContent = 'Extras: ' + ex;
      details.appendChild(e);
    }
    if (p.launchOptions) {
      const row = document.createElement('div');
      row.className = 'row';
      const code = document.createElement('code');
      code.className = 'prof-code';
      code.textContent = p.launchOptions;
      const copy = document.createElement('button');
      copy.className = 'ch-mini-btn';
      copy.textContent = 'Copy';
      copy.onclick = async (e) => {
        e.stopPropagation();
        try { await navigator.clipboard.writeText(p.launchOptions); TT.toast('Launch options copied.', 'success', 2500); }
        catch (err) { TT.toast('Copy manually: ' + p.launchOptions, '', 5000); }
      };
      row.append(code, copy);
      details.appendChild(row);
    }
    const actions = document.createElement('div');
    actions.className = 'prof-actions';
    const more = document.createElement('button');
    more.className = 'ch-mini-btn';
    more.textContent = 'Details';
    more.onclick = () => { details.hidden = !details.hidden; };
    const apply = document.createElement('button');
    apply.className = 'btn primary';
    apply.textContent = 'Apply';
    apply.onclick = () => applyProfile(p);
    const revert = document.createElement('button');
    revert.className = 'ch-mini-btn';
    revert.textContent = 'Revert';
    revert.title = 'Undo this profile';
    revert.onclick = async () => {
      const r = await api().revert(p.id).catch((e) => ({ ok: false, message: String(e) }));
      TT.toast((r && r.message) || 'Nothing to revert.', r && r.ok ? 'success' : '', 4500);
    };
    actions.append(more, apply, revert);
    // Auto-apply toggle (needs watchable processes).
    if (p.processes && p.processes.length) {
      const lab = document.createElement('label');
      lab.className = 'toggle';
      lab.title = `Auto-apply when ${p.processes[0]} launches`;
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!p.auto;
      cb.onchange = async () => {
        const r = await api().setAuto(p.id, cb.checked).catch((e) => ({ ok: false, message: String(e) }));
        if (r && r.ok) {
          p.auto = cb.checked;
          TT.toast(cb.checked ? `Auto-apply on for ${p.name}.` : `Auto-apply off for ${p.name}.`, 'success', 2500);
          render();
        } else {
          cb.checked = !cb.checked;
          TT.toast((r && r.message) || 'Failed.', 'error', 4000);
        }
      };
      const track = document.createElement('span');
      track.className = 'track';
      lab.append(cb, track);
      actions.appendChild(lab);
    }
    const share = document.createElement('button');
    share.className = 'ch-mini-btn';
    share.textContent = 'Share';
    share.title = 'Get a share code for this profile';
    share.onclick = () => shareProfile(p);
    const exp = document.createElement('button');
    exp.className = 'ch-mini-btn';
    exp.textContent = 'Export';
    exp.title = 'Download as JSON';
    exp.onclick = () => exportProfile(p);
    actions.append(share, exp);
    if (p.custom) {
      const dup = document.createElement('button');
      dup.className = 'ch-mini-btn';
      dup.textContent = 'Duplicate';
      dup.onclick = () => duplicateProfile(p);
      const del = document.createElement('button');
      del.className = 'ch-mini-btn danger';
      del.textContent = '✕';
      del.title = 'Delete custom profile';
      del.onclick = () => deleteProfile(p);
      actions.append(dup, del);
    } else {
      const dup = document.createElement('button');
      dup.className = 'ch-mini-btn';
      dup.textContent = 'Duplicate';
      dup.title = 'Copy as a custom starting point';
      dup.onclick = () => duplicateProfile(p);
      actions.appendChild(dup);
    }
    el.append(top, meta, details, actions);
    return el;
  }

  async function applyProfile(p) {
    const need = p.tierName && p.tierName !== 'Free' ? ` (needs ${p.tierName})` : '';
    const ok = await TT.confirm({
      title: `Apply ${p.name}?`,
      body: `${(p.tweaks || []).length} tweaks${need} + runtime extras.\nOne restore point, one undo entry.\n${p.launchOptions ? 'Launch options are shown on the card (copy them into your launcher).' : ''}`,
      okText: 'Apply profile',
    });
    if (!ok) return;
    TT.toast(`Applying ${p.name}…`, '', 2500);
    let r;
    try { r = await api().apply(p.id); }
    catch (e) { r = { ok: false, message: String(e) }; }
    if (r && r.ok) {
      TT.toast(r.message || 'Applied.', 'success', 4500);
      if (window.TT && window.TT.refreshRestore) window.TT.refreshRestore();
    } else {
      TT.toast((r && r.message) || 'Failed.', 'error', 6000);
    }
  }

  async function duplicateProfile(p) {
    const name = await TT.confirm({
      title: 'Duplicate profile', body: 'Name the copy:',
      input: { placeholder: `${p.name} (copy)`, value: `${p.name} (copy)` }, okText: 'Duplicate',
    });
    if (name === null || !String(name).trim()) return;
    const base = 'custom-' + p.id.replace(/^custom-/, '').replace(/[^a-z0-9-]/g, '').slice(0, 28);
    const r = await api().create({
      profile: {
        id: base, name: String(name).trim().slice(0, 40), category: 'Custom',
        icon: p.icon || '🎮', processes: p.processes || [], tweaks: p.tweaks || [],
        priority: p.priority || null, hags: !!p.hags,
        power: p.power || null, crosshair: p.crosshair || null, potato: p.potato || null,
        launchOptions: p.launchOptions || '',
      },
    }).catch((e) => ({ ok: false, message: String(e) }));
    TT.toast((r && r.message) || 'Failed.', r && r.ok ? 'success' : 'error', 4000);
    if (r && r.ok) refresh();
  }

  async function deleteProfile(p) {
    const ok = await TT.confirm({ title: `Delete “${p.name}”?`, body: 'The custom profile will be removed.', okText: 'Delete' });
    if (!ok) return;
    const r = await api().remove(p.id).catch((e) => ({ ok: false, message: String(e) }));
    TT.toast((r && r.message) || 'Failed.', r && r.ok ? 'success' : 'error', 4000);
    if (r && r.ok) refresh();
  }

  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  async function exportProfile(p) {
    const r = await api().exportJson(p.id).catch((e) => ({ ok: false, message: String(e) }));
    if (r && r.ok) {
      download(`${p.id}.json`, r.json, 'application/json');
      TT.toast('Profile exported as JSON.', 'success', 3000);
    } else TT.toast((r && r.message) || 'Failed.', 'error', 4000);
  }

  async function shareProfile(p) {
    const r = await api().encode(p.id).catch((e) => ({ ok: false, message: String(e) }));
    if (!r || !r.ok) { TT.toast((r && r.message) || 'Failed.', 'error', 4000); return; }
    try { await navigator.clipboard.writeText(r.code); TT.toast('Share code copied — send it to a friend.', 'success', 3500); }
    catch (e) { /* fall through to manual copy */ }
    await TT.confirm({ title: `Share ${p.name}`, body: `Paste this code to a friend — they redeem it for the exact profile (no server involved):\n\n${r.code}`, okText: 'Done' });
  }

  async function createProfile() {
    const name = await TT.confirm({
      title: 'New custom profile', body: 'Name (2–40 chars):',
      input: { placeholder: 'e.g. My Warzone pack', value: '' }, okText: 'Next',
    });
    if (name === null || !String(name).trim()) return;
    const category = await TT.confirm({
      title: 'New custom profile', body: 'Category (FPS, Battle Royale, Sandbox, Racing, MOBA, Custom):',
      input: { placeholder: 'Custom', value: 'Custom' }, okText: 'Next',
    });
    if (category === null) return;
    const tweaks = await TT.confirm({
      title: 'New custom profile', body: 'Tweak ids, comma-separated (e.g. game-bar-off, game-mode-win-on, net-flush-dns). Unknown ids are rejected:',
      input: { placeholder: 'game-bar-off, net-flush-dns', value: '' }, okText: 'Create',
    });
    if (tweaks === null) return;
    const id = 'custom-' + String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 28);
    const r = await api().create({
      profile: {
        id: id || 'custom-pack', name: String(name).trim().slice(0, 40),
        category: String(category).trim() || 'Custom', icon: '🎮',
        processes: [], tweaks: String(tweaks).split(',').map((s) => s.trim()).filter(Boolean),
      },
    }).catch((e) => ({ ok: false, message: String(e) }));
    TT.toast((r && r.message) || 'Failed.', r && r.ok ? 'success' : 'error', 4500);
    if (r && r.ok) refresh();
  }

  async function importProfile() {
    const json = await TT.confirm({
      title: 'Import profile', body: 'Paste an exported profile JSON:',
      input: { placeholder: '{"id": …}', value: '' }, okText: 'Import',
    });
    if (json === null || !String(json).trim()) return;
    const r = await api().importJson(String(json)).catch((e) => ({ ok: false, message: String(e) }));
    TT.toast((r && r.message) || 'Failed.', r && r.ok ? 'success' : 'error', 5000);
    if (r && r.ok) refresh();
  }

  async function redeemCode() {
    const code = await TT.confirm({
      title: 'Redeem share code', body: 'Paste a TT1P- share code:',
      input: { placeholder: 'TT1P-…', value: '' }, okText: 'Preview',
    });
    if (code === null || !String(code).trim()) return;
    const r = await api().decode(String(code)).catch((e) => ({ ok: false, message: String(e) }));
    if (!r || !r.ok) { TT.toast((r && r.message) || 'Bad code.', 'error', 4500); return; }
    const p = r.profile;
    const save = await TT.confirm({
      title: `Save “${p.name}”?`,
      body: `${(p.tweaks || []).length} tweaks · ${(p.category || 'Custom')}${(r.unknown || []).length ? `\n⚠ Unknown on this version (skipped on import): ${(r.unknown || []).join(', ')}` : ''}`,
      okText: 'Save profile',
    });
    if (!save) return;
    const r2 = await api().importJson(p).catch((e) => ({ ok: false, message: String(e) }));
    TT.toast((r2 && r2.message) || 'Failed.', r2 && r2.ok ? 'success' : 'error', 5000);
    if (r2 && r2.ok) refresh();
  }

  async function refresh() {
    try {
      const r = await api().list();
      if (r && r.ok && Array.isArray(r.profiles)) profiles = r.profiles;
    } catch (e) { /* main unreachable */ }
    render();
  }

  function wire() {
    $('prof-create').onclick = createProfile;
    $('prof-import').onclick = importProfile;
    $('prof-redeem').onclick = redeemCode;
  }

  TT._show.profiles = async () => {
    try { await TT.refreshLicense(false); } catch (e) { /* best-effort */ }
    await refresh();
  };
  wire();
  refresh();
})();
