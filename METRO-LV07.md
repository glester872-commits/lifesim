# LV-07 · Metro: red, transbordo y viaje persistente

## A) Estado

LV-07 ya estaba implementado y en commit antes de este ciclo. Este ciclo auditó, verificó y documentó. En este ciclo sólo cambiaron `METRO-LV07.md` (nuevo) y `scripts/lv07-e2e.html` (arreglos del arnés). No se tocó `src/`: el diagnóstico (sección C) demostró que no hay fallo del juego.

## B) Definiciones previas, mapeadas a lo que existe

- **Segunda línea.** L3 exprés, 2 paradas: Puerta Central · L3 (`puerta-central-l3`, order 0) ↔ Polígono Norte · L3 (`decathlon-l3`, order 1), en `LINES`/`STOPS` de `src/data/transit.ts`. Razón: es la red mínima que da un transbordo real y reutiliza `platform()` de `src/data/locations.ts`; no hay trazado nuevo.
- **Estación de correspondencia.** Andén separado por línea; entre ambos, un pasillo físico: portal `id: 'transfer'` creado por `correspondence()` (`src/data/locations.ts`), con `minutes: 2`. Se aplica en Puerta Central y Polígono Norte, en los dos sentidos. Lo describe `TRANSFERS` en `data/transit.ts`.
- **Grafo.** `LINES`, `STOPS`, `TRANSFERS` y `routeBetween()` (`src/systems/Transit.ts`). Mapeo del contrato `{stationId,name,lines,platforms,connections,position,hasMap}`: `stationId` = `TransitStop.id` / `station`; cada andén es una parada; `connections` = `TRANSFERS` más la propia línea (`destinationsFrom`); `hasMap` = `visitable()`. `position` no se guarda en el grafo porque los minutos salen de `order` × `minutesPerStop`.
- **Destino jugable.** Polígono Norte y su Decathlon/calle (`poligono-norte`, spawn `pn-metro`), alcanzable por `decathlon-station` / `decathlon-l3-station`.
- **Estado de viaje.** `MetroJourney {version:1, phase:'platform', station}` en `Transit.ts`. Mapeo del contrato: entering/waiting = sin journey o andén; paid = journey no nulo; transferring = pasillo con `journeyAfterPortal()`; exiting = journey `null` al salir. `paidFare`, `startedAt`, `transferCount`, `lineId` y `platformId` NO se guardan, y no hacen falta: la tarifa se cobra y persiste en el saldo, la llegada se confirma antes del fundido, y `station` ya identifica el andén (y, por `stopAtStation`, la línea).
- **Persistencia elegida.** Reconstruir en estación válida. `SAVE_VERSION` 3; migración `version < 3` a `metroJourney: null` (`SaveSystem.ts`, ~línea 636); `parseMetroJourney()` descarta todo lo que no sea `version 1`, `phase 'platform'` y `station` igual a la localización guardada.
- **Estación válida** (`SaveSystem.ts`, ~113-120). Se conserva la posición guardada si `ty >= metro.walkRow` y es transitable; si no, spawn `'train'` con billete o `'entry'` sin él. No altera saldo ni reloj.
- **Tiempo y tarifa.** €2 fijos (`METRO_FARE`) y 15 min por parada (`METRO_MINUTES`). Cancelar antes de subir no cobra, así que no hay nada que reembolsar.
- **Sin doble cobro.** `journeyFare()` (0 si el journey está en el andén de origen), `prepareRide()` sin efectos, `canBoard` (`WorldScene`: sin `leaving` y con puertas abiertas), menú cerrado antes de confirmar (`Menus.ride()`), y llegada guardada antes del fundido (`arriveByTrain`).
- **Entrada física.** Portal de calle a `*-station`, spawn `entry`; el vestíbulo y los torniquetes son el mapa de `platform()`.
- **Pago/validación.** La tarjeta se cobra al subir al primer tren; el billete vale hasta salir a la calle.
- **Elección de andén.** El jugador la elige caminando, por el pasillo `transfer`; el menú `Menus.board()` sólo ofrece destinos del andén actual.
- **Espera.** `TrainSystem` y puertas; `board()` se abre con puertas abiertas; cancelar con «Quedarme en el andén» o Esc.
- **Transbordo.** Sin recargo y sin tiempo límite: el billete vale hasta salir a la calle. `journeyAfterPortal()` mueve el journey al andén destino sólo si hay correspondencia.
- **Salida.** Portal a la calle; `journeyAfterPortal()` devuelve `null`, por lo que el journey se borra.
- **Destinos sin mapa.** Hoy ninguno en `STOPS`. `visitable()` y `prepareRide()` los bloquean y `board()` lo dice («Sin mapa visitable: no se puede viajar aquí.»).
- **Sin teletransporte implícito.** El portal `train` sólo se ofrece con puertas abiertas (`WorldScene` filtra el portal `train` si `!metro.train.doorsOpen`). Aclaración: el viaje en sí es una transición con fundido y avance del reloj, no un recorrido caminando dentro del tren.
- **NPC en vías.** `metro.edgeRow` 5 y `metro.walkRow` 6 (únicos valores en `locations.ts`, dentro de `platform()`; vía hasta y=80 medida en arena-station); guardias y `waitingSpots` validados como transitables y fuera de vía en `scripts/check-metro-transfers.ts`.
- **Portales falsos.** `validate()` (`LocationSystem.ts`; rechaza un portal `train` sin `metro`), comprobación de correspondencias al cargar `Transit.ts` (lanza «Correspondencia sin pasillo») y portal `train` filtrado sin puertas.
- **Presupuesto.** `BUDGETS` (`src/config/budgets.ts`) y `life.perf()`; el check exige `passengerPool + securityCount < BUDGETS.low.agents`.

