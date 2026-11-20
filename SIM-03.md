# SIM-03 · Convivencia de eventos: lluvia, partido del Arena y comercio

Rama `main`. Implementador sin shell: build, checks y QA en navegador los ejecuta el coordinador.

## Estado inicial

`main`, SHA `aae58c2` (merge de `met-05-iluminacion`). Al empezar había cambios ajenos y de SIM-02 sin commit, y
**no se tocaron**: `CLAUDE.md`, `README.md`, `src/config/constants.ts`, `src/world/*`,
`src/data/{sara,ada,amaia}Story.ts`, `src/scenes/WorldScene.ts`, `src/systems/{Chat,Social,Story}.ts`,
`scripts/{check-chat,check-npc-memory}.ts` y `SIM-02.md`. Tampoco las carpetas sin seguimiento `VIS-01/` y
`design/visual_art/`. En `package.json` se conserva el cambio de SIM-02, y SIM-03 sólo añade
`&& node scripts/check-event-director.ts` justo detrás de `node scripts/check-arena.ts`.

## Resumen

No hay un director central. Cada sistema lee el reloj y decide con sus propias tablas: la lluvia sale de
`Weather.weatherAt`, el partido de `Match.matchOn`/`matchNow`/`byPhase` y el comercio de `Places.isOpen` y de las
`bands` y `demand` de su perfil. Ninguno guarda nada, así que dos lecturas del mismo reloj dan lo mismo. El paso 1
(este) añade `scripts/check-event-director.ts`, que comprueba la convivencia. Además deja una prueba roja: hoy
`MetroDemand.tripsFor` aplica el peso del estadio durante todo el día del partido (`MetroDemand.ts:69`) y no sólo en
sus fases.

## Auditoría

| capacidad | archivo:línea | evidencia | carencia | decisión |
|---|---|---|---|---|
| lluvia → calle | `systems/StreetLife.ts:45-50` (`streetWeatherScale`), aplicada en `:207` | ×0.8 por encima de 0.08 y ×0.6 por encima de `HEAVY_RAIN`; después se recorta con `streetCapAt` (`:210`) | — | Sin cambio. Cubierto en la sección a) |
| lluvia → terraza | `StreetLife.ts:1184-1202` (`staffShift`): el camarero de terraza se retira si `rain > HEAVY_RAIN`; reservas con TTL `StreetLife.ts:55` (300 s) y `Crowd.ts:25` (90 s) | La mesa a medias se suelta y nadie se queda con un asiento reservado | — | Sin cambio |
| lluvia → viajes y locales | `StreetLife.ts:69-75` (`weatherBias`); `Crowd.ts:131-132` (`targetAt`, hasta ×1.35 en `food`/`nightlife`/`shop`/`social`, con el tope del aforo `:137-139`) | Terraza = `appeal` < 1; ir a cubierto > 1 | — | Sin cambio. Cubierto en la sección a) |
| lluvia → metro | `systems/MetroDemand.ts:68` (`rain > 0 ? RAIN_FACTOR : 1`), `data/metroDemand.ts:42` (`RAIN_FACTOR = 1.2`) | Más viajes con cualquier lluvia | Inconsistencia menor: el metro reacciona con `> 0` y la calle con `> 0.08` (`Weather.ts:45`, `LIGHT_RAIN`) | Se documenta y no se cambia |
| partido → calle | `StreetLife.ts:209` (`byPhase(profile.match)`), `:214-216` (`streetCapAt`); `data/streets.ts:492` | El plus y el tope suben juntos; con `live`, el valor negativo vacía la calle | — | Sin cambio. Secciones b) y d) |
| partido → andén | `systems/Match.ts:58-59` (`matchMetroShift`), `data/cityEvents.ts:80-83` | Arena +3 en `leaving`; 0 sin partido | — | Sin cambio. Secciones b) y f) |
| partido → viajes | Antes: `MetroDemand.ts:69` `const match = matchOn(day) !== null;`. Ahora: `MetroDemand.ts:71-72` (`matchPhase({ day, hour, minute: 30 })`, con la regla de madrugada de `Match.ts:40`), usado en `:96` con `MATCH_FACTOR` (`data/metroDemand.ts:44`) | Antes: el peso del estadio valía todo el día, también a las 11:00 | Antes: el ocio de la mañana del partido ya iba al estadio ×6 | **Corregido**: `MATCH_FACTOR` sólo en build-up/arrival; leaving/after sin plus de ida. Evidencia: `check-event-director.ts:165` rojo (exit 1, «antes del partido (7–11 h) 45 viajes al estadio frente a 21 un día libre») → verde (exit 0, «estadio antes 24/21 y en build-up/arrival 84/35»). La aserción de llegada pasa a ser la suma de build-up+arrival (`:167-176`) |
| partido → bares | `systems/Crowd.ts:40-41` (`levelAt` → `null` si `!isOpen`), `:49` (`byPhase(profile.match)`); `StreetLife.ts:186-193` (`pull` = 0 si está cerrado) | Un local cerrado no suma gente aunque haya partido | — | Sin cambio. Sección b) |
| comercio | `systems/Places.ts:117` (`isOpen`), `Crowd.ts:40-68` (`levelAt`, `demandAt` recortado a [-1, 2]) | Las franjas y la demanda dan el nivel; cerrado, `null` | — | Sin cambio. Sección c) |
| ciclo de vida | Todo es puro: `Match.ts:23-48`, `Weather.ts:198-214` (con memo que `forceWeather` limpia en `:190-193`), `MetroDemand.ts:61-65` (memo de una sola hora) | La basura del partido no se duplica al volver a entrar (`scripts/check-litter.ts:128-134`) | — | Sin cambio. Secciones e) y f) |

