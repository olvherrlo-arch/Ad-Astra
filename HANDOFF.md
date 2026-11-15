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

## Falta
1. Actualizar `README.md` y `CLAUDE.md` con todo lo de arriba.
2. Probar en navegador, sin atajos por consola: perforar, cargar el Prisma, despegar de la Luna, emergencias (repuesto y reparación), reentrada, Evaluación y volver al lobby.
3. Probar con 2 a 4 jugadores reales: que se vean caminar, cargar y pilotear en vivo (`act` en `player:move`).
4. Luna: la trama de sombra es muy densa. Bajar la densidad en `paintMoon` (`js/worldart.js`).
5. Alunizaje: ajustar dificultad (`GRAVITY`, `PAR` en `js/pilotgames.js`) con jugadores reales.
6. HUD en pantallas angostas: la lista de tareas tapa mucho. Ya se pliega con clic; revisar.
7. Revisión de tipos con `tsc` (ver `CLAUDE.md`; la ruta vieja no existe en esta PC).
8. `.claude/skills/` quedó sin subir a propósito: decidir si va al repo.
9. Pendiente de antes: evaluación con nota (fase 7) y misiones 2 y 3 (fase 8).

## Regla de diseño (del usuario)
Juego real, no menús. Solo mercado y constructor son menús. Cada rol hace cosas con las manos, la cooperación es necesaria y nadie espera sin hacer nada.
