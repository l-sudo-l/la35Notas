import { api, $ } from '../api.js';
// Si ya hay sesión, ir directo al panel
api('auth/me').then(() => (location.href = 'dashboard.html')).catch(() => {});
$('#formulario-login').addEventListener('submit', async (e) => {
  e.preventDefault(); $('#error').textContent = '';
  try { await api('auth/login', { method: 'POST', cuerpo: { dni: $('#dni').value, clave: $('#clave').value } }); location.href = 'dashboard.html'; }
  catch (er) { $('#error').textContent = er.message; }
});
