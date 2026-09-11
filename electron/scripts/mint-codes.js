'use strict';
/* Seller tool: mint signed offline license codes. The PRIVATE key NEVER lives
 * in this repo — pass its path explicitly.
 *
 *   node scripts/mint-codes.js <private-key.pem> <base|pro|extreme> <count> [out.txt] [--days=N]
 *
 * --days=N sets code expiry N days from minting (default 30). Expired codes
 * fail with "expired" even if never used — shared codes rot instead of living
 * forever. Bulk inventory: mint with --days=365.
 * Prints codes to stdout (and optionally appends to out.txt).
 * Keep generated files OUT of git (see .gitignore *-codes.txt rule).
 */
const fs = require('node:fs');
const crypto = require('node:crypto');

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TIERS = { base: 'BASE', pro: 'PRO', extreme: 'EXTREME' };

function mint(tierName, random, exp, privateKeyPem) {
  const payload = `${tierName}|${exp}|${random}`;
  const sig = crypto.sign(null, Buffer.from(payload, 'utf8'), crypto.createPrivateKey(privateKeyPem));
  const b64u = sig.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `TT1-${tierName}-${exp}-${random}-${b64u}`;
}

function main() {
  const args = process.argv.slice(2);
  let days = 30;
  const rest = [];
  for (const a of args) {
    const m = /^--days=(\d+)$/.exec(a);
    if (m) days = Math.min(3650, Math.max(1, parseInt(m[1], 10)));
    else rest.push(a);
  }
  const [keyPath, tierArg, countArg, outPath] = rest;
  const tierName = TIERS[String(tierArg || '').toLowerCase()];
  const count = parseInt(countArg, 10);
  if (!keyPath || !tierName || !Number.isInteger(count) || count < 1 || count > 5000) {
    console.error('Usage: node scripts/mint-codes.js <private-key.pem> <base|pro|extreme> <count> [out.txt] [--days=N]');
    process.exit(1);
  }
  const keyPem = fs.readFileSync(keyPath, 'utf8');
  const exp = (Math.floor(Date.now() / 3600000) + days * 24).toString(36).toUpperCase().padStart(6, '0');
  const seen = new Set();
  const codes = [];
  while (codes.length < count) {
    let random = '';
    for (let i = 0; i < 10; i++) random += ALPHABET[crypto.randomInt(ALPHABET.length)];
    const code = mint(tierName, random, exp, keyPem);
    if (!seen.has(code)) { seen.add(code); codes.push(code); }
  }
  const text = codes.join('\n') + '\n';
  if (outPath) fs.appendFileSync(outPath, text);
  process.stdout.write(text);
}

main();
