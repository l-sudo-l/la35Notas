const crypto = require('crypto');
const hashearClave = (pw) => { const salt = crypto.randomBytes(16).toString('hex'); return `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`; };
const verificarClave = (pw, stored) => {
  const [salt, h] = String(stored).split(':');
  if (!salt || !h) return false;
  const a = Buffer.from(h, 'hex'), b = crypto.scryptSync(String(pw), salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
// Anti fuerza bruta simple en memoria: 5 intentos / 10 min por IP+DNI
const fallos = new Map();
const claveIntento = (ip, dni) => `${ip}|${dni}`;
const estaBloqueado = (ip, dni) => { const f = fallos.get(claveIntento(ip, dni)); return f && f.n >= 5 && Date.now() - f.t < 600e3; };
const registrarFallo = (ip, dni) => { const k = claveIntento(ip, dni), f = fallos.get(k); fallos.set(k, { n: (f && Date.now() - f.t < 600e3 ? f.n : 0) + 1, t: Date.now() }); };
const limpiarFallos = (ip, dni) => fallos.delete(claveIntento(ip, dni));
module.exports = { hashearClave, verificarClave, estaBloqueado, registrarFallo, limpiarFallos };
