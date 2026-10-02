const conf = require('./config');
const { todos, uno, ejecutar } = require('./db');
let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch {}
const smtpListo = () => !!(nodemailer && conf.smtp.host && conf.smtp.user && conf.smtp.pass);
let transporte;

// Encola un mail en la bandeja de salida (bandeja_salida)
const encolar = (tipo, refId, to, asunto, html) =>
  ejecutar('INSERT INTO bandeja_salida(tipo,ref_id,destinatario,asunto,cuerpo_html) VALUES(?,?,?,?,?)', tipo, refId ?? null, to, asunto, html).lastInsertRowid;

// Envía pendientes (o con error). Sin SMTP configurado, queda como 'simulado'.
async function procesarBandeja(ids) {
  const filas = ids ? todos(`SELECT * FROM bandeja_salida WHERE id IN (${ids.map(() => '?').join(',') || 'NULL'})`, ...ids)
                    : todos("SELECT * FROM bandeja_salida WHERE estado IN ('pendiente','error')");
  const resumen = { enviados: 0, simulados: 0, errores: 0 };
  for (const m of filas) {
    try {
      if (!smtpListo()) { ejecutar("UPDATE bandeja_salida SET estado='simulado', enviado=datetime('now'), error=NULL WHERE id=?", m.id); resumen.simulados++; continue; }
      transporte ??= nodemailer.createTransport({ host: conf.smtp.host, port: conf.smtp.port, secure: conf.smtp.port === 465, auth: { user: conf.smtp.user, pass: conf.smtp.pass } });
      await transporte.sendMail({ from: conf.smtp.from, to: m.destinatario, subject: m.asunto, html: m.cuerpo_html });
      ejecutar("UPDATE bandeja_salida SET estado='enviado', enviado=datetime('now'), error=NULL WHERE id=?", m.id); resumen.enviados++;
    } catch (e) { ejecutar("UPDATE bandeja_salida SET estado='error', error=? WHERE id=?", String(e.message).slice(0, 300), m.id); resumen.errores++; }
  }
  return resumen;
}
module.exports = { encolar, procesarBandeja, smtpListo };
