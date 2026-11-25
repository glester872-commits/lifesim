# VID-12 · La primera hora con narrativa guiada

Resultado: **PASS con riesgos** (evaluador) · BALANCED · correcciones 2/2 · agentes: planner, builder, evaluator, gameplay-qa, visual-qa, optimizer.
Criterios PARCIAL: hito social y duración de «primera hora».

Repo: `C:\Users\glest\Documents\lifesim`, rama main.
El árbol ya tenía cambios ajenos sin commitear, que se conservan.
Archivo nuevo del ticket: `scripts/check-guia.ts` (sin seguimiento en git).

## 1. Auditoría inicial

Ya había una guía de texto (`TOUR`, `src/data/tour.ts:64`) que se mostraba al empezar (`WorldScene.offerTour`) y se releía en el móvil (Hoy).
No había hitos ni progreso: la guía solo contaba cosas y no comprobaba nada.
Decisión: cuatro hitos que se **leen** de lo que la partida ya guarda (social, historias, viajes, tarjetas, empleo, ledger, planes, diario).
La guía no marca nada por su cuenta. Lo único que se añade es la elección del jugador (`agenda.guide`) y la marca de empleo `agenda.marks['guia:job']`.

| capacidad | archivo/función | evidencia | carencia | decisión |
|---|---|---|---|---|
| guía de texto | `data/tour.ts` `TOUR` | 5 pasos fijos | Sin progreso | Se conserva para partidas sin `guide` |
| presentarse | `data/*Story.ts`, beats con `event: 'conocerse'` | Flags de la historia | Ninguna | Fuente del hito 1 (`MET_FLAGS`, `Agenda.ts:150`) |
| paradero de NPC | `Opportunities.whereNow`/`nowAt` (`Opportunities.ts:107`, `:116`) | Rutina real que dibuja el mundo | `nowAt` no dice si es alcanzable | Pista del hito 1 con `reachable`/`moving` |
| metro | `events.rides`, `wallet.cards`, `metroJourney` | Ya se guardan | Ninguna | Fuente del hito 2 |
| empleo | `state.job`, ledger de turnos sueltos | Contrato y cobro | Pedir o rechazar no dejaban rastro | `markJob` en Menus (`Menus.ts:719`) |
| planes | `phone.plans`, `stories[npc].plan` | Ya se guardan | Ninguna | Fuente del hito 4 |
| quedada en casa | diario (VID-11), tipo `gathering` | Ya se guarda | Ninguna | Cuenta como asistencia |
| horario de la tienda | `Places.isOpen`/`nextOpening` | Existe | Ninguna | Pista «abre a las…» (`Agenda.ts:205`) |

## 2. Condiciones iniciales

- Partida nueva: `startAgenda()` sin `guide` (`Agenda.ts:74`); la pregunta sale en `offerTour` (`WorldScene.ts:2193`).
- «Tu primera hora» (`WorldScene.ts:2205`): «Empezar con guía» → `'guided'` y los pasos de TOUR; «Explorar libremente» o Esc (opción por defecto 1) → `'free'` y `tour: 'skipped'`.
- Al elegir se guardan `chosenAt` (minuto absoluto) y `baseRides` = `events.rides` (`WorldScene.ts:2207`).
- «Saltar la guía» en TOUR deja `mode: 'skipped'` (`WorldScene.ts:2226`).
- Si `agenda.guide` ya existe, no se vuelve a preguntar (`WorldScene.ts:2199`).

## 3. Contrato de datos

- **`AgendaState.guide?: GuideChoice`**, opcional (`Agenda.ts:67`).
- **`GuideChoice`:** `{ mode: 'guided' | 'free' | 'skipped', chosenAt: number, baseRides: number }` (`Agenda.ts:70-71`).
- **`parseGuide` tolerante** (`Agenda.ts:78-84`):
  - Si no es un objeto o el `mode` no es válido, devuelve `undefined` y el campo no se carga.
  - Si `chosenAt` no es finito, queda en 0.
  - Si `baseRides` no es finito o es negativo, queda en 0; los valores se redondean hacia abajo.
