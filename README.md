# la35Notas

Sistema de gestión escolar: notas, asistencias, comunicados y boletines por email.
Node.js 22.5+ · **cero dependencias** · base de datos SQLite integrada (`node:sqlite`).

## Arrancar

```bash
npm run seed     # crea la base con datos de ejemplo (--reset: la recrea)
npm start        # http://localhost:3000
npm test         # 33 pruebas de permisos y flujos
```

Usuarios de ejemplo (la contraseña inicial es el DNI; el sistema obliga a cambiarla):

| Rol | Usuario | Contraseña |
|---|---|---|
| Administrador | `admin` | `admin1234` |
| Profesor | `31928371` | `31928371` |
| Preceptor | `28111222` | `28111222` |
| Alumno | `96103383` | `96103383` |

## Estructura

```
server.js            arranque
src/config.js        variables de entorno (.env)
src/db.js            esquema SQLite + helpers
src/rbac.js          matriz de permisos y páginas por rol
src/http.js          router, sesiones, archivos estáticos, protección de páginas
src/services.js      alcance por rol, promedios, asistencia, HTML del boletín
src/mailer.js        bandeja de salida + envío SMTP
src/routes/          auth, usuarios, academico (config/notas/asistencias), comunicados (+boletines, dashboard)
public/*.html        una página por módulo
public/css/          estilos
public/js/           api.js, layout.js (menú por rol) y pages/*.js
data/                base de datos (no se versiona)
```

## Email (Gmail)

1. `cp .env.example .env`
2. Gmail → activar verificación en 2 pasos → crear **contraseña de aplicación**.
3. Completar `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`.
4. `npm install nodemailer`

Sin SMTP configurado, los envíos quedan en la bandeja de salida como **simulado** (podés probar todo el flujo).

## Producción

- Poner detrás de Nginx/Caddy con HTTPS y definir `COOKIE_SECURE=1`.
- Hacer copia periódica de `data/la35notas.db`.
- Cambiar `admin1234` en el primer ingreso.
