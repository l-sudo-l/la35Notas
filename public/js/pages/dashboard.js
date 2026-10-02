import { $, api, esc, badge } from '../api.js';
import { init } from '../layout.js';
const me = await init();
const d = await api('dashboard');
const card = (cls, ic, label, val, sub = '') => `<div class="stat-card ${cls}" data-icon="${ic}"><div class="stat-label">${label}</div><div class="stat-value">${val ?? '–'}</div><div class="stat-sub">${sub}</div></div>`;
const per = d.periodo ? d.periodo.nombre : 'Sin período abierto';
let html = '';
if (me.rol === 'alumno') {
  html = card('blue', '🎓', 'Curso', esc(d.curso || '–'), per) + card('ok', '📊', 'Promedio general', d.promedio ?? '–', 'Notas cerradas') +
    card('', '🗓️', 'Asistencia', d.asistencia.porcentaje_asistencia != null ? d.asistencia.porcentaje_asistencia + ' %' : '–', `${d.asistencia.inasistencias} inasistencias`);
} else {
  html = card('blue', '👥', 'Alumnos', d.alumnos, `${d.cursos} curso(s)`) + card('ok', '✅', 'Notas cerradas', d.notas_cerradas, per) +
    card('warn', '⚠️', 'Notas pendientes', d.notas_pendientes, per) + card('warn', '📉', 'Notas desaprobadas', d.desaprobadas, 'Menores a 6');
  if (d.mails_enviados != null) html += card('', '📧', 'Mails enviados', d.mails_enviados, d.mails_error ? `${d.mails_error} con error` : 'Sin errores');
}
$('#stats').innerHTML = html;
const com = (d.comunicados || []).map((c) => `<div class="com-item"><b>${esc(c.titulo)}</b> ${c.estado === 'borrador' ? badge('borrador', 'grey') : ''}<div class="meta">${esc(c.enviado || '')}</div></div>`).join('') || '<div class="empty">Sin comunicados</div>';
$('#dash-extra').innerHTML = `<div class="section-header"><div class="section-title">Últimos comunicados</div></div><div class="card">${com}</div>` +
  (me.rol === 'admin' ? `<div class="section-header" style="margin-top:24px"><div class="section-title">Usuarios activos</div></div><div class="card card-pad">${Object.entries(d.usuarios || {}).map(([r, n]) => badge(`${r}: ${n}`)).join(' ')}</div>` : '');
