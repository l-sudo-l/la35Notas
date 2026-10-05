import { $, $$, api, escapar, avisar, protegido, opciones, etiqueta } from '../api.js';
import { iniciar } from '../layout.js';
await iniciar();
const config = await api('academico/config');
const asignaciones = config.asignaciones;
const periodos = config.periodos.filter((p) => config.ciclos.find((c) => c.id === p.ciclo_id)?.activo);
$('#asg').innerHTML = opciones(asignaciones, 'id', (a) => `${a.curso} — ${a.materia}`, 'Seleccionar…');
$('#per').innerHTML = opciones(periodos, 'id', (p) => `${p.nombre}${p.estado === 'cerrado' ? ' (cerrado)' : ''}`);
$('#per').value = (periodos.find((p) => p.estado === 'abierto') || periodos[0] || {}).id || '';
if (!asignaciones.length) $('#tabla').innerHTML = '<div class="vacio">No tenés materias asignadas.</div>';
let datos;

const cargar = protegido(async () => {
  if (!$('#asg').value || !$('#per').value) return;
  datos = await api(`notas?asignacion_id=${$('#asg').value}&periodo_id=${$('#per').value}`);
  const cerradoPer = datos.periodo.estado === 'cerrado', corrige = datos.puede_corregir;
  $('#estado-periodo').innerHTML = etiqueta(cerradoPer ? 'Período cerrado' : 'Período abierto', cerradoPer ? 'gris' : 'ok');
  const hayCerradas = datos.alumnos.some((a) => a.estado === 'cerrada');
  const bloqueado = (a) => (cerradoPer || a.estado === 'cerrada') && !corrige;
  $('#tabla').innerHTML = `<div class="tarjeta">
    ${!corrige && (cerradoPer || hayCerradas) ? '<div class="anuncio alerta" style="margin:12px">Las notas cerradas no se pueden modificar. Para corregir una nota pedíselo a preceptoría.</div>' : ''}
    <div class="tabla-contenedor"><table><thead><tr><th>Alumno</th><th>DNI</th><th>Notas previas</th><th>Promedio sugerido</th><th>Nota (1–10)</th><th>Contenidos incompletos</th><th>Estado</th></tr></thead><tbody>
    ${datos.alumnos.map((a) => `<tr data-id="${a.alumno_id}"><td>${escapar(a.apellido)}, ${escapar(a.nombre)}</td><td>${escapar(a.dni)}</td>
      <td class="apagado">${a.previas.map((p) => `${escapar(p.nombre.slice(0, 3))}: ${p.valor}`).join(' · ') || '–'}</td><td>${a.sugerido ?? '–'}</td>
      <td><input class="entrada-tabla nota" type="number" min="1" max="10" step="0.25" value="${a.valor ?? ''}" ${bloqueado(a) ? 'disabled' : ''}></td>
      <td><input class="entrada-tabla ancho inc" value="${escapar(a.incompletos)}" ${bloqueado(a) ? 'disabled' : ''}></td>
      <td>${etiqueta(a.estado === 'cerrada' ? 'Cerrada' : a.estado === 'borrador' ? 'Borrador' : 'Sin cargar', a.estado === 'cerrada' ? 'ok' : a.estado === 'borrador' ? 'azul' : 'gris')}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="barra-acciones">${corrige && (hayCerradas || cerradoPer) ? '<input id="motivo" class="entrada-tabla ancho" style="max-width:340px" placeholder="Motivo de la corrección (obligatorio si modificás una nota cerrada)">' : ''}
      <button class="boton boton-fantasma" id="borrador">Guardar borrador</button><button class="boton boton-azul" id="cerrar">Confirmar y cerrar ✓</button></div></div>`;
  // el promedio sugerido es solo una ayuda: el docente decide la nota final
  $$('tr[data-id]').forEach((tr, i) => { const inp = $('.nota', tr); if (!inp.value && datos.alumnos[i].sugerido && !inp.disabled) inp.placeholder = datos.alumnos[i].sugerido; });
  $('#borrador').onclick = () => guardar(false); $('#cerrar').onclick = () => { if (confirm('Al cerrar, el docente ya no podrá modificar estas notas. ¿Continuar?')) guardar(true); };
  if (corrige) historial();
});
const guardar = protegido(async (cerrar) => {
  const items = $$('tr[data-id]').filter((tr) => !$('.nota', tr).disabled).map((tr) => ({ alumno_id: tr.dataset.id, valor: $('.nota', tr).value, incompletos: $('.inc', tr).value }));
  const r = await api('notas', { method: 'PUT', cuerpo: { asignacion_id: $('#asg').value, periodo_id: $('#per').value, items, cerrar, motivo: $('#motivo')?.value } });
  avisar(cerrar ? 'Notas cerradas' : `Borrador guardado (${r.guardadas})`); cargar();
});
const historial = protegido(async () => {
  const h = await api('notas/historial');
  $('#historial').innerHTML = h.length ? `<div class="encabezado-seccion" style="margin-top:28px"><div class="titulo-seccion">Correcciones recientes</div></div><div class="tarjeta"><div class="tabla-contenedor"><table><thead><tr><th>Fecha</th><th>Alumno</th><th>Materia</th><th>Antes → Ahora</th><th>Motivo</th><th>Por</th></tr></thead><tbody>
    ${h.map((x) => `<tr><td>${escapar(x.fecha)}</td><td>${escapar(x.alumno)}</td><td>${escapar(x.materia)}</td><td>${x.valor_anterior ?? '–'} → ${x.valor_nuevo ?? '–'}</td><td>${escapar(x.motivo)}</td><td>${escapar(x.usuario)}</td></tr>`).join('')}</tbody></table></div></div>` : '';
});
$('#asg').onchange = cargar; $('#per').onchange = cargar;
