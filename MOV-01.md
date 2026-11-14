# MOV-01 · Demanda de viajes del metro

Los pasajeros visibles del andén dejan de ser «una persona nueva sin rumbo»: cada uno lleva un viaje con origen,
destino, hora y recorrido, generado con semilla a partir del reloj. Sin sistemas paralelos: la máquina de estados
de `PassengerAI` no cambia.

## Auditoría (planificador)

| Pieza | Estado | Dónde |
|---|---|---|
| Metro | EXISTE | `src/systems/MetroSystem.ts` (refreshContext, populate, admitHandoffs, world(), onTrainState, releaseAlighting; `hubOf` privado), `src/systems/TrainSystem.ts`, `src/config/metro.ts` (minPassengers 1, maxPassengers 11, passengerPool 15, patienceTrains) |
| Commuters | PARCIAL | `src/systems/PassengerAI.ts`: `PassengerState` (OFFSTAGE … DETAINED) sin origen ni destino; cada entrada es una persona nueva con arquetipo aleatorio |
| Objetivos de viaje | FALTA para NPC | El jugador sí: `MetroJourney`, `prepareRide` en `src/systems/Transit.ts` |
| Cola | PARCIAL | `PassengerWorld.claimSpot/claimSeat/canEnter`, spots de `StationLayout.spots`; sin cola contable |
| Ocupación de trenes | PARCIAL / NO VERIFICADO | `CROWD_PROFILES` (alighting, waitingShare) |
| Fuera de cámara | PARCIAL | `MetroDaily.metroDay(day)` determinista; `crowdAt(daily,h,m,hub)` con `HOUR_BANDS`; `Handoff.ts`; `simulate-metro-days/events` simulan días y eventos, no viajeros |
| Rutas | EXISTE | `Transit.routeBetween(from,to)`: Dijkstra sobre andenes con `TRANSFERS` |
| Transbordos (LV-07) | EXISTE | puerta-central↔puerta-central-l3, decathlon↔decathlon-l3; `scripts/check-metro-transfers.ts` |
| Guardado | EXISTE | `metroJourney` del jugador; `SAVE_VERSION` = 4 (`src/config/constants.ts`) |
| RNG con semilla | EXISTE | `MetroDaily.seededRng(seed: number): Rng`, `hashSeed(...parts: (string|number)[]): number` |
| SIM-03 | PARCIAL | `Weather.weatherAt(day, hour).rain`, `Match.matchOn(day): Match \| null`; cityEvents y metroEvents NO VERIFICADO |

## Contrato

```ts
type TripPhase = 'llegando' | 'esperando' | 'abordando' | 'transbordando' | 'bajando' | 'saliendo';
interface Trip { tripId; passengerId; profile; originId; destinationId; scheduledTime /* absMinute */; state: TripPhase; routeId /* andenes unidos con '>' */ }
interface Passenger { passengerId; profile; originId; destinationId; scheduledTime; state; routeId; isVisible }
```

API (`src/systems/MetroDemand.ts`, sin Phaser): `tripsFor(day, hour)`, `validateTrip(t)`, `tripsAt(stopId, day, hour)`,
`phaseOf(state, trip, stopId)`. `PassengerAI.trip?: Trip` es opcional; `MetroSystem.assignTrip` lo rellena.

`routeId` lista origen, extremos de cada transbordo y destino (no las paradas intermedias por las que pasa el tren
sin bajarse). Un andén intermedio en `routeId` sólo puede ser un transbordo.

## Fases y mapeo

| PassengerState | TripPhase |
|---|---|
| ENTERING_STATION, WALKING_TO_PLATFORM | llegando |
| WAITING, REACTING_TO_TRAIN | esperando, o transbordando si el andén es intermedio en la ruta |
| BOARDING, RIDING | abordando |
| EXITING_TRAIN | bajando |
| resto (OFFSTAGE, LEAVING_STATION, DETAINED) | saliendo |

Estado: aplicado. En `MetroSystem.update`, tras `assignTrip`, cada frame
`p.trip.state = phaseOf(p.state, p.trip, stopId)` con el andén de la estación (el mismo que usa `assignTrip`).
`assignTrip` guarda una copia del `Trip` (los de `tripsFor` están memoizados y no deben mutarse).
Un viaje empezado antes de cambiar de hora conserva su tripId; es coherente con "sin duplicados" y no se renueva a propósito.

## Perfiles y franjas (`src/data/metroDemand.ts`)

