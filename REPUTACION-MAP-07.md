# MAP-07 · Reputación local por barrio (ciclo 1)

## Zona y por qué

La zona es el **barrio** de `LOCATION_DISTRICT` (`src/data/districtIdentity.ts`). Los interiores heredan el barrio de
la calle a la que salen (`systems/World.districtAt`), y las estaciones ya están mapeadas a su barrio. No se usan
`data/districts.ts` (perfil visual) ni `data/zones.ts` (afluencia por trozo de mapa): la reputación es de la gente del
barrio, no de un rectángulo del mapa. Barrio válido = clave de `DISTRICT_IDENTITIES`.

## Modelo y rango

- `src/data/reputation.ts`: constantes y disparadores. `src/systems/Reputation.ts`: reglas puras, sin Phaser.
- `ZoneReputation = { zoneId, value, lastUpdated, reasons: { id, delta, day }[] }`; `Reputation = Record<string, ZoneReputation>`.
- Rango −100…100, inicio 0, máximo 10 motivos por barrio (también memoria de idempotencia).
- `apply` devuelve objeto nuevo; mismo `reasonId` en el barrio → sin cambio; sin barrio o desconocido → sin cambio.

## Disparadores

| id | delta | clave | archivo:función |
|---|---|---|---|
| shift-done | +3 | `shift:<día>:<jobId>` | src/scenes/Menus.ts:shiftDecision |
| shift-late | +1 | `shift:<día>:<jobId>` (misma clave; `out.late` de systems/Jobs.work) | src/scenes/Menus.ts:shiftDecision |
| local-purchase | +1 | `buy:<día>:<catalogId>` | src/scenes/Menus.ts:openProductSheet (checkout) |
| local-purchase | +1 | `buy:<día>:<storeId>` | src/scenes/Menus.ts:openStore y openGarment (buyGarment) |
| bill-paid | +2 | `bill:<bill>:<period>`, barrio del hogar (`getHome(housing.home).location`) | src/ui/Phone.ts:renderPay (tras `Household.pay` ok); ciclo 2, no verificado en navegador |

## Efectos y umbrales

- Precio: `priceFactor(v) = clamp(1 − 0.10·v/100, 0.90, 1.10)`. Lo aplican `Commerce.checkout(…, factor)` y
  `Retail.buyGarment(…, factor)`; la preview de Menus muestra el mismo total que se cobra. La reventa sigue saliendo de
  `paid` (ahora lo realmente pagado).
- Tono: ≤ −40 hostil, ≥ 40 amistoso, si no neutral. Sólo se muestra en la app Reputación.
- Acceso: `PlaceDef.minReputation`; `canEnter(v, min)`. Bar Ribera lleva `minReputation: -70`: por debajo, la puerta
  dice «Hoy aquí no te atienden.» (WorldScene, misma ruta de diálogo que el local cerrado).

## Save v4 → v5

`SAVE_VERSION = 5`. `migrate`: `version < 5` sin `reputation` → `reputation: {}`. `parseState` usa `parseReputation`
(sólo barrios conocidos, valores finitos con clamp; basura → `{}`). Partida nueva: `{}`.

## UI

App «Reputación» (glifo ◆) en el inicio del móvil, tras «Notas». Lista el barrio actual y los que tienen valor ≠ 0:
valor, tono y los 3 últimos motivos. Vacío: «Aún no te conoce nadie.». Esc vuelve al inicio, como las demás.

## Casos

| caso | pasos | esperado | obtenido | estado | notas |
|---|---|---|---|---|---|
| subir/bajar | apply +3, −5 | 3, −2 | pendiente de ejecución | pendiente | check-reputation |
| idempotencia | mismo reasonId dos veces | sin cambio | pendiente de ejecución | pendiente | check-reputation |
| clamp | 40×(+9) / 40×(−9) | 100 / −100 | pendiente de ejecución | pendiente | check-reputation |
| motivos ≤ 10 | 40 motivos | 10, el último u:39 | pendiente de ejecución | pendiente | check-reputation |
| precio | groceries Súper Rosales a −100/+100 | 9,90 / 8,10 | pendiente de ejecución | pendiente | check-reputation |
| tono | −40, 0, 40 | hostil, neutral, amistoso | pendiente de ejecución | pendiente | check-reputation |
| acceso | canEnter(−71/−70, −70) | false / true | pendiente de ejecución | pendiente | check-reputation |
| v4 sin reputation | load | {} | pendiente de ejecución | pendiente | check-reputation |
| round-trip v5 | save + load | igual | pendiente de ejecución | pendiente | check-reputation |
| corrupto | reputation: 'basura' | {} y carga | pendiente de ejecución | pendiente | check-reputation |
| turno en juego | fichar y terminar turno | +3 (tarde +1) en el barrio | pendiente de ejecución | pendiente | navegador |
| app móvil | abrir Reputación | lista o vacío | pendiente de ejecución | pendiente | navegador |

## Navegador, ciclo 1 (resultados del evaluador) y correcciones del ciclo 2

| Caso | Estado |
|---|---|
| Compra +1 idempotente | PASS |
| Cobro con factor (€0,85 con +50, €0,99 con −100) | PASS |
| Cabecera del precio | FAIL; corregido en el ciclo 2 (`Menus.priced()` en lista, ficha, «la unidad», confirmLook y perchero), pendiente de verificar |
| Bar Ribera: con −100 bloquea, con 100 entra | PASS |
| Persistencia | PASS |
| Consola limpia | PASS |
| App Reputación | FAIL visual; corregido en el ciclo 2 (una línea por motivo, máx. 3, sin delta en bruto, tono con color), pendiente de verificar |
| Móvil | BLOCKED, sin captura |
| Factura | enganchada en el ciclo 2 (Phone.renderPay); check-reputation cubre la idempotencia de la clave; pendiente de verificar en navegador |

