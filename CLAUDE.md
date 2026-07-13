# Chamnenh POS — Project Brief for Claude Code

> Read this first. Keep it updated whenever architecture, conventions, or status change.
> Last updated: 2026-07-11 (partner/wholesale sales: bulk units, bonus lines, optional stock)

## 1. What this project is

**Chamnenh** is a realtime POS system for sale-flow control: sell products, manage
inventory, remember clients, and report sales over any date range grouped by
day / month / year. It deliberately mirrors the stack and admin layout of
**WisePOS** (`E:\Wisestep\wisepos-system`) but is a simpler, retail-oriented rebuild.

**Tenancy model (since 2026-07-10):** one shared database, many businesses. Every table
carries `business_id` (FK to `businesses`); each backend deployment serves exactly ONE
business, pinned by the `BUSINESS_ID` env var (default 1), and every query scopes with it
(`server/config/business.js`). The JWT embeds `business_id` and `verifyToken` rejects
tokens from another business's backend. A second company later gets its own
frontend+backend deployment pointing at the same DB with `BUSINESS_ID=2` (seed creates
the business + settings rows). The app itself has no tenant-switching UI on purpose.

- **Owner / sole developer:** Oudompanha (Cambodia)
- **Working directory:** `E:\RCX\lucaci.chomnenh.com`
- **Production host:** `lucaci.chomnenh.com` on the company's Hostinger Business shared
  plan as two Node apps, web + `api.` subdomain (see DEPLOYMENT-HOSTINGER.md; the VPS
  route in DEPLOYMENT.md is the fallback). Repo: github.com/OudomPanhaChea/lucaci.chomnenh.com.
- **Brand:** spelled **Chomnenh** (per the logo; earlier docs said "Chamnenh"). Colors: primary `#304A59`,
  ink `#142332`, accent orange `#FFA040` (the logo dot). Assets in `client/public/images/`:
  `Chomnenh-logo.png` (wordmark, dark; use `Chomnenh-logo-white.png` on dark surfaces),
  `Chomnenh-banner.jpg` (1920x1080, used as the og:image link cover),
  `chomnenh-mark.png` (square "C + dot" monogram, generated). Regenerate icons
  (`app/icon.png`, `app/apple-icon.png`, `public/favicon.ico`, mark) with
  `node scripts/generate-icons.mjs` from `client/`.
- **Currency:** USD primary, KHR (៛) secondary via `settings.exchange_rate` (default 4100).
- **Language:** English only for now (unlike WisePOS there are no `_km` columns / i18n).

### Stack (same family as WisePOS)
| Layer | Tech |
|---|---|
| Frontend | Next.js 16 App Router (no locale segment), Ant Design 6, Tailwind 4, lucide-react, recharts, react-toastify, next-themes |
| Backend | Node.js + Express 5 (ESM) |
| Database | MySQL / MariaDB — `chamnenh_pos` |
| Realtime | Socket.IO — single `admins` room, events below |
| Auth | JWT in httpOnly cookie `chamnenh_token` (+ token returned in body for the socket handshake) |
| Barcode | `react-zxing` (zxing-wasm) camera scanning + keyboard-wedge scanner support in POS; decoder WASM served locally from `client/public/zxing_reader.wasm` (copied by `postinstall`) |
| Images | Stored in the DB (`images` table, MEDIUMBLOB) and served at `/uploads/img/:id` with immutable 30d caching; multer memory storage, controllers persist via `storeUploadedImage()` and clean up via `deleteUploadedFile()` (`server/middleware/upload.js`). Survives managed redeploys, one mysqldump backs up everything; needs `max_allowed_packet` >= 16MB. Legacy pre-change files still served from `server/uploads/` |

### Roles (`users.role`)
`owner` (full, only one manages staff/settings) · `admin` (manager: products, reports, void, clients delete) · `cashier` (sell, view products/clients).
Enforced server-side by `requireRole` in `server/routes/index.js`; sidebar items filtered by role in `admin-shell.tsx`.

## 2. Realtime events (Socket.IO)

Server emits to room `admins` (helper `emitToAdmins` in `server/config/socket.js`):
- `sale:created` / `sale:updated` / `sale:voided` — payload is the full sale with items
  and payments (`sale:updated` fires when a payment is received on an invoice)
