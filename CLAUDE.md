# Chamnenh POS — Project Brief for Claude Code

> Read this first. Keep it updated whenever architecture, conventions, or status change.
> Last updated: 2026-07-20 (PWA pull-to-refresh + mobile drawer swipe + socket resume-on-wake)

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
- `bonus:changed` — `{ type: create|delete, id, client_id }` (partner bonus awards)

Client: `services/socket.ts` (single shared socket, token from `/auth/me`), subscribe with
`hooks/useRealtime.ts` — pages re-fetch on relevant events.

## 3. Database (`server/database/schema.sql`)

Tables: `businesses`, `users`, `categories`, `products`, `product_units`, `clients`,
`sales`, `sale_items`, `stock_movements`, `payments`, `bonuses`, `bonus_items`, `images`,
`settings` (one row per business,
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
- **Old owing (2026-07-20):** `clients.opening_owing` = REMAINING pre-system debt
  entered as a plain amount (no items/invoice; payments types `owing_add` = debt
  recorded, not money, and `owing_pay` = money received against it). Client
  `outstanding` everywhere (list, statement overall, dashboard receivables) is
  invoice outstanding + opening_owing; per-period figures and reports exclude it
  (it belongs to no period and is never revenue).
- **Partner/wholesale (2026-07-11):** `clients.client_type` is `normal|partner`.
  Since 2026-07-15 every product names its own base unit (`products.base_unit`,
  default 'pcs': tubes, bottles, ampules ...) used in all displays; "pieces"
  below means "base units of that product".
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
  `EmptyState`, `Spinner`/`PageSpinner`, `ImageDropzone` (drag-and-drop upload with
  crop/zoom/rotate editor; use it for every image upload). Reuse them, don't re-implement.
- Icons: lucide-react only, no emojis. All clickable elements get `cursor-pointer`.
- Auth: `hooks/useAuth.tsx` context; admin routes guarded by `app/admin/layout.tsx`.
- Hydration gates: `hooks/useMounted.ts` (useSyncExternalStore, not setState-in-effect).
- Design system reference: `design-system/chamnenh/MASTER.md` (user's brand colors override
  the palette suggested there).

## 5. Route map

Public: `/login`, `/menu` (read-only product menu for customers — preview only, no ordering;
gated by `settings.menu_public`).
Admin (auth): `/admin/dashboard` (realtime), `/admin/pos` (sell + scan + cart + pay + receipt),
`/admin/inventory` (products + categories + stock), `/admin/clients` (card grid) +
`/admin/clients/[id]` (client details: statement tabs + owing statement paper), `/admin/invoices`,
`/admin/reports` (from/to + group day|month|year), `/admin/bonus` + `/admin/bonus/[id]`
(owner/admin: partner bonus awards + JPG paper), `/admin/staff` (owner), `/admin/settings` (owner),
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

**Never test on the production business.** A sale must be voided before it can be deleted
(`DELETE /sales/:id` rejects any non-voided invoice, see 2026-07-21), and a deleted
invoice's number is retired, never reused, so a test sale still burns an invoice number
even after cleanup. To test against real data, clone the prod DB locally (`mysqldump` from
hPanel → import into the local `chamnenh_pos`; the dump carries `business_id=1`, which the
local default already matches). Only host-specific behaviour (hCDN, PWA on a real iPad,
Socket.IO through Hostinger's proxy) needs a staging clone: a second DB restored from a prod
dump plus 2 more hPanel apps on `staging-`/`api-staging-` subdomains, still `BUSINESS_ID=1`.
Do NOT stage as `BUSINESS_ID=2` on the live DB: one bad scoping bug would leak test sales
into the owner's reports, and 2 staging apps + 2 for a real second business exceeds the
5-app plan limit.

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

### Done (2026-07-14): prod login 429s + hCDN cache poisoning
- **Login 429 for everyone fixed**: behind Hostinger's proxy + the Next rewrite,
  `trust proxy = 1` resolved every user to the same IP, so the login limiter's
  bucket was shared globally. `loginLimiter` now keys on the leftmost
  `X-Forwarded-For` entry (`ipKeyGenerator`), counts only failed attempts
  (`skipSuccessfulRequests`), and returns a JSON message. Added a second
  per-account limiter: 5 failed attempts on one email = 10 min block, any IP.
  Both verified locally (per-IP and per-email buckets independent, successes
  never count). Limiter store is in-memory; restarting the API app resets it.
- **"This page couldn't load" / random full reloads in prod fixed**: Hostinger's
  hCDN caches responses but ignores `Vary: RSC`, while Next static-prerendered
  the client pages with `s-maxage=31536000`. HTML and RSC payloads of the same
  URL shared one edge-cache slot: cached HTML broke SPA navigation (hard-reload
  fallback), cached RSC served as the document gave Chrome's error page.
  Verified live (RSC request on /admin/reports returned the cached HTML, HIT).
  Fix: `export const dynamic = "force-dynamic"` in `app/layout.tsx`; all 14
  routes now build as ƒ dynamic with `Cache-Control: no-store` (hCDN: DYNAMIC,
  never cached). **After deploying, purge the CDN cache in hPanel** or poisoned
  entries persist. Hostinger origin perf itself is fine (~0.35s responses).
- `next-env.d.ts` untracked + gitignored: dev vs build rewrite it back and
  forth (`.next/dev/types` vs `.next/types`), keeping git perpetually dirty;
  `next build` regenerates it so deploys are unaffected.

### Done (2026-07-14, batch 2): unified drag-and-drop image uploads + edit
- New `components/ui/image-dropzone.tsx`: native drag-and-drop frame (no antd
  Upload.Dragger — a first version on Dragger collapsed to zero height because the
  frame depended on antd's internal 100%-height chain; sizes now sit on the frame
  itself). Every image, new or already saved, goes through
  `components/ui/image-crop-modal.tsx`: a react-easy-crop editor (zoom, rotate,
  reset, ratio presets via `aspectSlider`, round crop for avatars) exporting through
  a canvas capped at 2048px, JPEG 0.9 (PNG stays PNG). antd-img-crop was REMOVED
  from package.json (it can't re-edit existing images); react-easy-crop added.
  Filled previews get always-visible corner Edit (fetch current URL → blob → editor)
  and Remove (Popconfirm) buttons + hover/drag-over "Replace" overlay; empty state is
  a dashed drop target with brand highlight; busy = spinner overlay. Exposes
  `ImageDropzoneHandle` (`browse`/`editCurrent`) via ref for controls that live
  outside the frame. Verified with headless-Edge screenshots of a temp harness page.
- Used by: inventory product form (deferred: cropped File in state with blob-URL
  preview, uploaded on save; ratio presets, contained preview; visibility switches
  restyled as bordered rows), settings logo (square dropzone), settings banners
  (each banner tile is itself a dropzone: drop/click replaces via delete-then-add
  `replaceBanner`, edit re-crops, X removes; add tile 3:1), profile avatar (the
  circle is the drop target, round crop; corner actions clip on circles so
  `cornerActions={false}` + "Edit photo · Remove photo" links drive the ref).
- Polish pass (same day): empty dropzones get a faint dot-grid texture + icon
  lift/brand-fill on hover, filled previews zoom slightly on hover, corner buttons
  are blurred glass; crop modal has a dark checkerboard canvas and a labeled
  Ratio/Zoom/Straighten control panel with live readouts and a rotate-90° button;
  product form toggle rows (Track stock / Show in menu / Active) carry brand-soft
  icon chips (Boxes/Globe/BadgeCheck); settings logo shows a live "header preview"
  pill (logo + business name) and banner tiles a "Slide n" order badge; profile
  avatar sits in a brand→#FFA040 gradient ring and the camera badge is a real
  button (`avatarRef.browse()`).

### Done (2026-07-14, batch 3): inventory page split + inline category add
- `app/admin/inventory/page.tsx` (900 lines) split into `components/inventory/`:
  `product-table.tsx` (presentational, callbacks up), `product-form-modal.tsx`
  (owns its form/image/scanner state, populates via effect on open),
  `categories-drawer.tsx`, `stock-adjust-modal.tsx`, `stock-history-drawer.tsx`
  (the last three own their API calls; page keeps data + filters, ~180 lines).
- New `components/inventory/category-select.tsx`: searchable category Select for
  the product form with inline create — type a name that doesn't exist and an
  `Add "name"` button appears in the dropdown (antd 6 `popupRender`), POSTs
  /categories and selects the result; parent appends via `onCreated`. Custom
  form controls MUST forward the Form.Item-injected `id` prop to the antd
  control or the label htmlFor link breaks. Filter-bar category Select gained
  plain `showSearch`. Verified end to end in headless Edge (recipe persisted in
  `.claude/skills/verify/SKILL.md`).

### Done (2026-07-14, batch 4): partner Bonus page (Accounting)
- New sidebar item Accounting > Bonus (`/admin/bonus`, owner/admin, Gift icon).
  Rewards partner clients for fully paid invoices (status `paid` only; FREE
  `is_bonus` lines excluded everywhere) in a user-picked period. Awards are
  records + paper only: payments ledger and credit_balance untouched.
- Flow (v2 after owner UX review, same day): the detail page starts with an
  **invoice selection** list (every paid invoice in the period, ALL selected
  by default; unticking removes it from both levels). Two independent,
  optional levels, each behind its own Switch: **Item quantity bonus** FIRST
  (used most; lines whose piece count qty x unit_factor per invoice+product
  reaches a "Min. pieces" limit, grouped under invoice headers, per-row %/$
  Segmented) and **Invoice total bonus** second (pct of the SELECTED invoices'
  sum OR a fixed amount, live calculation shown). Sticky summary aside shows
  invoices selected / item bonus / invoice bonus / total, overlap-with-past-
  bonus warning, note, save. Decorative accents use brand tokens, not amber
  (owner asked; amber kept only for semantic warnings).
- Schema: `bonuses` + `bonus_items` (migration `2026-07-14-bonuses.sql`,
  applied locally; snapshots client_name/invoice_number/product_name so
  history survives deletes). `bonuses.invoice_numbers` = JSON array snapshot
  of the selected invoices; `level1_type` percent|fixed|NULL (NULL = invoice
  level not awarded; "level1" columns = the invoice-total level even though
  the UI shows it second). Server `bonuses.controller.js`: GET /bonuses/clients
  (partner cards + period aggregates + all-time bonus totals), GET
  /bonuses/clients/:id (invoices, per-invoice item lines, history), POST
  /bonuses (body has invoice_ids + level1 {type,pct,amount} + items; ALL
  amounts recomputed server-side from the selected invoices, never trusted;
  item lines matched by sale_id + product_id <=> + name_snapshot and must
  belong to a selected invoice), DELETE /bonuses/:id. Manager-gated; emits
  `bonus:changed`. Smoke-tested via curl: pct + fixed, unknown-invoice reject,
  empty-selection reject, 0-100 pct reject, delete, aggregates.
- Bonus paper: `components/bonus/bonus-paper.tsx`, **A4 portrait** (794x1123
  css px), brand-colored (navy #304A59 header band + total panel, #FFA040
  accent bar/ticks, hardcoded hex so the export ignores theme), Ref
  BON-0000 number, item table + invoice-total box listing the selected
  invoice numbers, thousand-separated local `usd()`, signatures, footer. `bonus-paper-modal.tsx` (width 900) downloads
  via **html-to-image** `toJpeg` (pixelRatio 2). html2canvas was NOT used on
  purpose: it can't parse Tailwind 4's oklch colors; html-to-image renders
  through SVG foreignObject so oklch + self-hosted fonts just work.
- E2E verified headless (scratchpad verify-bonus.js per the verify skill):
  select-all default, both levels, summary math cross-checked against the
  API, save, paper modal, real JPG download, history, cleanup.

### Done (2026-07-14, batch 5): comma thousands separators everywhere
- `lib/format.ts`: `money()` now outputs `$1,234,567.50` (negatives as `-$x`),
  new `num()` formats counts/quantities with commas, `khr()` pinned to en-US.
  Applied to every raw count render: dashboard stat cards + low-stock badges,
  reports (Y axes, top products/clients, invoice stats), inventory stock column,
  stock adjust/history, POS stock hints + pcs lines, clients table + statement,
  receipt + invoice detail quantities. CSV export stays comma-free on purpose.
- New `components/ui/input-number.tsx` wraps AntD InputNumber with a comma
  formatter/parser (integer part only, decimals untouched); every page now
  imports InputNumber from it (same pattern as `ui/button.tsx`).

### Done (2026-07-15): named base units per product + real-unit bonus lines
- Migration `2026-07-15-base-units.sql` (applied locally, in schema.sql):
  `products.base_unit` VARCHAR(30) default 'pcs' (the word one stock count
  means: tubes, bottles, ampules ...) and `bonus_items.qty_desc` VARCHAR(190)
  (human snapshot like "2 × Box of 8 + 5 ampules"). Stock/sale math is
  UNCHANGED: stock stays counted in base units, `product_units.factor` and
  `sale_items.unit_factor` still convert, sales still snapshot unit_name/factor.
- Server: products CRUD takes `base_unit`; `getSaleWithItems` and the client
  statement products tab LEFT JOIN products for `base_unit` (soft delete keeps
  the join stable); bonuses controller aggregates sale_items per invoice +
  product + unit and returns `qty_desc` + `base_unit` per eligible line, and
  createBonus recomputes + stores `qty_desc` into bonus_items.
- Product form: "Units" section = base-unit AutoComplete (free text with
  suggestions) + relative bulk-unit editor: each row is "1 <name> has <qty> of
  <base unit | a unit defined above it>" ("1 Case = 4 × Box of 8"), live
  "= 32 ampules" hint, factor resolved to base units on submit (rows may only
  reference rows above them, so no cycles; a dangling reference blocks save).
- Every hardcoded "pcs" now shows the product's base unit: inventory stock
  column/adjust/history, POS stock toasts + line hints + the cart unit picker's
  first option, invoice detail, receipt, clients statement products tab.
- Bonus detail page reworked to recommendation "C": ALL item lines of the
  selected invoices are listed (no hidden lines) with real-unit quantities
  ("2 × Box of 8 + 5 ampules = 21 ampules"); "Min. pieces" filter replaced by a
  quick-tick helper ("Tick lines with at least N" + Apply, counted in base
  units) that (un)ticks checkboxes without hiding anything. Cross-product
  aggregate labels say "items" (mixed units); the bonus paper Quantity column
  prints qty_desc (old rows fall back to the pieces number).
- Smoke-tested via curl on a second server instance (PORT=5002): base_unit
  create/update, mixed-unit paid sale carrying base_unit on items, bonus detail
  qty_desc, bonus save storing qty_desc, delete/void/cleanup. `next build`
  passes. NOTE: local dev API was running plain `node` (no nodemon), so it
  serves old code until restarted.

### Done (2026-07-15, batch 2): quantities display as units-as-sold everywhere
- Owner rule: NEVER show base-unit conversions to the user. A sale of 1000
  "lo" displays as "1000 lo" (qty_desc format is now "1000 lo + 20 pcs", no
  "×", no "= N pcs" suffix). Internally stock/oversell math still uses
  unit_factor; only DISPLAYS changed.
- Shared helper `server/config/units.js`: `composeQtyDesc(parts, baseUnit)` +
  `mergeUnitRows(rows, keyOf, sumFields)` (merge per-unit GROUP BY rows into
  one line per product with a composed qty_desc). Used by bonuses, clients
  statement products, reports top_products.
- All count aggregates switched from SUM(quantity*unit_factor) to
  SUM(quantity): reports items_sold (summary + dashboard), listSales +
  statement item_count, clients total_items (list + period), bonus clients
  cards `qty`, bonus detail invoices `qty` / period.qty / item lines `qty`
  (quick-tick threshold now counts units as sold). Removed the "= N pcs"
  hints from receipt, invoice detail, and POS cart lines; inventory stock
  hint reads "≈ 4 Box of 12".
- Bonus page UX: bulk-helper bar ("Tick lines with at least N" + "Give every
  ticked line X% Apply"), per-invoice header checkbox ticks/unticks that
  invoice's lines, whole line label is clickable, ticked rows highlighted
  brand-soft, "n lines ticked" chip in the section header.
- Smoke-tested on PORT=5002: bonus detail ("1000 lo"), saved bonus_items
  qty_desc "1000 lo", reports top_products "1000 lo + 3000 pcs + 1000 box",
  statement products, dashboard items_sold. `next build` passes.

### Done (2026-07-15, batch 3): bonus detail page tablet/phone pass
- Owner's staff use tablets/phones, rarely laptops. Below xl the summary aside
  used to land after everything; now: history section moved OUT of the left
  column to full width below the grid, and a **floating save bar** (sticky
  bottom-3, xl:hidden, blur card) keeps the live total + Save reachable while
  ticking lines (sticky not fixed, so it settles into flow at page end and
  never covers the sider). Item-line reward controls (Segmented/%input/amount)
  wrap as one right-aligned group under the name on narrow widths
  (label flex-[1_1_15rem]); bulk-helper labels stack full-width under sm;
  inputs/buttons bumped from size=small to default for touch. Stats grid is
  2-col on phones with "Paid total" spanning both (StatCard gained an optional
  `className` prop for such grid spans + `sm:order-*` reorder).
- Owner edits (respect these): invoice rows no longer auto-select on load
  (the select-all-by-default effect was removed) and the per-invoice
  "N items" span in the selection list is commented out.
- Verified with headless Edge screenshots at 820x1180 and 390x844
  (scratchpad verify-bonus-responsive.js per the verify skill): no horizontal
  scroll, sticky bar pins mid-scroll, quick-tick + bulk 2% flows work.
  Local API on 5001 now runs under nodemon (old plain-node process replaced).

### Done (2026-07-15, batch 4): minimal bonus paper + Bonuses tab in client drawer
- Bonus paper redesigned clean/minimal (it is handed to customers): white sheet,
  no navy header band or navy total panel; header = logo + business info left,
  "BONUS AWARD" + ref/date right, thin orange+navy rule; ONE rewards table
  (Description / Invoice / Quantity / Basis / Reward) holding both item lines
  and the invoice-total reward row (selected invoice numbers as a small mono
  line under the table); right-aligned totals block (subtotals only when both
  levels exist) with navy top border + total; note as plain "Note:" paragraph.
  Same A4 794px frame, hardcoded hex, signatures/footer unchanged.
- Client statement (`clientStatement`) now returns `bonuses` (with items +
  parsed invoice_numbers, same created_at range filter, limit 50) but ONLY for
  non-cashier roles, matching the manager-gated /bonuses routes. Clients page
  drawer gained a "Bonuses" tab (shown to managers when the client is a partner
  or has past awards): period, invoice/item-line counts, awarded-by, amount,
  and a Paper button reusing BonusPaperModal; drawer re-fetches on
  `bonus:changed`. Verified headless (scratchpad verify-bonus-paper*.js).

### Done (2026-07-15, batch 5): clients card grid + details page + owing statement paper
- Clients page redesigned as a card grid (same card shape as the bonus page):
  avatar, partner tag, top-3 trophy rank chip, Purchases/Spent/Owing stat
  cells, prepaid chip + last purchase + edit/delete in the footer; search +
  type Segmented kept, client-side Pagination (12/page). Cards navigate to the
  new **client details page** `/admin/clients/[id]` which replaces the
  statement drawer 1:1 (contact card + owing/prepaid position in a left aside,
  range picker + period summary + the four tabs in a main card; back link,
  Edit + Add deposit in the header). No server changes.
- **Owing statement paper**: in the details page purchase tab, invoices with a
  balance (partial/unpaid, not voided) get checkboxes + a select-all bar; the
  selection bar shows "n invoices · $X owing" and a button that opens an A4
  paper (title OWING STATEMENT) detailing each invoice separately (item lines
  with units-as-sold quantities, Invoice total / Paid / Balance due) then a
  grand Total purchased / Total paid / TOTAL OWING block + KHR approx,
  signatures Prepared by (current user) / Acknowledged by (client). Data =
  parallel GET /sales/:id for the selected ids (no new endpoint).
- **Shared A4 paper primitives** extracted to `components/paper/`: `paper.tsx`
  (PaperSheet frame, PaperHeader with logo+title+ref, PaperSignatures,
  PaperFooter, paperSlug) and `paper-modal.tsx` (generic preview +
  html-to-image JPG download modal + `usePaperSettings`). bonus-paper[-modal]
  refactored onto them (bonus paper's local `usd()` dropped, `money()` has had
  thousands separators since batch "commas everywhere"). New papers should
  build on these primitives.
- Clients split into `components/clients/`: `client-card`, `client-avatar`
  (partner/normal circle, reused on card + details), `client-form-modal`
  (add/edit, shared by list + details), `deposit-modal`, `purchase-history`
  (owns the owing-selection state), `products-rank`, `payments-list`,
  `bonuses-list`, `statement-paper[-modal]`.
- E2E verified headless per the verify skill (scratchpad verify-clients.js):
  grid, card → details, select-all owing (2 invoices), paper math
  cross-checked ($8.55+$4.70=$13.25), real JPG download, edit modal, fixture
  cleanup. `next build` passes (19 routes).

### Done (2026-07-15, batch 6): multi-page A4 papers + statement select-all + clients UX pass
- **Papers paginate onto real A4 sheets** instead of growing one tall page. New
  `components/paper/paginated-paper.tsx`: content is a list of self-contained
  blocks (an invoice, a bonus item row) whose true heights are measured in a
  hidden same-width pass (overflow-hidden wrappers so child margins count;
  re-measured after `document.fonts.ready`), then dealt onto pages. Page 1
  gets `header`, later pages a slim `PaperContinuation` header ("TITLE
  (continued) · name · Page x of y", in paper.tsx); `tail` (totals/note) and
  `bottom` (signatures+footer, mt-auto) always land on the last page; non-last
  pages end with a "Continued on next page" hint whose height is part of the
  block budget (forgetting it overflowed A4 by ~20px, caught in verification).
  `PaperSheet` now marks the exportable node with `data-paper-page` (shadow on
  a wrapper so it never enters the JPG); PaperModal downloads one JPG per
  sheet (`name-p1.jpg`, `-p2` ... + a "Downloaded n pages" toast) and stacks
  sheets in the preview. Both papers rebuilt on it; the bonus items table
  became fixed-template grid rows so it can break between lines, with the
  column headings re-printed after a break (only when the page starts with
  item rows).
- **Statement paper covers any invoices, not just owing**: purchase-history
  checkboxes now on every non-voided invoice, Select all + hint bar, button
  renamed "Statement paper"; the paper titles itself OWING STATEMENT when
  every selected invoice still owes, ACCOUNT STATEMENT otherwise (right-side
  label follows); paid invoices print with Balance due $0.00. Pay button and
  rose owing hints still only on owing rows.
- **Clients UX pass**: cards are keyboard-operable (role=link, tabIndex,
  Enter navigates, focus-visible ring) with a hover shadow lift; details page
  aside is sticky on xl, the owing/prepaid position cards moved ABOVE the
  contact card (phones see money first), and tab labels show counts
  ("Purchase history (9)").
- E2E verified headless per the verify skill (scratchpad verify-paper-pages.js
  + verify-paper-jpg.js): 9-invoice statement → 4 sheets all exactly 1123px,
  4 numbered JPG downloads, totals only on the last sheet, owing-only reprint
  titled OWING STATEMENT; 21-line bonus → 2 sheets with repeated column heads
  and hand-checked math ($4.10); card Enter-navigation; real exported JPGs
  eyeballed (Khmer names fine). `next build` passes.

### Done (2026-07-15, batch 7): invoice modal paper print + neutral restyle
- `InvoiceDetailModal` gained an optional `onPaper(saleId)` prop: when set, the
  footer button reads "Print paper" and hands the sale id up instead of
  `window.print()` (hidden `<Receipt>` not rendered then). The client details
  page passes it and opens the existing `StatementPaperModal` with just that
  invoice; the invoices page still prints the thermal receipt (walk-in sales
  have no client for a statement). Paper button hidden on voided invoices
  (statement paper excludes voided by design).
- Modal restyled color-light: the three emerald/amber/rose settlement banners
  collapsed into ONE neutral strip (border-line + surface-sunken, icon + text;
  only the owed amount is rose, Receive payment button inline); FREE pill and
  discount pct neutral; section headings unified as small uppercase fg-subtle
  labels; money summary reordered (invoice math → Total+KHR → divider → Paid /
  Balance due → "Cash received X · change Y" footnote); Paid line and refund
  amounts no longer colored (rose reserved for balance due). Verified headless
  per the verify skill (scratchpad verify-invoice-paper.js): details page shows
  Print paper → OWING STATEMENT paper + download, invoices page keeps Print
  receipt, voided modal renders the neutral strip. `next build` passes.

### Done (2026-07-16): fullscreen + installable PWA (tablet/iPad)
- **Fullscreen**: `hooks/useFullscreen.ts` (`useFullscreen` + `useStandalone`, both
  on useSyncExternalStore so there is no hydration gap) wraps the Fullscreen API
  with the `webkit*` fallback iPadOS needed before Safari 16.4.
  The fullscreen control lives in the header user menu (see 2026-07-16 batch 2)
  and **hides itself** where it would be a dead button: iPhone Safari has
  no Fullscreen API at all, and an installed app window has no chrome to hide.
  On iPhone, installing the PWA is the only route to a chromeless app.
- **PWA**: `public/manifest.webmanifest` (standalone, `start_url` /admin/pos,
  shortcuts to POS/Invoices/Inventory), `public/icons/*` generated by
  `scripts/generate-icons.mjs` (192/512 "any" + a 512 maskable whose art sits
  inside the 80% safe zone). `app/layout.tsx` gained a `viewport` export
  (`viewportFit: "cover"`, light/dark themeColor) and appleWebApp metadata.
  Zoom is deliberately NOT locked (a11y, and iOS ignores it anyway).
  `formatDetection: { telephone: false }` stops iOS linkifying invoice numbers.
  **Gotcha**: Next 16 renders `appleWebApp.capable` as the standardised
  `<meta name="mobile-web-app-capable">`, which Safari only honours from iOS
  17.4 — `metadata.other` re-adds `apple-mobile-web-app-capable` so older iPads
  still launch standalone.
- **Safe areas**: `.content-safe` / `.sider-safe` in globals.css (unlayered, like
  `.no-scrollbar`, so they beat Tailwind's layered padding utilities) add
  `env(safe-area-inset-*)` to the admin Content and sider footer. Insets are 0 in
  a normal tab, so the classes double as the page padding they replaced.
- **Service worker** (`public/sw.js`, registered by `components/pwa/service-worker.tsx`,
  production only): deliberately minimal. The POS is useless without the API, so
  it does NOT fake offline. It (a) serves `public/offline.html` when a navigation
  fails, replacing the browser's own error page, and (b) cache-firsts
  `/_next/static/*` and `/uploads/img/*`, which also stops a redeploy 404ing a
  chunk out from under an open tab. **HARD RULE: it must never cache or answer
  anything that could be an RSC payload** — HTML and RSC share a URL and differ
  only by the `RSC` request header, so a header-blind cache re-creates the exact
  hCDN poisoning bug, client-side and purge-proof. Only `request.mode ===
  "navigate"` counts as a document; /api, /socket.io and RSC pass straight
  through. No `skipWaiting` on purpose (swapping the worker under a live tab is
  itself a cause of surprise reloads); it only serves immutable URLs, so a stale
  worker is harmless and the new one takes over when tabs close.
- **On "This page couldn't load" (superseded by the 2026-07-16 batch 4 entry
  below, which found the second cause)**: verified live that the 2026-07-14 fix holds —
  every route returns `no-store` + `x-hcdn-cache-status: DYNAMIC`, and an RSC
  request returns `text/x-component`, not cached HTML. So the CDN cause is gone
  and the remaining occurrences are a *different*, unreproduced fault. Best
  evidence: Hostinger's proxy rewrites Next's `Vary: rsc, next-router-state-tree,
  …` down to `Vary: Accept-Encoding` (confirmed by diffing local vs prod headers)
  — which is *why* hCDN ignored Vary in the first place. A `Vary` rule in
  next.config is useless: Next overrides it (verified), so `no-store` is the only
  protection. The likely remaining trigger is a transient document/RSC fetch
  failure (tablet Wi-Fi roaming, shared-hosting cold start) surfacing as the
  browser error page; the SW's offline fallback turns that into a branded retry
  screen but does not remove the underlying blip. **Not yet root-caused — if it
  recurs, capture whether the URL bar shows the app URL and whether it happens
  mid-navigation or on cold launch.**
- E2E verified headless per the verify skill (scratchpad verify-pwa.js) against a
  real `next start` build at iPad 1194x834: manifest valid, SW registered +
  controlling, both capable metas present, fullscreen enter/exit, RSC fetch still
  `text/x-component` through the SW, offline fallback renders (its logo is
  network-first cached, or it would render broken), 0px overflow at 390px.
  **Deploy note: purge the hCDN cache after deploying** or tablets keep the old
  `sw.js`. NOTE: the `must-revalidate` this entry originally claimed does NOT hold
  in production, see the 2026-07-16 batch 6 finding below.

### Done (2026-07-16, batch 2): admin header + user menu
- The header right side is now ONE control. `components/layouts/user-menu.tsx`
  is a custom Dropdown panel (antd 6 `popupRender`, controlled `open`, not
  `menu.items` — the theme row and the pressed-state rows need real markup):
  identity card (avatar + name + email + role pill), My profile, Settings
  (owner only, same `/admin/settings` the sidebar links), Fullscreen (rendered
  only when `useFullscreen().supported && !useStandalone()`, same rule the old
  button had), a Theme row holding the 3-way light/dark/system segmented, and
  Log out. Rows are 44px for tablet touch; the trigger shows avatar + name +
  a chevron that rotates on open.
- `components/pwa/fullscreen-toggle.tsx` was DELETED (its only caller was the
  header); `hooks/useFullscreen.ts` is unchanged and now consumed by user-menu.
  `components/theme/theme-toggle.tsx` stays — `/menu` (public) still uses it.
- Header polish: hamburger is a 40px target, business logo 32px rounded-lg, a
  hairline divider before the Live pill, and the pill got a border + antd
  Tooltip (was a native `title`).
- Verified headless per the verify skill (scratchpad verify-header.js): panel
  contents, 44px row heights, theme switch flips `html.dark`, fullscreen enters
  and closes the menu, profile nav, 0px overflow at 820 and 390. `next build`
  passes. Gotcha: the login form needs ~2s of hydration before `Enter` submits,
  or `waitForURL` times out on a page that never navigated.

### Done (2026-07-16, batch 3): go-live reset script
- `server/database/reset-transactions.sql` (NOT a migration, run by hand once in
  phpMyAdmin before the business trades for real) clears deploy/testing residue:
  deletes sales, sale_items, payments, bonuses, bonus_items and the `sale`/`void`
  stock_movements, zeroes `clients.credit_balance`, and RESTORES `products.stock_qty`
  by reversing what the sales took. Keeps products, units, categories, clients, users,
  settings, images, and the `initial`/`restock`/`adjustment` movements (they are the
  audit trail of the kept stock; deleting them would leave stock_qty unexplained).
  Scoped by `@business_id`, step 0 previews what will be lost, verification SELECTs
  at the end. Rejected as an admin-UI button behind a password: the reset is
  all-or-nothing so it cannot separate test data from real data anyway, the owner
  already authenticates as owner (re-prompting the same password is a speed bump,
  not a lock), and a permanent button aimed at the one unreconstructable dataset is
  a hazard the owner would only ever misclick.
- Two entanglements the script exists to handle, worth remembering: deleting `sales`
  does NOT remove deposits (`payments.sale_id` is NULL on them, so the CASCADE misses
  them), and deleting `stock_movements` does not put stock back (`products.stock_qty`
  is a standalone column), so stock must be restored BEFORE the history is dropped.
- Verified on a throwaway clone of the local DB (76 sales / 49 sale+void movements /
  3 deposits / a voided sale / 22 untracked products): all 5 tracked products landed
  on stock values computed independently beforehand, voided sale's product correctly
  unchanged, untracked stayed NULL, every kept table intact, and stock_qty ended up
  exactly equal to the sum of the surviving movements. Local DB untouched.

### Done (2026-07-16, batch 4): "This page couldn't load" root-caused and removed
- **The root cause is architectural, not a bug in one file.** Every page is a
  `"use client"` component, auth is client-side (`app/admin/layout.tsx`), and all
  data arrives over `/api` — so the HTML for a route is an **empty shell that never
  changes and holds no user data**. But `force-dynamic` (the 2026-07-14 hCDN
  workaround) marks every route `no-store`, uncacheable at every layer. Result: the
  app made a live round-trip to Hostinger **on every navigation** for bytes that are
  always identical, giving the POS zero tolerance for a blip on shop Wi-Fi. Any
  failed document/RSC fetch = the browser's error page. Re-verified live first that
  the CDN cause really is dead (48 probes: every document `no-store` + `DYNAMIC`,
  RSC always `text/x-component`, no gateway errors), so this is a separate fault.
- **Fix: the SW serves the shell from cache** (`PAGE_CACHE`, network-first so a
  healthy network always gets the current build and a deploy lands on the next
  navigation; cache consulted only when the request actually failed). The
  navigation now SUCCEEDS instead of failing prettily. `PRECACHE_ROUTES` fetches all
  11 fixed routes at install, because caching-on-visit alone strands staff on the
  first page they open in a shift; `[id]` routes are excluded (unbounded) and fall
  back to the retry page. Safe **only** because of the client-component invariant
  above — if a route ever becomes a server component rendering real data it MUST be
  excluded from `isShellRoute` or that data leaks between users on a shared tablet.
- **Second root cause, worse than the error page**: `useAuth` did `.catch(() => {})`,
  so a network blip and a 401 were indistinguishable — `user` stayed null, `loading`
  went false, and admin/layout redirected to `/login`. **A 2-second Wi-Fi hiccup
  logged staff out and destroyed the in-progress cart.** Now only a 401 means signed
  out; anything else (no response, 5xx) keeps `loading` true and retries with backoff
  (1s→10s), because "could not ask" is not an answer. Exposes `reconnecting` so
  `PageSpinner` explains the wait ("Reconnecting to the server…") — a silent spinner
  reads as frozen and gets the tablet rebooted mid-shift.
- The SW also only fell back on a **REJECTED** `fetch`. A cold start / redeploy does
  not reject: Hostinger's proxy RESOLVES with a **502/503/504**, which was passed
  straight through and rendered. Now `GATEWAY_ERRORS = [502,503,504]` counts as
  failure, as does a hang (`DOC_TIMEOUT_MS` 6s — without it the browser spins then
  shows its own error). A Next-rendered **500 is deliberately NOT masked** — that is
  an app bug and must stay visible. Same bug class was also in `networkFirst`, caught
  only by eyeballing a screenshot: during a 503 it returned the proxy's error body as
  the logo, so the reassuring page rendered a **broken image**.
- The **RSC guard now runs FIRST** in the fetch handler, ahead of every branch that
  can call `cache.put`. A flight payload is never `mode: "navigate"` so it cannot
  currently reach the document branch, but the original outage was exactly one cache
  confusing RSC with HTML, so the ordering does not rest on that staying true.
  `cache.addAll` replaced with a tolerant `cacheAllSettled`: all-or-nothing meant one
  flaky request failed the whole install, leaving the tablet with NO worker at all.
- `offline.html` is now the **last resort only** (an uncached `[id]` route during an
  outage, or a first-ever visit), reworked into a self-healing **"Reconnecting"**
  page: it polls
  `/api/health` (which the Web app proxies to the API, so a 200 proves BOTH are up
  = a reload will actually work) with backoff 2s→15s, 5s timeout, and reloads
  itself. The old `addEventListener("online")` was the ONLY trigger and it **never
  fires on a cold start** (the tablet was never offline), so staff sat on a dead
  page until someone tapped. The event is kept, but only as a hint to probe now.
- **`skipWaiting` added, reversing the earlier decision** — the old comment feared
  surprise reloads, but nothing listens for `controllerchange`, so it only
  activates, it does not reload. Without it a fix never reaches a POS tablet whose
  tab is never closed (the worker waits forever). Made safe by **un-versioning the
  asset/image caches** (`chomnenh-assets-v1` / `-images-v1` are now fixed names):
  they key on immutable content-hashed URLs so there is nothing to invalidate, and
  purging them on activate WOULD be the real hazard — a tab still on the previous
  build would lose its chunks and refetch them from a server that no longer has
  them. Only `SHELL_VERSION` bumps (now v2).
- Prevention, not just presentation: **DEPLOYMENT-HOSTINGER.md step 8** adds an
  optional hPanel cron (`*/5`, `curl -s -o /dev/null .../api/health`) to stop the
  apps idling out, since the retry page still costs a few seconds of not selling.
- E2E verified per the verify skill against a real `next start` build behind a proxy
  that fakes hPanel's 503 (scratchpad `proxy.js` + `verify-rootcause.js`, 10/10):
  with the origin fully 503ing, `/admin/pos` still loads the real app shell (no proxy
  error, no fallback page), staff are NOT kicked to `/login`, the wait is explained,
  and it recovers to a working POS with no reload and no re-login; offline, a
  never-visited route still navigates from the precache; an uncached route still gets
  the branded page, never the browser error; RSC still `text/x-component`; the page
  cache holds 11 entries and zero flight payloads; an updated worker activates
  without closing the tab. **Deploy note: purge the hCDN cache, or tablets keep the
  old `sw.js`.**
- **Honest limit:** this makes a blip cost nothing on *navigation*, but the cart is
  still `useState` (`app/admin/pos/page.tsx`), so a deliberate reload mid-sale still
  loses it. Persisting the cart is the outstanding piece (see Pending).

### Done (2026-07-16, batch 5): POS cart survives a reload + toast audit
- **Cart persisted** (closes the batch-4 "honest limit"). `lib/pos-cart.ts` owns the
  storage: key `chomnenh:pos-cart:v1`, holding `{saved_at, lines, client_id,
  discount_pct}`. Lines are stored as **ids, never product snapshots** (`product_id`,
  `unit_id`, `quantity`, `price` override, `is_bonus`) so a restored cart reprices
  against current products instead of resurrecting stale prices. `rehydrateCart`
  rebuilds against freshly loaded products and DROPS what moved on (product deleted or
  deactivated, bulk unit removed) and CLAMPS quantities to current stock, so a restore
  can never produce a cart the server would reject at checkout. Every storage call is
  try/caught (Safari private mode, quota): persistence is a safety net and must never
  break a sale.
- **Staleness = 12h ("one shift")**, owner's pick. Older = residue, not an interrupted
  sale, and is purged on read. `saved_at` is last-write, so it measures "time since the
  POS last had this cart open", not since the sale started; an abandoned cart therefore
  survives a daily POS open, which is fine because the banner (below) makes it visible.
- **Restore announces itself with ONE toast**, `Cart restored (N items)` (toastId
  `cart-restored`, count matches the cart badge). A pre-filled cart the cashier did not
  build needs some notice or a leftover gets charged to the next customer. Built first
  as a persistent amber banner (a toast vanishes in 5s); owner removed it and chose the
  toast, so restore is lighter by decision, not oversight. Do not re-add the banner.
- Restore waits for products AND clients (`clientsLoaded`): restoring a partner's cart
  before their row loads would silently reprice the wholesale sale at retail. The save
  effect is guarded on `restoreDone` or the first render's empty cart wipes the entry
  before it is read back. `discardCart()` is shared by Clear / checkout / restore-drop;
  the save effect then clears storage on its own (empty cart = remove key).
- **Toast audit** (`/admin/pos`), three findings:
  1. **Double toast, confirmed not theoretical**: the over-stock `toast.warn` sat INSIDE
     the `setCart` updater, which StrictMode double-invokes (on by default in the App
     Router). Measured 2 toasts from ONE refusal on the old code, 1 on the new
     (scratchpad `count-toasts.js` against a git-stashed tree). Side effects in a state
     updater are the bug; the check now reads `cartRef` (synced by effect) in the event
     path. **Rule: never toast/play sound inside a setState updater.**
  2. **Dead toast removed**: `toast.success("<product> added")` could never fire, all 7
     `addToCart` callers passed `silent: true`. The `silent` option went with it. Adding
     stays silent by design: the cart IS the feedback and scans already beep. Only a
     REFUSED add speaks, because that is the case the cashier cannot see.
  3. **Repeat refusals deduped** via one live toast per product (`stock-<id>`).
  Checkout (1 toast), checkout error, and quick-add-client were already correct.
- **Silent clamp fixed** (was listed as a known gap the same day): `mutateLine` capped a
  typed quantity with no explanation (type 999, get 12, reads as a broken input). The
  merge+cap math moved OUT of the updater into module-level **pure** `applyLineChange`,
  which returns `{lines, clamped}`; `mutateLine` then owns the toast. Only a REQUEST
  above the cap counts as a clamp, so minus-to-0 and the trash button stay silent
  (regression-tested). The cap is stated in the line's OWN unit ("Only 2 Box of 4
  available"), per the never-show-base-conversions rule. **No buzz here**, unlike a
  scan: the cashier is already looking at the field they typed into.
- **`toastId` alone is a trap**: it SUPPRESSES the new message and leaves the old one on
  screen. Type 999 (toast "Only 10 pcs"), switch the line to boxes, and the stale pcs
  cap stays up. Shared `stockToast(productId, msg)` helper therefore does
  `toast.isActive(id) ? toast.update(id, {render, type, autoClose}) : toast.warn(msg,
  {toastId: id})` — one toast, always current, timer restarted. Both call sites use it.
- **Rule: never toast/play sound inside a setState updater** (see finding 1 above).
  `cartRef` (synced by effect, and assigned directly in `mutateLine` for rapid
  keystrokes) is how event handlers read the latest cart.
- E2E verified headless per the verify skill, scratchpad `verify-cart.js` (17/17) +
  `verify-clamp.js` (18/18): adds are silent, 1 refusal = 1 toast, 5 refusals = 1 toast,
  cart+discount persist, **reload restores them** with one `Cart restored (2 items)`
  toast, a 13h-old cart is dropped AND purged, a completed sale empties cart+storage
  with exactly 1 toast; typed 999 caps to stock and says so, per-edit toasts replace
  rather than stack, a live toast REFRESHES to boxes on a unit switch, minus-to-0 and
  remove stay silent, in-range edits stay silent.
- **Verification gotcha**: do NOT clear toasts by removing the DOM node
  (`el.remove()`) — toastify still has the toastId registered as active, so the next
  toast is silently suppressed and the assertion lies (this bit twice, and made one test
  pass for the wrong reason). Let them auto-close (`waitForFunction` on zero
  `.Toastify__toast`); clicking the close button races the auto-close and hangs.

### Done (2026-07-16, batch 6): deployed batches 1-5 to production
- Merged `develop` → `main` (fast-forward, commit `8cabdda`, 27 files: the whole PWA /
  offline / user-menu / useAuth batch plus the POS cart work). hPanel auto-redeployed
  the Web app from `main` in ~30s; the `server/**` change (reset-transactions.sql) also
  fired `sync-api-deploy`. No migration was needed (that SQL is run by hand, never on
  deploy). Verified live: `/sw.js`, `/manifest.webmanifest`, `/offline.html` and all 3
  icons serve 200, API `/api/health` 200, `/login` 200, and **the cache-poisoning
  protection still holds** (`/admin/pos` = `no-store` + hCDN `DYNAMIC`; the same URL
  with `RSC: 1` = `text/x-component`, not cached HTML).
- **Finding: `next.config.ts` `headers()` does NOT apply to `public/` files in
  production.** Hostinger serves them itself, not Next: `/sw.js` comes back
  `Content-Type: application/x-javascript` with a `last-modified` and NO
  `Cache-Control`, and `/manifest.webmanifest` comes back `text/plain`. Both headers
  configured in next.config (sw.js `must-revalidate` + `Service-Worker-Allowed`,
  manifest `application/manifest+json`) are silently dropped. They DO work under a
  local `next start`, which is why this was never caught before the first real deploy.
  Consequences:
  - `/sw.js` has no cache headers, so **purging the hCDN cache after any deploy that
    touches it is MANDATORY, not advisory** (it is the only thing that gets a worker
    fix onto a tablet). Browsers bypass the HTTP cache when checking a SW for updates,
    so the risk is the CDN edge, not the browser.
  - `Service-Worker-Allowed` is missing but harmless: `sw.js` sits at the root, so its
    default scope is already `/`.
  - The manifest's `text/plain` is the real open question: Chrome parses a manifest
    regardless of MIME, but this is unverified on a real iPad. If install ever
    misbehaves, move it to a Next metadata route (`app/manifest.ts`), which Next serves
    itself with the correct type and which Hostinger cannot bypass.

### Done (2026-07-16, batch 7): PWA was not installable, icons lied about their size
- **Symptom**: no install prompt in production. **Cause**: Chromium's own
  `Page.getInstallabilityErrors` (via CDP, the fastest way to stop guessing) said
  `no-acceptable-icon` (min 144px). The manifest declared 192/512/512-maskable and all
  three URLs returned `200 image/png`, but the FILES were stale: `icon-192.png` was
  really 100x100, `icon-512.png` 400x400, and `maskable-512.png` 100x100 AND
  byte-identical to icon-192 (never a maskable render, so the 80% safe zone this brief
  claimed did not exist). **Chromium rejects an icon whose decoded dimensions do not
  match its `sizes` attribute**, so all three were discarded and the prompt never armed.
- `scripts/generate-icons.mjs` was correct all along; it had simply **never been run**
  since its PWA section was added, so `public/icons/` held leftovers from an earlier
  draft. Running it fixed everything (192x192, 512x512, a real 512x512 maskable);
  app/icon.png (512), apple-icon.png (180), chomnenh-mark.png (512), favicon.ico (32)
  regenerate in the same pass. **If you touch generate-icons.mjs, RUN IT and verify the
  output dimensions** — committing the script without its output is the whole bug.
- **Verification lesson**: the earlier PWA check asserted "manifest valid" and that the
  icons returned 200. Neither is worth anything if the pixels do not match the promise.
  Check real dimensions (PNG IHDR bytes 16-24), not just HTTP status.
- Everything else was already right, which is what hid this: the SW registers, is
  active and controls the page in production; the manifest parses; the link tag and both
  `*-web-app-capable` metas are present. The `text/plain` manifest MIME (batch 6) was a
  RED HERRING — Chromium parses a manifest regardless of content type.
- Deploy note: icons are static files Hostinger serves and hCDN caches, so **purge the
  hCDN cache** after an icon change or the edge keeps handing out the old ones.

### Done (2026-07-16, batch 8): "couldn't load" root cause no. 3 = hCDN bot challenge
- **Reproduced live with a real headless browser** (curl never triggers it): a fresh
  browser's FIRST request to `https://lucaci.chomnenh.com/login` returns **403** with
  Hostinger's JS challenge page (`/hcdn-cgi/jschallenge`); the browser solves it,
  POSTs `/hcdn-cgi/jschallenge-validate`, gets a per-origin clearance cookie, reloads,
  and only then sees the app. Scored per client IP; BOTH domains sit behind hCDN
  (`Server: hcdn` on api-lucaci too). Explains every open symptom:
  - **"Only one user at a time"**: two browsers behind the shop's single IP raise the
    score past the threshold; each needs its own clearance, and a challenge landing on
    a navigation/RSC fetch = the error page for whoever it hits.
  - **"Press login twice"**: the login POST is an XHR — an XHR cannot execute the
    challenge JS, so the first attempt eats 403 HTML and dies; by the second press the
    clearance settled. Our API never 403s a login, so 403 here = the edge, always.
  - **Data loads but pill says Offline** (owner's screenshot): Socket.IO connects
    straight to `api-lucaci`, an origin the browser never *navigates* to, so it can
    NEVER earn a clearance cookie there — a challenge on the handshake is unsolvable
    and realtime stays dead until the score decays.
  - **Failures with one user / nobody**: the `/api` rewrite is a server-to-server hop
    to api-lucaci (also challengeable, also unsolvable), plus plain cold starts.
- **Primary fix is hPanel config, not code** (owner must do it): Websites → each of
  lucaci + api-lucaci → Performance → CDN → Manage → turn Security/Bot-protection OFF,
  or disable the CDN entirely — it buys this app nothing (every route is `no-store`,
  the SW caches statics) and this is its third production incident. If no visible
  toggle kills it, quote `/hcdn-cgi/jschallenge` + an `x-hcdn-request-id` to Hostinger
  support. Also: actually create the step-8 keepalive cron (cold starts remain the
  secondary cause). If api-lucaci's challenge can't be disabled, fallback plan is
  routing the socket through the web origin again (polling-only, worked pre-2026-07-13).
- Code hardening shipped (client): axios default `timeout: 30000` (a hung request
  must fail so the UI can react; was infinite); `useAuth.login` retries ONCE after
  1.5s when the server never answered (no response, 403, 502/503/504) — the machine
  presses "Log in" the second time. A real 400/401/429 re-throws untouched, so wrong
  passwords fail once, immediately, and count toward the rate limit exactly once.
  Login limiter itself unchanged: 20 failed/15min per IP + 5 failed/10min per account,
  successes never counted, and edge-killed attempts never reach Express at all.
- Verified headless per the verify skill (scratchpad verify-login-retry.js, local dev,
  route-interception faking the edge): 503-then-retry logs in with 2 calls, 403-HTML-
  then-retry logs in with 2 calls, wrong password = exactly 1 call + error toast.
  `next build` passes. NOTE: production probes during diagnosis (~100 requests) came
  from the dev machine's IP — if that IP starts getting challenged harder, that's why;
  it decays.
- **Follow-up (same day): the challenge is NOT controllable from hPanel** — the owner
  found no bot-protection setting on either website, and a fresh-browser probe
  confirmed the challenge still fires. It hits heavy pages hardest (POS, inventory,
  /menu load every product image + page chunks in one burst; a challenge landing on a
  chunk or RSC fetch = broken page). **Way out, verified live:** the origin server
  `156.67.222.87` serves BOTH sites directly with valid TLS (`Server: LiteSpeed`),
  websocket 101, /uploads blobs, /menu, and the /api rewrite all working, and a fresh
  headless browser pinned to that IP (`--host-resolver-rules`) loads /login + /menu
  with ZERO challenges. Fix = get DNS off the hCDN edges (145.79.x.x anycast):
  disable the CDN per website in hPanel (Performance → CDN), or failing that edit the
  chomnenh.com DNS zone — A records for `lucaci` and `api-lucaci` → 156.67.222.87 and
  DELETE their AAAA records (or IPv6 clients keep routing through the CDN). Caveat:
  a hardcoded A record breaks if Hostinger ever migrates the account to a new server;
  prefer the CDN toggle if it exists.

### Done (2026-07-16, batch 9): living WITH the hCDN challenge (owner cannot disable CDN/DNS)
- Owner cannot disable the CDN nor edit DNS, so the challenge stays; this batch makes
  the app survive it. Three changes:
  1. **Socket.IO back to same-origin through the Next rewrite** (reverses the
     2026-07-13 direct-to-`NEXT_PUBLIC_API_ORIGIN` connection). Reason: the challenge
     clearance cookie is per origin and only a NAVIGATION can earn it — the browser
     never navigates to api-lucaci, so a challenged direct socket is dead forever
     (the "Offline pill while data loads" signature). Same-origin rides the app's
     clearance. Long-polling only (the upgrade can't cross the rewrite) — fine at this
     scale. Required `addTrailingSlash: false` in `server/config/socket.js`: the
     rewrite delivers `/socket.io` WITHOUT the trailing slash and engine.io's default
     prefix `/socket.io/` 404s it ("Cannot GET /socket.io" — that was why prod
     same-origin polling failed, NOT the 308 that skipTrailingSlashRedirect fixed).
     engine.io's check is a prefix match, so the no-slash path matches both forms.
  2. **Challenge auto-recovery** (`lib/challenge-recovery.ts`): a challenge answering
     an XHR/chunk cannot be solved there, but ONE document reload re-earns clearance.
     `reloadOnceForChallenge()` (in-memory + sessionStorage guards, 60s min interval,
     cart survives via lib/pos-cart) is called from (a) an axios interceptor in
     services/api.ts when a 403 body mentions hcdn-cgi/jschallenge, and (b) listeners
     in service-worker.tsx for ChunkLoadError rejections and failed
     `/_next/static/` script tags (prod only).
  3. Image bursts: POS/inventory/menu grids already had `loading="lazy"` — no change.
- Verified headless (scratchpad verify-challenge-recovery.js, local dev): pill Live
  after login; faked challenge on /api/products → exactly 1 self-reload then real data
  (10 rows); permanent challenge → no reload loop. Socket paths: direct with/without
  slash AND via rewrite all 200 (was 404 via rewrite). `next build` passes.
- Local dev gotcha AGAIN: port 5001 was running plain `node` (not nodemon) and served
  stale code; check with Get-NetTCPConnection → the fix is kill + `npm run dev`.
- If Hostinger ever exposes a bot-protection toggle or support disables the challenge,
  the direct-socket connection (websocket, less traffic) can come back — but only
  with a fallback, never as the sole path.

### Done (2026-07-17): "couldn't load" root cause no. 4 = the edge STRIPS response bodies
- **Reproduced live with curl**: in bursts up to 1 in 3 same-origin `/api` responses
  arrive as `200 OK` + `Content-Length: 0` with every other header intact, including
  the ETag OF THE MISSING BODY and the API's helmet/CORS headers (so the request
  reached Express and the body was dropped on the way back). Hits any URL: virgin
  paths, 401s, `/api/menu`. NEVER happens hitting `api-lucaci` directly (60+ probes
  clean), never on `/_next/static`. **Final localisation** (the edge was the first
  suspect but survived the DNS pin): responses STREAMED through Next's rewrite
  proxy lose their body, while Next-GENERATED responses are 100% clean (0/40 vs
  18/40 measured back-to-back) and a server-side `fetch` inside a route handler
  always receives the full body (30/30). So the platform's handling of PIPED proxy
  responses drops bodies; nothing upstream does. Sample request IDs
  `8afe85322e69dadaab295414e7a56080-kul-edge3` / `f4eff60105f9bb8bb50bbf3c093a619e-kul-edge3`.
- **Why it looked like "the page reload issue"**: an empty body is still a 200, so
  `/auth/me` "succeeded" with `data.user === undefined` → `loading=false`, user null →
  admin layout kicked staff to `/login` mid-shift with a perfectly valid cookie
  (bypassing the batch-4 "only 401 = signed out" rule, which only guards the reject
  path). Also: empty list responses crashed pages (`res.data.products.map`), an empty
  login response left the form stuck ("press login twice"), and empty socket polls
  dropped realtime. Multi-user slowness is the same lever: every API call was making
  TWO public CDN round trips, and more users = more edge traffic = more challenges
  and more stripped bursts.
- Fixes shipped, all three verified:
  1. **`services/api.ts` treats a stripped response as a failure** (`isBodyStripped`:
     200 + JSON content-type + empty data; our API never legitimately does that).
     GETs auto-retry twice with backoff then reject; non-GETs reject immediately and
     are NEVER auto-retried (the request may have succeeded server-side; replaying a
     checkout would sell twice). `useAuth` gained belt-and-braces guards: a 200
     `/auth/me` without a user retries like a network error (never treated as signed
     out), a login "success" without a user throws. Headless-verified 8/8
     (scratchpad verify-stripped.js): stripped login POST auto-recovers with exactly
     2 calls, stripped `/auth/me` twice keeps the session on /admin/pos, stripped
     products GET still renders 10 rows, permanently-stripped GET stops after 3
     attempts per request with no logout/crash.
  2. **`sw.js` never caches zero-length 200s** (`isCacheable` checks
     `content-length !== "0"`; chunked responses without the header pass) — before
     this, one stripped `/uploads/img/*` response would be cached cache-first,
     i.e. a PERMANENTLY broken product image on that tablet. `activate` now sweeps
     all four caches and deletes any zero-byte entry already poisoned.
  3. **`API_ORIGIN_PIN_IP` DNS pin, in `instrumentation.ts`** (NOT next.config —
     on Hostinger next.config.ts is baked at build and NOT re-evaluated by the
     serving process, so config side effects silently never run in production;
     proven via the `/pin-status` diagnostic route, whose `pin_ran_in_this_process`
     stayed false until the patch moved into `register()`). Patches `dns.lookup`
     for the API hostname so the server-side hop connects to the origin server
     (156.67.222.87) instead of the hCDN anycast edge: no more unsolvable
     server-side bot challenge, one less WAN round trip per request. TLS + SNI +
     cert validation unchanged, so a stale IP fails loudly. Ships in the tracked
     `client/.env.production` (hPanel env overrides it); GUARD: only engages when
     `API_ORIGIN` is explicitly set and non-local, so a local `next start` can
     never pin localhost to prod. `API_ORIGIN` itself must NOT go into
     .env.production: production-mode LOCAL builds would bake rewrites pointing at
     the prod API. It did NOT stop the body-stripping (that was never the edge).
  4. **THE actual kill: /api and /uploads are served by buffering route handlers**
     (`app/api/[...path]/route.ts`, `app/uploads/[...path]/route.ts` →
     `lib/api-proxy.ts`), replacing the next.config rewrites. The proxy buffers the
     upstream response (`arrayBuffer`) and re-emits it as a Next-generated
     response, which takes the proven-reliable path; hop-by-hop +
     content-encoding/length headers stripped, `set-cookie` copied per value
     (`getSetCookie`), 204/205/304 sent body-less, 30s upstream timeout. Socket.IO
     stays on the (flaky) rewrite on purpose: long-polling self-heals from a lost
     body, and a route handler can't reliably serve the trailing-slash
     `/socket.io/` form. After deploy: **0/60 empty** on /api/health (was 17/60),
     0/20 on /api/menu, 0/15 on image blobs; login/JSON/binary/multipart/404 all
     verified headless (5/5) plus the stripped-response suite (8/8) locally.
- Diagnostics kept in the app: `GET /pin-status` (pin env + whether the serving
  process ran the pin + what a server-side fetch to the API sees) and the
  `x-pin-state` response header on /login (build-time pin state). Dev-only gotcha:
  Turbopack logs an "Ecmascript file had an error" warning for `node:dns` in
  instrumentation.ts (edge-runtime static analysis); it is noise — the
  `NEXT_RUNTIME === "nodejs"` guard prevents edge execution and prod is verified.
- **Owner actions**: purge the hCDN cache after deploy (sw.js changed); remove the
  now-unused `NEXT_PUBLIC_API_ORIGIN` from the hPanel Web app when convenient. If
  Hostinger migrates the account to a new server, update or remove the pin in
  `client/.env.production`. Worth a support ticket with the two request IDs above.
- `NEXT_PUBLIC_API_ORIGIN` is dead code since batch 9 (socket is same-origin always);
  DEPLOYMENT-HOSTINGER.md step 5 + verify checklist updated to match reality.
- Verification gotchas from this session: hPanel serves `public/` files ~40s after a
  push (git checkout) while the Node app restart lands minutes later — a new
  `sw.js` is NOT proof the new server code is live; `/api/products` returns a bare
  ARRAY and avatar endpoints return `{user}`, so curl the API before writing
  assertions; Express's default 404 for unknown /api paths is an HTML "Cannot GET"
  page, which through the proxy is correct passthrough, not a Next 404.

### Done (2026-07-17, batch 2): body-stripping aftermath = poisoned browser caches
- **Symptom**: production pages rendered logged-in but EMPTY (0 products, "Client not
  found" for an existing client) while curl through the same proxy returned full data,
  and the DB was intact. **Cause**: during the stripping outage, browsers cached empty
  200 /api bodies together with the ETag Express computed from the FULL body. API
  responses carried no Cache-Control, so on every later fetch the browser revalidated
  with If-None-Match, Express matched its current etag and answered **304 Not
  Modified**, and the browser re-served its cached EMPTY body — indefinitely, surviving
  reloads (this was also the tail of "couldn't load": /auth/me and list fetches kept
  "succeeding" empty). Proven live: replaying the products etag through the proxy got
  304 + 0 bytes.
- **Fix in `lib/api-proxy.ts`** (prefix `api` only): forwarded requests drop
  `if-none-match`/`if-modified-since` so upstream ALWAYS answers a full 200 — the
  browser's first fetch after deploy replaces the poisoned entry with real data,
  no user action needed; responses drop `etag`/`last-modified` and set
  `Cache-Control: no-store` so browsers never cache API JSON again. `/uploads` keeps
  its immutable 30d caching on purpose (verified untouched).
- Verified locally against dev on :3000: proxied /api/products = 200 + no-store +
  no etag + full body even WITH a matching If-None-Match (upstream direct = 304 0b);
  /uploads/img/25 still `public, max-age=2592000, immutable` + etag. `next build`
  passes. No websocket involvement: Socket.IO has been same-origin long-polling since
  batch 9 (the Live pill in the owner's screenshots was green).

### Done (2026-07-20): old owing + POS UX batch (owner-requested)
- **Old owing insert + payback** (see the schema bullet in section 3). Migration
  `2026-07-20-opening-owing.sql` (applied locally; **run on the prod DB in
  phpMyAdmin BEFORE deploying the API**, it is additive so old code is unaffected).
  Endpoints: `POST /clients/:id/owing` (manager only, owner's choice) and
  `POST /clients/:id/owing-payments` (any role, overpay rejected, row-locked like
  deposits). UI: client details header "Add old owing" (manager), owing card shows
  combined owing + "incl. $X old owing" + "Receive old owing" link,
  `components/clients/owing-modal.tsx` (both modes), ledger rows badge as
  "Old owing" (rose, no +, it is not money) / "Owing paid" (emerald). On the
  statement paper since batch 2 below (was invoice-only at first).
- **KHR rounds to nearest 100៛** in `khr()` (smallest bill is 100; tens digit >= 5
  rounds up, owner picked nearest over always-up despite their 5,720→5,800 example).
- **Charge modal**: "Cash received" + quick chips + Change REMOVED (owner's call;
  receipt still prints Received/Change on old sales, new sales send
  `amount_received: null`). "Paying now" is a concrete number seeded with the due
  amount on open, `null` = empty box = $0; the old `null`-means-full sentinel made
  the input snap between Full/Pay later while typing (the reported bug). Chips
  only highlight on exact 0 / exact due; nothing auto-switches.
- **POS card feedback**: per-product in-cart quantity badge (brand pill right of
  the name, `badge-pop` keyframes in globals.css replayed via a changing key,
  covered by the global reduced-motion rule) + brand-tinted card border.
- **Persisted sort** on POS + inventory: `lib/product-sort.ts`
  (name/price/stock/newest comparators + localStorage `chomnenh:sort:<page>`,
  swallow-on-fail) + `components/product-sort-menu.tsx` (Dropdown, active option
  ticked). POS defaults name A-Z, inventory defaults newest (= the API's
  display_number DESC order, so nothing moved for existing users). Stored key is
  read back in a mount effect, never in the useState initializer (SSR has no
  localStorage; a mismatched initializer would be a hydration bug).
- E2E verified headless per the verify skill (scratchpad verify-newfeatures.js,
  26/26): sort persist across reload on both pages, badge 1→2, KHR 23,370→23,400,
  modal seeded/cleared/typed with zero auto-switching, confirm gating, old-owing
  add → pay $25 → live card update → ledger labels → overpay-cleanup; endpoints
  also curl-smoked (overpay 400, role gate, bad method 400, unknown client 404).
  Fixture is idempotent (resets client 4 to $100 old owing each run).

### Done (2026-07-20, batch 2): receive-owing discoverability + owing on statement paper + PDF download
- **"Receive owing" promoted to a header-actions Button** (the tiny text link in
  the owing card was hard to find, owner complaint): HandCoins icon, any role,
  shown when oldOwing > 0, next to Add deposit. "Add owing" icon changed
  HandCoins → BookPlus so the two owing actions don't twin. Owner edits after
  review (respect these): UI labels dropped the word "old" ("Add owing",
  "Receive owing", "incl. $X prev. owing", paper line "Previous owing"), and the
  block "Receive" button inside the owing card is commented out (header button
  is the one entry point). Invoice modal's paper button says "Download".
- **Old owing on the statement paper**: `StatementPaper` takes `oldOwing?: number`;
  when > 0 the totals block gains a "Previous owing" line and TOTAL OWING
  (+ KHR approx) includes it. `StatementPaperModal` shows an "Include $X owing in
  the total" checkbox (default ON, only when the client has any) via the new
  generic `toolbar` prop on PaperModal. PaginatedPaper needed no change: its
  measuring useLayoutEffect has no dep array, so toggling re-paginates itself.
- **Owing-only paper (no invoices)**: `saleIds: []` (vs null = closed) means
  "previous owing alone" — purchase-history shows an "Owing paper" button when
  nothing is ticked (and in its empty state) if the client carries previous
  owing; the paper then prints one "Owing carried from previous records" line,
  hides the invoice-count header block and Total purchased/paid rows, always
  titles OWING STATEMENT, and the include-toggle is hidden (forced on).
- **Download PDF on every paper modal** (statement + bonus): `jspdf` added to
  client deps, dynamically imported. PaperModal renders each `[data-paper-page]`
  sheet to JPEG (same html-to-image path) then one A4 PDF page per sheet
  (210x297mm, multi-sheet = one multi-page file). PDF is the primary button, JPG
  kept as default-style; per-button loading, the other disabled while busy;
  filename = the .jpg name with .pdf.
- **Modal stacking fix**: opening the paper from the invoice detail modal now
  closes the invoice modal first (`onPaper` clears `detailId`) — before, the
  invoice modal stayed stacked ON TOP of the statement preview (antd portal
  order, not z-index, decides between same-z modals).
- E2E verified headless per the verify skill (scratchpad verify-owing-paper.js
  19/19 + verify-owing-alone.js 11/11): buttons open the receive modal, toggle on
  by default, paper math $2,500 invoices + $1,000 old = $3,500 and drops the line
  when unticked, owing-only paper correct ($500, no purchased/paid rows, no
  toggle), invoice modal closes when its Download opens the paper, downloaded PDF
  is a real %PDF with page count = sheet count, JPG still a real JPEG. Fixtures
  self-clean (pay back what they added).

### Done (2026-07-20, batch 3): PWA native-feel gestures + socket resume (owner-requested)
- **Pull to refresh** (`components/pwa/pull-to-refresh.tsx`, mounted in
  admin-shell): the installed PWA / fullscreen has NO browser refresh button, so a
  drag-down from the top of the page reloads, like a native app. **Enabled ONLY in
  standalone or fullscreen** (`useStandalone() || useFullscreen().active`) — a normal
  tab already has a refresh button + the browser's own pull-to-refresh, and doubling
  either causes accidental reloads. Guards: only fires at document scrollTop 0, bails
  if the touch is inside a scrolled container (inner list = "scroll to top", not
  refresh) or inside an antd overlay (modal/drawer/dropdown/select/picker/popover/
  toast), requires a downward-dominant drag (dy > 0 and |dy| > |dx|), applies 0.4
  resistance, arms at 60 applied px. Sets `overscrollBehaviorY: contain` on the root
  while active so the browser's native overscroll can't fight the chip. A brand chip
  with a rotating RefreshCw follows the finger (z-[60], above header/sider), spins on
  release; reload is safe because cart (lib/pos-cart) and session (cookie) both
  survive it.
- **Swipe to open/close the mobile drawer** (effect in admin-shell, only when
  `broken`): a horizontal drag starting within 24px of the left edge opens the sider;
  a horizontal left-swipe while it's open closes it (the backdrop covers the page, so
  nothing there competes). Threshold 55px, requires |dx| > |dy| so vertical scrolls
  and pull-to-refresh never trigger it. Desktop still uses the collapse button.
- **Socket resume** (`services/socket.ts`): a backgrounded PWA has its JS timers
  frozen by iOS/Android, so socket.io's own backoff could leave the pill on Offline
  for tens of seconds after wake. Added `wireResumeReconnect()` — on
  visibilitychange/online/focus/pageshow (pageshow catches bfcache restores the
  others miss) it calls `socket.connect()` if disconnected and visible — plus
  `reconnectionDelayMax: 5000` to cap the backoff. Pokes the SAME instance (no
  recreate), so the header pill's listeners stay valid.
- E2E verified headless per the verify skill (scratchpad verify-gestures.js, 7/7 at
  390x844, faking display-mode:standalone): drawer starts hidden, edge-swipe-right
  opens, swipe-left closes, mid-screen and vertical drags do NOT open, the refresh
  chip mounts in standalone, and a big downward pull at the top reloads the page.
  `next build` passes (all routes intact). NOTE: pull-to-refresh is invisible in a
  normal browser tab by design, so it only shows on a real installed PWA / iPad.

### Done (2026-07-21): delete a voided invoice (owner-requested)
- Reverses the long-standing "sales are never deleted" stance, but ONLY behind a void:
  `DELETE /sales/:id` (`deleteSale`, **owner-only** — more destructive than void, which
  is manager-gated) rejects any status other than `voided`. Safe because the void already restored stock, refunded money/credit,
  and netted the ledger to zero, so removing the rows leaves `stock_qty` and
  `credit_balance` correct. `sale_items` + `payments` drop via FK ON DELETE CASCADE;
  `bonus_items.sale_id` is ON DELETE SET NULL so bonus history keeps its snapshots; the
  sale's `stock_movements` have NO FK on `sale_id`, so they are deleted explicitly first.
  Invoice numbers are retired, never reused. Emits `sale:voided` with `{deleted:true}` so
  lists re-fetch; an open `InvoiceDetailModal` on another device closes itself on that
  flag instead of rendering the stub payload.
- UI: in `invoice-detail-modal.tsx` the footer shows a red **Delete** button (Trash2,
  Popconfirm) in place of Refund once the invoice is voided (manager only), with a
  loading state; on success it toasts, refreshes the parent list, and closes. Gated by
  `canDelete` (owner role) client-side to match the route.
- Verified: `next build` passes, server files `node --check` clean, and the delete SQL
  was dry-run against the local voided test sale (#5) inside a ROLLED-BACK transaction:
  sale gone, `sale_items` 1→0 and `payments` 2→0 via cascade, then restored on rollback.

### Pending / decisions to revisit
- Manifest is served `text/plain` in production (batch 6). Harmless for Chromium;
  unverified on a real iPad. If iOS install ever misbehaves, move it to an
  `app/manifest.ts` metadata route, which Next serves itself with the right type.
- The manifest is linked on `/menu` too, so a customer browsing the public menu
  can get an install prompt for the POS (start_url is /admin/pos → login). Harmless,
  but scope the manifest link to /admin if it ever confuses anyone.
- No iOS splash screens (`apple-touch-startup-image`): ~20 sized PNGs for a brief
  launch flash. Skipped on purpose.
- Khmer i18n intentionally skipped in v1.
- Internal identifiers (package name `chamnenh-client`, DB `chamnenh_pos`, cookie
  `chamnenh_token`) keep the old spelling on purpose; renaming them is churn.

## 8. Owner's preferences (same person as WisePOS)

- Simple solutions reusing existing infrastructure; no over-engineering.
- Read existing code first, patch focused — no whole-file rewrites unless needed.
- No spaced em dash (" — ") in user-facing strings; use period/comma/colon.
- When uncertain, ask one question rather than assume.
