'use strict';
/* electron-builder afterPack hook: stamp our icon + version metadata into the
 * unpacked exe BEFORE the NSIS installer is created.
 *
 * Why this exists: on machines without symlink privileges, electron-builder
 * cannot extract its winCodeSign toolkit, so we build with
 * "signAndEditExecutable": false and do the rcedit step ourselves with the
 * vendored binary in build-tools/ (extracted once from the builder cache).
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');

module.exports = async function afterPack(context) {
  const dir = context.packager.projectDir;
  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const rcedit = path.join(dir, 'build-tools', 'rcedit-x64.exe');
  const icon = path.join(dir, 'assets', 'icon.ico');
  const { version, productName } = require(path.join(dir, 'package.json'));
  const fs = require('node:fs');
  if (!fs.existsSync(rcedit)) {
    console.warn('[afterPack] rcedit not found, skipping exe stamp');
    return;
  }
  execFileSync(rcedit, [
    exe,
    '--set-icon', icon,
    '--set-file-version', version,
    '--set-product-version', version,
    '--set-version-string', 'CompanyName', 'TidalTweaks',
    '--set-version-string', 'FileDescription', `${productName} - PC Optimization Suite`,
    '--set-version-string', 'ProductName', productName,
  ], { stdio: 'inherit' });
  console.log('[afterPack] stamped', exe);
};
