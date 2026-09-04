# PreditionMarketSim (Master Better)

Peer-to-peer prediction markets: NestJS signaling backend + React SPA frontend.

## Local development

Start the Nest signaling server with `backend:dev`, then the Vite SPA with `dev:static`.

Optional vinext/Cloudflare local stack remains available via `dev` (not used for production hosting).

Copy `.env.example` to `.env` and adjust as needed.

## Render (free) — Nest + Static Site

`render.yaml` deploys two free services:

1. **master-better-signaling** (Node web) — Nest signaling at `https://preditionmarketsim.onrender.com`
2. **master-better-web** (static) — Vite SPA via `build:static`

### After deploy

1. Open the static site URL from the Render dashboard (e.g. `https://master-better-web.onrender.com`).
2. Set the Nest service env var **FRONTEND_ORIGIN** to that static site URL (comma-separated for multiple origins). This enables CORS.
3. Rebuild/redeploy the static site if you change the signaling URL. Production embeds:

   `NEXT_PUBLIC_SIGNALING_URL=https://preditionmarketsim.onrender.com`

### Local static build

Set `NEXT_PUBLIC_SIGNALING_URL=https://preditionmarketsim.onrender.com` then run the `build:static` script.

Publish directory: `dist-static/` (contains `index.html`). SPA fallback: `public/_redirects` and Render rewrite of `/*` to `/index.html`.

## Scripts

- `dev:static` — Vite SPA dev server
- `build:static` — Production static assets to `dist-static/`
- `backend:dev` / `backend:build` / `backend:start` — Nest signaling server