## Contrato de evento

- **Identidad:** el día. `matchOn(day)` da el partido de ese día (semilla `'arena-match', day`) y `weatherAt(day, h)`
  la lluvia (el plan con semilla `'tiempo', day`).
- **Ocurrencia:** `matchNow(c)` (el partido de hoy o, de madrugada, el de ayer) y `weatherAt(day, h).rain`.
- **Ámbito:** el partido afecta a `ARENA_MATCHES.district` (`'arena'`: la calle y la basura), a las paradas de
  `ARENA_MATCHES.metro` (`arena`, `puerta-central`) y a los perfiles con `match` (`data/arenaVenues.ts:107,119,139`,
  `data/stadium.ts:167`, `data/districtIdentity.ts:141`). La lluvia afecta a toda la ciudad.
- **Fases:** las de partido son `MATCH_PHASES` (`build-up`, `arrival`, `live`, `leaving`, `after`; minutos en
  `cityEvents.ts:72-78`). La lluvia tiene tres umbrales: 0.08 (`LIGHT_RAIN`), `HEAVY_RAIN` = 0.55 y la referencia de
  0.55 para el chaparrón en `Weather.ts:30,44`.
- **Efectos:** las tablas por fase que lee `byPhase` (calle, local, andén y basura) y las escalas de tiempo
  (`streetWeatherScale`, `weatherBias`, `outdoorAppeal`, `RAIN_FACTOR`).
- **Responsable:** cada sistema que lee su tabla (StreetLife, Crowd, MetroDemand, Litter, Zones). Ninguno escribe en
  la tabla de otro.
- **Persistido:** nada, todo se puede derivar del reloj. Con `grep -i "match|weather|rain|event"` en
  `src/systems/SaveSystem.ts` sólo aparece `events: emptyMemory()` (`:65`) y `parseEvents` (`:245-330`), que es la
  memoria de los sucesos del metro (`EventMemory`: `eventsSeen`, `choicesMade`, `eventFlags`, `eventCooldowns`,
  `scheduled`, `lastEventRide`). No aparece ni partido, ni tiempo, ni lluvia.

## Matriz causa → sistemas → efecto → finalización

| causa | sistemas | efecto | finalización |
|---|---|---|---|
| lluvia (> 0.08) | StreetLife | calle ×0.8 (×0.6 con chaparrón); terraza `appeal`; ir a cubierto > 1 | cuando `weatherAt` vuelve a 0 (rampa de 0.6 h) |
| chaparrón (> 0.55) | StreetLife.staffShift | se retira el camarero de terraza; la mesa se suelta | cuando para: vuelve al siguiente `staffShift` |
| lluvia (> 0) | MetroDemand | viajes ×1.2 | la hora siguiente sin lluvia |
| lluvia | Crowd.targetAt | locales a cubierto hasta ×1.35, sin pasar del aforo | con el tiempo |
| partido, fase | StreetLife (`match`, `streetCapAt`) | plus y tope; `live` vacía la calle | al acabar `after` (+275 min desde el saque) |
| partido, fase | Match.matchMetroShift | niveles de más en el andén | ídem |
| partido, fase (build-up/arrival) | MetroDemand | destino `arena` ×6 sólo en las fases de ida | al acabar `arrival` (el saque) |
| partido, fase | Crowd.levelAt (`match`) | bares más llenos; cerrado = `null` | `after` |
| partido, fase | Litter (`matchLitter`) | basura ×1.2 a ×3 | `after`; las piezas caducan solas |
| fin del partido | StreetLife (`pickRule`, `metroWaves`) | calle: los aficionados se van en la fase leaving/after y, después, los últimos salen de los bares (Handoff) y se van; 0 a las 4 h del final de after; sin viajes de aficionado nuevos con la fase en null (rutas fan-* filtradas por fase en `StreetLife.pickRule:1870` y `metroWaves:739`) | reconstrucción sin aficionados al volver a entrar (`populate` en escena nueva). Sección g) |
| horario y franja | Places.isOpen, Crowd.levelAt, StreetLife.pull | nivel por franja; cerrado = 0 en la calle | la hora de cierre |

