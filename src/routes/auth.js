const { route, bad, forbid, createSession, destroySession } = require('../http');
const { get, run, all, audit } = require('../db');
const { hashPass, checkPass, locked, fail, ok } = require('../auth');
const { P, PAGES } = require('../rbac');

const meInfo = (u) => ({ id: u.id, dni: u.dni, nombre: u.nombre, apellido: u.apellido, rol: u.rol, curso_id: u.curso_id, debe_cambiar_pass: !!u.debe_cambiar_pass,
  permisos: P[u.rol], paginas: Object.keys(PAGES).filter((p) => PAGES[p].includes(u.rol)) });

route('POST', '/api/auth/login', ({ req, res, body }) => {
  const dni = String(body.dni || '').trim(), ip = req.socket.remoteAddress;
  if (!dni || !body.password) throw bad('Ingresá DNI y contraseña');
  if (locked(ip, dni)) throw new (require('../http').HttpError)(429, 'Demasiados intentos. Probá de nuevo en 10 minutos.');
  const u = get('SELECT * FROM usuarios WHERE dni=? AND activo=1', dni);
  if (!u || !checkPass(body.password, u.pass_hash)) { fail(ip, dni); audit(u?.id, 'login_fallido', dni); throw new (require('../http').HttpError)(401, 'DNI o contraseña incorrectos'); }
  ok(ip, dni); createSession(res, u.id); audit(u.id, 'login');
  return meInfo(u);
}, { public: true });

route('POST', '/api/auth/logout', ({ req, res }) => { destroySession(req, res); return { ok: true }; }, { public: true });
route('GET', '/api/auth/me', ({ user }) => meInfo(user));

route('POST', '/api/auth/password', ({ user, body }) => {
  const u = get('SELECT * FROM usuarios WHERE id=?', user.id);
  if (!checkPass(body.actual, u.pass_hash)) throw forbid('La contraseña actual es incorrecta');
  if (!body.nueva || body.nueva.length < 8) throw bad('La nueva contraseña debe tener al menos 8 caracteres');
  run('UPDATE usuarios SET pass_hash=?, debe_cambiar_pass=0 WHERE id=?', hashPass(body.nueva), user.id);
  audit(user.id, 'cambio_password'); return { ok: true };
});
