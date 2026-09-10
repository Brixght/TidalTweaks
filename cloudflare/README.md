# TidalTweaks license backend — API only, NO website needed

This folder **is** the entire backend: one Cloudflare Pages Function backed by
one KV namespace. There are no HTML pages, no frontend, nothing to design.
After deploying, your API lives at:

`https://<your-project-name>.pages.dev/api/validate-code`

> Name the project **`tidaltweaks`** and the app works with zero
> configuration — that URL is already its default.

## Option A — dashboard only, no terminal (easiest)

1. Sign up at https://dash.cloudflare.com (free plan is enough).
2. Left sidebar → **Workers & Pages** → **Create** → **Pages** tab → **Upload assets**.
3. Name the project `tidaltweaks` → **Create project**.
4. Drag **this whole `cloudflare/` folder** (or a zip of it) into the upload box → **Deploy**. Ignore the "no index.html" warning — functions don't need one.
5. Still in the project → **Settings** → **Bindings** → **Add** → **KV namespace**:
   - Variable name: `CODES`
   - Create a new namespace called `tidaltweaks-codes` → **Add binding** → **Save** → **Redeploy** (Bindings tab → Manage → Redeploy, so the function sees it).

## Option B — terminal with Wrangler

```powershell
npm install -g wrangler
wrangler login
wrangler kv:namespace create CODES
# paste the printed id into wrangler.toml, then:
wrangler pages deploy . --project-name=tidaltweaks
```

## Upload the 300 codes (either option)

From the folder holding your code files (`Documents\TidalTweaks-Codes`):

```powershell
wrangler kv:bulk put --binding=CODES kv-import-base.json
wrangler kv:bulk put --binding=CODES kv-import-pro.json
wrangler kv:bulk put --binding=CODES kv-import-extreme.json
```

Spot-check one (returns the stored tier, does NOT consume it):

```powershell
wrangler kv:key get --binding=CODES "BASE-TE9YRR-GQ68XN"
```

## Test the live API (burns NOTHING)

POST any garbage code — you must get `{"valid":false}` with HTTP 400.
That proves the app can reach your backend. A real code is only consumed
when the API answers `{"valid":true,...}`.

```powershell
Invoke-RestMethod -Method Post -Uri "https://tidaltweaks.pages.dev/api/validate-code" `
  -ContentType "application/json" -Body '{"code":"TEST-GARBAGE-123"}'
```

## Point the app at it

- If your project is named `tidaltweaks`: **do nothing**, it's the default.
- Any other name: open the app → Settings → paste your full
  `https://<name>.pages.dev/api/validate-code` URL → **Save URL**. No rebuild needed.
