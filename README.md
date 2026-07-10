# Chamnenh POS

Realtime point-of-sale system for a single business: sell products, manage inventory,
remember clients, and report sales over any date range grouped by day, month or year.
Hosted at **lucaci.chamnenh.com**.

Built with the same stack as WisePOS: Next.js 16 + Ant Design 6 + Tailwind 4 (client),
Express 5 + MySQL + Socket.IO (server).

## Features

- **POS sell screen** — product grid, cart, whole-sale discount, cash/KHQR/card/bank payment,
  cash change calculator (USD + KHR), receipt printing (80mm).
- **Barcode scanning** — phone/tablet camera (EAN, UPC, Code128, QR) to register a product's
  barcode in inventory and to scan items straight into the cart when selling. USB scanner
  guns also work: they type into the POS search box and Enter adds the item.
- **Inventory** — products with image, category, cost/sell price, per-item discount,
  stock with low-stock alerts, stock in/out adjustments and a full movement history.
- **Clients** — save customers (name, phone, email, sex, ID card, address, note), tag them
  on sales, see per-client purchase history and total spent.
- **Invoices** — per-day invoice numbers (`INV-YYYYMMDD-NNNN`), filters, void with stock
  restore, reprint receipts.
- **Reports** — any from/to range grouped by day, month or year: revenue, profit, tax,
  discounts, items sold, payment-method breakdown, top products, top clients, CSV export.
- **Realtime** — Socket.IO pushes every sale/stock/client change to all open admin tabs
  instantly (dashboard updates live).
- **Public menu** — share `/menu` with customers to preview products (no login, no ordering).
- **Staff accounts** — owner / admin / cashier roles with server-enforced permissions.
- **Light/dark/system theme** — brand colors `#304A59` / `#142332`.

## Getting started (development)

Requirements: Node.js 20+, MySQL or MariaDB.

```bash
# 1. Database
mysql -u root -p < server/database/schema.sql

# 2. Server
cd server
copy .env.example .env        # then edit DB_*, JWT_SECRET, ADMIN_*
npm install
npm run seed                  # creates the owner login from ADMIN_* in .env
npm run dev                   # API on http://localhost:5001

# 3. Client (new terminal)
cd client
npm install
npm run dev                   # app on http://localhost:3000
```

Log in at http://localhost:3000/login with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you set.

## Project layout

```
server/          Express 5 API (ESM) + Socket.IO + MySQL
  database/      schema.sql, seed.js
  controllers/   auth, users, categories, products, clients, sales, reports, settings, public
  uploads/       product images (created at runtime, back this up!)
client/          Next.js 16 App Router
  app/admin/     dashboard, pos, inventory, clients, invoices, reports, staff, settings
  app/menu/      public read-only menu
  app/login/     login page
design-system/   generated design tokens reference
```

See `CLAUDE.md` for conventions and `DEPLOYMENT.md` for hosting + image storage.
