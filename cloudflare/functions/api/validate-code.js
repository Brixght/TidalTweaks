// POST /api/validate-code  — TidalTweaks license check (no website needed,
// this function IS the entire backend; Pages serves it at
// https://<your-project>.pages.dev/api/validate-code).
//
// KV namespace bound as CODES. The VALUE names the tier:
//   "base" | "pro" | "extreme"   (legacy "1"/"true"/empty also mean Pro)
//
//   -> {"valid": true, "tier": "..."}  (code DELETED first: single-use)
//   -> {"valid": false}  with HTTP 400 (unknown / already-used / empty)
//   -> {"valid": false, "error": "..."} with HTTP 500 (server misconfigured —
//      READ THE ERROR, it tells you exactly what to fix in the dashboard)

// Plain Response (not Response.json) so this works on ANY compatibility date.
function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const TIERS = { base: 'base', pro: 'pro', extreme: 'extreme', 1: 'pro', true: 'pro' };

export async function onRequestPost(context) {
  // #1 failure mode, now with a readable message: the CODES binding is
  // missing (or was added WITHOUT hitting Redeploy afterwards).
  if (!context.env || !context.env.CODES) {
    return json(
      { valid: false, error: 'KV binding "CODES" missing: Pages project → Settings → Bindings → add KV "CODES", then REDEPLOY.' },
      500
    );
  }
  let body = {};
  try {
    body = await context.request.json();
  } catch {
    return json({ valid: false, error: 'Send JSON like {"code":"..."}.' }, 400);
  }
  const clean = String(body.code || "").trim();
  if (!clean) {
    return json({ valid: false }, 400);
  }
  try {
    // Exact match first, then UPPERCASE fallback (old codes were stored upper).
    let stored = await context.env.CODES.get(clean);
    let usedKey = clean;
    if (stored === null && clean.toUpperCase() !== clean) {
      usedKey = clean.toUpperCase();
      stored = await context.env.CODES.get(usedKey);
    }
    if (stored === null) {
      return json({ valid: false }, 400);
    }
    await context.env.CODES.delete(usedKey); // single-use: gone before we answer
    // Strip surrounding quotes: `kv:key put ... '"base"'` stores them literally.
    const tierKey = String(stored).replace(/"/g, '').trim().toLowerCase();
    return json({ valid: true, tier: TIERS[tierKey] || 'pro' });
  } catch (e) {
    return json({ valid: false, error: 'KV read failed: ' + String((e && e.message) || e) }, 500);
  }
}
