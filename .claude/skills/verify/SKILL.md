---
name: verify
description: Build, launch, and drive the Chamnenh POS app to verify changes at the UI surface (headless Edge + playwright-core).
---

# Verifying Chamnenh POS changes

## Prerequisites (usually already running)
- XAMPP MariaDB: `Get-Process mysqld`; if down: `C:\xampp\mysql\bin\mysqld.exe --defaults-file=C:\xampp\mysql\bin\my.ini`
- API: `cd server; npm run dev` (port 5001)
- Client: `cd client; npm run dev` (port 3000, proxies /api + /socket.io to 5001)
- Check both: `Test-NetConnection localhost -Port 5001` / `-Port 3000`

## Build check
`cd client; npm run build` — must pass with all routes; but this is not verification, only a gate.

## Driving the UI
No Playwright in the repo. Install `playwright-core` in the session scratchpad
(`npm i playwright-core`) and launch the system Edge:

```js
const { chromium } = require("playwright-core");
const browser = await chromium.launch({ channel: "msedge", headless: true });
```

- Login: goto `http://localhost:3000/login`, fill placeholders
  `you@example.com` → `admin@chamnenh.com`, `••••••••` → `admin12345`, press Enter,
  wait for URL `/admin/`.
- The JWT cookie is set on the page context; in-page `fetch("/api/...")` calls
  are authenticated — use them for test-data setup/cleanup (make scripts
  idempotent: delete leftover fixtures right after login).
- antd form controls get `id` = the Form.Item `name` (e.g. `#category_id`,
  `#name`, `#sell_price`) — but only if custom wrapper components forward the
  injected `id` prop to the antd control.
- antd 6 gotcha: don't rely on `.ant-select-selection-item` for the selected
  label; assert on the form item's `innerText` instead.
- Toasts: `.Toastify__toast`; Popconfirm OK: `.ant-popover:visible .ant-btn-primary`.
- Screenshot every step and on failure (catch block) — screenshots are the evidence.

## Gotchas
- After editing files, the first page load may be slow (Turbopack recompile);
  a login timeout right after an edit usually just needs a retry.
- If dev suddenly 500s with `Module not found` for a transitive dep
  (e.g. `@emotion/hash`), run `npm install` in `client/` — a previous
  dependency removal may have pruned it while the dev server held it in memory.
- The header "Offline" pill in headless runs is the socket indicator, not an error.