- `parseAgenda` solo añade `guide` si existe (`Agenda.ts:100-101`).
- **`SAVE_VERSION` sigue en 12** (`src/config/constants.ts:63`). Una partida antigua carga sin `guide` y no ve la pregunta (`tour` ya no es `'new'`).
- **`agenda.marks['guia:job']`:** `'applied' | 'declined' | 'denied' | 'casual'`. Se apunta en cualquier modo (`Menus.ts:686-698`, `:2981`).
- **`guideProgress(input)`** es puro (`Agenda.ts:169-225`). **`guideInputOf(snapshot)`** lo alimenta (`Agenda.ts:228-257`).
- **`resumeGuide`** (`Agenda.ts:260-262`) solo pasa a `'guided'`. En una partida sin `guide`, lo crea con `chosenAt = ahora` y `baseRides = viajes de ahora`.
- Reglas de cada hito:
  1. **Vecino:** número intercambiado, flag de presentarse o evento `'conocerse'` (`metSomeone`, `Agenda.ts:157-159`). No vale `importantNPCsMet` ni un simple encuentro.
  2. **Metro:** tarjeta `GUIDE_CARD`, `rides > baseRides`, y fuera de toda estación sin billete vivo (`Agenda.ts:191-193`).
  3. **Trabajo:** contrato activo, una marca de `GUIDE_JOB_MARKS` o un turno suelto cobrado en el ledger (`Agenda.ts:200-202`).
  4. **Social:** pasos `proposed`, `received`, `accepted` y `attended` (`Agenda.ts:211-215`). Hecho = (`proposed` o `received`) y `accepted` (`Agenda.ts:221`).
- Pistas (tras las correcciones):
  - Hito 1: solo se nombra a quien se ve en el mapa (`reachable` = no está dentro de un sitio; `Agenda.ts:181`, `:240`). Si anda, `hints.walking` (`tour.ts:130`).
  - Si todas están dentro: «en casa» o «dentro» (`Agenda.ts:186`), más la próxima media hora en que alguna está parada fuera (`later`, `Agenda.ts:245-248`) o «Vuelve más tarde a la calle.».
  - Hito 3: con la tienda cerrada, la hora de apertura (`closed`, `tour.ts:116`).
  - Hito 2: si a la tarjeta no le llega para un viaje, la recarga (`topup`, `tour.ts:99`).

## 4. Archivos

| archivo | motivo |
|---|---|
| `src/systems/Agenda.ts` | `GuideChoice`, `parseGuide`, `guideProgress`, `guideInputOf`, `resumeGuide` |
| `src/systems/Opportunities.ts` | `whereNow` exportado (`:107`): el paradero real para `reachable`/`moving` |
| `src/data/tour.ts` | `GUIDE` (4 hitos, pasos y pistas), `TRANSPORT_CARD`, `GUIDE_CARD` |
| `src/scenes/WorldScene.ts` | `offerTour`: pregunta «Tu primera hora»; `tourStep`: saltar → `'skipped'` |
| `src/scenes/Menus.ts` | `markJob` al pedir, ser denegado, rechazar o hacer un turno suelto |
| `src/ui/Phone.ts` | Bloque «Guía» en Hoy (`:587-621`): hitos con pasos ✓/·, «Ahora:» y «Retomar/Dejar la guía» |
| `src/main.ts` | Pista del HUD « · Guía: …» en `reviewAgenda` (`:318-323`), nunca con un diálogo o menú abierto |
| `scripts/check-guia.ts` (nuevo) | 15 pruebas `node:test` |
| `package.json` | `check-guia` en la cadena `check` |

## 5. Recorrido y duración

Navegador, ranura 2, partida nueva, «Empezar con guía», solo teclado.
Sin teleport, `setClock`, saldo, relaciones inyectadas ni marcas de depuración.

