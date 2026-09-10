// Cloudflare Pages Function: functions/api/validate-code.js
// Deploy on Cloudflare Pages with a KV namespace bound as CODES.
//
// PER-TIER CODES: the KV *value* names the tier the code unlocks:
//   wrangler kv:key put --binding=CODES "BASE-XXXX" '"base"'
//   wrangler kv:key put --binding=CODES "PRO-XXXX"  '"pro"'
//   wrangler kv:key put --binding=CODES "EXT-XXXX"  '"extreme"'
// Legacy values ("1", "true", empty) are treated as Pro.
//
// Contract with TidalTweaks (license:validate in electron/main.js):
//   POST {pages-url}/api/validate-code  {"code": "..."}
//   -> {"valid": true, "tier": "base"|"pro"|"extreme"}  (code DELETED, single-use)
//   -> {"valid": false} with HTTP 400  (unknown / already-used code)

const TIERS = { base: 'base', pro: 'pro', extreme: 'extreme', 1: 'pro', true: 'pro' };

export async function onRequestPost(context) {
  try {
    const { code } = await context.request.json();
    const clean = String(code || "").trim();
    if (!clean) {
      return Response.json({ valid: false }, { status: 400 });
    }
    // Exact match first, then UPPERCASE fallback (old codes were stored upper).
    let stored = await context.env.CODES.get(clean);
    let usedKey = clean;
    if (stored === null && clean.toUpperCase() !== clean) {
      usedKey = clean.toUpperCase();
      stored = await context.env.CODES.get(usedKey);
    }
    if (stored === null) {
      return Response.json({ valid: false }, { status: 400 });
    }
    await context.env.CODES.delete(usedKey); // single-use
    return Response.json({ valid: true, tier: TIERS[String(stored).toLowerCase()] || 'pro' });
  } catch (e) {
    return Response.json({ valid: false }, { status: 500 });
  }
}
