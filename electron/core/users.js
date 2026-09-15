'use strict';
/* ============================================================================
 * core/users.js — device-local accounts (sign up / log in / owner roles).
 * ----------------------------------------------------------------------------
 * HONEST SCOPE: these accounts live in users.json inside Electron's userData
 * folder on THIS PC — there is no cloud server yet, so accounts don't roam
 * between machines. That's the right call for now: zero backend to run, zero
 * personal data leaves the device, and the Cash App code flow stays manual.
 * If cloud accounts are ever wanted, swap these functions for API calls
 * to a Worker — the IPC contract in main.js wouldn't have to change shape.
 *
 * Security: passwords are NEVER stored — only scrypt(salt, password) hashes.
 * First registered user becomes owner. A Pro code activates the LOGGED-IN
 * account (not the whole device).
 *
 * Identity is EMAIL-based (login takes email or, for pre-email accounts,
 * the old username). Each account carries a display name, a unique referral
 * code, and local affiliate counters (referralSignups, affiliateBalance).
 * `verified` is a placeholder for the future website email-verification
 * flow — nothing gates on it yet.
 * ========================================================================== */
const crypto = require('node:crypto');
const Store = require('electron-store');

// Separate file from the app settings store — no key collisions, ever.
const store = new Store({ name: 'users', defaults: { users: [], session: null } });

const USER_RE = /^[A-Za-z0-9_]{3,20}$/; // 3–20 chars, letters/digits/underscore
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME_RE = /^[\w .\-']{2,30}$/;
const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // unambiguous, no 0/O/1/I/L

/* Remember-me OFF lives here: an in-memory session that dies with the
 * process, so next launch lands back on the gate. Remember-me ON (default)
 * persists in the store like before. */
let ephemeralSession = null;

function hash(pw, salt) {
  return crypto.scryptSync(String(pw), salt, 64).toString('hex');
}
/** Strip secrets before anything crosses IPC to the renderer. Also migrates
 * the pre-rename 'admin' role to 'owner' on read (your existing account
 * keeps working — no data migration needed). Tier defaults to 0 (Free);
 * legacy boolean pro:true migrates to tier 2 (Pro). */
function safe(u) {
  if (!u) return null;
  const tier = typeof u.tier === 'number' ? u.tier : (u.pro ? 2 : 0);
  return {
    username: u.username, role: u.role === 'admin' ? 'owner' : u.role, tier,
    pro: tier >= 2,
    email: u.email || null,
    displayName: u.displayName || u.username,
    referralCode: u.referralCode || null,
    referralSignups: Number(u.referralSignups) || 0,
    affiliateBalance: Number(u.affiliateBalance) || 0,
    verified: !!u.verified, // future website email verification; ungated
    activatedAt: u.activatedAt || null, createdAt: u.createdAt || null,
  };
}
const all = () => store.get('users') || [];
const saveAll = (list) => store.set('users', list);
const find = (username) => all().find((u) => u.username.toLowerCase() === String(username || '').toLowerCase());
const findByEmail = (email) => all().find((u) => String(u.email || '').toLowerCase() === String(email || '').toLowerCase());
/* Login identifier: email first, then legacy username (pre-email accounts). */
const findByLogin = (id) => findByEmail(id) || find(id);
const findByReferral = (code) => all().find((u) => String(u.referralCode || '').toUpperCase() === String(code || '').trim().toUpperCase());

function genReferralCode(list) {
  for (let tries = 0; tries < 50; tries++) {
    let code = '';
    for (let i = 0; i < 8; i++) code += REF_ALPHABET[crypto.randomInt(REF_ALPHABET.length)];
    if (!list.some((u) => u.referralCode === code)) return code;
  }
  return 'TT' + Date.now().toString(36).toUpperCase().slice(-6);
}

/* Stable internal key derived from the email local-part (old accounts keep
 * their hand-picked usernames — this only runs for new email signups). */
function deriveUsername(email, list) {
  let base = String(email).split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 14) || 'user';
  if (base.length < 3) base = (base + 'user').slice(0, 3);
  const taken = (n) => list.some((u) => u.username.toLowerCase() === n.toLowerCase());
  if (!taken(base) && USER_RE.test(base)) return base;
  for (let i = 2; i < 10000; i++) {
    const cand = `${base}`.slice(0, 15) + i;
    if (!taken(cand)) return cand;
  }
  return `user${Date.now().toString(36)}`;
}

