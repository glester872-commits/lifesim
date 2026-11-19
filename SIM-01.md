# SIM-01 · Registro de consecuencias persistentes

Rama `met-05-iluminacion`. Implementador sin shell; build, checks y QA los ejecutó el coordinador (evidencia abajo).

## Fase 1 · Estado inicial y auditoría

`git status` inicial (según el coordinador y SIM-00): 7 archivos ajenos modificados (+59 −9: `package.json`,
`src/data/vallesco.ts`, `src/types/game.ts`, `src/world/{BuildingArt,Lighting,LocationBuilder,Occlusion}.ts`) y sin
seguimiento `SIM-00.md`, `VOLUME-25D.md`, `design/volume-evidence/`, `scripts/check-building-volume.ts`,
`scripts/qa/run-volume.mjs`, `src/world/BuildingProjection.ts`, `src/world/BuildingVolume.ts`. No se tocó ninguno salvo
dos Edit de ancla mínima autorizados (`types/game.ts`, `package.json`).

### Auditoría por archivo y función

| Archivo | Función / punto | Qué se hizo |
|---|---|---|
| `src/systems/Consequences.ts` (nuevo) | tipos, `emptyConsequences`, `parseConsequences`, `register`, `reconcile`, `coverage`, `holdsConsequence`, `plantonRef`, `isLive` | Registro puro, sin Phaser ni `Math.random` |
| `src/data/consequences.ts` (nuevo) | constantes, canales y textos | Límites, plazos y 3 avisos en español |
| `src/config/constants.ts` | `SAVE_VERSION` | 5 → 6 |
| `src/types/game.ts` | `GameStateData.consequences?` | Una línea + comentario junto a `household?` |
| `src/systems/SaveSystem.ts` | `migrate` (5→6), comentario de versiones, `parseState` | v5 → `emptyConsequences()`; v6 sin clave carga sin clave |
| `src/state/GameState.ts` | `_consequences`, getter, `setConsequences`, constructor, `snapshot` | Patrón de `household`/`rastro` (sin registro, sin clave) |
| `src/main.ts` | `syncConsequences` | Tras `syncHousehold` al arrancar y en `onNewDay`; también en `reviewAgenda` si `settleJob` cambió |
| `src/data/opportunities.ts` | `OpportunityCond.consequence`, 3 oportunidades | `ascenso-retrasado`, `planton-arreglo`, `gastos-apuro` |
| `src/systems/Opportunities.ts` | `OpportunityInput.consequences`, `holds`, `fill`, `opportunityInput` | Rama nueva antes del fallthrough de `upgrade`; el ascenso no sale con una consecuencia 'work' viva |
| `scripts/check-consequences.ts` (nuevo) | 10 casos | Ver «Validación» |
| `scripts/check-fitting-stock.ts:76`, `check-luna.ts:165`, `check-metro-transfers.ts:93` | aserción `SAVE_VERSION` | 5 → 6 (autorizado) |
| `package.json` | script `check` | `&& node scripts/check-consequences.ts` tras `check-save-slots` |

Solo lectura: `Jobs.ts`, `Reputation.ts`, `Household.ts`, `Story.ts`, `Credit.ts`, `data/{sara,ada,amaia}Story.ts`, `ui/Phone.ts`.

### Definiciones previas

