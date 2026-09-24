# LIFE//SIM

Vertical slice 0.1 — base jugable de un simulador de vida 2D cenital.

## Concepto

El jugador controla físicamente a su personaje dentro de una ciudad. El mapa no
es decoración: es la interfaz del simulador. Si quieres estudiar, vas al centro
de estudios; si quieres descansar, vuelves a casa; si quieres cambiar de barrio,
bajas al metro y pagas el billete.

Dos distritos conectados por la Línea 2: **Vallesco**, el primer barrio completo, y
**Ribera Norte** (barrio viejo junto al canal, con plaza de mercado y un bar con
mesas fuera). En Vallesco se puede pasar un día entero: tu piso, el metro, un
gimnasio, la cafetería, una tienda de ropa, un súper, un restaurante y una planta
de oficinas, rodeados de comercios y bloques de vecinos.

A largo plazo la idea es que tiempo, dinero, energía y atención sean recursos
limitados, de modo que cada decisión tenga coste de oportunidad y cada partida
derive en una trayectoria vital distinta. De esa economía sólo existe todavía un
punto: el billete de metro. Es deliberado — un único sitio donde el dinero y el
reloj significan algo, para probar la idea sin abrir la puerta al scope creep.

## Stack

| Pieza | Elección | Motivo |
|---|---|---|
| Motor | Phaser 3 (3.90) | Arcade physics y escenas, sin traer un editor completo. |
| Lenguaje | TypeScript (`erasableSyntaxOnly`) | Tipado estricto, sin sintaxis que sólo entienda `tsc`. |
| Build | Vite 8 | Arranque en frío rápido y HMR. |
| UI | HTML + CSS | HUD y diálogo nítidos a cualquier zoom, fuera del canvas. |
| Persistencia | `localStorage` | Detrás de una interfaz, sustituible sin tocar el juego. |

Sin React, sin backend, sin dependencias de arte: **todas las texturas se
dibujan por código**.

## Requisitos

- Node.js 20 o superior (probado con 24.19)
- Un navegador moderno

## Instalación

```bash
npm install
```

## Ejecutar

```bash
npm run dev      # servidor de desarrollo en http://localhost:5173
npm run build    # tsc + bundle de producción en dist/
npm run preview  # sirve dist/
```

## Controles

| Tecla | Acción |
|---|---|
| `W` `A` `S` `D` o flechas | Caminar |
| `E` | Interactuar (hablar, entrar, salir) y avanzar diálogo |
| `Espacio` / `Intro` | Avanzar diálogo |

Cuando algo es interactuable aparece un indicador `E` sobre la cabeza del
personaje.

## Arquitectura

Capas separadas a propósito:

```
Datos        data/locations.ts, data/npcs.ts     qué existe en el mundo
Estado       state/GameState.ts                  qué es cierto ahora
Lógica       systems/*                           cómo cambia
Render       scenes/*, entities/*, world/*       cómo se ve
Persistencia systems/SaveSystem.ts               cómo sobrevive
UI           ui/HUD.ts, ui/DialogueBox.ts        qué se le cuenta al jugador
```

Tres decisiones que conviene entender antes de tocar nada:

**1. Una sola `WorldScene` para todas las localizaciones.** No hay
`InteriorScene`. Calle, piso y cafetería son el mismo código alimentado por un
`LocationDef` distinto. Añadir un sitio nuevo es añadir una entrada en
`data/locations.ts`; no hay ni un `if (building === 'home')` en el proyecto.

**2. Puertas y personas son el mismo tipo de interacción.** Ambas son
`Interactable`, ambas responden a `E`, ambas usan el mismo indicador. Por eso
cobrar el billete de metro fueron cuatro líneas y dos campos opcionales en
`PortalDef`, no un sistema aparte. Cuando una puerta deba cerrarse por horario,
el sitio donde ponerlo ya existe y es único.

**3. El HUD vive en el DOM, no en el canvas.** Texto nítido a cualquier zoom,
responsive gratis, y las Scenes no acumulan responsabilidades de interfaz.

Los sistemas se inyectan por constructor (`src/services.ts`). No hay singletons
ni acceso global al estado.

## Sistemas implementados

- **Movimiento** — velocidad normalizada en diagonal, cuerpo de colisión
  reducido a los pies para poder pasar por detrás de árboles y farolas.
- **Cámara** — seguimiento suave con límites de mapa. El zoom se ajusta por
  localización: sube en enteros hasta cubrir la ventana (tope 5) y, si el mapa
  sigue sin llenarla, encuadra centrado en lugar de pegarse a una esquina.
