# LV-04 · Agenda con estimaciones de viaje y márgenes fiables

6 nov 2026 · rama `alpha-09-fachada` · base `d3fdfc0` (árbol limpio al empezar: `git status` vacío, `git diff` vacío).
Sin commit. Fuente del ticket: README.md § Limitaciones actuales, líneas 747-748 («El viaje de la agenda es una
estimación; no incluye colas, semáforos ni obstáculos humanos. Sin ruta conocida se dice "sin estimación".»). El enlace
de GitHub no se ha abierto; el README del repositorio es el mismo texto.

Entrega parcial en el orden del ticket. **Fase 1** hecha (este documento). Fases 2–5: ver «Pendiente».

## Fase 1 — Auditoría

### 1. Cómo se calcula hoy

- **Viaje:** `src/systems/Agenda.ts` `travelHint(from, where)` (≈289-322). No usa la ruta real: de
  `systems/Navigation.ts` sólo importa `findPoint` (≈13), ni `route` ni `worldRoute`.
  - `walk(a, b)` (≈273): distancia Manhattan en tiles × `WALK_PER_TILE`, redondeada hacia arriba.
  - `WALK_PER_TILE` (≈238) = (TILE / PLAYER_SPEED) × GAME_MINUTES_PER_REAL_SECOND × 1,3. El 1,3 es el rodeo por
    aceras: supuesto, no medido.
  - `METRO_WAIT` (≈240) = ceil(METRO_CONFIG.firstArrivalDelay / 1000 × 2) = **8 min de juego, fijo**.
  - `STATION_WALK` (≈242) = 5 min por puerta de estación; un trayecto en metro suma 2 × 5 (≈320).
  - Desde un interior se suma 1 min fijo para salir (≈296).
- **Textos:** mismo mapa «~N min a pie» (mín. 1); metro por parada «metro Lx · ~N min»; entre barrios
  «metro L2 · ~N min» (dice L2 también para L3); inalcanzable «sin ruta estimable» (`NO_ROUTE`, ≈282); «a pie · sin
  estimación» (≈316) y «metro · sin estimación» (≈319); fuera de mapa (`fromOffMap`, ≈325-333) «ya estás aquí» o
  metro; desde el móvil «desde el móvil», 0 min (≈290).
- **Margen:** `margin(c, now, hint)` (≈347-352) usa `hint.minutes ?? 0`: **con estimación nula el viaje cuenta
  como 0 min** y sale «ok». Ventana «tight» fija de 20 min; plazos con 6 h. `marginLabel` (≈355-360): «ya no llegas»,
  «llegarás tarde», «sal ya» o vacío.
- **Avisos:** `leadOf` (≈395-398): viaje + 30 min, mínimo 45. Compromisos (`commitments`, ≈144-231): turno, clase,
  tutoría, entrega, cuentas, planes del móvil, quedadas, partidos con entrada y actividades optativas (sin aviso).
- **Recálculo:** `src/main.ts` `reviewAgenda` (≈197-240), enganchado a `state.on('change')` y a los avisos de job,
  study, household, phone, story y housing (≈241-248). Deduplica por «minuto|sitio|offMap», es decir, como mucho una
  vez por minuto de juego (≈0,5 s reales). El HUD se fija con `hud.setNext` (≈229-238). Phone, app Hoy
  (`src/ui/Phone.ts` ≈490-510), llama a `travelHint` en cada render.
- **Aviso de recarga:** `main.ts` ≈235-237 sólo mira si la tarjeta cubre ida y vuelta (2 × tarifa).
- **Metro:** tarifa y minutos en `src/config/constants.ts` (`METRO_FARE` 2, `METRO_MINUTES` 15), no en `data/`.
  `src/data/transit.ts`: `LINES` (L2 y L3, horario [0, 24]), `STOPS`, `TRANSFERS` (2 min).
  `src/systems/Transit.ts`: `destinationsFrom` (|orden| × 15: Vallesco–Ribera 15, Vallesco–Arena 60), `routeBetween`
  (Dijkstra con transbordos), `serviceOpen` y `prepareRide` (al pagar). **La agenda no consulta `serviceOpen`.**
  Esperas en `src/config/metro.ts`: intervalo de 20 000 ms con límites [14 000, 34 000] ms y retrasos, es decir,
  28-68 min de juego entre trenes según la configuración (pendiente de confirmar en el planificador de trenes).
- **Lugares:** `data/places.ts` `hours` y `hoursByDay`; `systems/Places.ts` `isOpen` y `openingDay`. **La agenda no
  mira si el sitio está abierto a la llegada.**
- **Jugador:** `src/entities/Player.ts` `move()` a `PLAYER_SPEED` = 76 px/s. Ni correr, ni energía, ni clima
  cambian la velocidad.

### 2. Qué modela la simulación y qué no

