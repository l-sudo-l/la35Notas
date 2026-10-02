const { ruta, pedidoInvalido, prohibido, crearSesion, destruirSesion } = require('../http');
const { uno, ejecutar, todos, auditar } = require('../db');
const { hashearClave, verificarClave, estaBloqueado, registrarFallo, limpiarFallos } = require('../auth');
const { PERMISOS, PAGINAS } = require('../rbac');

const infoUsuario = (u) => ({ id: u.id, dni: u.dni, nombre: u.nombre, apellido: u.apellido, rol: u.rol, curso_id: u.curso_id, debe_cambiar_clave: !!u.debe_cambiar_clave,
  permisos: PERMISOS[u.rol], paginas: Object.keys(PAGINAS).filter((p) => PAGINAS[p].includes(u.rol)) });

ruta('POST', '/api/auth/login', ({ pedido, respuesta, datos }) => {
  const dni = String(datos.dni || '').trim(), ip = pedido.socket.remoteAddress;
  if (!dni || !datos.clave) throw pedidoInvalido('Ingresá DNI y contraseña');
  if (estaBloqueado(ip, dni)) throw new (require('../http').ErrorHttp)(429, 'Demasiados intentos. Probá de nuevo en 10 minutos.');
  const u = uno('SELECT * FROM usuarios WHERE dni=? AND activo=1', dni);
  if (!u || !verificarClave(datos.clave, u.clave_hash)) { registrarFallo(ip, dni); auditar(u?.id, 'login_fallido', dni); throw new (require('../http').ErrorHttp)(401, 'DNI o contraseña incorrectos'); }
  limpiarFallos(ip, dni); crearSesion(respuesta, u.id); auditar(u.id, 'login');
  return infoUsuario(u);
}, { public: true });

ruta('POST', '/api/auth/logout', ({ pedido, respuesta }) => { destruirSesion(pedido, respuesta); return { ok: true }; }, { public: true });
ruta('GET', '/api/auth/me', ({ usuario }) => infoUsuario(usuario));

ruta('POST', '/api/auth/clave', ({ usuario, datos }) => {
  const u = uno('SELECT * FROM usuarios WHERE id=?', usuario.id);
  if (!verificarClave(datos.actual, u.clave_hash)) throw prohibido('La contraseña actual es incorrecta');
  if (!datos.nueva || datos.nueva.length < 8) throw pedidoInvalido('La nueva contraseña debe tener al menos 8 caracteres');
  ejecutar('UPDATE usuarios SET clave_hash=?, debe_cambiar_clave=0 WHERE id=?', hashearClave(datos.nueva), usuario.id);
  auditar(usuario.id, 'cambio_password'); return { ok: true };
});
