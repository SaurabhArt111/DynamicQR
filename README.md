# DynamicVault QR — split-domain architecture

## Apps
- `admin/` — authenticated admin control room. Routes start at `/` (no `/dv-control`).
- `landing/` — public landing + QR viewer. QR destinations use `/q/:token` (no `/view/`). No authentication is used on this app.
- `server/` — shared Node/Express/MongoDB API and upload storage.

## Local development
1. Start MongoDB.
2. `cd server && npm install && npm run seed && npm run dev`
3. `cd admin && npm install && npm run dev` → admin at `http://localhost:5173`
4. `cd landing && npm install && npm run dev` → public at `http://localhost:5174`

## Production domains
Set `ADMIN_URL` to the admin subdomain, `PUBLIC_URL`/`PUBLIC_BASE_URL` to the public domain, and `VITE_API_URL` in both React apps to the API origin.

QRs are generated against the public domain so a scan always lands in the public application.

## Upload browser
Admin `/files` is intentionally read-only. It recursively lists everything physically present under `server/uploads`; there is no delete endpoint or delete control on that page. Existing recycle-bin lifecycle remains the governed deletion path.
