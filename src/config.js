const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
// Cargador mínimo de .env (sin dependencias)
try {
  for (const line of fs.readFileSync(path.join(raiz, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch {}
const e = process.env;
module.exports = {
  raiz,
  port: +e.PUERTO || 3000,
  rutaBase: path.resolve(raiz, e.RUTA_BASE || './data/la35notas.db'),
  horasSesion: +e.HORAS_SESION || 8,
  colegio: e.NOMBRE_COLEGIO || 'la35Notas',
  smtp: { host: e.SMTP_HOST, port: +e.SMTP_PORT || 465, user: e.SMTP_USER, pass: e.SMTP_PASS, from: e.REMITENTE || e.SMTP_USER },
};
