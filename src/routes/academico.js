const { ruta, pedidoInvalido, prohibido, noEncontrado } = require('../http');
const { uno, ejecutar, todos, transaccion, auditar } = require('../db');
const { puede } = require('../rbac');
const Serv = require('../services');
const SOLO_ADMIN = { roles: ['admin'] }, PERSONAL = { roles: ['admin', 'preceptor', 'profesor'] };
const texto = (v, max = 120) => String(v ?? '').trim().slice(0, max);

// ---------- Configuración académica (solo admin escribe) ----------
ruta('GET', '/api/academico/config', ({ usuario }) => ({
  ciclos: todos('SELECT * FROM ciclos ORDER BY nombre DESC'),
  periodos: todos('SELECT * FROM periodos ORDER BY ciclo_id,orden'),
  cursos: usuario.rol === 'admin' ? todos('SELECT * FROM cursos ORDER BY nombre') : todos(`SELECT * FROM cursos WHERE id IN (${Serv.cursosVisibles(usuario).concat(0).join(',')}) ORDER BY nombre`),
  materias: todos('SELECT * FROM materias ORDER BY nombre'),
  asignaciones: Serv.asignacionesVisibles(usuario),
  profesores: usuario.rol === 'admin' ? todos("SELECT id,apellido,nombre FROM usuarios WHERE rol='profesor' AND activo=1 ORDER BY apellido") : [],
}), PERSONAL);

ruta('POST', '/api/academico/ciclos', ({ usuario, datos }) => {
  const nombre = texto(datos.nombre, 20); if (!nombre) throw pedidoInvalido('Falta el nombre del ciclo');
  return transaccion(() => {
    if (datos.activo) ejecutar('UPDATE ciclos SET activo=0');
    const id = ejecutar('INSERT INTO ciclos(nombre,activo) VALUES(?,?)', nombre, datos.activo ? 1 : 0).lastInsertRowid;
    ['1er Bimestre', '2do Bimestre', '3er Bimestre', '4to Bimestre'].forEach((n, i) => ejecutar('INSERT INTO periodos(ciclo_id,nombre,orden) VALUES(?,?,?)', id, n, i + 1));
    auditar(usuario.id, 'ciclo_creado', nombre); return { id: Number(id) };
  });
}, SOLO_ADMIN);
ruta('PUT', '/api/academico/ciclos/:id/activar', ({ usuario, parametros }) => transaccion(() => { ejecutar('UPDATE ciclos SET activo=0'); ejecutar('UPDATE ciclos SET activo=1 WHERE id=?', parametros.id); auditar(usuario.id, 'ciclo_activado', parametros.id); return { ok: true }; }), SOLO_ADMIN);

ruta('POST', '/api/academico/cursos', ({ usuario, datos }) => {
  const nombre = texto(datos.nombre, 30), ciclo = +datos.ciclo_id || uno('SELECT id FROM ciclos WHERE activo=1')?.id;
  if (!nombre || !ciclo) throw pedidoInvalido('Falta nombre o ciclo');
  const id = ejecutar('INSERT INTO cursos(nombre,ciclo_id) VALUES(?,?)', nombre, ciclo).lastInsertRowid; auditar(usuario.id, 'curso_creado', nombre); return { id: Number(id) };
}, SOLO_ADMIN);
ruta('POST', '/api/academico/materias', ({ usuario, datos }) => {
  const nombre = texto(datos.nombre, 80); if (!nombre) throw pedidoInvalido('Falta el nombre');
  const id = ejecutar('INSERT INTO materias(nombre) VALUES(?)', nombre).lastInsertRowid; auditar(usuario.id, 'materia_creada', nombre); return { id: Number(id) };
}, SOLO_ADMIN);
ruta('POST', '/api/academico/asignaciones', ({ usuario, datos }) => {
  if (!uno("SELECT 1 FROM usuarios WHERE id=? AND rol='profesor' AND activo=1", +datos.profesor_id)) throw pedidoInvalido('Profesor inválido');
  ejecutar('INSERT INTO asignaciones(curso_id,materia_id,profesor_id) VALUES(?,?,?)', +datos.curso_id, +datos.materia_id, +datos.profesor_id);
  auditar(usuario.id, 'asignacion_creada', JSON.stringify(datos)); return { ok: true };
}, SOLO_ADMIN);
ruta('DELETE', '/api/academico/asignaciones/:id', ({ usuario, parametros }) => {
  if (uno('SELECT 1 FROM notas WHERE asignacion_id=?', parametros.id)) throw pedidoInvalido('No se puede eliminar: ya tiene notas cargadas');
  ejecutar('DELETE FROM asignaciones WHERE id=?', parametros.id); auditar(usuario.id, 'asignacion_eliminada', parametros.id); return { ok: true };
}, SOLO_ADMIN);

