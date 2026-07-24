# Adding a second business (another subdomain, same plan)

> The app is multi-tenant by design: one shared database, one deployment per
> business, each pinned by the `BUSINESS_ID` env var. Business #1 (Lucaci) is
> `BUSINESS_ID=1`. A second business is `BUSINESS_ID=2` with its own two
> subdomains, its own two hPanel Node apps, pointing at the **same** database.
> There is no tenant-switching UI on purpose: each app only ever sees its own
> `business_id`, and the JWT is rejected across backends.
>
> **Chosen setup: business #2 lives in a SEPARATE repository** (a copy/fork of
> this one) so each business's code can be customized independently, while both
> repos still point at the **same shared database**. This is safe ONLY under the
> schema-contract rule below. Read it before forking.

## CRITICAL: the shared DB schema is a contract neither repo owns

Two separate repos writing to one database is safe only while the table
structure stays identical for both. Customizations split into two buckets:

- **Safe to diverge freely (most of them):** pure code — receipt/paper layouts,
  which features or buttons show, report formatting, branding, POS flow, labels,
  page layouts. None of this touches the DB. Customize per repo freely.
- **Dangerous to diverge:** anything that changes the schema — a new column, a
  new table, an altered column/enum, a migration. Both repos hit the same
  physical tables, so a schema change made for one business affects the other.

Rules to keep the shared DB safe:

1. **Only additive, backward-compatible schema changes.** New *nullable* columns
   or brand-new tables the other repo can ignore. NEVER rename, drop, retype, or
   add a `NOT NULL`-without-default to an existing shared column — that breaks the
   other business's code.
2. **Apply each migration once** to the shared DB by hand (phpMyAdmin), and add
   the same migration file to **both** repos so both `schema.sql` files stay in
   sync as the source of truth.
3. If a customization needs a column/table only one business uses, add it as a
   new nullable column or a new table; the other repo simply never touches it.
4. If you ever need to change a *shared* column's meaning for just one business,
   that is the signal you have outgrown the shared DB. Split business #2 onto its
   OWN database at that point (re-import `schema.sql` fresh into a second DB).

## Before you start: the 5-app limit

The Business shared plan allows **5 Node apps total**. Business #1 already uses
2 (web + api). A second business needs **2 more = 4 total**. That is fine, but it
leaves only 1 spare, so you cannot also run a full staging pair. **Two businesses
is the maximum on one plan.** A third business needs a second hosting plan.

Do not fake a second business as `BUSINESS_ID=2` for testing on this live DB. It
is a real tenant or nothing: one scoping bug would leak test data into a real
business's reports.

## What is shared vs separate

| Shared | Separate per business |
|---|---|
| The MySQL database (all rows carry `business_id`) | The GitHub repo (business #2 is a separate copy/fork) |
| The DB schema (a contract — see the CRITICAL section) | Two subdomains + two hPanel Node apps |
| The `images` table (counts against the one DB size cap) | `BUSINESS_ID` env var (1 vs 2); customized code |
| | Owner user, products, clients, sales, settings, logo, banners |

Everything a business sees is scoped by `business_id`, so the two never see each
other's data even though they share tables. Unique keys are per business
(`(business_id, email)`, `(business_id, barcode)`, invoice numbers, etc.), so
both businesses can have their own `owner@…`, the same barcodes, and independent
`INV-…` counters.

## Steps

Pick the new business's short name for the subdomains below. This guide uses
**`acme`** as the example (so `acme.chomnenh.com` + `api-acme.chomnenh.com`).

### 0. Create the new repo
Copy/fork this repo into a new GitHub repo for business #2 (e.g.
`OudomPanhaChea/acme.chomnenh.com`). It carries the same code, including the
`.github/workflows/sync-api-deploy.yml` workflow, so it generates its **own**
`api-deploy` branch on pushes to its `main`. From here on, business #2's hPanel
apps deploy from THIS new repo, never from `lucaci.chomnenh.com`. Keep the two
repos' `schema.sql` in sync per the CRITICAL section above.

### 1. DNS + subdomains + SSL
In hPanel under `chomnenh.com`, create two subdomains: `acme` and `api-acme`
(single-level, like `api-lucaci`, hPanel rejects `api.acme`). Enable the free SSL
cert on both. HTTPS is required (secure cookies + camera scanner).

