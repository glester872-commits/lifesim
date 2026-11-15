# MOV-02 · ciclo 1: todo visible con viaje, y el viaje decide si sube

Sigue a MOV-01.md (FAIL: 13 de 47 visibles sin viaje).

## A · todo visible con viaje

- `MetroDemand.tripFor(stopId, day, hour, seq)`: función pura. Toma como base `tripsAt(...)[seq % len]`. Si el andén
  no tiene ningún viaje esa hora, construye uno desde el andén hacia un destino con estación alcanzable
  (`routeBetween`), elegido con `seededRng(hashSeed('metro-demand-fill', day, hour, seq))`. El paso intermedio que
  pedía el plan (un viaje de `tripsFor` cuyo routeId contenga el andén) es por definición `tripsAt`, así que no
  se añade. tripId `${base.tripId}:f${seq}`: `tripsFor` sólo genera `día:hora:n`, así que no chocan.
- `MetroSystem.assignTrip`: primero reparte los libres de `tripsAt` como antes; cuando se agotan, pide
  `tripFor` con un `seq` por andén y hora (`demand.seq`, que vuelve a 0 al cambiar la hora), salta los ids ya
  tomados y copia con `{...t}`. Tope de 1000 intentos para no colgarse si algo devolviera siempre ids tomados.

## B · el viaje decide subir

- `trainHeadingFor(stopId, cycle)`: +1 hacia mayor `order` de la línea y -1 hacia menor. En las cabeceras
  (order mínimo o máximo de su línea) sólo hay un sentido posible; en las demás paradas, alterna con la paridad
  de `cycle`. **Límite:** es un modelo determinista y no una línea real. TrainSystem no tiene dirección, destino
  ni línea, y el letrero del tren no sabe hacia dónde va. Cuando TrainSystem lleve sentido, se lee de ahí.
- `nextStopOf(trip, stopId)`: el siguiente nodo del routeId, o null en el destino (o fuera de la ruta).
- `tripWantsTrain(trip, stopId, heading)`: true si el siguiente nodo está en la misma línea y en ese sentido.
  Da false en el destino y si el siguiente nodo es el andén de transbordo (TRANSFERS, otra línea).
- `PassengerWorld` gana `stopId()` y `trainHeading()`. MetroSystem los resuelve con
  `STOPS.find(s => s.station === this.stationId)`, sin condicionales por estación.
- `PassengerAI.react()`: `willBoard = wants && Math.random() < (lo de antes)`. Sin viaje o sin andén,
  `wants = true` y queda igual que antes. La máquina de estados no cambia: si no sube, `trainGone()` descuenta
  paciencia y `leave()` lo lleva a LEAVING_STATION.
- **No hecho: el orden de bajada en `releaseAlighting`.** El pool son pasajeros OFFSTAGE, y `assignTrip` les
  quita el viaje al dejar de verse (`!walker.visible → trip = undefined`). No tienen viaje que ordenar, así que
  ordenar por `nextStopOf` no tendría efecto. Haría falta asignar el viaje antes de que se vean, en `alight()`,
  o dejar que lo conserven fuera de escena. Queda pendiente para el siguiente ciclo.

## Qué cuentan los 47 visibles (NO VERIFICADO)

`this.passengers` es el pool entero de la estación: los que esperan, los OFFSTAGE (los que van en el tren,
reservados en `populate` con `alighting[1]`, y los que esperan respawn) y los traspasos de la calle
(`handoff`). `populate` sólo reparte estados sobre ese pool, y `maxPassengers=11` acota el objetivo de
afluencia (`target`), no el tamaño del pool. Que 47 sean *visibles* a la vez frente a un objetivo de 11 no
cuadra con esto. Lo más probable es que la cifra de MOV-01 contara el pool o sumara varias estaciones. No he
leído `crowdAt`, así que no puedo confirmarlo. Hay que medir `passengers.filter(p => p.walker.visible).length`
en el navegador.

## Casos

| Caso | Cómo | Estado |
|---|---|---|
| tripFor no nulo, válido, único, sin choque, pasa por el andén, determinista (todas las paradas, días 1 y 7, 3/8/14/18/23h, seq 0..59) | check-metro-demand | pendiente de ejecución |
| tripWantsTrain: +1 sí, -1 no; transbordo no; tras transbordo en L3 sí | check-metro-demand | pendiente de ejecución |
| trainHeadingFor en cabeceras estable en ciclos 0..5 | check-metro-demand | pendiente de ejecución |
| nextStopOf null en destino | check-metro-demand | pendiente de ejecución |
| build sin errores | npm run build | pendiente de ejecución |
| regresión mundo/metro | npm run check | pendiente de ejecución |
| todo visible con viaje en estación concurrida | navegador | NO VERIFICADO |

## Ciclo 2 (corrección 1/2)

### Causas

- **Una vía a BOARDING sin filtro.** `maybeRunForTrain` (entra con el tren abierto y corre) ponía BOARDING sin
  mirar `tripWantsTrain`. Con viaje, subían pasajeros cuyo tren no les servía. Grep de `state = 'BOARDING'` en
  PassengerAI: sólo quedan `board()` (viene de `react`, filtrado por `willBoard`) y `maybeRunForTrain`.
- **Un reparto que no mira la fase.** `assignTrip` daba cualquier viaje que pasara por el andén, de modo que un
  WAITING podía llevar un viaje que acaba aquí y uno que baja podía llevar uno que sale de aquí.

### Arreglo

- `PassengerAI.maybeRunForTrain`: tras `decidedRun = true`, si hay viaje y andén y `!tripWantsTrain(...)`, no corre
  y sale con `return`. Sin viaje, se comporta igual que antes.