| Factor | Hoy | Evidencia |
| --- | --- | --- |
| Distancia a pie | Aproximada: Manhattan × 1,3 | Agenda.ts `WALK_PER_TILE`, `walk` |
| Ruta real por aceras | No (no se llama a `route`/`worldRoute`) | Agenda.ts imports |
| Semáforos | Existen para NPC y tráfico; **el jugador no se detiene** | systems/Signals.ts; Player.ts sin referencias |
| Tráfico | Simulado; sin colisión con el jugador encontrada (verificar en Fase 2) | systems/Traffic.ts |
| Colas en estación | No | — |
| Espera del tren | Sólo la primera llegada (8 min) frente a 28-68 min configurados | Agenda.ts `METRO_WAIT`; config/metro.ts |
| Transbordo L2/L3 | 2 min de pasillo | data/transit.ts `TRANSFERS` |
| Clima, energía, estado | No afectan a la velocidad | Player.ts |
| Obstáculos humanos | No en la estimación | — |
| Horario del lugar al llegar | No consultado | Agenda.ts; Places.ts `isOpen` |
| Horario del metro | No consultado | Transit.ts `serviceOpen` |
| Saldo para el viaje | Sólo aviso del HUD (tarjeta ≥ 2 × €2) | main.ts |

Lo que no se modela (colas, semáforos, vehículos, gente) se declara como **incertidumbre**, no como minutos.

## Definiciones previas

### Métrica de error
- Por recorrido: estimado E (minutos de `travelHint` al salir) y real R (minutos de juego de la salida a la
  llegada). Error absoluto |E − R| en minutos y relativo |E − R| / R en %.
- Por tramo (a pie, espera, metro, transbordo) y en total: mediana, media y p95 (interpolación lineal).
- **Aprobado**, por tipo y en total: mediana relativa ≤ 20 % **y** mediana absoluta ≤ 5 min. El p95 se informa, pero
  no es requisito de aprobado hasta tener datos de la Fase 2.

### Muestras mínimas
Cinco tipos: casa-trabajo (Decathlon, Polígono Norte), casa-estudio (centro de estudios), quedada, tren (metro entre
paradas) e intermodal (a pie + metro + a pie). Al menos 3 de cada uno en 2 franjas de `HOUR_BANDS`: punta (8-10 o
18-20:30) y valle (10-13). Total ≥ 15. Un tipo sin destino posible se documenta como hueco y no se inventa.

### Margen
Total = F + k·P, con margen U aparte.
- **F (fijo):** 1 min de salida desde un interior, 2 × `STATION_WALK` y la espera del tren. La espera pasará a la
  mitad del intervalo medio de `config/metro.ts`.
- **P (proporcional):** el tiempo a pie y en metro, con k = 0,15.
- **U (incertidumbre por tramo):** a pie ±2 min; metro en valle ±4; metro en punta ±6; intermodal, la suma de sus
  tramos.
- `marginMin` = U.

Son valores iniciales, a calibrar con la Fase 2.

### Categorías de puntualidad
Con start = hora de presentarse y close = límite:
- **sin estimación:** no hay total fiable; sin categoría.
- **tarde:** ahora + total > start («ya no llegas» si además ahora + total > close).
- **justo:** ahora + total ≤ start < ahora + total + marginMin.
- **con margen:** ahora + total + marginMin ≤ start.

Las tres son absolutas en minutos; el margen ya lleva la parte proporcional al trayecto.

### Salida recomendada
salida = start − total − marginMin. Si ya ha pasado: «sal ya». Para los plazos, la misma fórmula sobre la entrega.

### Incertidumbre
«±N min», con N = marginMin. Nivel: baja (≤ 2), media (3-5), alta (> 5). En el HUD sólo «±N min».

### Esquema de la estimación (decisión: **no se persiste**)
```
Estimate {
  originId: string;          // sitio + tile de salida, u 'offmap:<parada>'
  destinationId: string;     // clave del compromiso
  hour: number;              // minuto absoluto de salida
  tramos: { kind: 'walk' | 'interior' | 'wait' | 'metro' | 'transfer'; minutes: number; uncertainty: number; line?: string }[];
  totalMin: number | null;   // null = sin estimación
  marginMin: number | null;
  category: 'con margen' | 'justo' | 'tarde' | null;
  uncertainty: { plusMin: number; level: 'baja' | 'media' | 'alta' } | null;
  computedAt: number;
  source: 'model-v1';
}
```
**Lo implementado** (`TripEstimate`, en `src/systems/Agenda.ts`) es `{ tramos[], totalMin, marginMin, category,
uncertainty, departAt, text }`. Origen y destino son los argumentos de `estimateTrip`. `hour` y `computedAt` coinciden
con `now`, y `source` no hace falta porque la estimación no se guarda nunca: se calcula de nuevo con el modelo que
haya.

