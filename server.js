'use strict';
// Memory Art DZ — server (Node >= 22.13, zero npm dependencies)
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const PORT = +process.env.PORT || 3000;
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUB = fs.existsSync(path.join(__dirname, 'public')) ? path.join(__dirname, 'public') : __dirname;
const MAXMB = +process.env.MAX_UPLOAD_MB || 60;
const TRUST = process.env.TRUST_PROXY === '1';
const SITE = (process.env.SITE_URL || '').replace(/\/$/, '');
const AGENCY = process.env.AGENCY_URL || '';
const ALLOWED_ORIGINS = new Set((process.env.ALLOWED_ORIGINS || '').split(',').map(s => {
  const origin = s.trim();
  if (!origin) return '';
  try { const u = new URL(origin); return /^https?:$/.test(u.protocol) && u.origin === origin ? origin : ''; }
  catch { return ''; }
}).filter(Boolean));
fs.mkdirSync(path.join(DATA, 'uploads'), { recursive: true });
const db = new DatabaseSync(path.join(DATA, 'site.db'));
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS items(id INTEGER PRIMARY KEY,kind TEXT,title TEXT,body TEXT,url TEXT,grp INT,ref INT,date TEXT,place TEXT,feat INT DEFAULT 0,pub INT DEFAULT 1,extra TEXT,created INT);
CREATE TABLE IF NOT EXISTS ratings(id INTEGER PRIMARY KEY,target TEXT,stars INT,name TEXT,comment TEXT,hidden INT DEFAULT 0,ip TEXT,created INT);
CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY,name TEXT,org TEXT,email TEXT,topic TEXT,body TEXT,created INT);
CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY,v TEXT);`);

// ---- admin code: stored only as a salted scrypt hash, checked on the server ----
const hash = (c, s) => crypto.scryptSync(String(c), s, 32).toString('hex');
function setCode(c) { const s = crypto.randomBytes(16).toString('hex'); db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run('code', s + ':' + hash(c, s)); }
if (!db.prepare("SELECT 1 FROM settings WHERE k='code'").get()) setCode(process.env.ADMIN_INITIAL_CODE || '1111');
function okCode(c) {
  const [s, h] = db.prepare("SELECT v FROM settings WHERE k='code'").get().v.split(':');
  return crypto.timingSafeEqual(Buffer.from(hash(c, s), 'hex'), Buffer.from(h, 'hex'));
}
const salt = process.env.IP_SALT || crypto.randomBytes(8).toString('hex');
const sessions = new Map(), hits = new Map();
function limit(k, max, ms) { const n = Date.now(), a = (hits.get(k) || []).filter(t => n - t < ms); if (a.length >= max) { hits.set(k, a); return false; } a.push(n); hits.set(k, a); return true; }
setInterval(() => { const n = Date.now(); for (const [k, v] of sessions) if (v < n) sessions.delete(k); hits.clear(); }, 36e5).unref();

const KINDS = ['photo', 'video', 'event', 'announcement', 'album', 'club'];
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm', html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css', txt: 'text/plain', xml: 'application/xml', ico: 'image/x-icon', svg: 'image/svg+xml' };
const CSP_ORIGINS = [...ALLOWED_ORIGINS].join(' ');
const CSP = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: ${CSP_ORIGINS}; media-src 'self' ${CSP_ORIGINS}; connect-src 'self' ${CSP_ORIGINS}; frame-src https://www.youtube-nocookie.com https://player.vimeo.com; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`;