- **Hito 2 (metro).** Compré la tarjeta: de 120 € a 107,50 €. Viaje Vallesco → Polígono Norte: la tarjeta pasa de 10 € a 8 € y rides 1. Salí a la calle. El hito se reconoce aunque lo hice antes que el hito 1.
- **Hito 3 (trabajo).** Decathlon cerrado de madrugada («Todavía no ha abierto»). Esperé de forma normal, «Solicitar el puesto» (marca `applied`) y luego «Rechazar la oferta» (`declined`). Sin empleo, sin dinero y sin entrada en el diario. Vuelta en metro: rides 2, tarjeta a 6 €.
- **Hito 1 (vecino).**
  - Primer intento fallido: la pista genérica no era accionable y el camarero bloqueaba la puerta del restaurante.
  - Tras la corrección 1/2, la pista «Ada está en Metro» señalaba a alguien que estaba dentro de un sitio y no se podía alcanzar.
  - Tras la 2/2, las pistas coincidieron con el mundo: Ada por la calle, Sara en el Gimnasio Forja y Ada en la Cafetería Pausa.
  - De noche, la pista dijo «Hacia las 09:00, Amaia suele estar en Cafetería Pausa». Amaia estaba en la Pausa a las 8:44 y Sara en Hilo a las 11:26.
  - Hubo dos pérdidas de NPC por la lentitud del automatismo. En otra, mi bucle no pulsaba E.
  - Día 3 a las 12:50: charla con Sara en Hilo, escena `'conocerse'`, flag `sara_met` y hito hecho.
- **Hito 4 (social).**
  - Sara pidió un favor (subirle la compra) y lo acepté. Charlé hasta amistad 18 y usé «Pedir contacto» (`contactExchanged`).
  - Por Mensajes, «Proponer café»: plan del móvil `proposed`, café al día siguiente a las 18:00 en la Pausa. Sara acepta.
  - `bridgePlans` (previo) lo convierte en su plan de historia `'terraza'`, día 4 a las 20:00 (CAFE_TERRACE_01), y deja el del móvil en `cancelled`.
  - Espera normal. Sara me saludó a las 9:54 y contesté «Ahora no».
  - Día 4 a las 20:24, junto a la terraza: «¡Has venido! Pensaba que se te olvidaba.». El plan queda `'kept'`.
  - Los 4 pasos en ✓. Dinero 107,50 € sin cambios; diario vacío.
- **Duración.**
  - En tiempo de juego, del día 1 a las 08:31 (`chosenAt` 511) al día 4 a las 20:49. El reloj corre a 2 min de juego por segundo real.
  - En tiempo real fueron varias horas, infladas por el automatismo, las recargas y las pausas por estrangulamiento de la pestaña (1 fps en segundo plano).
  - **No se cumple «una hora».** Lo impiden los horarios (Decathlon 9:00-9:30), las rutinas de las NPC y que `planForInvite` lleve la cita a today+1. El ticket prohíbe cambiarlos. Criterio **PARCIAL**.

## 6. Aceptación

| # | criterio | estado | evidencia |
|---|---|---|---|
| 1 | Elegir guía o explorar al empezar, una vez | PASS | Pregunta «Tu primera hora»; «Explorar libremente» → `'free'` sin «Guía:» en el HUD; Esc → `'free'` |
| 2 | Hito 1 por presentación real | PASS | Día 3 12:50, escena `'conocerse'` con Sara, flag `sara_met` |
| 3 | Hito 2 metro completo | PASS | Tarjeta 120 → 107,50 €; viaje con tarjeta de 10 a 8 €, rides 1; salida a la calle |
| 4 | Hito 3 empleo sin forzar contrato | PASS | `applied` y luego `declined`; sin empleo, dinero ni diario |
| 5 | Hito 4 social | PARCIAL | Recorrido completo y `'kept'`, pero el paso «Recibir una invitación» se marca con crédito falso (riesgo 1), `accepted` es laxo (2) y `done` no exige asistir (3) |
| 6 | Fuera de orden | PASS | El hito 2 cuenta aunque se hizo antes que el 1; check-guia «fuera de orden» |
| 7 | Pistas accionables y fieles al mundo | PASS (tras 2/2) | Solo se nombra a quien se ve; «dentro»/«en casa»; `later` a las 09:00 confirmado a las 8:44 |
| 8 | Retomar y dejar la guía | PASS | Hoy → «Retomar la guía» → `'guided'`, con «Ahora:» y la línea del HUD « · Guía: Amaia está en Cafetería Pausa: háblale (E) hasta que se presente.» (1280x800); «Dejar la guía» → `'skipped'` |
| 9 | Persistencia | PASS | Ver sección 7 |
| 10 | Partida antigua sin pregunta ni hitos inventados | PASS | Sección 7; check-guia «partida vieja sin guide» |
| 11 | La guía no concede nada | PASS | Dinero 107,50 € sin cambios tras los cuatro hitos; diario vacío; `guideProgress` puro |
| 12 | Duración «primera hora» | PARCIAL | Día 1 08:31 → día 4 20:49 en juego; ver sección 5 |
| 13 | Rendimiento | PASS | Ver sección 9 |
| 14 | Móvil | PASS | 390x844: el bloque Guía se lee bien |
| 15 | Sin regresiones | PASS | tsc 0; `npm run check` 168/168, FAILS=0; consola sin errores |