Se recalcula a partir del estado, como hoy, y no se guarda nada nuevo. El guardado (SaveSystem v3, ranuras de
LV-02) no cambia. Si algún día hiciera falta guardarlo, iría como campo opcional de `AgendaState` validado en
`parseAgenda`, sin subir la versión.

### Recálculo
Se recalcula al cambiar de sitio u offMap, al llegar a un destino, con un salto de reloj (dormir, turno, metro), al
cambiar el saldo de la tarjeta y al cambiar turno, curso, quedada o plan. Como mucho una vez por minuto de juego,
con clave salida (tile) + destino + minuto. El HUD y la app Hoy comparten el mismo cálculo.

### Casos de «sin estimación» (en español)
| Caso | Texto | Hoy |
| --- | --- | --- |
| Sin ruta conocida | «sin estimación: no hay ruta conocida» | «sin ruta estimable» (no coincide con el README) |
| Barrio vecino a pie | se estima a pie | «a pie · sin estimación» (**fallo**) |
| Estación sin puerta conocida | «sin estimación: no se encuentra la puerta de la estación» | «metro · sin estimación» |
| Sin metro a esa hora | «sin metro a esa hora» | no se consulta; hoy L2 y L3 dan servicio 0-24 |
| Sin saldo para el billete | «sin estimación: falta saldo para el billete de €2» | sólo el aviso del HUD |
| Metro cerrado | no existe en el juego: no se implementa | — |
| Lugar cerrado al llegar | aviso aparte, no «sin estimación» | no se consulta |

Regla: una estimación nula **no** cuenta como 0 min. El margen se juzga sólo por la hora y la categoría queda
vacía.

### Sugerencia frente a ejecución
La agenda sólo informa (texto, tramos, minutos). No mueve al jugador, no teletransporta y no tiene botón «ir».

### Tarifas y horarios
- Tarifa y minutos por parada: `config/constants.ts`, leídos por `data/transit.ts`. Es una desviación documentada
  de «todo en data/»; no se mueven en este ticket.
- Servicio del metro: `data/transit.ts` `LINES.hours`.
- Horarios de los lugares: `data/places.ts`.
- Velocidad a pie y reloj: `config/constants.ts`.

### Registro comparativo (Fase 2)
Tabla con estas columnas: trayecto, origen, destino, hora, tramos, estimado (min), real (min), error abs (min),
error rel (%), categoría y notas.

## Fase 2 — Medición empírica (6 nov 2026)

**Condiciones.** `localhost:5199` (dev, árbol en `d3fdfc0` + este documento), Chrome con contexto aislado `lv04` y
partida nueva. Ventana de escritorio al frente; los fps se registran al salir y al llegar (60-62) desde la tanda 2
(las 10 primeras medidas no los registran; la pestaña iba a ≈51-61 fps). **Piloto** (script de QA, no está en el
repo): pulsa W/A/S/D *mantenidas* hacia la casilla siguiente de `Navigation.tilePath` (la misma ruta que usa el
juego); si se atasca 1,2 s (un NPC parado, una esquina), da un paso lateral y vuelve a calcular la ruta. Las puertas,
con E. En el andén espera a que el tren abra puertas y elige el destino en el menú del tren. **Nunca coloca al
jugador**: sin `setPosition` ni guardado editado dentro de un tramo medido. El estimado es `travelHint(posición,
destino)` al salir, el mismo número que enseña la agenda; el real son los minutos de reloj de juego desde la salida
hasta la llegada a la casilla de destino (la puerta de calle). LV-01 no está cerrado: el piloto conduce mejor que una
persona (no se para a mirar), así que lo «real» es una cota inferior de lo que tarda alguien jugando.

Descartados (2): «casa→Decathlon» de las 17:27, porque la partida no tenía tarjeta y la opción del tren estaba
apagada (correcto por parte del juego); y «Ribera→casa» de las 13:28, porque el piloto no logró salir de la estación
(fallo del piloto, no del juego). Hubo además una pausa del juego provocada por el piloto (un Escape sin menú
abierto), fuera de cualquier tramo medido.

### Registro comparativo (28 recorridos válidos)

