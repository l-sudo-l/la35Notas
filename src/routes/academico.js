const { route, bad, forbid, notFound } = require('../http');
const { get, run, all, tx, audit } = require('../db');
const { can } = require('../rbac');
const S = require('../services');
const ADMIN = { roles: ['admin'] }, STAFF = { roles: ['admin', 'preceptor', 'profesor'] };
const txt = (v, max = 120) => String(v ?? '').trim().slice(0, max);

// ---------- Configuración académica (solo admin escribe) ----------
route('GET', '/api/academico/config', ({ user }) => ({
  ciclos: all('SELECT * FROM ciclos ORDER BY nombre DESC'),
  periodos: all('SELECT * FROM periodos ORDER BY ciclo_id,orden'),
  cursos: user.rol === 'admin' ? all('SELECT * FROM cursos ORDER BY nombre') : all(`SELECT * FROM cursos WHERE id IN (${S.cursosVisibles(user).concat(0).join(',')}) ORDER BY nombre`),
  materias: all('SELECT * FROM materias ORDER BY nombre'),
  asignaciones: S.asignacionesVisibles(user),
  profesores: user.rol === 'admin' ? all("SELECT id,apellido,nombre FROM usuarios WHERE rol='profesor' AND activo=1 ORDER BY apellido") : [],
}), STAFF);

route('POST', '/api/academico/ciclos', ({ user, body }) => {
  const nombre = txt(body.nombre, 20); if (!nombre) throw bad('Falta el nombre del ciclo');
  return tx(() => {
    if (body.activo) run('UPDATE ciclos SET activo=0');
    const id = run('INSERT INTO ciclos(nombre,activo) VALUES(?,?)', nombre, body.activo ? 1 : 0).lastInsertRowid;
    ['1er Bimestre', '2do Bimestre', '3er Bimestre', '4to Bimestre'].forEach((n, i) => run('INSERT INTO periodos(ciclo_id,nombre,orden) VALUES(?,?,?)', id, n, i + 1));
    audit(user.id, 'ciclo_creado', nombre); return { id: Number(id) };
  });
}, ADMIN);
route('PUT', '/api/academico/ciclos/:id/activar', ({ user, params }) => tx(() => { run('UPDATE ciclos SET activo=0'); run('UPDATE ciclos SET activo=1 WHERE id=?', params.id); audit(user.id, 'ciclo_activado', params.id); return { ok: true }; }), ADMIN);

route('POST', '/api/academico/cursos', ({ user, body }) => {
  const nombre = txt(body.nombre, 30), ciclo = +body.ciclo_id || get('SELECT id FROM ciclos WHERE activo=1')?.id;
  if (!nombre || !ciclo) throw bad('Falta nombre o ciclo');
  const id = run('INSERT INTO cursos(nombre,ciclo_id) VALUES(?,?)', nombre, ciclo).lastInsertRowid; audit(user.id, 'curso_creado', nombre); return { id: Number(id) };
}, ADMIN);
route('POST', '/api/academico/materias', ({ user, body }) => {
  const nombre = txt(body.nombre, 80); if (!nombre) throw bad('Falta el nombre');
  const id = run('INSERT INTO materias(nombre) VALUES(?)', nombre).lastInsertRowid; audit(user.id, 'materia_creada', nombre); return { id: Number(id) };
}, ADMIN);
route('POST', '/api/academico/asignaciones', ({ user, body }) => {
  if (!get("SELECT 1 FROM usuarios WHERE id=? AND rol='profesor' AND activo=1", +body.profesor_id)) throw bad('Profesor inválido');
  run('INSERT INTO asignaciones(curso_id,materia_id,profesor_id) VALUES(?,?,?)', +body.curso_id, +body.materia_id, +body.profesor_id);
  audit(user.id, 'asignacion_creada', JSON.stringify(body)); return { ok: true };
}, ADMIN);
route('DELETE', '/api/academico/asignaciones/:id', ({ user, params }) => {
  if (get('SELECT 1 FROM notas WHERE asignacion_id=?', params.id)) throw bad('No se puede eliminar: ya tiene notas cargadas');
  run('DELETE FROM asignaciones WHERE id=?', params.id); audit(user.id, 'asignacion_eliminada', params.id); return { ok: true };
}, ADMIN);

