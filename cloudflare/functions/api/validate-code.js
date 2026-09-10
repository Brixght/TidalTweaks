// POST /api/validate-code  — TidalTweaks license check (no website needed,
// this function IS the entire backend; Pages serves it at
// https://<your-project>.pages.dev/api/validate-code).
//
// KV namespace bound as CODES. The VALUE names the tier:
//   "base" | "pro" | "extreme"   (legacy "1"/"true"/empty also mean Pro)
//
//   -> {"valid": true, "tier": "..."}   (code DELETED first: single-use)
//   -> {"valid": false}  with HTTP 400  (unknown / already-used / empty)

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
    await context.env.CODES.delete(usedKey); // single-use: gone before we answer
    // Strip surrounding quotes: `kv:key put ... '"base"'` stores them literally.
    const tierKey = String(stored).replace(/"/g, '').trim().toLowerCase();
    return Response.json({ valid: true, tier: TIERS[tierKey] || 'pro' });
  } catch (e) {
    return Response.json({ valid: false }, { status: 500 });
  }
}
