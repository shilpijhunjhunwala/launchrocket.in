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
| `worker/classify.js` | Cloudflare Worker backend for `/api/classify`. Holds the Anthropic call + system prompt. **The API key lives only here.** |
| `worker/wrangler.toml` | Worker config (routes, model var, KV binding, secret notes). |

### Architecture

The static page is served by GitHub Pages. The classifier posts to **`/api/classify`** on the **same origin**, which keeps the page CSP at `connect-src 'self'`. That path is routed to a **Cloudflare Worker** (the domain must be proxied through Cloudflare; everything except `/api/classify*` falls through to GitHub Pages). The browser never sees the Anthropic key.

If `/api/classify` is not yet deployed, the tool degrades gracefully: it shows a friendly error inviting the visitor to email `care@launchrocket.in`.

### Backend setup — Cloudflare Worker

Prereqs: the `launchrocket.in` DNS zone on Cloudflare, and `npx wrangler login`.

```bash
cd worker

# 1. (optional) rate-limit store — anonymised per-IP daily counts (~5/day)
npx wrangler kv namespace create RATE_LIMIT_KV
#   → paste the printed id into wrangler.toml under [[kv_namespaces]] and uncomment.

# 2. secrets (never committed)
npx wrangler secret put ANTHROPIC_API_KEY     # required
npx wrangler secret put TURNSTILE_SECRET      # optional — enables Cloudflare Turnstile

# 3. uncomment the [[routes]] blocks in wrangler.toml, then deploy
npx wrangler deploy
```

**Environment variables / secrets**

| Name | Kind | Required | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | secret | ✅ | Anthropic Messages API key. Server-side only. |
| `ANTHROPIC_MODEL` | var (`wrangler.toml`) | – | Model id; defaults to `claude-sonnet-5`. |
| `TURNSTILE_SECRET` | secret | – | Enables Cloudflare Turnstile verification when set. |
| `RATE_LIMIT_KV` | KV binding | – | Enables the ~5 classifications/day per-IP limit. |

The Worker calls the Anthropic Messages API with `temperature 0.2`, `max_tokens 1800`, **no web-search tool** (the free tier is explicitly indicative), and an image block when provided. It parses JSON defensively (strips code fences, retries once), and returns a normalised object matching the tool contract. **Product inputs are not persisted** — only an anonymised daily count is written to KV.

### Front-end config

In `hs-classification/index.html`, the `window.LR_HSC` block controls the tool:

```js
window.LR_HSC = {
  endpoint: "/api/classify",   // same-origin Worker route
  turnstileSiteKey: "",        // paste your Turnstile SITE key to show the widget
  analyticsEndpoint: ""        // optional beacon URL for events (else dataLayer + CustomEvent only)
};
```

To enable Turnstile end-to-end: set `turnstileSiteKey` here **and** `TURNSTILE_SECRET` on the Worker. The Turnstile script auto-loads only when a site key is present.

### Analytics events

`app.js` pushes to `window.dataLayer` and fires DOM `CustomEvent`s (`lr:<event>`), plus an optional `sendBeacon` when `analyticsEndpoint` is set. Events: `classify_submitted`, `classify_result_{high|medium|grey_area|refused}`, `flag_chip_clicked_{flag}` (the cross-sell KPI), `enterprise_cta_clicked`, `rate_limit_hit`.

### Local preview

```bash
python3 -m http.server 8000
# open http://localhost:8000/hs-classification/
```

Without a running Worker the tool shows the friendly error path. To exercise the **renderer** with the five block types offline, see `worker/README-testing` in the commit notes / open `hs-classification/index.html` and paste sample payloads via the console helper `window.__lrRender(sample)` (available in preview).

### Legal

The page renders the standard indicative-only disclaimer under every result and in the footer. Binding classification certainty in India is available only via a **CAAR advance ruling** (valid 5 years). FTA rates are always shown with their rule-of-origin + CAROTAR 2020 caveat.
