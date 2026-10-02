import { $, api, esc, guard, options, badge } from '../api.js';
import { init } from '../layout.js';
const me = await init();
$('#imprimir').onclick = () => window.print();

const mostrar = guard(async (alumnoId) => {
  const d = await api('consulta' + (alumnoId ? `?alumno_id=${alumnoId}` : ''));
  const ps = d.periodos, a = d.asistencia;
  $('#titulo').textContent = me.rol === 'alumno' ? 'Mis calificaciones' : `${d.alumno.apellido}, ${d.alumno.nombre} · ${d.alumno.curso}`;
  const nota = (v) => (v == null ? '–' : `<span class="nota-cell ${v >= 6 ? 'nota-ok' : 'nota-warn'}">${v}</span>`);
  $('#detalle').innerHTML = `
    <div class="card"><div class="table-wrap"><table><thead><tr><th>Materia</th><th>Docente</th>${ps.map((p) => `<th>${esc(p.nombre)}</th>`).join('')}<th>Promedio</th></tr></thead><tbody>
    ${d.materias.map((m) => `<tr><td><b>${esc(m.materia)}</b>${m.incompletos.length ? `<div class="muted">Pendiente: ${esc(m.incompletos.join('; '))}</div>` : ''}</td><td>${esc(m.profesor)}</td>${ps.map((p) => `<td>${nota(m.notas[p.id])}</td>`).join('')}<td><b>${m.promedio ?? '–'}</b></td></tr>`).join('') || '<tr><td colspan="9" class="empty">Sin materias</td></tr>'}
    </tbody></table></div></div>
    <div class="stats-grid" style="margin-top:20px"><div class="stat-card blue" data-icon="📊"><div class="stat-label">Promedio general</div><div class="stat-value">${d.promedio_general ?? '–'}</div></div>
    <div class="stat-card ok" data-icon="🗓️"><div class="stat-label">Asistencia</div><div class="stat-value">${a.porcentaje_asistencia ?? '–'}${a.porcentaje_asistencia != null ? ' %' : ''}</div><div class="stat-sub">${a.inasistencias} inasistencias · ${a.justificada} justificadas</div></div></div>
    <p class="muted" style="margin-top:12px">Solo se muestran notas cerradas por el docente.</p>`;
});
if (me.rol === 'alumno') mostrar();
else {
  const cfg = await api('academico/config');
  $('#selector').style.display = '';
  $('#curso').innerHTML = options(cfg.cursos, 'id', (c) => c.nombre, 'Seleccionar…');
  $('#curso').onchange = guard(async () => { const al = await api(`alumnos?curso_id=${$('#curso').value}`); $('#alumno').innerHTML = options(al, 'id', (a) => `${a.apellido}, ${a.nombre}`, 'Seleccionar…'); });
  $('#alumno').onchange = () => $('#alumno').value && mostrar($('#alumno').value);
  $('#detalle').innerHTML = '<div class="empty">Elegí un curso y un alumno para ver su boletín</div>';
}
