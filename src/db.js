const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const conf = require('./config');

fs.mkdirSync(path.dirname(conf.rutaBase), { recursive: true });
const db = new DatabaseSync(conf.rutaBase);
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS ciclos (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL UNIQUE, activo INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS periodos (
  id INTEGER PRIMARY KEY, ciclo_id INTEGER NOT NULL REFERENCES ciclos(id), nombre TEXT NOT NULL, orden INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto','cerrado')), UNIQUE(ciclo_id, orden));
CREATE TABLE IF NOT EXISTS cursos (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, ciclo_id INTEGER NOT NULL REFERENCES ciclos(id), UNIQUE(nombre, ciclo_id));
CREATE TABLE IF NOT EXISTS materias (id INTEGER PRIMARY KEY, nombre TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY, dni TEXT NOT NULL UNIQUE, nombre TEXT NOT NULL, apellido TEXT NOT NULL, email TEXT,
  rol TEXT NOT NULL CHECK (rol IN ('admin','profesor','preceptor','alumno')),
  clave_hash TEXT NOT NULL, debe_cambiar_clave INTEGER NOT NULL DEFAULT 1,
  curso_id INTEGER REFERENCES cursos(id), activo INTEGER NOT NULL DEFAULT 1, creado TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS tutores (
  id INTEGER PRIMARY KEY, alumno_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL, email TEXT NOT NULL, parentesco TEXT DEFAULT 'Responsable');
CREATE TABLE IF NOT EXISTS asignaciones (
  id INTEGER PRIMARY KEY, curso_id INTEGER NOT NULL REFERENCES cursos(id), materia_id INTEGER NOT NULL REFERENCES materias(id),
  profesor_id INTEGER NOT NULL REFERENCES usuarios(id), UNIQUE(curso_id, materia_id));
CREATE TABLE IF NOT EXISTS preceptor_cursos (preceptor_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE, curso_id INTEGER NOT NULL REFERENCES cursos(id), PRIMARY KEY(preceptor_id, curso_id));
CREATE TABLE IF NOT EXISTS notas (
  id INTEGER PRIMARY KEY, alumno_id INTEGER NOT NULL REFERENCES usuarios(id), asignacion_id INTEGER NOT NULL REFERENCES asignaciones(id),
  periodo_id INTEGER NOT NULL REFERENCES periodos(id), valor REAL CHECK (valor IS NULL OR (valor>=1 AND valor<=10)),
  estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','cerrada')), incompletos TEXT,
  actualizado_por INTEGER REFERENCES usuarios(id), actualizado TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(alumno_id, asignacion_id, periodo_id));
CREATE TABLE IF NOT EXISTS notas_historial (
  id INTEGER PRIMARY KEY, nota_id INTEGER NOT NULL, valor_anterior REAL, valor_nuevo REAL, motivo TEXT,
  usuario_id INTEGER NOT NULL, fecha TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS asistencias (
  id INTEGER PRIMARY KEY, alumno_id INTEGER NOT NULL REFERENCES usuarios(id), curso_id INTEGER NOT NULL REFERENCES cursos(id), fecha TEXT NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('presente','ausente','tarde','justificada')), registrado_por INTEGER REFERENCES usuarios(id), UNIQUE(alumno_id, fecha));
CREATE TABLE IF NOT EXISTS comunicados (
  id INTEGER PRIMARY KEY, titulo TEXT NOT NULL, cuerpo TEXT NOT NULL, curso_id INTEGER REFERENCES cursos(id),
  destino TEXT NOT NULL DEFAULT 'ambos' CHECK (destino IN ('tutores','alumnos','ambos')),
  estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','enviado')), autor_id INTEGER NOT NULL REFERENCES usuarios(id),
  creado TEXT NOT NULL DEFAULT (datetime('now')), enviado TEXT);
CREATE TABLE IF NOT EXISTS boletines (
  id INTEGER PRIMARY KEY, alumno_id INTEGER NOT NULL REFERENCES usuarios(id), periodo_id INTEGER NOT NULL REFERENCES periodos(id),
  estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','revisado','enviado','error')),
  revisado_por INTEGER REFERENCES usuarios(id), enviado TEXT, UNIQUE(alumno_id, periodo_id));
CREATE TABLE IF NOT EXISTS bandeja_salida (
  id INTEGER PRIMARY KEY, tipo TEXT NOT NULL, ref_id INTEGER, destinatario TEXT NOT NULL, asunto TEXT NOT NULL, cuerpo_html TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','enviado','simulado','error')), error TEXT,
  creado TEXT NOT NULL DEFAULT (datetime('now')), enviado TEXT);
CREATE TABLE IF NOT EXISTS sesiones (token_hash TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE, expira INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS auditoria (id INTEGER PRIMARY KEY, usuario_id INTEGER, accion TEXT NOT NULL, detalle TEXT, fecha TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS ix_notas_alumno ON notas(alumno_id);
CREATE INDEX IF NOT EXISTS ix_asis_curso ON asistencias(curso_id, fecha);
`);

const todos = (sql, ...p) => db.prepare(sql).all(...p);
const uno = (sql, ...p) => db.prepare(sql).get(...p);
const ejecutar = (sql, ...p) => db.prepare(sql).run(...p);
const transaccion = (fn) => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
const auditar = (usuarioId, accion, detalle = '') => ejecutar('INSERT INTO auditoria(usuario_id,accion,detalle) VALUES(?,?,?)', usuarioId ?? null, accion, String(detalle));

module.exports = { db, todos, uno, ejecutar, transaccion, auditar };