| Trayecto | Origen | Destino | Hora | Tramos | Estimado (min) | Real (min) | Error abs (min) | Error rel (%) | Categoría (hoy) | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| casa-estudio | Olmo 7 (41,51) | Centro de estudios (41,18) | 09:28 | a pie | 19 | 27 | 8 | 30 | tarde si se sale a la hora justa | fps sin registrar (tanda 1) |
| estudio-casa | Centro de estudios | Olmo 7 | 10:15 | a pie | 19 | 27 | 8 | 30 | tarde si se sale a la hora justa | fps sin registrar |
| casa-trabajo | Olmo 7 | Atalaya (65,27) | 10:42 | a pie | 27 | 20 | 7 | 35 | llega (estimación ≥ real) | fps sin registrar |
| trabajo-casa | Atalaya | Olmo 7 | 11:02 | a pie | 26 | 19 | 7 | 37 | llega (estimación ≥ real) | fps sin registrar |
| quedada | Olmo 7 | Café Pausa (56,16) | 11:21 | a pie | 28 | 26 | 2 | 8 | llega (estimación ≥ real) | fps sin registrar |
| quedada | Olmo 7 | Café Molinillo (93,49) | 14:22 | a pie | 30 | 22 | 8 | 36 | llega (estimación ≥ real) | paso lateral ante NPC |
| quedada | Café Molinillo | Olmo 7 | 14:44 | a pie | 30 | 22 | 8 | 36 | llega (estimación ≥ real) |  |
| quedada | Olmo 7 | Café Pausa | 15:06 | a pie | 28 | 26 | 2 | 8 | llega (estimación ≥ real) |  |
| quedada | Café Pausa | Olmo 7 | 15:32 | a pie | 27 | 25 | 2 | 8 | llega (estimación ≥ real) |  |
| casa-estudio | Olmo 7 | Centro de estudios | 15:57 | a pie | 19 | 27 | 8 | 30 | tarde si se sale a la hora justa |  |
| casa-trabajo | Olmo 7 | Decathlon (puerta, Polígono Norte 38,14) | 21:16 | a pie + metro L2 + a pie | 65 | 69 | 4 | 6 | tarde si se sale a la hora justa | 62/62 fps |
| trabajo-casa | Decathlon | Olmo 7 | 22:39 | a pie + metro L2 + a pie | 66 | 64 | 2 | 3 | llega (estimación ≥ real) | 62/62 fps |
| tren | andén Vallesco | andén Ribera | 00:04 | metro | 29 | 28 | 1 | 4 | llega (estimación ≥ real) | desde el vestíbulo |
| tren | andén Ribera | andén Vallesco | 00:34 | metro | 29 | 19 | 10 | 53 | llega (estimación ≥ real) | ya en el andén |
| tren | andén Vallesco | andén Cuatro Ríos | 00:55 | metro | 29 | 17 | 12 | 71 | llega (estimación ≥ real) | ya en el andén |
| intermodal | Olmo 7 | Escuela de Baile, Ribera (3,9) | 03:03 | a pie + metro + a pie | 56 | 61 | 5 | 8 | tarde si se sale a la hora justa |  |
| intermodal | Escuela de Baile | Olmo 7 | 04:06 | a pie + metro + a pie | 56 | 62 | 6 | 10 | tarde si se sale a la hora justa |  |
| intermodal | Olmo 7 | Velaria (35,22) | 05:25 | a pie + metro + a pie | 60 | 67 | 7 | 10 | tarde si se sale a la hora justa |  |
| intermodal | Velaria | Olmo 7 | 06:34 | a pie + metro + a pie | 60 | 62 | 2 | 3 | tarde si se sale a la hora justa |  |
| casa-estudio | Olmo 7 | Centro de estudios | 08:01 | a pie | 19 | 26 | 7 | 27 | tarde si se sale a la hora justa | punta |
| estudio-casa | Centro de estudios | Olmo 7 | 08:29 | a pie | 19 | 27 | 8 | 30 | tarde si se sale a la hora justa | punta |
| casa-trabajo | Olmo 7 | Atalaya | 08:58 | a pie | 27 | 20 | 7 | 35 | llega (estimación ≥ real) | punta |
| trabajo-casa | Atalaya | Olmo 7 | 09:20 | a pie | 27 | 20 | 7 | 35 | llega (estimación ≥ real) | punta |
| quedada | Olmo 7 | Café Pausa | 09:42 | a pie | 28 | 25 | 3 | 12 | llega (estimación ≥ real) | punta |
| quedada | Café Pausa | Olmo 7 | 10:09 | a pie | 28 | 26 | 2 | 8 | llega (estimación ≥ real) | valle |
| casa-trabajo | Olmo 7 | Decathlon | 10:51 | a pie + metro L2 + a pie | 65 | 67 | 2 | 3 | tarde si se sale a la hora justa | valle |
| tren | andén Polígono Norte | andén Vallesco | 12:09 | metro | 44 | 52 | 8 | 15 | tarde si se sale a la hora justa | desde el vestíbulo; valle |
| tren | andén Vallesco | andén Ribera | 13:03 | metro | 29 | 17 | 12 | 71 | llega (estimación ≥ real) | ya en el andén; valle |

«Categoría (hoy)» dice si quien saliera con la estimación justa llegaría a tiempo; la agenda actual no tiene
categorías de margen. Franjas: punta (8-10) y valle (10-13) para casa-estudio, casa-trabajo y quedada; tren e
intermodal tienen también medidas de madrugada, que no es ninguna franja de `HOUR_BANDS` (se anota la hora).

### Resultado frente al umbral (estimador actual)

