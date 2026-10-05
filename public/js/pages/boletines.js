import { $, $$, api, escapar, modal, avisar, protegido, opciones, etiqueta } from '../api.js';
import { iniciar } from '../layout.js';
await iniciar();
const config = await api('academico/config');
const per = config.periodos.filter((p) => config.ciclos.find((c) => c.id === p.ciclo_id)?.activo);
$('#curso').innerHTML = opciones(config.cursos, 'id', (c) => c.nombre, 'Seleccionar…');
$('#per').innerHTML = opciones(per, 'id', (p) => p.nombre);
const ESTADOS_BOLETIN = { sin_generar: ['Sin generar', 'gris'], borrador: ['Borrador', 'azul'], revisado: ['Revisado', 'alerta'], enviado: ['Enviado', 'ok'], error: ['Error', 'alerta'] };
const publicar = (p, b) => api(p, { method: 'POST', cuerpo: b });

const cargar = protegido(async () => {
  cargarBandeja();
  if (!$('#curso').value) { $('#tabla').innerHTML = '<div class="vacio">Elegí un curso</div>'; return; }
  const d = await api(`boletines?curso_id=${$('#curso').value}&periodo_id=${$('#per').value}`);
  $('#tabla').innerHTML = `<div class="tarjeta"><div class="tabla-contenedor"><table><thead><tr><th>Alumno</th><th>Notas cerradas</th><th>Tutores</th><th>Estado</th><th></th></tr></thead><tbody>
    ${d.alumnos.map((a) => { const [t, k] = ESTADOS_BOLETIN[a.estado]; return `<tr><td>${escapar(a.apellido)}, ${escapar(a.nombre)}</td><td>${a.cerradas}/${a.materias} ${a.cerradas < a.materias ? etiqueta('incompleto', 'alerta') : ''}</td>
      <td>${a.tutores || etiqueta('sin email', 'alerta')}</td><td>${etiqueta(t, k)}</td><td>${a.id ? `<button class="boton boton-fantasma boton-chico" data-ver="${a.id}">👁 Ver</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div>
    <div class="barra-acciones"><button class="boton boton-fantasma" id="generar">1 · Generar borradores</button><button class="boton boton-fantasma" id="revisar">2 · Marcar como revisados</button><button class="boton boton-azul" id="enviar">3 · Enviar a tutores 📧</button></div></div>`;
  const ids = d.alumnos.filter((a) => a.id && a.estado === 'borrador').map((a) => a.id);
  const cuerpo = () => ({ curso_id: $('#curso').value, periodo_id: $('#per').value });
  $('#generar').onclick = protegido(async () => { const r = await publicar('boletines/generar', cuerpo()); avisar(`${r.nuevos} borradores generados`); cargar(); });
  $('#revisar').onclick = protegido(async () => { if (!ids.length) throw new Error('No hay borradores para revisar'); if (!confirm('¿Confirmás que revisaste los boletines?')) return; await publicar('boletines/revisar', { ids }); avisar('Boletines revisados'); cargar(); });
  $('#enviar').onclick = protegido(async () => {
    if (!confirm('Se enviará el boletín por email a los tutores de todos los alumnos revisados. ¿Continuar?')) return;
    const r = await publicar('boletines/enviar', cuerpo());
    avisar(`${r.correos} correos · ${r.smtp ? r.enviados + ' enviados' : 'SMTP sin configurar: simulados'}${r.errores ? ' · ' + r.errores + ' errores' : ''}${r.sin_tutor.length ? ' · Sin tutor: ' + r.sin_tutor.join(', ') : ''}`, r.errores || r.sin_tutor.length ? 'alerta' : 'ok'); cargar();
  });
});
const cargarBandeja = protegido(async () => {
  const o = await api('bandeja-salida');
  $('#bandeja').innerHTML = o.map((m) => `<tr><td>${escapar(m.creado)}</td><td>${escapar(m.destinatario)}</td><td>${escapar(m.asunto)}</td><td>${etiqueta(m.estado, m.estado === 'enviado' ? 'ok' : m.estado === 'error' ? 'alerta' : 'gris')}${m.error ? `<div class="apagado">${escapar(m.error)}</div>` : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="vacio">Sin envíos</td></tr>';
});
$('#tabla').onclick = protegido(async (e) => { const b = e.target.closest('[data-ver]'); if (!b) return; const r = await api(`boletines/${b.dataset.ver}/vista`); modal('Vista previa del boletín', r.html, { ancho: true }); });
$('#reintentar').onclick = protegido(async () => { const r = await publicar('bandeja-salida/reintentar', {}); avisar(`${r.enviados + r.simulados} procesados, ${r.errores} con error`); cargar(); });
$('#curso').onchange = cargar; $('#per').onchange = cargar;
cargarBandeja();
