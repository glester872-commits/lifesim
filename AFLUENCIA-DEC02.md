# DEC-02 (afluencia) · Empleados y afluencia dinámica en Decathlon

> **ID duplicado.** En el repo, `DEC-02.md` es el «rediseño espacial de Decathlon» (cerrado). Este ticket es otro trabajo con el
> mismo ID; su evidencia vive aquí y `DEC-02.md` no se toca.

Modo BALANCED. Rama `dec-01-atencion` (encima de DEC-01 sin commit; DEC-01 depende de los mismos módulos). Sin commit.

## Fase 1 · Estado inicial

- Ruta `C:\Users\glest\Documents\lifesim`, rama `dec-01-atencion`, base `3aa5929`.
- `git status` inicial: sólo los cambios de DEC-01 (M `package.json`, `src/data/decathlon.ts`, `retail.ts`, `services.ts`,
  `src/scenes/Menus.ts`, `WorldScene.ts`, `src/systems/Crowd.ts`; nuevos `DEC-01.md`, `DEC-01/`, `scripts/check-store-knowledge.ts`,
  `src/data/storeQueries.ts`, `src/systems/StoreKnowledge.ts`). `git diff --stat`: 7 archivos, +101 −12. Se conservan.
- HUD móvil (ALPHA-09): no hay constante de versión del HUD en `src`; sólo comentarios `ALPHA-09` en `src/config/constants.ts:22`
  y `src/world/PixelScale.ts:29`. Este ticket no toca HUD.

## Fase 1 · Auditoría (qué existe)

| Pieza | Dónde | Estado |
| --- | --- | --- |
| Parámetros comunes | `src/config/population.ts` `POPULATION` (niveles, tick 2,5–5 s, `maxChangesPerTick` 2, velocidades, holguras) | EXISTE |
| Perfil de Decathlon | `src/data/decathlon.ts` `DECATHLON_PROFILE` (`bands`, `weekday`, `maxVisitors` 14, `staff`, `visitors`) | EXISTE |
| Nivel por día y hora | `src/systems/Crowd.ts:40` `levelAt` = franja + `weekday[día]` + partido, recortado a 5 niveles; cerrado → `null` | EXISTE |
| Objetivo de visitantes | `Crowd.ts:76` `targetAt`: rango del nivel con semilla (sitio, día, tramo de 30 min), refugio por clima, tope `min(maxVisitors, aforo − personal)` | EXISTE |
| Personal en turno | `Crowd.ts:51` `staffOnShift(role, level, weekday)`: `days` + `minLevel`. **Sin horario** | PARCIAL |
| Recálculo | `Crowd.update` (:429): temporizador 2,5–5 s reales → `reconcile`; 1–2 altas/bajas por tick; nunca por frame | EXISTE |
| Altas/bajas | `enterVisitor`/`enterStaff` por la puerta; `leaveSoon` → `leave` → `remove`; cerrado: salen clientes y luego personal | EXISTE |
| IDs / no duplicación | `nextId++` único por sala; `pickLook` nunca repite cara; `SeatRegistry` (un punto, una persona); Handoff reserva identidades al salir | EXISTE |
| Al salir y volver | La sala no existe fuera; `populate` la reconstruye por semilla; no se guarda | EXISTE |
| Apertura / domingos | `src/systems/Places.ts` `hoursOn`/`isOpen`: `hours`, `days`, `closed` por día; `decathlon-tienda` `hours: [9, 21]` todos los días (`data/places.ts:243`) | EXISTE |
| Cajas | 6 con cajero (`open.days/minLevel`), cola por carril; autopago decorado | EXISTE |
| Probadores | 5 puntos `DECAT_FITTING_00..04`, una persona cada uno; sin cola (espera 1,5–3,5 s y, si sigue lleno, 25 % de saltárselo) | EXISTE |
| Demanda comercial | No existe. Sólo clima (refugio) y partido (estadio) | **FALTA** |
| Turnos apertura/intermedio/cierre | No existen | **FALTA** |
| Persistencia de NPC | No se guardan (`Crowd.ts:191-195`); `SAVE_VERSION` 5 | EXISTE (nada que migrar) |
| Rendimiento | `lifesim.perf()` frente a `src/config/budgets.ts`; topes `maxVisitors`/aforo | EXISTE |

## Fase 1 · Definiciones previas

