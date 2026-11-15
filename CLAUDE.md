# Ad Astra: guía para Claude

Juego multijugador (hackathon). Hasta 4 jugadores por sala, código de 4 letras, chat, el anfitrión inicia.
El equipo habla español: textos del juego, comentarios y respuestas en español.

## Correr y probar
- `npm run dev`: servidor + página en http://localhost:3000 (node --watch).
- `npm test`: 101 pruebas de física, catálogo y cohete (tests/physics.js), 56 del mercado (tests/market.js),
  58 del armado y el despegue (tests/build.js, una partida "de escritorio" sin red), 85 del vuelo, el puntaje y el reintento
  (tests/flight.js, vuela partidas con semillas fijas) y las de jugadores simulados (tests/simulate.js).
  tests/helpers.js tiene ayudas comunes (hacer tareas del mundo sin red).
  Todas deben terminar en "TODO OK ✅".
  En simulate.js, `act(cliente, acción, aceptar)` espera la respuesta del servidor; pasa `aceptar` cuando
  otro jugador acaba de actuar (si no, puede tomar un estado viejo que venía en camino).
- Vista previa propia: config "verificar" (puerto 3200) en `.claude/launch.json` (el 3000 suele estar ocupado por `npm run dev`).
- Revisión de tipos (JS con JSDoc, sin compilar): usa el TypeScript de la copia vieja del proyecto:
  `node "C:/Users/regot/OneDrive/Desktop/Ad Astra/node_modules/typescript/bin/tsc" --allowJs --checkJs --noEmit --skipLibCheck --module nodenext --moduleResolution nodenext --target es2022 --lib es2022,dom,dom.iterable server/server.js tests/simulate.js tests/physics.js tests/market.js tests/build.js tests/flight.js js/main.js`
- Se puede previsualizar con la config "ad-astra-test" (puerto 3100) del launch.json de la carpeta vieja `Ad Astra`.

## Estructura (HTML/CSS/JS sin build, Node + Socket.IO)
- `js/shared.js`: contrato común navegador/servidor: eventos, reglas, colores, sombreros, `LOBBY_MAP` (piso, muebles, vestidor).
- `server/`: el servidor manda (valida y aplica acciones). rooms.js (salas, cuenta regresiva, anfitrión), lobby.js, chat.js, game.js.
- `js/`: main.js (pantallas), world.js (el mundo jugable), connection.js (socket + sesión), menu.js, lobby.js (sala dibujada en canvas), hud.js, chat.js, customize.js, character.js (sprite del astronauta), riso.js (tintas/tramas), game.js, sound.js.
- `css/styles.css`: sección 1 tokens; sección 4 lobby (dentro de `.lobby` se redefinen los tokens a papel y tinta).

## Estado del juego (hoja de ruta de 8 fases; visión completa en el "master prompt" del usuario)
Juego cooperativo de misiones espaciales, 4 roles (`ROLES` en shared.js): Ciencia, Comercio, Ingeniería, Vuelo.
- Fase 1 HECHA: rol exclusivo + Listo en el lobby (`startBlocker`), modo demo con 1 a 3 jugadores (`canActAs`:
  un rol sin dueño conectado lo maneja cualquiera), `id` de jugador estable, reconexión con `seatToken`
  (sessionStorage) o mismo navegador, el anfitrión recupera su puesto al volver, estado `{ version, data, secret }`
  (`secret` nunca sale del servidor), acciones con permisos por rol y rechazo con motivo (`state:rejected`).
- Fase 2 HECHA: la partida pasa por escenas (`state.data.scene`): `prologue` → `select` → `briefing` → `mission`.
  Historia sincronizada: el anfitrión pasa la página (`story:next`/`story:back`), los demás avisan `story:read`.
  Constelación con 3 misiones (bloqueada/disponible/en curso/completada en `state.data.campaign`, que se
  conserva en la sala entre despegues; el prólogo solo sale la primera vez). `mission:start` es del anfitrión.
- Archivos: `js/story.js` (textos), `js/art.js` (ilustraciones provisorias en riso; `IMAGES` para dibujos finales),
  `js/missions.js` (misiones, fichas y etapas), `js/game.js` (marco + cambia de pantalla según la escena),
  `js/narrative.js`, `js/constellation.js`. (La vieja `js/desk.js` se borró: la reemplazó el mundo jugable.)
