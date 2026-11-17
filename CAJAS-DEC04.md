# DEC-04 · Cajas, colas y autopago en Decathlon

Modo BALANCED. Rama `dec-01-atencion`, base `2dafbcc` (DEC-01, DEC-02 y DEC-03 en commits). Sin commit.

## Fase 1 · Estado inicial

- `git status` y `git diff` iniciales: vacíos (árbol limpio en `2dafbcc`).
- HUD móvil (ALPHA-09): sin constante de versión en `src`; la UI de pago reutiliza el menú existente, ya verificado a 390×844 en DEC-03.
- Nota: `check-decathlon.ts:216-256` ya tiene una sección titulada «DEC-04 · Cola y pago por carril» (anterior a este ticket);
  `DEC-02.md` está desfasado al decir que no hay carril por caja: sí lo hay.

## Fase 1 · Auditoría

| Pieza | Dónde | Estado |
| --- | --- | --- |
| Cajas | `data/decathlonLayout.ts` `checkouts`: caja-1..6 atendidas (x 47, 50, 53, 56, 59, 62; cliente (c,46), registradora (c+1,46), cajero (c+2,46), cola (c,45)/(c,44), salida (c,47)) + auto-1 (42,46), auto-2 (44,46) | 6 atendidas + 2 autopago **decorativas** |
| Carril por caja | `decathlon.ts:448-452` (`PAY`: QUEUE `DECAT_QUEUE_{n}_` → CHECKOUT `DECAT_TILL_{n}`), `Crowd.ts:84` `laneOf`, `:743`, `:759-780` `expand`/`openLanes` | EXISTE: hace cola y paga en la misma caja |
| Elección de caja | `freePoint` (`Crowd.ts:1291`): punto libre aleatorio entre todas las cajas abiertas | PARCIAL: no elige la cola más corta |
| Avance | QUEUE _02 → _01 → TILL: cada paso pide un punto libre del mismo carril (`nextVisitorStep` :707-748) | EXISTE |
| Caja que cierra con cola | `expand` devuelve vacío → espera y, con 25 %, se salta el paso | **FALTA**: no se reasigna |
| Un punto, una persona | `freePoints` (`Crowd.ts:1296`): fuera `seats` y `claimed` | EXISTE |
| Disponibilidad | `open` (días, nivel, horas: DEC-02) + `staffOnShift` + `openLanes` (cajero presente y no saliendo) | EXISTE |
| Estado de caja | No hay estado explícito | **FALTA** (derivable) |
| Pago del jugador | Habla con el cajero desde `DECAT_TILL_n` → `openStore` (una prenda por compra, `Retail.buyGarment`, idempotente) | EXISTE (una línea) |
| Cesta | No hay cesta de prendas. `Commerce.checkout` (`Commerce.ts:87`) es una línea de objetos de inventario (rastro), no admite prendas | **FALTA** |
| Autopago | Prop `register` en (42,47)/(44,47), sin punto ni interacción | **FALTA** |
| Patrón de máquina interactuable | `SpotDef` (`types/game.ts:436`) con marcas que abren menú (`wardrobe`, `job`, estudio…) | EXISTE |
| Guardado | Nada de cajas ni cesta en `state`/guardado; `SAVE_VERSION` 5 | — |

## Fase 1 · Definiciones previas

- **Cajas:** 6 atendidas (`caja-1..6`, sin cambios de posición) + **2 autopago funcionales** (`auto-1`, `auto-2`). Ampliación:
  de 6 a **8 puntos de pago operativos**. No se añaden más cajas atendidas: cada una exige un cajero con chaleco distinto y los
  11 aspectos de empleado ya están en uso (check-uniform), y más mostradores serían arte o tiles nuevos.
- **Espacio físico:** sin cambios en la nave ni en los tiles; las 8 posiciones ya existen y check-decathlon valida que no invaden pasillos.
- **Modelo de caja** (derivado, no guardado): `{ id: 'caja-n' | 'auto-n', type: 'staffed' | 'self', state, position: till, queuePositions:
  queue[], assignedCashier: rol 'Caja n' }` sale de `DECATHLON_LAYOUT.checkouts` + la población viva.