## C) Diagnóstico del fallo «caminar y a 192»

Causa medida, no hipótesis: pestaña en segundo plano. `requestAnimationFrame` bajó a 1 por segundo (`rawDelta` ≈ 1000 ms, `actualFps` 1) y el jugador avanzaba 1-5 px/s con velocidad 76, sin bloqueo ni diálogo. Con la pestaña al frente: 60 FPS y el e2e pasa. Hipótesis descartadas: diálogo abierto, foco, NPC, restore.

Segundo falso fallo: «primera validación: €2» en un segundo recorrido en la misma página. En `run()`, `new SaveSystem().save(s); frame.src='/'` dejaba vivo el juego anterior del iframe, que guarda al descargarse y pisaba la partida limpia (se midieron tarjeta y viajes heredados). En contexto limpio pasa. Arreglo: `run()` descarga el iframe (`about:blank`, espera de `load` acotada a 5 s) antes de crear y guardar la partida limpia. Ningún fallo era del juego.

Tercer falso fallo: «caminar y a 208» en `exit()`: tolerancia del arnés igual al margen del carril entre torniquetes (±3 px); el jugador en x=180,9999 rozaba el torniquete. Se alineó el retorno anticipado de `axis()` con su criterio de parada (`<=2`). No es un fallo del juego: un jugador real se corrige moviéndose un poco.

## D) Casos

| caso | pasos | esperado | obtenido | PASS/FAIL/NO VERIFICADO | notas |
| --- | --- | --- | --- | --- | --- |
| ida | Arena → Puerta Central → pasillo → L3 → Polígono Norte → calle | reloj +15 min por tramo; L3 incluida en el billete | e2e escritorio (Chrome 156, Windows, teclado y ratón sintéticos, iframe 1100×760): PASS | PASS | Sintético. Móvil emulado: tarjeta\|viajes 10\|0 → 8\|1 → 8\|2 |
| vuelta | Polígono Norte → L3 → pasillo → Puerta Central → Arena → calle | nueva validación €2; transbordo de vuelta sin recargo | e2e escritorio PASS: 4 viajes; móvil emulado, registro 8\|2 → 6\|3 → 6\|4 | PASS | Medida con el mismo e2e |
| transbordo | Puerta Central L2 ↔ L3 por el pasillo `transfer` | 2 min, sin recargo, billete conservado | e2e PASS (tarjeta 8 antes y después); check: correspondencias simétricas, saldo cero | PASS | `check-metro-transfers.ts` |
| pago sin doble cobro | Confirmar destino; repetir/recargar | un solo cobro de €2 por billete; llegada guardada antes del fundido | e2e: «reloj de trayecto», «saldo coherente», «guardado anterior al fundido» PASS; medianoche 23:55 con destino y tarifa confirmados (móvil emulado) | PASS | Cubierto también en el check |
| elección de andén | Caminar al pasillo y elegir L2 o L3 | sólo destinos del andén; sin salto directo de línea | check: `prepareRide` L2→L3 rechazado; e2e PASS | PASS | Sintético |
| espera y cancelación | arena-station: abrir menú; «Quedarme en el andén» y Esc | saldo sin cambio, sin viaje, journey null | Medición manual en navegador: ambos casos sin cambio de saldo, viaje ni journey | PASS | Manual |
| salida | Andén → portal a la calle | journey null | e2e PASS: «salir termina la validación»; check: `journeyAfterPortal` → null | PASS | Estación sin mapa en juego: ver «destinos sin mapa» |
| destinos sin mapa | Intentar viajar a una parada sin mapa | rechazo, sin cobro, el menú lo dice | check con parada sintética: `visitable` false y `prepareRide` rechaza; hoy no existe ninguna en `STOPS` | NO VERIFICADO | Salir en estación sin mapa en juego: no existe ninguna hoy; sólo cubierto con la parada sintética del check |
| recarga | Recargar en entrada, tras el primer tramo, en el pasillo, en la salida | estación, saldo, validación, viajes y reloj conservados | e2e: cuatro recargas PASS (reloj +0..4 min); check: restauración idempotente | PASS | Escritorio y móvil emulado |
| retorno tras recarga | Continuar y seguir el trayecto | continúa sin recobrar | e2e PASS: tras cada recarga el recorrido siguió hasta el final | PASS | Sintético |
| NPC en vías | 1070 muestras en un ciclo completo del tren (AWAY, APPROACHING, ARRIVING, STOPPED, DOORS_OPENING, BOARDING, DOORS_CLOSING, DEPARTING) | ningún NPC por encima de la vía | Pie más alto y=93, vía hasta y=80; máximo 4 visibles; e2e: «ningún NPC visible en las vías» | PASS | Manual en arena-station; spots validados en el check |
| portal falso | Cargar locations/Transit con portales o correspondencias inválidos | error al arrancar | check: `validate()` por estación y correspondencias simétricas con spawn real | PASS | Estático, no en juego |
| presupuesto de simulación | `life.perf()` tras el recorrido | `over` vacío | Escritorio 57 FPS; móvil emulado 58 FPS; manual: FPS mínimo 59.8, 4 agentes, 196 objetos; `perf.over` vacío | PASS | |
| teclado y ratón | Recorrido completo con eventos sintéticos | sin menú residual | e2e escritorio PASS: 49 PASS, 57 FPS, over vacío | PASS | Teclado/ratón sintéticos, no dispositivos reales |
| móvil emulado | iframe 390×844, punteros táctiles sintéticos | recorrido completo; sin desbordamiento horizontal | 51 PASS, 0 FAIL; sin desbordamiento a 390 px; 58 FPS; over vacío. Registro tarjeta\|viajes\|sitio: 10\|0 arena, 10\|0 arena-station, 8\|1 puerta-central-station, 8\|1 puerta-central-l3, 8\|2 decathlon-l3, 8\|2 poligono-norte, 8\|2 decathlon-station, 8\|2 decathlon-l3, 6\|3 puerta-central-l3, 6\|3 puerta-central-station, 6\|4 arena-station, 6\|4 arena | PASS | Emulación, NO teléfono real |
| móvil físico | Recorrido en un teléfono real | igual que el emulado | No se hizo | NO VERIFICADO | No hay teléfono real |
| no regresión | HUD a 390 px; guardado y economía; Vallesco→Ribera; cámara, zoom, HUD, iluminación | sin cambios | HUD a 390 px sin desbordamiento; guardado y economía por el check; Vallesco→Ribera descontó €2 de la tarjeta; cámara, zoom, HUD e iluminación no se tocaron | PASS | PASS sólo para lo medido. Safe-areas en dispositivo real: NO VERIFICADO. LV-01 no está cerrado según `AGENDA-ESTIMACIONES-LV04.md` (líneas 173 y 429) y `VERIFICATION-WEEK-LV01.md` no documenta cierre: comportamiento en LV-01 NO VERIFICADO |

