const cfg = require('./config');
const { all, get, run } = require('./db');
let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch {}
const smtpListo = () => !!(nodemailer && cfg.smtp.host && cfg.smtp.user && cfg.smtp.pass);
let transport;

// Encola un mail en la bandeja de salida (outbox)
const encolar = (tipo, refId, to, asunto, html) =>
  run('INSERT INTO outbox(tipo,ref_id,destinatario,asunto,cuerpo_html) VALUES(?,?,?,?,?)', tipo, refId ?? null, to, asunto, html).lastInsertRowid;

// Envía pendientes (o con error). Sin SMTP configurado, queda como 'simulado'.
async function procesarOutbox(ids) {
  const filas = ids ? all(`SELECT * FROM outbox WHERE id IN (${ids.map(() => '?').join(',') || 'NULL'})`, ...ids)
                    : all("SELECT * FROM outbox WHERE estado IN ('pendiente','error')");
  const res = { enviados: 0, simulados: 0, errores: 0 };
  for (const m of filas) {
    try {
      if (!smtpListo()) { run("UPDATE outbox SET estado='simulado', enviado=datetime('now'), error=NULL WHERE id=?", m.id); res.simulados++; continue; }
      transport ??= nodemailer.createTransport({ host: cfg.smtp.host, port: cfg.smtp.port, secure: cfg.smtp.port === 465, auth: { user: cfg.smtp.user, pass: cfg.smtp.pass } });
      await transport.sendMail({ from: cfg.smtp.from, to: m.destinatario, subject: m.asunto, html: m.cuerpo_html });
      run("UPDATE outbox SET estado='enviado', enviado=datetime('now'), error=NULL WHERE id=?", m.id); res.enviados++;
    } catch (e) { run("UPDATE outbox SET estado='error', error=? WHERE id=?", String(e.message).slice(0, 300), m.id); res.errores++; }
  }
  return res;
}
module.exports = { encolar, procesarOutbox, smtpListo };
