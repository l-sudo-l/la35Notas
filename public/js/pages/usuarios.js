import { $, api, escapar, modal, avisar, protegido, opciones, etiqueta, NOMBRE_ROL } from '../api.js';
import { iniciar } from '../layout.js';
await iniciar();
const config = await api('academico/config');
let lista = [];
const cursoNombre = (id) => config.cursos.find((c) => c.id === id)?.nombre || '';

const cargar = protegido(async () => {
  lista = await api(`usuarios?rol=${$('#rol').value}&q=${encodeURIComponent($('#buscar').value)}`);
  $('#tbody').innerHTML = lista.map((u) => `<tr><td>${escapar(u.dni)}</td><td>${escapar(u.apellido)}, ${escapar(u.nombre)}</td><td>${etiqueta(NOMBRE_ROL[u.rol])}</td>
    <td>${u.rol === 'alumno' ? escapar(u.curso || '') + ` <span class="apagado">${(u.tutores || []).length} tutor(es)</span>` : u.rol === 'preceptor' ? escapar((u.cursos || []).map(cursoNombre).join(', ')) : ''}</td>
    <td>${etiqueta(u.activo ? 'Activo' : 'Baja', u.activo ? 'ok' : 'gris')}</td>
    <td><button class="boton boton-fantasma boton-chico" data-editar="${u.id}">✏️</button> ${u.activo ? `<button class="boton boton-fantasma boton-chico" data-borrar="${u.id}">Baja</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="vacio">Sin resultados</td></tr>';
});

function formulario(u = {}) {
  const nuevo = !u.id, rol = u.rol || 'profesor';
  const t = u.tutores || [];
  const m = modal(nuevo ? 'Nuevo usuario' : 'Editar usuario', `
    <div class="campo"><label>Rol</label><select id="f-rol" ${nuevo ? '' : 'disabled'}>${Object.entries(NOMBRE_ROL).map(([k, v]) => `<option value="${k}" ${k === rol ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div class="campo"><label>DNI</label><input id="f-dni" value="${escapar(u.dni)}"></div>
    <div class="fila-formulario"><div class="campo"><label>Apellido</label><input id="f-ape" value="${escapar(u.apellido)}"></div><div class="campo"><label>Nombre</label><input id="f-nom" value="${escapar(u.nombre)}"></div></div>
    <div class="campo" style="margin-top:16px"><label>Email</label><input id="f-mail" type="email" value="${escapar(u.email)}"></div>
    <div class="campo"><label>${nuevo ? 'Contraseña inicial (vacío = el DNI)' : 'Nueva contraseña (vacío = no cambiar)'}</label><input id="f-clave" type="text"></div>
    <div id="f-alumno"><div class="campo"><label>Curso</label><select id="f-curso">${opciones(config.cursos, 'id', (c) => c.nombre, 'Seleccionar…')}</select></div>
      <label class="apagado">Tutores / responsables (reciben boletines y comunicados)</label>
      ${[0, 1].map((i) => `<div class="fila-formulario" style="margin:6px 0"><div class="campo"><input placeholder="Nombre" class="t-nom" value="${escapar(t[i]?.nombre)}"></div><div class="campo"><input placeholder="email@..." class="t-mail" value="${escapar(t[i]?.email)}"></div></div>`).join('')}</div>
    <div id="f-prec" class="campo"><label>Cursos a cargo</label><div class="lista-checks">${config.cursos.map((c) => `<label><input type="checkbox" class="pc" value="${c.id}" ${(u.cursos || []).includes(c.id) ? 'checked' : ''}> ${escapar(c.nombre)}</label>`).join('')}</div></div>`,
    { ancho: true, alEnviar: async (el) => {
      const r = $('#f-rol', el).value;
      const cuerpo = { rol: r, dni: $('#f-dni', el).value, apellido: $('#f-ape', el).value, nombre: $('#f-nom', el).value, email: $('#f-mail', el).value, clave: $('#f-clave', el).value || undefined, activo: u.activo !== 0,
        curso_id: $('#f-curso', el).value, tutores: [...el.querySelectorAll('.t-mail')].map((m, i) => ({ nombre: el.querySelectorAll('.t-nom')[i].value, email: m.value })),
        cursos: [...el.querySelectorAll('.pc:checked')].map((c) => c.value) };
      await api(nuevo ? 'usuarios' : `usuarios/${u.id}`, { method: nuevo ? 'POST' : 'PUT', cuerpo }); avisar('Usuario guardado'); cargar();
    } });
  const sincronizar = () => { const r = $('#f-rol', m.el).value; $('#f-alumno', m.el).style.display = r === 'alumno' ? '' : 'none'; $('#f-prec', m.el).style.display = r === 'preceptor' ? '' : 'none'; };
  $('#f-curso', m.el).value = u.curso_id || ''; $('#f-rol', m.el).onchange = sincronizar; sincronizar();
}
$('#nuevo').onclick = () => formulario();
$('#rol').onchange = cargar; $('#buscar').oninput = cargar;
$('#tbody').onclick = protegido(async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.editar) formulario(lista.find((u) => u.id == b.dataset.editar));
  if (b.dataset.borrar && confirm('¿Dar de baja a este usuario? Se conserva su historial.')) { await api(`usuarios/${b.dataset.borrar}`, { method: 'DELETE' }); avisar('Usuario dado de baja'); cargar(); }
});
cargar();
