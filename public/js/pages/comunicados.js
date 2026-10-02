import { $, api, esc, modal, toast, guard, options, badge } from '../api.js';
import { init } from '../layout.js';
const me = await init();
const puedeCrear = me.permisos.includes('comunicados.crear');
const cfg = puedeCrear ? await api('academico/config') : null;
if (puedeCrear) $('#nuevo').style.display = '';
const DEST = { ambos: 'Padres y alumnos', tutores: 'Solo padres/tutores', alumnos: 'Solo alumnos' };

const load = guard(async () => {
  const l = await api('comunicados');
  $('#lista').innerHTML = l.map((c) => `<div class="com-item"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><b>${esc(c.titulo)}</b>
    <span>${badge(c.curso || 'Todos los cursos', 'grey')} ${c.estado === 'enviado' ? badge('Enviado', 'ok') : badge('Borrador', 'warn')}</span></div>
    <div class="meta">${esc(c.autor)} · ${esc(c.enviado || c.creado)} · ${DEST[c.destino]}</div><p>${esc(c.cuerpo)}</p>
    ${puedeCrear && c.estado === 'borrador' ? `<button class="btn btn-blue btn-sm" data-send="${c.id}">Enviar por email</button> <button class="btn btn-ghost btn-sm" data-del="${c.id}">Eliminar</button>` : ''}</div>`).join('') || '<div class="empty">No hay comunicados</div>';
});
$('#lista').onclick = guard(async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.send && confirm('Se enviará por email a todos los destinatarios. ¿Confirmás?')) {
    const r = await api(`comunicados/${b.dataset.send}/enviar`, { method: 'POST', body: {} });
    toast(`${r.destinatarios} destinatarios · ${r.smtp ? r.enviados + ' enviados' : 'SMTP sin configurar: quedaron simulados'}${r.errores ? ' · ' + r.errores + ' con error' : ''}`); load();
  }
  if (b.dataset.del) { await api(`comunicados/${b.dataset.del}`, { method: 'DELETE' }); load(); }
});
$('#nuevo').onclick = () => modal('Nuevo comunicado', `
  <div class="field"><label>Título</label><input id="c-t"></div>
  <div class="field"><label>Curso</label><select id="c-c">${me.rol === 'admin' ? '<option value="">Todos los cursos</option>' : ''}${options(cfg.cursos, 'id', (c) => c.nombre)}</select></div>
  <div class="field"><label>Destinatarios</label><select id="c-d">${Object.entries(DEST).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
  <div class="field"><label>Mensaje</label><textarea id="c-m"></textarea></div>`, { wide: true, submitText: 'Guardar borrador',
  onSubmit: async (el) => { await api('comunicados', { method: 'POST', body: { titulo: $('#c-t', el).value, curso_id: $('#c-c', el).value, destino: $('#c-d', el).value, cuerpo: $('#c-m', el).value } }); toast('Borrador guardado'); load(); } });
load();
