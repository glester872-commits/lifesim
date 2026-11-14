# LV-09 · Tercer arco persistente: Amaia

## Fase 1 · Auditoría del motor

- **Motor** (`src/systems/Story.ts`): genérico, sin nombres de personaje. Un arco es un `StoryDef`:
  `flags` declaradas (una flag no declarada es un error), `baseMood`, `metFlag`/`friendFlag`,
  `greyRoutine`/`greyBelow`/`greyFlag`, `plans` (`PlanDef`: rutina, punto, ventana `from`–`until`, días,
  `outdoor`, `ask`, `requires`, `kept`/`missed` propios), `invite`, `beats` (microeventos con `once`,
  `phone`, `offer`, `choices`), `openers`, `hello`, `kept`/`missed`/`cancelled`, `rain` y `messages`.
  `Effect` sólo toca flags, ánimo propio, relación social, eventos, decisiones y contacto: **no tiene dinero**.
- **Registro**: `STORIES` en `src/data/saraStory.ts` (`sara`, `ada`, ahora `amaia`). Escena, agenda,
  vivienda y móvil recorren `STORIES` sin condicionales por personaje.
- **Guardado/migración**: `SaveSystem` guarda `stories` y `social`; `parseStories` tolera basura;
  `migrateStory` pone `metFlag`/`friendFlag` a una historia nueva si la relación ya existía.
- **Sara** (lookbook) y **Ada** (examen): promesa con plan, hito en un punto, decisión con dos cierres,
  rama de rechazo, reparación de plantón, lluvia. Tests: `scripts/check-story.ts`, `scripts/check-arcs.ts`.
- **NPC elegido: Amaia** (programadora en remoto, 37, reservada). Rutinas laborables estables (Pausa por la
  mañana, banco del parque a las 19:00) que permiten fijar planes comprobables vía rutinas `story` en
  `src/data/characters.ts`. Una rutina forzada por la historia manda sobre las de embarazo (`routineFor`).
- **Descartes**: Noa (las rutinas de embarazo mid/late ocupan casi todos los días); Yasmín (turnos rotativos
  y embarazo desde ~día 21); otros sin rutina comprobable.

## Definiciones

- **Arco**: secuencia de hitos de un personaje con estado persistente y final.
- **Hito**: microevento o plan cumplido que cambia flags; cada uno en un día distinto (`since`).
- **Decisión**: elección guardada en `decisions` que altera cierre, frases y planes.
- **Cierre**: microevento `once` que pone `amaia_arc_done`.
- **Consecuencia visible**: cambio observable posterior (plan nuevo en invitaciones, frases, saludo, relación).
- **Idempotencia**: contestar dos veces o desde dos superficies no aplica efectos dos veces.
- **Estados sociales**: `relationshipState` de `systems/Social` (STRANGER … PARTNER).
- **Memoria/anti-repetición**: `beats` (día por microevento), `once`, `cooldown`, `events`.
- **Save a mitad / bifurcación / final**: guardado y carga deepEqual tras un hito, tras la decisión y tras el cierre.
- **Comparación de relaciones**: los dos cierres dejan perfiles sociales distintos.

## Diseño del arco «la entrega»

1. `desconexion` (once, móvil, propone `paseo`): banco del parque, laborables 19:00–20:30, exterior.
   Aceptar → `amaia_paseo_asked`; rechazar → `amaia_paseo_declined` (ánimo −3).
   Paseo cumplido → `amaia_paseo_done`, amistad +5, confianza +3, ánimo +12.
2. `prueba` (once, móvil, propone `prueba`, un día después del paseo): `CAFE_TABLE_03` en el Pausa,
   laborables 10:00–11:30 (interior, sin lluvia). Cumplido → `amaia_prueba_done`, confianza +6.
3. `entrega` (once, decisión `entrega`): `ya` → `amaia_entrega_ya`; `prorroga` → `amaia_entrega_prorroga`;
   ambas `amaia_entrega_decided`.
