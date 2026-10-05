import { $, api, escapar, etiqueta } from '../api.js';
import { iniciar } from '../layout.js';
const yo = await iniciar();
const d = await api('dashboard');
const tarjeta = (clase, icono, rotulo, valor, subtitulo = '') => `<div class="tarjeta-estadistica ${clase}" data-icon="${icono}"><div class="estadistica-etiqueta">${rotulo}</div><div class="estadistica-valor">${valor ?? '–'}</div><div class="estadistica-sub">${subtitulo}</div></div>`;
const per = d.periodo ? d.periodo.nombre : 'Sin período abierto';
let html = '';
if (yo.rol === 'alumno') {
  html = tarjeta('azul', '🎓', 'Curso', escapar(d.curso || '–'), per) + tarjeta('ok', '📊', 'Promedio general', d.promedio ?? '–', 'Notas cerradas') +
    tarjeta('', '🗓️', 'Asistencia', d.asistencia.porcentaje_asistencia != null ? d.asistencia.porcentaje_asistencia + ' %' : '–', `${d.asistencia.inasistencias} inasistencias`);
} else {
  html = tarjeta('azul', '👥', 'Alumnos', d.alumnos, `${d.cursos} curso(s)`) + tarjeta('ok', '✅', 'Notas cerradas', d.notas_cerradas, per) +
    tarjeta('alerta', '⚠️', 'Notas pendientes', d.notas_pendientes, per) + tarjeta('alerta', '📉', 'Notas desaprobadas', d.desaprobadas, 'Menores a 6');
  if (d.correos_enviados != null) html += tarjeta('', '📧', 'Correos enviados', d.correos_enviados, d.correos_error ? `${d.correos_error} con error` : 'Sin errores');
}
$('#estadisticas').innerHTML = html;
const com = (d.comunicados || []).map((c) => `<div class="item-comunicado"><b>${escapar(c.titulo)}</b> ${c.estado === 'borrador' ? etiqueta('borrador', 'gris') : ''}<div class="meta">${escapar(c.enviado || '')}</div></div>`).join('') || '<div class="vacio">Sin comunicados</div>';
$('#panel-extra').innerHTML = `<div class="encabezado-seccion"><div class="titulo-seccion">Últimos comunicados</div></div><div class="tarjeta">${com}</div>` +
  (yo.rol === 'admin' ? `<div class="encabezado-seccion" style="margin-top:24px"><div class="titulo-seccion">Usuarios activos</div></div><div class="tarjeta tarjeta-relleno">${Object.entries(d.usuarios || {}).map(([r, n]) => etiqueta(`${r}: ${n}`)).join(' ')}</div>` : '');
