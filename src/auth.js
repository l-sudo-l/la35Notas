const crypto = require('crypto');
const hashPass = (pw) => { const salt = crypto.randomBytes(16).toString('hex'); return `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`; };
const checkPass = (pw, stored) => {
  const [salt, h] = String(stored).split(':');
  if (!salt || !h) return false;
  const a = Buffer.from(h, 'hex'), b = crypto.scryptSync(String(pw), salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
// Anti fuerza bruta simple en memoria: 5 intentos / 10 min por IP+DNI
const fails = new Map();
const key = (ip, dni) => `${ip}|${dni}`;
const locked = (ip, dni) => { const f = fails.get(key(ip, dni)); return f && f.n >= 5 && Date.now() - f.t < 600e3; };
const fail = (ip, dni) => { const k = key(ip, dni), f = fails.get(k); fails.set(k, { n: (f && Date.now() - f.t < 600e3 ? f.n : 0) + 1, t: Date.now() }); };
const ok = (ip, dni) => fails.delete(key(ip, dni));
module.exports = { hashPass, checkPass, locked, fail, ok };
