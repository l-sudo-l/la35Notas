// Arma el esqueleto (sidebar + topbar) alrededor de <main id="content"> y valida la sesión.
import { $, api, esc, modal, toast, ROL } from './api.js';

const NAV = [
  ['Principal', [['dashboard.html', '⊞', 'Panel General']]],
  ['Administración', [['usuarios.html', '👥', 'Usuarios'], ['academico.html', '🏫', 'Cursos y materias']]],
  ['Académico', [['carga-notas.html', '✏️', 'Carga de notas'], ['asistencias.html', '🗓️', 'Asistencias'], ['consulta.html', '📊', 'Calificaciones / Boletín']]],
  ['Comunicación', [['comunicados.html', '📢', 'Comunicados'], ['boletines.html', '📧', 'Envío de boletines']]],
];

export async function init() {
  document.body.classList.add('loading');
  const me = await api('auth/me');
  const page = location.pathname.split('/').pop() || 'dashboard.html';
  const title = document.title.split('–')[0].trim();
  const content = $('#content');
  const nav = NAV.map(([sec, items]) => {
    const vis = items.filter(([href]) => me.paginas.includes(href)); if (!vis.length) return '';
    return `<div class="sidebar-section">${sec}</div>` + vis.map(([href, ic, label]) =>
      `<a class="nav-item ${href === page ? 'active' : ''}" href="${href}"><span class="nav-icon">${ic}</span> ${me.rol === 'alumno' && href === 'consulta.html' ? 'Mis calificaciones' : label}</a>`).join('');
  }).join('');
  const app = document.createElement('div'); app.id = 'app'; app.className = 'visible';
  app.innerHTML = `<div class="sidebar-overlay" id="sidebar-overlay"></div>
    <aside class="sidebar" id="sidebar"><div class="sidebar-logo">la35<span>Notas</span></div>${nav}
      <div class="sidebar-bottom"><div class="user-chip" id="user-chip" style="cursor:pointer" title="Cambiar contraseña"><div class="user-avatar">${esc(me.nombre[0])}</div>
      <div class="user-info"><div class="user-name">${esc(me.apellido)} ${esc(me.nombre)}</div><div class="user-role">${ROL[me.rol]}</div></div></div></div></aside>
    <div class="main"><div class="topbar"><div style="display:flex;align-items:center;gap:12px"><div class="hamburger" id="hamb"><span></span><span></span><span></span></div>
      <div class="topbar-title">${esc(title)}</div></div><div class="topbar-right"><button class="btn btn-ghost btn-sm" id="logout">Salir</button></div></div>
      <div class="content" id="content-wrap"></div></div>`;
  document.body.appendChild(app); $('#content-wrap').appendChild(content);
  const side = $('#sidebar'), ov = $('#sidebar-overlay');
  $('#hamb').onclick = () => { side.classList.add('open'); ov.classList.add('open'); };
  ov.onclick = () => { side.classList.remove('open'); ov.classList.remove('open'); };
  $('#logout').onclick = async () => { await api('auth/logout', { method: 'POST', body: {} }); location.href = 'login.html'; };
  $('#user-chip').onclick = () => cambiarPass(me, false);
  document.body.classList.remove('loading');
  if (me.debe_cambiar_pass) cambiarPass(me, true);
  return me;
}

function cambiarPass(me, obligatorio) {
  const m = modal(obligatorio ? 'Definí tu contraseña nueva' : 'Cambiar contraseña',
    `${obligatorio ? '<div class="notice warn">Estás usando la contraseña inicial. Cambiala para continuar.</div>' : ''}
     <div class="field"><label>Contraseña actual</label><input type="password" id="p0"></div>
     <div class="field"><label>Contraseña nueva (mín. 8)</label><input type="password" id="p1"></div>`,
    { onSubmit: async (el) => { await api('auth/password', { method: 'POST', body: { actual: $('#p0', el).value, nueva: $('#p1', el).value } }); toast('Contraseña actualizada'); } });
  if (obligatorio) m.el.querySelector('[data-x]').style.display = 'none';
}
