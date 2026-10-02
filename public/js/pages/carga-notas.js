import { $, $$, api, esc, toast, guard, options, badge } from '../api.js';
import { init } from '../layout.js';
await init();
const cfg = await api('academico/config');
const asgs = cfg.asignaciones;
const periodos = cfg.periodos.filter((p) => cfg.ciclos.find((c) => c.id === p.ciclo_id)?.activo);
$('#asg').innerHTML = options(asgs, 'id', (a) => `${a.curso} — ${a.materia}`, 'Seleccionar…');
$('#per').innerHTML = options(periodos, 'id', (p) => `${p.nombre}${p.estado === 'cerrado' ? ' (cerrado)' : ''}`);
$('#per').value = (periodos.find((p) => p.estado === 'abierto') || periodos[0] || {}).id || '';
if (!asgs.length) $('#tabla').innerHTML = '<div class="empty">No tenés materias asignadas.</div>';
let data;

const load = guard(async () => {
  if (!$('#asg').value || !$('#per').value) return;
  data = await api(`notas?asignacion_id=${$('#asg').value}&periodo_id=${$('#per').value}`);
  const cerradoPer = data.periodo.estado === 'cerrado', corrige = data.puede_corregir;
  $('#estado-periodo').innerHTML = badge(cerradoPer ? 'Período cerrado' : 'Período abierto', cerradoPer ? 'grey' : 'ok');
  const hayCerradas = data.alumnos.some((a) => a.estado === 'cerrada');
  const bloqueado = (a) => (cerradoPer || a.estado === 'cerrada') && !corrige;
  $('#tabla').innerHTML = `<div class="card">
    ${!corrige && (cerradoPer || hayCerradas) ? '<div class="notice warn" style="margin:12px">Las notas cerradas no se pueden modificar. Para corregir una nota pedíselo a preceptoría.</div>' : ''}
    <div class="table-wrap"><table><thead><tr><th>Alumno</th><th>DNI</th><th>Notas previas</th><th>Promedio sugerido</th><th>Nota (1–10)</th><th>Contenidos incompletos</th><th>Estado</th></tr></thead><tbody>
    ${data.alumnos.map((a) => `<tr data-id="${a.alumno_id}"><td>${esc(a.apellido)}, ${esc(a.nombre)}</td><td>${esc(a.dni)}</td>
      <td class="muted">${a.previas.map((p) => `${esc(p.nombre.slice(0, 3))}: ${p.valor}`).join(' · ') || '–'}</td><td>${a.sugerido ?? '–'}</td>
      <td><input class="tbl-input nota" type="number" min="1" max="10" step="0.25" value="${a.valor ?? ''}" ${bloqueado(a) ? 'disabled' : ''}></td>
      <td><input class="tbl-input wide inc" value="${esc(a.incompletos)}" ${bloqueado(a) ? 'disabled' : ''}></td>
      <td>${badge(a.estado === 'cerrada' ? 'Cerrada' : a.estado === 'borrador' ? 'Borrador' : 'Sin cargar', a.estado === 'cerrada' ? 'ok' : a.estado === 'borrador' ? 'blue' : 'grey')}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="actions-bar">${corrige && (hayCerradas || cerradoPer) ? '<input id="motivo" class="tbl-input wide" style="max-width:340px" placeholder="Motivo de la corrección (obligatorio si modificás una nota cerrada)">' : ''}
      <button class="btn btn-ghost" id="borrador">Guardar borrador</button><button class="btn btn-blue" id="cerrar">Confirmar y cerrar ✓</button></div></div>`;
  // el promedio sugerido es solo una ayuda: el docente decide la nota final
  $$('tr[data-id]').forEach((tr, i) => { const inp = $('.nota', tr); if (!inp.value && data.alumnos[i].sugerido && !inp.disabled) inp.placeholder = data.alumnos[i].sugerido; });
  $('#borrador').onclick = () => guardar(false); $('#cerrar').onclick = () => { if (confirm('Al cerrar, el docente ya no podrá modificar estas notas. ¿Continuar?')) guardar(true); };
  if (corrige) historial();
});
const guardar = guard(async (cerrar) => {
  const items = $$('tr[data-id]').filter((tr) => !$('.nota', tr).disabled).map((tr) => ({ alumno_id: tr.dataset.id, valor: $('.nota', tr).value, incompletos: $('.inc', tr).value }));
  const r = await api('notas', { method: 'PUT', body: { asignacion_id: $('#asg').value, periodo_id: $('#per').value, items, cerrar, motivo: $('#motivo')?.value } });
  toast(cerrar ? 'Notas cerradas' : `Borrador guardado (${r.guardadas})`); load();
});
const historial = guard(async () => {
  const h = await api('notas/historial');
  $('#historial').innerHTML = h.length ? `<div class="section-header" style="margin-top:28px"><div class="section-title">Correcciones recientes</div></div><div class="card"><div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Alumno</th><th>Materia</th><th>Antes → Ahora</th><th>Motivo</th><th>Por</th></tr></thead><tbody>
    ${h.map((x) => `<tr><td>${esc(x.fecha)}</td><td>${esc(x.alumno)}</td><td>${esc(x.materia)}</td><td>${x.valor_anterior ?? '–'} → ${x.valor_nuevo ?? '–'}</td><td>${esc(x.motivo)}</td><td>${esc(x.usuario)}</td></tr>`).join('')}</tbody></table></div></div>` : '';
});
$('#asg').onchange = load; $('#per').onchange = load;