- **Colisiones** — `solidMask` (en `LocationSystem`) decide qué tile es sólido:
  terreno, huella de edificio menos su puerta y fila base de cada prop. De ahí
  salen rectángulos agrupados (`solidRects`): 144 cuerpos en todo el barrio y
  menos juntas en las que engancharse. La misma máscara valida el mundo y la
  recorre `npm run check`.
- **Localizaciones** — registro validado en arranque: una rejilla mal escrita o
  un portal que apunte a un spawn inexistente falla ahí, no como un agujero
  invisible en el suelo.
- **Barrio Vallesco** — dirección A de `design/barrio/` (aprobada en
  `direction-approved.md`): Calle Mayor peatonal y comercial al norte, una
  avenida con tráfico que sólo se cruza por dos pasos de cebra, la parte
  residencial al sur y la plazuela del metro a diez pasos de casa; la plaza con
  fuente y el gimnasio detrás; un parque con pista junto a la vía. 76×56 tiles:
  cruzarlo a pie son unos 16 s reales (32 min de juego).
- **Edificios** — los del barrio son `BuildingDef` (`data/vallesco.ts`), no
  caracteres de rejilla: estilo, huella, fachada norte o sur, una o dos plantas
  y puerta. Si tiene interior, `LocationSystem` genera su portal y el spawn de
  delante con el mismo id, así que salir de un interior siempre deja frente a su
  puerta. `world/BuildingArt.ts` hornea fachada, tejado, rótulo e instalaciones
  del tejado en la textura del suelo; cada local se reconoce por fachada e icono
  (mancuerna, taza, percha, cesta, cubiertos, cruz, tijeras…), no por un texto
  que a 16 px no se leería. Los locales sin interior tienen puerta dibujada y
  ningún portal: no hay afordancia vacía.
- **Puntos y grafo de peatones** — cada localización puede declarar `points`
  con nombre y tipo (`entrance`, `exit`, `edge`, `wait`, `seat`, `meet`,
  `interact`, `work`, `path`) y `links` rectos entre ellos, validados al
  arrancar. `systems/Navigation.ts` da `findPoint`, `pointsOfKind` y `route`:
  un NPC futuro pide un destino (`CAFE_TABLE_01`, cualquier `seat`) y camina el
  grafo, sin rutas escritas en el personaje. En desarrollo:
  `lifesim.route('HOME_ENTRANCE', 'GYM_ENTRANCE')`.
- **Señalización** — al llegar a un sitio, su nombre aparece bajo el HUD y se
  va solo; delante de una puerta, el aviso dice a dónde lleva y, si cuesta algo,
  cuánto.
- **Una sola forma de interactuar** — personas, puertas y cosas que se miran son
  el mismo `Interactable` de `WorldScene`: la E abre un diálogo, cruza un portal
  o muestra una línea. Un local sin interior lleva su texto en `inspect`; un
  cartel suelto va en `inspects` de la localización. No hay código por sitio.
- **Movimiento ambiental** — `world/Ambience.ts`, sacado de los datos: coches por
  los dos carriles de la avenida (`traffic`) que frenan ante cualquier peatón de
  su carril y guardan distancia; el chorro de la fuente (`PropDef.ambient`), quieto
  con movimiento reducido; y las puertas de cristal con interior, que se abren al
  acercarse (140 ms) y se cierran despacio (260 ms). El resto del barrio está
  quieto a propósito.
- **Lugares** — `data/places.ts` da un id estable a cada vivienda, negocio,
  transporte y espacio público, con tipo, etiquetas, aforo y horario.
  `systems/Places.ts` resuelve el resto desde edificios y puntos
  (`placeInfo('cafe')`: entradas, salidas, puntos de interacción, dónde
  aparecen y a dónde van los NPC). Ahí se atarán `npcId → residenceId`,
  `npcId → workplaceId` y `eventId → placeId`.
- **Rutas entre puertas** — `worldRoute(desde, hasta)` devuelve los tramos por
  localización: salir del interior, cruzar la calle por el grafo y entrar en el
  destino. En interiores recorre la cuadrícula esquivando muebles y NPC quietos.
  `npm run check` lo prueba con cinco rutinas de un día entero.
- **Diálogo** — conversación lineal que no sabe nada de cómo se pinta. Bloquea
  el movimiento y pausa el reloj mientras está abierto.
