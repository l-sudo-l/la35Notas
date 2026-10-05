// Utilidades compartidas: fetch a la API, escape HTML, toasts y modales.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const escapar = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Rutas relativas ("api/...") => funciona en cualquier host/subcarpeta
export async function api(path, { method = 'GET', cuerpo } = {}) {
  const r = await fetch('api/' + path, { method, headers: cuerpo ? { 'Content-Type': 'application/json' } : {}, body: cuerpo ? JSON.stringify(cuerpo) : undefined, credentials: 'same-origin' });
  const datos = await r.json().catch(() => ({}));
  if (r.status === 401 && !location.pathname.endsWith('login.html')) { location.href = 'login.html'; throw new Error('Sesión vencida'); }
  if (!r.ok) throw new Error(datos.error || 'Error ' + r.status);
  return datos;
}

export function avisar(mensaje, tipo = 'ok') {
  let c = $('#mensajes-flotantes'); if (!c) { c = document.createElement('div'); c.id = 'toast-container'; c.className = 'mensajes-flotantes'; document.body.appendChild(c); }
  const t = document.createElement('div'); t.className = `mensaje-flotante mostrar mensaje-${tipo}`; t.textContent = mensaje; c.appendChild(t); setTimeout(() => t.remove(), 3500);
}
export const protegido = (funcion) => async (...a) => { try { return await funcion(...a); } catch (e) { avisar(e.message, 'alerta'); } };

// Modal genérico. Devuelve { el, close }. onSubmit(el) puede devolver false para no cerrar.
export function modal(titulo, htmlCuerpo, { alEnviar, textoEnviar = 'Guardar ✓', ancho = false } = {}) {
  const fondo = document.createElement('div'); fondo.className = 'modal-fondo';
  fondo.innerHTML = `<div class="modal ${ancho ? 'modal-ancho' : ''}"><div class="modal-titulo">${escapar(titulo)}</div><div class="modal-cuerpo">${htmlCuerpo}</div>
    <div class="modal-pie"><button class="boton boton-fantasma" data-cerrar>${alEnviar ? 'Cancelar' : 'Cerrar'}</button>${alEnviar ? `<button class="boton boton-azul" data-aceptar>${textoEnviar}</button>` : ''}</div></div>`;
  document.body.appendChild(fondo); requestAnimationFrame(() => fondo.classList.add('abierto'));
  const cerrarModal = () => { fondo.classList.remove('abierto'); setTimeout(() => fondo.remove(), 200); };
  fondo.addEventListener('click', async (e) => {
    if (e.target === fondo || e.target.hasAttribute('data-cerrar')) cerrarModal();
    if (e.target.hasAttribute('data-aceptar')) { try { if ((await alEnviar(fondo)) !== false) cerrarModal(); } catch (er) { avisar(er.message, 'alerta'); } }
  });
  return { el: fondo, cerrarModal };
}
export const opciones = (elementos, claveValor, fnRotulo, textoInicial) => (textoInicial ? `<option value="">${escapar(textoInicial)}</option>` : '') + elementos.map((x) => `<option value="${escapar(x[claveValor])}">${escapar(fnRotulo(x))}</option>`).join('');
export const etiqueta = (texto, tipo = 'azul') => `<span class="etiqueta etiqueta-${tipo}">${escapar(texto)}</span>`;
export const NOMBRE_ROL = { admin: 'Administrador', profesor: 'Profesor', preceptor: 'Preceptor', alumno: 'Alumno' };
