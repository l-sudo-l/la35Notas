import { $, api, esc, toast, guard, options, badge } from '../api.js';
import { init } from '../layout.js';
await init();
const root = $('#acad');
const post = (p, body) => api(p, { method: 'POST', body });

const render = guard(async () => {
  const c = await api('academico/config');
  const activo = c.ciclos.find((x) => x.activo);
  root.innerHTML = `
  <div class="section-header"><div class="section-title">Ciclos lectivos y períodos</div></div>
  <div class="card card-pad"><div class="form-row"><div class="field"><label>Nuevo ciclo (ej. 2026)</label><input id="ciclo-n"></div><button class="btn btn-blue" id="ciclo-add">Crear ciclo</button></div></div>
  ${c.ciclos.map((ci) => `<div class="card" style="margin-bottom:16px"><div class="section-header" style="padding:12px 16px;margin:0"><b>Ciclo ${esc(ci.nombre)}</b> ${ci.activo ? badge('Activo', 'ok') : `<button class="btn btn-ghost btn-sm" data-act="${ci.id}">Activar</button>`}</div>
    <div class="table-wrap"><table><tbody>${c.periodos.filter((p) => p.ciclo_id === ci.id).map((p) => `<tr><td>${esc(p.nombre)}</td><td>${badge(p.estado, p.estado === 'abierto' ? 'ok' : 'grey')}</td>
      <td><button class="btn btn-ghost btn-sm" data-per="${p.id}" data-est="${p.estado === 'abierto' ? 'cerrado' : 'abierto'}">${p.estado === 'abierto' ? 'Cerrar período' : 'Reabrir'}</button></td></tr>`).join('')}</tbody></table></div></div>`).join('')}
  <div class="stats-grid" style="margin-top:28px">
    <div class="card card-pad"><div class="section-title">Cursos</div><p class="muted" style="margin:8px 0">${c.cursos.map((x) => esc(x.nombre)).join(' · ') || 'Sin cursos'}</p><div class="form-row"><div class="field"><input id="curso-n" placeholder="Ej: 5° 2°"></div><button class="btn btn-blue btn-sm" id="curso-add">Agregar</button></div></div>
    <div class="card card-pad"><div class="section-title">Materias</div><p class="muted" style="margin:8px 0">${c.materias.map((x) => esc(x.nombre)).join(' · ') || 'Sin materias'}</p><div class="form-row"><div class="field"><input id="mat-n" placeholder="Ej: Matemática"></div><button class="btn btn-blue btn-sm" id="mat-add">Agregar</button></div></div></div>
  <div class="section-header" style="margin-top:28px"><div class="section-title">Asignación de profesores</div></div>
  <div class="card card-pad"><div class="form-row"><div class="field"><label>Curso</label><select id="a-c">${options(c.cursos, 'id', (x) => x.nombre, '…')}</select></div><div class="field"><label>Materia</label><select id="a-m">${options(c.materias, 'id', (x) => x.nombre, '…')}</select></div>
    <div class="field"><label>Profesor</label><select id="a-p">${options(c.profesores, 'id', (x) => `${x.apellido} ${x.nombre}`, '…')}</select></div><button class="btn btn-blue" id="a-add">Asignar</button></div></div>
  <div class="card"><div class="table-wrap"><table><thead><tr><th>Curso</th><th>Materia</th><th>Profesor</th><th></th></tr></thead><tbody>${c.asignaciones.map((a) => `<tr><td>${esc(a.curso)}</td><td>${esc(a.materia)}</td><td>${esc(a.profesor)}</td><td><button class="btn btn-ghost btn-sm" data-delasg="${a.id}">Quitar</button></td></tr>`).join('')}</tbody></table></div></div>`;
  $('#ciclo-add').onclick = guard(async () => { await post('academico/ciclos', { nombre: $('#ciclo-n').value, activo: !activo }); render(); });
  $('#curso-add').onclick = guard(async () => { await post('academico/cursos', { nombre: $('#curso-n').value }); render(); });
  $('#mat-add').onclick = guard(async () => { await post('academico/materias', { nombre: $('#mat-n').value }); render(); });
  $('#a-add').onclick = guard(async () => { await post('academico/asignaciones', { curso_id: $('#a-c').value, materia_id: $('#a-m').value, profesor_id: $('#a-p').value }); toast('Asignación creada'); render(); });
});
root.onclick = guard(async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.act) { await api(`academico/ciclos/${b.dataset.act}/activar`, { method: 'PUT', body: {} }); render(); }
  if (b.dataset.delasg) { await api(`academico/asignaciones/${b.dataset.delasg}`, { method: 'DELETE' }); render(); }
  if (b.dataset.per) {
    let r = await api(`academico/periodos/${b.dataset.per}/estado`, { method: 'PUT', body: { estado: b.dataset.est } });
    if (!r.ok && confirm(r.error)) r = await api(`academico/periodos/${b.dataset.per}/estado`, { method: 'PUT', body: { estado: b.dataset.est, forzar: true } });
    if (r.ok) { toast('Período ' + b.dataset.est); render(); }
  }
});
render();