| Término | Definición |
|---|---|
| Hecho significativo | A) turno `missed`/`late` en `job.shifts` (escritos por `Jobs.settle` y `Jobs.work`) y despido (`job.status === 'fired'`, `job.ended`); B) evento `planton` en `stories[npc].events` (`Story.missPlan` vía `def.missed`/`plan.missed`); C) caída de ingresos (despido, o ≥2 faltas en 7 días) con obligaciones próximas sin cubrir |
| Origen | `{kind: 'shift-missed'|'shift-late'|'dismissal'|'planton', ref: jobId|npcId, day}` |
| ID | `shift-missed:<job>:<día>`, `shift-late:<job>:<día>`, `dismissal:<job>:<día>`, `planton:<npc>:<díaEvento>`; registrar dos veces no hace nada (activa, cerrada o archivada) |
| Reloj | `state.day` y el minuto absoluto `(día−1)·1440 + h·60 + m`; `timestamp` = minuto del registro |
| Sistemas | `jobs`, `reputation`, `opportunities`, `social`, `story`, `household`, `phone` |
| Efectos inmediatos | Solo referencias a lo ya aplicado por el propietario: `jobs:strike` y `reputation:missed:<job>:<día>` (falta), `jobs:pay:<día>` (retraso), `jobs:dismissals:<job>` (despido), `social:trust` y `story:event:planton` (plantón). Nunca importes |
| Efectos diferidos | `notice` (A y B, dueDay = día del hecho), `check-coverage` (C: despido o falta con ≥2 en 7 días), `expire` (retraso +7, falta +14, plantón +10, despido +14). Corren si `dueDay ≤ hoy`, una vez; `done` se escribe en el estado que main guarda ANTES de avisar |
| Estados y transiciones | `active → repairing` (B: flag `<npc>_apologized` con día ≥ origen). `active|repairing → resolved`: retraso, un turno `done` posterior; falta, dos turnos buenos seguidos posteriores (`done`, score ≥ 1) o `streak ≥ 2`; plantón, flag `<npc>_reconciled` con día ≥ origen; despido, deudas próximas cubiertas o contrato activo nuevo. `→ expired` por el diferido. `resolved|expired → archived` a los 14 días, compactado a `{consequenceId, origin, status, resolvedDay}` |
| Modelo de datos | `ConsequenceState {items, lastNoticeDay}`; ítem según el enunciado (ver `Consequences.ts`) |
| Escenarios | A trabajo, B plantón, C ingresos (abajo) |
| Historial | `MAX_ACTIVE = 24` sin archivar (se archivan antes las cerradas más antiguas; nunca una activa o reparando); `MAX_ARCHIVED = 30` (fuera la más antigua). `REGISTER_WINDOW = 3` días: sin retro-relleno de partidas v5 |
| Tiempo transcurrido | Catch-up: un salto de 30 h o dormir varios días ejecuta todo lo vencido en el siguiente sync; la caducidad lo resuelve primero (lo caducado no avisa) |
| Canales | `phone.notice(title, text, app)` (firma real, `ui/Phone.ts:372`): `Trabajo`/`today`, `Gente`/`today`, `Cuentas`/`money`; y la app Hoy/HUD vía `Opportunities` |
| Ventanas intrusivas | Ninguna: sin popups ni diálogos nuevos |
| Mensajes repetitivos | Un aviso por `consequenceId`; cooldown global de 3 días (`lastNoticeDay`; lo que llega antes queda pendiente, no se pierde salvo que se resuelva); los del mismo sync, un `phone.notice` por canal |
| DeepSeek | **NOT EVALUATED** (sin acceso en esta sesión) |
| Formato de evidencia | Tabla «escenario · caso · pasos · esperado · obtenido · PASS/FAIL/NO VERIFICADO · notas»; salida literal de `check-consequences` |

## Fase 2 · Modelo

`Consequences.reconcile(state, {job, stories, household, money, creditBlocker?}, today, nowAbs)` es pura y determinista
(ítems ordenados por id): (1) registra los hechos de la ventana leyendo `job.shifts`, `job.status/ended` y
`stories[npc].events`; (2) pasa a `repairing`/`resolved` leyendo a los propietarios; (3) corre los diferidos vencidos;
(4) archiva y poda. Devuelve `{state, notices, changed}`. Nunca escribe en Jobs, Reputation, Social, Story ni Household:
no hay doble castigo. Imports: tipos de Jobs y Story; `unpaid`/`total` de Household; además `formatDateShort` (Calendar),
`euros` (Commerce) y `getNpc` (data/npcs) para los textos, todas puras. Sin ciclos: `Opportunities → Consequences`, nunca al revés.

## Escenarios

- **A · Trabajo.** Falta o retraso → aviso «Tu ascenso espera: quieren ver dos turnos buenos seguidos.» y oportunidad
  `ascenso-retrasado`; mientras viva, `ascenso` no sale (se lee, Jobs no cambia). Se resuelve con los turnos buenos.
  Despido → `dismissal` (afecta a casa: comprobación C).
- **B · Plantón** (Sara, Ada, Amaia, flujo real de Story: plantón → `reconciliar` → plan de arreglo → `reconciliacion`).
  Aviso «{persona} sigue esperando que arregles lo del plantón.» y `planton-arreglo`; perdón → `repairing`; ir al
  arreglo → `resolved` (la confianza la sube Story con sus datos); sin reparar, a los 10 días `expired`.
