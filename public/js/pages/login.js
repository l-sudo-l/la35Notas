import { api, $ } from '../api.js';
// Si ya hay sesión, ir directo al panel
api('auth/me').then(() => (location.href = 'dashboard.html')).catch(() => {});
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault(); $('#err').textContent = '';
  try { await api('auth/login', { method: 'POST', body: { dni: $('#dni').value, password: $('#password').value } }); location.href = 'dashboard.html'; }
  catch (er) { $('#err').textContent = er.message; }
});
