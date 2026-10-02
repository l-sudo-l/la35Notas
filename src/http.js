const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const conf = require('./config');
const { uno, ejecutar } = require('./db');
const { PAGINAS } = require('./rbac');

class ErrorHttp extends Error { constructor(status, mensaje) { super(mensaje); this.status = status; } }
const pedidoInvalido = (m) => new ErrorHttp(400, m), prohibido = (m = 'No tenés permiso para esta acción') => new ErrorHttp(403, m), noEncontrado = (m = 'No encontrado') => new ErrorHttp(404, m);

const rutas = [];
const ruta = (method, patron, manejador, opciones = {}) => {
  const keys = [];
  const re = new RegExp('^' + patron.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  rutas.push({ method, re, keys, manejador, opciones });
};

const TIPOS_MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const CARPETA_PUBLICA = path.join(conf.raiz, 'public');
const hashear = (t) => crypto.createHash('sha256').update(t).digest('hex');

function leerCookies(pedido) {
  const o = {};
  for (const p of (pedido.headers.cookie || '').split(';')) { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); }
  return o;
}
function usuarioDeSesion(pedido) {
  const t = leerCookies(pedido).sid;
  if (!t) return null;
  const s = uno('SELECT usuario_id, expira FROM sesiones WHERE token_hash=?', hashear(t));
  if (!s) return null;
  if (s.expira < Date.now()) { ejecutar('DELETE FROM sesiones WHERE token_hash=?', hashear(t)); return null; }
  return uno('SELECT id,dni,nombre,apellido,email,rol,curso_id,debe_cambiar_clave FROM usuarios WHERE id=? AND activo=1', s.usuario_id) || null;
}
function crearSesion(respuesta, usuarioId) {
  const token = crypto.randomBytes(32).toString('hex');
  ejecutar('INSERT INTO sesiones(token_hash,usuario_id,expira) VALUES(?,?,?)', hashear(token), usuarioId, Date.now() + conf.horasSesion * 3600e3);
  const secure = process.env.COOKIE_SEGURA === '1' ? '; Secure' : '';
  respuesta.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${conf.horasSesion * 3600}${secure}`);
}
function destruirSesion(pedido, respuesta) {
  const t = leerCookies(pedido).sid;
  if (t) ejecutar('DELETE FROM sesiones WHERE token_hash=?', hashear(t));
  respuesta.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
}

const leerCuerpo = (pedido) => new Promise((ok, ko) => {
  let b = ''; pedido.on('data', (c) => { b += c; if (b.length > 1e6) { ko(pedidoInvalido('Cuerpo demasiado grande')); pedido.destroy(); } });
  pedido.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch { ko(pedidoInvalido('JSON inválido')); } });
});
const responderJson = (respuesta, status, data) => { respuesta.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); respuesta.end(JSON.stringify(data)); };

function servirEstatico(pedido, respuesta, usuario, pathname) {
  let rel = pathname === '/' ? '/login.html' : pathname;
  const file = path.normalize(path.join(CARPETA_PUBLICA, rel));
  if (!file.startsWith(CARPETA_PUBLICA + path.sep)) return responderJson(respuesta, 403, { error: 'Prohibido' });
  const name = path.basename(file);
  if (PAGINAS[name]) {           // páginas protegidas por rol
    if (!usuario) { respuesta.writeHead(302, { Location: 'login.html' }); return respuesta.end(); }
    if (!PAGINAS[name].includes(usuario.rol)) { respuesta.writeHead(302, { Location: 'dashboard.html' }); return respuesta.end(); }
  }
  fs.readFile(file, (err, buf) => {
    if (err) { respuesta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return respuesta.end('404 – Página no encontrada'); }
    respuesta.writeHead(200, { 'Content-Type': TIPOS_MIME[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
      'Cache-Control': name.endsWith('.html') ? 'no-store' : 'no-cache' });
    respuesta.end(buf);
  });
}

async function manejador(pedido, respuesta) {
  const url = new URL(pedido.url, 'http://x');
  const usuario = usuarioDeSesion(pedido);
  try {
    if (!url.pathname.startsWith('/api/')) return servirEstatico(pedido, respuesta, usuario, decodeURIComponent(url.pathname));
    const r = rutas.find((x) => x.method === pedido.method && x.re.test(url.pathname));
    if (!r) throw noEncontrado('Ruta de API inexistente');
    if (!r.opciones.public) {
      if (!usuario) throw new ErrorHttp(401, 'Sesión no iniciada');
      if (r.opciones.roles && !r.opciones.roles.includes(usuario.rol)) throw prohibido();
    }
    if (pedido.method !== 'GET' && !(pedido.headers['content-type'] || '').includes('application/json') && pedido.method !== 'DELETE') throw pedidoInvalido('Content-Type debe ser application/json');
    const m = url.pathname.match(r.re);
    const parametros = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    const datos = ['POST', 'PUT', 'PATCH'].includes(pedido.method) ? await leerCuerpo(pedido) : {};
    const out = await r.manejador({ pedido, respuesta, usuario, parametros, filtros: Object.fromEntries(url.searchParams), datos });
    if (out !== undefined && !respuesta.writableEnded) responderJson(respuesta, 200, out);
  } catch (e) {
    if (e instanceof ErrorHttp) return responderJson(respuesta, e.status, { error: e.message });
    if (/UNIQUE constraint/.test(e.message)) return responderJson(respuesta, 409, { error: 'Ya existe un registro con esos datos' });
    if (/CHECK constraint|FOREIGN KEY|NOT NULL/.test(e.message)) return responderJson(respuesta, 400, { error: 'Datos inválidos' });
    console.error(e); responderJson(respuesta, 500, { error: 'Error interno del servidor' });
  }
}
module.exports = { ruta, manejador, ErrorHttp, pedidoInvalido, prohibido, noEncontrado, crearSesion, destruirSesion };
