'use strict';
/* ============================================================================
 * core/license.js — OFFLINE signed-code activation (no server, no Cloudflare).
 * ----------------------------------------------------------------------------
 * Code format:  TT1-<TIER>-<RANDOM10>-<SIG86>
 *   e.g.  TT1-PRO-K7D2PQ9X4M-8fJ3hK6qW2rT5vZ9p1d4C7bXaYcDeFgHiJkLmNoPqRsTuVwXyZ0123456789ab==
 * (real ones are paste-only from a Discord DM — nobody types these.)
 * The signature is a FULL Ed25519("TIER|RANDOM") in base64url. Forging one
 * without the PRIVATE key is computationally infeasible; the public key below
 * can only verify, never create. Truncated signatures were deliberately NOT
 * used — standard verify() cannot check a partial signature, and anything
 * custom-built here would be weaker than just shipping the full 86 chars.
 *
 * Single-use is enforced per machine: SHA-256 hashes of claimed codes live
 * in the local license store. Honest limit (documented to the seller): two
 * offline PCs can't compare notes, so a buyer who manually shares their code
 * could activate a second machine. $5–30 instant-delivery goods: accepted risk.
 *
 * The PRIVATE key lives ONLY in the seller's Documents folder + the mint
 * script (scripts/mint-codes.js). It must NEVER enter this repo.
 * ========================================================================== */
const crypto = require('node:crypto');
const Store = require('electron-store');

const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAI0D//NN+QloWzut3BlO/8Zuy60mqUa2V/ra49vPKe00=
-----END PUBLIC KEY-----`;

const TIERS = { BASE: 1, PRO: 2, EXTREME: 3 };
const CODE_RE = /^TT1-(BASE|PRO|EXTREME)-([A-Z2-9]{10})-([A-Za-z0-9_-]{86})$/;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // unambiguous, no 0/O/1/I/L

// Overridable used-code store (unit tests inject a fake; default = real file).
let _store = null;
function usedStore() {
  if (_store) return _store;
  _store = new Store({ name: 'license', defaults: { claimed: [] } });
  return _store;
}
function setUsedStore(s) { _store = s; } // tests only

function sha256hex(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

/** Normalize pasted input: whitespace stripped. NOTE: case is preserved —
 * base64url signatures are case-SENSITIVE; uppercasing happens per-segment
 * inside verifyCode (prefix/tier/random only, never the signature). */
function normalize(input) {
  return String(input || '').replace(/\s+/g, '');
}

/** Parse + cryptographically verify (no side effects). */
function verifyCode(input) {
  const clean = normalize(input);
  if (!clean) return { ok: false, message: 'Please paste a code first.' };
  const m = /^TT1-([A-Za-z]+)-([A-Za-z0-9]+)-([A-Za-z0-9_-]+)$/i.exec(clean);
  if (!m) return { ok: false, message: 'Invalid code format.' };
  const tierName = m[1].toUpperCase();
  const random = m[2].toUpperCase();
  const sigB64u = m[3]; // case preserved — signatures are case-sensitive
  if (!TIERS[tierName] || !/^[A-Z2-9]{10}$/.test(random) || !/^[A-Za-z0-9_-]{86}$/.test(sigB64u)) {
    return { ok: false, message: 'Invalid code format.' };
  }
  let sigBytes;
  try {
    sigBytes = Buffer.from(sigB64u.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  } catch {
    return { ok: false, message: 'Invalid code format.' };
  }
  if (sigBytes.length !== 64) return { ok: false, message: 'Invalid code format.' };
  let authentic = false;
  try {
    authentic = crypto.verify(
      null,
      Buffer.from(`${tierName}|${random}`, 'utf8'),
      crypto.createPublicKey(PUBLIC_KEY_PEM),
      sigBytes
    );
  } catch {
    authentic = false;
  }
  if (!authentic) return { ok: false, message: 'Invalid or forged code.' };
  const claimed = usedStore().get('claimed') || [];
  if (claimed.includes(sha256hex(clean))) {
    return { ok: false, message: 'This code was already used on this PC.' };
  }
  return { ok: true, tier: TIERS[tierName], tierName, code: clean };
}

/** Verify + attach tier to the account + burn the code locally. */
function claimCode(input, username) {
  const v = verifyCode(input);
  if (!v.ok) return v;
  const users = require('./users');
  const r = users.setTier(username, v.tier, v.code);
  if (!r.ok) return r;
  const store = usedStore();
  const claimed = store.get('claimed') || [];
  claimed.push(sha256hex(v.code));
  store.set('claimed', claimed);
  return { ok: true, tier: v.tier, message: `${v.tierName} activated for '${username}' — enjoy.` };
}

/** Seller-side minting helper (used by scripts/mint-codes.js). NOT shipped
 *  with secrets — it takes an explicit private-key PEM argument. */
function mintCode(tierName, random, privateKeyPem) {
  const sig = crypto.sign(null, Buffer.from(`${tierName}|${random}`, 'utf8'), crypto.createPrivateKey(privateKeyPem));
  const b64u = sig.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `TT1-${tierName}-${random}-${b64u}`;
}

module.exports = { normalize, verifyCode, claimCode, mintCode, setUsedStore, TIERS, CODE_RE, ALPHABET };