4. Cierres (dos días después, móvil, excluyentes): `cierre-ya` → `amaia_arc_done`, `amaia_cliente`,
   confianza +4, amistad +3, ánimo +15 y desbloquea el plan `plaza` (sábado, `PLAZA_BENCH_07`, `requires`);
   `cierre-prorroga` → `amaia_arc_done`, confianza +5, ánimo +8, sin plaza. `resultado-sola` si rechazó el
   paseo (7 días, ánimo −6).
- Reparación: plantón → `amaia_conflict` → `reconciliar` (repetir con `paseo-arreglo` o excusa) →
  `amaia_reconciled`. Re-propuestas: `desconexion-pasar` y `prueba-pasar`.
- Plan suelto `banco` (con `ask`, sin requisitos): lo que propone en invitaciones y donde caen los planes del
  móvil, para que los planes genéricos con Amaia no se queden sin hueco.

## Modelo de datos

- `src/data/amaiaStory.ts`: `AMAIA_STORY` (flags `amaia_*`, planes `banco`, `plaza`, `paseo`, `prueba`,
  `paseo-arreglo`).
- `src/data/characters.ts`: rutinas `story` de Amaia `amaia-dia-gris`, `plan-paseo` (paseo, paseo-arreglo,
  banco), `plan-prueba`, `plan-plaza`.
- `src/data/saraStory.ts`: `amaia` en `STORIES`.
- Tests: bloque Amaia en `scripts/check-arcs.ts` y `scripts/check-amaia-arc.ts` (en `npm run check`).

## Limitaciones

- `Effect` no tiene dinero: «te debo una comida» no tiene consecuencia monetaria.
- Oportunidades (`OPP_OPENS`) del móvil sólo existen para Sara/Ada: fuera de alcance.
- LV-01 no está cerrado: «dos finales reproducibles» en partida manual queda NO VERIFICADO salvo recorrido.

## Evidencia (Fase 5)

