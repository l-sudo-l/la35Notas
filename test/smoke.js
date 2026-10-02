// Test de humo: levanta el servidor sobre una base temporal y verifica flujos y permisos (RBAC).
const { spawn, execSync } = require('child_process');
const path = require('path'), os = require('os');
const DB = path.join(os.tmpdir(), `la35test-${Date.now()}.db`), PORT = 3999, B = `http://localhost:${PORT}`;
const env = { ...process.env, DB_PATH: DB, PORT };
execSync('node --no-warnings src/seed.js --reset', { env, stdio: 'ignore' });
const srv = spawn('node', ['--no-warnings', 'server.js'], { env, stdio: 'ignore' });
let pass = 0, fail = 0;
const t = (name, ok) => { ok ? pass++ : fail++; console.log(`${ok ? '✔' : '✘'} ${name}`); };
const session = (cookie = '') => async (m, p, body) => {
  const r = await fetch(B + '/api/' + p, { method: m, headers: { 'Content-Type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
  return { s: r.status, d: await r.json().catch(() => ({})), c: r.headers.get('set-cookie') };
};
async function login(dni, password) { const r = await session()('POST', 'auth/login', { dni, password }); return Object.assign(session(r.c?.split(';')[0]), { r }); }

(async () => {
  await new Promise((r) => setTimeout(r, 1200));
  const anon = session();
  t('API sin sesión → 401', (await anon('GET', 'usuarios')).s === 401);
  t('Login incorrecto → 401', (await anon('POST', 'auth/login', { dni: 'admin', password: 'x' })).s === 401);
  const pg = await fetch(B + '/usuarios.html', { redirect: 'manual' }); t('Página protegida sin sesión → redirige a login', pg.status === 302);
  const tr = await fetch(B + '/..%2f..%2fetc/passwd'); t('Path traversal bloqueado', tr.status !== 200);

  const admin = await login('admin', 'admin1234'), prof = await login('31928371', '31928371'), prec = await login('28111222', '28111222'), alu = await login('96103383', '96103383');
  const cfg = (await admin('GET', 'academico/config')).d, asg = cfg.asignaciones[0], per = cfg.periodos[0];
  const alumnos = (await admin('GET', 'alumnos?curso_id=' + asg.curso_id)).d;
  const items = (v) => alumnos.map((a) => ({ alumno_id: a.id, valor: v }));
  const N = (c, v, x = {}) => c('PUT', 'notas', { asignacion_id: asg.id, periodo_id: per.id, items: items(v), ...x });

  t('Alumno NO accede a lista de usuarios', (await alu('GET', 'usuarios')).s === 403);
  t('Profesor NO accede a lista de usuarios', (await prof('GET', 'usuarios')).s === 403);
  t('Preceptor NO crea usuarios', (await prec('POST', 'usuarios', { rol: 'admin', dni: '11111111', nombre: 'a', apellido: 'b' })).s === 403);
  t('Admin crea profesor', (await admin('POST', 'usuarios', { rol: 'profesor', dni: '30000001', nombre: 'Ana', apellido: 'Gómez' })).s === 200);
  t('Alumno NO carga notas', (await N(alu, 7)).s === 403);
  t('Profesor guarda borrador', (await N(prof, 7)).s === 200);
  t('Profesor cierra notas', (await N(prof, 8, { cerrar: true })).s === 200);
  t('Profesor NO modifica notas cerradas', (await N(prof, 3)).s === 403);
  t('Preceptor corrige nota cerrada SIN motivo → rechazado', (await N(prec, 5)).s === 400);
  t('Preceptor corrige nota cerrada CON motivo', (await N(prec, 5, { motivo: 'Error de carga' })).s === 200);
  t('Historial de correcciones registrado', (await prec('GET', 'notas/historial')).d.length >= 1);
  t('Profesor NO envía comunicados', (await prof('POST', 'comunicados', { titulo: 'x', cuerpo: 'y' })).s === 403);
  const com = await prec('POST', 'comunicados', { titulo: 'Reunión de padres', cuerpo: 'Viernes 18 h', curso_id: asg.curso_id, destino: 'ambos' });
  t('Preceptor crea comunicado', com.s === 200);
  const alC = (await alu('GET', 'comunicados')).d; t('Alumno NO ve comunicado en borrador', alC.length === 0);
  const env1 = await prec('POST', `comunicados/${com.d.id}/enviar`, {}); t('Preceptor envía comunicado a tutores', env1.s === 200 && env1.d.destinatarios === 2);
  t('Alumno ve comunicado enviado', (await alu('GET', 'comunicados')).d.length === 1);
  t('Alumno NO puede crear comunicado', (await alu('POST', 'comunicados', { titulo: 'x', cuerpo: 'y' })).s === 403);
  t('Alumno ve solo sus notas cerradas', (await alu('GET', 'consulta')).d.materias[0].notas[per.id] === 5);
  t('Alumno NO ve notas de otro (alumno_id ignorado)', (await alu('GET', `consulta?alumno_id=${alumnos[1].id}`)).d.alumno.dni === '96103383');
  t('Profesor NO registra asistencia', (await prof('PUT', 'asistencias', { curso_id: asg.curso_id, fecha: '2025-03-10', items: [] })).s === 403);
  t('Preceptor registra asistencia', (await prec('PUT', 'asistencias', { curso_id: asg.curso_id, fecha: '2025-03-10', items: alumnos.map((a, i) => ({ alumno_id: a.id, estado: i ? 'ausente' : 'presente' })) })).s === 200);
  t('Preceptor genera boletines', (await prec('POST', 'boletines/generar', { curso_id: asg.curso_id, periodo_id: per.id })).s === 200);
  t('Profesor NO accede a boletines', (await prof('GET', `boletines?curso_id=${asg.curso_id}&periodo_id=${per.id}`)).s === 403);
  t('No se envía sin revisar', (await prec('POST', 'boletines/enviar', { curso_id: asg.curso_id, periodo_id: per.id })).s === 400);
  const ids = (await prec('GET', `boletines?curso_id=${asg.curso_id}&periodo_id=${per.id}`)).d.alumnos.map((a) => a.id);
  await prec('POST', 'boletines/revisar', { ids });
  const send = await prec('POST', 'boletines/enviar', { curso_id: asg.curso_id, periodo_id: per.id }); t('Envío masivo de boletines', send.s === 200 && send.d.mails === 2);
  t('Boletines quedan en estado enviado', (await prec('GET', `boletines?curso_id=${asg.curso_id}&periodo_id=${per.id}`)).d.alumnos.every((a) => a.estado === 'enviado'));
  const p = (await admin('PUT', `academico/periodos/${per.id}/estado`, { estado: 'cerrado', forzar: true })).s; t('Admin cierra período', p === 200);
  t('Profesor NO carga en período cerrado', (await N(prof, 9)).s === 403);
  t('Admin da de baja y la sesión se invalida', (await admin('DELETE', 'usuarios/' + alumnos[0].id)).s === 200);
  srv.kill(); console.log(`\n${pass} OK, ${fail} fallos`); process.exit(fail ? 1 : 0);
})();