- **Cartelería** — las bocas de metro llevan el rótulo `METRO` dibujado con una
  fuente de 5x7 px hecha a mano; dentro, el muro del fondo lleva plano de línea
  y carteles. El resto de señalética es abstracta a propósito: a 16 px por tile
  una palabra larga no se lee, y fingir que sí es peor que no ponerla.
- **Viaje** — un portal puede llevar `fare` y `minutes`. La puerta de casa es
  gratis; el tren de la Línea 2 cuesta €2 y 15 minutos de reloj. El coste se
  muestra **antes** de pulsar E, y si no llega el dinero el torniquete lo dice y
  no te deja pasar.
- **Metro vivo** — las estaciones tienen vestíbulo, torniquetes, andén y vía, y
  un tren con máquina de estados real (`APPROACHING → ARRIVING → STOPPED →
  DOORS_OPENING → BOARDING → DOORS_CLOSING → DEPARTING → AWAY`). Frena con curva
  `v = √(2·a·d)` para detenerse justo en la marca. Las puertas se derivan del
  estado, así que no pueden abrirse en marcha. Sólo se puede subir en una puerta
  con el tren en el andén; si llegas en tren, el tren sigue ahí al bajar.
  Pasajeros anónimos (de 1 a 11 según la hora; un pool que se recicla, sin crear
  ni destruir) entran, esperan, reaccionan al tren, suben o bajan y se van, cada
  uno con su propio ritmo. Marco patrulla el andén de Vallesco (`IDLE / PATROL /
  OBSERVE / RETURN_TO_POSITION`) y se puede hablar con él mientras camina. Todo
  el ritmo está en `config/metro.ts`; con `debug` (activo sólo en desarrollo)
  aparece un panel con el estado del tren, la siguiente llegada, el evento y el
  estado de cada NPC. `npm run check` simula cuatro ciclos completos del tren.
- **Metro dinámico** — rutina + probabilidad + contexto, sin guion.
  `systems/MetroDaily.ts` (puro, sin Phaser) genera cada día un
  `MetroDailyState` con semilla del día: nivel base de afluencia, frecuencia,
  probabilidad de retraso, seguridad, perfil de pasajeros, ambiente y cuánto
  ocurre. El mismo día es siempre el mismo día; si sale casi calcado a los
  anteriores, se vuelve a tirar (de forma determinista). La hora del reloj
  mueve la afluencia por franjas (`HOUR_BANDS`: rampa, punta, mediodía, comida,
  tarde, noche; más suave en fin de semana) entre `VERY_LOW` y `RUSH_HOUR`, que
  deciden cuánta gente hay, cuánta baja y cuánta sube. Siete arquetipos
  (COMMUTER, STUDENT, TOURIST, DISTRACTED, RUSHED, CALM, ELDERLY) cambian
  velocidad, sitio preferido, móvil, prisa, prioridad al subir y reflejos; de
  ahí salen solos quien corre, quien pierde el tren o quien deja salir. Los que
  esperan miran el móvil, las vías o un cartel, dan unos pasos, se sientan o
  charlan. Vigilancia de 0 a 2 (Marco, Iker, Rocío), fija o de ronda. Retrasos
  pequeños y acotados. Microeventos ponderados por rareza, escalados por la
  afluencia y con calma obligatoria después; megafonía según el contexto.
  `npm run simulate [días]` recorre días completos con el mismo código.
- **Eventos de viaje** — `systems/MetroEventManager.ts` (puro, sin Phaser) decide
  al subir al tren si el trayecto trae algo, y la estación de llegada lo cuenta.
  Casi nunca pasa nada (~15 % de los viajes). Cada evento de
  `data/metroEvents.ts` declara rareza (`ambient`, `interactive`, `important`,
  `exceptional`), función (WORLD_BUILDING, CAREER…), probabilidad por viaje,
  cooldown en días, condiciones (hora, laborable, afluencia, destino, dinero,
  flags de decisiones previas, afinidad con un personaje), efectos y
  continuaciones. Encima, `METRO_EVENT_RULES`: al menos un viaje tranquilo
  tras cualquier evento y 20 h entre dos que no sean ambientales. Las
  decisiones se eligen con 1–3 y el texto nunca enseña cifras. Los efectos sólo
  tocan lo que existe: dinero, energía (el "estrés" de un mal viaje) y minutos
  de reloj; el resto queda en memoria (`eventsSeen`, `choicesMade`,
  `importantNPCsMet`, `eventFlags`, `eventCooldowns`, continuaciones
  programadas), que se guarda con la partida. Dos cadenas de ejemplo: devolver
  una cartera → Amparo te reconoce semanas después → una oportunidad en el
  mercado; y Olga, que puede acabar en un contacto profesional. En desarrollo,
  la consola tiene `lifesim.forceEvent(id)` (próximo viaje),
  `lifesim.listAvailableEvents(destino?)`, `lifesim.inspectEventHistory()` y
  `lifesim.resetMetroEvents()`. `npm run simulate:events [partidas] [días]`
  simula años de viajes y falla si se rompen frecuencias, condiciones,
  cooldowns, registro de decisiones o cadenas.