## Convivencia y presupuestos

- **Calle:** `objetivo = min(round((rango(nivel) × scale + Σ round(pull × 3) × perLevel) × streetWeatherScale) +
  popUpCrowd + byPhase(match), streetCapAt)`, con `streetCapAt = maxWalkers + popUpCrowd + max(0, byPhase(match))`.
  El Arena tiene un tope máximo de 36 + 36 = 72, por debajo de `BUDGETS.low.agents` = 75. Si los paseantes cuestan
  demasiado, el LOD (`crowdBudget`, `MIN_BUDGET` 0.55) los recorta.
- **Local:** el nivel siempre cae dentro de `LEVELS`, porque se recorta a `[0, LEVELS.length-1]` (`Crowd.ts:50`). La
  gente queda por debajo de `min(maxVisitors, capacity − personal)` (`Crowd.ts:137-139`).
- **Metro:** como mucho `maxTripsPerBand` = 400 viajes, además del fondo `perStop` (`MetroDemand.ts:89`).
- **La lluvia no reduce el plus del partido, por diseño:** la escala del tiempo multiplica la gente de la hora y los
  tirones, y el plus del partido se suma después (`StreetLife.ts:207-209`). El combinado nunca pasa del tope
  (sección d).

## Límites

- `MetroDemand.tripsFor` no genera viajes de vuelta desde el estadio: en `leaving`/`after` no hay plus de ida ni
  flujo de salida en los viajes. La salida sólo se nota en el andén (`matchMetroShift`, Arena +3 en `leaving`).
- La fase de cada hora se lee a y media (`minute: 30`): una hora que cruza el límite de fase cuenta entera en la
  fase de su minuto 30.
- `lifesim.date.set` (atajo de desarrollo) salta el reloj sin repoblar la calle cargada: quien ya estaba sigue hasta
  terminar su ruta. En juego, los saltos sin cambio de mapa están acotados (`matchOptions` no pasa del final;
  minijuegos de minutos) y dormir o el metro reconstruyen la calle.
- `vehicles 26/24` en `district`, ya existente y ajeno a SIM-03 (Traffic/budgets).
- El umbral de lluvia del metro (`> 0`) no coincide con el de la calle (`0.08`). Es una inconsistencia menor, documentada
  y sin cambio.
- Con el comercio abierto, la variación por hora es pequeña en la Cafetería Pausa. La variación por franja la demuestra
  `check-footfall` en Decathlon.

## Recetas de QA y rendimiento

- **Consola:** `node scripts/check-event-director.ts`, `node scripts/check-arena.ts` y
  `node scripts/check-metro-demand.ts`; después `npm run build` y la cadena `npm run check`.
- **Navegador** (958×888, DPR 1, calidad high): desde la consola dev, teletransporte al Arena (`ar-estadio`) y reloj
  a la llegada de un día de partido. Para la lluvia, `lifesim.weather.force({ rain: 0.9, celsius: 12 })`; para
  restaurarla, `lifesim.weather.force(null)`. Hay que mirar los fps, el contador de agentes, el camarero de terraza en
  el distrito con lluvia y la cola del andén del Arena a la salida.
- **Rendimiento:** se miden E1-E3 con los mismos escenarios antes y después del cambio del metro.

## Medición base («antes»)

Todo en 958×888, DPR 1 y calidad high.

| escenario | dónde y cuándo | fps | agentes | nota |
|---|---|---|---|---|
| E1 | `district`, martes 13/04/2027 10:00 | 60 | — | vehicles 26/24, preexistente |
| E2 | `arena` en `ar-estadio`, sábado 17/04/2027 17:30, fase `arrival` | 57-60 | 39-41 | |
| E3 | `arena`, domingo 18/04 15:00, fase `arrival`, `lifesim.weather.force({rain:0.9,celsius:12})` | 60 | 42-46 | |

