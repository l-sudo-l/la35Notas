const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
// Cargador mínimo de .env (sin dependencias)
try {
  for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch {}
const e = process.env;
module.exports = {
  root,
  port: +e.PORT || 3000,
  dbPath: path.resolve(root, e.DB_PATH || './data/la35notas.db'),
  sessionHours: +e.SESSION_HOURS || 8,
  school: e.SCHOOL_NAME || 'la35Notas',
  smtp: { host: e.SMTP_HOST, port: +e.SMTP_PORT || 465, user: e.SMTP_USER, pass: e.SMTP_PASS, from: e.MAIL_FROM || e.SMTP_USER },
};
