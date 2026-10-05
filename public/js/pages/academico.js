import { $, api, escapar, avisar, protegido, opciones, etiqueta } from '../api.js';
import { iniciar } from '../layout.js';
await iniciar();
const raiz = $('#acad');
const publicar = (p, cuerpo) => api(p, { method: 'POST', cuerpo });

const dibujar = protegido(async () => {
  const c = await api('academico/config');
  const activo = c.ciclos.find((x) => x.activo);
  raiz.innerHTML = `
  <div class="encabezado-seccion"><div class="titulo-seccion">Ciclos lectivos y períodos</div></div>
  <div class="tarjeta tarjeta-relleno"><div class="fila-formulario"><div class="campo"><label>Nuevo ciclo (ej. 2026)</label><input id="ciclo-nombre"></div><button class="boton boton-azul" id="ciclo-agregar">Crear ciclo</button></div></div>
  ${c.ciclos.map((ci) => `<div class="tarjeta" style="margin-bottom:16px"><div class="encabezado-seccion" style="padding:12px 16px;margin:0"><b>Ciclo ${escapar(ci.nombre)}</b> ${ci.activo ? etiqueta('Activo', 'ok') : `<button class="boton boton-fantasma boton-chico" data-activar="${ci.id}">Activar</button>`}</div>
    <div class="tabla-contenedor"><table><tbody>${c.periodos.filter((p) => p.ciclo_id === ci.id).map((p) => `<tr><td>${escapar(p.nombre)}</td><td>${etiqueta(p.estado, p.estado === 'abierto' ? 'ok' : 'gris')}</td>
      <td><button class="boton boton-fantasma boton-chico" data-periodo="${p.id}" data-estado="${p.estado === 'abierto' ? 'cerrado' : 'abierto'}">${p.estado === 'abierto' ? 'Cerrar período' : 'Reabrir'}</button></td></tr>`).join('')}</tbody></table></div></div>`).join('')}
  <div class="grilla-estadisticas" style="margin-top:28px">
    <div class="tarjeta tarjeta-relleno"><div class="titulo-seccion">Cursos</div><p class="apagado" style="margin:8px 0">${c.cursos.map((x) => escapar(x.nombre)).join(' · ') || 'Sin cursos'}</p><div class="fila-formulario"><div class="campo"><input id="curso-nombre" placeholder="Ej: 5° 2°"></div><button class="boton boton-azul boton-chico" id="curso-agregar">Agregar</button></div></div>
    <div class="tarjeta tarjeta-relleno"><div class="titulo-seccion">Materias</div><p class="apagado" style="margin:8px 0">${c.materias.map((x) => escapar(x.nombre)).join(' · ') || 'Sin materias'}</p><div class="fila-formulario"><div class="campo"><input id="materia-nombre" placeholder="Ej: Matemática"></div><button class="boton boton-azul boton-chico" id="materia-agregar">Agregar</button></div></div></div>
  <div class="encabezado-seccion" style="margin-top:28px"><div class="titulo-seccion">Asignación de profesores</div></div>
  <div class="tarjeta tarjeta-relleno"><div class="fila-formulario"><div class="campo"><label>Curso</label><select id="asig-curso">${opciones(c.cursos, 'id', (x) => x.nombre, '…')}</select></div><div class="campo"><label>Materia</label><select id="asig-materia">${opciones(c.materias, 'id', (x) => x.nombre, '…')}</select></div>
    <div class="campo"><label>Profesor</label><select id="asig-profesor">${opciones(c.profesores, 'id', (x) => `${x.apellido} ${x.nombre}`, '…')}</select></div><button class="boton boton-azul" id="asig-agregar">Asignar</button></div></div>
  <div class="tarjeta"><div class="tabla-contenedor"><table><thead><tr><th>Curso</th><th>Materia</th><th>Profesor</th><th></th></tr></thead><tbody>${c.asignaciones.map((a) => `<tr><td>${escapar(a.curso)}</td><td>${escapar(a.materia)}</td><td>${escapar(a.profesor)}</td><td><button class="boton boton-fantasma boton-chico" data-quitar-asig="${a.id}">Quitar</button></td></tr>`).join('')}</tbody></table></div></div>`;
  $('#ciclo-agregar').onclick = protegido(async () => { await publicar('academico/ciclos', { nombre: $('#ciclo-nombre').value, activo: !activo }); dibujar(); });
  $('#curso-agregar').onclick = protegido(async () => { await publicar('academico/cursos', { nombre: $('#curso-nombre').value }); dibujar(); });
  $('#materia-agregar').onclick = protegido(async () => { await publicar('academico/materias', { nombre: $('#materia-nombre').value }); dibujar(); });
  $('#asig-agregar').onclick = protegido(async () => { await publicar('academico/asignaciones', { curso_id: $('#asig-curso').value, materia_id: $('#asig-materia').value, profesor_id: $('#asig-profesor').value }); avisar('Asignación creada'); dibujar(); });
});
raiz.onclick = protegido(async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.activar) { await api(`academico/ciclos/${b.dataset.activar}/activar`, { method: 'PUT', cuerpo: {} }); dibujar(); }
  if (b.dataset.borrarasg) { await api(`academico/asignaciones/${b.dataset.borrarasg}`, { method: 'DELETE' }); dibujar(); }
  if (b.dataset.periodo) {
    let r = await api(`academico/periodos/${b.dataset.periodo}/estado`, { method: 'PUT', cuerpo: { estado: b.dataset.estado } });
    if (!r.ok && confirm(r.error)) r = await api(`academico/periodos/${b.dataset.periodo}/estado`, { method: 'PUT', cuerpo: { estado: b.dataset.estado, forzar: true } });
    if (r.ok) { avisar('Período ' + b.dataset.estado); dibujar(); }
  }
});
dibujar();
