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

- **Socket.IO runs on HTTP long-polling.** A WebSocket upgrade cannot pass through
  a Next.js rewrite. Socket.IO detects this and stays on polling automatically.
  Realtime still works (dashboard, POS, invoices update live). Do NOT remove
  Socket.IO or force `transports: ["websocket"]`.
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
2. A repo **subdirectory** (`server/`) can be the app root. If hPanel only accepts
   a repo root, fall back to ZIP deploys of each folder, or split into two repos.
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

- **Source:** GitHub repo `OudomPanhaChea/lucaci.chomnenh.com`, branch `main`,
  app root `server/` (see step 0 if subdirectory roots are not supported).
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
NODE_ENV=production
API_ORIGIN=https://api-lucaci.chomnenh.com
NEXT_PUBLIC_SITE_URL=https://lucaci.chomnenh.com
```

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
- [ ] Header shows **Live** (Socket.IO long-polling through the proxy)
- [ ] Upload a product photo; its URL should be `/uploads/img/<n>` and it
      should survive a redeploy (it lives in the DB)
- [ ] Camera barcode scanning works (needs the HTTPS cert from step 1)
- [ ] Sell something on `/admin/pos`; the dashboard updates in realtime
- [ ] Set up a recurring backup of the MySQL database (hPanel backups cover it;
      one DB backup includes the images too)

## Gotchas

- **Login rate limiter behind two proxies.** `server/index.js` sets
  `trust proxy, 1`. Behind Hostinger's proxy plus the Next rewrite there may be
  two hops; if every user starts sharing one rate-limit bucket (429s on login for
  everyone), bump it to `2`.
- **Both apps redeploy independently.** Pushing to `main` redeploys whatever app
  watches it. Schema changes must be applied in phpMyAdmin manually (run the new
  file from `server/database/migrations/`) before or right after deploying code
  that needs them.
- **A second business later** = one more pair of hPanel websites on new
  subdomains, same DB, `BUSINESS_ID=2`, and its own seed run (the plan allows 5
  Node apps total, so 2 businesses max on one plan).