- `product:changed` — `{ type: create|update|stock|delete|category, id? }`
- `client:changed` — `{ type, id }` (also fired when credit/deposits change a client)
- `settings:changed` — full settings row

Client: `services/socket.ts` (single shared socket, token from `/auth/me`), subscribe with
`hooks/useRealtime.ts` — pages re-fetch on relevant events.

## 3. Database (`server/database/schema.sql`)

Tables: `businesses`, `users`, `categories`, `products`, `product_units`, `clients`,
`sales`, `sale_items`, `stock_movements`, `payments`, `images`, `settings` (one row per business,
`UNIQUE(business_id)`; `banner_urls` is a JSON array of up to 4 menu banners).
Unique keys are per business: `(business_id, email)`, `(business_id, barcode)`,
`(business_id, name)` on categories, `(business_id, invoice_number)`.
Migrations live in `server/database/migrations/` (applied to the local DB;
apply on the VPS at deploy).

Key conventions carried over from WisePOS:
- **Global PK `id` is never shown to users.** Human-facing numbers are separate columns:
  `products.display_number`, `clients.display_number` (MAX+1 per business on create),
  `sales.invoice_number` = `INV-YYYYMMDD-NNNN` per-day counter.
- **Financial snapshots:** `sale_items` freezes `price/full_price/cost_price/discount_pct`;
  `sales` freezes `client_name`, `cashier_name`, `tax_rate`, `exchange_rate`, `total_cost`.
  History stays accurate when products/clients/settings change later.
- **Totals recomputed server-side** in `createSale` — the cart's displayed totals are never trusted.
- Sale creation locks product rows (`FOR UPDATE`) and rejects overselling; voiding restores
  stock. Every stock change writes a `stock_movements` row.
- **Credit sales + prepaid (2026-07-10):** `sales.status` is
  `paid|partial|unpaid|voided` with `sales.amount_paid`; anything not fully paid
  requires a `client_id`. `clients.credit_balance` holds prepaid money (deposits).
  Every money movement is a `payments` row (type `sale|deposit|refund`, signed
  amount, method incl. `credit` = spent from prepaid, which is NOT new money in).
  Voiding writes negative refund mirror rows and restores spent prepaid credit.
  Reports treat revenue as accrual (all non-voided sales) and expose
  `collected`/`outstanding` alongside.
- **Partner/wholesale (2026-07-11):** `clients.client_type` is `normal|partner`.
  `product_units` holds per-product bulk units ("Box of 12": `factor` pieces per unit,
  own `sell_price`, optional carton `barcode` scannable at POS). Stock stays counted in
  base pieces; a unit line moves `qty × factor` pieces. `sale_items` snapshots
  `unit_name`/`unit_factor` (NULL/1 = piece) and `is_bonus` (FREE goods with a bulk
  deal: price forced 0, stock and cost still tracked so profit shows the margin hit).
  Cart lines may send `unit_id`, `price` (negotiated override), `is_bonus`; the server
  resolves units/prices itself and accumulates per-product piece checks across lines.
  Void restores exactly what the sale's `stock_movements` took. Piece-count reports use
  `SUM(quantity * unit_factor)`.
- **Optional stock (2026-07-11):** `products.stock_qty` is nullable; NULL = not tracked
  (no oversell checks, no movements, never "low", `track_stock` field in the product
  form toggles it; turning tracking on logs an `initial` movement).
- Soft delete only on `products.is_deleted`; everything else hard-deletes.
- Money is `DECIMAL(10,2)`; DB session timezone pinned `+07:00` in `config/db.js`.
- Prices are tax-exclusive; single `settings.tax_rate` added at payment (0 by default).

## 4. Frontend conventions

- **Same-origin API:** axios `baseURL: "/api"`; `next.config.ts` rewrites `/api`, `/uploads`,
  `/socket.io` to the Express server (dev). Production uses nginx path routing — never an
  `api.` subdomain.
