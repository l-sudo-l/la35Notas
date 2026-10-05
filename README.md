# la35Notas

Sistema de gestión escolar: notas, asistencias, comunicados y boletines por email.
Node.js 22.5+ · **cero dependencias** · base de datos SQLite integrada (`node:sqlite`).

## Arrancar

```bash
npm.cmd run seed    # crea la base con datos de ejemplo (--reset: la recrea)
npm.cmd start        # http://localhost:3000
npm.cmd test         # 33 pruebas automáticas de permisos y flujos
```

Usuarios de ejemplo (la contraseña inicial es el DNI; el sistema obliga a cambiarla):

| Rol | Usuario | Contraseña |
|---|---|---|
| Administrador | `admin` | `admin1234` |
| Profesor | `31928371` | `31928371` |
| Preceptor | `28111222` | `28111222` |
| Alumno | `96103383` | `96103383` |

## Manuales de usuario

En la carpeta [`docs/`](docs/README.md) hay una [guía de funcionamiento](docs/guia-de-funcionamiento.md) para revisar la plataforma y un manual por rol: administrador, preceptor, profesor, alumno y familias.

## Estructura

```
server.js            arranque
src/config.js        variables de entorno (.env)
src/db.js            esquema SQLite + helpers
src/rbac.js          matriz de permisos y páginas por rol
src/http.js          router, sesiones, archivos estáticos, protección de páginas
src/services.js      alcance por rol, promedios, asistencia, HTML del boletín
src/mailer.js        bandeja de salida (tabla bandeja_salida) + envío SMTP
src/routes/          auth, usuarios, academico (config/notas/asistencias), comunicados (+boletines, dashboard)
public/*.html        una página por módulo
public/css/          estilos
public/js/           api.js, layout.js (menú por rol) y pages/*.js
data/                base de datos (no se versiona)
```

## Convenciones del código

Todo el código propio está en español: funciones (`usuarioDeSesion`, `hashearClave`, `cursosVisibles`), variables,
constantes (`PERMISOS`, `PAGINAS`), clases CSS (`.tarjeta`, `.boton-azul`, `.barra-lateral`), ids y claves de la API
(`clave`, `correos`). Se mantienen en su idioma original solo los nombres de las APIs de Node/navegador y de las
librerías (`fetch`, `classList`, `nodemailer`, `req.url`, etc.).

Variables de entorno (`.env`): `PUERTO`, `RUTA_BASE`, `HORAS_SESION`, `NOMBRE_COLEGIO`, `SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASS`, `REMITENTE`, `COOKIE_SEGURA`.

## Roles y permisos

| Acción | Admin | Preceptor | Profesor | Alumno |
|---|:-:|:-:|:-:|:-:|
| Usuarios, cursos, materias, ciclos | ✅ | ❌ | ❌ | ❌ |
| Cerrar / reabrir período | ✅ | ❌ | ❌ | ❌ |
| Cargar notas | ✅ | ✅ | solo sus materias, mientras no estén cerradas | ❌ |
| Corregir notas cerradas | ✅ | ✅ (con motivo) | ❌ | ❌ |
| Registrar asistencia | ✅ | ✅ (sus cursos) | solo lectura | solo la propia |
| Comunicados | ✅ (a todos los cursos) | ✅ (sus cursos) | solo lectura | solo los enviados |
| Boletines masivos por email | ✅ | ✅ | ❌ | solo el propio |

Los padres/tutores no tienen usuario: reciben boletines y comunicados por email.
La matriz vive en `src/rbac.js` y la usan tanto el servidor como el menú.

## Reglas de negocio

- **Notas:** el profesor guarda borrador y luego "cierra". Una nota cerrada solo la corrige preceptoría o administración, con motivo obligatorio; cada corrección queda en `notas_historial` y en la auditoría.
- **Períodos:** el admin los cierra (avisa si hay notas sin cargar). Con el período cerrado, el profesor ya no puede cargar.
- **Promedio:** por materia, es el promedio de las notas cerradas de cada período. El "promedio sugerido" al cargar es solo una ayuda.
- **Asistencia:** presente, ausente, tarde (cuenta media falta) y justificada (no cuenta).
- **Boletines:** `borrador` → `revisado` → `enviado` (o `error`). Solo se envían los revisados, y los alumnos sin email de tutor quedan marcados como error.
- **Alumno:** ve únicamente sus notas cerradas, nunca borradores.
- **Seguridad:** contraseñas con scrypt, cookie `HttpOnly` + `SameSite=Strict`, bloqueo tras 5 intentos fallidos, baja lógica de usuarios (conserva el historial).

## Estado actual y limitaciones

Probado: las 33 pruebas automáticas y un recorrido en navegador (Chromium de escritorio) con los cuatro roles.
Pendiente o no probado:

- Envío real por Gmail (falta `nodemailer` y credenciales; hoy queda "simulado").
- Pantallas de celular: el CSS es responsive pero no se verificó.
- No hay importación masiva de alumnos desde Excel (se cargan uno por uno).
- Los boletines salen como HTML dentro del mail; no se adjunta PDF (desde la vista de consulta se puede imprimir / guardar como PDF).
- La recuperación de contraseña la hace el admin (no hay "olvidé mi contraseña" por mail).

## Email (Gmail)

1. `cp .env.example .env`
2. Gmail → activar verificación en 2 pasos → crear **contraseña de aplicación**.
3. Completar `SMTP_USER`, `SMTP_PASS`, `REMITENTE`.
4. `npm install nodemailer`

Sin SMTP configurado, los envíos quedan en la bandeja de salida como **simulado** (podés probar todo el flujo).

## Producción

- Poner detrás de Nginx/Caddy con HTTPS y definir `COOKIE_SEGURA=1`.
- Hacer copia periódica de `data/la35notas.db`.
- Cambiar `admin1234` en el primer ingreso.