- **C · Ingresos.** Si lo que vence en 7 días (o ya venció) supera la cartera: aviso `Cuentas` «Este periodo vas justo:
  te faltan X para cubrir Y (vence el F).» + consejo; el micropréstamo solo se menciona si `Credit.creditBlocker` da
  null (ruta real: móvil → Cuentas → Micropréstamo). `gastos-apuro` sale mientras no llegue.

## Persistencia

Campo opcional `consequences?`; `SAVE_VERSION` 6; `migrate` 5→6 añade el registro vacío; `parseConsequences` tolera
basura (vacío), descarta ítems inválidos y números no finitos, deduplica ids y recorta a los topes. Una partida v6 sin
registro no lleva la clave (GameState y `parseState` la omiten): los round-trips existentes no cambian.

## UX

Solo canales existentes: `phone.notice` y oportunidades (app Hoy y HUD «Libre · Puedes: …»). Ningún botón nuevo:
las tres oportunidades señalan acciones que ya existen (fichar, hablar con ella, Cuentas).

## Validación

Salida de `node scripts/check-consequences.ts` (exit 0), común a los casos 1-10:
`check-consequences: OK (1×1 · 2×1 · 3×1 · 4×1 · 8×1 · 9×1 · 10×1 · A-falta×1 · A-retraso×1 · A-despido×1 · B×3 · C×1 · C-vencido×1 · cooldown×1; ids deterministas, diferidos una vez, cooldown 3 días, v5→v6)` (tras la corrección 3; antes, la misma línea sin `C-vencido×1`)

