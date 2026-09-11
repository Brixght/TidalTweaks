'use strict';
/* ============================================================================
 * core/license.js — OFFLINE signed-code activation (no server, no Cloudflare).
 * ----------------------------------------------------------------------------
 * Code format (v2, expiring):  TT1-<TIER>-<EXP6>-<RANDOM10>-<SIG86>
 *   e.g.  TT1-PRO-N9X2KQ-K7D2PQ9X4M-8fJ3hK6qW2rT5vZ9p1d4C7bXaYcDeFgHiJkLmNoPqRsTuVwXyZ0123456789ab
 * EXP = expiry as base36 hours-since-epoch (6 chars ≈ 280k years of range).
 * (real ones are paste-only from a Discord DM — nobody types these.)
 * The signature is a FULL Ed25519("TIER|EXP|RANDOM") in base64url. Forging one
 * without the PRIVATE key is computationally infeasible; the public key below
 * can only verify, never create.
 *
 * Single-use is enforced per machine (claimed-code hashes, local store) AND
 * codes ROT: an expired code fails even if never used — so a shared code has
 * a bounded life instead of living forever. Legacy v1 codes (no EXP segment,
 * `TT1-<TIER>-<RANDOM>-<SIG>`) still verify — old inventory keeps working.
 *
 * Honest limit (documented to the seller): two offline PCs can't compare
 * notes, so a shared code works on a second machine UNTIL IT EXPIRES.
 * Combined with per-device burn + $5–30 instant delivery, that's the maximum
 * offline posture — anything stronger needs a server, full stop.
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

/** Parse + cryptographically verify (no side effects).
 * Accepts v2 (expiring) codes and legacy v1 codes (no expiry segment). */
function verifyCode(input) {
  const clean = normalize(input);
  if (!clean) return { ok: false, message: 'Please paste a code first.' };
  // v2: TT1-TIER-EXP6-RANDOM10-SIG86 · legacy v1: TT1-TIER-RANDOM10-SIG86
  const m = /^TT1-([A-Za-z]+)-([A-Za-z0-9]+)-([A-Za-z0-9]+)-([A-Za-z0-9_-]+)$/i.exec(clean) ||
            /^TT1-([A-Za-z]+)-([A-Za-z0-9]+)-([A-Za-z0-9_-]+)$/i.exec(clean);
  if (!m) return { ok: false, message: 'Invalid code format.' };
  let tierName, expHours, random, sigB64u, signedData;
  if (m.length === 5) {
    tierName = m[1].toUpperCase();
    const exp = m[2].toUpperCase();
    random = m[3].toUpperCase();
    sigB64u = m[4]; // case preserved — signatures are case-sensitive
    if (!TIERS[tierName] || !/^[A-Z0-9]{6}$/.test(exp) || !/^[A-Z2-9]{10}$/.test(random) || !/^[A-Za-z0-9_-]{86}$/.test(sigB64u)) {
      return { ok: false, message: 'Invalid code format.' };
    }
    expHours = parseInt(exp, 36);
    if (Date.now() > expHours * 3600000) {
      const d = new Date(expHours * 3600000).toISOString().slice(0, 10);
      return { ok: false, message: `This code expired on ${d}. Ask the seller for a fresh one.` };
    }
    signedData = `${tierName}|${exp}|${random}`;
  } else {
    tierName = m[1].toUpperCase();
    random = m[2].toUpperCase();
    sigB64u = m[3];
    if (!TIERS[tierName] || !/^[A-Z2-9]{10}$/.test(random) || !/^[A-Za-z0-9_-]{86}$/.test(sigB64u)) {
      return { ok: false, message: 'Invalid code format.' };
    }
    signedData = `${tierName}|${random}`; // legacy v1, no expiry
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
      Buffer.from(signedData, 'utf8'),
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
 *  with secrets — it takes an explicit private-key PEM argument.
 *  expHours = absolute expiry in hours-since-epoch; omit for legacy no-expiry. */
function mintCode(tierName, random, privateKeyPem, expHours) {
  const exp = expHours === undefined ? null : Number(expHours).toString(36).toUpperCase().padStart(6, '0');
  const payload = exp === null ? `${tierName}|${random}` : `${tierName}|${exp}|${random}`;
  const sig = crypto.sign(null, Buffer.from(payload, 'utf8'), crypto.createPrivateKey(privateKeyPem));
  const b64u = sig.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return exp === null
    ? `TT1-${tierName}-${random}-${b64u}`
    : `TT1-${tierName}-${exp}-${random}-${b64u}`;
}

/** Hours-since-epoch N days from now, as 6-char base36 (for --days minting). */
function expiryHours(days) {
  return Math.floor(Date.now() / 3600000) + Math.round(Number(days) || 0) * 24;
}

module.exports = { normalize, verifyCode, claimCode, mintCode, expiryHours, setUsedStore, TIERS, CODE_RE, ALPHABET };