| Grupo | n | Error abs (min) mediana / media / p95 | Error rel (%) mediana / media / p95 | Sesgo medio (E−R) | Umbral |
| --- | --- | --- | --- | --- | --- |
| estudio | 5 | 8.0 / 7.8 / 8.0 | 29.6 / 29.1 / 29.6 | -7.8 | FAIL |
| trabajo | 7 | 7.0 / 5.1 / 7.0 | 35.0 / 22.0 / 36.3 | 3.4 | FAIL |
| quedada | 7 | 2.0 / 3.9 / 8.0 | 8.0 / 16.5 / 36.4 | 3.9 | PASS |
| tren | 5 | 10.0 / 8.6 / 12.0 | 52.6 / 42.6 / 70.6 | 5.4 | FAIL |
| intermodal | 4 | 5.5 / 5.0 / 6.8 | 8.9 / 7.9 / 10.3 | -5.0 | FAIL |
| **total** | 28 | 7.0 / 5.9 / 11.3 | 21.2 / 23.5 / 64.3 | 0.7 | FAIL |

El sesgo medio total (+0,7) parece bueno, pero sale de errores grandes que se compensan.

**Causas, medidas:**
1. **A pie, distancia Manhattan × 1,3:** no ve los rodeos y no sabe que la ruta del juego es en L. Con la longitud de
   `tilePath` los cuatro trayectos dan **0,407-0,417 min por casilla** (teoría: 16 / 76 × 2 = 0,421). Al centro de
   estudios hay 65 casillas de ruta frente a 33 de Manhattan (19 estimados, 26-27 reales); a Atalaya hay 48 (27
   estimados, 20 reales).
2. **Tren desde el andén:** se suman igualmente el paseo desde la calle, 5 min de estación y 8 de espera: 29 frente a
   17-19.
3. **Espera del tren:** es variable (17 min reales en la parada contigua, con el tren ya en el andén, frente a 28 y
   52 cuando hubo que esperar). Es la mayor fuente de incertidumbre: va como ±, no como minutos fijos.

## Fase 3 — Estimación por tramos

**Archivos:**
- `src/config/agenda.ts` (nuevo): todas las constantes del cálculo, con nombre y comentario.
- `src/systems/Agenda.ts`: `estimateTrip(from, where, { start, now, peak, balance })` (nueva) y `travelHint`, que
  pasa a ser una envoltura. Corregidos `margin` y `marginLabel`.
- `src/main.ts`: `reviewAgenda` pasa `now` y el saldo de la tarjeta.
- `scripts/check-agenda.ts`.

**Modelo.** `tramos` = interior (1 min al salir de un interior) · a pie (longitud de `tilePath`, con √2 en las
diagonales, × 0,421 min por casilla; Manhattan × 1,3 sólo si no hay camino) · estación (5 min por extremo; 0 si ya
estás dentro) · espera · metro (15 min por parada, de `data/transit`) · transbordo. `totalMin` es la suma.
`marginMin` es la suma de incertidumbres:

| Tramo | ± |
| --- | --- |
| A pie por el camino real | max(1, ⌈15 % de los minutos⌉) |
| A pie por Manhattan | max(2, ⌈30 % de los minutos⌉) |
| Espera en valle | 10 |
| Espera en punta (franja `rush` de `HOUR_BANDS`) | 12 |
| Metro | 0 |
| Transbordo | 2 |

`category` y `departAt` = start − total − margen, según las Definiciones previas. La caché de longitudes de camino
guarda 256 entradas y se vacía al llenarse (comentario `ponytail:`).

**Calibración de la espera, medida:**
- Con `firstArrivalDelay` (8 min), los viajes de calle a calle salían 9-12 min cortos: casa → Decathlon 62 estimados
  frente a 74 y 73 reales; Ribera 52 frente a 59 y 62; Velaria 57 frente a 66.
- Despejando el resto de tramos, la espera real era de unos 15-20 min.
- La espera central pasa a **medio intervalo entre trenes**, `trainArrivalInterval` / 2 = 20 min de juego. Sale de la
  configuración y no está escrita a mano.

**Sin estimación (textos):**
- «sin estimación: no hay ruta conocida»
- «sin estimación: falta saldo para el billete de €2» (la tarifa sale de `LINES[0].fare`)
- «sin metro a esa hora» (`serviceOpen`; hoy L2 y L3 abren de 0 a 24, así que no se da)
- «sin estimación: a pie entre barrios» (sólo cuando no hay portal de calle directo)

Una estimación nula ya no cuenta como 0 min en `margin()`: da 'late' si ya ha pasado la hora y 'tight' si no.

**Pruebas:**
- `npx tsc --noEmit`: limpio.
- `check-agenda`: exit 0.
- Mutación: con `tilePath` anulado, `check-agenda` sale con exit 1 («a pie al centro: 19»); restaurado, exit 0.
- `npm run build` y `npm run check` completos: exit 0 los dos, antes del cambio de la espera.
- Tras el cambio de la espera, el test de «sal ya» se ajustó al total medido. Antes era una hora fija, las 8:50, que
  con 74 min ya es llegar tarde de verdad. Conserva los tres casos: «sal ya», «llegarás tarde» y «ya no llegas».