## 7. Persistencia

- Al recargar no se repite la pregunta, porque `agenda.guide` existe (`WorldScene.ts:2199`).
- `'skipped'` se conserva al recargar.
- **Partida antigua:** se quitó `agenda.guide` del localStorage en un contexto aislado (`vid12esc`); solo simula una partida previa.
  - No sale la pregunta, y Hoy muestra los textos de TOUR y «Retomar la guía».
  - Al retomarla, `mode 'guided'` con `chosenAt` 600.
- check-guia: `parseAgenda` hace ida y vuelta con `guide` y descarta un `mode` inválido.
- La guía pertenece a la ranura, porque viaja dentro de `agenda` en el JSON de cada una.

## 8. Build/check

- `tsc`: exit 0.
- Cadena completa de `npm run check`: TOTAL=168, FAILS=0.
- `check-guia` (`node:test`): en verde.

## 9. Navegador

- Flujos de gameplay-qa y del orquestador, todos PASS: libre, recarga, retomar, dejar, Esc, partida antigua, consola sin errores y móvil 390x844.
- **Rendimiento** (optimizer): `guideInputOf` + `guideProgress` de día dan una media de 0,03 ms y p95 de 0,10 ms.
  - Peor caso (nadie presentado, todas dentro, bucle `later`): media de 0,17 ms y p95 de 0,3 ms.
  - Se llama como mucho una vez por minuto de juego o por casilla (`main.ts` `reviewAgenda`, `:265`, `:319`) y al pintar Hoy. 60 fps. PASS.
- **visual-qa:** la pregunta «Tu primera hora» en escritorio, PASS.
  - Nit: punto doble en los pasos pendientes (`Phone.ts:595`).
  - El aviso «Cuentas» sale a la vez que la pregunta. No se confirmó si ya pasaba antes.
  - A 500x335 los botones del HUD tapan el diálogo. No se probó si es previo; ALPHA-09 no se tocó.

## 10. DeepSeek

NOT EVALUATED (no conectado).

## 11. git diff --stat

Los archivos de VID-12 mezclan cambios sin commit de tickets anteriores, como BIKE-01 y VID-11. Las cifras no son solo de este ticket.

```
 package.json                 |   2
 src/data/tour.ts             |  86
 src/main.ts                  |  41
 src/scenes/Menus.ts          | 384
 src/scenes/WorldScene.ts     | 656
 src/systems/Agenda.ts        | 193
 src/systems/Opportunities.ts |  19
 src/ui/Phone.ts              | 221
 8 files changed, 1494 insertions(+), 108 deletions(-)
```

`scripts/check-guia.ts` es nuevo y está sin seguimiento.

Sin commit, push, merge ni deploy.

## 12. Riesgos

