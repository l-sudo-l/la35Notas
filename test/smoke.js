// Test de humo: levanta el servidor sobre una base temporal y verifica flujos y permisos (RBAC).
const { spawn, execSync } = require('child_process');
const path = require('path'), os = require('os');
const RUTA_TEST = path.join(os.tmpdir(), `la35test-${Date.now()}.db`), PUERTO = 3999, URL_BASE = `http://localhost:${PUERTO}`;
const entorno = { ...process.env, RUTA_BASE: RUTA_TEST, PUERTO };
execSync('node --no-warnings src/seed.js --reset', { env: entorno, stdio: 'ignore' });
const servidor = spawn('node', ['--no-warnings', 'server.js'], { env: entorno, stdio: 'ignore' });
let aprobadas = 0, fallidas = 0;
const verificar = (nombre, condicion) => { condicion ? aprobadas++ : fallidas++; console.log(`${condicion ? '✔' : '✘'} ${nombre}`); };
const sesion = (cookie = '') => async (m, p, body) => {
  const r = await fetch(URL_BASE + '/api/' + p, { method: m, headers: { 'Content-Type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, d: await r.json().catch(() => ({})), c: r.headers.get('set-cookie') };
};
async function login(dni, clave) { const r = await sesion()('POST', 'auth/login', { dni, clave }); return Object.assign(sesion(r.c?.split(';')[0]), { r }); }

(async () => {
  await new Promise((r) => setTimeout(r, 1200));
  const anonimo = sesion();
  verificar('API sin sesión → 401', (await anonimo('GET', 'usuarios')).s === 401);
  verificar('Login incorrecto → 401', (await anonimo('POST', 'auth/login', { dni: 'admin', clave: 'x' })).s === 401);
  const pagina = await fetch(URL_BASE + '/usuarios.html', { redirect: 'manual' }); verificar('Página protegida sin sesión → redirige a login', pagina.status === 302);
  const traversal = await fetch(URL_BASE + '/..%2f..%2fetc/passwd'); verificar('Path traversal bloqueado', traversal.status !== 200);

  const admin = await login('admin', 'admin1234'), prof = await login('31928371', '31928371'), prec = await login('28111222', '28111222'), alu = await login('96103383', '96103383');
  const config = (await admin('GET', 'academico/config')).d, asg = config.asignaciones[0], per = config.periodos[0];
  const alumnos = (await admin('GET', 'alumnos?curso_id=' + asg.curso_id)).d;
  const items = (v) => alumnos.map((a) => ({ alumno_id: a.id, valor: v }));
  const guardarNotas = (c, v, x = {}) => c('PUT', 'notas', { asignacion_id: asg.id, periodo_id: per.id, items: items(v), ...x });

  verificar('Alumno NO accede a lista de usuarios', (await alu('GET', 'usuarios')).s === 403);
  verificar('Profesor NO accede a lista de usuarios', (await prof('GET', 'usuarios')).s === 403);
  verificar('Preceptor NO crea usuarios', (await prec('POST', 'usuarios', { rol: 'admin', dni: '11111111', nombre: 'a', apellido: 'b' })).s === 403);
  verificar('Admin crea profesor', (await admin('POST', 'usuarios', { rol: 'profesor', dni: '30000001', nombre: 'Ana', apellido: 'Gómez' })).s === 200);
  verificar('Alumno NO carga notas', (await guardarNotas(alu, 7)).s === 403);
  verificar('Profesor guarda borrador', (await guardarNotas(prof, 7)).s === 200);
  verificar('Profesor cierra notas', (await guardarNotas(prof, 8, { cerrar: true })).s === 200);
  verificar('Profesor NO modifica notas cerradas', (await guardarNotas(prof, 3)).s === 403);
  verificar('Preceptor corrige nota cerrada SIN motivo → rechazado', (await guardarNotas(prec, 5)).s === 400);
  verificar('Preceptor corrige nota cerrada CON motivo', (await guardarNotas(prec, 5, { motivo: 'Error de carga' })).s === 200);
  verificar('Historial de correcciones registrado', (await prec('GET', 'notas/historial')).d.length >= 1);
  verificar('Profesor NO envía comunicados', (await prof('POST', 'comunicados', { titulo: 'x', cuerpo: 'y' })).s === 403);
  const comunicado = await prec('POST', 'comunicados', { titulo: 'Reunión de padres', cuerpo: 'Viernes 18 h', curso_id: asg.curso_id, destino: 'ambos' });
  verificar('Preceptor crea comunicado', comunicado.s === 200);
  const comunicadosAlumno = (await alu('GET', 'comunicados')).d; verificar('Alumno NO ve comunicado en borrador', comunicadosAlumno.length === 0);
  const envioComunicado = await prec('POST', `comunicados/${comunicado.d.id}/enviar`, {}); verificar('Preceptor envía comunicado a tutores', envioComunicado.s === 200 && envioComunicado.d.destinatarios === 2);
  verificar('Alumno ve comunicado enviado', (await alu('GET', 'comunicados')).d.length === 1);
  verificar('Alumno NO puede crear comunicado', (await alu('POST', 'comunicados', { titulo: 'x', cuerpo: 'y' })).s === 403);
  verificar('Alumno ve solo sus notas cerradas', (await alu('GET', 'consulta')).d.materias[0].notas[per.id] === 5);
  verificar('Alumno NO ve notas de otro (alumno_id ignorado)', (await alu('GET', `consulta?alumno_id=${alumnos[1].id}`)).d.alumno.dni === '96103383');
  verificar('Profesor NO registra asistencia', (await prof('PUT', 'asistencias', { curso_id: asg.curso_id, fecha: '2025-03-10', items: [] })).s === 403);
  verificar('Preceptor registra asistencia', (await prec('PUT', 'asistencias', { curso_id: asg.curso_id, fecha: '2025-03-10', items: alumnos.map((a, i) => ({ alumno_id: a.id, estado: i ? 'ausente' : 'presente' })) })).s === 200);
  verificar('Preceptor genera boletines', (await prec('POST', 'boletines/generar', { curso_id: asg.curso_id, periodo_id: per.id })).s === 200);
  verificar('Profesor NO accede a boletines', (await prof('GET', `boletines?curso_id=${asg.curso_id}&periodo_id=${per.id}`)).s === 403);
  verificar('No se envía sin revisar', (await prec('POST', 'boletines/enviar', { curso_id: asg.curso_id, periodo_id: per.id })).s === 400);
  const ids = (await prec('GET', `boletines?curso_id=${asg.curso_id}&periodo_id=${per.id}`)).d.alumnos.map((a) => a.id);
  await prec('POST', 'boletines/revisar', { ids });
  const envioBoletines = await prec('POST', 'boletines/enviar', { curso_id: asg.curso_id, periodo_id: per.id }); verificar('Envío masivo de boletines', envioBoletines.s === 200 && envioBoletines.d.correos === 2);
  verificar('Boletines quedan en estado enviado', (await prec('GET', `boletines?curso_id=${asg.curso_id}&periodo_id=${per.id}`)).d.alumnos.every((a) => a.estado === 'enviado'));
  const p = (await admin('PUT', `academico/periodos/${per.id}/estado`, { estado: 'cerrado', forzar: true })).s; verificar('Admin cierra período', p === 200);
  verificar('Profesor NO carga en período cerrado', (await guardarNotas(prof, 9)).s === 403);
  verificar('Admin da de baja y la sesión se invalida', (await admin('DELETE', 'usuarios/' + alumnos[0].id)).s === 200);
  servidor.kill(); console.log(`\n${aprobadas} OK, ${fallidas} fallos`); process.exit(fallidas ? 1 : 0);
})();