### Medición repetida con el estimador nuevo (16 recorridos, 60-62 fps)

| Tipo | Trayecto | Hora | Estimado | Real | Error abs | Error rel (%) | ¿Dentro del ±? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| tren | Vallesco→Ribera (andén) | 07:25 | 35 ±10 | 45 | 10 | 22 | sí |
| tren | Ribera→Vallesco (andén) | 08:12 | 35 ±12 | 19 | 16 | 84 | **no** |
| tren | Vallesco→Cuatro Ríos (andén) | 08:33 | 35 ±12 | 17 | 18 | 106 | **no** |
| estudio | casa-estudio | 09:43 | 28 ±5 | 27 | 1 | 4 | sí |
| estudio | estudio-casa | 10:12 | 28 ±5 | 27 | 1 | 4 | sí |
| trabajo | casa-Atalaya | 10:41 | 21 ±4 | 20 | 1 | 5 | sí |
| trabajo | Atalaya-casa | 11:03 | 21 ±4 | 20 | 1 | 5 | sí |
| quedada | casa-Pausa | 11:25 | 27 ±5 | 25 | 2 | 8 | sí |
| quedada | Pausa-casa | 11:52 | 27 ±5 | 26 | 1 | 4 | sí |
| quedada | casa-Molinillo | 12:20 | 23 ±4 | 22 | 1 | 5 | sí |
| quedada | Molinillo-casa | 12:44 | 23 ±4 | 22 | 1 | 5 | sí |
| trabajo | casa-Decathlon | 13:21 | 74 ±14 | 74 | 0 | 0 | sí |
| trabajo | Decathlon-casa | 14:37 | 74 ±14 | 73 | 1 | 1 | sí |
| intermodal | casa→Ribera | 15:52 | 64 ±14 | 59 | 5 | 8 | sí |
| intermodal | Ribera→casa | 16:53 | 64 ±14 | 62 | 2 | 3 | sí |
| intermodal | casa→Velaria | 17:57 | 69 ±13 | 66 | 3 | 5 | sí |

La medición se hizo con la espera antigua (8 min) y estos estimados están recalculados con la nueva (+12 en la
espera, y su margen). El estimador es determinista y los tiempos reales no dependen de él. `check-agenda` comprueba
que casa → Decathlon da entre 68 y 80 min.

| Grupo | n | Error abs (min) mediana / media / p95 | Error rel (%) mediana / media / p95 | Sesgo medio | Dentro del ± | Umbral |
| --- | --- | --- | --- | --- | --- | --- |
| estudio | 2 | 1.0 / 1.0 / 1.0 | 3.7 / 3.7 / 3.7 | 1.0 | 2/2 | PASS |
| trabajo | 4 | 1.0 / 0.8 / 1.0 | 3.2 / 2.8 / 5.0 | 0.8 | 4/4 | PASS |
| quedada | 4 | 1.0 / 1.3 / 1.8 | 4.5 / 5.2 / 7.5 | 1.3 | 4/4 | PASS |
| tren (desde el andén) | 3 | 16.0 / 14.7 / 17.8 | 84.2 / 70.8 / 103.7 | 8.0 | 1/3 | **FAIL** |
| intermodal | 3 | 3.0 / 3.3 / 4.8 | 4.5 / 5.4 / 8.1 | 3.3 | 3/3 | PASS |
| **total** | 16 | 1.0 / 4.0 / 16.5 | 4.5 / 16.8 / 89.6 | 2.8 | 14/16 | **PASS** |

**Por qué el tren desde el andén no alcanza el umbral:** en el andén, la espera es el tiempo que falta para *ese*
tren, de 2 a 30 min medidos. La agenda no ve el planificador de trenes de la escena (`WorldScene.metro`), y leerlo
sería acoplar `systems/` a Phaser. Por eso se da el valor medio con incertidumbre alta (±10-12). Cuando hay que ir a
la estación por la calle, el error se reparte y el grupo pasa. Para mejorarlo habría que exponer al estado «próximo
tren en N min» y usarlo como tramo de espera.

## Fase 4 — Interfaz

**Archivos:**
- `src/systems/Agenda.ts`: `departureText(c, est, now)`, que da «sal HH:MM · con margen», «sal ya · justo»,
  «sal ya · tarde», «ya no llegas» o '' si no hay estimación.
- `src/ui/Phone.ts`: `renderToday` usa `estimateTrip` con hora, ahora y saldo, y el texto de ayuda nuevo.
- `src/main.ts`: `reviewAgenda` → `hud.setNext`, cuya clave lleva la casilla.
- `scripts/check-agenda.ts`.

