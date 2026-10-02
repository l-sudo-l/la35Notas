import { $, api, esc, modal, toast, guard, options, badge, ROL } from '../api.js';
import { init } from '../layout.js';
await init();
const cfg = await api('academico/config');
let lista = [];
const cursoNombre = (id) => cfg.cursos.find((c) => c.id === id)?.nombre || '';

const load = guard(async () => {
  lista = await api(`usuarios?rol=${$('#rol').value}&q=${encodeURIComponent($('#q').value)}`);
  $('#tbody').innerHTML = lista.map((u) => `<tr><td>${esc(u.dni)}</td><td>${esc(u.apellido)}, ${esc(u.nombre)}</td><td>${badge(ROL[u.rol])}</td>
    <td>${u.rol === 'alumno' ? esc(u.curso || '') + ` <span class="muted">${(u.tutores || []).length} tutor(es)</span>` : u.rol === 'preceptor' ? esc((u.cursos || []).map(cursoNombre).join(', ')) : ''}</td>
    <td>${badge(u.activo ? 'Activo' : 'Baja', u.activo ? 'ok' : 'grey')}</td>
    <td><button class="btn btn-ghost btn-sm" data-edit="${u.id}">✏️</button> ${u.activo ? `<button class="btn btn-ghost btn-sm" data-del="${u.id}">Baja</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">Sin resultados</td></tr>';
});

function form(u = {}) {
  const nuevo = !u.id, rol = u.rol || 'profesor';
  const t = u.tutores || [];
  const m = modal(nuevo ? 'Nuevo usuario' : 'Editar usuario', `
    <div class="field"><label>Rol</label><select id="f-rol" ${nuevo ? '' : 'disabled'}>${Object.entries(ROL).map(([k, v]) => `<option value="${k}" ${k === rol ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div class="field"><label>DNI</label><input id="f-dni" value="${esc(u.dni)}"></div>
    <div class="form-row"><div class="field"><label>Apellido</label><input id="f-ape" value="${esc(u.apellido)}"></div><div class="field"><label>Nombre</label><input id="f-nom" value="${esc(u.nombre)}"></div></div>
    <div class="field" style="margin-top:16px"><label>Email</label><input id="f-mail" type="email" value="${esc(u.email)}"></div>
    <div class="field"><label>${nuevo ? 'Contraseña inicial (vacío = el DNI)' : 'Nueva contraseña (vacío = no cambiar)'}</label><input id="f-pass" type="text"></div>
    <div id="f-alumno"><div class="field"><label>Curso</label><select id="f-curso">${options(cfg.cursos, 'id', (c) => c.nombre, 'Seleccionar…')}</select></div>
      <label class="muted">Tutores / responsables (reciben boletines y comunicados)</label>
      ${[0, 1].map((i) => `<div class="form-row" style="margin:6px 0"><div class="field"><input placeholder="Nombre" class="t-nom" value="${esc(t[i]?.nombre)}"></div><div class="field"><input placeholder="email@..." class="t-mail" value="${esc(t[i]?.email)}"></div></div>`).join('')}</div>
    <div id="f-prec" class="field"><label>Cursos a cargo</label><div class="check-list">${cfg.cursos.map((c) => `<label><input type="checkbox" class="pc" value="${c.id}" ${(u.cursos || []).includes(c.id) ? 'checked' : ''}> ${esc(c.nombre)}</label>`).join('')}</div></div>`,
    { wide: true, onSubmit: async (el) => {
      const r = $('#f-rol', el).value;
      const body = { rol: r, dni: $('#f-dni', el).value, apellido: $('#f-ape', el).value, nombre: $('#f-nom', el).value, email: $('#f-mail', el).value, password: $('#f-pass', el).value || undefined, activo: u.activo !== 0,
        curso_id: $('#f-curso', el).value, tutores: [...el.querySelectorAll('.t-mail')].map((m, i) => ({ nombre: el.querySelectorAll('.t-nom')[i].value, email: m.value })),
        cursos: [...el.querySelectorAll('.pc:checked')].map((c) => c.value) };
      await api(nuevo ? 'usuarios' : `usuarios/${u.id}`, { method: nuevo ? 'POST' : 'PUT', body }); toast('Usuario guardado'); load();
    } });
  const sync = () => { const r = $('#f-rol', m.el).value; $('#f-alumno', m.el).style.display = r === 'alumno' ? '' : 'none'; $('#f-prec', m.el).style.display = r === 'preceptor' ? '' : 'none'; };
  $('#f-curso', m.el).value = u.curso_id || ''; $('#f-rol', m.el).onchange = sync; sync();
}
$('#nuevo').onclick = () => form();
$('#rol').onchange = load; $('#q').oninput = load;
$('#tbody').onclick = guard(async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.edit) form(lista.find((u) => u.id == b.dataset.edit));
  if (b.dataset.del && confirm('¿Dar de baja a este usuario? Se conserva su historial.')) { await api(`usuarios/${b.dataset.del}`, { method: 'DELETE' }); toast('Usuario dado de baja'); load(); }
});
load();
