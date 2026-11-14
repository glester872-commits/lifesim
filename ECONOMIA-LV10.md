# ECONOMIA-LV10 — auditoría (Fase 1) y contrato previo

Sólo lectura y diseño: nada de esto está implementado. Lo que no se ha confirmado leyendo el código se marca
**NO VERIFICADO**.

## 1. Auditoría archivo:función

| Área | Dónde | Hallazgo |
|---|---|---|
| Dinero inicial | `src/config/constants.ts` `INITIAL_MONEY = 120`; `src/systems/SaveSystem.ts:50` lo usa en la partida nueva | €120. La tarjeta de metro (`transport-new`, €12,50, `data/catalogs.ts`) se descuenta en la rutina del script. |
| Versión de guardado | `constants.ts:63` `SAVE_VERSION = 3`; `SaveSystem.ts` `migrate()` (v<2 identity, v<3 metroJourney) e `inspectRaw()` (rechaza `version > SAVE_VERSION` como `newer`) | Migración aditiva por versión: cada paso añade campos y `parseState` pone valores seguros. |
| Cartera | `src/systems/Commerce.ts` `Wallet {money, inventory, cards}`; `cents()` redondea a céntimos; `euros()` | Funciones puras que devuelven una `Wallet` nueva. |
| Compra | `Commerce.ts` `refusal()`, `purchase()`, `checkout()` | Rechaza por `Refusal` (`'money'`, …) sin tocar la cartera. |
| Pasaje | `Commerce.ts` `payFare()` | Paga con el saldo de la tarjeta (`cards`), no con la cartera: la recarga sí mueve `money`. |
| Sueldos | `src/data/jobs.ts` niveles: Decathlon 60 €/turno ×3 días (nivel 1: 84 ×3), Atalaya 36 ×5 (nivel 1: 52 ×5, requiere `ofimatica`); `systems/Jobs.ts` `work()` calcula `pay` (proporcional si se llega tarde + `bonus`) | Se cobra al acabar el turno. Nada se paga por adelantado. |
| Casa | `src/data/household.ts` `BILLS` (alquiler 45/7 días con `lateFee` 5; suministros 10/7 días), `GRACE_DAYS = 7`; `systems/Household.ts` `sync`, `pay`, `owed`, `statusOf`, `shortfall` | Periodo k: se anuncia el día `since+k·every`, vence al final de `since+(k+1)·every−1`. `generated` evita duplicar periodos. Recargo único tras el margen; sin intereses ni desahucio. |
| Promesa de shortfall | `Household.ts:129` «La deuda espera: nadie te echa ni suma intereses.» | Compromiso con el jugador que cualquier préstamo debe respetar (ver 2.2). El recargo único de `lateFee` ya existe y la promesa lo admite como «único». |
| Vivienda | `src/data/housing.ts` `HOMES` (alquileres 45/35/55/25), mejoras `UPGRADES`; `systems/Housing.ts` `buy`, `move`, `rentsOf()` | `sync` recibe `rentsOf(housing)`: el alquiler depende del hogar. `move` recibe `free` y `overdue`. |
| Estudios | `data/study.ts` `fee` (30 €, `foto-basica`); `systems/Study.ts` `enrollBlocker` (:115-120) | Matrícula al inscribirse; rechazo con mensaje de cuánto falta. La cobra la escena (`WorldScene.ts:2369`, `state.as('Inscripción · …')`). |
| Comida | `data/catalogs.ts` `groceries` €9 (Rosales), €7,50 (otra tienda), €16 (gourmet) | Compra por `purchase`/`checkout`. |
| Ocio | `data/activities.ts` `restaurant-dinner`, `bar-cana`, `cost` | Se cobra desde la escena con `state.as(...)`. |
| Ropa | `data/retail.ts` `STORES`/`GARMENTS` (Segunda Vuelta desde €4); `systems/Retail.ts` `buyGarment`, `sellGarment` (`RESALE_RATE 0.4`, `RESALE_CAP 40`) | Existe reventa: una vía de ingreso a vigilar en anti-explotación. |
| Ledger | `Household.ts` `Movement {day,hour,minute,label,amount}`, `recordMovement`, `parseLedger`, `LEDGER_SIZE = 40` | Sin id, tipo ni origen. Ver 2.1. |
| Dónde se apunta | `src/state/GameState.ts`: `set money` (:601-611) y `set wallet` (:572-591) llaman a `record(delta)` (:291-294); `as(label, fn)` fija el motivo (:280); sin motivo, «Otros» | Todo cambio de `money` pasa por aquí, salvo restaurar partida (`NO VERIFICADO` si el constructor, :233, evita `record`: sólo clona `initial.ledger`). |
| Vista Cuentas | `src/ui/Phone.ts` `renderMoney()` (:666) y `renderPay()` (:709) | Muestra saldo, debes, libre, facturas pendientes, meta de ahorro y los últimos 8 movimientos. No hay noción de préstamo ni inversión. |
| Calendario | `src/systems/Calendar.ts` `onNewDay`, `Midnight {day, from, to}` | TimeSystem emite `midnight` por cada medianoche cruzada. |
| Sync de la casa | `src/main.ts:167-176` `syncHousehold` en arranque y en `onNewDay`; usa `state.day`, guarda sólo si hay `news`/`fined` | Un salto de varios días crea todos los periodos pendientes en una pasada (`sync` itera `k`). Idempotente. |
| Dormir | `src/systems/TimeSystem.ts` `advanceMinutes` (:66) se usa al dormir, trabajar y en el metro (:40 «retenido tras un salto») | Que dormir emita `midnight` y dispare `syncHousehold`: coherente con el comentario de `main.ts:962`; la ruta exacta de la escena de dormir: **NO VERIFICADO**. |
| Guardado | `SaveSystem.ts` `parseState` (:388 `ledger: parseLedger`, :387 `parseHousehold`), `save()` escribe `{version, savedAt, state}` | Cualquier campo nuevo del estado requiere parser defensivo y, si cambia el esquema, versión nueva. |
| Slots | `src/systems/SaveSlots.ts` (usa `inspectRaw`, guarda `version` y `checksum` por slot) | Los slots antiguos pasan por `inspectRaw` y por tanto por `migrate`. Detalle de copias/importación: **NO VERIFICADO** más allá de eso. |
| Banco | `data/places.ts:103` `{ id:'bank', building:'bank', hours:[8,15], capacity:4, tags:[WORK] }`; `data/vallesco.ts:158` edificio `bank` (2 plantas) con `point: 'BANK_ENTRANCE'` y `inspect: ['El cajero pide la tarjeta antes de decir buenos días.']`; `BANK_WINDOW` (:394) | Sin interior (no hay `enter`), el cajero sólo está dibujado/inspeccionable. Tiene horario y `WORK`, pero **NO VERIFICADO** si algún NPC o interior lo usa. |