- Fase 3 HECHA (sin interfaz, todo funciones puras compartidas navegador/servidor, unidades SI):
  `js/physics.js` (Tsiolkovski, empuje/peso, órbitas, Hohmann, ventanas, arrastre, batería),
  `js/catalog.js` (`PARTS`, rarezas `TIERS`, estados `CONDITIONS`, `resolvePart()` da los números reales de una
  versión), `js/rocket.js` (`analyzeRocket`, `simulatePlan`, `validateRocket` → critical/warnings/tips),
  `js/flightplans.js` (tramos lunares con Δv calculado), `js/blueprints.js` (cohete lunar de referencia).
  Un cohete = `[{ items: [pieza resuelta, ...] }, ...]`, etapas y piezas de abajo hacia arriba.
  Regla: constantes y fórmulas reales; motores "aproximados, clase X" (campo `like`); precios, rarezas,
  fallas y resistencia son valores de juego. No presentar nada inventado como dato real.
- Fase 4 HECHA: `state.data.economy` (presupuesto, `credits`, `inventory`, ofertas legales `offers`, mercado
  negro `black`, `requests`) se abre en `mission:start`. La verdad del mercado negro vive en
  `state.secret.vault` (`truth` por oferta, `items` por pieza comprada) y nunca se envía.
  `js/market.js` (reglas puras: `generateMarket(misión, semilla)`, vendedores, inspecciones, `knownVersion`,
  `trueItem`), `server/economy.js` (acciones `market:buy|sell|request`, `black:inspect|buy`; solo Comercio
  maneja dinero; se compra en las etapas market/build/validation), `js/marketview.js` (pantalla),
  `js/partinfo.js` (formato de números y columnas por tipo de pieza), `js/random.js` (azar con semilla).
  Las herramientas de etapa se registran en `TOOLS` de `js/desk.js` y se activan con `tool` en missions.js.
  El combustible todavía no se cobra: se cobrará al llenar tanques en la fase 5.
- Fase 5 HECHA: `state.data.rocket = { stages: [{ engines, core, mounted, fill }] }` (uids de la bodega; abajo → arriba).
  `js/assembly.js` (reglas puras de encaje: `canPlace`, un combustible por etapa, puntos de montaje, cápsula y
  cofia arriba; `toPhysicsStages()` lo convierte para js/rocket.js), `server/build.js` (acciones
  `build:place|move|remove|addStage|removeStage|fill|undo`, solo Ingeniería, en etapas build/validation),
  `js/builder.js` (pantalla: canvas, arrastre con punteros, bodega, estadísticas, revisión), `js/partart.js`
  (dibujos provisorios de piezas; `IMAGES` para los finales). Al avanzar desde Validación el servidor corre
  `validateRocket`: con errores críticos no se despega; si pasa, cobra el combustible. El historial de deshacer
  vive en `state.secret.undo`. Una etapa puede tener varias herramientas en pestañas (`tool: ['builder','market']`).
  Si la ventana de Claude está minimizada no hay capturas: para ver un canvas, mandarlo con `toBlob` a un
  receptor local temporal y leer el PNG.
- Fase 6 HECHA: `server/flight.js` vuela la nave tramo por tramo con sus números VERDADEROS (`state.secret.ship`,
  nunca se envía; lo público es `state.data.flight`). Acciones: `flight:burn {dv}` (Vuelo; error de guiado
  ±1,5 %, ±0,5 % con computadora avanzada, ×1,5 sin propulsores, ×2 sin señal), `flight:scan` (Ciencia, en
  superficie), `flight:power` (Ingeniería: normal/saving), `flight:proceed` (Vuelo, tramos sin Δv),
  `flight:resolve {option, role}` (emergencias: cada salida pide roles; reparar = Ingeniería + Comercio paga).
  Fallas: motor en cada encendido, antena tras la transferencia, patas al alunizar, espectrómetro al buscar;
  usan la probabilidad verdadera (defectos del mercado negro incluidos). Energía por tramo (horas y sol en
  js/flightplans.js; primero la sombra). Las etapas Vuelo/Superficie/Regreso solo avanzan con sus tramos
  hechos; si el vuelo falla se salta a Evaluación. Al volver con el Prisma: Luna completada y Marte disponible.
  Pantalla: `js/flightview.js` (mapa, panel por rol, telemetría, emergencias, resultado y lecciones).
  Balance comprobado: el cohete de referencia volado con cuidado vuelve 29 de 30 veces; pasándose 5 % por
  encendido, 0 de 30.
