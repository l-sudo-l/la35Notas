// Utilidades compartidas: fetch a la API, escape HTML, toasts y modales.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Rutas relativas ("api/...") => funciona en cualquier host/subcarpeta
export async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch('api/' + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && !location.pathname.endsWith('login.html')) { location.href = 'login.html'; throw new Error('Sesión vencida'); }
  if (!r.ok) throw new Error(data.error || 'Error ' + r.status);
  return data;
}

export function toast(msg, type = 'ok') {
  let c = $('#toast-container'); if (!c) { c = document.createElement('div'); c.id = 'toast-container'; c.className = 'toast-container'; document.body.appendChild(c); }
  const t = document.createElement('div'); t.className = `toast show ${type}-toast`; t.textContent = msg; c.appendChild(t); setTimeout(() => t.remove(), 3500);
}
export const guard = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message, 'warn'); } };

// Modal genérico. Devuelve { el, close }. onSubmit(el) puede devolver false para no cerrar.
export function modal(title, bodyHtml, { onSubmit, submitText = 'Guardar ✓', wide = false } = {}) {
  const ov = document.createElement('div'); ov.className = 'modal-overlay';
  ov.innerHTML = `<div class="modal ${wide ? 'modal-wide' : ''}"><div class="modal-title">${esc(title)}</div><div class="m-body">${bodyHtml}</div>
    <div class="modal-footer"><button class="btn btn-ghost" data-x>${onSubmit ? 'Cancelar' : 'Cerrar'}</button>${onSubmit ? `<button class="btn btn-blue" data-ok>${submitText}</button>` : ''}</div></div>`;
  document.body.appendChild(ov); requestAnimationFrame(() => ov.classList.add('open'));
  const close = () => { ov.classList.remove('open'); setTimeout(() => ov.remove(), 200); };
  ov.addEventListener('click', async (e) => {
    if (e.target === ov || e.target.hasAttribute('data-x')) close();
    if (e.target.hasAttribute('data-ok')) { try { if ((await onSubmit(ov)) !== false) close(); } catch (er) { toast(er.message, 'warn'); } }
  });
  return { el: ov, close };
}
export const options = (list, valueKey, labelFn, placeholder) => (placeholder ? `<option value="">${esc(placeholder)}</option>` : '') + list.map((x) => `<option value="${esc(x[valueKey])}">${esc(labelFn(x))}</option>`).join('');
export const badge = (txt, kind = 'blue') => `<span class="badge badge-${kind}">${esc(txt)}</span>`;
export const ROL = { admin: 'Administrador', profesor: 'Profesor', preceptor: 'Preceptor', alumno: 'Alumno' };