- **Tiempo** — día/hora/minuto con acumulador independiente del framerate.
  `GAME_MINUTES_PER_REAL_SECOND = 2` (una hora de juego cada 30 s reales). El
  delta por frame está acotado para que volver de otra pestaña no salte horas.
- **Estado** — `GameState` emite `change` sólo cuando cambia algo que el HUD
  muestra; posición y orientación se escriben cada frame sin emitir.
- **Arte procedural** — `world/TextureFactory.ts` dibuja cada tile, prop y
  personaje a partir de la paleta de `config/constants.ts`. Cambiar la dirección
  cromática del juego es cambiar ese objeto.

## Guardado

Autoguardado cada 10 segundos, al cambiar de localización y al cerrar la
pestaña. El HUD muestra un `PARTIDA GUARDADA` discreto al escribir.

Persiste día, hora, minuto, dinero, energía, localización, posición,
orientación y la memoria de eventos de viaje (una partida anterior sin ella
carga con la memoria vacía). Si un mapa cambió y la posición guardada cae
dentro de algo, se aparece en la entrada de esa localización. Al cargar, el archivo se valida campo a campo: si la versión no
coincide o la forma es incorrecta, se descarta y empieza partida nueva en lugar
de arrancar con datos corruptos.

`localStorage` está detrás de la interfaz `SaveStorage`. Migrar a IndexedDB o a
un backend es implementar esa interfaz y pasarla al constructor de `SaveSystem`.

Para empezar de cero: borra la clave `lifesim.save` en `localStorage`.

## Estructura del proyecto

```
src/
  main.ts                 arranque, inyección de sistemas, ciclo de vida
  services.ts             contrato de sistemas compartidos
  config/constants.ts     ritmo, velocidades, claves y PALETA
  config/metro.ts         tiempos del tren, pasajeros, vigilancia y DEBUG
  types/game.ts           tipos del dominio
  state/GameState.ts      estado central + partida nueva
  systems/
    TimeSystem.ts         reloj del mundo
    SaveSystem.ts         persistencia + adaptador de almacenamiento
    DialogueSystem.ts     conversación con elección opcional (sin render)
    LocationSystem.ts     registro, validación, edificios -> portales, máscara de colisión
    Navigation.ts         destinos con nombre, rutas por el grafo y entre puertas (puro)
    Places.ts             lugares resueltos: entradas, salidas, destinos, horario (puro)
    TrainSystem.ts        tren: estados, horario y puertas (sin Phaser)
    MetroSystem.ts        estación viva: coordina tren, pasajeros, vigilancia y microeventos
    MetroDaily.ts         estado diario con semilla, franjas, arquetipos, retrasos (puro)
    PassengerAI.ts        máquina de estados de un pasajero
    SecurityAI.ts         máquina de estados del vigilante
    MetroEventManager.ts  eventos de viaje: condiciones, cooldowns, memoria, cadenas (puro)
  entities/
    Player.ts             movimiento, orientación, animación
    NPC.ts                personaje estático interactuable
    Walker.ts             NPC que camina por puntos (pool)
    Train.ts              render del tren y sus puertas
  scenes/
    BootScene.ts          genera texturas y animaciones
    WorldScene.ts         coordina una localización cualquiera
  world/
    TextureFactory.ts     terreno, personajes, tren y props originales
    BuildingArt.ts        fachadas, tejados y rótulos por estilo de edificio
    PropArt.ts            props de calle e interiores del barrio
    Ambience.ts           tráfico, fuente y puertas automáticas
    paint.ts              primitivas de dibujo y fuentes de píxel
    LocationBuilder.ts    suelo y edificios horneados, props, colisiones agrupadas
    tiles.ts              leyenda de terreno y props
  ui/
    HUD.ts                reloj, dinero, energía
    DialogueBox.ts        panel de diálogo
    TargetHint.ts         coste del paso, visible antes de pagarlo
    MetroDebug.ts         panel de depuración de la estación
    Announcer.ts          megafonía
    PlaceBanner.ts        nombre del sitio al llegar
  data/
    locations.ts          registro: 12 localizaciones (2 distritos, 2 andenes, 8 interiores)
    vallesco.ts           el barrio: suelo, 27 edificios, mobiliario, puntos y grafo
    interiors.ts          gimnasio, tienda de ropa, súper, restaurante y oficinas
    places.ts             lugares con id estable: viviendas, negocios, transporte, plaza y parque
    npcs.ts               dieciocho personajes (Marco, Iker y Rocío vigilan) + 12 aspectos de pasajero
    announcements.ts      textos de megafonía por contexto
    metroEvents.ts        16 eventos de viaje en la Línea 2
scripts/check-world.ts    recorre el mundo: todo alcanzable, grafo, lugares y cinco rutinas de NPC
scripts/check-metro.ts    varios ciclos completos del tren
scripts/simulate-metro-days.ts  npm run simulate: días completos, con checks de variedad
scripts/simulate-metro-events.ts  npm run simulate:events: años de viajes, con checks del sistema de eventos
```