- Siguen: 7 evaluación con nota (S a D) y progreso, 8 misiones 2 y 3 (Marte aún no tiene etapas: la estrella
  aparece disponible pero dice "todavía no está construida").

## Mundo jugable (vigente: reemplazó la mesa de misión)
Regla del usuario: juego real, no menús. Solo mercado y constructor son menús (paneles dentro del mundo).
Cada rol hace cosas con las manos, la cooperación es necesaria y nadie espera sin hacer nada.
- `js/worldmaps.js`: mapas `station`, `ship`, `moon` (salas por rol, puertas, puestos con `x,y,w,h,height`),
  colisiones y `findPath` por puertas.
- `js/tasks.js` (compartido): `TASKS` por etapa y rol; tipos `tune|dial|timing|wires|order|switches|burnSim`
  (minijuegos), `carry` (llevar `count` objetos de `from` a `to`), `menu` (abre mercado o constructor), `auto`.
  `needs` encadena tareas, `perk` da una ventaja (`PERKS`), `shared` = cualquiera ayuda. `PREP`: preparativos
  antes de cada encendido; `JOBS`: trabajos con contador. Las tareas de un rol sin dueño son "opcionales".
- `server/world.js`: `task:done`, `carry:pick|drop|cancel`. `server/game.js`: ya NO existe `role:confirm`;
  `confirmed` se calcula de las tareas. `stage:advance` lo hace cualquiera con todo hecho (palanca de etapa);
  el despegue lo da Vuelo; en vuelo la etapa cambia sola.
- `server/flight.js`: `flight:burn {dv, aim, touchdown}`, `flight:prep`, `flight:scan {x, y}` (devuelve la
  distancia al Prisma; se ubica cruzando lecturas), `flight:dig`, `flight:load`, `flight:solar`.
- `js/world.js`: pantalla (movimiento con teclas o clic, E/Espacio usa el puesto, clic en un puesto camina y
  lo usa, HUD `.world-objectives` plegable, `.world-team`, `.world-flight`). Movimiento en vivo con `player:move`.
  En pantallas ≤760 px se esconden lo hecho y lo opcional (clase `.extra`).
- `js/worldart.js` (dibujo; `paintMoon` con trama suave), `js/minigames.js` (`playMinigame(kind)`),
  `js/pilotgames.js` (`playBurn`, `playLander`: `GRAVITY 6`, `PAR 140` ≈ 1,6× el mínimo, suave si caída < 10
  y costado < 7), `js/frame.js`. `js/flightview.js` acepta `{ readOnly: true }`.
- Probado en navegador: estación, tareas, minijuegos, mapas de nave y Luna, escaneo. FALTA probar de punta a
  punta sin atajos (perforar, cargar el Prisma, despegar de la Luna, emergencias con repuesto y reparación,
  reentrada, Evaluación, volver al lobby) y con 2 a 4 personas reales (verse caminar, cargar, pilotear;
  afinar el alunizaje con gente). Con el panel del navegador oculto el mundo se congela (sin rAF): hace falta
  la ventana a la vista.

## Pulido final (FINAL POLISH del usuario, vigente)
- Opciones: `js/settings.js` (localStorage `adastra.settings`, `getSettings/setSettings/onSettings`,
  `reducedMotion()`, `reducedEffects()`, `canvasDpr()`; `openSettings()` desde menú, ⚙ del lobby y barra de la
  partida). Cada opción está conectada: volúmenes (js/sound.js: canales master/música/efectos + música
  ambiental generada que arranca con la primera interacción), `walkSpeed` (lobby y mundo), `cameraFollow` y
  `cameraZoom` (mundo), `cameraShake`, `quality` (dpr de los lienzos), `textSize` (font-size de :root),
  `reduceMotion`/`reduceEffects` (html[data-motion|data-effects] en css sección 12). No agregar opciones que
  no hagan nada.
- Créditos: `js/credits.js` (`CREDITS` con los 5 nombres EXACTOS que pidió el usuario; no cambiarlos).
- Trajes por rol: `js/character.js` `drawAstronaut({ role })` + `ROLE_GEAR` (equipo dibujado encima del
  sprite del usuario, que no se toca). Sale de `player.role`: en el lobby no hay. Mundo, revelación de roles
  (retrato `plain` → `suited` al darse vuelta la carta) y resultados lo usan.