// Cierre / reapertura de período (admin)
ruta('PUT', '/api/academico/periodos/:id/estado', ({ usuario, parametros, datos }) => {
  if (!['abierto', 'cerrado'].includes(datos.estado)) throw pedidoInvalido('Estado inválido');
  if (datos.estado === 'cerrado') {
    const pend = uno(`SELECT COUNT(*) n FROM asignaciones a JOIN usuarios u ON u.curso_id=a.curso_id AND u.rol='alumno' AND u.activo=1
      LEFT JOIN notas n ON n.alumno_id=u.id AND n.asignacion_id=a.id AND n.periodo_id=? AND n.estado='cerrada' WHERE n.id IS NULL`, parametros.id).n;
    if (pend && !datos.forzar) return { ok: false, pendientes: pend, error: `Hay ${pend} notas sin cerrar. Confirmá para cerrar igualmente.` };
  }
  ejecutar('UPDATE periodos SET estado=? WHERE id=?', datos.estado, parametros.id); auditar(usuario.id, 'periodo_' + datos.estado, parametros.id); return { ok: true };
}, SOLO_ADMIN);

// ---------- Notas ----------
ruta('GET', '/api/mis-asignaciones', ({ usuario }) => Serv.asignacionesVisibles(usuario), PERSONAL);

ruta('GET', '/api/notas', ({ usuario, filtros }) => {
  const asg = Serv.asignacionesVisibles(usuario).find((a) => a.id === +filtros.asignacion_id);
  if (!asg) throw prohibido('No tenés acceso a esa materia/curso');
  const per = uno('SELECT * FROM periodos WHERE id=?', +filtros.periodo_id); if (!per) throw noEncontrado('Período inexistente');
  const alumnos = todos(`SELECT u.id alumno_id,u.dni,u.apellido,u.nombre,n.valor,n.estado,n.incompletos FROM usuarios u
    LEFT JOIN notas n ON n.alumno_id=u.id AND n.asignacion_id=? AND n.periodo_id=? WHERE u.rol='alumno' AND u.activo=1 AND u.curso_id=? ORDER BY u.apellido,u.nombre`, asg.id, per.id, asg.curso_id);
  for (const a of alumnos) {
    const prev = todos(`SELECT p.nombre,n.valor FROM notas n JOIN periodos p ON p.id=n.periodo_id WHERE n.alumno_id=? AND n.asignacion_id=? AND p.orden<? AND n.estado='cerrada' AND n.valor IS NOT NULL ORDER BY p.orden`, a.alumno_id, asg.id, per.orden);
    a.previas = prev; a.sugerido = prev.length ? Serv.redondear1(prev.reduce((s, x) => s + x.valor, 0) / prev.length) : null;
    a.estado ??= 'vacia';
  }
  return { asignacion: asg, periodo: per, alumnos, puede_corregir: puede(usuario.rol, 'notas.corregir_cerradas') };
}, PERSONAL);

ruta('PUT', '/api/notas', ({ usuario, datos }) => {
  const asg = Serv.asignacionesVisibles(usuario).find((a) => a.id === +datos.asignacion_id);
  if (!asg) throw prohibido('No tenés acceso a esa materia/curso');
  if (usuario.rol === 'preceptor' && !puede('preceptor', 'notas.corregir_cerradas')) throw prohibido();
  const per = uno('SELECT * FROM periodos WHERE id=?', +datos.periodo_id); if (!per) throw noEncontrado('Período inexistente');
  const corrige = puede(usuario.rol, 'notas.corregir_cerradas'), motivo = texto(datos.motivo, 300);
  if (per.estado === 'cerrado' && !corrige) throw prohibido('El período está cerrado. Pedile la corrección a preceptoría.');
  const items = Array.isArray(datos.items) ? datos.items : []; if (!items.length) throw pedidoInvalido('No hay notas para guardar');
  return transaccion(() => {
    let n = 0;
    for (const it of items) {
      const al = uno("SELECT id FROM usuarios WHERE id=? AND rol='alumno' AND activo=1 AND curso_id=?", +it.alumno_id, asg.curso_id);
      if (!al) throw pedidoInvalido('Alumno inválido para este curso');
      const valor = it.valor === '' || it.valor == null ? null : Number(it.valor);
      if (valor !== null && !(valor >= 1 && valor <= 10)) throw pedidoInvalido('Las notas deben estar entre 1 y 10');
      if (datos.cerrar && valor === null) throw pedidoInvalido('Para cerrar, todos los alumnos deben tener nota');
      const ex = uno('SELECT * FROM notas WHERE alumno_id=? AND asignacion_id=? AND periodo_id=?', al.id, asg.id, per.id);
      const incompletos = texto(it.incompletos, 300) || null;
      if (ex?.estado === 'cerrada') {
        if (!corrige) throw prohibido('Hay notas ya cerradas: solo preceptoría o administración puede corregirlas');
        if (ex.valor === valor && ex.incompletos === incompletos) continue;
        if (!motivo) throw pedidoInvalido('Para corregir una nota cerrada indicá el motivo');
        ejecutar('INSERT INTO notas_historial(nota_id,valor_anterior,valor_nuevo,motivo,usuario_id) VALUES(?,?,?,?,?)', ex.id, ex.valor, valor, motivo, usuario.id);
        auditar(usuario.id, 'nota_corregida', `nota ${ex.id}: ${ex.valor} → ${valor} (${motivo})`);
      }
      const estado = datos.cerrar || ex?.estado === 'cerrada' ? 'cerrada' : 'borrador';
      ejecutar(`INSERT INTO notas(alumno_id,asignacion_id,periodo_id,valor,estado,incompletos,actualizado_por,actualizado) VALUES(?,?,?,?,?,?,?,datetime('now'))
        ON CONFLICT(alumno_id,asignacion_id,periodo_id) DO UPDATE SET valor=excluded.valor,estado=excluded.estado,incompletos=excluded.incompletos,actualizado_por=excluded.actualizado_por,actualizado=excluded.actualizado`,
        al.id, asg.id, per.id, valor, estado, incompletos, usuario.id);
      n++;
    }
    auditar(usuario.id, datos.cerrar ? 'notas_cerradas' : 'notas_borrador', `${asg.curso} ${asg.materia} ${per.nombre} (${n})`);
    return { ok: true, guardadas: n, cerradas: !!datos.cerrar };
  });
}, PERSONAL);