- **Modelo de cola:** las posiciones de `queue` de cada caja (2 plazas) + `till` (la que paga). Cada posición es un punto con nombre;
  `SeatRegistry` la reserva para una persona y la libera al dejarla.
- **Estados** (función pura, recalculada en cada tick lento; nunca guardados):
  - `cerrada`: sin cajero en turno (atendida) o tienda cerrada; para autopago, sólo con la tienda cerrada.
  - `ocupada`: hay alguien en su `till`.
  - `abierta`: el resto.
  Se ve en el mundo: cajero presente o ausente en su puesto (sin cartel nuevo: sería arte). El jugador: hablar con una caja sin cajero
  no ofrece nada; en autopago ocupado por un NPC no puede colocarse (el tile está ocupado).
- **Disponibilidad:** la de DEC-02 (`open` días/nivel/turno). Cierre: el cajero sale por fin de turno o cierre de tienda.
- **Clientes:** sin carril, eligen la caja **abierta con menos gente** (cola + la que paga); empate al azar con el RNG de la sala.
  Avanzan al liberarse la plaza siguiente. Si su caja cierra estando en cola, se les quita el carril y eligen otra abierta; si no hay
  ninguna, se van. Quien ya está pagando (`till`) termina. Se retiran por la salida de su caja y luego la puerta.
  Autopago para NPC: sólo si basta con puntos nuevos `DECAT_SELF_n` y un paso alternativo en datos; si no, documentado.
- **Sin superposiciones:** puntos exclusivos (`seats` + `claimed`) y el carril propio; un check simula colas con ≥5 clientes y
  comprueba que ningún punto tiene dos personas.
- **Jugador:**
  - Se coloca en el punto de cliente de una caja atendida abierta (`DECAT_TILL_n`, como hoy) o en el tile de una máquina de autopago.
    No hay plaza de cola para el jugador (si el punto está ocupado por un NPC, espera a que quede libre).
  - **Cesta (nuevo):** en los percheros de Decathlon, además de PROBAR y COMPRAR, «A LA CESTA». La cesta vive en el estado en memoria
    (`state/`), por tienda, y **no se guarda**: recargar la vacía sin cobrar nada.
  - En caja o autopago: «Pagar la cesta» muestra las líneas, el total y permite **quitar** una línea; luego CONFIRMAR o CANCELAR.
    Cancelar no cobra y conserva la cesta. Cantidades: una por prenda (el armario sólo guarda una de cada).
- **Autopago:** las dos máquinas existentes pasan a ser `spot` con una marca de autopago (como `wardrobe`); abre el mismo pago de la
  cesta sin cajero y tarda más minutos que la caja atendida. Sin arte nuevo.
- **Cajero:** el NPC de turno (DEC-01/DEC-02). El jugador no puede hacer de cajero (fuera de alcance).
- **Transacción única:** el pago de la cesta es una función pura que aplica `buyGarment` línea a línea sobre una copia; si cualquier
  línea falla (saldo, ya la tienes), no se aplica **nada**; si todas valen, se aplica el resultado completo en un paso síncrono, se vacía
  la cesta y se guarda. Doble pulsación: bloqueo del menú (`PICK_LOCK_MS`) y la cesta vacía tras pagar. Recarga: la cesta no existe,
  las prendas pagadas están en el armario (se rechaza recomprarlas). Reentrada: igual.
- **Integración con DEC-03:** COMPRAR directo en el perchero sigue (DEC-03); «A LA CESTA» es la otra vía. Una prenda en la cesta no
  puede estar ya en el armario (se rechaza al añadir y al pagar), así que nunca se cobra dos veces ni se duplica.