Conclusión de la auditoría: no hay hoy ninguna ruta de deuda, interés ni ahorro; el único crédito implícito es la obligación de casa que espera.

## 2. Definiciones previas del contrato (diseño sin implementar)

### 2.1 Ledger

- Ampliar `Movement` con `movementId` (estable), `type` (`'income' | 'bill' | 'purchase' | 'loan' | 'saving' | …`), `source` (quién lo origina: `'job:decathlon'`, `'bill:rent'`, `'loan:<id>'`) y `status` (`'posted' | 'pending' | 'failed' | 'reversed'`).
- Id estable y determinista: `m-<día>-<contador del día>` o hash de `(day, hour, minute, source, label, amount)`; nunca `Math.random`. Idempotencia: un movimiento con id ya existente no se vuelve a apuntar.
- Migración: movimientos sin id reciben `legacy-<índice>` según su orden en el array; `type: 'other'`, `source: 'legacy'`, `status: 'posted'`. `parseLedger` rellena lo que falte.
- `SAVE_VERSION` 3 → 4: `migrate()` añade `if (version < 4)` y `parseLedger` acepta formas v3 y v4. El archivo original no se reescribe hasta guardar (política actual de `migrate`).
- Cuidado: `recordMovement` junta líneas del mismo día y motivo (y suma cantidades «2 × X»). Esa fusión destruye el id por movimiento. Decisión a tomar: los movimientos financieros (`loan`, `saving`) no se fusionan nunca; los demás conservan la fusión y el id de la primera línea. La Cuentas mostrará el estado, no las líneas internas.
- El tope `LEDGER_SIZE = 40` expulsa líneas viejas: el historial de un préstamo vivo no puede depender del ledger; el préstamo guarda su propio estado.

