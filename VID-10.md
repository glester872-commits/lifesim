# VID-10 · Encargos de reparto urbano a pie

## 1. Auditoría y alcance

Base: main a5ecb3d, con los cambios sin commitear de LOC-01 y VID-01…09, que se conservan.
Encargos de reparto en Campo Alto: se aceptan en el tablón del barrio, se recogen en un mostrador y se entregan en otro, a pie y con un plazo que empieza al recoger.
Se reutilizan el ledger, los mostradores y sus horarios, el tablón, el reloj, la reputación, la Bolsa y el guardado.
No se toca Jobs, no se crea ningún ítem y no hay migración.

| capacidad | archivo/función | evidencia | carencia | decisión |
|---|---|---|---|---|
| empleo y turnos | `src/systems/Jobs.ts`, contrato por turnos | Existe | No hay trabajo eventual | Crear un estado de reparto propio sin tocar Jobs |
| ledger | `GameState.as` con movement income | Existe | Ninguna | Reutilizar con source `delivery:<defId>` y movementId `delivery:<runId>` |
| bici del jugador | — | El jugador no puede montar: `'riding'` solo aparece en `StreetLife` y `MetroSystem` para NPC, y `campoAltoVenues` dice que la bici «aún no se monta» | NO IMPLEMENTADA | Modalidad: a pie |
| metro entre barrios | `MetroSystem` | Existe | Fuera de este alcance: los dos encargos están en Campo Alto | La ruta entre barrios no está implementada para el reparto |
| lugares y mostradores | Terminales con `catalog`: Café Campo Alto (`cafe-counter`), Panadería Cuatro Hornos (`ca-panaderia-mostrador`) y Ultramarinos Esquina (`supermarket-till`); horarios de `places.ts` y `Places.isOpen` | Existe | Ninguna | Reutilizar |
| tablón | Tablón del barrio de Campo Alto (40,14), `Menus.openBoard` con `extra` | Existe | Ninguna | Reutilizar |
| paquete | `Run.status` `'carrying'` | Única fuente de la custodia, con el patrón del paquete de VID-06 | No se crea ítem: no se puede vender, consumir ni duplicar | Sin límite de inventario, porque no aplica (no es un ítem) |
| reloj | `absMinute` | Se para en pausa y en menús | Ninguna | Reutilizar, sin timers |
| reputación | `Reputation.apply`, con deduplicación por id | Existe | No había prefijo de reparto | Extender: prefijo nuevo `'delivery'` |
| consulta | La Bolsa (línea deshabilitada) y la pista del HUD de escritorio | Existe | Ninguna | Reutilizar; no se toca el HUD móvil |
| guardado | Campo opcional `delivery`; `SAVE_VERSION` 12 | Existe | Ninguna | Sin migración |

## 2. Contrato de datos y transiciones

Leído de `src/data/deliveries.ts` y `src/systems/Delivery.ts`.

- **`DeliveryEnd`:** `location` (el interior del local), `catalog` (el mostrador `'terminal'` donde se recoge o entrega) y `label`.
- **`DeliveryDef`:** `id`, `title`, `board`, `from`, `to`, `pay`, `deadlineMin` (minutos desde que lo recoges), `lateMin` (minutos de retraso que aún se pagan) y `lateFloorPct`.
- **`DeliveryState`:** `{ v: 1; active?: Run; last?: Result }`. Como mucho un activo.
- **`Run`:** `runId`, `defId`, `status` (`'accepted' | 'carrying'`), `acceptedAt`, `pickedAt?` y `deadline?`, con `deadline = pickedAt + deadlineMin`.
- **`Result`:** `runId`, `defId`, `status` (`'delivered' | 'late' | 'expired' | 'cancelled'`), `pay`, `pct`, `at`, `lateBy` (minutos pasados del plazo al resolverse) y `rep` (lo que nota el barrio del destino; lo aplica GameState una vez).
- **`runId`:** `defId:día:minuto`. Aceptar, cancelar y volver a aceptar el mismo minuto se rechaza («Acabas de dejarlo: vuelve a mirarlo dentro de un rato.») para no repetir el runId.
- Las funciones son puras: sin Phaser, sin `Math.random` ni `Date.now`.

Transiciones y validaciones:

- **`accept`:** el encargo debe existir y no debe haber otro activo («Ya llevas un encargo: termínalo o cancélalo antes.»). `acceptBlocker` rechaza si hoy ya no da tiempo por horario: el origen ha cerrado y no reabre hoy, o el destino habrá cerrado sin reabrir hoy al acabar el plazo contado desde que se puede recoger. Resultado: `status` `'accepted'`.
- **`pickUp`:** con `status` `'accepted'`, en el mostrador de origen (misma `location` y `catalog`) y con el local abierto. Si ha cerrado por hoy: «… ya ha cerrado por hoy: puedes cancelar el encargo sin coste.». El plazo empieza aquí: `status` `'carrying'`, `pickedAt` y `deadline`.
- **`deliver`:** con `status` `'carrying'`, en el mostrador de destino y con el local abierto. Revalida estado, sitio, mostrador y horario, y resuelve con `payout`.
- **`cancel`:** con un encargo activo; resuelve como `'cancelled'` (ver sección 4).
- **`expire`:** solo con el paquete encima y pasado `deadline + lateMin`; resuelve como `'expired'`. Si no toca, devuelve el mismo estado.
- **`payout`:** a tiempo, 100 %; tarde, lineal del 90 % a `lateFloorPct` en `lateMin`; después, vencido y 0.
- Al resolver, el encargo se archiva en `last` y `active` desaparece en el mismo estado nuevo.

## 3. Dos encargos

| encargo | origen → destino | pago | plazo | margen de retraso | suelo |
|---|---|---|---|---|---|
| `ca-cafe-ultramarinos` | Café Campo Alto → Ultramarinos Esquina | €6 | 35 min | 15 min | 40 % |
| `ca-panaderia-ultramarinos` | Panadería Cuatro Hornos → Ultramarinos Esquina | €11 | 50 min | 20 min | 40 % |

- La panadería solo se puede hacer de 9 a 14 (domingo, de 10 a 13).
- Justificación, medida con controles normales:
  - Ruta del café casi óptima: 22 min de juego en 13 s reales. Con plazo 20 se llegaba 2 min tarde (corrección 1). Con 35, a tiempo en 21 min.
  - Panadería: 30 min con plazo 50, a tiempo.
  - Las puertas y los fundidos cuentan; el reloj corre unos 2 min de juego por segundo real.
- El pago crece con la distancia.

## 4. Política

- **Puntual:** 100 %.
- **Con retraso:** lineal del 90 % al 40 % dentro del margen.
- **Vencido:** 0 € y −1 de reputación; el paquete vuelve al servicio.
- **Cancelar en accepted:** sin coste.
- **Cancelar en carrying:** sin pago y −1; «Avisas al servicio: pasan a recoger el paquete.».
- **Reputación:** +1 a tiempo, 0 con retraso, −1 vencido o cancelado con el paquete. Una sola vez por runId.
- **Si cambia la disponibilidad tras aceptar:** un encargo aceptado no vence y se puede cancelar gratis; si el origen está cerrado, recoger se rechaza con el motivo.

## 5. Archivos modificados

- Nuevos:
  - `src/data/deliveries.ts`: los dos encargos.
  - `src/systems/Delivery.ts`: reglas, transiciones y `parseDelivery`.
  - `scripts/check-reparto.ts`: el check.
- Editados:
  - `src/data/reputation.ts`: el prefijo `'delivery'`.
  - `src/state/GameState.ts`: el estado de reparto, el pago en el ledger y la reputación.
  - `src/types/game.ts`: el campo opcional `delivery`.
  - `src/systems/SaveSystem.ts`: guardar y cargar `delivery`.
  - `src/scenes/Menus.ts`: el tablón y la Bolsa.
  - `src/scenes/WorldScene.ts`: `interact` con el terminal y `shopOnly`.
  - `src/main.ts`: la pista del HUD de escritorio.
  - `package.json`: `check-reparto` en la cadena.

## 6. Pasos para reproducir

1. Campo Alto, 10:00. Ve al Tablón del barrio y pulsa E; «Reparto»; elige el encargo y «Aceptar».
2. Entra al Café Campo Alto con E en la puerta; ve a la barra (E): «Recoger el paquete · te pagan €6»; confirma.
3. Sal (E en la puerta), rodea el obstáculo de la acera por la fila 11, entra a Ultramarinos (E) y ve a la caja (E): «Entregar el paquete»; confirma.
4. Resultado: «Entregado a tiempo.», +€6 y +1 de reputación.