// Cierre / reapertura de período (admin)
route('PUT', '/api/academico/periodos/:id/estado', ({ user, params, body }) => {
  if (!['abierto', 'cerrado'].includes(body.estado)) throw bad('Estado inválido');
  if (body.estado === 'cerrado') {
    const pend = get(`SELECT COUNT(*) n FROM asignaciones a JOIN usuarios u ON u.curso_id=a.curso_id AND u.rol='alumno' AND u.activo=1
      LEFT JOIN notas n ON n.alumno_id=u.id AND n.asignacion_id=a.id AND n.periodo_id=? AND n.estado='cerrada' WHERE n.id IS NULL`, params.id).n;
    if (pend && !body.forzar) return { ok: false, pendientes: pend, error: `Hay ${pend} notas sin cerrar. Confirmá para cerrar igualmente.` };
  }
  run('UPDATE periodos SET estado=? WHERE id=?', body.estado, params.id); audit(user.id, 'periodo_' + body.estado, params.id); return { ok: true };
}, ADMIN);

// ---------- Notas ----------
route('GET', '/api/mis-asignaciones', ({ user }) => S.asignacionesVisibles(user), STAFF);

route('GET', '/api/notas', ({ user, query }) => {
  const asg = S.asignacionesVisibles(user).find((a) => a.id === +query.asignacion_id);
  if (!asg) throw forbid('No tenés acceso a esa materia/curso');
  const per = get('SELECT * FROM periodos WHERE id=?', +query.periodo_id); if (!per) throw notFound('Período inexistente');
  const alumnos = all(`SELECT u.id alumno_id,u.dni,u.apellido,u.nombre,n.valor,n.estado,n.incompletos FROM usuarios u
    LEFT JOIN notas n ON n.alumno_id=u.id AND n.asignacion_id=? AND n.periodo_id=? WHERE u.rol='alumno' AND u.activo=1 AND u.curso_id=? ORDER BY u.apellido,u.nombre`, asg.id, per.id, asg.curso_id);
  for (const a of alumnos) {
    const prev = all(`SELECT p.nombre,n.valor FROM notas n JOIN periodos p ON p.id=n.periodo_id WHERE n.alumno_id=? AND n.asignacion_id=? AND p.orden<? AND n.estado='cerrada' AND n.valor IS NOT NULL ORDER BY p.orden`, a.alumno_id, asg.id, per.orden);
    a.previas = prev; a.sugerido = prev.length ? S.round1(prev.reduce((s, x) => s + x.valor, 0) / prev.length) : null;
    a.estado ??= 'vacia';
  }
  return { asignacion: asg, periodo: per, alumnos, puede_corregir: can(user.rol, 'notas.corregir_cerradas') };
}, STAFF);

route('PUT', '/api/notas', ({ user, body }) => {
  const asg = S.asignacionesVisibles(user).find((a) => a.id === +body.asignacion_id);
  if (!asg) throw forbid('No tenés acceso a esa materia/curso');
  if (user.rol === 'preceptor' && !can('preceptor', 'notas.corregir_cerradas')) throw forbid();
  const per = get('SELECT * FROM periodos WHERE id=?', +body.periodo_id); if (!per) throw notFound('Período inexistente');
  const corrige = can(user.rol, 'notas.corregir_cerradas'), motivo = txt(body.motivo, 300);
  if (per.estado === 'cerrado' && !corrige) throw forbid('El período está cerrado. Pedile la corrección a preceptoría.');
  const items = Array.isArray(body.items) ? body.items : []; if (!items.length) throw bad('No hay notas para guardar');
  return tx(() => {
    let n = 0;
    for (const it of items) {
      const al = get("SELECT id FROM usuarios WHERE id=? AND rol='alumno' AND activo=1 AND curso_id=?", +it.alumno_id, asg.curso_id);
      if (!al) throw bad('Alumno inválido para este curso');
      const valor = it.valor === '' || it.valor == null ? null : Number(it.valor);
      if (valor !== null && !(valor >= 1 && valor <= 10)) throw bad('Las notas deben estar entre 1 y 10');
      if (body.cerrar && valor === null) throw bad('Para cerrar, todos los alumnos deben tener nota');
      const ex = get('SELECT * FROM notas WHERE alumno_id=? AND asignacion_id=? AND periodo_id=?', al.id, asg.id, per.id);
      const incompletos = txt(it.incompletos, 300) || null;
      if (ex?.estado === 'cerrada') {
        if (!corrige) throw forbid('Hay notas ya cerradas: solo preceptoría o administración puede corregirlas');
        if (ex.valor === valor && ex.incompletos === incompletos) continue;
        if (!motivo) throw bad('Para corregir una nota cerrada indicá el motivo');
        run('INSERT INTO notas_historial(nota_id,valor_anterior,valor_nuevo,motivo,usuario_id) VALUES(?,?,?,?,?)', ex.id, ex.valor, valor, motivo, user.id);
        audit(user.id, 'nota_corregida', `nota ${ex.id}: ${ex.valor} → ${valor} (${motivo})`);
      }
      const estado = body.cerrar || ex?.estado === 'cerrada' ? 'cerrada' : 'borrador';
      run(`INSERT INTO notas(alumno_id,asignacion_id,periodo_id,valor,estado,incompletos,actualizado_por,actualizado) VALUES(?,?,?,?,?,?,?,datetime('now'))
        ON CONFLICT(alumno_id,asignacion_id,periodo_id) DO UPDATE SET valor=excluded.valor,estado=excluded.estado,incompletos=excluded.incompletos,actualizado_por=excluded.actualizado_por,actualizado=excluded.actualizado`,
        al.id, asg.id, per.id, valor, estado, incompletos, user.id);
      n++;
    }
    audit(user.id, body.cerrar ? 'notas_cerradas' : 'notas_borrador', `${asg.curso} ${asg.materia} ${per.nombre} (${n})`);
    return { ok: true, guardadas: n, cerradas: !!body.cerrar };
  });
}, STAFF);

