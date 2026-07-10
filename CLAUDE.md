# Chamnenh POS — Project Brief for Claude Code

> Read this first. Keep it updated whenever architecture, conventions, or status change.
> Last updated: 2026-07-09 (v1 complete + branding assets + profile page)

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
- **Production host:** `lucaci.chomnenh.com` (user has a Hostinger Business plan — see DEPLOYMENT.md)
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
| Images | Local disk `server/uploads/products/` via multer, served at `/uploads/*` (see DEPLOYMENT.md for alternatives) |

### Roles (`users.role`)
`owner` (full, only one manages staff/settings) · `admin` (manager: products, reports, void, clients delete) · `cashier` (sell, view products/clients).
Enforced server-side by `requireRole` in `server/routes/index.js`; sidebar items filtered by role in `admin-shell.tsx`.

## 2. Realtime events (Socket.IO)

Server emits to room `admins` (helper `emitToAdmins` in `server/config/socket.js`):
- `sale:created` / `sale:voided` — payload is the full sale with items
- `product:changed` — `{ type: create|update|stock|delete|category, id? }`
- `client:changed` — `{ type, id }`
- `settings:changed` — full settings row

Client: `services/socket.ts` (single shared socket, token from `/auth/me`), subscribe with
`hooks/useRealtime.ts` — pages re-fetch on relevant events.

## 3. Database (`server/database/schema.sql`)

Tables: `businesses`, `users`, `categories`, `products`, `clients`, `sales`,
`sale_items`, `stock_movements`, `settings` (one row per business,
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

### Pending / decisions to revisit
- Khmer i18n intentionally skipped in v1.
- Internal identifiers (package name `chamnenh-client`, DB `chamnenh_pos`, cookie
  `chamnenh_token`) keep the old spelling on purpose; renaming them is churn.

## 8. Owner's preferences (same person as WisePOS)

- Simple solutions reusing existing infrastructure; no over-engineering.
- Read existing code first, patch focused — no whole-file rewrites unless needed.
- No spaced em dash (" — ") in user-facing strings; use period/comma/colon.
- When uncertain, ask one question rather than assume.
