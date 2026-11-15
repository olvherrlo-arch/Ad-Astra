# Ad Astra

Juego multijugador espacial: hasta 4 tripulantes esperan en la sala de embarque de la estación (el lobby),
se personalizan, chatean, y el anfitrión da la orden de despegar.
HTML, CSS y JavaScript sin compilar: **editas un archivo, recargas la página y ves el cambio.**

## Cómo correrlo

Necesitas [Node.js](https://nodejs.org) 20 o más nuevo. La primera vez:

```bash
npm install
```

Cada vez que quieras jugar o programar:

```bash
npm run dev
```

Abre **http://localhost:3000**. La terminal también muestra la dirección "En tu red" para tu equipo.

En VS Code también puedes presionar **F5**: arranca el servidor y abre el navegador.
No ejecutes con ▶ los archivos de `js/`: corren en el navegador, no en Node.

| Comando       | Qué hace                                                             |
| ------------- | -------------------------------------------------------------------- |
| `npm run dev` | Arranca el juego y se reinicia solo cuando cambias algo en `server/` |
| `npm start`   | Arranca el juego sin reinicio automático                             |
| `npm test`    | Prueba la física y después todo el juego con jugadores simulados (no necesita el juego abierto) |

Cambios en `css/`, `js/`, `assets/` o `index.html`: solo recarga la página.
Cambios en `server/` o en `js/shared.js` con `npm start`: detén el servidor (Ctrl+C) y vuelve a arrancarlo.

## Opciones y créditos

- **Options** (menú principal, ⚙ del lobby u **Opciones** en la partida): volumen general, música y efectos
  por separado, silenciar todo; velocidad al caminar, velocidad y acercamiento de la cámara, temblor de la nave;
  pantalla completa, resolución de los dibujos y tamaño del texto; reducir movimiento y reducir efectos de
  pantalla. Cada opción muestra su valor, hay **Restaurar valores** y **Volver**. Se guardan en este
  navegador y solo cambian tu juego.
- **Credits:** los créditos del equipo como al final de un videojuego.

## El lobby (la sala de embarque)

La sala está dibujada como un afiche impreso en risografía, con las tintas del juego (azul, coral, dorado y
turquesa). Afuera del ventanal espera la nave, acoplada a la estación.

- **Moverse:** <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> o flechas (8 direcciones), o clic/toque en el piso.
  Si haces clic detrás de un mueble, el astronauta lo rodea.
- **Personalizar:** acércate al vestidor (el casillero turquesa con los sombreros; se marca en dorado)
  y presiona **Personalizar** o <kbd>E</kbd>. Color (los ocupados aparecen con ✕) y sombrero (corona, cuernos, brote).
- **Tablero de salidas:** muestra la puerta (el código de sala), la tripulación y el estado
  (*Esperando*, *Listos*, y en la cuenta regresiva *Despega 5, 4, 3…*).
- **Chat:** botón de arriba a la derecha o <kbd>Enter</kbd>. Tiene chat rápido y un punto cuando hay mensajes nuevos.
- **Ajustes (⚙):** volumen, **Todas las opciones…**, controles, tutoriales y "Abandonar sala".
- **Tarjeta de embarque (abajo):** puerta (el ojo oculta el código, también en el tablero), tripulación
  (en rojo hasta llegar a 4), Pública/Privada y **Despegar**.

**El anfitrión** (★ junto a su nombre) además puede:

- Cambiar la sala a **Pública** (aparece en *Find a lobby* del menú) o **Privada** (solo con código).
- Cambiar las **reglas** en el vestidor → pestaña *Partida*. Todos las ven en vivo en el panel *Reglas*.
- **Expulsar** (puede volver con el código) o **Bloquear** (no puede volver) desde el chat → *Tripulación*.
- Presionar **Despegar** (con 4 jugadores): cuenta regresiva de 5 s; la nave enciende los motores.
  Si alguien entra o sale, se cancela.
- En la partida, **Volver al lobby**.

Si el anfitrión se va, el rol pasa a quien lleva más tiempo en la sala.

## Roles, Listo y la misión

- **Roles al azar:** en el lobby nadie elige rol. Al despegar, a cada quien le toca uno al azar (Ciencia, Comercio,
  Ingeniería o Vuelo) y una cinemática se lo revela: la tripulación en fila con cartas boca abajo, después tu rol en
  grande, y al final el de todos. En el lobby no aparece nada de roles.
- **Listo:** quien no es anfitrión marca **Listo**. El anfitrión puede **Despegar** cuando todos están listos.
- **Modo demo:** se puede despegar con 1 a 3 personas; en la misión, los roles libres los maneja cualquiera.
- **Prólogo:** la primera vez que una sala despega, la tripulación ve junta la historia como una cinemática
  (6 escenas): la ilustración entra con un fundido y una cámara lenta, y el texto se escribe solo (un clic o
  Espacio lo muestra entero). El anfitrión pasa con **Siguiente** (o las flechas ← →), puede volver con
  **Anterior** o **Saltar** la historia para todos; los demás presionan **Siguiente** cuando terminan de leer.
- **Tomas de cine:** al empezar la misión, al despegar, al llegar a la Luna, al volver y al terminar aparece una
  toma corta a pantalla completa. Se cierra sola o con un clic.
- **Constelación:** las tres misiones son tres estrellas. Toca una para ver su ficha (objetivo, duración,
  dificultad, equipo). Las tres están desbloqueadas, pero Marte y el Éxodo todavía no tienen contenido.
  El anfitrión presiona **Iniciar misión** y se lee el informe (4 páginas) antes de empezar.
- **La misión se juega caminando:** ver la sección *El mundo jugable* más abajo. No hay "visto bueno":
  cada rol queda listo cuando termina sus tareas.
- **Mercado (etapa 3):** se abre en la terminal de suministros del Almacén. La misión tiene 15.000 créditos. Todos ven el dinero y las ofertas; solo quien maneja
  Comercio compra. Los demás pueden **Pedir** una pieza y queda marcada. Cada pieza se vende en tres rarezas:
  la mejor rinde un poco más, falla menos y cuesta más. La pestaña **Bodega** muestra lo comprado y qué le
  falta a la nave para la misión.
- **Mercado negro:** solo lo ve Comercio. Tres vendedores con distinta confianza venden más barato, pero la
  ficha es "según el vendedor". Una inspección (básica o avanzada) muestra parte de la verdad; un defecto
  oculto o un vendedor que cobra y desaparece son riesgos reales. También hay gangas de verdad.
- **Constructor (etapas 4 y 5):** se abre en la consola de ensamblaje del Hangar. Quien maneja Ingeniería arma el cohete con las piezas compradas. Se arrastra
  una pieza de la bodega al cohete: cada etapa se marca en dorado si encaja o en coral si no, y dice por qué.
  También se puede elegir una etapa y usar **Poner**. Clic en una pieza puesta para moverla o quitarla.
  Hay **Deshacer**, zoom, y un control por etapa para cargar menos combustible. Los demás lo ven en vivo.
- **Ver dónde encaja:** toca una pieza de la bodega y en el cohete aparece, dorada y latiendo, el lugar exacto
  donde quedaría en cada etapa (✓), o por qué no entra (✗). Toca ese lugar para ponerla. La pieza llega
  volando desde la bodega y encaja con un "clac"; al quitarla, se suelta y sale. **Reemplazar…** (en la ficha
  de una pieza puesta) muestra las piezas que pueden ir en su lugar, con ▲ lo que mejora y ▼ lo que empeora.
- **Reglas de encaje:** cada etapa quema un solo combustible; el equipo se cuelga de puntos de montaje que
  traen los tanques y la cápsula; las patas necesitan un cuerpo; la cápsula y la cofia van arriba.
- **Números en vivo:** masa, empuje/peso, Δv frente a lo que pide la misión, energía, integridad y costo,
  más el plan de vuelo tramo por tramo. Pasa el mouse por un número para ver qué significa.
- **Revisión antes de despegar:** lo crítico impide despegar, las advertencias son un riesgo aceptado y las
  mejoras son opcionales. Al pasar de Validación a Vuelo se cobra el combustible.
- **Vuelo (etapas 6 a 8):** se vive dentro de la nave (ver *El mundo jugable*). **Vuelo** pilotea cada
  encendido a mano en el timón y el alunizaje en un minijuego; el guiado no es perfecto, así que quedarse corto
  pide otro encendido y pasarse gasta combustible que después falta. Detrás de la Luna no hay señal sin
  satélite repetidor, y los encendidos pierden precisión.
- **Emergencias:** un motor, la antena, las patas o el espectrómetro pueden fallar; las piezas del mercado
  negro con defectos ocultos fallan más. Se resuelven con las manos: buscar el repuesto en el pañol, llevarlo y
  repararlo (Comercio paga), o aceptar otra salida que piden ciertos roles.
- **Evaluación (etapa 9):** se abre la pantalla de **Resultados**: el resultado del equipo (puntos, objetivos
  cumplidos, lo mejor y las complicaciones) y una tarjeta por tripulante con su puntaje, sus acciones, su
  precisión en estrellas (solo si hubo algo medible), su aporte por área, sus mejores aportes y sus logros.
  Le siguen el informe del vuelo y el tablero. Volver con el Prisma completa la misión y desbloquea Life on Mars.
- **Puntaje:** lo calcula el servidor con lo que de verdad pasa en el juego: tareas terminadas, cajas
  entregadas, el armado y las compras (al despegar), cada encendido, el alunizaje, ubicar el Prisma,
  perforar, reparar, llevar repuestos… La precisión sale de datos medibles (tiempo con la aguja en la zona,
  errores en un minijuego, puntería y Δv de más en un encendido, cómo tocó el suelo, cuántas lecturas hicieron
  falta). Cada suceso cuenta una sola vez, todos ven el mismo puntaje y no se pierde al reconectarse. Los
  valores están pensados para que los cuatro roles tengan las mismas oportunidades (`server/score.js`).
- **Tutoriales:** la primera vez que llegas a algo nuevo (la sala, el mercado, el constructor, el vuelo…)
  aparece un panel corto que resalta la parte de la pantalla que explica. Algunos pasos te piden hacer la
  acción (elegir rol, abrir una ficha, poner una pieza, encender los motores) y esperan a que la hagas. Cada
  rol ve lo suyo. Se pueden saltar, y repetir desde el botón **Tutoriales** (en la partida, arriba; en el lobby,
  en Ajustes ⚙).
- **Trajes por rol:** en el lobby todos son el astronauta de siempre. Al repartirse los roles, cada uno se viste
  con el equipo de su rol: Ciencia (antena con sensor y visor turquesa), Comercio (bolso de carga dorado),
  Ingeniería (cinturón de herramientas y franja coral) y Vuelo (auriculares y franjas azules), con un parche
  en el pecho. Lo ven todos y vuelve igual al reconectarse.
- **Reconexión:** si recargas la página o se corta la red en plena misión, vuelves a tu lugar con tu rol.
  Mientras tanto, otro tripulante puede cubrirlo. Si cerraste la pestaña, entra otra vez con el código.

## El mundo jugable

La misión no es un menú: cada tripulante camina por un mundo 2D compartido y hace su parte con las manos.
Solo el **mercado** y el **constructor** son pantallas de menú.

- **Moverse:** <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> o flechas, o clic en el piso. Clic sobre un
  puesto camina hasta él y lo usa al llegar. Junto a un puesto, <kbd>E</kbd> o Espacio lo usa.
- **Tres lugares:** la **estación** (Laboratorio, Sala de misión, Simulador, Almacén y Hangar; cada sala es de
  un rol), la **nave** en vuelo (Motores, Bodega, Ciencia y Cabina) y el **lado oculto de la Luna**.
- **Tareas (arriba a la izquierda):** las tuyas, los puestos libres de roles sin dueño (opcionales) y en qué
  puedes ayudar. El botón ▾ la pliega: plegada muestra solo la tarea pendiente (o la alerta) más importante.
  Se recuerda mientras dure la pestaña. En pantallas angostas solo quedan tus tareas pendientes.
  **Tripulación (derecha):** qué hace cada rol y cuántas tareas le faltan.
- **Tipos de tarea:** minijuegos (afinar una señal, mantener una aguja en verde, soltar a tiempo, unir cables,
  ordenar maniobras, interruptores) y **cargar** objetos de un puesto a otro (cajas, muestras, el Prisma).
  Algunas tareas dan **ventajas** para el vuelo: zona del Prisma marcada, escáner calibrado, motores probados…
- **Avanzar:** cuando cada rol terminó lo suyo, cualquiera mueve la palanca de etapa. El despegue lo da Vuelo.
- **En vuelo:** antes de cada encendido hay **preparativos** opcionales (Ciencia fija la posición con el
  rastreador de estrellas, Ingeniería ajusta la mezcla, Comercio asegura la carga suelta). Vuelo enciende en el
  timón apuntando a mano.
- **En la Luna:** Vuelo posa el módulo (minijuego de alunizaje: el combustible de más se paga en el regreso).
  Ciencia escanea en distintos lugares y cruza las distancias para ubicar el Prisma, Ingeniería perfora,
  Comercio lo carga hasta el módulo lunar y Vuelo despliega el panel solar de campo.

## La física y las piezas

El motor de cálculo lo usan el mercado, el constructor y el vuelo.

- `js/physics.js`: ecuación del cohete, empuje/peso, gasto de combustible, órbitas, transferencias,
  ventanas de lanzamiento, arrastre y baterías. Todo en unidades del Sistema Internacional.
- `js/catalog.js`: las piezas (`PARTS`), sus rarezas (común → legendaria), calidad y estado (nueva, usada,
  dañada, reparada). `resolvePart()` da los números reales de una versión concreta.
- `js/rocket.js`: dado un cohete armado, calcula masa, empuje/peso, Δv, energía, integridad y precio;
  vuela el plan "en papel" y revisa si puede despegar (errores críticos, advertencias y recomendaciones).
- `js/flightplans.js`: los tramos del viaje a la Luna, con el Δv de cada uno calculado a partir de las órbitas.
- `js/blueprints.js`: un cohete lunar de referencia hecho con piezas comunes.

**Qué es real y qué no**

| Tipo | Qué incluye |
| ---- | ----------- |
| Real | Constantes físicas (gravedad estándar, masa y radio de la Tierra, la Luna, Marte y el Sol) y las fórmulas |
| Simplificado | Órbitas circulares en un mismo plano, un cuerpo a la vez, atmósfera exponencial, etapas que se queman de a una |
| Estimado | Pérdidas al subir a órbita (1 600 m/s) y margen de alunizaje (10 %); motores y tanques "del orden de" motores reales, no fichas oficiales |
| De juego | Precios, rarezas, probabilidades de falla, resistencia de las piezas, masa de la cápsula |
| Ficción | Aztlán, el Prisma y su poder |

## Carpetas

```
ad-astra/
├── index.html          La página
├── css/styles.css      Todo el diseño (colores y fuentes al inicio)
├── js/                 Lo que corre en el navegador
│   ├── main.js         Qué pantalla mostrar: menú → lobby → partida
│   ├── connection.js   Conexión con el servidor y datos de la sesión
│   ├── menu.js         Menú principal (PLAY, OPTIONS, CREDITS, salas públicas)
│   ├── lobby.js        La sala de embarque: dibujo, muebles, tablero, ventanal, movimiento
│   ├── riso.js         La "imprenta": tintas, tramas de puntos y grano de papel
│   ├── hud.js          Lo que va encima de la sala: tarjeta de embarque, Reglas, chat, ajustes
│   ├── customize.js    Ventana de Personalizar: color, sombrero y reglas
│   ├── chat.js         Chat (con moderación para el anfitrión)
│   ├── character.js    Dibuja al astronauta, su color y sombreros
│   ├── sound.js        Efectos de sonido y música ambiental (generados, sin archivos)
│   ├── settings.js     Opciones de cada jugador (audio, juego, pantalla, accesibilidad)
│   ├── credits.js      Pantalla de créditos
│   ├── scoreview.js    Pantalla de resultados de la misión
│   ├── game.js         La partida: marco y cambio de pantalla según la escena
│   ├── narrative.js    Historia página por página (prólogo e informes)
│   ├── constellation.js  Selector de misiones
│   ├── world.js        El mundo jugable: movimiento, puestos, HUD, mercado y constructor en paneles
│   ├── worldmaps.js    Mapas de la estación, la nave y la Luna (salas, puertas, puestos, caminos)
│   ├── worldart.js     Dibujo de los mapas y los puestos
│   ├── tasks.js        Tareas por rol y etapa, ventajas y preparativos de vuelo (también las usa el servidor)
│   ├── minigames.js    Los minijuegos de las tareas
│   ├── pilotgames.js   Encendido a mano y alunizaje
│   ├── frame.js        Marco común de las ventanas de minijuego
│   ├── marketview.js   Mercado, mercado negro y bodega
│   ├── builder.js      Constructor de cohetes
│   ├── flightview.js   El vuelo: mapa, paneles por rol, emergencias y resultado
│   ├── partart.js      Dibujos de las piezas
│   ├── assembly.js     Reglas de armado (también las usa el servidor)
│   ├── market.js       Reglas del mercado (también las usa el servidor)
│   ├── catalog.js, physics.js, rocket.js, flightplans.js, blueprints.js   Piezas y cálculos
│   ├── art.js          Ilustraciones de la historia
│   ├── story.js        Textos de la historia (también los usa el servidor)
│   ├── missions.js     Misiones, fichas y etapas (también los usa el servidor)
│   └── shared.js       Reglas, eventos, roles, colores, sombreros y mapa (también los usa el servidor)
├── assets/
│   ├── sprites/astronaut.png   6 cuadros de caminata (de tu hoja de dibujo)
│   ├── images/hero.png         Personaje del menú
│   ├── icons/star.svg
│   └── backgrounds/
├── server/             Lo que corre en el servidor
│   ├── server.js       Arranca todo y entrega la página
│   ├── rooms.js        Salas: entrar, salir, salas públicas, cuenta regresiva
│   ├── lobby.js        Movimiento, personalización y poderes del anfitrión
│   ├── chat.js         Mensajes del chat
│   ├── game.js         Las reglas de la partida: escenas, etapas y permisos
│   ├── economy.js      Presupuesto, compras y bodega
│   ├── build.js        Armado del cohete
│   ├── world.js        Tareas hechas y objetos que se cargan
│   ├── score.js        Puntaje individual y resumen final
│   └── flight.js       El vuelo: encendidos, energía, escaneo, perforación y emergencias
├── tests/              physics, market, build, flight (con el puntaje) y simulate (jugadores simulados)
└── render.yaml         Cómo se publica en Render (link fijo)
```

## ¿Qué archivo toco?

| Quiero…                                          | Archivo                                              |
| ------------------------------------------------ | ---------------------------------------------------- |
| Agregar o cambiar una pieza                      | `js/catalog.js` → `PARTS`                            |
| Cambiar cuánto mejora cada rareza o estado       | `js/catalog.js` → `GRADE` y `CONDITIONS`             |
| Cambiar los tramos del viaje o sus pérdidas      | `js/flightplans.js`                                  |
| Cambiar el presupuesto de una misión             | `js/missions.js` → `budget`                          |
| Duración, luz y señal de cada tramo del viaje     | `js/flightplans.js`                                  |
| Precisión, fallas y costos de reparación en vuelo | `server/flight.js` → `GUIDANCE` y constantes de arriba |
| Qué pieza encaja dónde (ranuras, puntos de montaje) | `js/catalog.js` → `FITTING` y `js/assembly.js`    |
| Poner el dibujo final de una pieza               | Guarda la imagen en `assets/parts/` y agrégala en `js/partart.js` → `IMAGES` |
| Vendedores, inspecciones y novedades del mercado | `js/market.js` → `SELLERS`, `INSPECTIONS`, `MARKET_EVENTS` |
| Cómo se muestra una pieza (columnas, formatos)   | `js/partinfo.js`                                     |
| Cambiar qué piezas exige una misión              | `js/missions.js` → `requirements`                    |
| Textos y pasos de los tutoriales                 | `js/tutorials.js`                                    |
| Cambiar los textos del prólogo o del informe     | `js/story.js`                                        |
| Poner un dibujo final en la historia             | Guarda la imagen en `assets/story/` y agrégala en `js/art.js` → `IMAGES` |
| Cambiar la ficha de una misión o sus etapas      | `js/missions.js`                                     |
| Las pantallas de la partida                      | `js/narrative.js`, `js/constellation.js`, `js/world.js` (las elige `js/game.js`) |
| Las tareas de cada rol y etapa                   | `js/tasks.js` → `TASKS`, `PERKS`, `PREP`           |
| Dónde están las salas y los puestos              | `js/worldmaps.js`                                    |
| Dificultad del alunizaje                         | `js/pilotgames.js` → `playLander` (`GRAVITY`, `PAR`, `SOFT_DOWN`) |
| Cómo se ve la Luna o una sala                    | `js/worldart.js` (`paintMoon`, `paintIndoor`)        |
| Programar las reglas del juego                   | `server/game.js` → `isGameAction` y `applyAction`    |
| Cambiar las reglas que elige el anfitrión        | `js/shared.js` → `GAME_SETTINGS`                     |
| Por dónde no se puede caminar (muebles), el piso | `js/shared.js` → `LOBBY_MAP`                         |
| Cambiar la sala (ventanal, tablero, alfombra)    | `js/lobby.js` → `ROOM`                               |
| Cambiar cómo se dibuja un mueble                 | `js/lobby.js` → `FURNITURE`                          |
| Agregar o mover muebles                          | `js/shared.js` → `LOBBY_MAP.crates` (+ `FURNITURE`)  |
| Lo que dice el tablero de salidas                | `js/lobby.js` → `boardTexts`                         |
| Las tintas de la sala                            | `js/riso.js` → `INK`                                 |
| Colores y letra de la interfaz del lobby         | `css/styles.css` → `.lobby` (sección 4)              |
| Agregar colores de jugador                       | `js/shared.js` → `PLAYER_COLORS`                     |
| Agregar sombreros                                | `js/shared.js` → `HATS` y `js/character.js` → `HAT_DRAWERS` |
| Cambiar el sprite del astronauta                 | Reemplaza `assets/sprites/astronaut.png` (ver `js/character.js`) |
| Cambiar cuántos jugadores se necesitan / caben   | `js/shared.js` → `MIN_PLAYERS_TO_START`, `MAX_PLAYERS` |
| Cambiar la cuenta regresiva                      | `js/shared.js` → `COUNTDOWN_SECONDS`                 |
| Frases del chat rápido                           | `js/chat.js` → `QUICK_CHAT`                          |
| Sonidos                                          | `js/sound.js`                                        |
| Colores, fuentes o tamaños de la interfaz        | `css/styles.css` (sección 1)                         |
| Nombres del equipo en créditos                   | `js/credits.js` → `CREDITS`                          |
| Opciones del jugador                             | `js/settings.js` → `DEFAULT_SETTINGS` y `SECTIONS`   |
| Cuánto vale cada cosa en el puntaje              | `server/score.js` → `POINTS`                         |
| Equipo de cada rol en el traje                   | `js/character.js` → `ROLE_GEAR`                      |

## Cómo funciona el juego

1. El jugador hace algo en `js/game.js` → `sendAction({ type: 'mover', ... })`.
2. El servidor lo revisa en `server/game.js` (`isGameAction`) y calcula el nuevo estado (`applyAction`).
3. El servidor envía el estado nuevo a todos, y cada `js/game.js` lo redibuja con `on('state', ...)`.

El navegador nunca cambia el estado del juego por su cuenta: así todos ven lo mismo y nadie hace trampa.
En el lobby, cada uno mueve a su astronauta y el servidor solo revisa que no salga de la sala.

## Jugar con otras personas

- **Misma red WiFi u hotspot:** comparte la dirección "En tu red" que muestra la terminal
  (por ejemplo `http://172.20.10.4:3000`) y el código de sala.
- **Desde cualquier lugar:** arranca el juego con `npm start` (no con `npm run dev`) y abre otra terminal:

  ```bash
  cloudflared tunnel --protocol http2 --url http://localhost:3000
  ```

  `npm run dev` se reinicia solo cada vez que cambia un archivo, y como la carpeta está en OneDrive eso pasa
  sin que toques nada: cada reinicio da un error un instante y borra las salas abiertas.

  Comparte la dirección `https://….trycloudflare.com` que aparece. Cambia cada vez que reinicias el túnel.
  Para instalar cloudflared: `winget install Cloudflare.cloudflared`.

`localhost` solo funciona en tu propia computadora: no lo compartas.

## Publicarlo con un link fijo (GitHub + Render)

Así el juego queda en internet aunque tu computadora esté apagada.

1. **Subir a GitHub** (una sola vez). Con [GitHub Desktop](https://desktop.github.com):
   *File → Add local repository* → elige esta carpeta → escribe un mensaje → *Commit to main* → *Publish repository*.
   `node_modules` no se sube (está en `.gitignore`); Render lo instala solo.
2. **Publicar en Render** (una sola vez). En [render.com](https://render.com), entra con tu cuenta de GitHub:
   *New → Blueprint* → elige el repositorio `ad-astra` → *Apply*. Render usa `render.yaml`.
3. Render te da un link fijo, por ejemplo `https://ad-astra.onrender.com`. Ese es el que compartes.

Después, cada vez que alguien del equipo sube cambios a GitHub (*Commit* → *Push origin*), Render publica la versión nueva sola.

En el plan gratis, si nadie entra por unos 15 minutos el servidor se duerme: la siguiente persona espera unos 30–50 s
y las salas abiertas se borran.

## Limitaciones

- Las salas viven en memoria: si reinicias el servidor, se borran.
- Si recargas la página, entras como jugador nuevo.
- Bloquear usa un identificador guardado en el navegador: alguien decidido puede evitarlo borrando sus datos.
- SOLO dice "Próximamente": conéctalo en `js/menu.js` cuando exista.
- En celular la sala se ve mejor con el teléfono en horizontal.
