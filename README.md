# launchrocket.in

Enabling Indian Brands to Go Global and Global Brands to Enter India. Launch Rocket is your enabling partner for cross-border commerce — helping Indian manufacturers access world markets and international brands unlock India’s fast-growing retail opportunity, through technology, compliance, and expert consulting.

The site is a static site served by **GitHub Pages** (`CNAME` → `launchrocket.in`, `.nojekyll`). No build step: edit HTML/CSS/JS directly.

---

## HS Classification & Duty Intelligence (`/hs-classification/`)

A SEO-optimised service page plus a **live, free single-SKU HS classifier** that any visitor can use. It returns an ITC-HS 8-digit code, the indicative import-duty stack (BCD · SWS · AIDC · Health Cess · IGST), GST HSN, FTA routes, compliance flags and a GRI reasoning trail — all **indicative only, not expert-signed**.

### Files

| Path | What it is |
|---|---|
| `hs-classification/index.html` | The service page + the classifier UI (static, self-contained styles, JSON-LD). |
| `hs-classification/app.js` | Front-end tool logic: form, image→base64, API call, five-block renderer, **client-side duty maths**, cross-sell chips, analytics. No secrets. |
| `api/classify.js` | Vercel serverless function for the classifier. Holds the Anthropic call + system prompt. **The API key lives only here.** |
| `vercel.json` | Vercel project config (function `maxDuration`, API response headers). |

### Architecture

The marketing site stays on **GitHub Pages** (`launchrocket.in`). The classifier API is a **Vercel serverless function** deployed as a small, separate project and given the custom domain **`api.launchrocket.in`**. The page calls `https://api.launchrocket.in/api/classify` cross-origin; the function returns CORS headers for the `launchrocket.in` origins, and the page CSP allows exactly that host (`connect-src 'self' https://api.launchrocket.in`). The browser never sees the Anthropic key.

If the API isn't reachable yet, the tool degrades gracefully: it shows a friendly error inviting the visitor to email `care@launchrocket.in`.

### Backend setup — Vercel

Deploy `api/classify.js` as its own Vercel project (it serves only the API; the site itself remains on GitHub Pages).

```bash
npm i -g vercel        # or use npx
vercel login
vercel                 # first deploy → creates the project (accept defaults)

# set the key + options (Production), then redeploy:
vercel env add ANTHROPIC_API_KEY production      # required — paste the key
vercel env add TURNSTILE_SECRET production       # optional — enables Turnstile
vercel env add ANTHROPIC_MODEL production        # optional — defaults to claude-sonnet-5
vercel --prod
```

**Point `api.launchrocket.in` at the project** (one-time): in the Vercel project → **Settings → Domains**, add `api.launchrocket.in`; then add the DNS record it shows (a `CNAME api → cname.vercel-dns.com`) at your DNS provider. Once it resolves, the front-end works with no code change.

> Prefer the raw `*.vercel.app` URL instead of a subdomain? Change two lines: `endpoint` in `hs-classification/index.html` and the `connect-src` host in that page's CSP.

**Environment variables**

| Name | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Anthropic Messages API key. Server-side only. |
| `ANTHROPIC_MODEL` | – | Model id; defaults to `claude-sonnet-5`. |
| `TURNSTILE_SECRET` | – | Enables Cloudflare Turnstile verification when set. |
| `ALLOWED_ORIGINS` | – | Comma-separated CORS allowlist override (default: `https://www.launchrocket.in,https://launchrocket.in`). |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | – | Enables the ~5 classifications/day per-IP limit (Upstash Redis — free tier, one click from the Vercel Marketplace). Without it, Turnstile still gates abuse. |

The function calls the Anthropic Messages API with `temperature 0.2`, `max_tokens 1800`, **no web-search tool** (the free tier is explicitly indicative), and an image block when provided. It parses JSON defensively (strips code fences, retries once) and returns a normalised object matching the tool contract. **Product inputs are not persisted** — only an anonymised daily count is written (when Redis is configured).

### Front-end config

In `hs-classification/index.html`, the `window.LR_HSC` block controls the tool:

```js
window.LR_HSC = {
  endpoint: "https://api.launchrocket.in/api/classify",  // Vercel function
  turnstileSiteKey: "",   // paste your Turnstile SITE key to show the widget
  analyticsEndpoint: ""   // optional beacon URL for events (else dataLayer + CustomEvent only)
};
```

To enable Turnstile end-to-end: set `turnstileSiteKey` here **and** `TURNSTILE_SECRET` on Vercel. The Turnstile script auto-loads only when a site key is present.

### Analytics events

`app.js` pushes to `window.dataLayer` and fires DOM `CustomEvent`s (`lr:<event>`), plus an optional `sendBeacon` when `analyticsEndpoint` is set. Events: `classify_submitted`, `classify_result_{high|medium|grey_area|refused}`, `flag_chip_clicked_{flag}` (the cross-sell KPI), `enterprise_cta_clicked`, `rate_limit_hit`.

### Local preview

```bash
python3 -m http.server 8000
# open http://localhost:8000/hs-classification/
```

Without a deployed API the tool shows the friendly error path. To exercise the **renderer** with the five block types offline, open the page and paste a sample payload into the console helper: `window.__lrRender(sampleJson, { name: "…", channel: "Import to India", unit_price: 1500 })`. `window.__lrComputeDuty(dutyObj, price)` returns the computed duty totals.

### Legal

The page renders the standard indicative-only disclaimer under every result and in the footer. Binding classification certainty in India is available only via a **CAAR advance ruling** (valid 5 years). FTA rates are always shown with their rule-of-origin + CAROTAR 2020 caveat.
