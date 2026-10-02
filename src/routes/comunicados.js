const { route, bad, forbid, notFound } = require('../http');
const { get, run, all, tx, audit } = require('../db');
const { can } = require('../rbac');
const S = require('../services');
const { encolar, procesarOutbox, smtpListo } = require('../mailer');
const cfg = require('../config');
const ALL = { roles: ['admin', 'preceptor', 'profesor', 'alumno'] }, MGR = { roles: ['admin', 'preceptor'] };
const txt = (v, max) => String(v ?? '').trim().slice(0, max);

// Staff ve los comunicados de sus cursos (y los globales); alumno solo los ENVIADOS que le corresponden
route('GET', '/api/comunicados', ({ user }) => {
  const cursos = S.cursosVisibles(user).concat(0).join(',');
  const base = `SELECT c.id,c.titulo,c.cuerpo,c.curso_id,k.nombre curso,c.destino,c.estado,c.creado,c.enviado,u.apellido||' '||u.nombre autor FROM comunicados c
    LEFT JOIN cursos k ON k.id=c.curso_id JOIN usuarios u ON u.id=c.autor_id`;
  if (user.rol === 'alumno') return all(`${base} WHERE c.estado='enviado' AND c.destino IN ('alumnos','ambos') AND (c.curso_id IS NULL OR c.curso_id=?) ORDER BY c.enviado DESC`, user.curso_id ?? 0);
  if (user.rol === 'admin') return all(base + ' ORDER BY c.id DESC');
  return all(`${base} WHERE (c.curso_id IS NULL OR c.curso_id IN (${cursos})) AND (c.estado='enviado' OR c.autor_id=?) ORDER BY c.id DESC`, user.id);
}, ALL);

route('POST', '/api/comunicados', ({ user, body }) => {
  if (!can(user.rol, 'comunicados.crear')) throw forbid('Los comunicados oficiales los emite preceptoría o administración');
  const titulo = txt(body.titulo, 150), cuerpo = txt(body.cuerpo, 5000), destino = body.destino || 'ambos';
  if (!titulo || !cuerpo) throw bad('Completá título y mensaje');
  const curso = body.curso_id ? +body.curso_id : null;
  if (curso && !S.puedeVerCurso(user, curso)) throw forbid('No tenés acceso a ese curso');
  if (!curso && user.rol !== 'admin') throw forbid('Un comunicado general (todos los cursos) solo lo emite administración');
  const id = run('INSERT INTO comunicados(titulo,cuerpo,curso_id,destino,autor_id) VALUES(?,?,?,?,?)', titulo, cuerpo, curso, destino, user.id).lastInsertRowid;
  audit(user.id, 'comunicado_creado', titulo); return { id: Number(id) };
}, MGR);

route('POST', '/api/comunicados/:id/enviar', async ({ user, params }) => {
  const c = get('SELECT * FROM comunicados WHERE id=?', params.id); if (!c) throw notFound();
  if (c.estado === 'enviado') throw bad('Este comunicado ya fue enviado');
  if (c.curso_id ? !S.puedeVerCurso(user, c.curso_id) : user.rol !== 'admin') throw forbid();
  const alumnos = all(`SELECT id,email FROM usuarios WHERE rol='alumno' AND activo=1 ${c.curso_id ? 'AND curso_id=' + (+c.curso_id) : ''}`);
  const dest = new Set();
  for (const a of alumnos) {
    if (c.destino !== 'alumnos') all('SELECT email FROM tutores WHERE alumno_id=?', a.id).forEach((t) => dest.add(t.email.toLowerCase()));
    if (c.destino !== 'tutores' && a.email) dest.add(a.email.toLowerCase());
  }
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto"><h2 style="color:#1d4ed8">${S.esc(c.titulo)}</h2><p style="white-space:pre-wrap">${S.esc(c.cuerpo)}</p><hr><small>${S.esc(cfg.school)} · Comunicado institucional</small></div>`;
  const ids = tx(() => { const r = [...dest].map((d) => Number(encolar('comunicado', c.id, d, `[${cfg.school}] ${c.titulo}`, html))); run("UPDATE comunicados SET estado='enviado', enviado=datetime('now') WHERE id=?", c.id); return r; });
  audit(user.id, 'comunicado_enviado', `${c.titulo} → ${dest.size} destinatarios`);
  return { destinatarios: dest.size, ...(await procesarOutbox(ids)), smtp: smtpListo() };
}, MGR);

