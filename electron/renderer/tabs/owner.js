'use strict';
/* Owner tab (owner role + passphrase — the sidebar button is hidden
 * otherwise, and every IPC call re-checks the role in main.js).
 * The passphrase gate: opening this tab asks for the device passphrase
 * (created on first open). Verified once per app session, then cached in
 * memory only — a restart asks again. */
(function () {
  const TT = window.TT;
  const $ = (id) => document.getElementById(id);
  let unlockedThisSession = false;

  /* Returns true once the viewer has proven the passphrase this session. */
  async function gate() {
    if (unlockedThisSession) return true;
    let has;
    try { has = await TT.api.owner.hasPassphrase(); }
    catch (e) { TT.toast('Owner check failed.', 'error'); TT.switchTab('dashboard'); return false; }
    if (!has || !has.ok) {
      TT.toast((has && has.message) || 'Owner only.', 'error');
      TT.switchTab('dashboard');
      return false;
    }
    if (!has.set) {
      // First run: create the passphrase (entered twice, never echoed).
      const p1 = await TT.confirm({
        title: 'Create owner passphrase',
        body: 'This passphrase guards the Owner panel on top of your login.\nEnter a new one (4+ characters):',
        input: { placeholder: 'New passphrase', password: true },
        okText: 'Next',
      });
      if (p1 === null || p1.length < 4) {
        if (p1 !== null) TT.toast('Passphrase must be 4+ characters.', 'error');
        TT.switchTab('dashboard');
        return false;
      }
      const p2 = await TT.confirm({
        title: 'Create owner passphrase',
        body: 'Repeat it to confirm:',
        input: { placeholder: 'Repeat passphrase', password: true },
        okText: 'Set passphrase',
      });
      if (p2 === null || p1 !== p2) {
        if (p2 !== null) TT.toast('Passphrases do not match.', 'error');
        TT.switchTab('dashboard');
        return false;
      }
      const r = await TT.api.owner.setPassphrase(p1).catch((e) => ({ ok: false, message: String(e) }));
      if (!r || !r.ok) {
        TT.toast((r && r.message) || 'Could not set passphrase.', 'error');
        TT.switchTab('dashboard');
        return false;
      }
      TT.toast('Owner passphrase set. 🔐', 'gold');
      unlockedThisSession = true;
      return true;
    }
    const p = await TT.confirm({
      title: 'Owner panel locked 🔐',
      body: 'Enter the owner passphrase:',
      input: { placeholder: 'Passphrase', password: true },
      okText: 'Unlock',
    });
    if (p === null) { TT.switchTab('dashboard'); return false; }
    const r = await TT.api.owner.verifyPassphrase(p).catch(() => ({ ok: false }));
    if (!r || !r.ok) {
      TT.toast('Wrong passphrase.', 'error');
      TT.switchTab('dashboard');
      return false;
    }
    unlockedThisSession = true;
    return true;
  }

  async function refresh() {
    const box = $('owner-users');
    box.innerHTML = '<div class="spinner"></div>';
    let res;
    try { res = await TT.api.auth.list(); }
    catch (e) { res = { ok: false, message: String(e) }; }
    box.innerHTML = '';
    if (!res || !res.ok) {
      box.innerHTML = '<p class="dim">' + ((res && res.message) || 'Owner only.') + '</p>';
      return;
    }
    const users = res.users || [];
    TT.countUp($('owner-user-count'), users.length, {});
    TT.countUp($('owner-pro-count'), users.filter((u) => u.pro).length, {});
    users.forEach((u) => {
      const row = document.createElement('div');
      row.className = 'startup-row';
      const info = document.createElement('div');
      info.className = 'info';
      const b = document.createElement('b');
      const ut = (typeof u.tier === 'number') ? u.tier : 0;
      b.textContent = u.username + (ut >= 2 ? '  👑' : '');
      const small = document.createElement('small');
      small.textContent = `${u.role} · ${(TT.TIER_NAMES[ut] || 'Free')}${ut > 0 ? ` ($${TT.TIER_PRICES[ut]})` : ''} · created ${(u.createdAt || '').slice(0, 10) || '?'}` +
        (u.activatedAt ? ` · active since ${u.activatedAt.slice(0, 10)}` : '');
      info.append(b, small);
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = u.role.toUpperCase();

      const roleBtn = document.createElement('button');
      roleBtn.className = 'btn secondary';
      roleBtn.style.cssText = 'padding:7px 12px;font-size:12px';
      roleBtn.textContent = u.role === 'owner' ? 'Demote' : 'Make owner';
      roleBtn.onclick = async () => {
        const next = u.role === 'owner' ? 'user' : 'owner';
        const ok = await TT.confirm({
          title: `${next === 'owner' ? 'Promote' : 'Demote'} '${u.username}'?`,
          body: next === 'owner'
            ? `'${u.username}' will be able to manage all accounts.`
            : `'${u.username}' will lose access to this Owner panel.`,
          okText: next === 'owner' ? 'Promote' : 'Demote',
        });
        if (!ok) return;
        const r = await TT.api.auth.setRole(u.username, next).catch((e) => ({ ok: false, message: String(e) }));
        TT.toast((r && r.message) || '', r && r.ok ? 'success' : 'error', 4000);
        refresh();
      };

      const pwBtn = document.createElement('button');
      pwBtn.className = 'btn secondary';
      pwBtn.style.cssText = 'padding:7px 12px;font-size:12px';
      pwBtn.textContent = 'Reset PW';
      pwBtn.onclick = async () => {
        const nw = await TT.confirm({
          title: `Reset password for '${u.username}'?`,
          body: 'Enter a new password (4+ characters). Tell it to them securely.',
          input: { placeholder: 'New password', password: true },
          okText: 'Reset',
        });
        if (nw === null) return;
        const r = await TT.api.auth.resetPassword(u.username, nw).catch((e) => ({ ok: false, message: String(e) }));
        TT.toast((r && r.message) || '', r && r.ok ? 'success' : 'error', 4000);
      };

      const delBtn = document.createElement('button');
      delBtn.className = 'btn danger';
      delBtn.style.cssText = 'padding:7px 12px;font-size:12px';
      delBtn.textContent = 'Delete';
      delBtn.onclick = async () => {
        const ok = await TT.confirm({
          title: `Delete '${u.username}'?`,
          body: 'Their account is removed from this PC. Their tweak backups in Restore stay put.',
          okText: 'Delete',
        });
        if (!ok) return;
        const r = await TT.api.auth.deleteUser(u.username).catch((e) => ({ ok: false, message: String(e) }));
        TT.toast((r && r.message) || '', r && r.ok ? 'success' : 'error', 4000);
        refresh();
      };

      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:8px';
      actions.append(roleBtn, pwBtn, delBtn);
      row.append(info, badge, actions);
      box.appendChild(row);
    });
  }

  // Lazy + gated: passphrase first, user list only after.
  TT._show.owner = async () => {
    if (await gate()) refresh();
  };
})();
