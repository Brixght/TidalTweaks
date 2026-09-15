'use strict';
/* ============================================================================
 * core/bios.js — motherboard detection for the BIOS guided-checklist tab.
 * ----------------------------------------------------------------------------
 * Firmware settings can't be applied programmatically, so the BIOS tab is a
 * guided checklist: this module only answers "which vendor's menu paths do
 * we show?" via WMI Win32_BaseBoard (manufacturer + product, no privileged
 * writes, never throws — failures come back as { ok:false, message }).
 * ========================================================================== */
const { runPS } = require('./exec');

/* asus | msi | gigabyte | asrock | other */
function normalizeVendor(manufacturer) {
  const s = String(manufacturer || '');
  if (/asus/i.test(s)) return 'asus';
  if (/msi|micro-star/i.test(s)) return 'msi';
  if (/gigabyte/i.test(s)) return 'gigabyte';
  if (/asrock/i.test(s)) return 'asrock';
  return 'other';
}

async function detect() {
  try {
    const r = await runPS(
      'Get-CimInstance Win32_BaseBoard | Select-Object Manufacturer, Product | ConvertTo-Json -Compress',
      30000
    );
    if (r.code !== 0) return { ok: false, message: 'Could not read motherboard info.' };
    let o;
    try { o = JSON.parse(String(r.stdout || '').trim()); }
    catch { return { ok: false, message: 'Could not parse motherboard info.' }; }
    if (Array.isArray(o)) o = o[0] || {};
    const manufacturer = String((o && o.Manufacturer) || '').trim();
    const product = String((o && o.Product) || '').trim();
    if (!manufacturer && !product) return { ok: false, message: 'Motherboard info came back empty.' };
    return { ok: true, vendor: normalizeVendor(manufacturer), manufacturer, product };
  } catch (e) { return { ok: false, message: String(e) }; }
}

module.exports = { detect, normalizeVendor };
