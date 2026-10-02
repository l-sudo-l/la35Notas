// Datos iniciales. Uso: npm run seed   (con --reset borra la base y la recrea)
const fs = require('fs');
const cfg = require('./config');
if (process.argv.includes('--reset')) for (const s of ['', '-wal', '-shm']) try { fs.unlinkSync(cfg.dbPath + s); } catch {}
const { run, get, tx } = require('./db');
const { hashPass } = require('./auth');
if (get('SELECT 1 FROM usuarios LIMIT 1')) { console.log('La base ya tiene datos. Usá --reset para recrearla.'); process.exit(0); }

tx(() => {
  const ciclo = run("INSERT INTO ciclos(nombre,activo) VALUES('2025',1)").lastInsertRowid;
  ['1er Bimestre', '2do Bimestre', '3er Bimestre', '4to Bimestre'].forEach((n, i) => run('INSERT INTO periodos(ciclo_id,nombre,orden) VALUES(?,?,?)', ciclo, n, i + 1));
  const curso = run("INSERT INTO cursos(nombre,ciclo_id) VALUES('6° 1°',?)", ciclo).lastInsertRowid;
  const mat = run("INSERT INTO materias(nombre) VALUES('Prácticas Profesionalizantes')").lastInsertRowid;
  const u = (dni, ap, no, rol, email, c = null) => run('INSERT INTO usuarios(dni,apellido,nombre,rol,email,pass_hash,curso_id) VALUES(?,?,?,?,?,?,?)', dni, ap, no, rol, email, hashPass(dni), c).lastInsertRowid;
  u('admin', 'Administrador', 'Sistema', 'admin', null).valueOf();
  // el admin usa contraseña inicial "admin1234"
  run("UPDATE usuarios SET pass_hash=? WHERE dni='admin'", hashPass('admin1234'));
  const moya = u('31928371', 'Moya', 'Juan', 'profesor', null);
  u('32651658', 'Serrano', 'Aaron', 'profesor', null);
  const prec = u('28111222', 'Pérez', 'Marta', 'preceptor', null);
  run('INSERT INTO preceptor_cursos VALUES(?,?)', prec, curso);
  run('INSERT INTO asignaciones(curso_id,materia_id,profesor_id) VALUES(?,?,?)', curso, mat, moya);
  const al = (dni, ap, no, tn, te) => { const id = u(dni, ap, no, 'alumno', null, curso); run('INSERT INTO tutores(alumno_id,nombre,email) VALUES(?,?,?)', id, tn, te); };
  al('96103383', 'Rodriguez', 'Luis', 'Rodriguez Luis (padre)', 'luis.manuel.rodriguez.0827@gmail.com');
  al('45000001', 'Zurita', 'Matías', 'Papá de Zurita', 'papa_de_zurita@mail.com');
});
console.log('Base creada.\n  admin / admin1234   |   profesor 31928371 / 31928371   |   preceptor 28111222 / 28111222   |   alumno 96103383 / 96103383\n  (la contraseña inicial de cada usuario es su DNI; el sistema pide cambiarla)');