- Panel de tareas: botón `.objectives-toggle`, cuerpo `.objectives-body` con transición de grid 0fr/1fr,
  plegado muestra `.objectives-summary` (alerta o primera tarea pendiente); sessionStorage `adastra.objectivesCollapsed`.
- Historia: el botón de los no anfitriones dice SIGUIENTE (manda `story:read`; luego "✓ Esperando al equipo").
  Tarjeta de título al empezar, puntos de avance, viñeta y barrido del título.
- Puntaje: `server/score.js` (`scoreAction(antes, después, acción, actor, players)` envuelve `applyAction` en
  server/game.js; `data.score` = players/seen/crew/final; claves en `seen` evitan contar dos veces; precisión
  con `action.quality` 0..1 que mandan los minijuegos de js/minigames.js, `aim`/Δv de más en encendidos,
  `touchdown`, lecturas del escáner; bonos finales por rol; `final` con resumen, logros y errores).
  Pantalla `js/scoreview.js` (pestaña "Resultados", primera en la Evaluación). Pruebas en tests/flight.js §6.
- SOLO (menú): `session.solo = true` + createRoom; js/hud.js despega sola si el anfitrión está solo.
- Rediseñar y volver a volar: acción `mission:retry` (anfitrión, solo en debrief) → etapa build, `flight: null`,
  `attempt + 1`, se conservan cohete, bodega y créditos; `score.beforeLaunch` (foto al despegar) se restaura.
  Botón en Resultados y en la palanca. Pruebas en tests/flight.js §7. Vuelo y puntaje: 85 verificaciones.

## Actualización de experiencia (UPDATE MASTER PROMPT del usuario: tutoriales, cinemáticas, constructor animado, UI)
Orden pedido: 1 UI más simple → 2 tutoriales → 3 cinemáticas → 4 constructor animado → 5 pulido.
- P1 HECHA (parcial): mesa de misión con "Tu tarea", fila de equipo (`.team-chip`, clic = visto bueno) y barra fija
  con UNA acción principal (`.stage-confirm` / `.stage-next`, la principal lleva `.primary`); tareas de todos en
  `<details>`. Constructor: a la vista solo Δv vs misión, empuje/peso, masa, costo, resumen del plan y revisión;
  lo demás en "Ver detalles técnicos". Mercado: fichas `<details>` cerradas con "desde X cr" (se abren solas si
  alguien la pidió). Falta: sistema de botones unificado y feedback de éxito animado.
- P2 HECHA: tutoriales. `js/tutorial.js` (motor: panel que busca lugar libre sin tapar paneles abiertos ni lo
  resaltado, borde que late en `.tut-target`, pasos que esperan la acción con `waitFor`, saltar, biblioteca con
  repetir y "no mostrar más"; avance guardado en localStorage `adastra.tutorials`; cada quien ve los suyos, no
  sincroniza a otros) y `js/tutorials.js` (10 módulos: básico del lobby, misión, cooperar, mercado, mercado negro
  (solo Comercio), constructor, física, despegue, vuelo y emergencias; pasos con `roles` por rol).
  Botón "Tutoriales" en la barra de la partida y en Ajustes del lobby.
- P3 HECHA: cinemáticas. `js/narrative.js` (pantalla de cine: dos lienzos con fundido, cámara lenta por escena
  `camera: in|out|left|right|up`, texto que se escribe solo y se completa con clic/Espacio, `speaker`, `list` que
  aparece punto por punto; respeta "reducir movimiento"; el anfitrión puede saltar con `story:skip`, con
  confirmación). Informe de la Luna ampliado (cara oculta y repetidor, qué llevar). Ilustración nueva `relay`.
  `js/cinematic.js`: tomas cortas a pantalla completa al pasar a Vuelo, Superficie, Regreso, Evaluación (éxito o
  fallo) y al empezar la misión; solo visuales, se cierran solas o con clic.
- P4 HECHA: constructor animado (js/builder.js). Torre de ensamblaje con brazos por etapa y plataforma (`drawTower`,
  decorado). Tocar una pieza de la bodega la elige (`chosenHold`) y dibuja fantasmas en el lugar EXACTO donde
  encajaría en cada etapa (`findGhosts`: arma el cohete "como si" con withPart y mide), ✗ con motivo donde no;
  tocar el fantasma la pone. Animaciones (`trackChanges`): comparan el cohete del servidor con el cuadro anterior:
  pieza nueva entra volando con rebote y "clac", la movida vuela desde su lugar viejo, la quitada sale; nunca
  dibujan algo que no está instalado. Reemplazo atómico `build:replace {uid, with}` (js/assembly.js
  `replaceCheck`) con comparación ▲▼ en la ficha. Borde y nombre al pasar el mouse.
  Ojo al verificar: con el panel de navegador oculto no hay requestAnimationFrame; se puede simular con setTimeout.