Sin CSS nuevo, sin cambios en HUD.ts, sin botón «ir» y sin teletransporte: la agenda sólo informa.

- **App Hoy:** «hoy 09:00 · Edificio Atalaya · planta 3 · ~22 min a pie ±4 · sal 08:34 · con margen». Ayuda: «El viaje
  es una estimación desde donde estás: el ± es su margen, y no cuenta colas, semáforos ni gente.»
- **HUD:** «Próximo · Turno en Atalaya · hoy 09:00 · Edificio Atalaya · planta 3 · sal 08:34 · con margen». Los
  minutos del viaje quedan en Hoy para que la línea quepa en el HUD móvil.
- **Recálculo:**
  - El HUD y el aviso se recalculan por clave minuto + sitio + offMap + **casilla**: como mucho una vez por casilla y
    minuto, nunca por frame.
  - Hoy se repinta al abrirlo, con los avisos del sistema (job, study, household, social) y cada 5 min de reloj.
    **No** se repinta al cambiar de casilla con Hoy abierto, porque con el móvil abierto no se anda.
  - La longitud de cada camino se guarda en caché (256 entradas por sitio + casilla de origen + casilla de destino).

## Fase 5 — QA (6 nov 2026)

`localhost:5199` (dev), Chrome (MCP chrome-devtools, Windows 11), contexto aislado `lv04`. Escritorio a 60-62 fps
con la pestaña al frente. **Móvil emulado** a 390×844, dpr 3, `mobile,touch`: no hay teléfono físico.

### Validación independiente (16 recorridos nuevos, constantes congeladas: espera 20 min)

Destinos y trayectos que no se usaron para calibrar. Mismo piloto y mismas condiciones que en la Fase 2. Se
descartan 6 intentos:
- «Parroquia→La Cepa»: desde esa casilla `tilePath` no encuentra camino. La estimación cae al recurso Manhattan
  (38 ±12) y el piloto tampoco puede andarlo.
- Barbería→Súper y Súper→Casa Tomás: el piloto se atasca junto a las tiendas.
- Intermodal casa→Cuatro Ríos: el piloto no sale de esa estación.
- Cuatro trenes a 2-4 fps: la pestaña pasó a segundo plano.

| Tipo | Trayecto | Hora | Estimado | Real | Error abs | Error rel (%) | ¿Dentro del ±? | Categoría al salir con la salida recomendada |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| a pie | casa→Gimnasio Forja | 09:01 | 33 ±5 | 32 | 1 | 3 | sí | con margen |
| a pie | Gimnasio→Parroquia | 09:35 | 7 ±2 | 5 | 2 | 40 | sí | con margen |
| a pie | La Cepa→Tinta Carmen | 09:44 | 31 ±5 | 30 | 1 | 3 | sí | con margen |
| a pie | Tinta Carmen→casa | 10:16 | 17 ±3 | 17 | 0 | 0 | sí | con margen |
| tren (andén) | Vallesco→Ribera | 17:50 | 35 ±10 | 17 | 18 | 106 | **no** | con margen |
| tren (andén) | Ribera→Vallesco | 18:25 | 35 ±12 | 57 | 22 | 39 | **no** | tarde |
| tren (andén) | Vallesco→Velaria | 19:32 | 50 ±12 | 82 | 32 | 39 | **no** | tarde |
| intermodal | Velaria→casa | 21:30 | 69 ±13 | 61 | 8 | 13 | sí | con margen |
| intermodal | casa→Casco Antiguo | 22:46 | 98 ±15 | 98 | 0 | 0 | sí | con margen |
| intermodal | Casco Antiguo→casa | 00:34 | 98 ±15 | 91 | 7 | 8 | sí | con margen |
| a pie | casa→Barbería Nati | 02:24 | 27 ±5 | 25 | 2 | 8 | sí | con margen |
| a pie | Casa Tomás→Olmo 11 | 02:55 | 30 ±5 | 29 | 1 | 3 | sí | con margen |
| a pie | Olmo 11→casa | 03:26 | 4 ±1 | 4 | 0 | 0 | sí | con margen |
| a pie | casa→Parroquia | 03:46 | 29 ±5 | 27 | 2 | 7 | sí | con margen |
| a pie | Parroquia→Gimnasio | 04:15 | 7 ±2 | 6 | 1 | 17 | sí | con margen |
| a pie | Gimnasio→casa | 04:23 | 32 ±5 | 31 | 1 | 3 | sí | con margen |

| Grupo | n | Error abs (min) mediana / media / p95 | Error rel (%) mediana / media / p95 | Sesgo medio | Dentro del ± | Umbral |
| --- | --- | --- | --- | --- | --- | --- |
| a pie | 10 | 1.0 / 1.1 / 2.0 | 3.4 / 8.5 / 29.5 | 1.1 | 10/10 | PASS |
| intermodal | 3 | 7.0 / 5.0 / 7.9 | 7.7 / 6.9 / 12.6 | 5.0 | 3/3 | FAIL (sólo por los minutos) |
| tren desde el andén | 3 | 22.0 / 24.0 / 31.0 | 39.0 / 61.2 / 99.2 | -12.0 | 0/3 | **FAIL** |
| **total** | 16 | 1.5 / 6.1 / 24.5 | 7.5 / 18.1 / 56.5 | -0.6 | 13/16 | PASS |