Ciclo 2: `maxQty(w, p, factor = 1)` ya tiene en cuenta el factor (la ficha no ofrece una cantidad que no llega). Los
precios de puestos (`openCatalog` → `purchase`), peluquería, tatuajes y bar no llevan factor ni en el cobro ni en el
texto: coinciden. Nada del ciclo 2 se ha ejecutado (build, check, navegador).

## Pendiente / NO VERIFICADO

- Eventos de calle, faltar a un turno (missed) y penalizaciones: sin disparador negativo todavía.
- Diario MAP-05, DEC-01/05/06 y LV-09: sin integración.
- `check-luna.ts:165` y `check-metro-transfers.ts:93` afirman `SAVE_VERSION === 4`: fallarán con v5 (no tocados).
- Nada de esto se ha ejecutado aún (build, check, navegador).

## MAP-07b

### Disparadores nuevos (`data/reputation.ts`)

| Trigger | Delta | Clave | Dónde |
|---|---|---|---|
| `shift-missed` «Turno sin fichar» | −5 | `missed:<job>:<día>` | `Reputation.settleWithReputation` (pura, sin Phaser), vía `GameState.settleJob` (llamado por `Menus.reviewJob` y por `reviewAgenda` en `main.ts`, minuto nuevo) |
| `bill-late` «Factura pagada con retraso» | −1 | `bill:<factura>:<periodo>` (la misma que `bill-paid`) | `Phone.renderPay`, si la factura lleva recargo o está `late` |

- Zona del puesto: `JobDef.place` es una parada de `STOPS`; se resuelve con `STOPS.find(s => s.id === place)?.station`
  y `zoneOf(station)`. Sin estación o sin barrio, `addReputation` no hace nada.
- `settleJob` devuelve `{ progress, missed, fired, changed }`; aplica el progreso (`setJob`) sólo si avanzó `checked` y
  la reputación que devuelve `settleWithReputation`; `main.ts` guarda si hay aviso o `changed`. Se llama después de
  `review`: `missedBetween` mira el contrato sin repasar, así el aviso «no fichaste» sigue saliendo.
- Avisos del jefe (ciclo 2): el texto vive en `Jobs.missedNotice(progress, missed)` (antes, dentro de `Menus.reviewJob`).
  `reviewAgenda` lo pone el primero del grupo «Te lo has perdido» y sale por `phone.notice(…, 'today')`, como el resto de
  avisos de la agenda. `Menus.reviewJob` devuelve `missedNotice` de su propio repaso: sólo lo que el repaso de cada minuto
  aún no había contado (`missed` de un repaso ya hecho es `[]`), así que el mismo aviso nunca sale dos veces.
- Por qué −1 y no 0 ni −2: pagar con retraso sigue siendo pagar (no debe dejarte peor que no pagar nunca, que es 0), pero
  no puede premiarse igual que a tiempo (+2). Un −1 es la señal mínima y no se acumula: misma clave que la pagada.
- `reasonLabel` no cambia: `missed` es un prefijo propio y `bill` se distingue por el delta (+2 / −1).

### Eventos

- `REPUTATION_EVENT_SPAN = 0.3`; `eventWeightFactor(v, polarity)` en `systems/Reputation.ts`: 1 + 0,3·max(0, ∓v)/100,
  con clamp a ±100 y 1 si no es finito. Rango [1, 1,3].
- Aplicado en `StreetEvents.planNight` (parámetro opcional `rep`) sobre `def.chance`, sólo si la def declara `polarity`.
  La única def, `patio-mayor` (pelea clandestina con apuestas), es `negative`. Sin tiradas nuevas ni cambio de orden.
- Ciclo 2: sin `rep`, `planNight` lo pide al proveedor del módulo, `setReputationSource(fn: (location) => number)`
  (por defecto, 0), con `def.location`. Lo fija una vez `main.ts`, justo tras crear el `GameState`:
  `(loc) => valueIn(state.reputation, zoneOf(loc))`. El valor se cachea por sitio y día dentro del módulo, así que una
  noche ya planificada no cambia a mitad y `StreetEvent.night`, `devForce` y `AlleyDeals.busy` (que siguen llamando sin
  `rep`) ven siempre la misma noche. Sin director nuevo. Protestas, sin tocar.

### Casos

| Caso | Esperado | Resultado |
|---|---|---|
| Turno no fichado, settle dos veces (con `settleWithReputation` real) | −5 por falta una vez, `missed:<job>:<día>`, zona desde STOPS, «Turno sin fichar», aviso «Faltaste…» | pendiente de ejecución |
| Despido por faltas (`settleWithReputation`) | `fired`, −5 × maxStrikes, aviso «…el contrato se acaba aquí» | pendiente de ejecución |
| Proveedor a −100, 200 días | `StreetEvent.night` = `planNight` sin `rep` (lo de AlleyDeals); alguna noche más que con 0; trapicheo sin solaparse; proveedor restaurado | pendiente de ejecución |
| Factura con recargo pagada | −1, «Factura pagada con retraso»; repetir no cambia | pendiente de ejecución |
| Factura a tiempo | +2, «Factura pagada» | pendiente de ejecución |
| `eventWeightFactor` extremos, NaN, fuera de rango | 1,3 / 1 / 1 / clamp | pendiente de ejecución |
| `planNight` 200 días, rep −100 vs 0 vs sin parámetro | ≥ y alguna más; 0 idéntico | pendiente de ejecución |
| Navegador: faltar a un turno y ver −5 en el móvil | −5 en el barrio de la estación | pendiente de ejecución |