| escenario | caso | pasos | esperado | obtenido | PASS/FAIL/NO VERIFICADO | notas |
|---|---|---|---|---|---|---|
| 1 | idempotencia | dos reconcile; JSON roundtrip; SaveSystem en memoria | deepEqual, 0 avisos la 2.ª | exit 0, `1×1` | PASS | |
| 2 | doble sync | reconcile ×2 el mismo día | 1 aviso, ids únicos, `changed=false` | exit 0, `2×1` | PASS | |
| 3 | salto 30 h | L+6 10:00 → L+7 16:00 vs pasando por 00:00 | deepEqual; retraso `expired` | exit 0, `3×1` | PASS | |
| 4 | recarga con diferido | aviso pendiente por cooldown → guardar/cargar → X+3 | 1 aviso, no se repite tras recargar | exit 0, `4×1` | PASS | |
| 5 A | falta / retraso / despido | `settleWithReputation`, `work`, `settle` reales | refs strike/reputation; strikes y reputación intactas; `ascenso-retrasado` sí, `ascenso` no; resuelta con turnos buenos; `dismissal` | exit 0, `A-falta×1 · A-retraso×1 · A-despido×1` | PASS | |
| 6 B | plantón ×3 NPC | flujo de `check-arcs` | trust baja; active → repairing → resolved; +10 días expired sin tocar trust | exit 0, `B×3` | PASS | Sara, Ada y Amaia |
| 7 C | facturas | Household real, dinero 0 / suficiente; cooldown | 1 aviso `Cuentas` con importe / ninguno; cooldown 3 días; `gastos-apuro` aparece y se va al cobrar y pagar | exit 0, `C×1 · cooldown×1` | PASS | |
| 8 | migración | v5 sintética, v7, basura, 3 ranuras | registro vacío y resto deepEqual; `newer`; limpio | exit 0, `8×1` | PASS | |
| 9 | poda | 40 resueltas; MAX_ACTIVE+5 activas | 30 archivadas compactas; ninguna activa perdida; JSON < 20 KB | exit 0, `9×1` | PASS | JSON peor caso 17.1 KB < 20 KB (optimizer) |
| 10 | regresión | settle/sync/pay con y sin registro; 2 ejecuciones | iguales; mismo JSON | exit 0, `10×1` | PASS | |
| — | build | `npm run build` | exit 0 | exit 0 tras la corrección 1 (guard `isClosed`; `check-reputation.ts:112` SAVE_VERSION 5→6 autorizado); exit 0 tras la corrección 3 | PASS | |
| — | cadena completa | `npm run check` | exit 0 | exit 0, 447 s, 2685 líneas, 0 errores; tras la corrección 3: exit 0, 499 s, 2685 líneas, 0 errores | PASS | |
| — | checks dirigidos | persistence, save-torture, save-slots, title-save, jobs, department, household, economy, reputation, story, arcs, amaia-arc, week, agenda, regression, cross-system, avatar, pregnancy, fitting-stock, luna, metro-transfers, study, consequences; simulate-budget | exit 0 | 23 + simulate-budget, exit 0 | PASS | |
| A (navegador) | faltar a un turno | gameplay-qa, Chrome DevTools, emulación de escritorio | ítem `shift-missed:decathlon:3` activo | activo; efectos `jobs/strike` y `reputation/missed:decathlon:3`; notice done; expire día 17 | PASS | no es un teléfono real |
| A (navegador) | app Hoy | abrir Hoy con la falta viva | ascenso en espera, sin ascenso normal | «El ascenso en Decathlon Polígono Norte, en espera», sin ascenso normal | PASS | |
| A (navegador) | recarga | recargar + CONTINUAR | sin aviso repetido | 0 avisos 'Trabajo' nuevos (MutationObserver), un solo ítem | PASS | |
| — (navegador) | consola | toda la sesión | sin errores | sin errores | PASS | |
| C (navegador) | aviso Cuentas | gameplay-qa, escritorio: ranura 3, contrato, 2 faltas, money=5 editado en el guardado de prueba, despido el día 8, sync el día 9 | un aviso Cuentas con importe, sin contrato → turno suelto | «Este periodo vas justo: te faltan €105 para cubrir €110 (vence el Dom 18 Abr). Un turno suelto lo cubre; se paga en el móvil, en Cuentas.» Entero, sin cortes. Cooldown respetado (lastNoticeDay 6 → 9) | PASS | captura `C:\Users\glest\AppData\Local\Temp\claude\1cd68afec0b9951e\a483db16-9d68-4371-9133-86a4bac103fb\scratchpad\c1-cuentas.png` |
| C (navegador) | registro | leer `state.consequences` tras el sync | `dismissal:decathlon:8` con household y check-coverage hecho | `dismissal:decathlon:8` con `household`; `check-coverage` done:true, doneDay 9 | PASS | |
| C (navegador) | consola | sesión del caso C | sin errores | sin errores | PASS | |
| C (navegador) | aviso tras el vencimiento | facturas que vencen el Dom 18 sin pagar, despido el Lun 19, sync el Mar 20 | «venció» | texto del DOM: «No llegaste: te faltan €50 de €55 que venció el Dom 18 Abr. Un turno suelto lo cubre; se paga en el móvil, en Cuentas.»; `C-vencido×1` en check-consequences | PASS | corregido en la corrección 3 (autorizada por el usuario); texto leído del DOM, toast no capturado |
| B (navegador) | plantón | — | — | — | NO VERIFICADO | cubierto en Node con Sara, Ada y Amaia |
| — (navegador) | metro €2 | — | — | — | NO VERIFICADO | check-metro* pasa |
| — | visual-qa | títulos y PARTIDAS, escritorio y 390×844 emulado | sin regresión | sin regresión | PASS | |
| — | visual-qa | título con la ranura 3 y HUD dentro del juego, 390×844 emulado (DevTools, no un teléfono real) | sin regresión | sin regresión | PASS | capturas en el scratchpad: sim01-01-titulo.png, sim01-02-hud.png, sim01-03-movil.png, sim01-04-movil.png, sim01-05-movil-abierto.png |
| — | visual-qa | pixel art a 390×844 emulado | nítido | nítido | PASS | detalles menores en `ui/` (no tocado por SIM-01): «PARTIDA GUARDADA» medio tapado un instante por ONLINE; «€5» 1-2 px más alto que la fecha; letrero «Fichaje · … · cerrado» pegado al aro del joystick |
| — | visual-qa | safe areas reales | — | — | NO VERIFICADO | la emulación no tiene muesca |
| C (navegador) | app Hoy con `gastos-apuro`, escritorio | abrir Hoy con la caída de ingresos viva | la oportunidad aparece | innerText «Vas justo con la casa / Libres tienes €0…» | PASS | captura v2-hoy-gastos-apuro.png; la oportunidad queda por debajo del área visible del scroll |
| C (navegador) | app Hoy con `gastos-apuro`, móvil 390 | — | — | — | NO VERIFICADO | cubierto en Node |
| — | rendimiento (optimizer) | reconcile peor caso (24 activas + 30 archivadas) | < 1 ms (umbral interno) | antes de la corrección 2: 1.22 ms/llamada. Después: media 0.4055 ms (tandas 0.4216/0.4088/0.3984/0.3971/0.4016), peor llamada suelta 0.79 ms; JSON 17.1 KB; nunca corre por frame; bundle ~3 KB gzip (0.9 %). Tras la corrección 3: ~0.67 ms de media (optimizer, 3 ejecuciones), PASS; nunca por frame | PASS | corrección 2: moneyNotice una vez por pasada |

