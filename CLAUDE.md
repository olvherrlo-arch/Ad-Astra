# Ad Astra: guía para Claude

Juego multijugador (hackathon). Hasta 4 jugadores por sala, código de 4 letras, chat, el anfitrión inicia.
El equipo habla español: textos del juego, comentarios y respuestas en español.

## Correr y probar
- `npm run dev`: servidor + página en http://localhost:3000 (node --watch).
- `npm test`: 101 pruebas de física, catálogo y cohete (tests/physics.js), 56 del mercado (tests/market.js),
  54 del armado y el despegue (tests/build.js, una partida "de escritorio" sin red) y 84 con jugadores
  simulados (tests/simulate.js). Las cuatro deben terminar en "TODO OK ✅".
  En simulate.js, `act(cliente, acción, aceptar)` espera la respuesta del servidor; pasa `aceptar` cuando
  otro jugador acaba de actuar (si no, puede tomar un estado viejo que venía en camino).
- Vista previa propia: config "verificar" (puerto 3200) en `.claude/launch.json` (el 3000 suele estar ocupado por `npm run dev`).
- Revisión de tipos (JS con JSDoc, sin compilar): usa el TypeScript de la copia vieja del proyecto:
  `node "C:/Users/regot/OneDrive/Desktop/Ad Astra/node_modules/typescript/bin/tsc" --allowJs --checkJs --noEmit --skipLibCheck --module nodenext --moduleResolution nodenext --target es2022 --lib es2022,dom,dom.iterable server/server.js tests/simulate.js tests/physics.js tests/market.js tests/build.js js/main.js`
- Se puede previsualizar con la config "ad-astra-test" (puerto 3100) del launch.json de la carpeta vieja `Ad Astra`.

## Estructura (HTML/CSS/JS sin build, Node + Socket.IO)
- `js/shared.js`: contrato común navegador/servidor: eventos, reglas, colores, sombreros, `LOBBY_MAP` (piso, muebles, vestidor).
- `server/`: el servidor manda (valida y aplica acciones). rooms.js (salas, cuenta regresiva, anfitrión), lobby.js, chat.js, game.js.
- `js/`: main.js (pantallas), connection.js (socket + sesión), menu.js, lobby.js (sala dibujada en canvas), hud.js, chat.js, customize.js, character.js (sprite del astronauta), riso.js (tintas/tramas), game.js, sound.js.
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
  `js/narrative.js`, `js/constellation.js`, `js/desk.js` (mesa de misión: etapas + un escritorio por rol).
  Las etapas tienen `tools: false`: por ahora cada rol solo da el visto bueno y el anfitrión avanza.
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
- Siguen: 6 vuelo, 7 evaluación y progreso, 8 misiones 2 y 3.
  No marcar una misión como completada hasta la fase 7.

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
- Link fijo: GitHub + Render (`render.yaml`). La carpeta ya es repo git con todo en stage, sin commits:
  git no tiene nombre/correo; el usuario hará el primer commit y la publicación con GitHub Desktop.

## Forma de trabajar con este usuario
- Prefiere que actúes directamente; manda bocetos/imágenes como referencia de diseño.
- Después de cambios visuales: verificar en el navegador, correr `npm test` y la revisión de tipos, actualizar el README.