1. **Crédito falso en «Recibir una invitación»** (`src/systems/Agenda.ts:212`). Con `received = plans.some(by === 'npc') || stories.length > 0`, un plan de historia nacido de mi propuesta marca el paso. Arreglo propuesto: que `received` exija un plan del NPC o un plan de historia sin propuesta del jugador. — **Cerrado en VID-12b/PLAN-DOOR.**
2. **`accepted` es laxo** (`Agenda.ts:213`): cuenta `'past'` y cualquier plan de historia no cancelado. — **Cerrado en VID-12b/PLAN-DOOR.**
3. **`social.done` no exige asistir** (`Agenda.ts:221`). — **Cerrado en VID-12b/PLAN-DOOR.**
4. **Sin atar a `chosenAt`:** vecino (`Agenda.ts:157-159`), social (`:210-215`) y el diario (`:215`, `:254`). En partidas antiguas pueden contar hechos de antes de elegir la guía. — **Cerrado en VID-12b/PLAN-DOOR** (sin filtro, a propósito; ver §13).
5. **Filas de hito sin acción** en Hoy (`src/ui/Phone.ts:598`, `this.item(li, () => undefined)`; patrón TOUR previo en `:605`). Se pueden seleccionar aunque no hacen nada, y eso va contra la regla de no tener afordancias falsas. — **Cerrado en VID-12b/PLAN-DOOR.**
6. **Punto doble** en los pasos pendientes (`src/ui/Phone.ts:595`): `'·'` unido con `' · '`. — **Cerrado en VID-12b/PLAN-DOOR.**
7. **Previo: puerta del Restaurante tapada.** Un camarero (uniforme-sala#3/#6) o un transeúnte en (29,18) tapa la puerta del Restaurante (29,19), porque `pickTarget` prioriza al NPC. La pista puede mandar allí. — **Cerrado en VID-12b/PLAN-DOOR (parcial):** el portal ya gana en `pickTarget`, pero un NPC parado en la casilla de acceso aún puede bloquear el paso.
8. **Previo:** `bridgePlans` contesta «18:00» y «20:00» en el mismo minuto. — **Cerrado en VID-12b/PLAN-DOOR.**
9. **Pista vaga:** dice «Sara está en Restaurante» sin distrito, o «por la calle» (`src/systems/Opportunities.ts:122-123`, `src/data/tour.ts:129`).
10. **Nombre «primera hora»** (`src/scenes/WorldScene.ts:2205`, comentario de `tour.ts:67`) frente a una duración de días. — **Cerrado en VID-12b/PLAN-DOOR.**

Propuesta: cerrar 1–6 en un ticket de seguimiento **VID-12b** y 7–8 en uno aparte de interacción y planes.

## 13. Seguimiento: VID-12b y PLAN-DOOR

### VID-12b (guía «Tus primeros días»)

- `received` ya no cuenta un plan de historia nacido de una propuesta del jugador; el rastro es un plan del móvil con `by: 'player'` en `'cancelled'`. Límite conocido: si el jugador cancela una propuesta y después la NPC invita de verdad, no cuenta. Falla dando negativo, nunca crédito falso.
- `accepted` = plan del móvil `'accepted'` o plan de historia `'pending'`/`'kept'`.
- `social.done` exige asistir.
- `chosenAt` se deja sin filtro, a propósito: en una partida nueva no hay hechos previos, y «Retomar» promete que lo ya hecho cuenta.
- Las filas de hito y de TOUR en Hoy ya no son elegibles; sólo «Retomar/Dejar la guía».
- Los pasos pendientes se marcan con `'○'`.
- El título pasa a «Tus primeros días».
- Casos a–g en `check-guia`.

### PLAN-DOOR

- **A:** en `Interaction.pickTarget`, un portal en la casilla de delante gana a las personas, igual que counter/terminal. Caso `RESTAURANT_ENTRANCE` en `check-interaction`: mirando a la puerta gana el portal; mirando a otro lado gana el NPC.
- **B:** `bridgePlans` compara día y hora; si difieren, responde «Cambio de planes: mejor {cuándo} en {sitio}, a las {hora}; allí suelo estar.». No compara el sitio (id frente a prosa).

### Pruebas

- `tsc` 0 errores; `npm run check` completo: TOTAL=168, FAILS=0.
- Navegador (contexto aislado `vid12b`): pregunta «TUS PRIMEROS DÍAS», marcador `'○'`, sólo «Retomar la guía» recibe la selección; consola sin errores.
- Evaluador: PASS.

### Riesgos que quedan

1. Un NPC parado en la casilla de acceso puede bloquear físicamente el paso (StreetLife sin tocar).
2. La puerta no se probó en vivo, sólo en el check.
3. Un cambio sólo de sitio, con el mismo día y hora, responde «Hecho».
4. `'invite:positive'` sigue fijando la hora en el primer mensaje: se lee «18:00» y luego «Cambio de planes … 20:00». Es coherente, pero redundante.
5. El riesgo 9 (pista sin distrito) sigue abierto.

### Proceso

Modo ECO, correcciones 0/1. Especialistas: sólo los checks y la comprobación del orquestador en el navegador. Sin commit, push, merge ni deploy. DeepSeek: NOT EVALUATED.