| Perfil | Franjas | Base/h | perStop | Laborable | Fin de semana | Origen → destino |
|---|---|---|---|---|---|---|
| base | 0–24 | 0 | 1 | 1 | 1 | cada parada con estación → destino alcanzable al azar (rng sembrado) |
| casa-trabajo | 7–10 | 120 | — | 1 | 0.2 | casas → puerta-central, decathlon |
| regreso | 17–20 | 110 | — | 1 | 0.3 | trabajo → casas |
| ocio | 11–14, 19–23 | 40 | — | 0.6 | 1.5 | casas → arena, casco-antiguo, puerta-central |
| recados | 10–13, 16–19 | 30 | — | 1 | 0.8 | casas → puerta-central, decathlon, casco-antiguo |

Casas: luna, vallesco, cuatro-rios, velaria, campo-alto, ribera. Todos son ids reales de `STOPS`.
Franjas semiabiertas `[desde, hasta)`. Laborable/fin de semana con `Calendar.isWeekend`.
Servicio: L2 y L3 circulan 0–24 (`LINES.hours`, `src/data/transit.ts`).
Cobertura: un perfil con `perStop` genera, en cada hora de su franja, `perStop` viajes que salen de CADA parada
con `station` hacia un destino elegido con el mismo rng entre las paradas con estación alcanzables (sin o===d ni
`routeBetween` nulo). `tripsFor` lee el campo; no conoce estaciones concretas. Se generan antes que el resto y no
cuentan para `maxTripsPerBand` (el tope se aplica a los demás: cobertura + 400). Con `base` (perStop 1, 12
andenes) cada andén es origen de al menos un viaje cada hora. Eso NO basta para que todo pasajero visible
tenga trip: `assignTrip` no repite tripId y la hora puede tener menos viajes en ese andén que visibles
(navegador, arena-station 14 h: 47 visibles, 13 con trip; ver Casos).
Cifras calculadas, no medidas por separado en esta ejecución (laborable sin lluvia, si todas las rutas existen): 8h = 132
(12 + 120), 18h = 152 (12 + 110 + 30); valle 14–16h = 12; 11–12h = 66 (12 + 24 + 30). 8h/14h = 11×.

## Presupuestos

`DEMAND_BUDGET = { maxTripsPerBand: 400, maxVisible: METRO_CONFIG.maxPassengers }`. Pico calculado, no medido por separado en esta ejecución (el tope ≤ 400 sí lo comprueba check-metro-demand): 180 viajes/h
(18h con lluvia: 12 base + 132 regreso + 36 recados). Lo visible lo sigue mandando MetroSystem (`target`, `maxPassengers`); la demanda sólo
etiqueta a quien ya se ve.

## Semilla y reconstrucción

`seededRng(hashSeed('metro-demand', day, hour))`. Volumen = `round(base × peso del día × lluvia)`. `tripId` =
`${day}:${hour}:${n}` con `n` el índice de generación (los O-D sin ruta se descartan sin reutilizar su índice):
el mismo reloj da los mismos ids, así que al volver a una estación nadie se duplica. `MetroSystem` reparte con
un cursor rotatorio y no repite `tripId` entre pasajeros visibles; al salir de escena el pasajero suelta su viaje.
Nada usa `Math.random`.

## Persistencia

No se persiste. Los viajes son función de (día, hora) y se regeneran igual tras recargar; el reparto a
pasajeros concretos es cosmético y se rehace al entrar. `SAVE_VERSION` sigue en 4 sin migración: el formato
guardado no cambia.

## SIM-03

- `weatherAt(day, hour).rain > 0` → volumen × `RAIN_FACTOR` (1.2).
- `matchOn(day) !== null` → los destinos de `MATCH_DESTINATIONS` (['arena']) pesan × `MATCH_FACTOR` (6) al elegir
  destino. Ajuste respecto al plan: el partido redistribuye destinos en vez de multiplicar el volumen total, y
  aplica todo el día, no sólo alrededor del saque (`Match.kickoff`).
- cityEvents/metroEvents: no usados.

## Resultado (orquestador, 14/11/2026)

**VEREDICTO GLOBAL: FAIL** (autodev BALANCED, correcciones 2/2 agotadas). Motivo: no todo pasajero visible
lleva viaje cuando la hora tiene pocos viajes en ese andén.

Gate: PASS.
- `tsc`: 0 errores.
- `check-metro-demand`: OK. 8706 viajes por semana; cobertura de 12 paradas × 24 h los días 1 y 7; tabla
  PassengerState→fase; transbordo `casco-antiguo>decathlon>decathlon-l3>puerta-central-l3>puerta-central>velaria`.