- **Semantic theme tokens** (`app/globals.css`): `bg-surface`, `bg-surface-raised`,
  `bg-surface-sunken`, `text-fg`, `text-fg-muted`, `text-fg-subtle`, `border-line`,
  `bg-brand`, `bg-brand-soft`, `bg-ink`. Never raw slate/white/indigo. Status tints need a
  `dark:` pair. `components/theme/theme-provider.tsx` bridges next-themes → AntD ConfigProvider;
  all AntD components theme automatically — never hand-darken one.
- **Fonts:** Fira Sans (body) + Fira Code (`font-mono`, use class `tabular` for numbers).
- Shared primitives in `components/ui/*`: `StatCard`, `StatusBadge`, `SectionHeader`,
  `EmptyState`, `Spinner`/`PageSpinner`. Reuse them, don't re-implement.
- Icons: lucide-react only, no emojis. All clickable elements get `cursor-pointer`.
- Auth: `hooks/useAuth.tsx` context; admin routes guarded by `app/admin/layout.tsx`.
- Hydration gates: `hooks/useMounted.ts` (useSyncExternalStore, not setState-in-effect).
- Design system reference: `design-system/chamnenh/MASTER.md` (user's brand colors override
  the palette suggested there).

## 5. Route map

Public: `/login`, `/menu` (read-only product menu for customers — preview only, no ordering;
gated by `settings.menu_public`).
Admin (auth): `/admin/dashboard` (realtime), `/admin/pos` (sell + scan + cart + pay + receipt),
`/admin/inventory` (products + categories + stock), `/admin/clients`, `/admin/invoices`,
`/admin/reports` (from/to + group day|month|year), `/admin/staff` (owner), `/admin/settings` (owner),
`/admin/profile` (any role: edit own name/email/phone, profile photo, change password;
`PUT /auth/profile` re-issues the JWT cookie since it embeds name/email; photo via
`POST/DELETE /auth/avatar` → `users.avatar_url`, files in `server/uploads/avatars/`,
old file deleted on replace; `/admin/settings/password` now redirects here).

API: see `server/routes/index.js` — it is the single routes file.

## 6. Commands

```bash
# server (E:\RCX\lucaci.chomnenh.com\server)
npm run dev        # nodemon with .env
npm run seed       # create owner account from ADMIN_* env vars
# import schema first: mysql -u root < database/schema.sql

# client (E:\RCX\lucaci.chomnenh.com\client)
npm run dev        # Next.js on :3000, proxies to API on :5001
npm run build
```

## 7. Status

### Done (v1, 2026-07-09)
- Server: complete and smoke-tested against local XAMPP MariaDB (login, multipart product
  create, barcode lookup, transactional sale INV-20260709-0001 with stock decrement and
  change calc, reports, public menu, void with stock restore — all verified via curl).
- Client: `next build` passes with all 13 routes. Pages: login, dashboard (realtime),
  POS (grid + camera/wedge barcode + cart + payment + receipt print), inventory
  (products/categories/stock/history), clients (+purchase drawer), invoices (filters,
  detail, void, reprint), reports (range + day/month/year grouping + CSV), staff,
  settings (+password), public /menu.
- Docs: README.md (setup), DEPLOYMENT.md (VPS + nginx + Hostinger DNS + image storage).
- Local dev: `server/.env` exists (root/empty XAMPP MariaDB, db `chamnenh_pos`, seeded
  owner `admin@chamnenh.com` / `admin12345`). Test data in DB: 1 product (Coca Cola,
  barcode 8851959132014), 1 client (Sok Dara), 1 voided sale.

### Gotchas discovered
- Product create/update routes parse **multipart only** (multer). There is no
  `express.urlencoded` middleware — send FormData (client does) or curl `-F`.
- PowerShell 5.1 `Invoke-RestMethod` with a hashtable body sends urlencoded, which the
  products route ignores — use `curl.exe -F` for manual testing.