route('DELETE', '/api/comunicados/:id', ({ user, params }) => {
  const c = get('SELECT * FROM comunicados WHERE id=?', params.id); if (!c) throw notFound();
  if (c.estado === 'enviado') throw bad('No se puede eliminar un comunicado ya enviado');
  if (c.autor_id !== user.id && user.rol !== 'admin') throw forbid();
  run('DELETE FROM comunicados WHERE id=?', c.id); return { ok: true };
}, MGR);

// ---------- Boletines ----------
route('GET', '/api/boletines', ({ user, query }) => {
  if (!S.puedeVerCurso(user, query.curso_id)) throw forbid('No tenés acceso a ese curso');
  const per = get('SELECT * FROM periodos WHERE id=?', +query.periodo_id); if (!per) throw notFound('Período inexistente');
  const rows = all(`SELECT u.id alumno_id,u.apellido,u.nombre,u.dni,b.id,COALESCE(b.estado,'sin_generar') estado,b.enviado,
      (SELECT COUNT(*) FROM tutores t WHERE t.alumno_id=u.id) tutores,
      (SELECT COUNT(*) FROM asignaciones a WHERE a.curso_id=u.curso_id) materias,
      (SELECT COUNT(*) FROM notas n JOIN asignaciones a ON a.id=n.asignacion_id WHERE n.alumno_id=u.id AND n.periodo_id=? AND n.estado='cerrada') cerradas
    FROM usuarios u LEFT JOIN boletines b ON b.alumno_id=u.id AND b.periodo_id=? WHERE u.rol='alumno' AND u.activo=1 AND u.curso_id=? ORDER BY u.apellido,u.nombre`, per.id, per.id, +query.curso_id);
  return { periodo: per, alumnos: rows };
}, MGR);

route('POST', '/api/boletines/generar', ({ user, body }) => {
  if (!S.puedeVerCurso(user, body.curso_id)) throw forbid();
  let n = 0;
  for (const a of all("SELECT id FROM usuarios WHERE rol='alumno' AND activo=1 AND curso_id=?", +body.curso_id))
    n += Number(run("INSERT INTO boletines(alumno_id,periodo_id) VALUES(?,?) ON CONFLICT DO NOTHING", a.id, +body.periodo_id).changes);
  audit(user.id, 'boletines_generados', `curso ${body.curso_id} período ${body.periodo_id}`); return { nuevos: n };
}, MGR);

route('POST', '/api/boletines/revisar', ({ user, body }) => {
  let n = 0;
  for (const id of body.ids || []) {
    const b = get('SELECT b.*,u.curso_id FROM boletines b JOIN usuarios u ON u.id=b.alumno_id WHERE b.id=?', +id);
    if (b && S.puedeVerCurso(user, b.curso_id) && b.estado !== 'enviado') n += Number(run("UPDATE boletines SET estado='revisado', revisado_por=? WHERE id=?", user.id, b.id).changes);
  }
  audit(user.id, 'boletines_revisados', n); return { revisados: n };
}, MGR);

route('GET', '/api/boletines/:id/vista', ({ user, params, res }) => {
  const b = get('SELECT b.*,u.curso_id FROM boletines b JOIN usuarios u ON u.id=b.alumno_id WHERE b.id=?', params.id);
  if (!b) throw notFound(); if (!S.puedeVerCurso(user, b.curso_id)) throw forbid();
  return { html: S.boletinHtml(b.alumno_id, b.periodo_id) };
}, MGR);

