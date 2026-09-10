'use strict';
/* ============================================================================
 * core/users.js — device-local accounts (sign up / log in / owner roles).
 * ----------------------------------------------------------------------------
 * HONEST SCOPE: these accounts live in users.json inside Electron's userData
 * folder on THIS PC — there is no cloud server yet, so accounts don't roam
 * between machines. That's the right call for now: zero backend to run, zero
 * personal data leaves the device, and the Cash App code flow stays manual.
 * If cloud accounts are ever wanted, swap these functions for fetch() calls
 * to a Worker — the IPC contract in main.js wouldn't have to change shape.
 *
 * Security: passwords are NEVER stored — only scrypt(salt, password) hashes.
 * First registered user becomes owner. A Pro code activates the LOGGED-IN
 * account (not the whole device).
 * ========================================================================== */
const crypto = require('node:crypto');
const Store = require('electron-store');

// Separate file from the app settings store — no key collisions, ever.
const store = new Store({ name: 'users', defaults: { users: [], session: null } });

const USER_RE = /^[A-Za-z0-9_]{3,20}$/; // 3–20 chars, letters/digits/underscore

function hash(pw, salt) {
  return crypto.scryptSync(String(pw), salt, 64).toString('hex');
}
/** Strip secrets before anything crosses IPC to the renderer. Also migrates
 * the pre-rename 'admin' role to 'owner' on read (your existing account
 * keeps working — no data migration needed). */
function safe(u) {
  if (!u) return null;
  return {
    username: u.username, role: u.role === 'admin' ? 'owner' : u.role, pro: !!u.pro,
    activatedAt: u.activatedAt || null, createdAt: u.createdAt || null,
  };
}
const all = () => store.get('users') || [];
const saveAll = (list) => store.set('users', list);
const find = (username) => all().find((u) => u.username.toLowerCase() === String(username || '').toLowerCase());

function signup(username, password) {
  try {
    const name = String(username || '').trim();
    const pw = String(password || '');
    if (!USER_RE.test(name)) return { ok: false, message: 'Username: 3–20 chars, letters/numbers/underscore.' };
    if (pw.length < 4) return { ok: false, message: 'Password must be at least 4 characters.' };
    if (find(name)) return { ok: false, message: 'That username is taken.' };
    const list = all();
    const salt = crypto.randomBytes(16).toString('hex');
    const user = {
      username: name, salt, hash: hash(pw, salt),
      role: list.length === 0 ? 'owner' : 'user', // first account owns the device
      pro: false, code: null, activatedAt: null,
      createdAt: new Date().toISOString(),
    };
    list.push(user);
    saveAll(list);
    store.set('session', user.username); // sign straight in
    return { ok: true, user: safe(user), first: user.role === 'owner' };
  } catch (e) { return { ok: false, message: String(e) }; }
}

function login(username, password) {
  try {
    const u = find(username);
    if (!u) return { ok: false, message: 'Unknown username.' };
    const digest = hash(password, u.salt);
    // timingSafeEqual so failed logins don't leak hash prefixes by timing.
    const a = Buffer.from(digest, 'hex');
    const b = Buffer.from(u.hash, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { ok: false, message: 'Wrong password.' };
    }
    store.set('session', u.username);
    return { ok: true, user: safe(u) };
  } catch (e) { return { ok: false, message: String(e) }; }
}

function logout() {
  store.set('session', null);
  return { ok: true };
}

function session() {
  const name = store.get('session');
  return safe(find(name));
}

/** Admin-only reads/writes below. main.js checks the requester's role first. */
function list() {
  return { ok: true, users: all().map(safe) };
}

function setRole(username, role) {
  const list = all();
  const u = list.find((x) => x.username.toLowerCase() === String(username || '').toLowerCase());
  if (!u) return { ok: false, message: 'User not found.' };
  if (!['owner', 'user'].includes(role)) return { ok: false, message: 'Role must be owner or user.' };
  if (u.role === 'owner' && role !== 'owner') {
    const owners = list.filter((x) => x.role === 'owner').length;
    if (owners <= 1) return { ok: false, message: 'Cannot demote the last owner.' };
  }
  u.role = role;
  saveAll(list);
  return { ok: true, message: `'${u.username}' is now ${role}.` };
}