## Prueba (`scripts/check-event-director.ts`)

- a) Lluvia: misma hora y día (martes, 10:00), con `forceWeather` en chaparrón y en seco (12 °C los dos) y restaurado
  en un `finally`.
- b) Partido frente a un día libre del mismo `weekIndex`, los dos en seco forzado. Metro: antes del build-up sin plus
  (`:165`) y, en las horas de build-up + arrival, más viajes al estadio que el día libre (`:167-176`).
- c) Comercio: `decathlon-tienda` en un día de lunes a jueves sin `demand`; a las 10:00 LOW, a las 18:00 HIGH y a las
  22:30 cerrada.
- d) Chaparrón, llegada y comercio a la vez: topes, `LEVELS`, aforo, viajes y pico simulado de 10 min.
- e) Determinismo y salto al día siguiente.
- f) Limpieza al día siguiente a las 12:00.
- g) Limpieza al terminar el partido: calle del Arena desde el inicio de `arrival` hasta el final de `after` + 4 h,
  sin cortes y con 2 semillas. Pasada `after`, los últimos clientes salen de los bares con su rol `fan-*` (Handoff:
  `dueOut` → `StreetLife.emerge`) durante unas 3,5 h; por eso el margen de 4 h. Con la fase en null, todo agente
  `fan-*` que aparece por primera vez (por id) debe venir de un local: sin `rule` (emerge usa `newWalker(undefined, …)`;
  un viaje nuevo siempre lleva su regla). Al final, 0 agentes `fan-*` y como mucho 2 con camiseta en otro rol; ningún id
  duplicado; pico ≤ `BUDGETS.low.agents`. Además, un `StreetLife` nuevo poblado el día siguiente a las 13:05 tiene 0
  aficionados.

`md` es el primer día con partido cuyo día siguiente no tiene partido. Esto es necesario para que md+1 a las 12:00
quede limpio: un saque a las 16:00 abre su `build-up` a las 12:00.

## Aceptación

Escritorio (Chrome DevTools, contextos aislados: las partidas del usuario no se tocaron; consola sin errores).

| # | prueba | resultado | evidencia |
|---|---|---|---|
| 1 | Lluvia | PASS | gameplay-qa A: martes 20/04 13:00, `district`. Seco: 41 agentes, camareros de terraza en WORK y 1 sentado. Con lluvia 0.9, a los 9 s: 32 agentes, 0 camareros, 0 sentados y 0 atascados. Con `weather.force(null)`, a los 9 s: 36 agentes y camareros de vuelta en WORK. Observación menor: un turista quieto 8 s |
| 2 | Partido con calendario y fase compartidos | PASS | check b. gameplay-qa B (día 6, saque 18:30): build-up 16:23 con 35 agentes/28 aficionados; arrival 17:50 con 39/29; leaving 20:55 con 40/29 |
| 3 | Comercio | PASS | Cafetería Pausa (7-22), martes 13/04: 09:10 con 5 clientes, 13:10 con 5 y 19:10 con 6, más 2 empleados; 22:40, 0 clientes y 4 saliendo; miércoles 06:30, 0; 08:00, 1 |
| 4 | Combinación sin doble conteo | PASS | check d: ≤ tope, `LEVELS`, `maxTripsPerBand`, pico ≤ `BUDGETS.low` |
| 5 | Horarios y capacidad | PASS | check c; Pausa cerrada sin clientes |
| 6 | Sin duplicación de actores | PASS | dupIds 0 en el navegador; ids únicos en g) |
| 7 | Recarga | PASS | `arena`, sábado 17/04 18:39, fase live, 30 agentes/15 aficionados → guardar → recargar → Continuar: `arena`, live, 8 agentes/1 aficionado, dupIds 0. La fase se conserva y la calle se reconstruye para live sin rehacer los spawns de arrival |
| 8 | Salir y entrar | PASS | De `arena` a `district` y vuelta a la misma hora: misma fase, 27 aficionados, dupIds 0 |
| 9 | Saltos de tiempo | PASS | checks e) y g); el atajo dev, documentado en Límites |
| 10 | Finalización limpia | PASS | check g). Navegador: a las 23:40, fase null y 26 aficionados; ver nota |
| 11 | Consecuencias y recuerdos | PASS | SIM-03 no aplica ninguno y no persiste nada |
| 12 | Barrios descargados | PASS | Por diseño: puro y derivado (`World.cityAt`); `check-world-integration` |
| 13 | Rendimiento | PASS | Sección «Rendimiento después» |
| 14 | Partidas antiguas y ranuras | PASS | Sin campos nuevos; `check-save-torture` y `check-save-slots` |
| 15 | Sin regresiones | PASS | Cadena completa 153/153 |

