const { ruta, pedidoInvalido, prohibido, noEncontrado } = require('../http');
const { uno, ejecutar, todos, transaccion, auditar } = require('../db');
const { puede } = require('../rbac');
const Serv = require('../services');
const { encolar, procesarBandeja, smtpListo } = require('../mailer');
const conf = require('../config');
const TODOS_ROLES = { roles: ['admin', 'preceptor', 'profesor', 'alumno'] }, GESTION = { roles: ['admin', 'preceptor'] };
const texto = (v, max) => String(v ?? '').trim().slice(0, max);

// Staff ve los comunicados de sus cursos (y los globales); alumno solo los ENVIADOS que le corresponden
ruta('GET', '/api/comunicados', ({ usuario }) => {
  const cursos = Serv.cursosVisibles(usuario).concat(0).join(',');
  const base = `SELECT c.id,c.titulo,c.cuerpo,c.curso_id,k.nombre curso,c.destino,c.estado,c.creado,c.enviado,u.apellido||' '||u.nombre autor FROM comunicados c
    LEFT JOIN cursos k ON k.id=c.curso_id JOIN usuarios u ON u.id=c.autor_id`;
  if (usuario.rol === 'alumno') return todos(`${base} WHERE c.estado='enviado' AND c.destino IN ('alumnos','ambos') AND (c.curso_id IS NULL OR c.curso_id=?) ORDER BY c.enviado DESC`, usuario.curso_id ?? 0);
  if (usuario.rol === 'admin') return todos(base + ' ORDER BY c.id DESC');
  return todos(`${base} WHERE (c.curso_id IS NULL OR c.curso_id IN (${cursos})) AND (c.estado='enviado' OR c.autor_id=?) ORDER BY c.id DESC`, usuario.id);
}, TODOS_ROLES);

ruta('POST', '/api/comunicados', ({ usuario, datos }) => {
  if (!puede(usuario.rol, 'comunicados.crear')) throw prohibido('Los comunicados oficiales los emite preceptoría o administración');
  const titulo = texto(datos.titulo, 150), cuerpo = texto(datos.cuerpo, 5000), destino = datos.destino || 'ambos';
  if (!titulo || !cuerpo) throw pedidoInvalido('Completá título y mensaje');
  const curso = datos.curso_id ? +datos.curso_id : null;
  if (curso && !Serv.puedeVerCurso(usuario, curso)) throw prohibido('No tenés acceso a ese curso');
  if (!curso && usuario.rol !== 'admin') throw prohibido('Un comunicado general (todos los cursos) solo lo emite administración');
  const id = ejecutar('INSERT INTO comunicados(titulo,cuerpo,curso_id,destino,autor_id) VALUES(?,?,?,?,?)', titulo, cuerpo, curso, destino, usuario.id).lastInsertRowid;
  auditar(usuario.id, 'comunicado_creado', titulo); return { id: Number(id) };
}, GESTION);

ruta('POST', '/api/comunicados/:id/enviar', async ({ usuario, parametros }) => {
  const c = uno('SELECT * FROM comunicados WHERE id=?', parametros.id); if (!c) throw noEncontrado();
  if (c.estado === 'enviado') throw pedidoInvalido('Este comunicado ya fue enviado');
  if (c.curso_id ? !Serv.puedeVerCurso(usuario, c.curso_id) : usuario.rol !== 'admin') throw prohibido();
  const alumnos = todos(`SELECT id,email FROM usuarios WHERE rol='alumno' AND activo=1 ${c.curso_id ? 'AND curso_id=' + (+c.curso_id) : ''}`);
  const dest = new Set();
  for (const a of alumnos) {
    if (c.destino !== 'alumnos') todos('SELECT email FROM tutores WHERE alumno_id=?', a.id).forEach((t) => dest.add(t.email.toLowerCase()));
    if (c.destino !== 'tutores' && a.email) dest.add(a.email.toLowerCase());
  }
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto"><h2 style="color:#1d4ed8">${Serv.escapar(c.titulo)}</h2><p style="white-space:pre-wrap">${Serv.escapar(c.cuerpo)}</p><hr><small>${Serv.escapar(conf.colegio)} · Comunicado institucional</small></div>`;
  const ids = transaccion(() => { const r = [...dest].map((d) => Number(encolar('comunicado', c.id, d, `[${conf.colegio}] ${c.titulo}`, html))); ejecutar("UPDATE comunicados SET estado='enviado', enviado=datetime('now') WHERE id=?", c.id); return r; });
  auditar(usuario.id, 'comunicado_enviado', `${c.titulo} → ${dest.size} destinatarios`);
  return { destinatarios: dest.size, ...(await procesarBandeja(ids)), smtp: smtpListo() };
}, GESTION);