| Caso | Pasos | Esperado | Obtenido | Estado | Notas |
|---|---|---|---|---|---|
| Hito 1 | Amigas el día 1; hablar días 1 y 2 | `desconexion` no sale el día 1, sí el 2 | Aserciones cumplidas: `node scripts/check-amaia-arc.ts` y `check-arcs.ts` exit 0 (2026-11-10, Node 24.19.0) | PASS (automático) | check-amaia-arc |
| Hito 2 | Cumplir paseo; hablar ese día y el siguiente | `prueba` sólo al día siguiente | Aserciones cumplidas: `node scripts/check-amaia-arc.ts` y `check-arcs.ts` exit 0 (2026-11-10, Node 24.19.0) | PASS (automático) | check-amaia-arc |
| Hito 3 | Cumplir prueba; hablar | `entrega` con dos opciones | Aserciones cumplidas: `node scripts/check-amaia-arc.ts` y `check-arcs.ts` exit 0 (2026-11-10, Node 24.19.0) | PASS (automático) | check-amaia-arc |
| Hito 4 | Esperar 1 y 2 días tras decidir | Cierre sólo a los 2 días | Aserciones cumplidas: `node scripts/check-amaia-arc.ts` y `check-arcs.ts` exit 0 (2026-11-10, Node 24.19.0) | PASS (automático) | check-arcs / check-amaia-arc |
| Decisión 1 (ya) | Elegir «Entrega ya» | `amaia_entrega_ya`, decisión `entrega=ya` | Aserciones cumplidas: `node scripts/check-amaia-arc.ts` y `check-arcs.ts` exit 0 (2026-11-10, Node 24.19.0) | PASS (automático) | |
| Decisión 2 (prórroga) | Elegir «Pide la semana» | `amaia_entrega_prorroga`, decisión `entrega=prorroga` | Aserciones cumplidas: `node scripts/check-amaia-arc.ts` y `check-arcs.ts` exit 0 (2026-11-10, Node 24.19.0) | PASS (automático) | |
| Cierre A | Cierre tras «ya» | `cierre-ya`, `amaia_cliente`, texto «renovado» | Aserciones cumplidas: `node scripts/check-amaia-arc.ts` y `check-arcs.ts` exit 0 (2026-11-10, Node 24.19.0) | PASS (automático) | |
| Cierre B | Cierre tras «prórroga» | `cierre-prorroga`, sin `amaia_cliente`, texto «nueve horas» | Aserciones cumplidas: `node scripts/check-amaia-arc.ts` y `check-arcs.ts` exit 0 (2026-11-10, Node 24.19.0) | PASS (automático) | |
| Consecuencias persistentes | 100 días de invitaciones tras cada cierre | `plaza` sólo tras cierre A | Aserciones cumplidas: `node scripts/check-amaia-arc.ts` y `check-arcs.ts` exit 0 (2026-11-10, Node 24.19.0) | PASS (automático) | check-arcs |
| Sin duplicación | 60 días de charlas tras el cierre | Ningún hito `once` ni cierre repetido | Aserciones cumplidas: `node scripts/check-amaia-arc.ts` y `check-arcs.ts` exit 0 (2026-11-10, Node 24.19.0) | PASS (automático) | check-amaia-arc |
| Encuentros/planes | Rutinas en el punto toda la ventana | `plan-paseo`, `plan-prueba`, `plan-plaza` sin moverse | Aserciones cumplidas: `node scripts/check-amaia-arc.ts` y `check-arcs.ts` exit 0 (2026-11-10, Node 24.19.0) | PASS (automático) | check-arcs bucle genérico |
| Propuestas móvil/persona | Misma oferta por móvil y en persona; contestar dos veces; caducada | Mismo beat; deepEqual; sin efectos | Aserciones cumplidas: `node scripts/check-amaia-arc.ts` y `check-arcs.ts` exit 0 (2026-11-10, Node 24.19.0) | PASS (automático) | |
| Estados sociales | Cierres comparados; lluvia; plantón | Perfiles distintos; lluvia sin cambio; plantón con conflicto | Aserciones cumplidas: `node scripts/check-amaia-arc.ts` y `check-arcs.ts` exit 0 (2026-11-10, Node 24.19.0) | PASS (automático) | |
| Memoria | `beats`/`events` tras cierre y 60 días | Hitos once conservan su día | Aserciones cumplidas: `node scripts/check-amaia-arc.ts` y `check-arcs.ts` exit 0 (2026-11-10, Node 24.19.0) | PASS (automático) | |
| Save mitad | Roundtrip tras el paseo | deepEqual | Aserciones cumplidas: `node scripts/check-amaia-arc.ts` y `check-arcs.ts` exit 0 (2026-11-10, Node 24.19.0) | PASS (automático) | |
| Save bifurcación | Roundtrip tras la decisión | deepEqual | Aserciones cumplidas: `node scripts/check-amaia-arc.ts` y `check-arcs.ts` exit 0 (2026-11-10, Node 24.19.0) | PASS (automático) | |
| Save final | Roundtrip tras el cierre | deepEqual | Aserciones cumplidas: `node scripts/check-amaia-arc.ts` y `check-arcs.ts` exit 0 (2026-11-10, Node 24.19.0) | PASS (automático) | |
| Regresión Sara/Ada | `check-story`, `check-arcs` | Pasan sin cambios en su contenido | `check-story` exit 0 (salida idéntica a la línea base); `check-arcs` exit 0 «Sara, Ada y Amaia»; check-housing (visitas Sara/Ada) exit 0 | PASS (automático) | |
| No regresión general | `npm run build`, `npm run check` | Sin errores | `npm run build` exit 0. `npm run check` (120 comandos, uno a uno, preflight GO 4,5 GB): 118 exit 0, 2 fallos ajenos a LV-09. `check-litter` («luna: la limpieza no recogió nada en 3 días») falla también en HEAD limpio: preexistente. `check-regression` («el guardado no vuelve igual», campo `dismissals: {}`) viene del cambio de Jobs.ts de otra sesión: en un worktree HEAD + sólo archivos LV-09 pasa (exit 0) | PASS para LV-09 · 2 fallos ajenos documentados | Árbol compartido con cambios de otra sesión (Jobs/Agenda/SaveSlots…) |
| Recorrido en navegador | `npm run dev`: hablar con Amaia, aceptar paseo por móvil y en persona, ir a PARK_BENCH_04 y al Pausa, los dos cierres, recargar | Amaia acude; cierres visibles; partida recuperada | Chrome (chrome-devtools MCP), Vite dev en worktree HEAD + LV-09, puerto 5199. Estado preparado con lifesim.social/story y el guardado; el resto, jugando: (1) hito 1 llega por el móvil el día 1 a las 9:30; aceptado con ratón → plan paseo día 2 y aviso en HUD; (2) recarga y Continuar con Enter → plan, decisión y HUD intactos; (3) día 2: Amaia va a PARK_BENCH_04 con plan-paseo; jugador a ≤3 casillas → kept a las 19:07, ánimo 58→70, amistad 45→50, confianza 30→33, diálogo «Has venido. Me he dejado el móvil en casa. A propósito.»; con el jugador a >3 casillas → missed, amaia_conflict, recuerdo «te esperó en el banco del parque y no fuiste»; (4) hito 2 por móvil el día 3; aceptado → plan prueba en el Pausa; día 4 Amaia espera en CAFE_TABLE_03 (interior) y el plan queda kept, confianza 33→41; diálogo en persona con E; (5) seguimientos por móvil («Anoche dormí del tirón…», «Dos de tus tres fallos…»); (6) móvil emulado 390×844 táctil: hilo completo legible, sin scroll horizontal | PASS hitos 1-2, plantón, guardado a mitad, móvil emulado · NO VERIFICADO decisión entrega y cierres A/B en navegador | Decisión y cierres sólo por check automático: a las 10:40 Amaia ya había vuelto a casa y no se reintentó. Teclas numéricas: la pulsación de DevTools llega sin keyCode y Phaser la ignora; con KeyboardEvent keyCode 49 funciona. Sin dispositivo físico |
| Control positivo | Quitar `amaia_cliente` del set de `cierre-ya` | Los checks fallan | check-amaia-arc exit 1, check-arcs exit 1; restaurado → exit 0 | PASS | El check detecta la pérdida del desbloqueo |

