# Deploying Chamnenh to lucaci.chamnenh.com (VPS fallback plan)

> **2026-07-10 update: this is now the FALLBACK plan.** Hostinger Business added
> Node.js app hosting (up to 5 apps), so the primary plan is deploying both apps
> directly on the company's existing shared plan, no VPS. See
> **DEPLOYMENT-HOSTINGER.md** for those steps. Use this document only if the
> shared plan proves too limited (see its Step 0 proof of concept).

## The VPS plan

Chamnenh needs two long-running Node.js processes (Next.js and the Express +
Socket.IO API). On a VPS the layout is:

| What | Where |
|---|---|
| Domain + DNS (`chamnenh.com`) | Keep at Hostinger (works fine) |
| The app (Next.js + Express + MySQL) | A VPS: the same Coolify/Hetzner server WisePOS uses, or a Hostinger VPS (KVM 1 is enough, ~$5/mo) |
| Product images | In the MySQL database (`images` table), see below |

In Hostinger's DNS panel, add an **A record**: `lucaci` → your VPS IP. That's all
Hostinger needs to do.

## Image storage

Uploaded images (products, avatars, logo, banners) are stored **in the database**
(`images` table, decided 2026-07-10 so they survive managed redeploys on Hostinger)
and served at `/uploads/img/:id` with 30-day browser caching. Files under
`server/uploads/` are only a legacy fallback for images uploaded before that change.

**Backup rule:** a nightly `mysqldump` is a complete backup of the business,
images included. Make sure the MySQL server's `max_allowed_packet` is at least
16MB (uploads are capped at 5MB per image).

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
rules above; images live in the DB, so no persistent volume is needed.

## Production checklist

- [ ] `JWT_SECRET` is a long random string (not the example value)
- [ ] `NODE_ENV=production` (makes the auth cookie `Secure`)
- [ ] Changed the seeded owner password after first login
- [ ] HTTPS active (camera scanning needs it)
- [ ] Nightly backup of MySQL (includes the images)
- [ ] DNS A record `lucaci.chamnenh.com` → VPS IP at Hostinger