route('GET', '/api/notas/historial', ({ user, query }) => {
  if (!can(user.rol, 'notas.corregir_cerradas')) throw forbid();
  return all(`SELECT h.fecha,h.valor_anterior,h.valor_nuevo,h.motivo,u.apellido||' '||u.nombre usuario,al.apellido||' '||al.nombre alumno,m.nombre materia
    FROM notas_historial h JOIN notas n ON n.id=h.nota_id JOIN usuarios al ON al.id=n.alumno_id JOIN asignaciones a ON a.id=n.asignacion_id JOIN materias m ON m.id=a.materia_id
    JOIN usuarios u ON u.id=h.usuario_id WHERE a.curso_id IN (${S.cursosVisibles(user).concat(0).join(',')}) ORDER BY h.id DESC LIMIT 50`);
}, STAFF);

// Consulta de boletín / calificaciones (alumno: solo las propias y cerradas)
route('GET', '/api/consulta', ({ user, query }) => {
  let alumnoId = user.id;
  if (user.rol !== 'alumno') {
    alumnoId = +query.alumno_id; const al = get("SELECT * FROM usuarios WHERE id=? AND rol='alumno'", alumnoId);
    if (!al) throw notFound('Alumno inexistente');
    if (!S.puedeVerCurso(user, al.curso_id)) throw forbid('No tenés acceso a ese alumno');
  }
  const al = get('SELECT u.id,u.dni,u.nombre,u.apellido,c.nombre curso,c.ciclo_id FROM usuarios u JOIN cursos c ON c.id=u.curso_id WHERE u.id=?', alumnoId);
  if (!al) throw notFound('Sin curso asignado');
  return { alumno: al, ...S.notasAlumno(alumnoId, al.ciclo_id, true), asistencia: S.asistenciaResumen(alumnoId) };
});

// ---------- Asistencias ----------
route('GET', '/api/asistencias', ({ user, query }) => {
  if (!S.puedeVerCurso(user, query.curso_id)) throw forbid('No tenés acceso a ese curso');
  const fecha = query.fecha || new Date().toISOString().slice(0, 10);
  return { fecha, editable: can(user.rol, 'asistencia.registrar'), alumnos: all(`SELECT u.id alumno_id,u.apellido,u.nombre,u.dni,a.estado FROM usuarios u
    LEFT JOIN asistencias a ON a.alumno_id=u.id AND a.fecha=? WHERE u.rol='alumno' AND u.activo=1 AND u.curso_id=? ORDER BY u.apellido,u.nombre`, fecha, +query.curso_id) };
}, STAFF);
route('PUT', '/api/asistencias', ({ user, body }) => {
  if (!can(user.rol, 'asistencia.registrar')) throw forbid('Solo preceptoría y administración registran asistencia');
  if (!S.puedeVerCurso(user, body.curso_id)) throw forbid('No tenés acceso a ese curso');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.fecha || '')) throw bad('Fecha inválida');
  return tx(() => {
    for (const it of body.items || []) {
      if (!get("SELECT 1 FROM usuarios WHERE id=? AND rol='alumno' AND curso_id=?", +it.alumno_id, +body.curso_id)) throw bad('Alumno inválido');
      if (!it.estado) continue;
      run(`INSERT INTO asistencias(alumno_id,curso_id,fecha,estado,registrado_por) VALUES(?,?,?,?,?) ON CONFLICT(alumno_id,fecha) DO UPDATE SET estado=excluded.estado,registrado_por=excluded.registrado_por`, +it.alumno_id, +body.curso_id, body.fecha, it.estado, user.id);
    }
    audit(user.id, 'asistencia_registrada', `curso ${body.curso_id} ${body.fecha}`); return { ok: true };
  });
}, STAFF);