- P5 (pulido): pendiente.

## Cambios pedidos después (vigentes)
- Roles AL AZAR: ya no se eligen en el lobby (se quitó `player:setRole`). Al terminar la cuenta regresiva,
  server/rooms.js `drawRoles` (Fisher-Yates con crypto) reparte un rol distinto a cada uno; con menos de 4, los
  que sobran quedan libres. Al volver al lobby se borran. Listo ya no pide rol. Las pruebas usan
  `createGameServer({ pickRoles })` para fijar quién es quién. Cinemática `js/rolereveal.js` al despegar
  (fila con cartas boca abajo → tu rol en grande → todos los roles), estilo "revelación de roles".
  En el lobby no hay NADA de roles (se quitaron el botón y el panel de la tarjeta de embarque).
- Cortes de conexión en el LOBBY: el lugar y el Listo se guardan `LOBBY_GRACE_MS` (20 s, js/shared.js); una cuenta
  regresiva en marcha se cancela. Antes se borraba el lugar y el jugador volvía sin Listo (el túnel corta seguido),
  y el anfitrión no podía despegar. El anfitrión ve el motivo en `.hud-why` sobre la tarjeta de embarque.
- Al reiniciar el servidor, quien cargue la página en ese instante se queda en "Cargando…": hay que recargar.
- Las 3 misiones empiezan desbloqueadas (`UNLOCK_ALL_MISSIONS = true` en js/missions.js). Marte y el Éxodo
  todavía no tienen etapas: al iniciarlas dice "todavía no está construida". Reglas del prompt: aprender haciendo, tutorial por rol, saltar/repetir, no adelantar a todo
  el equipo; texto tipo máquina de escribir que se completa con clic; animaciones que reflejan el estado REAL
  del servidor (nunca dibujar algo que no está instalado); conservar la identidad risográfica.

## Diseño actual del lobby
Sala de embarque de la estación, estilo risografía con las tintas del juego (azul #1f2d5c, coral #ff6b5b, dorado #f3b641,
turquesa) sobre papel #f4ecd9. Pieza central: tablero de salidas con casillas que giran (Puerta = código, Tripulación,
Estado; en la cuenta regresiva "DESPEGA 5…"). La nave acoplada afuera del ventanal enciende motores en la cuenta.
HUD = tarjeta de embarque (Puerta | Tripulación | Pública/Privada | Despegar). Botones: Personalizar, Reglas.
El astronauta (assets/sprites/astronaut.png) es dibujo del usuario: no cambiarlo sin que lo pida.

## Compartir y publicar
- Para jugar o compartir, NO usar `npm run dev`: se reinicia cada vez que cambia un archivo (OneDrive los toca
  solo), y cada reinicio da error 502 un instante y borra todas las salas. Usar `npm start`
  (config "jugar" del launch.json, puerto 3000) y el túnel con `--protocol http2`, que es más estable.
- Para compartir, arrancar `npm start` en el panel Terminal del usuario (run_in_terminal), NO con preview_start:
  la app apaga los servidores de vista previa al rato y el link da error 502.
- El servidor comprime los archivos de texto (gzip) y responde 304 si no cambiaron (ETag).
- Link temporal: `cloudflared tunnel --url http://localhost:3000` (el link cambia cada vez).
- Repositorio PÚBLICO: https://github.com/olvherrlo-arch/Ad-Astra (rama main). git del proyecto ya tiene
  nombre/correo; el inicio de sesión de GitHub quedó guardado en el administrador de credenciales de Windows,
  así que `git push` funciona. Hacer commit y push solo cuando el usuario lo pida.
- Link fijo: Render (`render.yaml`) desde ese repositorio (todavía no configurado).

## Forma de trabajar con este usuario
- Prefiere que actúes directamente; manda bocetos/imágenes como referencia de diseño.
- Después de cambios visuales: verificar en el navegador, correr `npm test` y la revisión de tipos, actualizar el README.
