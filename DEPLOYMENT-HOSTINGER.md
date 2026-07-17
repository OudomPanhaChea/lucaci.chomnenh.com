# Deploying Chomnenh on the Hostinger Business plan (no VPS)

> Decided 2026-07-10: production runs on the company's existing Hostinger **Business
> shared hosting** plan, which now supports up to 5 Node.js apps (GitHub or ZIP deploy
> via hPanel). Express and Next.js are both officially supported. The older
> DEPLOYMENT.md (VPS + nginx) stays as the fallback plan if the shared plan proves
> too limited.

## Architecture: two Node apps, one visible origin

| hPanel "website" | Domain | App root | What it runs |
|---|---|---|---|
| 1. API | `api-lucaci.chomnenh.com` | `server/` | Express + Socket.IO on the port Hostinger assigns (`process.env.PORT`) |
| 2. Web | `lucaci.chomnenh.com` | `client/` | Next.js (`next start`) |

The browser only ever talks to `lucaci.chomnenh.com`. The Next app proxies
`/api`, `/uploads`, and `/socket.io` to the API app via the rewrites in
`client/next.config.ts` (driven by the `API_ORIGIN` env var), so cookies and auth
work exactly like local dev. The `api-` subdomain is internal plumbing; nobody
needs to browse it. (It is `api-lucaci`, not `api.lucaci`: hPanel's web-app flow
rejects domains with more than one subdomain level.)

Two consequences to accept, not fix:

- **Socket.IO connects directly to the API host.** With `NEXT_PUBLIC_API_ORIGIN`
  set (step 5) the browser talks to `api-lucaci` itself, so polling works and a
  WebSocket upgrade is possible. Without it, the same-origin `/socket.io` proxy
  path is used; that needs `skipTrailingSlashRedirect` in `next.config.ts`
  (Next's 308 trailing-slash redirect used to break the handshake) and stays on
  long-polling. Either way, do NOT force `transports: ["websocket"]`.
- **Uploaded images live in the database, not the app disk.** Managed redeploys
  replace the app folder, wiping anything under `server/uploads/`, so every
  image upload (products, avatars, logo, banners) is stored as a row in the
  `images` table and served at `/uploads/img/:id` with hard browser caching
  (see `server/middleware/upload.js`). One database backup therefore covers
  data AND images. The tradeoff: images count against the plan's per-database
  size limit, so keep an eye on DB size in hPanel as the product catalog grows
  (photos are capped at 5MB each; a phone photo is typically 1-2MB).

## Step 0: proof of concept (do this before the real deploy)

Deploy the API app alone first (steps 2 and 4) and confirm on the plan:

1. The Node process stays alive and restarts after a crash (hit
   `https://api-lucaci.chomnenh.com/api/health` over a day).
2. ~~A repo subdirectory (`server/`) can be the app root.~~ Confirmed NOT
   supported (2026-07-13): hPanel locks the root directory to the auto-detected
   app. Solved with the `api-deploy` split branch (see step 4); the Web app still
   deploys from `main` because hPanel auto-detects the Next.js app in `client/`.
3. After adding the Web app: login works and the dashboard shows "Live"
   (long-polling through the proxy).

If any of these fail, stop and use DEPLOYMENT.md (VPS) instead.

## Step 1: DNS and subdomains

In hPanel, under the `chomnenh.com` domain, create the two subdomains
(`lucaci` and `api-lucaci`) and attach one Node.js website to each. Enable the
free SSL certificate on both (HTTPS is required: the camera barcode scanner
only works on secure origins, and production cookies are `Secure`).

## Step 2: MySQL database

1. hPanel → Databases → create database (e.g. `u123456_chamnenh`) and a user with
   full privileges. Note the DB host hPanel shows (it is usually not `localhost`).
2. Open phpMyAdmin, select the database, and import
   `server/database/schema.sql`. The schema is current (tenancy, payments,
   credit); a fresh install needs **no** files from `server/database/migrations/`.
3. The seed step (step 6) creates the business row, settings row, and owner user.

## Step 3: image storage (nothing to create, one thing to check)

Images are stored in the `images` table, so there is no separate storage service
to set up. One check while you are in phpMyAdmin: run
`SELECT @@max_allowed_packet;` and confirm it is at least `16777216` (16MB).
Uploads are capped at 5MB and a smaller packet limit would make large image
INSERTs fail. Hostinger's managed MySQL is normally far above this; if it is
lower and cannot be raised, lower the upload cap (`MAX_IMAGE_BYTES` in
`server/middleware/upload.js` plus the client-side check in
`client/lib/images.ts`) below the packet limit.

## Step 4: deploy the API app

Create the Node.js website on `api-lucaci.chomnenh.com`:

- **Source:** GitHub repo `OudomPanhaChea/lucaci.chomnenh.com`, branch
  **`api-deploy`**, framework preset Express, entry file `index.js`. hPanel
  cannot target the `server/` subfolder and permanently caches root directory
  `client` for this repo (from its first scan), so `api-deploy` is generated
  with the **server app nested under a `client/` folder** — the cached root
  then points at the Express app. Yes, the folder named `client` on that
  branch contains the API; it exists only to satisfy hPanel. The GitHub Action
  `.github/workflows/sync-api-deploy.yml` regenerates and force-pushes the
  branch on every push to `main` that touches `server/**`; never commit to it
  directly.
- **Node version:** 22 (the start script uses `--env-file-if-exists`, which needs
  Node 22.9+).
- **Build command:** `npm ci` (or `npm install`).
- **Start command:** `npm start`.
- **Environment variables:**

```env
NODE_ENV=production
BUSINESS_ID=1
DB_HOST=<from hPanel, step 2>
DB_USER=<db user>
DB_PASSWORD=<db password>
DB_NAME=<db name>
JWT_SECRET=<long random string, generate a fresh one>
JWT_EXPIRES=7d
CLIENT_ORIGIN=https://lucaci.chomnenh.com
ADMIN_NAME=Owner
ADMIN_EMAIL=<real owner email>
ADMIN_PASSWORD=<temporary, change after first login>
BUSINESS_NAME=Chomnenh
```

Do not set `PORT`; Hostinger assigns one and the server reads it. If the hPanel
env-var UI is awkward, the same values can live in a `server/.env` file created
with the file manager instead (the start script loads it if present), but then
they must survive redeploys, so prefer the UI.

Check: `https://api-lucaci.chomnenh.com/api/health` returns `{"ok":true}`.

## Step 5: deploy the Web app

Create the Node.js website on `lucaci.chomnenh.com`:

- **Source:** same repo, branch `main`, app root `client/`.
- **Node version:** 22.
- **Build command:** `npm ci && npm run build`.
- **Start command:** `npm start`.
- **Environment variables:**

```env
API_ORIGIN=https://api-lucaci.chomnenh.com
API_ORIGIN_PIN_IP=156.67.222.87
NEXT_PUBLIC_SITE_URL=https://lucaci.chomnenh.com
```

`NEXT_PUBLIC_API_ORIGIN` is no longer used (2026-07-16): Socket.IO connects
same-origin through the Next rewrite, riding the app's hCDN challenge
clearance. Remove the variable if it is still set.

`API_ORIGIN_PIN_IP` (2026-07-17) makes the Next server resolve the API
hostname to the origin server's own IP instead of the hCDN anycast edge, so
the server-to-server rewrite hop (`/api`, `/uploads`, `/socket.io`) stops
crossing the CDN a second time. That second crossing is where the edge (a)
answered with a bot challenge no server-side request can solve and (b)
intermittently stripped response bodies (200 + `Content-Length: 0`, verified
live 2026-07-17: up to 1 in 3 requests in bursts, the cause of random
logouts, blank pages, and "couldn't load" errors under multi-user load).
TLS, SNI, and certificate validation are unchanged, so a wrong IP fails
loudly instead of hitting the wrong app. Find the current IP in hPanel
(the website's A record / server IP); if Hostinger migrates the account,
update or remove the variable and restart the Web app.

Do NOT set `NODE_ENV=production` on the client app: npm then installs without
devDependencies and `next build` breaks. `next build`/`next start` set
`NODE_ENV` themselves. (Build-time packages were also moved into `dependencies`
on 2026-07-13, so the build survives either way.)

`API_ORIGIN` is read at build time by `next.config.ts`, so it must be set
**before** the build runs, and the app must be rebuilt if it ever changes.

## Step 6: seed the owner account

With the API env vars in place, run the seed once. Hostinger Business includes
SSH: `ssh` in, `cd` to the API app folder, and run `npm run seed`. It creates
business 1, its settings row, and the owner account from the `ADMIN_*` vars.
(If SSH is unavailable, run the seed from your PC with `.env` pointed at the
remote DB, if remote MySQL access is enabled in hPanel.)

## Step 7: verify

- [ ] Login at `https://lucaci.chomnenh.com/login`, then change the owner password
      (Profile page)
- [ ] Header shows **Live** (Socket.IO long-polling same-origin through the
      Next rewrite; needs `skipTrailingSlashRedirect` in `next.config.ts` and
      `addTrailingSlash: false` in `server/config/socket.js`)
- [ ] Upload a product photo; its URL should be `/uploads/img/<n>` and it
      should survive a redeploy (it lives in the DB)
- [ ] Camera barcode scanning works (needs the HTTPS cert from step 1)
- [ ] Sell something on `/admin/pos`; the dashboard updates in realtime
- [ ] Set up a recurring backup of the MySQL database (hPanel backups cover it;
      one DB backup includes the images too)
- [ ] **Purge the hCDN cache** (hPanel > Performance > Cache). Required after any
      deploy that changes `sw.js` or `offline.html`.

## Step 8: keep the apps warm (optional, reduces error screens)

Shared-hosting Node apps can be idled out and cold-started on the next request,
and a cold start answers with a 502/503 from Hostinger's proxy for a few seconds.
The service worker now turns that into the branded "Reconnecting" page that
reloads itself, so staff no longer see a browser error, **but the page is still a
few seconds of not selling**. A cron that pings the app keeps it from idling:

1. hPanel > Advanced > Cron Jobs > Create
2. Every 5 minutes (`*/5 * * * *`)
3. Command:
   ```
   curl -s -o /dev/null https://lucaci.chomnenh.com/api/health
   ```

One request exercises both apps: it hits the Web app, which proxies `/api/*` to
the API app, so a 200 means the whole chain is warm. It is deliberately the same
URL the retry page polls.

## Gotchas

- **Login rate limiter behind two proxies.** `server/index.js` sets
  `trust proxy, 1`, which resolves req.ip to the web server's IP behind
  Hostinger's proxy plus the Next rewrite, so every user shared one bucket
  (429s on login for everyone). Fixed 2026-07-14: the limiters in
  `server/routes/index.js` key on the leftmost `X-Forwarded-For` entry and only
  count failed attempts; a second limiter locks an email for 10 min after 5
  failures. The limiter store is in-memory, so restarting the API app clears a
  tripped bucket.
- **hCDN cache poisoning ("This page couldn't load" / forced reloads).**
  Hostinger fronts the web app with its hCDN, which caches responses but
  ignores `Vary: RSC`. Next static-prerenders client pages with
  `s-maxage=31536000`, so the HTML document and the RSC navigation payload of
  the same URL fought over one edge-cache slot: cached HTML broke client-side
  navigation (router falls back to full reloads), a cached RSC payload served
  as the document gave Chrome's "This page couldn't load". Fixed 2026-07-14:
  `export const dynamic = "force-dynamic"` in `client/app/layout.tsx` makes
  every page render on demand with `Cache-Control: no-store` (hCDN reports
  DYNAMIC and never caches). After deploying, purge the CDN cache in hPanel
  (Websites → Performance/CDN) — poisoned entries live for a year otherwise.
- **Both apps redeploy independently.** Pushing to `main` redeploys whatever app
  watches it. Schema changes must be applied in phpMyAdmin manually (run the new
  file from `server/database/migrations/`) before or right after deploying code
  that needs them.
- **A second business later** = one more pair of hPanel websites on new
  subdomains, same DB, `BUSINESS_ID=2`, and its own seed run (the plan allows 5
  Node apps total, so 2 businesses max on one plan).
