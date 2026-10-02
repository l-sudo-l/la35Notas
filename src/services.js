const { todos, uno } = require('./db');
const conf = require('./config');

const escapar = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const redondear1 = (n) => Math.round(n * 10) / 10;

// Cursos que el usuario puede ver/gestionar según su rol
function cursosVisibles(u) {
  if (u.rol === 'admin') return todos('SELECT id FROM cursos').map((c) => c.id);
  if (u.rol === 'preceptor') return todos('SELECT curso_id id FROM preceptor_cursos WHERE preceptor_id=?', u.id).map((c) => c.id);
  if (u.rol === 'profesor') return todos('SELECT DISTINCT curso_id id FROM asignaciones WHERE profesor_id=?', u.id).map((c) => c.id);
  return u.curso_id ? [u.curso_id] : [];
}
const puedeVerCurso = (u, cursoId) => cursosVisibles(u).includes(+cursoId);

function asignacionesVisibles(u) {
  const base = `SELECT a.id, a.curso_id, a.materia_id, a.profesor_id, c.nombre curso, m.nombre materia, p.apellido||', '||p.nombre profesor
    FROM asignaciones a JOIN cursos c ON c.id=a.curso_id JOIN materias m ON m.id=a.materia_id JOIN usuarios p ON p.id=a.profesor_id`;
  if (u.rol === 'admin') return todos(base + ' ORDER BY c.nombre, m.nombre');
  if (u.rol === 'profesor') return todos(base + ' WHERE a.profesor_id=? ORDER BY c.nombre, m.nombre', u.id);
  if (u.rol === 'preceptor') return todos(base + ' WHERE a.curso_id IN (SELECT curso_id FROM preceptor_cursos WHERE preceptor_id=?) ORDER BY c.nombre, m.nombre', u.id);
  return [];
}

// Notas de un alumno agrupadas por materia. soloCerradas=true para vista alumno/boletín.
function notasAlumno(alumnoId, cicloId, soloCerradas = true) {
  const periodos = todos('SELECT id,nombre,orden,estado FROM periodos WHERE ciclo_id=? ORDER BY orden', cicloId);
  const rows = todos(`SELECT a.id asignacion_id, m.nombre materia, pr.apellido||' '||pr.nombre profesor, n.periodo_id, n.valor, n.estado, n.incompletos
    FROM usuarios u JOIN asignaciones a ON a.curso_id=u.curso_id JOIN materias m ON m.id=a.materia_id JOIN usuarios pr ON pr.id=a.profesor_id
    LEFT JOIN notas n ON n.asignacion_id=a.id AND n.alumno_id=u.id WHERE u.id=? ORDER BY m.nombre`, alumnoId);
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.asignacion_id)) map.set(r.asignacion_id, { materia: r.materia, profesor: r.profesor, notas: {}, incompletos: [] });
    const e = map.get(r.asignacion_id);
    if (r.periodo_id && r.valor != null && (!soloCerradas || r.estado === 'cerrada')) e.notas[r.periodo_id] = r.valor;
    if (r.incompletos && (!soloCerradas || r.estado === 'cerrada')) e.incompletos.push(r.incompletos);
  }
  const materias = [...map.values()].map((e) => {
    const v = Object.values(e.notas);
    return { ...e, promedio: v.length ? redondear1(v.reduce((a, b) => a + b, 0) / v.length) : null };
  });
  const promedios = materias.map((m) => m.promedio).filter((x) => x != null);
  return { periodos, materias, promedio_general: promedios.length ? redondear1(promedios.reduce((a, b) => a + b, 0) / promedios.length) : null };
}

function asistenciaResumen(alumnoId) {
  const r = Object.fromEntries(todos('SELECT estado, COUNT(*) n FROM asistencias WHERE alumno_id=? GROUP BY estado', alumnoId).map((x) => [x.estado, x.n]));
  const t = { presente: 0, ausente: 0, tarde: 0, justificada: 0, ...r };
  const dias = t.presente + t.ausente + t.tarde + t.justificada;
  // Inasistencias: ausente=1, tarde=0.5 (convención habitual); justificada no computa
  const totalInasist = t.ausente + t.tarde * 0.5;
  return { ...t, dias, inasistencias: totalInasist, porcentaje_asistencia: dias ? redondear1(100 * (1 - totalInasist / dias)) : null };
}

function boletinHtml(alumnoId, periodoId) {
  const al = uno('SELECT u.*, c.nombre curso, c.ciclo_id FROM usuarios u LEFT JOIN cursos c ON c.id=u.curso_id WHERE u.id=?', alumnoId);
  const per = uno('SELECT * FROM periodos WHERE id=?', periodoId);
  if (!al || !per) return null;
  const d = notasAlumno(alumnoId, al.ciclo_id, true), asis = asistenciaResumen(alumnoId);
  const ciclo = uno('SELECT nombre FROM ciclos WHERE id=?', al.ciclo_id);
  const periodosHasta = d.periodos.filter((p) => p.orden <= per.orden);
  const fila = (m) => `<tr><td>${escapar(m.materia)}</td>${periodosHasta.map((p) => `<td style="text-align:center;${m.notas[p.id] < 6 ? 'color:#dc2626;font-weight:700' : ''}">${m.notas[p.id] ?? '–'}</td>`).join('')}<td style="text-align:center"><b>${m.promedio ?? '–'}</b></td></tr>`;
  const pendientes = d.materias.filter((m) => m.incompletos.length).map((m) => `<li><b>${escapar(m.materia)}:</b> ${escapar(m.incompletos.join('; '))}</li>`).join('');
  return `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#0f1117">
<h2 style="margin:0;color:#1d4ed8">${escapar(conf.colegio)} · Boletín de calificaciones</h2>
<p style="margin:4px 0 16px;color:#6b7280">Ciclo lectivo ${escapar(ciclo?.nombre)} · ${escapar(per.nombre)}</p>
<p><b>Alumno/a:</b> ${escapar(al.apellido)}, ${escapar(al.nombre)} &nbsp; <b>DNI:</b> ${escapar(al.dni)} &nbsp; <b>Curso:</b> ${escapar(al.curso)}</p>
<table style="border-collapse:collapse;width:100%" border="1" cellpadding="6" bordercolor="#d6d0c4"><thead><tr style="background:#ede9de"><th align="left">Materia</th>${periodosHasta.map((p) => `<th>${escapar(p.nombre)}</th>`).join('')}<th>Promedio</th></tr></thead><tbody>${d.materias.map(fila).join('')}</tbody></table>
<p><b>Promedio general:</b> ${d.promedio_general ?? '–'}</p>
<p><b>Asistencia:</b> ${asis.porcentaje_asistencia ?? '–'} % · Inasistencias: ${asis.inasistencias} · Justificadas: ${asis.justificada}</p>
${pendientes ? `<p><b>Contenidos pendientes:</b></p><ul>${pendientes}</ul>` : ''}
<p style="color:#6b7280;font-size:12px;margin-top:24px">Documento generado automáticamente por ${escapar(conf.colegio)}. Ante dudas, comunicarse con preceptoría.</p></div>`;
}

module.exports = { escapar, redondear1, cursosVisibles, puedeVerCurso, asignacionesVisibles, notasAlumno, asistenciaResumen, boletinHtml };
