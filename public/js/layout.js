// Arma el esqueleto (sidebar + topbar) alrededor de <main id="contenido"> y valida la sesión.
import { $, api, escapar, modal, avisar, NOMBRE_ROL } from './api.js';

const MENU = [
  ['Principal', [['dashboard.html', '⊞', 'Panel General']]],
  ['Administración', [['usuarios.html', '👥', 'Usuarios'], ['academico.html', '🏫', 'Cursos y materias']]],
  ['Académico', [['carga-notas.html', '✏️', 'Carga de notas'], ['asistencias.html', '🗓️', 'Asistencias'], ['consulta.html', '📊', 'Calificaciones / Boletín']]],
  ['Comunicación', [['comunicados.html', '📢', 'Comunicados'], ['boletines.html', '📧', 'Envío de boletines']]],
];

export async function iniciar() {
  document.body.classList.add('cargando');
  const yo = await api('auth/me');
  const pagina = location.pathname.split('/').pop() || 'dashboard.html';
  const titulo = document.title.split('–')[0].trim();
  const contenido = $('#contenido');
  const menu = MENU.map(([seccion, items]) => {
    const visibles = items.filter(([href]) => yo.paginas.includes(href)); if (!visibles.length) return '';
    return `<div class="barra-lateral-seccion">${seccion}</div>` + visibles.map(([href, icono, rotulo]) =>
      `<a class="item-menu ${href === pagina ? 'activo' : ''}" href="${href}"><span class="icono-menu">${icono}</span> ${yo.rol === 'alumno' && href === 'consulta.html' ? 'Mis calificaciones' : rotulo}</a>`).join('');
  }).join('');
  const aplicacion = document.createElement('div'); aplicacion.id = 'app'; aplicacion.className = 'visible';
  aplicacion.innerHTML = `<div class="barra-lateral-fondo" id="barra-lateral-fondo"></div>
    <aside class="barra-lateral" id="barra-lateral"><div class="barra-lateral-logo">la35<span>Notas</span></div>${menu}
      <div class="barra-lateral-inferior"><div class="usuario-chip" id="usuario-chip" style="cursor:pointer" title="Cambiar contraseña"><div class="usuario-avatar">${escapar(yo.nombre[0])}</div>
      <div class="usuario-info"><div class="usuario-nombre">${escapar(yo.apellido)} ${escapar(yo.nombre)}</div><div class="usuario-rol">${NOMBRE_ROL[yo.rol]}</div></div></div></div></aside>
    <div class="principal"><div class="barra-superior"><div style="display:flex;align-items:center;gap:12px"><div class="hamburguesa" id="hamburguesa"><span></span><span></span><span></span></div>
      <div class="barra-superior-titulo">${escapar(titulo)}</div></div><div class="barra-superior-derecha"><button class="boton boton-fantasma boton-chico" id="salir">Salir</button></div></div>
      <div class="contenido" id="contenido-envoltorio"></div></div>`;
  document.body.appendChild(aplicacion); $('#contenido-envoltorio').appendChild(contenido);
  const lateral = $('#barra-lateral'), fondo = $('#barra-lateral-fondo');
  $('#hamburguesa').onclick = () => { lateral.classList.add('abierto'); fondo.classList.add('abierto'); };
  fondo.onclick = () => { lateral.classList.remove('abierto'); fondo.classList.remove('abierto'); };
  $('#salir').onclick = async () => { await api('auth/logout', { method: 'POST', cuerpo: {} }); location.href = 'login.html'; };
  $('#usuario-chip').onclick = () => cambiarClave(yo, false);
  document.body.classList.remove('cargando');
  if (yo.debe_cambiar_clave) cambiarClave(yo, true);
  return yo;
}

function cambiarClave(yo, obligatorio) {
  const m = modal(obligatorio ? 'Definí tu contraseña nueva' : 'Cambiar contraseña',
    `${obligatorio ? '<div class="anuncio alerta">Estás usando la contraseña inicial. Cambiala para continuar.</div>' : ''}
     <div class="campo"><label>Contraseña actual</label><input type="password" id="clave-actual"></div>
     <div class="campo"><label>Contraseña nueva (mín. 8)</label><input type="password" id="clave-nueva"></div>`,
    { alEnviar: async (el) => { await api('auth/clave', { method: 'POST', cuerpo: { actual: $('#clave-actual', el).value, nueva: $('#clave-nueva', el).value } }); avisar('Contraseña actualizada'); } });
  if (obligatorio) m.el.querySelector('[data-cerrar]').style.display = 'none';
}
