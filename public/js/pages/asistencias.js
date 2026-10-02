import { $, $$, api, esc, toast, guard, options } from '../api.js';
import { init } from '../layout.js';
await init();
const cfg = await api('academico/config');
$('#curso').innerHTML = options(cfg.cursos, 'id', (c) => c.nombre, 'Seleccionar…');
$('#fecha').value = new Date().toISOString().slice(0, 10);
const EST = { presente: 'Presente', ausente: 'Ausente', tarde: 'Tarde', justificada: 'Justificada' };

const load = guard(async () => {
  if (!$('#curso').value) return;
  const d = await api(`asistencias?curso_id=${$('#curso').value}&fecha=${$('#fecha').value}`);
  $('#tabla').innerHTML = `<div class="card">${d.editable ? '' : '<div class="notice" style="margin:12px">Modo consulta: la asistencia la registra preceptoría.</div>'}
    <div class="table-wrap"><table><thead><tr><th>Alumno</th><th>DNI</th><th>Estado</th></tr></thead><tbody>
    ${d.alumnos.map((a) => `<tr data-id="${a.alumno_id}"><td>${esc(a.apellido)}, ${esc(a.nombre)}</td><td>${esc(a.dni)}</td><td><select class="tbl-input wide est" ${d.editable ? '' : 'disabled'}>
      <option value="">– sin registrar –</option>${Object.entries(EST).map(([k, v]) => `<option value="${k}" ${a.estado === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div>
    ${d.editable ? '<div class="actions-bar"><button class="btn btn-ghost" id="todos">Marcar todos presentes</button><button class="btn btn-blue" id="guardar">Guardar asistencia ✓</button></div>' : ''}</div>`;
  if (!d.editable) return;
  $('#todos').onclick = () => $$('.est').forEach((s) => { if (!s.value) s.value = 'presente'; });
  $('#guardar').onclick = guard(async () => {
    await api('asistencias', { method: 'PUT', body: { curso_id: $('#curso').value, fecha: $('#fecha').value, items: $$('tr[data-id]').map((tr) => ({ alumno_id: tr.dataset.id, estado: $('.est', tr).value })) } });
    toast('Asistencia guardada');
  });
});
$('#curso').onchange = load; $('#fecha').onchange = load;
if (cfg.cursos.length === 1) { $('#curso').value = cfg.cursos[0].id; load(); }
