import { $, $$, api, escapar, avisar, protegido, opciones } from '../api.js';
import { iniciar } from '../layout.js';
await iniciar();
const config = await api('academico/config');
$('#curso').innerHTML = opciones(config.cursos, 'id', (c) => c.nombre, 'Seleccionar…');
$('#fecha').value = new Date().toISOString().slice(0, 10);
const ESTADOS_ASISTENCIA = { presente: 'Presente', ausente: 'Ausente', tarde: 'Tarde', justificada: 'Justificada' };

const cargar = protegido(async () => {
  if (!$('#curso').value) return;
  const d = await api(`asistencias?curso_id=${$('#curso').value}&fecha=${$('#fecha').value}`);
  $('#tabla').innerHTML = `<div class="tarjeta">${d.editable ? '' : '<div class="anuncio" style="margin:12px">Modo consulta: la asistencia la registra preceptoría.</div>'}
    <div class="tabla-contenedor"><table><thead><tr><th>Alumno</th><th>DNI</th><th>Estado</th></tr></thead><tbody>
    ${d.alumnos.map((a) => `<tr data-id="${a.alumno_id}"><td>${escapar(a.apellido)}, ${escapar(a.nombre)}</td><td>${escapar(a.dni)}</td><td><select class="entrada-tabla ancho est" ${d.editable ? '' : 'disabled'}>
      <option value="">– sin registrar –</option>${Object.entries(ESTADOS_ASISTENCIA).map(([k, v]) => `<option value="${k}" ${a.estado === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div>
    ${d.editable ? '<div class="barra-acciones"><button class="boton boton-fantasma" id="todos">Marcar todos presentes</button><button class="boton boton-azul" id="guardar">Guardar asistencia ✓</button></div>' : ''}</div>`;
  if (!d.editable) return;
  $('#todos').onclick = () => $$('.est').forEach((s) => { if (!s.value) s.value = 'presente'; });
  $('#guardar').onclick = protegido(async () => {
    await api('asistencias', { method: 'PUT', cuerpo: { curso_id: $('#curso').value, fecha: $('#fecha').value, items: $$('tr[data-id]').map((tr) => ({ alumno_id: tr.dataset.id, estado: $('.est', tr).value })) } });
    avisar('Asistencia guardada');
  });
});
$('#curso').onchange = cargar; $('#fecha').onchange = cargar;
if (config.cursos.length === 1) { $('#curso').value = config.cursos[0].id; cargar(); }