## 7. Tabla QA

| caso | pasos | esperado | observado | resultado | evidencia |
|---|---|---|---|---|---|
| 1 · oferta | Abrir el tablón de Campo Alto, «Reparto» | Lista los dos encargos con su detalle | «Café Campo Alto → Ultramarinos Esquina €6 · 35 min · abierto» y la panadería «€11 · 50 min»; el detalle da origen, destino, pago y plazo desde la recogida, y el tramo de retraso | PASS | gameplay-qa más la sesión propia |
| 2 · rechazo | Elegir un encargo y «Ahora no» | Nada cambia | Dinero 120 → 120, `delivery` sin crear, Bolsa «No llevas nada encima.» | PASS | Navegador |
| 3 · recogida válida | Aceptar y recoger en la barra del café | Pasa a carrying con el plazo desde la recogida | carrying con `pickedAt` 609 y `deadline` 629 (con los plazos iniciales); la Bolsa muestra «Paquete de reparto para Ultramarinos Esquina · quedan 19 min». Con los plazos nuevos, `deadline = pickedAt + 35` | PASS | Navegador |
| 4 · recogida repetida | Volver al mostrador de origen con el paquete | No se ofrece recoger otra vez | El mostrador ya no ofrece «Recoger» | PASS | Navegador |
| 5 · entrega inválida | Sin paquete; en la panadería con el paquete (receptor incorrecto); desde lejos | No se ofrece | No se ofrece. Solo se entrega con E en el mostrador de destino; no hay entrega desde el móvil ni desde la Bolsa | PASS | Navegador |
| 6 · a tiempo, andando | Hacer los dos encargos a pie | Pago completo y +1 | Café en 21 min, +€6, un movimiento `delivery:ca-cafe-ultramarinos:4:603`, reputación −3 → −2; panadería en 30 min, +€11, −2 → −1 | PASS | Navegador |
| 7 · con retraso | Entregar pasado el plazo, dentro del margen | Pago parcial y reputación sin cambio | 2 min tarde: 80 % (€4,80), reputación sin cambio; otra entrega 7 min tarde dio 55 % (€3,30) | PASS | Navegador |
| 8 · cancelaciones | Cancelar en accepted y en carrying | Gratis en accepted; sin pago y −1 en carrying | En accepted, sin coste; en carrying, sin pago, −1, fuera de la Bolsa y con el mensaje del servicio | PASS | Navegador |
| 9 · vencido | Llegar a la caja pasado el margen | 0 € y −1, se sigue jugando | «Vencido: 230 min fuera de plazo. El paquete vuelve al servicio.», 0 € y −1; también vence al abrir el tablón. Se sigue jugando | PASS | Navegador |
| 10 · guardar y cargar en cada fase | Recargar con el paquete encima y tras cobrar | Mismo plazo y sin segundo pago | Tras recargar con el paquete encima, `deadline` y `runId` iguales; tras cobrar, sin segundo pago (130,80 y 2 movimientos) | PASS | Navegador; check-reparto E y F |
| 11 · recargar tras cobrar | Cobrar y recargar | Sin efectos repetidos | Sin segundo pago ni reputación extra | PASS | Navegador |
| 12 · dos encargos | Hacer el del café y el de la panadería | Separados | runIds distintos, y movimientos y motivos de reputación separados | PASS | Navegador |
| 13 · accesos y horarios | Ir andando a los mostradores; tablón con la panadería cerrada (15:00) | Alcanzables respetando colisiones; no se acepta si hoy no da tiempo | Los mostradores son alcanzables andando y respetan las colisiones (el obstáculo de la acera se rodea). Con la panadería cerrada, «Aceptar» sale deshabilitado con «Hoy ya no da tiempo: Panadería Cuatro Hornos ha cerrado. Vuelve mañana desde las 7:00.» (corrección 2) | PASS | Navegador |
| 14 · bici y ruta entre barrios | — | — | NO IMPLEMENTADA: el jugador no puede montar en bici y los dos encargos están en Campo Alto (sección 1) | NO IMPLEMENTADA | Sección 1 |
| 15 · partida antigua | Cargar un v12 sin `delivery` | Carga vacío | Carga vacío; las partidas recargadas en las pruebas funcionan | PASS | check-reparto E |
| 16 · sin regresiones | Build, checks, cadena, consola, visual-qa y optimizer | Sin regresiones | build exit 0; check-vecinos, check-reputation, check-regression, check-places y check-economy con exit 0; cadena completa `TOTAL=165 FAILS=0`; consola limpia; visual-qa PASS; optimizer PASS (50-59 FPS en Campo Alto, sin over; sin trabajo por frame). Cámara y HUD sin tocar | PASS | Secciones 9 y 10 |