| Recorrido 2.ª ronda (navegador) | Vite dev en el árbol real, puerto 5199, Chrome por chrome-devtools MCP (escritorio, sin emulación). Flags paseo/prueba puestas con `lifesim.story.flag`; jugador junto a Amaia en PARK_BENCH_04 a las 19:10 | Charla, decisión, cierre A por móvil, guardado en la bifurcación | (1) Saludo «Pararse a hablar / Ahora no»; con 1 se abre la charla (la voz funciona); al terminarla con «Hasta luego» sale «¿Entrego ya con un par de fallos o pido una semana más?» con sus dos opciones. (2) Con 1 queda `decisions.entrega = ya` y la respuesta «Vale. Entrego…». (3) Recarga y Continuar: decisión y flags intactas. (4) Día 51, por móvil: «Entregado. El cliente ha encontrado un fallo, pero ha renovado…», `amaia_arc_done` + `amaia_cliente`, ánimo 58→73, amistad 48→51, confianza 35→39. (5) Día 82: el saludo recuerda el cierre («Lo de la entrega ya pasó…») | PASS charla, decisión (teclado), cierre A, guardado en la bifurcación · NO VERIFICADO en navegador: cierre B y la plaza | La plaza la ofrece `invite` sólo al acabar una charla en persona un viernes (probabilidad 0,45), no por móvil. Un viernes no tocó, y el recorrido automático de los siguientes viernes se cortó por timeout del protocolo de DevTools en el día 92. Teclado y móvil físicos: no disponibles |
| Doble toque en una propuesta por móvil | Rechazar por móvil con doble clic | Un solo rechazo | **FAIL → corregido.** El segundo clic caía en la vía genérica de `sendMessage` y publicaba otro «Esta vez no puedo, lo siento.» con su «Vale, otro día.». La historia no se duplicaba (un solo evento). Preexistente en HEAD; afectaba también a Sara y Ada. Arreglo: guarda en `sendMessage` (`src/systems/Phone.ts`): `accept-invite`/`decline-invite` sin invitación pendiente no hace nada. Aserción nueva en `scripts/check-phone.ts` | PASS tras el arreglo | Control positivo: sin la guarda, check-phone falla («accept-invite repetido no debe tocar el hilo»); restaurado, exit 0. Pasan check-phone, check-phone-text, check-contact, check-arcs, check-amaia-arc, check-story, check-week, check-agenda y `npm run build` |