## E) Limitaciones y riesgos

- El estado de viaje no serializa las fases intermedias del tren (AWAY a DEPARTING): se reconstruye en estación válida.
- No hay tiempo límite de transbordo; el billete vale hasta salir a la calle.
- El e2e requiere la pestaña al frente.
- Las pruebas son sintéticas (eventos de teclado y puntero, iframe emulado); no hay dispositivo real.

## Comandos

Ejecutados el 2026-11-09 con el árbol final de `src/`. Después sólo cambiaron este documento y `scripts/lv07-e2e.html`, que no entran en el build ni en `npm run check`.

```text
$ npm run build
✓ built in 1.20s
BUILD_EXIT=0

$ npm run check
check-avatar: ok
LV-07 PASS: red L2/L3, ida-vuelta, 10 fases guardadas, tarifa única, saldo cero, medianoche, migración, corrupción, vías, puertas/portales y presupuesto.
check-city-life: schedules, occupancy, work/community priority, revisit, invalid time, old-compatible save and seven-day economy OK
CHECK_EXIT=0
```

E2E final con los arreglos del arnés, Chrome 156 en Windows, `scripts/lv07-e2e.html` en el puerto 5197, pestaña al frente y ambos seguidos en la misma página:

```text
RESULTADO PASS · desktop · ida/vuelta con correspondencias y cuatro recargas reales   (49 PASS, 57 FPS, over vacío)
RESULTADO PASS · mobile · ida/vuelta con correspondencias y cuatro recargas reales    (51 PASS, 58 FPS, over vacío)
```

`git diff --stat` (sin commit; incluye los cambios previos de LV-05 y LV-06, y no cuenta `METRO-LV07.md` por ser nuevo):

```text
 package.json              |   2 +-
 scripts/lv07-e2e.html     |   9 +-
 src/data/appearance.ts    |  40 ++++++---
 src/data/places.ts        |   2 +-
 src/data/retail.ts        |   4 +-
 src/data/tattoos.ts       |  11 ++-
 src/scenes/Menus.ts       | 219 ++++++++++++++++++++++++++++++++++++++--------
 src/state/GameState.ts    |  22 +++++
 src/style.css             |  26 ++++++
 src/systems/Appearance.ts | 129 +++++++++++++++++++++++++--
 src/systems/Retail.ts     |  51 ++++++++++-
 src/systems/SaveSystem.ts |  14 +++
 src/types/game.ts         |   3 +
 src/ui/Menu.ts            |  21 +++++
 src/world/HumanArt.ts     |  13 ++-
 15 files changed, 498 insertions(+), 68 deletions(-)
```
