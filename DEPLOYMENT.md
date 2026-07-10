# Deploying Chamnenh to lucaci.chamnenh.com

## The important thing about your Hostinger Business plan

The Hostinger **Business** plan is *shared web hosting*: it runs PHP + MySQL websites.
It **cannot run this app**, because Chamnenh needs two long-running Node.js processes
(Next.js and the Express + Socket.IO API), and shared hosting does not allow persistent
Node processes or WebSockets.

So the plan for `lucaci.chamnenh.com`:

| What | Where |
|---|---|
| Domain + DNS (`chamnenh.com`) | Keep at Hostinger (works fine) |
| The app (Next.js + Express + MySQL) | A VPS: the same Coolify/Hetzner server WisePOS uses, or a Hostinger VPS (KVM 1 is enough, ~$5/mo) |
| Product images | The VPS disk at `server/uploads/` (already implemented), see below |

In Hostinger's DNS panel, add an **A record**: `lucaci` → your VPS IP. That's all
Hostinger needs to do.

## Image storage: the recommendation

**Use the built-in local disk storage (already implemented).** When a user adds a product
photo, the server saves it to `server/uploads/products/<uuid>.jpg` and serves it at
`https://lucaci.chamnenh.com/uploads/products/<uuid>.jpg` with 30-day browser caching.

Why this is right for Chamnenh:
- Single business, one server: no need for a CDN or object storage.
- Zero cost, zero extra accounts, images live next to the database.
- A 3MB limit is enforced per image; a few thousand product photos ≈ 1–2 GB, trivial for any VPS.

**Backup rule:** back up two things together — the MySQL database and the `server/uploads/`
folder. A nightly `mysqldump` + a copy of `uploads/` (rsync, or a zip to Google Drive) is a
complete backup of the business.

**Alternative (if you ever outgrow the VPS disk or want a CDN):** Cloudinary free tier,
which WisePOS's server already uses (`cloudinary` + `multer-storage-cloudinary`). Swap
`server/middleware/upload.js` for a Cloudinary storage engine and store the returned URL
in `products.image_url` — nothing else changes, because the app only ever stores a URL.

**Not recommended:** storing app-uploaded images on the Hostinger shared plan. There is no
clean upload API (only FTP/hPanel), so the POS could not save images there automatically.

## VPS setup (nginx + PM2)

```bash
# 1. Install Node 20+, MySQL/MariaDB, nginx, pm2
# 2. Database
mysql -u root -p < server/database/schema.sql

# 3. Server
cd server && cp .env.example .env   # set NODE_ENV=production, DB_*, JWT_SECRET, ADMIN_*
npm ci && npm run seed
pm2 start index.js --name chamnenh-api --node-args="--env-file=.env"

# 4. Client
cd ../client && npm ci && npm run build
pm2 start npm --name chamnenh-web -- start   # Next.js on :3000
pm2 save
```

### nginx (same-origin path routing, like WisePOS — no api. subdomain)

```nginx
server {
    server_name lucaci.chamnenh.com;

    client_max_body_size 5m;

    location /api/ {
        proxy_pass http://127.0.0.1:5001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /uploads/ {
        proxy_pass http://127.0.0.1:5001;
        expires 30d;
    }
    location /socket.io/ {
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
    }
}
```

Then `certbot --nginx -d lucaci.chamnenh.com` for HTTPS (required: the camera barcode
scanner only works on HTTPS or localhost), and you're live.

If you deploy on the existing **Coolify** server instead, create one app for `server/`
(port 5001) and one for `client/` (port 3000) and attach the same domain with the path
rules above; put `server/uploads` on a persistent volume so images survive redeploys.

## Production checklist

- [ ] `JWT_SECRET` is a long random string (not the example value)
- [ ] `NODE_ENV=production` (makes the auth cookie `Secure`)
- [ ] Changed the seeded owner password after first login
- [ ] HTTPS active (camera scanning needs it)
- [ ] Nightly backup of MySQL + `server/uploads/`
- [ ] DNS A record `lucaci.chamnenh.com` → VPS IP at Hostinger