Móvil emulado y dispositivo físico: NO VERIFICADO, porque no hay cambios visibles ni de interacción.

- Fin del partido en navegador (gameplay-qa): PASS con nota. Tras saltar con `date.set` al lunes 12:00 sin cambiar de
  mapa seguían 23 aficionados, que se fueron marchando con el reloj (8, luego 2). El FAIL inicial es un artefacto del
  atajo: no repuebla la calle cargada. En juego, dormir o el metro reconstruyen la calle y `matchOptions` no pasa del
  final. g) demuestra la reconstrucción a 0.
- Recarga: el primer intento de gameplay-qa cargó en `district` porque el atajo teleport recibió un id de spawn
  (`'ar-estadio'`) en lugar de `{tx,ty}` (`WorldScene.ts:4585`); con la posición en NaN, el guardado vuelve al inicio.
  Es un artefacto de la receta, no del juego.

## Validación

- Rojo → verde: `node scripts/check-event-director.ts` dio exit 1 antes de la corrección (`:165`) y exit 0 después.
- Salida final (exit 0): «director de eventos OK: md 7 (saque 16:00), libre 98; lluvia calle 5/9, local 6/5, metro
  48/42; llegada 43/10, ar-deportes cerrado en build-up, estadio antes 24/21 y en build-up/arrival 84/35; combinado
  38/66 (plus 30, seco 43), pico 41/75, 12 viajes; fin del partido (605 min) g1 pico 46, fan-* 0, salen de bares sin
  fase 8, camiseta 0, quedan 10 / g2 pico 48, fan-* 0, salen de bares sin fase 14, camiseta 0, quedan 10; repoblado 8
  13:05 aficionados 0/0».
- `npm run build`: exit 0.
- Dirigidos con exit 0: check-event-director, check-metro-demand, check-arena, check-terrace, check-weather,
  check-footfall, check-world-integration, check-litter, check-event-lifecycle, check-cross-system, check-schedules,
  check-regression, check-save-torture y check-save-slots.
- Cadena completa de `scripts.check`, comando a comando en PowerShell: 153/153 EXIT=0, 2838 líneas, con
  check-event-director en la posición 22/153. Se ejecutó dos veces; la segunda, tras la corrección de g).
- Correcciones /autodev: 2/2. (1) Se añade g). (2) La ventana de g) llega hasta after + 4 h, con la aserción de que,
  con la fase en null, los `fan-*` nuevos sólo salen de locales (`rule === undefined`, emerge/Handoff). El diagnóstico
  dio esta curva por hora en g1: 19 h 22, 20 h 25, 21 h 9, 22 h 12, 23 h 0.
- Revisión DeepSeek: NOT EVALUATED (no conectado).

## Diff

`src/systems/MetroDemand.ts` 7 (+5 −2); `package.json` +1 entrada (la línea ya estaba modificada por SIM-02); nuevos
`scripts/check-event-director.ts` (311 líneas) y `SIM-03.md`. Ajenos sin tocar: `CLAUDE.md`, `constants.ts`,
`src/world/*`, `VIS-01/`, `design/visual_art/` y los archivos de SIM-02.

## Rendimiento después

Misma receta (958×888, DPR 1, calidad high, isolatedContext). Criterio de regresión: caída de la media de fps > 3 o un
«over» nuevo atribuible.

| escenario | fps antes → después | agentes | objects | over |
|---|---|---|---|---|
| E1 `district`, martes 13/04 10:00 | 60.0 → 59.8 (−0.2) | 30-31 → 29-32 | ~1430 | vehicles 26/24 en ambos (preexistente) |
| E2 `arena` arrival, día 6 17:30 (`'ar-estadio'`) | ~58.5 → 58.4 (−0.1) | 39-41 → 38 (ruido) | 683 → 677 | — |
| E3 `arena` arrival con lluvia 0.9, día 7 15:00 | 60 → 60 | 42-46 → 42-43 | 1064 → 1086 (clima; MetroDemand no crea objetos) | — |

Nueva referencia con la posición real `{tx:28,ty:26}`: E2, 60 fps con near 35-37; E3, 60 fps con near 40-42.

Veredicto: sin regresión atribuible a SIM-03.
