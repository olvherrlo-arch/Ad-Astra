# Relevo: mundo jugable de Ad Astra

Lee primero `CLAUDE.md` (está desactualizado en lo que sigue) y este archivo.

## Qué cambió
La misión ya no es una mesa con menús y "visto bueno". Ahora se juega caminando por un mundo 2D compartido.

- `js/worldmaps.js`: tres mapas (estación, nave, Luna), colisiones y `findPath` por puertas.
- `js/tasks.js`: tareas físicas por rol y etapa, ventajas (`PERKS`), preparativos de vuelo (`PREP`), trabajos (`JOBS`).
- `server/world.js`: acciones `task:done`, `carry:pick`, `carry:drop`, `carry:cancel`.
- `server/game.js`: se quitó `role:confirm`. `confirmed` se calcula de las tareas. `stage:advance` lo hace cualquiera con las tareas hechas; el despegue lo da Vuelo. En vuelo la etapa cambia sola.
- `server/flight.js`: `flight:burn {dv, aim, touchdown}`, `flight:prep`, `flight:scan {x, y}` por distancia, `flight:dig`, `flight:load`, `flight:solar`.
- `js/world.js`: pantalla del mundo (movimiento, puestos con E, HUD, paneles de mercado y constructor).
- `js/worldart.js`, `js/minigames.js`, `js/pilotgames.js`, `js/frame.js`: dibujo, seis minijuegos, encendido y alunizaje a mano.
- Se borró `js/desk.js`. `js/flightview.js` acepta `{ readOnly: true }`.

`npm test` pasa completo (física 101, mercado 56, armado 58, vuelo 63, red).

## Probado en navegador
Estación, tarea de cables de punta a punta, los ocho minijuegos, mapa de la nave, mapa lunar y un escaneo.

## Hecho en el segundo relevo
- README.md y CLAUDE.md actualizados con el mundo jugable.
- Luna: trama de sombra más suave en `paintMoon` (puntos más chicos y separados, cráteres más claros).
- Alunizaje más justo: `PAR` 125 → 140 (≈ 1,6 veces el mínimo), suave con caída < 10 y costado < 7.
- HUD angosto (≤ 760 px): solo tus tareas pendientes; en un teléfono pasó de tapar el 19 % al 10 %.
- `tsc` sin errores (la ruta de la copia vieja sí existe en esta PC). `npm test` completo en verde.

## Falta
1. Probar en navegador de punta a punta, sin atajos: perforar, cargar el Prisma, despegar de la Luna,
   emergencias (repuesto y reparación), reentrada, Evaluación y volver al lobby. Necesita la ventana a la vista:
   con el panel oculto no hay requestAnimationFrame y el mundo se congela.
2. Probar con 2 a 4 personas reales (verse caminar, cargar, pilotear en vivo) y afinar el alunizaje con ellas.
3. `.claude/skills/` quedó sin subir a propósito: decidir si va al repo.
4. Evaluación con nota (fase 7) y misiones 2 y 3 (fase 8).

## Regla de diseño (del usuario)
Juego real, no menús. Solo mercado y constructor son menús. Cada rol hace cosas con las manos, la cooperación es necesaria y nadie espera sin hacer nada.
