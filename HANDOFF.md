# Relevo: Ad Astra

Lee primero `CLAUDE.md` (está al día: estructura, reglas, pruebas, cómo compartir).

## Estado (15 de noviembre de 2026)
- Todo subido a GitHub (`main`). `npm test` y la revisión de tipos en verde.
- Hecho: mundo jugable, opciones, créditos, trajes por rol, panel de tareas plegable, historia de cine,
  puntaje individual y Resultados, SOLO, "Rediseñar y volver a volar", plan de misión (lugar y órbita),
  ciencia y datos, dificultad real, récords, Marte/Éxodo como "Próximamente", mercado en teléfonos y
  motor que no se apaga al usar dos dedos.
- Compartir hoy: `npm start` en el panel Terminal + `cloudflared tunnel --protocol http2 --url http://localhost:3000`
  (el link cambia cada vez).

## Falta (en este orden)
1. Link fijo en Render (`render.yaml` ya existe): lo tiene que hacer el usuario (cuenta + autorizar GitHub).
   En el plan gratis el servidor se duerme y `data/records.json` se borra en cada reinicio.
2. Probar en un teléfono real y con 2 a 4 personas una misión completa.
3. HECHO: modo Sandbox (ver CLAUDE.md, sección Expansión). Sigue la expansión: Misión 2, Misión 3, integración.
4. Guardar y compartir diseños de cohete (código para exportar e importar).
5. Informe de misión descargable (página para imprimir o PDF).
6. HECHO: misiones 2 y 3. También el cambio de personaje en solitario y los tutoriales nuevos. Falta probar con gente (ver CLAUDE.md).
7. Pulido: botones unificados, animaciones de confirmación, dibujos finales de piezas.