- **Parámetros centralizados:** comunes en `config/population.ts` (rangos de nivel, tick, cambios por tick); por local en su perfil
  (`DECATHLON_PROFILE`): `bands` (picos por hora), `weekday` (desplazamiento por día), **`demand` (nuevo)**, `maxVisitors`, `staff`
  con `days`/`minLevel`/**`hours` (nuevo)**; cajas y su apertura en `DECATHLON_LAYOUT.checkouts[].open`; probadores = puntos
  `DECAT_FITTING_*`. Capacidad máxima = `min(maxVisitors, aforo de places.ts − personal en turno)`.
- **Cantidades configurables:** las edita el diseñador en esos datos, en build. No hay ajuste en runtime ni por el jugador.
- **Modelo de afluencia:** `nivel = clamp(franja(hora) + weekday[día] + demanda(fecha, hora) + partido, VERY_LOW..VERY_HIGH)`;
  `objetivo = rango(nivel)` con semilla por tramo de 30 min × clima × factor del día, con el tope de capacidad.
  Picos de Decathlon: 9–11 LOW, 11–14 MEDIUM, 14–17 LOW, 17–21 HIGH.
- **Demanda comercial:** dato de calendario del perfil, sin economía nueva (CLAUDE.md): reglas `{meses?, díasDelMes?, díasSemana?,
  desde?, hasta?, shift}` evaluadas con `dateOf(day)` de `systems/Calendar.ts`. Decathlon: rebajas de enero y julio (+1) y
  principio de mes, días 1–5 de 17 a 21 h (+1, «día de cobro»). La suma de demanda se limita a −1..+2.
- **Niveles:** los 5 existentes en `POPULATION.levels` (visitantes a la vez): VERY_LOW 0–2, LOW 2–4, MEDIUM 4–8, HIGH 8–14,
  VERY_HIGH 14–20. Equivalencia con el ticket: baja = VERY_LOW/LOW, media = MEDIUM, alta = HIGH/VERY_HIGH.
- **Plantilla:** fijos por sección (montaña, running, ciclismo) + Reposición; cajas 1–6; refuerzos por `minLevel` (cajas 2, 3, 6),
  por días (cajas 4–5 viernes–domingo `[4,5,6]`, fitness) y ahora por turno horario. Sin personas ni uniformes nuevos (los 11 chalecos ya
  están en uso; check-uniform exige que no se repitan).
- **Cajas y probadores:** 6 cajas con cajero, cada una abre por `open` + turno; cola de 2 plazas por caja; libera al cobrar.
  5 probadores, uno por persona, sin cola. Autopago: decorado (DEC-04).
- **Turnos (nuevo):** apertura 9:00–15:30, intermedio 12:00–18:00, cierre 14:30–21:00 (solapes 12–15:30 y 14:30–18). Cada rol
  tiene uno; caja 1 cubre todo el día para que nunca haya visitantes sin caja. Actividades: las que ya existen por oficio
  (cajero en su puesto; sección = ronda entre sus puntos cada 8–20 s; Reposición = ronda por toda la tienda; atender = DEC-01).
  Al acabar el turno, `leaveSoon` → sale por la puerta; al empezar, entra por la puerta. No se añaden «descansar» ni estados nuevos.
- **Apertura:** `places.ts` (`hours`, `days`, `closed` por día) vía `Places.isOpen`/`hoursOn`. Domingo abierto 9–21 por datos;
  cerrar un domingo = dato en `places.ts`, y con cerrado `levelAt` da `null` → 0 clientes y 0 personal.
- **Modelo de datos de NPC:** `Agent` de `Crowd.ts:97` (`id`, `kind` visitante/personal, `role`/`staffRole`, `state`, `plan`,
  `point`…). Equivalencias del ticket: `type` = `kind`, `section` = puntos de su rol (`sectionsOf` en DEC-01), `activity` = estado
  del plan, `spawnTime`/`despawnTime` implícitos en la reconciliación, `isPersistent` = false (nada en el guardado).
- **No duplicación:** `nextId++` único por sala, `pickLook` sin caras repetidas, un rol de personal = una persona como máximo
  (`reconcile` sólo entra si no hay nadie de ese rol). Quien sale y vuelve: al reentrar el jugador, `populate` reconstruye;
  ningún rol aparece dos veces.
- **Frecuencia de recálculo:** objetivo y turnos en cada tick de 2,5–5 s reales; la semilla cambia cada 30 min de juego. Nunca por frame.
- **Desaparición lógica:** clientes al terminar su plan o si sobran; personal al acabar su turno o al cerrar. Se destruyen (`remove`);
  no se reciclan ni se guardan.
- **Rendimiento:** FPS, frame time y nº de agentes con `lifesim.perf()`, más heap. Umbral: sin caída perceptible frente a la línea base
  y `over` vacío. Densa = sábado 18:00 en Decathlon.
- **Rutas:** las de `Navigation.route`/`tilePath` existentes (clientes: puerta → BROWSE → probadores → cola → caja → puerta; personal:
  puerta → puesto o ronda → puerta). `simulate-population` exige `pathFailures` 0.
- **Densidad:** agentes totales en la sala (personal + clientes), su tope por capacidad, y personal en turno por tramo de 30 min.
- **Formato de evidencia:** tabla al final de este archivo.

## Plan (Fases 2–5)

1. **Modelo:** `PopulationProfile.demand?` y `StaffRole.hours?` en `src/data/population.ts`; `levelAt` suma la demanda;
   `staffOnShift(role, level, weekday, t?)` respeta `hours` (las 7 llamadas actualizadas). Perfiles sin esos campos, idénticos.
2. **Población:** datos de Decathlon: demanda, turnos por rol, refuerzo de viernes y sábado, domingo por `weekday`.
3. **Ciclo de vida:** sin código nuevo; cubierto por `reconcile` (entra o sale al cambiar el turno).
4. **QA:** `scripts/check-footfall.ts` (determinista) + `npm run build` + `npm run check` + navegador + rendimiento antes y después.

## Implementación (Fases 2–4)

| Archivo | Cambio |
| --- | --- |
| `src/data/population.ts` | `StaffRole.hours?` (turno horario) y `PopulationProfile.demand?` con `DemandRule {months, dom, days, from, to, shift}` |
| `src/systems/Crowd.ts` | `demandAt` (suma recortada a −1..+2) sumada en `levelAt`; `staffOnShift(role, level, weekday, t?)` respeta `hours`; las 3 llamadas pasan la hora; **corrección de cierre**: `reconcile` ya no despide al personal por turno cuando el local está cerrado (`!scheduled && level !== null`), y decide el bloque de cierre (primero clientes, luego personal) |
| `src/systems/StoreKnowledge.ts` | `StoreNow.t`; `onShift` y `openCheckouts` respetan los turnos (DEC-01 coherente) |
| `src/data/decathlonLayout.ts` | `open.hours` de las cajas: 1 todo el día, 2 apertura, 3/5/6 cierre, 4 intermedio |
| `src/data/decathlon.ts` | Turnos de sala (running y Reposición apertura, montaña intermedio, ciclismo cierre, fitness vie–sáb cierre); `weekday [0,0,0,0,1,2,1]`; `demand` (rebajas ene/jul +1; días 1–5 de 17 a 21 h +1) |
| `scripts/check-footfall.ts` (nuevo) + `package.json` | Check determinista en la cadena |
| `scripts/check-decathlon.ts`, `scripts/simulate-population.ts` | Sólo pasan la hora a `staffOnShift` (sin relajar expectativas) |

Sin cambios en el guardado (`SAVE_VERSION` 5), HUD, cámara, arte ni UI.

## Fase 5 · Evidencia

| Caso (día, hora, turno) | Afluencia esperada | Afluencia observada | NPC activos | FPS / frame | Estado | Notas |
| --- | --- | --- | --- | --- | --- | --- |
| Lun–jue, punta 17–21 | HIGH | HIGH (índice 3) | — | — | PASS | check-footfall, semana 10–16 may 2027 sin demanda |
| Viernes, punta | > lun–jue | VERY_HIGH (4); cajas 18:00: 4 frente a 2 el martes | — | — | PASS | refuerzo de cajas 4–5 y fitness |
| Sábado, día completo | ≥ viernes en punta; mayor en el día | punta VERY_HIGH = viernes (tope de 5 niveles); 9–17 h un nivel por encima del viernes | 22–27 (navegador, 18–20 h) | 60 fps, peor 17,3–17,4 ms | PASS | empate en punta por el tope: límite documentado |
| Lunes 12 h frente a sábado 12 h | sáb > lun | lun MEDIUM objetivo 6; sáb VERY_HIGH objetivo 14 | 6–9 / 9–10 clientes (convergiendo) | — | PASS | navegador (gameplay-qa) |
| Domingo | abierto según `places.ts`; ≤ sábado | VERY_HIGH en punta, total del día < sábado | — | — | PASS | check-footfall |
| Cerrado (fuera de 9–21, o domingo cerrado por datos) | 0 clientes, 0 personal | 0 / 0 | 0 | — | PASS | check-footfall con un `PlaceInfo` sin domingo |
| Turno de salida (sáb 18:00: montaña, caja 4) | salen andando por la puerta | leaveSoon a las 18:05, LEAVE y fuera por (67,50) | — | — | PASS | navegador; montaña tarda ~1 h 20 min de juego en cruzar la nave |
| Turno de entrada (lun 14:30: ciclismo) y salida 15:30 (running, Reposición, caja 2) | entran y salen por la puerta | ciclismo ENTER en (70,49) a las 14:53; los de apertura LEAVE a las 15:35 | — | — | PASS | navegador |
| Picos por hora | 9–11 LOW, 11–14 MEDIUM, 14–17 LOW, 17–21 HIGH (+ día + demanda) | según tabla de check-footfall | — | — | PASS | |
| Demanda | rebajas y principio de mes suben un escalón | enero HIGH frente a MEDIUM en mayo (martes 12 h); día 3 a las 18 h +1; día 10 0; perfil sin demanda 0 | — | — | PASS | check-footfall |
| Cierre a las 21:00 | primero salen los clientes; el personal, cuando no queda nadie | ciclo 0 FAIL (el personal se iba con 11 clientes dentro, fallo previo a DEC-02); ciclo 1: personal 6 sin salir de 21:08 a 23:26 mientras quedan clientes, sale a las 23:32 con 0 | 19 → 0 | — | PASS | check-footfall «cierre sáb: 14 clientes fuera en 52 s reales con el personal dentro»; navegador |
| No duplicación | ningún rol ni cara repetidos | caras nunca repetidas; un rol repetido sólo tras saltos de reloj con `setClock` sin salir (uno saliendo, otro entrando) | — | — | PASS | en juego normal hay 12 h entre cierre y apertura |
| No recálculo por frame | tick 2,5–5 s | sin cambios en `Crowd.update` | — | — | PASS | |
| Rendimiento (sáb, cajas) | sin caída frente a la línea base | antes 22–23 agentes, peor 17,0 ms; después 22–23, peor 17,3 ms; `over` vacío | 22–23 | 60 / 16,6 ms | PASS | optimizer, Chrome 958×888 |
| Rendimiento (sáb, centro) | ídem | antes 25–27, peor 17,2 ms; después 21–24, peor 17,4 ms | 21–24 | 60 / 16,7 ms | PASS | |
| Rutas | `pathFailures` 0 | simulate-population OK | — | — | PASS | |
| Errores JS | 0 | 0 en todas las pasadas | — | — | PASS | |
| Salir y volver a entrar | se reconstruye sin duplicados | no probado en navegador | — | — | NO VERIFICADO | lo cubren `populate` por semilla y check-handoff |
| Móvil 390×844 / teléfono | sin regresión de HUD | no probado | — | — | NO VERIFICADO | no se tocó HUD |

Comandos: `npm run build` exit 0. `npm run check` completo (cadena de `package.json` ejecutada con bash; `npm run check` en
segundo plano se colgó dos veces antes del primer check, sin relación con el código): exit 0, 436 s, 2574 líneas; check-footfall y
check-store-knowledge OK en la cadena. Evaluador: PASS. Correcciones: 1/2.

Límites: viernes y sábado empatan en la punta (5 niveles); los clientes tardan ~1 min real (~2 h de juego) en vaciar la tienda al
cierre por la escala de tiempo (ya pasaba); el personal fijo queda en estado `ENTER` sin efecto (ya pasaba).

### Pendientes cerrados después (durante el QA de DEC-03)

| Caso | Esperado | Obtenido | Estado | Notas |
| --- | --- | --- | --- | --- |
| Salir y volver a entrar | La tienda se reconstruye sin duplicados | Vie 13:32 sale a Polígono Norte; vuelve a las 13:40: personal Caja 1, 2, 4, montaña, running y Reposición (el turno de esa hora), 17–19 agentes, sin caras ni roles repetidos | PASS | Chrome, escritorio |
| Móvil 390×844 (emulado) | HUD sin regresión con la tienda poblada | HUD arriba, botones E/VOLVER abajo, menú legible | PASS | `COMPRAS-DEC03/07-movil-390x844-perchero.png`; teléfono físico NO VERIFICADO |