**Justificación de los dos FAIL:**
- **Intermodal:** el error relativo es bajo (7,7 %) y los tres caen dentro del ±. Pero en viajes de 61-98 min el límite
  de 5 min equivale al 5-8 %, más estricto que el 20 %. Toda la desviación viene de la espera del tren.
- **Tren desde el andén:** la espera real fue de 2 a 52 min en estas tres medidas y en las de las Fases 2 y 3. La
  agenda no conoce cuándo pasa el próximo tren, que vive en la escena (`WorldScene.metro`), y dar el valor medio no
  basta. El arreglo, fuera de este ticket, es exponer «próximo tren en N min» como opción numérica desde `main.ts` (sin
  importar Phaser en `systems/`) y usarla como tramo de espera. Mientras tanto la incertidumbre se muestra como alta
  (±10-12) y el texto no promete más.

### Pruebas dirigidas

| Prueba | Resultado | Evidencia |
| --- | --- | --- |
| Error medido | PASS en total y a pie; FAIL justificado en intermodal (minutos) y tren desde el andén | Tablas de arriba |
| Cambio de posición | PASS | De (41,51) a (53,39): Hoy pasa de «~22 min a pie ±4» a «~11 min a pie ±2 · sal 08:47» |
| Cambio de ruta (viaje, sitio, plan) | PASS en código y test (eventos de `reviewAgenda`); en navegador, el paso a «mañana» al perder el turno | `main.ts`; `check-agenda` |
| Cambio de horario | PASS | 08:00 «sal 08:34 · con margen», 08:34 «sal ya · justo», 09:01 «sal ya · tarde» en el HUD |
| Frecuencia de recálculo | PASS por lectura de código, sin contador medido | Clave por casilla y minuto; Hoy, cada 5 min |
| Sin estimación | PASS en test | Ruta, saldo y metro cerrado (horario simulado 6-23 a las 03:00), con mutación: sin la comprobación de horario, `check-agenda` falla («metro cerrado: sin total»). El barrido de todas las parejas de sitios no da ningún «sin estimación»: con los datos actuales `NO_DOOR` y `NO_BORDER` no se dan |
| Sugerencia frente a ejecución | PASS | `estimateTrip` es pura, no hay botón «ir» y todos los viajes medidos se anduvieron con teclas |
| Tarifas y horarios | PASS | Tarifa `LINES[0].fare`, horario `serviceOpen`, espera `trainArrivalInterval / 2`. Los márgenes van con nombre en `config/agenda.ts` |
| Avisos al recargar | PASS | Día 4 a las 08:25: el aviso sale una vez (`seen` job:4); tras recargar no reaparece |
| Avisos al dormir | PASS | Cama, día 5 a las 00:30, «Dormir (8 h)»: a las 08:30 el aviso sale una vez (`seen` job:5); tras recargar no reaparece |
| HUD móvil (ALPHA-09) | PASS en emulación | El HUD compacto esconde la línea tras «Detalles: agenda y tarjeta». Desplegada: dos líneas, de x 22 a 318 de 390, sin cortarse |
| Cámara, zoom y pixel art | PASS (escritorio y móvil emulado) | Sin cambios de código (el `git diff --stat` no toca WorldScene, ni CSS, ni world/). En escritorio, «+» lleva el zoom de 2 a 2,2 y «−» lo devuelve a 2; la cámara sigue al jugador (al andar 85 px el desplazamiento cambia 72 px); `roundPixels` sigue activo y la captura está nítida. En móvil emulado, el HUD de ALPHA-09 y el mapa se ven bien en la captura de 390×844. Sin teléfono físico |

**Fuera de alcance:** las filas de Hoy sin destino (partido, actividad optativa) se pueden seleccionar con W/S para
leerlas, pero no hacen nada al elegirlas (`Phone.ts`, `item(li, () => undefined)`). Ya era así en `HEAD`
(`d3fdfc0`, Phone.ts:515) y este ticket no lo toca.

## Pendiente

- **Tren desde el andén:** necesita que se exponga cuándo pasa el próximo tren (ver arriba).
- **Rendimiento de `tilePath`:** sin medir en mapas grandes. Es una BFS con `shift`, así que cada casilla de origen
  nueva cuesta una búsqueda por compromiso visible (como mucho 8 en Hoy).
- **Teléfono físico:** sin probar.
- **LV-01** no está cerrado: el piloto conduce mejor que una persona, así que los tiempos reales medidos son una cota
  inferior.