// Envío masivo: solo boletines 'revisado' (o 'error') → mail a cada tutor
route('POST', '/api/boletines/enviar', async ({ user, body }) => {
  if (!S.puedeVerCurso(user, body.curso_id)) throw forbid();
  const bs = all(`SELECT b.*,u.apellido,u.nombre FROM boletines b JOIN usuarios u ON u.id=b.alumno_id JOIN periodos p ON p.id=b.periodo_id
    WHERE u.curso_id=? AND b.periodo_id=? AND b.estado IN ('revisado','error')`, +body.curso_id, +body.periodo_id);
  if (!bs.length) throw bad('No hay boletines revisados para enviar');
  const per = get('SELECT nombre FROM periodos WHERE id=?', +body.periodo_id);
  const outIds = [], sinTutor = [];
  tx(() => { for (const b of bs) {
    const ts = all('SELECT email FROM tutores WHERE alumno_id=?', b.alumno_id);
    if (!ts.length) { sinTutor.push(`${b.apellido} ${b.nombre}`); run("UPDATE boletines SET estado='error' WHERE id=?", b.id); continue; }
    const html = S.boletinHtml(b.alumno_id, b.periodo_id);
    for (const t of ts) outIds.push(Number(encolar('boletin', b.id, t.email, `[${cfg.school}] Boletín ${per.nombre} – ${b.apellido} ${b.nombre}`, html)));
  } });
  const r = await procesarOutbox(outIds);
  for (const b of bs) {
    const f = all("SELECT estado FROM outbox WHERE tipo='boletin' AND ref_id=?", b.id);
    if (f.length && f.every((x) => x.estado !== 'error' && x.estado !== 'pendiente')) run("UPDATE boletines SET estado='enviado', enviado=datetime('now') WHERE id=?", b.id);
    else if (f.length) run("UPDATE boletines SET estado='error' WHERE id=?", b.id);
  }
  audit(user.id, 'boletines_enviados', `curso ${body.curso_id}: ${outIds.length} mails`);
  return { mails: outIds.length, ...r, sin_tutor: sinTutor, smtp: smtpListo() };
}, MGR);

route('GET', '/api/outbox', () => all('SELECT id,tipo,destinatario,asunto,estado,error,creado,enviado FROM outbox ORDER BY id DESC LIMIT 100'), MGR);
route('POST', '/api/outbox/reintentar', async () => ({ ...(await procesarOutbox()), smtp: smtpListo() }), MGR);

// ---------- Dashboard ----------
route('GET', '/api/dashboard', ({ user }) => {
  const cursos = S.cursosVisibles(user), inC = cursos.concat(0).join(',');
  const periodo = get("SELECT p.* FROM periodos p JOIN ciclos c ON c.id=p.ciclo_id WHERE c.activo=1 AND p.estado='abierto' ORDER BY p.orden LIMIT 1");
  const out = { rol: user.rol, periodo };
  if (user.rol === 'alumno') {
    const al = get('SELECT c.ciclo_id,c.nombre curso FROM cursos c WHERE c.id=?', user.curso_id);
    out.curso = al?.curso; out.asistencia = S.asistenciaResumen(user.id);
    out.promedio = al ? S.notasAlumno(user.id, al.ciclo_id, true).promedio_general : null;
    out.comunicados = all("SELECT titulo,enviado FROM comunicados WHERE estado='enviado' AND destino IN ('alumnos','ambos') AND (curso_id IS NULL OR curso_id=?) ORDER BY enviado DESC LIMIT 5", user.curso_id ?? 0);
    return out;
  }
  out.alumnos = get(`SELECT COUNT(*) n FROM usuarios WHERE rol='alumno' AND activo=1 AND curso_id IN (${inC})`).n;
  out.cursos = cursos.length;
  const asg = S.asignacionesVisibles(user).map((a) => a.id).concat(0).join(',');
  if (periodo) {
    out.notas_cerradas = get(`SELECT COUNT(*) n FROM notas WHERE periodo_id=? AND estado='cerrada' AND asignacion_id IN (${asg})`, periodo.id).n;
    out.notas_pendientes = get(`SELECT COUNT(*) n FROM asignaciones a JOIN usuarios u ON u.curso_id=a.curso_id AND u.rol='alumno' AND u.activo=1
      LEFT JOIN notas n ON n.alumno_id=u.id AND n.asignacion_id=a.id AND n.periodo_id=? AND n.estado='cerrada' WHERE n.id IS NULL AND a.id IN (${asg})`, periodo.id).n;
  }
  out.desaprobadas = get(`SELECT COUNT(*) n FROM notas WHERE estado='cerrada' AND valor<6 AND asignacion_id IN (${asg})`).n;
  if (user.rol !== 'profesor') { out.mails_enviados = get("SELECT COUNT(*) n FROM outbox WHERE estado IN ('enviado','simulado')").n; out.mails_error = get("SELECT COUNT(*) n FROM outbox WHERE estado='error'").n; }
  if (user.rol === 'admin') out.usuarios = Object.fromEntries(all("SELECT rol,COUNT(*) n FROM usuarios WHERE activo=1 GROUP BY rol").map((x) => [x.rol, x.n]));
  out.comunicados = all(`SELECT titulo,enviado,estado FROM comunicados WHERE (curso_id IS NULL OR curso_id IN (${inC})) ORDER BY id DESC LIMIT 5`);
  return out;
}, ALL);
