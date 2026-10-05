import { $, api, escapar, protegido, opciones, etiqueta } from '../api.js';
import { iniciar } from '../layout.js';
const yo = await iniciar();
$('#imprimir').onclick = () => window.print();

const mostrar = protegido(async (alumnoId) => {
  const d = await api('consulta' + (alumnoId ? `?alumno_id=${alumnoId}` : ''));
  const ps = d.periodos, a = d.asistencia;
  $('#titulo').textContent = yo.rol === 'alumno' ? 'Mis calificaciones' : `${d.alumno.apellido}, ${d.alumno.nombre} · ${d.alumno.curso}`;
  const nota = (v) => (v == null ? '–' : `<span class="nota-cell ${v >= 6 ? 'nota-ok' : 'nota-alerta'}">${v}</span>`);
  $('#detalle').innerHTML = `
    <div class="tarjeta"><div class="tabla-contenedor"><table><thead><tr><th>Materia</th><th>Docente</th>${ps.map((p) => `<th>${escapar(p.nombre)}</th>`).join('')}<th>Promedio</th></tr></thead><tbody>
    ${d.materias.map((m) => `<tr><td><b>${escapar(m.materia)}</b>${m.incompletos.length ? `<div class="apagado">Pendiente: ${escapar(m.incompletos.join('; '))}</div>` : ''}</td><td>${escapar(m.profesor)}</td>${ps.map((p) => `<td>${nota(m.notas[p.id])}</td>`).join('')}<td><b>${m.promedio ?? '–'}</b></td></tr>`).join('') || '<tr><td colspan="9" class="vacio">Sin materias</td></tr>'}
    </tbody></table></div></div>
    <div class="grilla-estadisticas" style="margin-top:20px"><div class="tarjeta-estadistica azul" data-icon="📊"><div class="estadistica-etiqueta">Promedio general</div><div class="estadistica-valor">${d.promedio_general ?? '–'}</div></div>
    <div class="tarjeta-estadistica ok" data-icon="🗓️"><div class="estadistica-etiqueta">Asistencia</div><div class="estadistica-valor">${a.porcentaje_asistencia ?? '–'}${a.porcentaje_asistencia != null ? ' %' : ''}</div><div class="estadistica-sub">${a.inasistencias} inasistencias · ${a.justificada} justificadas</div></div></div>
    <p class="apagado" style="margin-top:12px">Solo se muestran notas cerradas por el docente.</p>`;
});
if (yo.rol === 'alumno') mostrar();
else {
  const config = await api('academico/config');
  $('#selector').style.display = '';
  $('#curso').innerHTML = opciones(config.cursos, 'id', (c) => c.nombre, 'Seleccionar…');
  $('#curso').onchange = protegido(async () => { const al = await api(`alumnos?curso_id=${$('#curso').value}`); $('#alumno').innerHTML = opciones(al, 'id', (a) => `${a.apellido}, ${a.nombre}`, 'Seleccionar…'); });
  $('#alumno').onchange = () => $('#alumno').value && mostrar($('#alumno').value);
  $('#detalle').innerHTML = '<div class="vacio">Elegí un curso y un alumno para ver su boletín</div>';
}