## Pendiente / limitaciones

- DeepSeek: NOT EVALUATED.
- El aviso de Cuentas después del vencimiento («vas justo» / «vence el» de algo ya vencido) se corrigió en la **corrección 3**, que excede el límite de correcciones de BALANCED con autorización explícita del usuario. Verificado: C-vencido, cadena exit 0 en 499 s y texto en el DOM.
- «Libres tienes €0» con €5 en cartera: recorte de `Opportunities` (lo libre es la cartera menos lo que se debe, con mínimo 0), anterior a SIM-01.
- El ajuste a 390 px del texto `moneyOverdue` es una estimación: no se vio.
- **Veredicto final — Evaluator: PASS tras la corrección 3.**
- Limitación de diseño: `check-coverage` se evalúa una sola vez, el día de la caída de ingresos. Si el dinero baja después, esa consecuencia no da aviso de Cuentas.
- B (plantón) no visto en navegador; solo en Node (Sara, Ada y Amaia). `gastos-apuro` en la app Hoy tampoco visto en navegador.
- Safe areas reales sin verificar (solo emulación 390×844, sin muesca; no un teléfono real).
- Detalles menores de `ui/` (no tocado por SIM-01) vistos a 390×844: «PARTIDA GUARDADA» medio tapado un instante por ONLINE; «€5» 1-2 px más alto que la fecha; letrero «Fichaje · … · cerrado» pegado al aro del joystick.
- Nota ajena: tras el despido, el HUD dice «Puedes: Trabajo en Decathlon Polígono Norte» (no comprobado si es una recontratación legítima o texto viejo).
- `Commerce.euros` crea un `Intl.NumberFormat` por llamada (fuera de alcance).
- El texto de `gastos-apuro` en `data/opportunities.ts` sigue nombrando el contrato tras un despido (no se tocó para no ampliar el alcance). El aviso de Cuentas sí distingue: sin contrato activo usa `moneyAdviceNoJob` (corrección 2).
- Nota ajena a SIM-01: Guía > Trabajo dice «buscan personal» con contrato activo.
- Límite marcado con `ponytail` en `prune`: un archivado descartado dentro de `REGISTER_WINDOW` podría registrarse otra vez (solo con más de `MAX_ACTIVE` cerradas en 3 días).

## git diff --stat

Antes de la corrección 2; esta corrección no toca archivos con seguimiento, así que no cambia.

```
 package.json                     |  4 +++-
 scripts/check-fitting-stock.ts   |  2 +-
 scripts/check-luna.ts            |  2 +-
 scripts/check-metro-transfers.ts |  2 +-
 scripts/check-reputation.ts      |  2 +-
 src/config/constants.ts          |  2 +-
 src/data/opportunities.ts        | 29 ++++++++++++++++++++++++++++-
 src/data/vallesco.ts             |  8 +++++++-
 src/main.ts                      | 23 ++++++++++++++++++++++-
 src/state/GameState.ts           | 19 +++++++++++++++++++
 src/systems/Opportunities.ts     | 16 ++++++++++++----
 src/systems/SaveSystem.ts        |  6 ++++++
 src/types/game.ts                |  4 ++++
 src/world/BuildingArt.ts         | 20 +++++++++++++++++++-
 src/world/Lighting.ts            | 21 +++++++++++++++++----
 src/world/LocationBuilder.ts     |  7 +++++--
 src/world/Occlusion.ts           |  8 +++++++-
 17 files changed, 154 insertions(+), 21 deletions(-)
```

Nuevos sin seguimiento de SIM-01: `SIM-01.md`, `scripts/check-consequences.ts`, `src/data/consequences.ts`, `src/systems/Consequences.ts`.
Ajenos a SIM-01 (volumen 2.5D, no tocados): `vallesco.ts`, `src/world/{BuildingArt,Lighting,LocationBuilder,Occlusion}.ts`, las 2 líneas originales de `package.json` y `game.ts`, `VOLUME-25D.md`, `design/volume-evidence/`, `scripts/check-building-volume.ts`, `scripts/qa/run-volume.mjs`, `src/world/BuildingProjection.ts` y `BuildingVolume.ts`. `SIM-00.md` es de la auditoría previa.