function resetPassword(username, newPw) {
  const list = all();
  const u = list.find((x) => x.username.toLowerCase() === String(username || '').toLowerCase());
  if (!u) return { ok: false, message: 'User not found.' };
  if (String(newPw || '').length < 4) return { ok: false, message: 'New password must be 4+ characters.' };
  u.salt = crypto.randomBytes(16).toString('hex');
  u.hash = hash(newPw, u.salt);
  saveAll(list);
  return { ok: true, message: `Password reset for '${u.username}'.` };
}

function deleteUser(username, requester) {
  const list = all();
  const idx = list.findIndex((x) => x.username.toLowerCase() === String(username || '').toLowerCase());
  if (idx < 0) return { ok: false, message: 'User not found.' };
  if (list[idx].username.toLowerCase() === String(requester || '').toLowerCase()) {
    return { ok: false, message: 'You cannot delete your own account.' };
  }
  if (list[idx].role === 'owner' && list.filter((x) => x.role === 'owner').length <= 1) {
    return { ok: false, message: 'Cannot delete the last owner.' };
  }
  list.splice(idx, 1);
  saveAll(list);
  return { ok: true, message: `Deleted '${username}'.` };
}

/* Self-service password change (needs the OLD password — owners resetting
 * someone else's use resetPassword instead). */
function changePassword(username, oldPw, newPw) {
  const list = all();
  const u = list.find((x) => x.username.toLowerCase() === String(username || '').toLowerCase());
  if (!u) return { ok: false, message: 'User not found.' };
  const a = Buffer.from(hash(oldPw, u.salt), 'hex');
  const b = Buffer.from(u.hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, message: 'Current password is wrong.' };
  }
  if (String(newPw || '').length < 4) return { ok: false, message: 'New password must be 4+ characters.' };
  u.salt = crypto.randomBytes(16).toString('hex');
  u.hash = hash(newPw, u.salt);
  saveAll(list);
  return { ok: true, message: 'Password changed.' };
}

/* Attach a validated Pro code to an account (called after KV validation). */
function setPro(username, code) {
  const list = all();
  const u = list.find((x) => x.username.toLowerCase() === String(username || '').toLowerCase());
  if (!u) return { ok: false, message: 'User not found.' };
  u.pro = true;
  u.code = code;
  u.activatedAt = new Date().toISOString();
  saveAll(list);
  return { ok: true, user: safe(u) };
}

module.exports = {
  signup, login, logout, session, list, setRole,
  resetPassword, deleteUser, changePassword, setPro, clearPro,
  ownerHasPass, ownerSetPass, ownerVerifyPass,
};

/* ============================================================================
 * Owner-panel passphrase: a second lock on the Owner panel itself, on top of
 * the account login. Device-wide (one owner secret per PC), scrypt-hashed —
 * the plaintext is never stored. The renderer caches verification for the
 * app session, so it asks once per launch, not once per click.
 * Forgot it? Delete the "ownerPass" key from users.json in Electron's
 * userData folder and you'll be asked to create a new one. (Local lock,
 * local recovery — there is no server to get locked out of.)
 * ========================================================================== */
function ownerHasPass() {
  return { ok: true, set: !!store.get('ownerPass') };
}

function ownerSetPass(pass) {
  const pw = String(pass || '');
  if (pw.length < 4) return { ok: false, message: 'Passphrase must be 4+ characters.' };
  const salt = crypto.randomBytes(16).toString('hex');
  store.set('ownerPass', { salt, hash: hash(pw, salt) });
  return { ok: true, message: 'Owner passphrase set.' };
}

function ownerVerifyPass(pass) {
  const saved = store.get('ownerPass');
  if (!saved) return { ok: false, message: 'No passphrase set yet.' };
  try {
    const a = Buffer.from(hash(pass, saved.salt), 'hex');
    const b = Buffer.from(saved.hash, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { ok: false, message: 'Wrong passphrase.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: 'Wrong passphrase.' };
  }
}

/* Remove Pro from an account (Settings → Deactivate). */
function clearPro(username) {
  const list = all();
  const u = list.find((x) => x.username.toLowerCase() === String(username || '').toLowerCase());
  if (!u) return { ok: false, message: 'User not found.' };
  u.pro = false;
  u.code = null;
  u.activatedAt = null;
  saveAll(list);
  return { ok: true };
}