### 2.2 Micropréstamo

- Campos: principal, coste total (importe fijo, no un porcentaje oculto), número de cuotas, plazo en días, disponibilidad (cuándo se ofrece: p. ej. sólo con una obligación de casa que no llega; una sola abierta), cancelación (devolver el principal íntegro dentro de un plazo corto cuesta 0 o una comisión anunciada).
- Cuotas como `Obligation` de Household (`generated`, vencimiento, margen `GRACE_DAYS`): reutiliza el patrón y sus garantías de idempotencia.
- Impago sin saldo negativo: la cuota no pagada espera como cualquier obligación; la cartera nunca baja de 0; no se descuenta de una cuenta sin saldo; no hay cobro automático que deje el saldo en negativo.
- Convivencia con la promesa de `shortfall` («nadie te echa ni suma intereses»): el préstamo no puede llevar intereses de demora ni acumular. Su coste total es fijo y mostrado antes de aceptar; el impago admite, como mucho, el mismo recargo único que `lateFee`. Si el diseño exigiera algo más, hay que cambiar antes el texto de `Household.ts:129` y avisarlo al jugador: no se rompe la promesa en silencio.

### 2.3 Ahorro o inversión

- Riesgo explícito: se muestra rango de resultados posibles antes de confirmar, no «rentabilidad garantizada».
- Límites: mínimo y máximo por operación, tope total, nunca más de lo que deja `libre` (saldo − deuda).
- Retorno con semilla: el resultado se deriva de una semilla guardada (día de apertura + id), no de `Math.random`, para que recargar no cambie el resultado.
- Disclaimer visible: juego; no es recomendación financiera real.

### 2.4 Lugar

- El banco de Vallesco (`bank`) hoy no tiene interior ni `enter`. La oferta se muestra donde ya hay superficie real (Cuentas del móvil) con una recomendación con motivo («Te faltan €X para el alquiler del día D; puedes pedir €Y»). Ningún botón, puerta o cajero nuevo hasta que exista el flujo (regla «Nada de funcionalidad falsa» de CLAUDE.md). Si más tarde hay interior, será un `BuildingDef` con `enter` y datos, sin `if (location === …)`.

### 2.5 Flujo con simulación

Antes de confirmar, se enseña una simulación a cuatro semanas con el sueldo del contrato en tres casos: favorable (todos los turnos), intermedia (un turno perdido) y desfavorable (sin trabajo). Cada uno muestra saldo final y cuota. Salen de las mismas funciones del simulador (`work`, `sync`, `pay`), no de cifras escritas.

### 2.6 Pago periódico, dormir y recarga

- Idempotente ante saltos: patrón `generated` de `Household.sync` (cuotas por periodo, creadas una vez; recargar o saltar 30 días no duplica).
- Dormir y salto de reloj: `TimeSystem` emite `midnight` por cada medianoche; el sync se apoya en `state.day`, no en el evento, así que da igual cuántas lleguen.
- Recarga: el estado del préstamo se guarda con la partida (`SAVE_VERSION` 4) y se valida en `parse*`; un estado dañado se descarta a «sin préstamo» sin tocar el dinero.

