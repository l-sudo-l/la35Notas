const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('./config');
const { get, run } = require('./db');
const { PAGES } = require('./rbac');

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const bad = (m) => new HttpError(400, m), forbid = (m = 'No tenés permiso para esta acción') => new HttpError(403, m), notFound = (m = 'No encontrado') => new HttpError(404, m);

const routes = [];
const route = (method, pattern, handler, opts = {}) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ method, re, keys, handler, opts });
};

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const PUBLIC = path.join(cfg.root, 'public');
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');

function parseCookies(req) {
  const o = {};
  for (const p of (req.headers.cookie || '').split(';')) { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); }
  return o;
}
function sessionUser(req) {
  const t = parseCookies(req).sid;
  if (!t) return null;
  const s = get('SELECT usuario_id, expira FROM sesiones WHERE token_hash=?', hash(t));
  if (!s) return null;
  if (s.expira < Date.now()) { run('DELETE FROM sesiones WHERE token_hash=?', hash(t)); return null; }
  return get('SELECT id,dni,nombre,apellido,email,rol,curso_id,debe_cambiar_pass FROM usuarios WHERE id=? AND activo=1', s.usuario_id) || null;
}
function createSession(res, uid) {
  const token = crypto.randomBytes(32).toString('hex');
  run('INSERT INTO sesiones(token_hash,usuario_id,expira) VALUES(?,?,?)', hash(token), uid, Date.now() + cfg.sessionHours * 3600e3);
  const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${cfg.sessionHours * 3600}${secure}`);
}
function destroySession(req, res) {
  const t = parseCookies(req).sid;
  if (t) run('DELETE FROM sesiones WHERE token_hash=?', hash(t));
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
}

const readBody = (req) => new Promise((ok, ko) => {
  let b = ''; req.on('data', (c) => { b += c; if (b.length > 1e6) { ko(bad('Cuerpo demasiado grande')); req.destroy(); } });
  req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch { ko(bad('JSON inválido')); } });
});
const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };

function serveStatic(req, res, user, pathname) {
  let rel = pathname === '/' ? '/login.html' : pathname;
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) return json(res, 403, { error: 'Prohibido' });
  const name = path.basename(file);
  if (PAGES[name]) {           // páginas protegidas por rol
    if (!user) { res.writeHead(302, { Location: 'login.html' }); return res.end(); }
    if (!PAGES[name].includes(user.rol)) { res.writeHead(302, { Location: 'dashboard.html' }); return res.end(); }
  }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 – Página no encontrada'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
      'Cache-Control': name.endsWith('.html') ? 'no-store' : 'no-cache' });
    res.end(buf);
  });
}

async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  const user = sessionUser(req);
  try {
    if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, user, decodeURIComponent(url.pathname));
    const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
    if (!r) throw notFound('Ruta de API inexistente');
    if (!r.opts.public) {
      if (!user) throw new HttpError(401, 'Sesión no iniciada');
      if (r.opts.roles && !r.opts.roles.includes(user.rol)) throw forbid();
    }
    if (req.method !== 'GET' && !(req.headers['content-type'] || '').includes('application/json') && req.method !== 'DELETE') throw bad('Content-Type debe ser application/json');
    const m = url.pathname.match(r.re);
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
    const out = await r.handler({ req, res, user, params, query: Object.fromEntries(url.searchParams), body });
    if (out !== undefined && !res.writableEnded) json(res, 200, out);
  } catch (e) {
    if (e instanceof HttpError) return json(res, e.status, { error: e.message });
    if (/UNIQUE constraint/.test(e.message)) return json(res, 409, { error: 'Ya existe un registro con esos datos' });
    if (/CHECK constraint|FOREIGN KEY|NOT NULL/.test(e.message)) return json(res, 400, { error: 'Datos inválidos' });
    console.error(e); json(res, 500, { error: 'Error interno del servidor' });
  }
}
module.exports = { route, handler, HttpError, bad, forbid, notFound, createSession, destroySession };