ruta('DELETE', '/api/comunicados/:id', ({ usuario, parametros }) => {
  const c = uno('SELECT * FROM comunicados WHERE id=?', parametros.id); if (!c) throw noEncontrado();
  if (c.estado === 'enviado') throw pedidoInvalido('No se puede eliminar un comunicado ya enviado');
  if (c.autor_id !== usuario.id && usuario.rol !== 'admin') throw prohibido();
  ejecutar('DELETE FROM comunicados WHERE id=?', c.id); return { ok: true };
}, GESTION);

// ---------- Boletines ----------
ruta('GET', '/api/boletines', ({ usuario, filtros }) => {
  if (!Serv.puedeVerCurso(usuario, filtros.curso_id)) throw prohibido('No tenés acceso a ese curso');
  const per = uno('SELECT * FROM periodos WHERE id=?', +filtros.periodo_id); if (!per) throw noEncontrado('Período inexistente');
  const rows = todos(`SELECT u.id alumno_id,u.apellido,u.nombre,u.dni,b.id,COALESCE(b.estado,'sin_generar') estado,b.enviado,
      (SELECT COUNT(*) FROM tutores t WHERE t.alumno_id=u.id) tutores,
      (SELECT COUNT(*) FROM asignaciones a WHERE a.curso_id=u.curso_id) materias,
      (SELECT COUNT(*) FROM notas n JOIN asignaciones a ON a.id=n.asignacion_id WHERE n.alumno_id=u.id AND n.periodo_id=? AND n.estado='cerrada') cerradas
    FROM usuarios u LEFT JOIN boletines b ON b.alumno_id=u.id AND b.periodo_id=? WHERE u.rol='alumno' AND u.activo=1 AND u.curso_id=? ORDER BY u.apellido,u.nombre`, per.id, per.id, +filtros.curso_id);
  return { periodo: per, alumnos: rows };
}, GESTION);

ruta('POST', '/api/boletines/generar', ({ usuario, datos }) => {
  if (!Serv.puedeVerCurso(usuario, datos.curso_id)) throw prohibido();
  let n = 0;
  for (const a of todos("SELECT id FROM usuarios WHERE rol='alumno' AND activo=1 AND curso_id=?", +datos.curso_id))
    n += Number(ejecutar("INSERT INTO boletines(alumno_id,periodo_id) VALUES(?,?) ON CONFLICT DO NOTHING", a.id, +datos.periodo_id).changes);
  auditar(usuario.id, 'boletines_generados', `curso ${datos.curso_id} período ${datos.periodo_id}`); return { nuevos: n };
}, GESTION);

ruta('POST', '/api/boletines/revisar', ({ usuario, datos }) => {
  let n = 0;
  for (const id of datos.ids || []) {
    const b = uno('SELECT b.*,u.curso_id FROM boletines b JOIN usuarios u ON u.id=b.alumno_id WHERE b.id=?', +id);
    if (b && Serv.puedeVerCurso(usuario, b.curso_id) && b.estado !== 'enviado') n += Number(ejecutar("UPDATE boletines SET estado='revisado', revisado_por=? WHERE id=?", usuario.id, b.id).changes);
  }
  auditar(usuario.id, 'boletines_revisados', n); return { revisados: n };
}, GESTION);

ruta('GET', '/api/boletines/:id/vista', ({ usuario, parametros, respuesta }) => {
  const b = uno('SELECT b.*,u.curso_id FROM boletines b JOIN usuarios u ON u.id=b.alumno_id WHERE b.id=?', parametros.id);
  if (!b) throw noEncontrado(); if (!Serv.puedeVerCurso(usuario, b.curso_id)) throw prohibido();
  return { html: Serv.boletinHtml(b.alumno_id, b.periodo_id) };
}, GESTION);