### Done (2026-07-09, after v1)
- Branding: logo delivered (spells "Chomnenh"). Wordmark in sidebar/login, square monogram
  favicon + apple icon generated from it, og:image/twitter card = Chomnenh-banner.jpg,
  metadataBase from `NEXT_PUBLIC_SITE_URL` (defaults to https://lucaci.chomnenh.com).
  UI brand strings switched Chamnenh → Chomnenh (schema default too; existing DB row
  `settings.business_name` still says "Chamnenh", owner can edit in Settings).
- `/admin/profile` page + `PUT /auth/profile` (smoke-tested: update, dup-email 409, bad email 400).
- Hydration mismatch on `<body>` fixed with `suppressHydrationWarning` (browser extensions
  inject attributes pre-hydration).
- Profile photos: `users.avatar_url` column (schema + live DB), avatar upload/remove
  smoke-tested end to end (upload, replace deletes old file, remove).
- Camera barcode scanner crash fixed: `Html5Qrcode` was constructed before the AntD Modal
  portal mounted the region div ("HTML Element with id=... not found"). The camera
  lifecycle now lives in a child component that renders the div itself; camera errors
  (permission denied, no camera, non-HTTPS page) show in the modal. Reminder: getUserMedia
  only works over HTTPS or localhost — a LAN-IP dev URL cannot open the camera.

### Done (2026-07-10)
- Camera scanner rebuilt on `react-zxing` (replaces `html5-qrcode`, which drew its own
  qrbox overlay that misaligned into a "split" viewfinder and decoded slowly). Same
  `BarcodeScanner` props (open/onClose/onScan/continuous). Speedups: 720p stream,
  80ms between decode attempts (default was 300ms), restricted format list, `trySkew`
  for tilted codes. The zxing WASM decoder is served from `client/public/zxing_reader.wasm`
  so scanning works offline; `postinstall` re-copies it from `node_modules/zxing-wasm`
  after every install (keep the copy in sync if that package is upgraded).
- Scan feedback beep: `client/public/audios/barcode-beep.mp3` (user-supplied) plays on each
  accepted scan via one shared Audio element (rewind-and-replay, so a new scan cuts the
  previous beep). Camera permission persistence is browser-side; the modal shows a
  one-time hint (Permissions API state "prompt") to pick "Allow on every visit".

### Done (2026-07-10, batch 2)
- **Tenancy**: `businesses` table + `business_id` on every table/query (see section 1).
  Migration `2026-07-10-tenancy-and-branding.sql` applied to the local DB.
- **Branding uploads**: `POST/DELETE /settings/logo`, `POST/DELETE /settings/banners`
  (max 4, `?url=` on delete), files in `server/uploads/branding/`, owner-only.
  `settings` responses always include a parsed `banners: string[]`; `updateSettings`
  no longer touches `logo_url` (upload endpoints own it). All image uploads
  (product/avatar/branding) share one 5MB multer limit (`MAX_IMAGE_BYTES`), and the
  client pre-validates via `lib/images.ts` (`validateImageFile`, toasts on reject).
- **Image cropping**: `antd-img-crop` wraps the AntD Uploads for profile avatar
  (round, 1:1), settings logo (1:1) and menu banners (3:1). Product images are
  validated but not cropped.
- **Toasts**: draggable/swipe to dismiss, restyled on surface tokens in `globals.css`
  (`--toastify-*` vars + status left-border accents), full-width stack under 480px.
- **POS scan feedback is sound-only**: `lib/sound.ts` has `playScanBeep` (mp3) and
  `playScanError` (same mp3 at 0.45x rate = low buzz). No toasts for barcode
  read/not-found; wedge scans beep/buzz too; over-stock still toasts a warning + buzz.
- **Header**: business logo + name (live via `settings:changed`) before the Live pill;
  the pill got explanatory tooltips. **Always-Offline bug fixed**: socket.io was forced
  websocket-first, which Next dev rewrites can't proxy; now default transports
  (polling → websocket upgrade), and the indicator re-subscribes once the user loads.
- **Sidebar**: desktop collapse toggle moved to the bottom of the sider; on small
  screens (breakpoint `lg`) the sider is a fixed overlay with a backdrop, closes on
  backdrop tap or nav click; header shows a hamburger only on mobile.
- **Public menu**: banner carousel (scroll-snap, auto-advance 4.5s, dots, no library)
  above the search; admin "Public menu" link is a plain `<a target="_blank">`.

### Done (2026-07-10, batch 3): payments, credit sales, prepaid balances
- Schema migration `2026-07-10-payments-and-credit.sql` (applied locally): sales
  status enum + `amount_paid`, `clients.credit_balance`, `payments` ledger table
  (see section 3). Backfills ledger rows for pre-existing paid sales.
- Server: `createSale` accepts `amount_paid` (money now) + `use_credit` (spend
  prepaid first); unpaid remainder requires a client; client row locked FOR UPDATE.
  New endpoints: `POST /sales/:id/payments` (receive payment, method `credit`
  spends prepaid), `POST /clients/:id/deposits`, `GET /clients/:id/statement?from&to`
  (sales + ledger + period totals + overall owing/prepaid). All smoke-tested via
  curl (deposit, unpaid→partial→paid-by-credit, overpay 409-style 400, prepaid
  checkout, void restores credit + refund mirrors, reports collected/outstanding).
- POS: payment modal has prepaid-balance switch, "Paying now" input (partial /
  0 = pay later; amber/rose notices, client required to owe), change computed
  against paying-now; client hint line shows Prepaid/Owes; receipt prints
  Paid + BALANCE DUE when not settled.
- Invoices: status filter paid/partial/unpaid/voided, Balance column, drawer
  shows Paid/Balance rows + payment history, "Receive payment" button
  (`components/receive-payment-modal.tsx`, shared), void allowed on any
  non-voided status (voided badge is now slate, unpaid rose, partial amber).
- Clients: Owing + Prepaid columns (Sex column dropped from table, still in the
  edit form); drawer widened to 720 with date-range filter (presets), period
  summary (purchases/purchased/paid/owing), tabs for purchase history (per-row
  Pay button) and payments/deposits ledger, "Add deposit" modal.
- Dashboard: 5th stat card "Outstanding" (receivables total + open invoice
  count, realtime). Reports: Collected card with outstanding hint; revenue is
  accrual. `client/next build` passes (17 routes).

### Done (2026-07-10, batch 4): Hostinger deployment prep
- Decision: deploy on the company's Hostinger Business shared plan (owner rejected VPS)
  as two hPanel Node apps: `server/` on `api-lucaci.chomnenh.com` (hPanel rejects
  two-level subdomains like `api.lucaci`), `client/` on
  `lucaci.chomnenh.com` with `API_ORIGIN` env; Socket.IO degrades to long-polling
  through the Next rewrite (that's fine, don't force websocket). Full steps in
  **DEPLOYMENT-HOSTINGER.md**; DEPLOYMENT.md (VPS) demoted to fallback.
- Image uploads moved into the database (owner rejected Cloudinary; a Cloudinary
  mode was built first, then replaced same day). New `images` table (migration
  `2026-07-10-image-blobs.sql`, applied locally; also in schema.sql), multer memory
  storage, `storeUploadedImage(file)` returns the `/uploads/img/:id` URL stored in
  `*_url` columns, `serveStoredImage` handles GET with immutable caching (ids never
  reused), `deleteUploadedFile` deletes the row (or unlinks legacy disk files).
  Smoke-tested end to end incl. a 4MB upload, replace-deletes-old-row, remove.
  Local XAMPP MariaDB had `max_allowed_packet=1M` which breaks >1MB image INSERTs;
  raised to 16M live and in `C:\xampp\mysql\bin\my.ini`. DB size is the tradeoff
  the owner accepted: images count against Hostinger's per-database cap.
- `npm start`/`seed` now use `--env-file-if-exists` (Node 22.9+) so they run with
  hPanel-injected env vars. `.env.example` gained `BUSINESS_ID`. `trust proxy` was
  already set; behind Hostinger's proxy + Next it may need `2` (guide's gotchas).