- **Rendimiento:** FPS y frame time en sábado 18:00 frente a la línea base de DEC-02 (60 fps, peor frame 17,3–17,4 ms); la elección
  de caja recorre ≤8 cajas por cliente nuevo.
- **Formato de evidencia:** tabla al final de este archivo.

## Ajustes respecto a la Fase 1

- **Autopago al lado de la máquina, no encima:** los spots están en (41,47) y (43,47). La regla (j) de check-decathlon prohíbe un spot
  sobre el tile de cliente, la cola, la salida o la máquina del autopago.
- **auto-2 no respeta `open.minLevel` MEDIUM:** funciona siempre que la tienda esté abierta (el cierre lo cubre `shutFor`). Respetarlo
  obligaría a leer la afluencia de `Crowd` desde la escena.
- **Autopago de NPC: no implementado.** Haría falta un tipo de cliente nuevo, que cambia el reparto de afluencia de DEC-02, y lógica
  de `minLevel` en `Crowd`; además competiría con el autopago del jugador. Queda como trabajo futuro.
- **Precio de la línea:** se guarda al añadir; el total y el cobro se recalculan con el factor del barrio al pagar (se cobra lo que
  muestra CONFIRMAR).

## Implementación

| Archivo | Cambio |
| --- | --- |
| `src/systems/Crowd.ts` | `openLanesOf`, `laneLoad`, `laneState` (estado derivado); `pickLane` (caja abierta con menos gente, empate con el RNG de la sala); `relane` (si su caja cierra estando en cola, vuelve a hacer cola en otra o se va; quien paga termina). Sólo actúa en perfiles con `{n}` (Decathlon) |
| `src/systems/Basket.ts` (nuevo) | `addLine`, `removeLine`, `total` (céntimos), `payBasket` (todo o nada sobre `buyGarment`) |
| `src/state/GameState.ts` | `basket` en memoria, fuera del `snapshot` (no se guarda) |
| `src/data/retail.ts` | `RetailStoreDef.basket`; `decathlon` la tiene |
| `src/scenes/Menus.ts` | «A LA CESTA» en la ficha; «Pagar la cesta (N · €X)» en la caja; `openBasket` (Quitar / CONFIRMAR PAGO / CANCELAR); `openSelfCheckout` (8 min) |
| `src/types/game.ts`, `src/scenes/WorldScene.ts`, `src/data/decathlon.ts` | `SpotDef.selfCheckout` y su despacho; spots «Autopago 1/2» derivados de `checkouts` de tipo `self` |
| `scripts/check-checkout-basket.ts` (nuevo) + `package.json` | cesta, total, todo o nada, pago único, fuera del guardado, autopagos válidos |
| `scripts/check-decathlon.ts` | simulaciones de colas (sábado saturada y holgada; lunes, cierre de la caja 2) con el jugador lejos de la puerta |
| `scripts/check-regression.ts` | un spot con `selfCheckout` hace algo si su tienda tiene `basket` (validación real, no relajada) |

Correcciones: 2/2, ambas en la parte 1 y por el check, no por la lógica: (1) con colas saturadas no había elecciones que juzgar;
(2) el jugador simulado estaba a 1 tile de la puerta y bloqueaba la entrada (`doorClearance` 1,5).

## Fase 5 · Evidencia

Navegador: Chrome vía DevTools, `localhost:5199`, escritorio 958×888. Ranura 3 respaldada y restaurada (día 26, 10:15, €107,50).