## 8. Compatibilidad de guardados

- `SAVE_VERSION` sigue en 12, sin migración: `delivery` es un campo opcional.
- `parseDelivery` es robusto: descarta lo mal formado o con un encargo desconocido, admite como mucho un activo y, con basura, devuelve el estado vacío.
- El plazo se reconstruye desde `pickedAt` (`pickedAt + deadlineMin`): recargar no lo reinicia ni lo estira.

## 9. Build y check

- `npm run build`: exit 0.
- `check-reparto`: exit 0, «check-reparto: ok».
- Cadena completa: `TOTAL=165 FAILS=0`.

## 10. Navegador

- **Plataforma:** Chrome por CDP, con contextos aislados ('vid10qa', 'vid10walk' y 'vid10perf'). La partida del usuario no se usó.
- **Recorrido:** el principal se hizo con teclado (WASD, E y 1-9, con pulsaciones mantenidas). Para preparar las pruebas se usaron teleport y setClock solo antes de recoger y para colocar el tablón, nunca entre recoger y entregar.
- **Móvil:** emulado, 390×844: el tablón sin desbordes (overflow 0).
- **Dispositivo físico:** NO VERIFICADO; lo hace el usuario.
- **Error `setVelocity` de la sesión de gameplay-qa:** lo provocó su script con `interact(undefined)`. En una sesión limpia la consola está limpia.
- **Capturas** en el scratchpad: `vid10-tablon.png`, `vid10-bolsa.png` y `vid10-tablon-movil.png`. No se meten binarios en el repo.

## 11. DeepSeek

NOT EVALUATED.

## 12. Correcciones 2/2

1. Plazos medidos y la etiqueta «te pagan €X».
2. No aceptar si hoy ya no da tiempo por horario.

## 13. git diff --stat

```
 package.json              |   2 +-
 src/data/reputation.ts    |   5 +-
 src/main.ts               |  22 ++-
 src/scenes/Menus.ts       | 317 +++++++++++++++++++++++++++++++++-----
 src/scenes/WorldScene.ts  | 350 +++++++++++++++++++++++++++++++++++++++---
 src/state/GameState.ts    | 382 +++++++++++++++++++++++++++++++++++++++++++++-
 src/systems/SaveSystem.ts |  44 ++++++
 src/types/game.ts         |  15 ++
 8 files changed, 1056 insertions(+), 81 deletions(-)
Sin trackear: src/data/deliveries.ts, src/systems/Delivery.ts, scripts/check-reparto.ts, VID-10.md
Árbol completo: 57 files changed, 1781 insertions(+), 175 deletions(-)
```

El stat acumula los cambios sin commitear de LOC-01 y VID-01…09 en esos mismos archivos.

## 14. Riesgos y pendientes

- Ampliaciones: la bici del jugador y el reparto entre barrios en metro (NO IMPLEMENTADAS).
- En móvil, el nombre origen → destino del tablón ocupa 4 líneas; se lee entero.
- La pista del HUD solo aparece si no hay otro compromiso con hora.
- Un encargo aceptado no vence; se cancela gratis.

## 15. Rollback

1. Borrar `src/data/deliveries.ts`, `src/systems/Delivery.ts`, `scripts/check-reparto.ts` y `VID-10.md`.
2. Revertir los hunks de VID-10 en `src/data/reputation.ts`, `src/state/GameState.ts`, `src/types/game.ts`, `src/systems/SaveSystem.ts`, `src/scenes/Menus.ts`, `src/scenes/WorldScene.ts`, `src/main.ts` y `package.json`.
3. No hay migración que deshacer.