### Done (2026-07-11): partner/wholesale sales
- Migration `2026-07-10-partner-units.sql` (applied locally, in schema.sql too):
  `product_units`, `clients.client_type`, nullable `products.stock_qty`,
  `sale_items.unit_name/unit_factor/is_bonus` (details in section 3).
- Server: products CRUD takes a `units` JSON field (replace-all per save) and
  `track_stock`; barcode lookup also matches carton barcodes (`matched_unit_id`);
  createSale resolves `unit_id`/`price` override/`is_bonus` server-side. All
  smoke-tested via curl (unit sale with negotiated price + FREE bonus + untracked
  product, oversell in pieces, wrong-unit reject, untracked adjust reject, void
  restore, tracking on/off toggle, unit replace).
- Client (`next build` passes, 17 routes): inventory form has a Track-stock switch
  and a bulk-units editor, stock column shows "Not tracked" or a boxes hint; POS cart
  lines are product+unit keyed with a unit picker, editable line price, and a Gift
  (FREE bonus) toggle, unit barcodes add the whole box, stock capped in pieces across
  lines; clients page has a Normal/Partners filter, partner tag, and Type field;
  invoices drawer and receipt print unit names, pieces, and FREE lines.
- Toasts now use react-toastify v11 `stacked` mode: they pile with the newest in
  front instead of pushing a growing column (hover/tap expands the pile).
