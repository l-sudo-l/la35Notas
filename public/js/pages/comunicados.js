import { $, api, escapar, modal, avisar, protegido, opciones, etiqueta } from '../api.js';
import { iniciar } from '../layout.js';
const yo = await iniciar();
const puedeCrear = yo.permisos.includes('comunicados.crear');
const config = puedeCrear ? await api('academico/config') : null;
if (puedeCrear) $('#nuevo').style.display = '';
const DESTINOS = { ambos: 'Padres y alumnos', tutores: 'Solo padres/tutores', alumnos: 'Solo alumnos' };

const cargar = protegido(async () => {
  const l = await api('comunicados');
  $('#lista').innerHTML = l.map((c) => `<div class="item-comunicado"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><b>${escapar(c.titulo)}</b>
    <span>${etiqueta(c.curso || 'Todos los cursos', 'gris')} ${c.estado === 'enviado' ? etiqueta('Enviado', 'ok') : etiqueta('Borrador', 'alerta')}</span></div>
    <div class="meta">${escapar(c.autor)} · ${escapar(c.enviado || c.creado)} · ${DESTINOS[c.destino]}</div><p>${escapar(c.cuerpo)}</p>
    ${puedeCrear && c.estado === 'borrador' ? `<button class="boton boton-azul boton-chico" data-enviar="${c.id}">Enviar por email</button> <button class="boton boton-fantasma boton-chico" data-borrar="${c.id}">Eliminar</button>` : ''}</div>`).join('') || '<div class="vacio">No hay comunicados</div>';
});
$('#lista').onclick = protegido(async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.enviar && confirm('Se enviará por email a todos los destinatarios. ¿Confirmás?')) {
    const r = await api(`comunicados/${b.dataset.enviar}/enviar`, { method: 'POST', cuerpo: {} });
    avisar(`${r.destinatarios} destinatarios · ${r.smtp ? r.enviados + ' enviados' : 'SMTP sin configurar: quedaron simulados'}${r.errores ? ' · ' + r.errores + ' con error' : ''}`); cargar();
  }
  if (b.dataset.borrar) { await api(`comunicados/${b.dataset.borrar}`, { method: 'DELETE' }); cargar(); }
});
$('#nuevo').onclick = () => modal('Nuevo comunicado', `
  <div class="campo"><label>Título</label><input id="c-t"></div>
  <div class="campo"><label>Curso</label><select id="c-c">${yo.rol === 'admin' ? '<option value="">Todos los cursos</option>' : ''}${opciones(config.cursos, 'id', (c) => c.nombre)}</select></div>
  <div class="campo"><label>Destinatarios</label><select id="c-d">${Object.entries(DESTINOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
  <div class="campo"><label>Mensaje</label><textarea id="c-m"></textarea></div>`, { ancho: true, textoEnviar: 'Guardar borrador',
  alEnviar: async (el) => { await api('comunicados', { method: 'POST', cuerpo: { titulo: $('#c-t', el).value, curso_id: $('#c-c', el).value, destino: $('#c-d', el).value, cuerpo: $('#c-m', el).value } }); avisar('Borrador guardado'); cargar(); } });
cargar();