function send(res, code, body, type, extra) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(code, Object.assign({ 'Content-Type': type || (isObj ? 'application/json' : 'text/plain'), 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': CSP, 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY' }, extra || {}));
  res.end(isObj ? JSON.stringify(body) : body);
}
function readBody(req, max) {
  return new Promise((ok, no) => { const c = []; let n = 0; req.on('data', d => { n += d.length; if (n > max) { no(new Error('big')); req.destroy(); } else c.push(d); }); req.on('end', () => ok(Buffer.concat(c))); req.on('error', no); });
}
const json = async (req) => { try { return JSON.parse((await readBody(req, 2e5)).toString() || '{}'); } catch (e) { return {}; } };
const ipOf = req => (TRUST && req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : req.socket.remoteAddress) || '';
const ipHash = req => crypto.createHash('sha256').update(ipOf(req) + salt).digest('hex').slice(0, 16);
const cookie = req => Object.fromEntries((req.headers.cookie || '').split(/;\s*/).map(s => s.split('=')).filter(a => a[0]));
const authed = req => { const t = cookie(req).sid, e = t && sessions.get(t); return !!e && e > Date.now(); };
const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const safeUrl = u => u === '' || /^\/uploads\/[\w.-]+$/.test(u) || /^https?:\/\/[^\s"'<>]+$/.test(u);

function summary(target) {
  const r = db.prepare('SELECT COUNT(*) n, AVG(stars) a FROM ratings WHERE target=? AND hidden=0').get(target);
  const comments = db.prepare("SELECT stars,name,comment,created FROM ratings WHERE target=? AND hidden=0 AND comment!='' ORDER BY id DESC LIMIT 50").all(target);
  return { count: r.n, avg: r.n ? Math.round(r.a * 10) / 10 : 0, comments };
}
function dropFile(url) {
  if (url && url.startsWith('/uploads/') && !db.prepare('SELECT 1 FROM items WHERE url=?').get(url)) fs.unlink(path.join(DATA, url), () => {});
}

async function api(req, res, u) {
  const m = req.method, p = u.pathname;
  const corsMethods = { '/api/public': ['GET'], '/api/ratings': ['GET', 'POST'], '/api/contact': ['POST'] }[p];
  const origin = req.headers.origin;
  if (m === 'OPTIONS') {
    const requestedMethod = req.headers['access-control-request-method'];
    const requestedHeaders = (req.headers['access-control-request-headers'] || '').split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
    if (!corsMethods || !origin || !ALLOWED_ORIGINS.has(origin) || !corsMethods.includes(requestedMethod) ||
      requestedHeaders.some(h => h !== 'x-requested-with' && h !== 'content-type')) {
      return send(res, 403, { error: 'cors' });
    }
    res.writeHead(204, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': requestedMethod,
      'Access-Control-Allow-Headers': 'x-requested-with, content-type',
      'Access-Control-Max-Age': '600',
      'Vary': 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers'
    });
    return res.end();
  }
  if (corsMethods && origin && ALLOWED_ORIGINS.has(origin) && corsMethods.includes(m)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  if (m !== 'GET' && req.headers['x-requested-with'] !== 'fetch') return send(res, 403, { error: 'csrf' });
  if (m === 'GET' && p === '/api/public') {
    const items = db.prepare('SELECT * FROM items WHERE pub=1 ORDER BY date DESC,id DESC').all();
    const rat = {}; for (const r of db.prepare('SELECT target,COUNT(*) n,AVG(stars) a FROM ratings WHERE hidden=0 GROUP BY target').all()) rat[r.target] = { count: r.n, avg: Math.round(r.a * 10) / 10 };
    return send(res, 200, { items, rat, agency: AGENCY });
  }
  if (m === 'GET' && p === '/api/ratings') { const t = u.searchParams.get('target') || 'site'; return send(res, 200, summary(t)); }
  if (m === 'POST' && p === '/api/ratings') {
    const b = await json(req), t = str(b.target, 20), s = parseInt(b.stars, 10);
    if (b.website) return send(res, 200, summary('site')); // honeypot: silently ignore bots
    if (!/^(site|event:\d+)$/.test(t) || !(s >= 1 && s <= 5)) return send(res, 400, { error: 'invalid' });
    if (t !== 'site' && !db.prepare("SELECT 1 FROM items WHERE kind='event' AND pub=1 AND id=?").get(+t.slice(6))) return send(res, 400, { error: 'invalid' });
    const h = ipHash(req);
    if (!limit('r' + h + t, 1, 864e5) || !limit('R' + h, 8, 36e5)) return send(res, 429, { error: 'dup' });
    db.prepare('INSERT INTO ratings(target,stars,name,comment,ip,created) VALUES(?,?,?,?,?,?)').run(t, s, str(b.name, 60), str(b.comment, 600), h, Date.now());
    return send(res, 200, summary(t));
  }
  if (m === 'POST' && p === '/api/contact') {
    const b = await json(req);
    if (b.website) return send(res, 200, { ok: true });
    const e = str(b.email, 120), body = str(b.message, 3000), name = str(b.name, 80);
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) || body.length < 10) return send(res, 400, { error: 'invalid' });
    if (!limit('c' + ipHash(req), 3, 36e5)) return send(res, 429, { error: 'rate' });
    db.prepare('INSERT INTO messages(name,org,email,topic,body,created) VALUES(?,?,?,?,?,?)').run(name, str(b.org, 120), e, str(b.topic, 60), body, Date.now());
    return send(res, 200, { ok: true });
  }
  // ---------- admin ----------
  if (m === 'POST' && p === '/api/admin/login') {
    const b = await json(req), h = ipHash(req);
    if (!limit('L' + h, 5, 9e5)) return send(res, 429, { error: 'locked' });
    if (!okCode(str(b.code, 100))) return send(res, 401, { error: 'bad' });
    hits.delete('L' + h);
    const t = crypto.randomBytes(32).toString('hex'); sessions.set(t, Date.now() + 8 * 36e5);
    return send(res, 200, { ok: true }, null, { 'Set-Cookie': `sid=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${TRUST || req.socket.encrypted ? '; Secure' : ''}` });
  }
  if (!p.startsWith('/api/admin/')) return send(res, 404, { error: 'nf' });
  if (!authed(req)) return send(res, 401, { error: 'auth' });
  if (m === 'POST' && p === '/api/admin/logout') { sessions.delete(cookie(req).sid); return send(res, 200, { ok: true }, null, { 'Set-Cookie': 'sid=; Max-Age=0; Path=/' }); }
  if (m === 'GET' && p === '/api/admin/data') {
    const st = db.prepare("SELECT COUNT(*) n, AVG(stars) a FROM ratings WHERE target='site' AND hidden=0").get();
    return send(res, 200, {
      items: db.prepare('SELECT * FROM items ORDER BY date DESC,id DESC').all(),
      ratings: db.prepare('SELECT id,target,stars,name,comment,hidden,created FROM ratings ORDER BY id DESC LIMIT 300').all(),
      messages: db.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT 200').all(),
      stats: { all: db.prepare('SELECT COUNT(*) n, AVG(stars) a FROM ratings WHERE hidden=0').get(), site: st }
    });
  }
  if (m === 'POST' && p === '/api/admin/items') {
    const b = await json(req), k = str(b.kind, 20);
    if (!KINDS.includes(k) || !safeUrl(str(b.url, 500))) return send(res, 400, { error: 'invalid' });
    const v = [k, str(b.title, 200), str(b.body, 4000), str(b.url, 500), b.grp ? +b.grp : null, b.ref != null && b.ref !== '' ? +b.ref : null, str(b.date, 10), str(b.place, 200), b.feat ? 1 : 0, b.pub === 0 || b.pub === false ? 0 : 1, str(b.extra, 6000)];
    if (b.id) {
      const old = db.prepare('SELECT url FROM items WHERE id=?').get(+b.id);
      db.prepare('UPDATE items SET kind=?,title=?,body=?,url=?,grp=?,ref=?,date=?,place=?,feat=?,pub=?,extra=? WHERE id=?').run(...v, +b.id);
      if (old && old.url !== v[3]) dropFile(old.url);
      return send(res, 200, { id: +b.id });
    }
    const r = db.prepare('INSERT INTO items(kind,title,body,url,grp,ref,date,place,feat,pub,extra,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(...v, Date.now());
    return send(res, 200, { id: Number(r.lastInsertRowid) });
  }
  let x;
  if (m === 'DELETE' && (x = p.match(/^\/api\/admin\/items\/(\d+)$/))) {
    const it = db.prepare('SELECT * FROM items WHERE id=?').get(+x[1]);
    db.prepare('DELETE FROM items WHERE id=?').run(+x[1]);
    if (it) { if (it.kind === 'album') db.prepare('UPDATE items SET grp=NULL WHERE grp=?').run(it.id); if (it.kind === 'event') { db.prepare('UPDATE items SET ref=NULL WHERE ref=?').run(it.id); db.prepare('DELETE FROM ratings WHERE target=?').run('event:' + it.id); } dropFile(it.url); }
    return send(res, 200, { ok: true });
  }
  if (m === 'POST' && p === '/api/admin/upload') {
    const ext = (req.headers['x-filename'] || '').split('.').pop().toLowerCase();
    if (!['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'webm'].includes(ext)) return send(res, 400, { error: 'type' });
    let buf; try { buf = await readBody(req, MAXMB * 1048576); } catch (e) { return send(res, 413, { error: 'size' }); }
    if (!buf.length) return send(res, 400, { error: 'empty' });
    const name = crypto.randomBytes(12).toString('hex') + '.' + ext;
    fs.writeFileSync(path.join(DATA, 'uploads', name), buf);
    return send(res, 200, { url: '/uploads/' + name });
  }
  if (m === 'POST' && (x = p.match(/^\/api\/admin\/rating\/(\d+)$/))) { const b = await json(req); db.prepare('UPDATE ratings SET hidden=? WHERE id=?').run(b.hidden ? 1 : 0, +x[1]); return send(res, 200, { ok: true }); }
  if (m === 'DELETE' && (x = p.match(/^\/api\/admin\/rating\/(\d+)$/))) { db.prepare('DELETE FROM ratings WHERE id=?').run(+x[1]); return send(res, 200, { ok: true }); }
  if (m === 'DELETE' && (x = p.match(/^\/api\/admin\/message\/(\d+)$/))) { db.prepare('DELETE FROM messages WHERE id=?').run(+x[1]); return send(res, 200, { ok: true }); }
  if (m === 'POST' && p === '/api/admin/code') {
    const b = await json(req);
    if (!limit('C' + ipHash(req), 5, 9e5)) return send(res, 429, { error: 'locked' });
    if (!okCode(str(b.current, 100))) return send(res, 401, { error: 'bad' });
    const n = str(b.next, 100); if (n.length < 4) return send(res, 400, { error: 'short' });
    setCode(n); sessions.clear();
    return send(res, 200, { ok: true }, null, { 'Set-Cookie': 'sid=; Max-Age=0; Path=/' });
  }
  return send(res, 404, { error: 'nf' });
}

function file(req, res, fp, headers) {
  fs.stat(fp, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found');
    const type = MIME[path.extname(fp).slice(1)] || 'application/octet-stream', h = Object.assign({ 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': CSP, 'Accept-Ranges': 'bytes' }, headers || {});
    const r = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (r) {
      const a = r[1] ? +r[1] : 0, b = r[2] ? Math.min(+r[2], st.size - 1) : st.size - 1;
      if (a > b) { res.writeHead(416, { 'Content-Range': 'bytes */' + st.size }); return res.end(); }
      res.writeHead(206, Object.assign(h, { 'Content-Range': `bytes ${a}-${b}/${st.size}`, 'Content-Length': b - a + 1 }));
      return fs.createReadStream(fp, { start: a, end: b }).pipe(res);
    }
    res.writeHead(200, Object.assign(h, { 'Content-Length': st.size }));
    fs.createReadStream(fp).pipe(res);
  });
}

http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname), base = SITE || 'https://' + (req.headers.host || 'localhost');
    if (p === '/health' && req.method === 'GET') return send(res, 200, { ok: true });
    if (p.startsWith('/api/')) return await api(req, res, u);
    if (p === '/robots.txt') return send(res, 200, `User-agent: *\nDisallow: /studio\nDisallow: /api/\nSitemap: ${base}/sitemap.xml\n`);
    if (p === '/sitemap.xml') return send(res, 200, `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${base}/</loc></url></urlset>`, 'application/xml');
    if (p === '/studio') return file(req, res, path.join(PUB, 'admin.html'), { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' });
    if (p === '/') { let h = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8').replace(/__SITE__/g, base); return send(res, 200, h, MIME.html); }
    if (p.startsWith('/uploads/')) { const fp = path.join(DATA, 'uploads', path.basename(p)); return file(req, res, fp, { 'Cache-Control': 'public, max-age=31536000, immutable' }); }
    const fp = path.join(PUB, path.normalize(p).replace(/^(\.\.[\/\\])+/, ''));
    if (!fp.startsWith(PUB + path.sep) || path.basename(fp) === 'admin.html') return send(res, 404, 'Not found');
    return file(req, res, fp, { 'Cache-Control': 'public, max-age=3600' });
  } catch (e) { console.error(e); send(res, 500, { error: 'server' }); }
}).listen(PORT, () => console.log('Memory Art DZ on :' + PORT));