function signup(data) {
  try {
    const d = data || {};
    const displayName = String(d.displayName || '').trim();
    const email = String(d.email || '').trim().toLowerCase();
    const pw = String(d.password || '');
    const refCode = String(d.referralCode || '').trim();
    const remember = d.remember !== false;
    if (!NAME_RE.test(displayName)) return { ok: false, message: 'Display name: 2–30 chars, letters/numbers/spaces.' };
    if (!EMAIL_RE.test(email)) return { ok: false, message: 'Enter a valid email address.' };
    if (pw.length < 4) return { ok: false, message: 'Password must be at least 4 characters.' };
    if (findByEmail(email)) return { ok: false, message: 'That email is already registered — sign in instead.' };
    const list = all();
    // Optional referral: must match a real account's code (no self-use possible — the account doesn't exist yet).
    let referredBy = null;
    if (refCode) {
      const ref = findByReferral(refCode);
      if (!ref) return { ok: false, message: 'Referral code not found — check it and retry, or leave it blank.' };
      referredBy = ref.username;
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const user = {
      username: deriveUsername(email, list), salt, hash: hash(pw, salt),
      email, displayName,
      role: list.length === 0 ? 'owner' : 'user', // first account owns the device
      pro: false, code: null, activatedAt: null,
      referralCode: genReferralCode(list),
      referredBy, referralSignups: 0, affiliateBalance: 0,
      verified: false, // website email verification (future) flips this
      createdAt: new Date().toISOString(),
    };
    list.push(user);
    if (referredBy) {
      const ref = list.find((u) => u.username === referredBy);
      if (ref) ref.referralSignups = (Number(ref.referralSignups) || 0) + 1;
    }
    saveAll(list);
    signInSession(user.username, remember);
    return { ok: true, user: safe(user), first: user.role === 'owner' };
  } catch (e) { return { ok: false, message: String(e) }; }
}

function signInSession(username, remember) {
  if (remember === false) {
    ephemeralSession = username;
    store.set('session', null); // next launch gates again
  } else {
    ephemeralSession = null;
    store.set('session', username);
  }
}

function login(identifier, password, remember) {
  try {
    const u = findByLogin(identifier);
    if (!u) return { ok: false, message: 'No account for that email.' };
    const digest = hash(password, u.salt);
    // timingSafeEqual so failed logins don't leak hash prefixes by timing.
    const a = Buffer.from(digest, 'hex');
    const b = Buffer.from(u.hash, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { ok: false, message: 'Wrong password.' };
    }
    const rem = remember !== false; // default ON — only an explicit false goes ephemeral
    signInSession(u.username, rem);
    return { ok: true, user: safe(u) };
  } catch (e) { return { ok: false, message: String(e) }; }
}

function logout() {
  ephemeralSession = null;
  store.set('session', null);
  return { ok: true };
}

function session() {
  const name = ephemeralSession || store.get('session');
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

/* Attach a validated tier to an account (called after code verification).
 * tier: 1 Base, 2 Pro, 3 Extreme. Upgrades stack upward only — a Pro code
 * never demotes an Extreme account. */
function setTier(username, tier, code) {
  const list = all();
  const u = list.find((x) => x.username.toLowerCase() === String(username || '').toLowerCase());
  if (!u) return { ok: false, message: 'User not found.' };
  const cur = typeof u.tier === 'number' ? u.tier : (u.pro ? 2 : 0);
  const next = Math.max(cur, Math.min(3, Math.max(0, Number(tier) || 0)));
  u.tier = next;
  u.pro = next >= 2; // legacy compat flag (harmless duplicate of tier>=2)
  u.code = code;
  u.activatedAt = new Date().toISOString();
  saveAll(list);
  return { ok: true, user: safe(u) };
}

/* Attach a validated Pro code to an account (called after verification). */
function setPro(username, code) {
  return setTier(username, 2, code);
}

/* Affiliate purchase credit (called after a referred account activates a
 * paid tier). Adds the tier's price to the referrer's local balance and
 * returns the referrer's username for receipts. No referrer → no-op. */
function creditReferrer(username, amount) {
  try {
    const list = all();
    const u = list.find((x) => x.username.toLowerCase() === String(username || '').toLowerCase());
    if (!u || !u.referredBy) return { ok: true, credited: false };
    const ref = list.find((x) => x.username === u.referredBy);
    if (!ref) return { ok: true, credited: false };
    const amt = Number(amount) || 0;
    if (amt <= 0) return { ok: true, credited: false };
    ref.affiliateBalance = (Number(ref.affiliateBalance) || 0) + amt;
    saveAll(list);
    return { ok: true, credited: true, referrer: ref.username, amount: amt };
  } catch (e) { return { ok: false, message: String(e) }; }
}

module.exports = {
  signup, login, logout, session, list, setRole,
  resetPassword, deleteUser, changePassword, setPro, setTier, clearPro,
  creditReferrer, findByLogin, findByEmail,
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

/* Remove Pro from an account (Settings → Deactivate): back to Free (tier 0). */
function clearPro(username) {
  const list = all();
  const u = list.find((x) => x.username.toLowerCase() === String(username || '').toLowerCase());
  if (!u) return { ok: false, message: 'User not found.' };
  u.tier = 0;
  u.pro = false;
  u.code = null;
  u.activatedAt = null;
  saveAll(list);
  return { ok: true };
}