- Local dev gotcha: XAMPP MariaDB logs "LSN is in the future" InnoDB errors at start
  (leftover unclean state) but runs fine; if it is down, start
  `C:\xampp\mysql\bin\mysqld.exe --defaults-file=C:\xampp\mysql\bin\my.ini`.
  Test data added: product #4 Vitamin C Serum (barcode SERUM001, unit "Box of 12"
  barcode BOX12TEST), #5 Gift Wrapping (untracked), client #3 Sokha Distribution
  (partner), one voided wholesale invoice.

### Done (2026-07-11, batch 2): POS/clients/inventory UX pass
- POS partner-mode clarity: cart border + a banner strip under the cart header turn
  amber with a Handshake icon on "Partner sale: name" (brand-tinted "Client sale" for
  normal named clients, nothing for walk-in); client Select shows warning (orange)
  status when a partner is selected, dropdown options render an amber Partner pill +
  "owes $X"; in partner mode product cards show the largest bulk unit's price.
- POS cart: quantity is now a typeable InputNumber (bulk qty like 50 boxes),
  negotiated price overrides get warning status + struck list price in the line
  summary (clearing the input returns to list price), Total row enlarged.
- Payment modal: header card shows client name + Partner pill (amber tint on partner
  sales), method Segmented has lucide icons, "Paying now" has Full / Pay later chips,
  cash gets quick-amount chips (Exact, $5-$100, disabled below amount due), and a
  summary box previews Prepaid applied / Paying now / Owing after + the resulting
  invoice StatusBadge. Quick-add client modal gained a Normal/Partner Segmented.
- Inventory product form: split into labeled sections (Details / Pricing / Stock /
  Bulk units / Image and visibility) via a local FormSection divider, body scrolls at
  70vh so footer buttons stay visible, units editor gained column headers, Track
  stock is a bordered row with explanation. Stock adjust modal shows current stock,
  Segmented direction, and an "After applying: N pcs" live preview (rose if negative).
- Clients: filter Segmented shows counts, partner rows get amber Handshake avatars,
  form type is a full-width Segmented, statement drawer title shows a Partner tag.
- Global slim scrollbars in globals.css (`scrollbar-width: thin` + 6px ::-webkit
  rules on `*`, thumb = --line-strong).

### Done (2026-07-11, batch 3): app-wide UI polish pass
- Reusable `components/ui/button.tsx` (re-exports AntD Button); every page imports
  Button from it now. Button heights raised app-wide via ConfigProvider component
  tokens in theme-provider (38/44/28px), which also covers Modal/Popconfirm footers.
- All 9 Modals are `centered`. RangePicker is single-column under 640px via
  globals.css (second panel hidden, its nav arrows re-enabled, presets become a
  chip row on top of the calendar).
- POS: page fills the viewport on xl (`100dvh-6.5rem`), cart is full height
  (24rem xl / 26rem 2xl; owner asked for wider then dialed it back down). Product cards fixed: `flex flex-col` on the card
  button (a bare `<button>` vertically centers content, so images drifted down on
  grid-stretched cards) + shorter `aspect-[4/3]` image, price row pinned bottom
  with `mt-auto`. Payment modal decluttered: neutral header (amber bg dropped,
  Partner pill kept), prepaid/owing lines in neutral ink, owing notice brand-soft;
  rose reserved for errors.
- Invoices drawer: payments listed newest-first (server sends oldest-first),
  meta/totals in sunken cards. Clients: filter Segmented gained `Owing (n)`.