// Envío masivo: solo boletines 'revisado' (o 'error') → mail a cada tutor
ruta('POST', '/api/boletines/enviar', async ({ usuario, datos }) => {
  if (!Serv.puedeVerCurso(usuario, datos.curso_id)) throw prohibido();
  const bs = todos(`SELECT b.*,u.apellido,u.nombre FROM boletines b JOIN usuarios u ON u.id=b.alumno_id JOIN periodos p ON p.id=b.periodo_id
    WHERE u.curso_id=? AND b.periodo_id=? AND b.estado IN ('revisado','error')`, +datos.curso_id, +datos.periodo_id);
  if (!bs.length) throw pedidoInvalido('No hay boletines revisados para enviar');
  const per = uno('SELECT nombre FROM periodos WHERE id=?', +datos.periodo_id);
  const outIds = [], sinTutor = [];
  transaccion(() => { for (const b of bs) {
    const ts = todos('SELECT email FROM tutores WHERE alumno_id=?', b.alumno_id);
    if (!ts.length) { sinTutor.push(`${b.apellido} ${b.nombre}`); ejecutar("UPDATE boletines SET estado='error' WHERE id=?", b.id); continue; }
    const html = Serv.boletinHtml(b.alumno_id, b.periodo_id);
    for (const t of ts) outIds.push(Number(encolar('boletin', b.id, t.email, `[${conf.colegio}] Boletín ${per.nombre} – ${b.apellido} ${b.nombre}`, html)));
  } });
  const r = await procesarBandeja(outIds);
  for (const b of bs) {
    const f = todos("SELECT estado FROM bandeja_salida WHERE tipo='boletin' AND ref_id=?", b.id);
    if (f.length && f.every((x) => x.estado !== 'error' && x.estado !== 'pendiente')) ejecutar("UPDATE boletines SET estado='enviado', enviado=datetime('now') WHERE id=?", b.id);
    else if (f.length) ejecutar("UPDATE boletines SET estado='error' WHERE id=?", b.id);
  }
  auditar(usuario.id, 'boletines_enviados', `curso ${datos.curso_id}: ${outIds.length} mails`);
  return { correos: outIds.length, ...r, sin_tutor: sinTutor, smtp: smtpListo() };
}, GESTION);

ruta('GET', '/api/bandeja-salida', () => todos('SELECT id,tipo,destinatario,asunto,estado,error,creado,enviado FROM bandeja_salida ORDER BY id DESC LIMIT 100'), GESTION);
ruta('POST', '/api/bandeja-salida/reintentar', async () => ({ ...(await procesarBandeja()), smtp: smtpListo() }), GESTION);

// ---------- Dashboard ----------
ruta('GET', '/api/dashboard', ({ usuario }) => {
  const cursos = Serv.cursosVisibles(usuario), inC = cursos.concat(0).join(',');
  const periodo = uno("SELECT p.* FROM periodos p JOIN ciclos c ON c.id=p.ciclo_id WHERE c.activo=1 AND p.estado='abierto' ORDER BY p.orden LIMIT 1");
  const out = { rol: usuario.rol, periodo };
  if (usuario.rol === 'alumno') {
    const al = uno('SELECT c.ciclo_id,c.nombre curso FROM cursos c WHERE c.id=?', usuario.curso_id);
    out.curso = al?.curso; out.asistencia = Serv.asistenciaResumen(usuario.id);
    out.promedio = al ? Serv.notasAlumno(usuario.id, al.ciclo_id, true).promedio_general : null;
    out.comunicados = todos("SELECT titulo,enviado FROM comunicados WHERE estado='enviado' AND destino IN ('alumnos','ambos') AND (curso_id IS NULL OR curso_id=?) ORDER BY enviado DESC LIMIT 5", usuario.curso_id ?? 0);
    return out;
  }
  out.alumnos = uno(`SELECT COUNT(*) n FROM usuarios WHERE rol='alumno' AND activo=1 AND curso_id IN (${inC})`).n;
  out.cursos = cursos.length;
  const asg = Serv.asignacionesVisibles(usuario).map((a) => a.id).concat(0).join(',');
  if (periodo) {
    out.notas_cerradas = uno(`SELECT COUNT(*) n FROM notas WHERE periodo_id=? AND estado='cerrada' AND asignacion_id IN (${asg})`, periodo.id).n;
    out.notas_pendientes = uno(`SELECT COUNT(*) n FROM asignaciones a JOIN usuarios u ON u.curso_id=a.curso_id AND u.rol='alumno' AND u.activo=1
      LEFT JOIN notas n ON n.alumno_id=u.id AND n.asignacion_id=a.id AND n.periodo_id=? AND n.estado='cerrada' WHERE n.id IS NULL AND a.id IN (${asg})`, periodo.id).n;
  }
  out.desaprobadas = uno(`SELECT COUNT(*) n FROM notas WHERE estado='cerrada' AND valor<6 AND asignacion_id IN (${asg})`).n;
  if (usuario.rol !== 'profesor') { out.correos_enviados = uno("SELECT COUNT(*) n FROM bandeja_salida WHERE estado IN ('enviado','simulado')").n; out.correos_error = uno("SELECT COUNT(*) n FROM bandeja_salida WHERE estado='error'").n; }
  if (usuario.rol === 'admin') out.usuarios = Object.fromEntries(todos("SELECT rol,COUNT(*) n FROM usuarios WHERE activo=1 GROUP BY rol").map((x) => [x.rol, x.n]));
  out.comunicados = todos(`SELECT titulo,enviado,estado FROM comunicados WHERE (curso_id IS NULL OR curso_id IN (${inC})) ORDER BY id DESC LIMIT 5`);
  return out;
}, TODOS_ROLES);
