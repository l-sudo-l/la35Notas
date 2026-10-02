const { ruta, pedidoInvalido, noEncontrado, prohibido } = require('../http');
const { uno, ejecutar, todos, transaccion, auditar } = require('../db');
const { hashearClave } = require('../auth');
const { cursosVisibles } = require('../services');
const SOLO_ADMIN = { roles: ['admin'] }, PERSONAL = { roles: ['admin', 'preceptor', 'profesor'] };
const ROLES = ['admin', 'profesor', 'preceptor', 'alumno'];
const texto = (v, max = 120) => String(v ?? '').trim().slice(0, max);
const emailValido = (e) => !e || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

ruta('GET', '/api/usuarios', ({ filtros }) => {
  const w = [], p = [];
  if (filtros.rol) { w.push('u.rol=?'); p.push(filtros.rol); }
  if (filtros.q) { w.push('(u.dni LIKE ? OR u.apellido LIKE ? OR u.nombre LIKE ?)'); p.push(...Array(3).fill(`%${filtros.q}%`)); }
  const us = todos(`SELECT u.id,u.dni,u.nombre,u.apellido,u.email,u.rol,u.curso_id,u.activo,c.nombre curso FROM usuarios u LEFT JOIN cursos c ON c.id=u.curso_id
    ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY u.apellido,u.nombre`, ...p);
  for (const u of us) {
    if (u.rol === 'alumno') u.tutores = todos('SELECT nombre,email,parentesco FROM tutores WHERE alumno_id=?', u.id);
    if (u.rol === 'preceptor') u.cursos = todos('SELECT curso_id FROM preceptor_cursos WHERE preceptor_id=?', u.id).map((x) => x.curso_id);
  }
  return us;
}, SOLO_ADMIN);

function guardar(id, b, actor) {
  const rol = id ? uno('SELECT rol FROM usuarios WHERE id=?', id)?.rol : b.rol;
  if (!ROLES.includes(rol)) throw pedidoInvalido('Rol inválido');
  const dni = texto(b.dni, 12), nombre = texto(b.nombre), apellido = texto(b.apellido), email = texto(b.email, 160);
  if (!/^\d{6,12}$/.test(dni)) throw pedidoInvalido('El DNI debe tener entre 6 y 12 dígitos');
  if (!nombre || !apellido) throw pedidoInvalido('Nombre y apellido son obligatorios');
  if (!emailValido(email)) throw pedidoInvalido('Email inválido');
  let cursoId = null;
  if (rol === 'alumno') { cursoId = +b.curso_id || null; if (!cursoId) throw pedidoInvalido('El alumno necesita un curso'); }
  const tutores = (b.tutores || []).filter((t) => t.email).map((t) => ({ nombre: texto(t.nombre) || 'Responsable', email: texto(t.email, 160), parentesco: texto(t.parentesco, 40) || 'Responsable' }));
  if (tutores.some((t) => !emailValido(t.email))) throw pedidoInvalido('Email de tutor inválido');
  return transaccion(() => {
    if (id) {
      ejecutar('UPDATE usuarios SET dni=?,nombre=?,apellido=?,email=?,curso_id=?,activo=? WHERE id=?', dni, nombre, apellido, email || null, cursoId, b.activo === false ? 0 : 1, id);
      if (b.clave) ejecutar('UPDATE usuarios SET clave_hash=?, debe_cambiar_clave=1 WHERE id=?', hashearClave(String(b.clave)), id);
    } else {
      const pw = String(b.clave || dni);   // por defecto la contraseña inicial es el DNI (se obliga a cambiarla)
      id = ejecutar('INSERT INTO usuarios(dni,nombre,apellido,email,rol,clave_hash,curso_id) VALUES(?,?,?,?,?,?,?)', dni, nombre, apellido, email || null, rol, hashearClave(pw), cursoId).lastInsertRowid;
    }
    if (rol === 'alumno') { ejecutar('DELETE FROM tutores WHERE alumno_id=?', id); for (const t of tutores) ejecutar('INSERT INTO tutores(alumno_id,nombre,email,parentesco) VALUES(?,?,?,?)', id, t.nombre, t.email, t.parentesco); }
    if (rol === 'preceptor') { ejecutar('DELETE FROM preceptor_cursos WHERE preceptor_id=?', id); for (const c of b.cursos || []) ejecutar('INSERT INTO preceptor_cursos VALUES(?,?)', id, +c); }
    auditar(actor.id, 'usuario_guardado', `${rol} ${dni}`);
    return { id: Number(id) };
  });
}
ruta('POST', '/api/usuarios', ({ usuario, datos }) => guardar(null, datos, usuario), SOLO_ADMIN);
ruta('PUT', '/api/usuarios/:id', ({ usuario, parametros, datos }) => { if (!uno('SELECT 1 FROM usuarios WHERE id=?', parametros.id)) throw noEncontrado(); return guardar(+parametros.id, datos, usuario); }, SOLO_ADMIN);
ruta('DELETE', '/api/usuarios/:id', ({ usuario, parametros }) => {   // baja lógica: conserva historial de notas
  if (+parametros.id === usuario.id) throw pedidoInvalido('No podés darte de baja a vos mismo');
  ejecutar('UPDATE usuarios SET activo=0 WHERE id=?', parametros.id); ejecutar('DELETE FROM sesiones WHERE usuario_id=?', parametros.id);
  auditar(usuario.id, 'usuario_baja', parametros.id); return { ok: true };
}, SOLO_ADMIN);

// Alumnos visibles según rol (para listados de notas / asistencia / boletines)
ruta('GET', '/api/alumnos', ({ usuario, filtros }) => {
  const cursos = cursosVisibles(usuario);
  if (filtros.curso_id && !cursos.includes(+filtros.curso_id)) throw prohibido('No tenés acceso a ese curso');
  const ids = filtros.curso_id ? [+filtros.curso_id] : cursos;
  if (!ids.length) return [];
  return todos(`SELECT id,dni,nombre,apellido,curso_id FROM usuarios WHERE rol='alumno' AND activo=1 AND curso_id IN (${ids.map(() => '?').join(',')}) ORDER BY apellido,nombre`, ...ids);
}, PERSONAL);

ruta('GET', '/api/auditoria', () => todos('SELECT a.fecha,a.accion,a.detalle,u.apellido||" "||u.nombre usuario FROM auditoria a LEFT JOIN usuarios u ON u.id=a.usuario_id ORDER BY a.id DESC LIMIT 100'), SOLO_ADMIN);
