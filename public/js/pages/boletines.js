import { $, $$, api, esc, modal, toast, guard, options, badge } from '../api.js';
import { init } from '../layout.js';
await init();
const cfg = await api('academico/config');
const per = cfg.periodos.filter((p) => cfg.ciclos.find((c) => c.id === p.ciclo_id)?.activo);
$('#curso').innerHTML = options(cfg.cursos, 'id', (c) => c.nombre, 'Seleccionar…');
$('#per').innerHTML = options(per, 'id', (p) => p.nombre);
const K = { sin_generar: ['Sin generar', 'grey'], borrador: ['Borrador', 'blue'], revisado: ['Revisado', 'warn'], enviado: ['Enviado', 'ok'], error: ['Error', 'warn'] };
const post = (p, b) => api(p, { method: 'POST', body: b });

const load = guard(async () => {
  loadOutbox();
  if (!$('#curso').value) { $('#tabla').innerHTML = '<div class="empty">Elegí un curso</div>'; return; }
  const d = await api(`boletines?curso_id=${$('#curso').value}&periodo_id=${$('#per').value}`);
  $('#tabla').innerHTML = `<div class="card"><div class="table-wrap"><table><thead><tr><th>Alumno</th><th>Notas cerradas</th><th>Tutores</th><th>Estado</th><th></th></tr></thead><tbody>
    ${d.alumnos.map((a) => { const [t, k] = K[a.estado]; return `<tr><td>${esc(a.apellido)}, ${esc(a.nombre)}</td><td>${a.cerradas}/${a.materias} ${a.cerradas < a.materias ? badge('incompleto', 'warn') : ''}</td>
      <td>${a.tutores || badge('sin email', 'warn')}</td><td>${badge(t, k)}</td><td>${a.id ? `<button class="btn btn-ghost btn-sm" data-ver="${a.id}">👁 Ver</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>
    <div class="actions-bar"><button class="btn btn-ghost" id="gen">1 · Generar borradores</button><button class="btn btn-ghost" id="rev">2 · Marcar como revisados</button><button class="btn btn-blue" id="env">3 · Enviar a tutores 📧</button></div></div>`;
  const ids = d.alumnos.filter((a) => a.id && a.estado === 'borrador').map((a) => a.id);
  const body = () => ({ curso_id: $('#curso').value, periodo_id: $('#per').value });
  $('#gen').onclick = guard(async () => { const r = await post('boletines/generar', body()); toast(`${r.nuevos} borradores generados`); load(); });
  $('#rev').onclick = guard(async () => { if (!ids.length) throw new Error('No hay borradores para revisar'); if (!confirm('¿Confirmás que revisaste los boletines?')) return; await post('boletines/revisar', { ids }); toast('Boletines revisados'); load(); });
  $('#env').onclick = guard(async () => {
    if (!confirm('Se enviará el boletín por email a los tutores de todos los alumnos revisados. ¿Continuar?')) return;
    const r = await post('boletines/enviar', body());
    toast(`${r.mails} mails · ${r.smtp ? r.enviados + ' enviados' : 'SMTP sin configurar: simulados'}${r.errores ? ' · ' + r.errores + ' errores' : ''}${r.sin_tutor.length ? ' · Sin tutor: ' + r.sin_tutor.join(', ') : ''}`, r.errores || r.sin_tutor.length ? 'warn' : 'ok'); load();
  });
});
const loadOutbox = guard(async () => {
  const o = await api('outbox');
  $('#outbox').innerHTML = o.map((m) => `<tr><td>${esc(m.creado)}</td><td>${esc(m.destinatario)}</td><td>${esc(m.asunto)}</td><td>${badge(m.estado, m.estado === 'enviado' ? 'ok' : m.estado === 'error' ? 'warn' : 'grey')}${m.error ? `<div class="muted">${esc(m.error)}</div>` : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Sin envíos</td></tr>';
});
$('#tabla').onclick = guard(async (e) => { const b = e.target.closest('[data-ver]'); if (!b) return; const r = await api(`boletines/${b.dataset.ver}/vista`); modal('Vista previa del boletín', r.html, { wide: true }); });
$('#reintentar').onclick = guard(async () => { const r = await post('outbox/reintentar', {}); toast(`${r.enviados + r.simulados} procesados, ${r.errores} con error`); load(); });
$('#curso').onchange = load; $('#per').onchange = load;
loadOutbox();
