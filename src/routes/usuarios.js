const { route, bad, notFound, forbid } = require('../http');
const { get, run, all, tx, audit } = require('../db');
const { hashPass } = require('../auth');
const { cursosVisibles } = require('../services');
const ADMIN = { roles: ['admin'] }, STAFF = { roles: ['admin', 'preceptor', 'profesor'] };
const ROLES = ['admin', 'profesor', 'preceptor', 'alumno'];
const txt = (v, max = 120) => String(v ?? '').trim().slice(0, max);
const emailOk = (e) => !e || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

route('GET', '/api/usuarios', ({ query }) => {
  const w = [], p = [];
  if (query.rol) { w.push('u.rol=?'); p.push(query.rol); }
  if (query.q) { w.push('(u.dni LIKE ? OR u.apellido LIKE ? OR u.nombre LIKE ?)'); p.push(...Array(3).fill(`%${query.q}%`)); }
  const us = all(`SELECT u.id,u.dni,u.nombre,u.apellido,u.email,u.rol,u.curso_id,u.activo,c.nombre curso FROM usuarios u LEFT JOIN cursos c ON c.id=u.curso_id
    ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY u.apellido,u.nombre`, ...p);
  for (const u of us) {
    if (u.rol === 'alumno') u.tutores = all('SELECT nombre,email,parentesco FROM tutores WHERE alumno_id=?', u.id);
    if (u.rol === 'preceptor') u.cursos = all('SELECT curso_id FROM preceptor_cursos WHERE preceptor_id=?', u.id).map((x) => x.curso_id);
  }
  return us;
}, ADMIN);

function guardar(id, b, actor) {
  const rol = id ? get('SELECT rol FROM usuarios WHERE id=?', id)?.rol : b.rol;
  if (!ROLES.includes(rol)) throw bad('Rol inválido');
  const dni = txt(b.dni, 12), nombre = txt(b.nombre), apellido = txt(b.apellido), email = txt(b.email, 160);
  if (!/^\d{6,12}$/.test(dni)) throw bad('El DNI debe tener entre 6 y 12 dígitos');
  if (!nombre || !apellido) throw bad('Nombre y apellido son obligatorios');
  if (!emailOk(email)) throw bad('Email inválido');
  let cursoId = null;
  if (rol === 'alumno') { cursoId = +b.curso_id || null; if (!cursoId) throw bad('El alumno necesita un curso'); }
  const tutores = (b.tutores || []).filter((t) => t.email).map((t) => ({ nombre: txt(t.nombre) || 'Responsable', email: txt(t.email, 160), parentesco: txt(t.parentesco, 40) || 'Responsable' }));
  if (tutores.some((t) => !emailOk(t.email))) throw bad('Email de tutor inválido');
  return tx(() => {
    if (id) {
      run('UPDATE usuarios SET dni=?,nombre=?,apellido=?,email=?,curso_id=?,activo=? WHERE id=?', dni, nombre, apellido, email || null, cursoId, b.activo === false ? 0 : 1, id);
      if (b.password) run('UPDATE usuarios SET pass_hash=?, debe_cambiar_pass=1 WHERE id=?', hashPass(String(b.password)), id);
    } else {
      const pw = String(b.password || dni);   // por defecto la contraseña inicial es el DNI (se obliga a cambiarla)
      id = run('INSERT INTO usuarios(dni,nombre,apellido,email,rol,pass_hash,curso_id) VALUES(?,?,?,?,?,?,?)', dni, nombre, apellido, email || null, rol, hashPass(pw), cursoId).lastInsertRowid;
    }
    if (rol === 'alumno') { run('DELETE FROM tutores WHERE alumno_id=?', id); for (const t of tutores) run('INSERT INTO tutores(alumno_id,nombre,email,parentesco) VALUES(?,?,?,?)', id, t.nombre, t.email, t.parentesco); }
    if (rol === 'preceptor') { run('DELETE FROM preceptor_cursos WHERE preceptor_id=?', id); for (const c of b.cursos || []) run('INSERT INTO preceptor_cursos VALUES(?,?)', id, +c); }
    audit(actor.id, 'usuario_guardado', `${rol} ${dni}`);
    return { id: Number(id) };
  });
}
route('POST', '/api/usuarios', ({ user, body }) => guardar(null, body, user), ADMIN);
route('PUT', '/api/usuarios/:id', ({ user, params, body }) => { if (!get('SELECT 1 FROM usuarios WHERE id=?', params.id)) throw notFound(); return guardar(+params.id, body, user); }, ADMIN);
route('DELETE', '/api/usuarios/:id', ({ user, params }) => {   // baja lógica: conserva historial de notas
  if (+params.id === user.id) throw bad('No podés darte de baja a vos mismo');
  run('UPDATE usuarios SET activo=0 WHERE id=?', params.id); run('DELETE FROM sesiones WHERE usuario_id=?', params.id);
  audit(user.id, 'usuario_baja', params.id); return { ok: true };
}, ADMIN);

// Alumnos visibles según rol (para listados de notas / asistencia / boletines)
route('GET', '/api/alumnos', ({ user, query }) => {
  const cursos = cursosVisibles(user);
  if (query.curso_id && !cursos.includes(+query.curso_id)) throw forbid('No tenés acceso a ese curso');
  const ids = query.curso_id ? [+query.curso_id] : cursos;
  if (!ids.length) return [];
  return all(`SELECT id,dni,nombre,apellido,curso_id FROM usuarios WHERE rol='alumno' AND activo=1 AND curso_id IN (${ids.map(() => '?').join(',')}) ORDER BY apellido,nombre`, ...ids);
}, STAFF);

route('GET', '/api/auditoria', () => all('SELECT a.fecha,a.accion,a.detalle,u.apellido||" "||u.nombre usuario FROM auditoria a LEFT JOIN usuarios u ON u.id=a.usuario_id ORDER BY a.id DESC LIMIT 100'), ADMIN);