## Limitaciones actuales

Conocidas y deliberadas:

- **El gráfico es provisional.** Original y coherente, pero placeholder; la
  lógica no depende de ningún sprite concreto.
- **Los interiores nuevos se recorren y se habla; nada más.** Gimnasio, tienda,
  súper, restaurante y oficinas tienen mobiliario, un personaje y sus puntos
  (`GYM_TREADMILL_01`, `CLOTHING_STORE_TILL`, `HOME_WARDROBE`…), pero no hay
  entrenar, comprar ni trabajar, y por eso ningún botón lo finge. El centro de
  estudios y los comercios del barrio sólo tienen fachada.
- **Nadie camina todavía por la calle.** Grafo, puntos, lugares y
  `worldRoute()` están listos y probados; los personajes son la fase siguiente.
  Pendientes y decisiones previas, en `TODO.md`.
- **Los bordes del barrio son invisibles en las calles.** Las calles siguen fuera
  del mapa como resto de la ciudad; el jugador se detiene en el límite.
- **La Línea 2 tiene dos paradas.** No hay red. El horario va en tiempo real
  (un tren cada 14–34 s según día y hora) y no se atiene al reloj del juego: esperar un tren son
  30–70 minutos de juego. Al entrar en una estación el primer tren tarda 2–8 s.
  El estado del tren no se guarda: cada visita empieza con la vía libre.
- **Los NPC de la estación caminan sin pathfinding.** Van en línea recta entre
  puntos definidos en `data/locations.ts` (validados en arranque) y no chocan
  entre sí; empujan al jugador pero nada los bloquea. Mientras hay un diálogo
  abierto, la estación se congela con el resto del mundo.
- **La única economía es el billete de metro.** El dinero baja al viajar y nada
  más lo mueve. La energía existe, se muestra y se guarda, pero todavía no la
  gasta nada, y por eso no hay ningún botón que finja hacerlo.
- **Los eventos no tienen todavía a dónde llevar.** Rumores, folletos y
  contactos (`contacto:olga-estudio`, `contacto:amparo-mercado`) quedan como
  flags para cuando existan trabajo y estudios; hoy no abren nada. No hay
  estaciones del año, reputación ni relaciones fuera de la memoria de eventos,
  así que ninguna condición depende de ellas.
- **Los NPC con nombre no tienen memoria.** Cada conversación empieza de cero.
  Los habituales del andén (Paula, Kike, Inés, Dani) siguen quietos; los que se
  mueven son los pasajeros anónimos y Marco.
- **Un mapa por barrio, sin trocear.** Vallesco (76×56) va a 60 fps con 144
  cuerpos y ~250 objetos. Con varias veces ese tamaño tocaría trocear en zonas o
  descartar props fuera de cámara.
- **Sin audio, sin controles táctiles, sin menús.**
- El objetivo es escritorio; el canvas se adapta a la ventana, pero no hay
  interfaz pensada para móvil.

## Roadmap conceptual

No implementado. Aquí sólo para que las decisiones de hoy no lo bloqueen.

**0.2** — dar peso al tiempo: dormir en casa para pasar al día siguiente,
consumir energía por acción y recuperarla al descansar. Es el primer bucle que
convierte el reloj en una restricción real.

**Después** — trabajo y salario, estudios y habilidades, finanzas, proyectos
personales con riesgo y retorno, relaciones persistentes, eventos.

El principio que ordena todo eso: **LIFE//SIM no debe convertirse en hacer clic
en botones para subir estadísticas.** Si el jugador quiere trabajar, se desplaza
al trabajo.