ruta('GET', '/api/notas/historial', ({ usuario, filtros }) => {
  if (!puede(usuario.rol, 'notas.corregir_cerradas')) throw prohibido();
  return todos(`SELECT h.fecha,h.valor_anterior,h.valor_nuevo,h.motivo,u.apellido||' '||u.nombre usuario,al.apellido||' '||al.nombre alumno,m.nombre materia
    FROM notas_historial h JOIN notas n ON n.id=h.nota_id JOIN usuarios al ON al.id=n.alumno_id JOIN asignaciones a ON a.id=n.asignacion_id JOIN materias m ON m.id=a.materia_id
    JOIN usuarios u ON u.id=h.usuario_id WHERE a.curso_id IN (${Serv.cursosVisibles(usuario).concat(0).join(',')}) ORDER BY h.id DESC LIMIT 50`);
}, PERSONAL);

// Consulta de boletín / calificaciones (alumno: solo las propias y cerradas)
ruta('GET', '/api/consulta', ({ usuario, filtros }) => {
  let alumnoId = usuario.id;
  if (usuario.rol !== 'alumno') {
    alumnoId = +filtros.alumno_id; const al = uno("SELECT * FROM usuarios WHERE id=? AND rol='alumno'", alumnoId);
    if (!al) throw noEncontrado('Alumno inexistente');
    if (!Serv.puedeVerCurso(usuario, al.curso_id)) throw prohibido('No tenés acceso a ese alumno');
  }
  const al = uno('SELECT u.id,u.dni,u.nombre,u.apellido,c.nombre curso,c.ciclo_id FROM usuarios u JOIN cursos c ON c.id=u.curso_id WHERE u.id=?', alumnoId);
  if (!al) throw noEncontrado('Sin curso asignado');
  return { alumno: al, ...Serv.notasAlumno(alumnoId, al.ciclo_id, true), asistencia: Serv.asistenciaResumen(alumnoId) };
});

// ---------- Asistencias ----------
ruta('GET', '/api/asistencias', ({ usuario, filtros }) => {
  if (!Serv.puedeVerCurso(usuario, filtros.curso_id)) throw prohibido('No tenés acceso a ese curso');
  const fecha = filtros.fecha || new Date().toISOString().slice(0, 10);
  return { fecha, editable: puede(usuario.rol, 'asistencia.registrar'), alumnos: todos(`SELECT u.id alumno_id,u.apellido,u.nombre,u.dni,a.estado FROM usuarios u
    LEFT JOIN asistencias a ON a.alumno_id=u.id AND a.fecha=? WHERE u.rol='alumno' AND u.activo=1 AND u.curso_id=? ORDER BY u.apellido,u.nombre`, fecha, +filtros.curso_id) };
}, PERSONAL);
ruta('PUT', '/api/asistencias', ({ usuario, datos }) => {
  if (!puede(usuario.rol, 'asistencia.registrar')) throw prohibido('Solo preceptoría y administración registran asistencia');
  if (!Serv.puedeVerCurso(usuario, datos.curso_id)) throw prohibido('No tenés acceso a ese curso');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha || '')) throw pedidoInvalido('Fecha inválida');
  return transaccion(() => {
    for (const it of datos.items || []) {
      if (!uno("SELECT 1 FROM usuarios WHERE id=? AND rol='alumno' AND curso_id=?", +it.alumno_id, +datos.curso_id)) throw pedidoInvalido('Alumno inválido');
      if (!it.estado) continue;
      ejecutar(`INSERT INTO asistencias(alumno_id,curso_id,fecha,estado,registrado_por) VALUES(?,?,?,?,?) ON CONFLICT(alumno_id,fecha) DO UPDATE SET estado=excluded.estado,registrado_por=excluded.registrado_por`, +it.alumno_id, +datos.curso_id, datos.fecha, it.estado, usuario.id);
    }
    auditar(usuario.id, 'asistencia_registrada', `curso ${datos.curso_id} ${datos.fecha}`); return { ok: true };
  });
}, PERSONAL);