### 2.7 Rechazo sin saldo y recuperación de errores

- Sin saldo: la operación no cambia nada, devuelve `ok:false` con `reason` y mensaje (como `Commerce.TxResult`), y la UI lo enseña.
- Recuperación: si se aplica el dinero pero falla el guardado o el apunte del ledger, el siguiente `parse` reconcilia contra el estado del préstamo (la fuente de verdad) y el movimiento se marca `failed`/se regenera por id.

### 2.8 Anti-explotación y criterio de frustración

- Anti-explotación: un préstamo abierto a la vez; sin pedir para pagar otro; cooldown tras cancelar (para que pedir y cancelar no sea una cadena de dinero gratis); límite por periodo; la reventa de ropa (`RESALE_CAP`) no cuenta como ingreso para pedir más.
- Criterio de frustración: el producto es válido sólo si un jugador que sigue la rutina moderada del script nunca queda sin forma de volver a flote. Señales de fracaso: cuotas que superan el neto semanal de `BALANCE-LV10.md`; más de una semana con una obligación `late` provocada por el propio préstamo; el jugador no entiende el coste total antes de aceptar.

## 3. Tabla de evidencia (Fase 5)

| caso | pasos | esperado | obtenido | estado | notas |
|---|---|---|---|---|---|
| Baseline sostenible | `node scripts/simulate-budget.ts` | Los tres indicadores en OK en Decathlon y Atalaya nivel 0 | Decathlon nivel 0: (b) −€59 NO SOSTENIBLE; Atalaya +€9; ascenso +€285 | FAIL → BLOCKED parcial; el usuario decide «solo tras ascenso» | Ver BALANCE-LV10.md |
| Ledger migrado | cargar guardado v3 con movimientos | Ids `legacy-*`, sin pérdida | check-household: v3 → load → save (v4) → load → save → load con ids idénticos. Navegador (Chrome, contexto aislado, Vite dev): partida v3 inyectada con 2 movimientos sin id → «Continuar» → `legacy-0` (Café −2,50) y `legacy-1` (Alquiler −45), source `legacy`, status `posted`, saldo intacto | PASS | Control positivo: sin la guarda de idempotencia, check-household falla (exit 1) |
| Préstamo aceptado | Navegador (Chrome, contexto aislado): contrato Decathlon nivel 1 (hire+promote reales); Cuentas → Micropréstamo → «Pedir €100» con doble clic | Saldo +100 una vez; cuota 1 creada una vez | 120 → 220; una sola línea `loan:c1:principal +100`; cuota 1 (vence día 7). El 2.º clic sólo cambia el aviso a «Ya tienes un préstamo abierto…» (tapa el mensaje de éxito: detalle menor) | PASS | check-household: take + syncCredit ×3 + salto de 30 días = 4 cuotas |
| Rechazo sin saldo | pagar cuota sin saldo | `ok:false`, sin cambios, mensaje claro | check-household: payInstallment sin saldo → ok:false con el dinero intacto. UI: fila «No te llega» (is-soon) con la nota de cuánto falta, mismo patrón que renderPay | PASS (automático) · UI sin saldo no recorrida | |
| Salto de reloj (ledger, Fase 2) | Navegador: partida nueva; saltar 72 h con el reloj; dormir 8 h en la cama del piso (E → 2); pagar el alquiler en Cuentas con doble clic; recargar | Saltar y dormir no apuntan nada; el pago, una línea | 0 movimientos tras 3 días y tras dormir (dinero 120 → 120). Pago: saldo 120 → 75, una sola línea `m-5-1` «Alquiler» −45, «Ya está pagado.»; tras recargar, el mismo ledger y version 4 en el guardado | PASS (ledger) | No hay prueba automática: GameState importa Phaser y no carga en Node |
| Salto de reloj (cuotas) | Navegador: préstamo c8 con cuota 1 pagada; saltar 30 días sin pagar; recargar | Cuotas una vez; recargo único; nada cobra solo | Día 38: «Debes €91… cuota 2/4, €32, venció… recargo único de €5 aplicado; no sube más. Liquidarlo hoy: €91»; dinero intacto (148). Tras recargar, idéntico | PASS | 91 = 3×27 + 2 recargos de 5; liquidar = 75 principal + 3×2 coste generado + 10 |
| Recarga | guardar y recargar con préstamo vivo | Mismo estado | Navegador: misma vista y mismas filas tras recargar; check-household: save→load sin duplicar cuotas ni recargos | PASS | |
| Ahorro con semilla | abrir, recargar, cerrar | Mismo retorno | | PENDIENTE | |
| Impago / morosidad | no pagar hasta pasar el margen | Recargo único como mucho; saldo ≥ 0 | Recargo de €5 por cuota tras GRACE_DAYS, sin intereses; el saldo no se toca solo; sin contrato el préstamo deja de ofrecerse («El préstamo sólo se ofrece con un contrato activo.») | PASS | Efectos de impago acotados a recargo único (promesa de Household.shortfall) |
| Banco sin falsas afordancias | git diff | Sin botón ni puerta nuevos | El servicio vive en Cuentas (móvil); vallesco.ts, BuildingArt.ts, WorldScene.ts y Menus.ts sin cambios de LV-10 | PASS | |
| Bloqueado sin ascenso | Cuentas sin contrato | Motivo visible, no elegible | «Micropréstamo · El préstamo sólo se ofrece con un contrato activo.»: el clic no hace nada; W/S salta la fila (Alquiler → Luz → Meta → Alquiler) | PASS | Sin botón falso |
| Simulación de escenarios | Consulta con contrato ascendido | Tres escenarios realistas y aviso | 1.ª versión: «€900 en cartera» (sin comida ni metro) → **FAIL, corregido**: renderCredit pasa comida del súper, metro ida y vuelta y rentsOf. Ahora: €600 / €280 / €2 (debes €86, casa y préstamo con retraso). Aviso «Cifras del juego, no son consejo financiero real.» | PASS tras el arreglo | |
| Doble tecla al cerrar | Pagar cuota y pulsar E tres veces | No desiste sin confirmar | 1.ª versión: la 2.ª E desistió del préstamo (−73) sin confirmación → **FAIL, corregido**: pantalla «Desistir/Liquidar» con «Ahora no» primero. Ahora: cuota 1 pagada una vez y se queda en la confirmación con «Ahora no» seleccionado | PASS tras el arreglo | |
| Liquidación | Móvil emulado 390×844 táctil: Liquidar → confirmar con dos toques | Pago total una vez, préstamo cerrado | 148 → 57; una línea `loan:c8:cancel −91`; status cancelled; cooldown día 45; scrollWidth 390 (sin scroll horizontal) | PASS (emulado) | Teléfono físico: NO VERIFICADO |

## Estado de la Fase 2 (ledger)

El evaluador da por cumplidos los criterios 1–7 (ids, fusión, idempotencia, migración v3→4, reloj y dormir en navegador)
y no encuentra fallos en el código. Bloqueaba sólo por `npm run check` 118/120. Decisión del usuario (2026-11-10):
**eximir y seguir**. Los dos fallos son ajenos a LV-10 y quedan abiertos:
- `check-regression` («el guardado no vuelve igual»): campo `dismissals: {}` del `Jobs.ts` de otra sesión.
- `check-litter` («luna: la limpieza no recogió nada en 3 días»): ya falla en HEAD.

Archivos de la fase: `src/systems/Household.ts`, `src/state/GameState.ts`, `src/config/constants.ts`
(SAVE_VERSION 4), `src/systems/SaveSystem.ts`, `scripts/check-household.ts`, `scripts/check-regression.ts`
(fixture v4), `scripts/check-luna.ts:102` y `scripts/check-metro-transfers.ts:93` (versión fijada 3→4).