| Caso | Pasos | Esperado | Obtenido | Estado | Notas |
| --- | --- | --- | --- | --- | --- |
| ≥5 clientes en cola sin superposición | check-decathlon, sábado 18 h saturado, 2000 ticks | ningún punto con dos; ≥5 a la vez | pasa | PASS | |
| Elegir la caja con menos gente | check-decathlon, sábado holgado | elecciones > 0, ≥90 % a la más ligera | pasa | PASS | |
| Estados cerrada/ocupada/abierta | check-decathlon frente a cálculo independiente | los tres, correctos | pasa | PASS | |
| Cierre de caja con cola | check-decathlon, lunes 15:20 → 15:31, caja 2 | quien paga termina; la cola se reasigna o se va | pasa | PASS | |
| Cola y pago en la misma caja | check-decathlon | nunca paga en otra | pasa | PASS | |
| Aperturas según afluencia y turnos | DEC-02 + check-footfall | cajas según `open` | pasa | PASS | |
| Añadir a la cesta | Perchero → cortavientos → A LA CESTA; gorra | en la cesta, sin cobro | cesta `[cortavientos 19,99, gorra 6,99]`, €107,50 | PASS | |
| Duplicado en la cesta | A LA CESTA otra vez | rechazo | cesta igual | PASS | |
| Pagar en caja | Caja 1 con E real | «Pagar la cesta (2 · €26,98)» | sale el primero; total correcto | PASS | `CAJAS-DEC04/01-caja-pagar-cesta.png` |
| Revisar la cesta | Pagar la cesta | líneas, total, Quitar, CONFIRMAR, CANCELAR | todo | PASS | `02-cesta.png` |
| Quitar y cancelar | Quitar gorra; CANCELAR | sin cobro; cesta con 1 | €107,50; `[cortavientos]` | PASS | |
| Confirmar | CONFIRMAR PAGO | cobra una vez, entrega, vacía | €107,50 → €87,51; armario + cortavientos; cesta vacía | PASS | `03-pagado.png` |
| Doble toque al confirmar | CONFIRMAR + E a los 80 ms | un cobro | sólo las gafas (€12,98) | PASS | `PICK_LOCK_MS` 300 ms |
| Autopago sin cesta | E en Autopago 1 | mensaje útil, sin botón vacío | «Escanea primero…», sólo Cerrar | PASS | `04-autopago-vacio.png` |
| Autopago con cesta | Polar a la cesta → Autopago 1 → CONFIRMAR | cobra, entrega, más minutos | €66,55 → €41,58; 8 min (caja 5) | PASS | `05-autopago-pagado.png` |
| Saldo insuficiente | €5, zapatillas de trail (29,96) | nada cambia | CONFIRMAR desactivado: «No te llega: cuesta €29,96»; todo idéntico | PASS | `06-sin-saldo.png` |
| Recarga con cesta llena | Guardar → recargar → Continuar | cesta vacía, nada cobrado | cesta `[]`, €41,58, armario intacto | PASS | |
| Reentrada / recompra | Pagar algo ya comprado | rechazo | `addLine` y `payBasket` lo rechazan | PASS | check-checkout-basket |
| Navegación | check-decathlon, check-interaction | sin obstruir pasillos | pasa | PASS | |
| Rendimiento hora punta | sábado 18 h, cajas | sin caída | 60 fps, 23–24 agentes, peor frame 19 ms (antes 17,4), `over` vacío | PASS | pico aislado |
| Errores JS | listener `error` | 0 | 0 | PASS | |
| Móvil 390×844 | — | — | no repetido: mismo menú que DEC-03 (PASS) | NO VERIFICADO | |
| Teléfono físico | — | — | no disponible | NO VERIFICADO | |
| Autopago de NPC | — | — | no implementado | NO VERIFICADO | trabajo futuro |

**Riesgo observado:** tras pagar la cesta, el menú vuelve a la lista de la caja con la primera prenda marcada; dos pulsaciones
deliberadas (más de 300 ms después) la compran. Es el comportamiento de siempre de esa lista, no un doble cobro, pero sería mejor
volver con «Sólo miraba» marcado. Trabajo futuro.

Comandos: `npm run build` exit 0. Cadena completa de `npm run check` (los 145 comandos de `package.json` ejecutados uno a uno desde PowerShell, porque `npm run check` no podía crear el proceso hijo: EPERM -4048): **145 de 145 OK**, 467 s, 2537 líneas; incluye check-store-knowledge, check-footfall, check-decathlon-sport y check-checkout-basket. Evaluador: PASS.