### 2. Database — nothing new to create
Reuse the existing database. **Do not create a second database and do not
re-import `schema.sql`.** The tables already exist and are multi-tenant. The seed
in step 5 inserts business #2's `businesses` + `settings` rows into the same DB.

### 3. Deploy the API app (`api-acme.chomnenh.com`)
New hPanel Node website, from business #2's OWN repo:
- **Source:** the new repo (e.g. `OudomPanhaChea/acme.chomnenh.com`), branch
  **`api-deploy`**, entry `index.js`. (hPanel will again auto-detect the Next app
  in `client/` and cache root `client`; the `api-deploy` branch nests the server
  under `client/` to satisfy that. Same mechanism as business #1, different repo.)
- **Node:** 22. **Build:** `npm ci`. **Start:** `npm start`.
- **Environment variables** (note `BUSINESS_ID=2` and the acme origin):

```env
NODE_ENV=production
BUSINESS_ID=2
DB_HOST=<same as business #1, from hPanel>
DB_USER=<same DB user>
DB_PASSWORD=<same DB password>
DB_NAME=<same database name>
JWT_SECRET=<a FRESH long random string, different from business #1>
JWT_EXPIRES=7d
CLIENT_ORIGIN=https://acme.chomnenh.com
ADMIN_NAME=Owner
ADMIN_EMAIL=<the acme owner's email>
ADMIN_PASSWORD=<temporary, change after first login>
BUSINESS_NAME=Acme
```

Do not set `PORT`. Use a **different `JWT_SECRET`** so a token from one business's
backend can never validate against the other's (defense in depth on top of the
`business_id`-in-JWT check).

Check: `https://api-acme.chomnenh.com/api/health` returns `{"ok":true}`.

### 4. Deploy the Web app (`acme.chomnenh.com`)
New hPanel Node website, from business #2's OWN repo:
- **Source:** the new repo, branch **`main`**, app root `client/`.
- **Node:** 22. **Build:** `npm ci && npm run build`. **Start:** `npm start`.
- **Environment variables:**

```env
API_ORIGIN=https://api-acme.chomnenh.com
API_ORIGIN_PIN_IP=156.67.222.87
NEXT_PUBLIC_SITE_URL=https://acme.chomnenh.com
```

`API_ORIGIN` must point at **this** business's API (`api-acme`), and it is read at
build time, so set it before the build. `API_ORIGIN_PIN_IP` is the same origin
server IP as business #1 (both sites live on the same server; confirm in hPanel).
Do NOT set `NODE_ENV=production` on the Web app (it breaks `next build`).

### 5. Seed business #2's owner
With the API app's env vars in place, SSH into the API app folder and run:

```bash
npm run seed
```

Because `BUSINESS_ID=2`, the seed inserts the business #2 row, its settings row,
and its owner from the `ADMIN_*` vars, all scoped to `business_id=2`. Business #1's
data is untouched. (The seed uses `INSERT IGNORE`, so re-running it is safe.)

### 6. Verify
- [ ] Login at `https://acme.chomnenh.com/login` with the acme owner, then change
      the password (Profile page).
- [ ] Header shows **Live**.
- [ ] The app is EMPTY (no products/clients/sales) — proves it is a fresh tenant,
      not showing business #1's data.
- [ ] Upload a product photo (`/uploads/img/<n>`); set the logo/banners/business
      name in Settings.
- [ ] Sell something on `/admin/pos`; the dashboard updates in realtime.
- [ ] **Purge the hCDN cache** in hPanel after the first deploy.

## Ongoing

- **Backups cover both** — one `mysqldump` of the shared DB backs up both
  businesses and all their images.
- **Watch DB size** in hPanel: two businesses' images share the one per-database
  cap.
- **Each business deploys from its own repo.** Pushing to business #1's `main`
  redeploys only business #1's apps; business #2's repo drives business #2's apps.
  This is the whole point of the separate-repo choice: their code evolves
  independently.
- **A schema migration is applied ONCE** to the shared DB in phpMyAdmin (one run
  covers both businesses), and the same migration file is committed to BOTH repos
  so their `schema.sql` stays the shared contract. See the CRITICAL section:
  additive/backward-compatible changes only.
- **Porting shared fixes is manual.** A bug fix or improvement made in one repo
  does NOT reach the other automatically — cherry-pick or merge it across. This is
  the cost of separate repos; budget for it.
