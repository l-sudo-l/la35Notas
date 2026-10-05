# Manual del Administrador

El administrador tiene acceso a todo el sistema. Menú: **Panel General, Usuarios, Cursos y materias, Carga de notas, Asistencias, Calificaciones / Boletín, Comunicados, Envío de boletines**.

## 1. Puesta en marcha (orden recomendado)

1. **Ciclo lectivo** → *Cursos y materias*. Escribí el año (ej. `2026`) y **Crear ciclo**. Se crean solos 4 bimestres. Si ya había un ciclo activo, el nuevo queda inactivo: tocá **Activar**.
2. **Cursos** y **Materias**: escribí el nombre y **Agregar**. Los cursos se crean dentro del ciclo *activo*, por eso activá primero el ciclo.
3. **Profesores y preceptores** → *Usuarios* (ver punto 2).
4. **Asignación de profesores**: elegí curso, materia y profesor → **Asignar**. Cada combinación curso + materia tiene un solo profesor. Con **Quitar** la eliminás, pero solo si todavía no tiene notas cargadas.
5. **Alumnos** → *Usuarios*, con su curso y los mails de los tutores.

## 2. Gestión de usuarios

Menú **Usuarios**. Podés buscar por nombre o DNI y filtrar por rol.

- **+ Nuevo usuario**: elegí el rol y completá DNI (6 a 12 dígitos), apellido, nombre y email.
- **Contraseña inicial**: si la dejás vacía, es el DNI. El usuario deberá cambiarla al ingresar.
- **Alumno**: obligatorio el curso. Cargá hasta 2 **tutores** (nombre y email): a esos mails llegan boletines y comunicados.
- **Preceptor**: tildá los **cursos a cargo**. Solo verá esos cursos.
- **✏️ Editar**: cambia datos, tutores o cursos. Si escribís una *nueva contraseña*, el usuario deberá cambiarla al ingresar. El rol no se puede cambiar una vez creado.
- **Baja**: desactiva al usuario y cierra su sesión. No se borra: se conserva su historial de notas.

## 3. Períodos (bimestres)

En *Cursos y materias*, cada período tiene el botón **Cerrar período** / **Reabrir**.

- Cerrado: los profesores ya no pueden cargar ni modificar notas de ese período.
- Si hay notas sin cerrar, el sistema avisa cuántas son y pide confirmación.
- Preceptores y administración sí pueden hacer correcciones (con motivo) aun con el período cerrado.

## 4. Notas, asistencias, comunicados y boletines

Tenés los mismos permisos que un preceptor, pero **sobre todos los cursos**:

- **Carga de notas**: elegí curso-materia y período. Podés cargar y corregir notas cerradas (el motivo es obligatorio y queda registrado en *Correcciones recientes*).
- **Comunicados**: sos el único que puede enviar un comunicado a **Todos los cursos**.
- Detalle de cada pantalla: ver el [manual del preceptor](manual-preceptor.md).

## 5. Panel General

Muestra alumnos, notas cerradas y pendientes del período abierto, notas desaprobadas (menores a 6), mails enviados y con error, usuarios activos por rol y los últimos comunicados.

## 6. Cuidados

- Cambiá la contraseña `admin1234` en el primer ingreso.
- Hacé copias periódicas del archivo `data/la35notas.db`: ahí está toda la información.
- Para que los mails salgan de verdad hay que configurar Gmail (ver README del proyecto). Sin eso quedan como *simulado* en la bandeja de salida.