- `check-metro-transfers` (LV-07 PASS), `check-metro`, `check-regression`, `check-handoff`, `check-concourse`: exit 0.
- `npm run build`: exit 0.
- Cadena completa de `scripts.check`: 122 comandos, 274 s, 2635 líneas, OK. Ejecutada comando a comando con
  `node` porque npm/cmd.exe se colgaba en esta máquina.
- Script de cobertura del orquestador: 0 andenes con horas a 0.

Navegador: gameplay-qa con Chrome DevTools; hora fijada en memoria con `setClock` y ranura 3 restaurada después.

## Casos

| Caso | Pasos | Esperado | Obtenido | Estado | Notas |
|---|---|---|---|---|---|
| Determinismo | tripsFor días 1–7 × 24 h dos veces | mismos ids | check-metro-demand OK | PASS | |
| Unicidad | todos los tripId de la semana | sin duplicados | check-metro-demand OK (8706 viajes/semana) | PASS | |
| Hora punta | laborable 8h vs 3h, 18h vs 15h | más en punta | check-metro-demand OK | PASS | |
| Domingo | fin de semana 8h vs laborable 8h | menos | check-metro-demand OK | PASS | |
| Validez | validateTrip + routeBetween | todos válidos | check-metro-demand OK | PASS | |
| Rechazo | 'missing', o===d, fase inválida | false | check-metro-demand OK | PASS | |
| Tope | longitud por hora | ≤ 400 | check-metro-demand OK | PASS | |
| Lluvia | laborable 8h con lluvia vs seco | ≥ (y >) | check-metro-demand OK | PASS | busca en 730 días |
| Partido | viajes a arena, día con y sin partido | más con partido | check-metro-demand OK | PASS | mismo día de la semana |
| Transbordo | algún routeId con >2 andenes | existe; fase transbordando | casco-antiguo>decathlon>decathlon-l3>puerta-central-l3>puerta-central>velaria | PASS | check-metro-demand |
| tripsAt | 4 andenes | sólo viajes que pasan | check-metro-demand OK | PASS | |
| Cobertura por andén | tripsAt(parada) para toda parada con estación × cada hora de servicio, días 1 y 7 | ≥ 1 | 12 paradas × 24 h cubiertas; script del orquestador: 0 andenes con horas a 0 | PASS | |
| Punta vs valle | laborable 8h vs 14h, andén y total | andén 8h > 14h; total ≥ 2× | check-metro-demand OK | PASS | |
| Tabla de fases | phaseOf para cada PassengerState (Record exhaustivo) + transbordo | tabla de arriba | check-metro-demand OK | PASS | |
| Fase en vivo | MetroSystem.update tras assignTrip; navegador en arena-station, día 27, 14 h | trip.state sigue a p.state | 4 fases vistas (llegando, esperando, abordando, saliendo), sin tripId repetidos; 'bajando' no apareció en 40 s | PASS parcial | tsc 0 |
| Navegador: todo visible con viaje | arena-station, 14 h, debug | todos los visibles con trip | 47 visibles, 13 con trip; «viajes 1 por este andén» | FAIL | `MetroSystem.assignTrip` solo reparte los trips que la hora tiene para ese andén (no repite tripId); el resto queda sin trip |
| Navegador: cobertura | casco-antiguo 3 h y decathlon 22 h | todos los visibles con trip | todos los visibles con trip | PASS | |
| Navegador: punta vs valle | decathlon-station, día 26, 8 h vs 14 h | más en punta | «viajes 80» a las 8 h frente a «viajes 7» a las 14 h | PASS | |
| Navegador: viaje del jugador (LV-07) | abrir menú y confirmar destino | viaje con €2 y minutos correctos | el menú «LÍNEA 2 · DESTINO» abre con €2 y minutos correctos; no se logró confirmar con teclas simuladas | BLOCKED | por script, check-metro-transfers PASS |
| Navegador: consola y salir/volver | salir a la calle y volver | sin errores ni duplicados | no ejecutado por falta de turnos; en los muestreos hechos, 0 tripId duplicados | BLOCKED | |
| Rendimiento | optimizer | sin regresión | no lanzado al cerrar en FAIL | NO VERIFICADO | |

## Pendiente (siguiente ciclo, ya aprobado por el usuario)

- Dar viaje a todos los visibles: viajes por pasajero derivados de la demanda, o limitar los visibles a la demanda.
- Que el viaje cambie el recorrido a pie y el momento de subir al tren.
- Ocupación por tren, cola contable y cityEvents.
- LV-07 completo en el navegador.

## DeepSeek

NOT EVALUATED.