Fallo hallado en navegador: sin voz de charla el hito 'entrega' era inalcanzable; corregido con NAMED_VOICES/NAMED_LINES de Amaia y aserción en check-arcs.

| Recorrido 3.ª ronda (navegador): cierre B y plaza | Vite dev en el árbol real (5199), Chrome por chrome-devtools MCP, escritorio. Dos partidas nuevas en contextos aislados (`lv09b`, `lv09a`), sin tocar la ranura del usuario. Flags paseo/prueba y número puestos con `lifesim.story.flag`/`social`; el resto, jugando con teclas (KeyboardEvent con keyCode) y clics | B: decisión «Pide la semana» → cierre-prorroga sin plaza. A: «Entrega ya» → cierre-ya → invitación a la plaza un viernes → quedada el sábado | **B:** día 1, decisión con 2 → «…Nunca pido prórrogas…», `decisions.entrega = prorroga`. Recarga: se conserva. Día 3, por móvil: «Pedí la semana. Dormí nueve horas…», `amaia_arc_done` sin `amaia_cliente`, confianza 30→35. Con el motor (`beatAfterTalk` sobre el estado real), 120 días: 37 invitaciones y ninguna a la plaza. **A:** cierre-ya el día 3 con `amaia_cliente`. Viernes 12, 19:10, en el parque: tras la charla, «Oye, una cosa. Te debo una comida. Empezamos por un rato de plaza mañana a las 11:00» (captura). Aceptado con 1 → plan `plaza` el día 13. El 13 y el 20 llovió: el plan se suspendió sin bajar el ánimo y se aplazó por móvil (aceptado con doble clic: un solo mensaje). El día 27, con tiempo seco forzado (`lifesim.weather.force`), Amaia va a PLAZA_BENCH_07 con `plan-plaza`; jugador a ≤3 casillas → `kept`, evento `plan-cumplido`, ánimo 58→68, recuerdo «estuvisteis en el banco de la plaza» | PASS cierre B, plaza (invitación, aplazamiento por lluvia, quedada cumplida), doble clic sin duplicar · NO VERIFICADO: teclado y móvil físicos | Amaia tiene embarazo y posparto por fecha: hacia el día 92 apenas sale de casa, y por eso el recorrido anterior no encontraba la plaza. Erratas vistas y corregidas en `amaiaStory.ts`: «Bien. mañana…» y «Te reconocerás» (ahora «Bien: mañana a las 11:00, en el banco de la plaza. Me reconocerás…»); «Lo de el banco», «a el sábado» y «Hecho. el sábado» (ahora «Lo nuestro en…», «para…», «Hecho: …»). La misma plantilla sigue en `adaStory.ts` (fuera de LV-09, sin tocar). La plaza no tiene escena propia al cumplirse: sólo saludo, recuerdo y ánimo |

Regresión mía hallada después: las frases de Amaia «Hola.» y «Venga. Adiós.» repetían otras ya existentes, y `check-chat` fallaba («frases repetidas», 746 !== 748). No lo vi porque, tras añadir la voz, no repetí el `npm run check` completo. Corregido a «Hola. Ya.» y «Bueno. Adiós.»; `check-chat`, `check-arcs`, `check-amaia-arc` y `check-story` vuelven a exit 0. `npm run check` comando a comando (120): 117 pasan; fallan sólo `check-regression` y `check-litter`, ajenos (ver arriba).

Nota de proceso: el `npm run build` de la segunda ronda se lanzó con el preflight en WAIT (3,1 GB libres), porque el `&&` iba detrás de un `tail`, que siempre sale con 0. Error mío; el build pasó.