- Charts on validated tokens `--chart-1` (blue) / `--chart-2` (orange, logo
  family) in globals.css, light+dark variants pass the dataviz CVD/contrast
  validator. Both charts are shadcn-style gradient AreaCharts (reports was
  bar+line; revenue/profit now overlap, not stacked, since profit ⊂ revenue).
  `components/ui/chart.tsx` has the shadcn-look `ChartTooltipContent` /
  `ChartLegendContent` + `ChartConfig` for Recharts on our surface tokens.

### Done (2026-07-13): deployed to production (Hostinger)
- Live: web `lucaci.chomnenh.com` (GitHub deploy, branch `main`, root `client`),
  API `api-lucaci.chomnenh.com` (branch `api-deploy`; hPanel rejects two-level
  subdomains AND permanently caches root dir "client" for this repo, so the
  generated branch nests the server app under `client/`;
  `.github/workflows/sync-api-deploy.yml` regenerates it on server/** pushes to
  main — verified). DB `u189356587_chomnenh`, `DB_HOST=127.0.0.1` (localhost →
  ::1 gets access denied), `max_allowed_packet` 1GB. Owner seeded via SSH
  (port 65002; Node at `/opt/alt/alt-nodejs22/root/usr/bin`; panel env vars not
  visible in SSH — temp `.env` used then deleted). Owner `lucaci@chomnenh.com`,
  business "Lucaci". Full prod env in `server/.env.production` (gitignored).
- Gotchas fixed during deploy: client app must NOT set `NODE_ENV=production`
  (npm skips devDependencies → build broke; build-time deps also moved to
  `dependencies`); schema.sql no longer has CREATE DATABASE/USE (phpMyAdmin
  shared-hosting import); DEPLOYMENT-HOSTINGER.md updated throughout.

### Done (2026-07-13, batch 2): post-launch fixes + clients analytics
- **Prod "Offline" pill fixed**: Next 308-redirects `/socket.io/` (trailing slash)
  before rewrites run in production, killing the polling handshake. Two-part fix:
  `skipTrailingSlashRedirect: true` in next.config.ts, and `services/socket.ts`
  connects straight to `NEXT_PUBLIC_API_ORIGIN` when set (add it to the hPanel
  Web app env = https://api-lucaci.chomnenh.com, then rebuild; API CORS already
  allows it, verified live with curl). Guide updated.
- Light theme is the default (`defaultTheme="light"`, system still selectable).
- Public menu: banner carousel rebuilt on transforms (pointer-swipe, wrap-around
  loop, arrows on sm+, dots, auto-advance pauses while held) — the old scroll-snap
  track showed a scrollbar because the unlayered `* { scrollbar-width: thin }` in
  globals.css beats Tailwind's layered utilities (new unlayered `.no-scrollbar`
  class is the escape hatch). Products now grouped under category section
  headings when browsing All (chips/search switch to a flat grid), footer
  rebuilt (logo, tel: link, address, preview note, copyright).
- Charts: server zero-fills series so they always span the full window ending
  today (`fillSeries` in reports.controller; dashboard reads DB CURDATE() to stay
  on +07:00). Dashboard chart window selectable 7/14/30 days (`?days=`).
- Clients: `total_spent` = SUM(amount_paid) (money received, excludes owing);
  `total_items` (pieces) on the list + statement `period.total_items`; table
  ranks best clients (global rank by spent→items→purchases, top 3 get a trophy,
  default sort by rank, replacing the # column); statement gained a Products tab
  (per-product qty/total ranked by total, neutral single-color bars) and
  payments rows flag `is_paydown` (sale payment >10s after the sale = paying
  owing) shown as a neutral "Paydown" pill. All smoke-tested via curl locally.

### Pending / decisions to revisit
- Khmer i18n intentionally skipped in v1.
- Internal identifiers (package name `chamnenh-client`, DB `chamnenh_pos`, cookie
  `chamnenh_token`) keep the old spelling on purpose; renaming them is churn.

## 8. Owner's preferences (same person as WisePOS)

- Simple solutions reusing existing infrastructure; no over-engineering.
- Read existing code first, patch focused — no whole-file rewrites unless needed.
- No spaced em dash (" — ") in user-facing strings; use period/comma/colon.
- When uncertain, ask one question rather than assume.