- `MetroDemand.tripFitsPhase(trip, stopId, 'depart' | 'arrive')`, una función pura. 'depart' equivale a
  `nextStopOf !== null`. 'arrive' se cumple si el viaje termina aquí o si el andén está en la ruta y el par con el
  nodo anterior o el siguiente es un TRANSFER.
- `tripFor(..., want?)`: desde `seq` hacia delante, el primer candidato de `tripsAt` que encaja. Si ninguno
  encaja, construye uno propio con el mismo rng sembrado. Para 'depart' el origen es el andén (id `x-`) y para
  'arrive' el destino es el andén y el origen es otra parada alcanzable (id `xa-`). Sin `want`, se comporta como
  en el ciclo 1.
- `MetroSystem.assignTrip`: EXITING_TRAIN y LEAVING_STATION piden 'arrive'; el resto de estados visibles, 'depart'.
  Filtra con `tripFitsPhase` tanto `tripsAt` como el relleno. Si el viaje actual no encaja con la fase, lo suelta y
  reasigna, y `taken` se calcula después de soltarlo, así que no se repite ningún tripId entre visibles.

### Casos del ciclo 2

| Caso | Cómo | Estado |
|---|---|---|
| tripFitsPhase coincide con nextStopOf ('depart') y detecta destino o transbordo ('arrive') | check-metro-demand | pendiente de ejecución |
| tripFor 'depart' nunca da un viaje sin siguiente nodo (decathlon, arena, vallesco, ribera, luna, puerta-central; días 1, 7 y 26; 0-23h; seq 0-50) | check-metro-demand | pendiente de ejecución |
| tripFor 'arrive' siempre termina o transborda en el andén (mismo barrido) | check-metro-demand | pendiente de ejecución |
| tripFor con fase nunca null, válido, id único por fase | check-metro-demand | pendiente de ejecución |
| build sin errores | npm run build | pendiente de ejecución |
| regresión mundo/metro | npm run check | pendiente de ejecución |
| nadie corre hacia un tren que no le sirve | navegador | NO VERIFICADO |

### Pendiente

- El orden de bajada en `releaseAlighting` (ver arriba: el pool OFFSTAGE no tiene viaje).
- El viaje del jugador, comprobado en el navegador.

## Ciclo 3 (corrección 2/2)

### Regresión

En el navegador, en decathlon-station el día 26 a las 8:00, hubo 0 subidas en 70 s y 1064 muestras en
REACTING_TO_TRAIN. Con funciones puras: en decathlon, de 50 trips 'depart', 46 tenían como siguiente nodo
`decathlon-l3`, y solo 2 querían +1 y 2 querían -1. En puerta-central, 34 de 41 tenían `puerta-central-l3`.

### Causa

`tripFitsPhase(…, 'depart')` solo exigía `nextStopOf !== null`. Aceptaba trips cuyo siguiente paso era un
transbordo a pie hacia el andén de otra línea. Ese pasajero no quiere ningún tren del andén: espera, agota la
paciencia y se va.

### Arreglo 1 (hecho)

- `src/systems/MetroDemand.ts`: el nuevo helper `departsOnLine(next, stop, heading?)` reúne el criterio de
  `tripWantsTrain`: no es un TRANSFER, está en la misma línea y, si se indica, va en ese sentido. Con él,
  'depart' significa que el siguiente paso es un tren de la misma línea, y `tripWantsTrain` lo reutiliza. Quien
  llega por transbordo desde L3 y sigue en L2 sí cuenta como 'depart' en L2. 'arrive' no cambia.
- `tripFor(…, 'depart')` ya solo elegía trips que cumplieran `tripFitsPhase`. Ahora el trip inventado solo
  usa destinos cuyo primer tramo sale en tren de la misma línea. En una cabecera, la misma línea solo permite
  un sentido, así que no salen trips imposibles.

### Arreglo 2 (NO hecho, pendiente)

Para el orden de bajada, el pasajero tendría que conservar el trip mientras va en el tren. Dentro del tren
está en OFFSTAGE, igual que quien está fuera de la estación. `releaseAlighting` distingue a esos pasajeros
solo con `waitingForTrain`, y no vi un estado claro de «dentro del tren». Por eso no se toca `assignTrip`
ni `releaseAlighting`.

### Casos del ciclo 3

| Caso | Comando | Estado |
|---|---|---|
| `change` en puerta-central: 'depart' false; en puerta-central-l3: true (antes era true en puerta-central) | npm run check (check-metro-demand) | pendiente de ejecución |
| (6) todo `tripFor 'depart'` quiere +1 o -1 en su andén | check-metro-demand | pendiente de ejecución |
| (7) días 1 y 26, a las 8 h y 18 h, en 6 paradas: ≥80 % de los 'depart' quieren tren y ninguno va a un andén de transbordo | check-metro-demand | pendiente de ejecución |
| (7) a las 8 h, en decathlon y puerta-central, hay 'depart' en los dos sentidos; en las cabeceras, nadie en el sentido imposible | check-metro-demand | pendiente de ejecución |
| build | npm run build | pendiente de ejecución |
| subidas reales en decathlon, día 26, 8:00 | navegador | NO VERIFICADO |

Archivos tocados en el ciclo 3: `src/systems/MetroDemand.ts`, `scripts/check-metro-demand.ts` y `MOV-02.md`.

## NO VERIFICADO sin navegador

- Que la paciencia agotada lleve a LEAVING_STATION: el código no cambia, pero ahora se recorre mucho más a menudo.
- Que ningún pasajero esté en dos sitios a la vez (tripId duplicado entre estaciones o en un traspaso).
- Que en el andén los de ruta contraria esperen, no suban y acaben yéndose.
- Que los que tienen el destino aquí y siguen visibles en el andén (por ejemplo, un traspaso) no suban nunca y
  se vayan por paciencia. Es coherente, pero hay que verlo.
