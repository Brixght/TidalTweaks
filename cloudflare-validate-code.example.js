// Cloudflare Pages Function: functions/api/validate-code.js
// Deploy on Cloudflare Pages with a KV namespace bound as CODES.
// Add codes via:  wrangler kv:key put --binding=CODES "ABC123" "1"
//
// Contract with TidalTweaks (core/activation.py):
//   POST {pages-url}/api/validate-code  {"code": "..."}
//   -> {"valid": true}   (code deleted from KV, single-use)
//   -> {"valid": false}  (unknown / already used)

export async function onRequestPost(context) {
  try {
    const { code } = await context.request.json();
    const clean = String(code || "").trim().toUpperCase();
    if (!clean) {
      return Response.json({ valid: false }, { status: 400 });
    }
    const exists = await context.env.CODES.get(clean);
    if (exists === null) {
      return Response.json({ valid: false });
    }
    await context.env.CODES.delete(clean); // single-use
    return Response.json({ valid: true });
  } catch (e) {
    return Response.json({ valid: false }, { status: 500 });
  }
}
