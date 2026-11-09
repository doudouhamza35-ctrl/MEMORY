# Memory Art DZ — نبض الذاكرة (website + admin)

Node.js ≥ 22.13, **no npm dependencies**. Data lives in SQLite (`DATA_DIR/site.db`); uploaded photos/videos live in `DATA_DIR/uploads`.

## Files
- `server.js` — HTTP server, API, SQLite, admin auth, uploads, ratings, contact, SEO files
- `public/index.html`, `public/app.js` — public site (AR/FR/EN)
- `public/admin.html`, `public/admin.js` — dashboard (served only at `/studio`, not linked in the menu)
- `Dockerfile`, `.env.example`

## Run locally
    node server.js            # http://localhost:3000
Admin: open `/studio` (or click the © mark in the footer 5 times quickly). First-run code: `1111`.

## Deploy (the DATA_DIR must be a persistent disk/volume, or content is lost on redeploy)
**Render / Railway / Fly.io (Docker or Node service)**
1. Push this folder to a Git repo.
2. Create a Web Service (Node, start command `node server.js`, or use the Dockerfile).
3. Attach a persistent disk/volume and mount it at `/data`; set `DATA_DIR=/data`.
4. Set env vars: `TRUST_PROXY=1`, `SITE_URL=https://your-domain`, optional `ADMIN_INITIAL_CODE`, `AGENCY_URL`.
5. Open `/studio`, sign in, and **change the code immediately** (Settings tab).

**VPS (Ubuntu)**: install Node 22, copy the folder, `DATA_DIR=/var/lib/memoryart PORT=3000 TRUST_PROXY=1 node server.js` under pm2/systemd, put Nginx + Let's Encrypt (HTTPS) in front, proxy to port 3000 with `client_max_body_size 64m;`.

Back up the `DATA_DIR` folder regularly (copy `site.db` and `uploads/`).

## Security notes
- The code is never in the frontend. It is stored only as a salted scrypt hash in the database; `ADMIN_INITIAL_CODE` is read once on first start. Login is limited to 5 attempts / 15 min per visitor; sessions are HttpOnly, SameSite=Strict cookies (8 h), Secure over HTTPS.
- A 4-digit code is weak by nature. Use a longer code (the dashboard accepts any length ≥ 4).
- Ratings: 1 per visitor per target per 24 h, 8 per hour, honeypot field, length limits, all text escaped. Contact form: 3 per hour, validated, honeypot. Visitors are identified by a salted hash of their IP (raw IPs are not stored). Behind a proxy, `TRUST_PROXY=1` is required for this to work.
- Uploads: jpg, png, webp, gif, mp4, webm only; size limit `MAX_UPLOAD_MB`.

## Notes
- Public content you enter in the dashboard appears in the language you type it (no automatic translation). Club name/description can be set separately for AR/FR/EN.
- Contact messages are stored in the dashboard (Messages tab); the server does not send email. The official address `memory.art.dz@gmail.com` is shown as a mailto link.
- SEO: meta/Open Graph/JSON-LD, `robots.txt`, `sitemap.xml`; `/studio` is noindex. The site uses `#` routes, so search engines see one indexable page.
