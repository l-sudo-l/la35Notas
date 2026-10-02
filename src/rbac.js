// Matriz de permisos (RBAC). Fuente única de verdad para backend y menú.
const P = {
  admin: ['usuarios.gestionar','academico.configurar','periodo.cerrar','notas.cargar','notas.corregir_cerradas',
          'asistencia.registrar','comunicados.crear','boletines.gestionar','auditoria.ver'],
  preceptor: ['notas.corregir_cerradas','asistencia.registrar','comunicados.crear','boletines.gestionar'],
  profesor: ['notas.cargar'],
  alumno: [],
};
const can = (rol, perm) => (P[rol] || []).includes(perm);

// Páginas permitidas por rol (el servidor también las protege)
const PAGES = {
  'dashboard.html':   ['admin','preceptor','profesor','alumno'],
  'usuarios.html':    ['admin'],
  'academico.html':   ['admin'],
  'carga-notas.html': ['admin','preceptor','profesor'],
  'asistencias.html': ['admin','preceptor','profesor'],
  'consulta.html':    ['admin','preceptor','profesor','alumno'],
  'comunicados.html': ['admin','preceptor','profesor','alumno'],
  'boletines.html':   ['admin','preceptor'],
};
module.exports = { P, can, PAGES };
