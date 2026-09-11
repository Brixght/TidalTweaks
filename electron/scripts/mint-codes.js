'use strict';
/* Seller tool: mint signed offline license codes. The PRIVATE key NEVER lives
 * in this repo — pass its path explicitly.
 *
 *   node scripts/mint-codes.js <private-key.pem> <base|pro|extreme> <count> [out.txt]
 *
 * Prints codes to stdout (and optionally appends to out.txt).
 * Keep generated files OUT of git (see .gitignore *-codes.txt rule).
 */
const fs = require('node:fs');
const crypto = require('node:crypto');

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TIERS = { base: 'BASE', pro: 'PRO', extreme: 'EXTREME' };

function mint(tierName, random, privateKeyPem) {
  const sig = crypto.sign(null, Buffer.from(`${tierName}|${random}`, 'utf8'), crypto.createPrivateKey(privateKeyPem));
  const b64u = sig.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `TT1-${tierName}-${random}-${b64u}`;
}

function main() {
  const [, , keyPath, tierArg, countArg, outPath] = process.argv;
  const tierName = TIERS[String(tierArg || '').toLowerCase()];
  const count = parseInt(countArg, 10);
  if (!keyPath || !tierName || !Number.isInteger(count) || count < 1 || count > 5000) {
    console.error('Usage: node scripts/mint-codes.js <private-key.pem> <base|pro|extreme> <count> [out.txt]');
    process.exit(1);
  }
  const keyPem = fs.readFileSync(keyPath, 'utf8');
  const seen = new Set();
  const codes = [];
  while (codes.length < count) {
    let random = '';
    for (let i = 0; i < 10; i++) random += ALPHABET[crypto.randomInt(ALPHABET.length)];
    const code = mint(tierName, random, keyPem);
    if (!seen.has(code)) { seen.add(code); codes.push(code); }
  }
  const text = codes.join('\n') + '\n';
  if (outPath) fs.appendFileSync(outPath, text);
  process.stdout.write(text);
}

main();
