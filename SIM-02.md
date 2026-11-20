# SIM-02 · Memoria social duradera de los NPC (Sara y Ada)

Rama `main`. Implementador sin shell; build, checks y QA en navegador los ejecutó el coordinador (evidencia abajo).

## Estado inicial

`main`, SHA `aae58c2` (merge de `met-05-iluminacion`). Cambios ajenos sin commit al empezar, **no tocados**:
`CLAUDE.md`, `package.json` (sólo se añadió el script, ver abajo), `src/config/constants.ts`,
`src/world/{LocationBuilder,Surfaces,UrbanFinish,tiles}.ts`; sin seguimiento `VIS-01/`, `design/visual_art/`.
`src/data/{sara,ada}Story.ts` y `scripts/check-npc-memory.ts` son de esta tarea.

## Auditoría

| Capacidad | Archivo / función | Evidencia | Carencia | Decisión |
|---|---|---|---|---|
| Memoria duradera | `systems/Story.ts`: `flags`, `decisions` | Sin tope; `hasFlag`, `matches` las leen | Ninguna | Es la memoria duradera: favores y decisiones viven aquí |
| Sucesos recientes | `Story.noteEvent` → `events` | Tope 40 (FIFO) | Se pierden los antiguos | Sólo seguimientos cortos (`recent`/`ago`), nunca memoria de largo plazo |
| Recuerdos sociales | `Social.noteSocialMemory` | 40 recuerdos, id no estable | No sirve como clave | No se usa como clave de idempotencia |
| Confianza | `Story.applyEffect` → `Social.applyDelta` | Único escritor de trust/friendship desde la historia | — | Se mantiene; nada más escribe confianza |
| Planes | `Story.watchPlan`, `missPlan`, `cancelStoryPlan`, `dayStart` | `pending → kept/missed/cancelled`, se resuelve una vez | — | El estado del plan es la clave de idempotencia |
| Lluvia | `Story.dayStart` | Cancela el plan al aire libre sin culpa | — | Sin cambio |
| Consecuencias | `Consequences.reconcile` (SIM-01) | Sólo lee `planton:<npc>:<día>` | — | Sin cambio |
| Chat | `ChatLog` | Sólo anti-repetición de líneas | No es memoria | Separado de la memoria |
| Migración | `SaveSystem` / `migrateStory` | No inventa sucesos | — | Sin campo nuevo |
| Saludo tras arreglo cancelado | `data/{sara,ada}Story.ts` openers | QA ciclo 1: «Te espero en el Molinillo, como dijimos» con el plan `cancelled` | Prometía una cita que no existía | Ciclo 2: la entrada exige `plan: 'pending'`; alternativa con `plan: 'none'` |

## Contrato

- **Acontecimientos:** charlas (beats), planes cumplidos/incumplidos/cancelados, lluvia, perdón y arreglo.
- **Idempotencia:** estado del plan (`pending` se resuelve una sola vez); beats `once` y `cooldown`; flags con el día de
  alta (`??=`, no se reescriben); `planton:<npc>:<día>` en Consequences.
- **Reloj:** el de juego (`day`, minuto); nada de reloj real.
- **Duración / caducidad:** flags y decisiones permanentes; `events` con ventanas `recent`/`ago` en días; plantón
  caduca en Consequences a los 10 días (SIM-01).
- **Límites por NPC:** `events` 40, recuerdos sociales 40; flags y decisiones sin tope (crecen por contenido escrito, no por tiempo).
- **Poda:** sólo `events` y recuerdos sociales; nunca toca `flags`, `plan`, `offer` ni `beats`.
- **Efectos:** sólo los `then` de los datos, aplicados por `applyEffect`; ninguna recompensa se repite.
- **Persistencia:** sin campo nuevo ni cambio de `SAVE_VERSION`; todo cabe en `stories[npc]` y `social[npc]`.

**Separación:** `ChatLog` = qué líneas no repetir; memoria (`flags`/`decisions`) = lo que pasó y cuenta;
`Story` (`events`, `plan`) = lo reciente y lo pendiente; relaciones (`Social`) = cifras de confianza y amistad.

## Casos

1. **Favor recordado.** Ada: repaso cumplido → `ada_quiz_done`; Sara: sesión de fotos → `sara_shoot`. Días después lo
   mencionan los beats (`examen`, `resultado-ahora` citan el banco) y los openers/saludos («examinador», «fotógrafo»),
   también tras 45 sucesos de relleno y tras guardar y cargar. Sin recompensa repetida (beats `once`).
2. **Plantón y reparación.** El plantón se registra una vez (Story y Consequences). Responder sin pedir perdón no repara;
   el perdón crea el plan de arreglo; sólo acudir repara (`<npc>_reconciled`). Si el arreglo se cancela sin culpa
   (lluvia, ánimo de ella o el jugador), no hay plantón nuevo y `arreglo-pasar` lo vuelve a proponer. Desde el ciclo 2,
   mientras el arreglo esté cancelado el saludo dice que «se quedó en el aire / sin hacer», no que «sigue en pie».
3. **Confianza ganada.** Sara: cada plan cumplido suma una vez → `CLOSE_FRIEND` (friendship ≥ 65, trust ≥ 55,
   `Social.relationshipState`) → `cercania` → `disenos` (`once`, +8 trust una sola vez, también tras guardar y cargar).

## Archivos modificados

| Archivo | Motivo |
|---|---|
| `src/data/saraStory.ts` | Ciclo 1: memoria/arreglo; ciclo 2 (l. 297-299): opener «Molinillo» exige `plan: 'pending'` y alternativa `plan: 'none'` «Hola. Lo del Molinillo se quedó en el aire, ¿eh?» |
| `src/data/adaStory.ts` | Ciclo 1: memoria/arreglo; ciclo 2 (l. 234-235): opener «banco» exige `plan: 'pending'` y alternativa `plan: 'none'` «Hola. Lo del banco se quedó sin hacer.» |
| `scripts/check-npc-memory.ts` | Nuevo: casos a-f con el motor real; ciclo 2: `noPromise` (20 días con arreglo cancelado por lluvia, ánimo y jugador) y `promises` (control positivo con arreglo pendiente) |
| `package.json` | `node scripts/check-npc-memory.ts` en el script `check` |

Las condiciones usan la misma `matches` de `Story.ts` (openers vía `openerFor`, saludos vía `helloFor`): `plan: 'none'`
significa estado distinto de `pending`; `plan: 'pending'`, estado `pending`. Sin mecanismo nuevo.

## Pasos reproducibles

- **Consola:** `npm run build`; `node scripts/check-npc-memory.ts`; `npm run check`.
- **Navegador:** `npm run dev`; ranura de prueba; hacer amistad con Sara, quedar y no ir (plantón); hablar con ella →
  `reconciliar` → pedir perdón → arreglo pendiente. Para la cancelación por ánimo: dejarla con ánimo 20 la noche
  anterior (`MOOD_DRIFT = 10` lo sube al empezar el día, y debe quedar bajo el umbral). Al día del arreglo, se cancela;
  saludarla debe decir «se quedó en el aire»; `arreglo-pasar` lo vuelve a proponer; ir al Molinillo repara.

## Aceptación

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Favor de Ada recordado en flags | PASS | check-npc-memory (a) |
| 2 | Favor de Sara recordado en flags | PASS | check-npc-memory (e), saludo «fotógrafo» |
| 3 | Sin falso favor | PASS | check-npc-memory (b) |
| 4 | Plantón único (Story y Consequences) | PASS | check-npc-memory (c) |
| 4b | Con el arreglo cancelado no promete cita | PASS | `noPromise`; navegador (punto 6 de «Cierre de pendientes»): plan `cancelled` por ánimo, saludo «se quedó en el aire», sin cita |
| 5 | Respuestas sin perdón no reparan | PASS | check (d); navegador |
| 6 | Perdón → plan de arreglo | PASS | check (d); navegador (trust 25→28) |
| 7 | Arreglo cancelado sin culpa, sin plantón nuevo | PASS | check (d); navegador (ánimo, trust 28 igual) |
| 8 | `arreglo-pasar` lo retoma | PASS | check (d); navegador 17 abr |
| 9 | Sólo acudir repara | PASS | check (d); navegador día 10, trust 28→36 |
| 10 | Confianza por plan una vez → CLOSE_FRIEND | PASS | check (e) |
| 11 | `cercania`/`disenos` sólo en CLOSE_FRIEND y una vez | PASS | check (e) |
| 12 | Persistencia (roundtrip y ranuras) | PASS | check (a, e, f); navegador tras recargar |
| 13 | Sin regresiones | PASS | cadena `scripts.check` 152/152 `EXIT=0` tras A1-B5 y tras el saludo; dirigidos con exit 0 |
| 14 | Opción con clic y toque; `chooseBeat` una vez | PASS | navegador puntos 7 y 10 (trust +2 una vez) |
| 15 | Paseo de Amaia por el móvil, aceptado una vez y cumplido | PASS | navegador punto 8 |
| 16 | Plan `kept` a pie con controles; `missed` lejos | PASS | navegador punto 9 |
| 17 | Saludo sin duplicar | PASS | `check-chat` (30 semillas × 3 × 5); navegador punto 10 |
| 18 | Móvil 390×844 sin desbordamiento | PASS | visual-qa, punto 10 |

## Persistencia y migración

Roundtrip por `SaveSystem` en el check (a y e); ranuras independientes con `SaveSlots` (f); recarga en navegador
conserva `sara_reconciled` y la confianza. Sin campo nuevo ni `SAVE_VERSION` nuevo: nada que migrar.

## Validación

### Ciclo 1

- `npm run build`: exit 0.
- `node scripts/check-npc-memory.ts`, `check-story`, `check-arcs`, `check-amaia-arc`, `check-chat`,
  `check-consequences`, `check-regression`, `check-save-torture`, `check-save-slots`: exit 0.
- Cadena completa de `scripts.check`, comando a comando: 152/152 `EXIT=0`, 2836 líneas (`check-npc-memory` en la posición 68).
- Navegador (gameplay-qa, Chrome DevTools, escritorio; partida de prueba en ranura 2, la del usuario respaldada y
  restaurada con diff vacío en las 3 pasadas; consola sin errores; reloj y teletransporte por consola dev; diálogo con
  teclado E/3/5/Espacio/1):
  - PASS reconciliar → perdón → arreglo `pending` (trust 25→28).
  - PASS ánimo 20 la noche anterior → 14 abr plan `cancelled`, `sara_changed_mind`, sin plantón, trust 28 igual.
  - PASS 17 abr «Lo del Molinillo se quedó en el aire. Sigo esperando ese café, ¿eh? 1. Vale, quedamos otra vez
    2. Ahora no puedo» → arreglo día 10 `pending`, trust igual.
  - PASS día 10 `kept`, `sara_reconciled`, sin `sara_conflict`, trust 28→36, persiste tras recargar; hablar otra vez
    no sube trust ni repite.
  - FAIL 4b: saludo «Te espero en el Molinillo, como dijimos» con el plan `cancelled` → corregido en ciclo 2 (A);
    en navegador NO REVERIFICADO.
  - PASS caminar y reloj.

### Ciclo 2

- `npm run build`: exit 0 (tsc más el bundle; solo el aviso habitual de chunk >500 kB).
- Dirigidos, todos con exit 0: `node scripts/check-npc-memory.ts` («memoria social OK: favor recordado en flags (saludo y
  opener tras 45 sucesos y tras guardar), sin falso favor, plantón único en historia y consecuencias, arreglo cancelado
  (lluvia, ánimo, jugador) que se retoma y sólo repara acudiendo, confianza por plan una vez y diseños sólo en
  CLOSE_FRIEND…»), `check-story` («25 aperturas»), `check-arcs`, `check-amaia-arc`, `check-chat` («748 frases (192 de
  personajes con nombre)»), `check-consequences`, `check-regression`, `check-save-torture` y `check-save-slots` («3
  ranuras independientes…»).
- Cadena completa de `scripts.check`, ejecutada comando a comando en PowerShell porque `npm run check` se cuelga en esta
  máquina: 152/152 con `EXIT=0` y 2836 líneas de log; `check-npc-memory` es el 68/152.
- Navegador, reverificación del 4b (cuarta pasada de gameplay-qa): BLOCKED por un error de la propia QA. Un Escape de
  más abrió la pausa, el reloj saltó y el plan acabó en `missed`, no en `cancelled`. Con `missed`, el primer saludo fue
  veraz («Buenas, ¿qué tal la tarde? Ah, eres tú.»), pero esa es otra rama. El 4b queda corregido en datos y cubierto por
  `check-npc-memory` (los saludos de apertura y a distancia durante 20 días con el arreglo cancelado, para Sara y Ada,
  más el control positivo con el plan pendiente), sin reverificar en el navegador. La opción «Ahora no puedo» con clic no
  se probó. Consola sin errores. Partida del usuario restaurada con diff vacío, `activeSlot` `'3'` y meta igual.

## Especialistas

- **gameplay-qa:** usado (ver «Validación» y «Cierre de pendientes»).
- **visual-qa y optimizer:** omitidos en los ciclos 1-2; usados en el cierre de pendientes (puntos 10 y optimizer).

## Revisión DeepSeek

**NOT EVALUATED** (no conectado).

## git diff --stat

Cifras: ver `git diff --stat` del entregable.

- Modificados (SIM-02): `package.json`, `README.md`, `src/data/{ada,amaia,sara}Story.ts`, `src/scenes/WorldScene.ts`,
  `src/systems/{Chat,Social,Story}.ts`, `scripts/check-chat.ts`.
- Nuevos (SIM-02): `scripts/check-npc-memory.ts`, `SIM-02.md`.
- Ajenos, sin tocar: `CLAUDE.md`, `src/config/constants.ts`, `src/world/*`, `VIS-01/`, `design/visual_art/`.

## Límites y riesgos

- DeepSeek NOT EVALUATED.
- Dispositivo físico no probado (sólo móvil emulado).
- Altura táctil de 34 px de las opciones (estilo ALPHA-09 preexistente, fuera de alcance).
- `vehicles 26/24` preexistente (`Traffic.ts:179` / `budgets.ts:31`, fuera de alcance).
- El `structuredClone` de `socialOf` en `storyHello` por frame es preexistente (optimizer: probablemente <0,1 ms/frame).
- Las pruebas de navegador usan atajos de desarrollo para preparar el estado y el reloj; el diálogo, el móvil y el
  último tramo a pie se hicieron con controles.

## Cierre de pendientes

Sin campo de guardado nuevo ni cambio de `SAVE_VERSION`.

- `src/systems/Story.ts`
  - Contracción: `contract()` junto a `fill` convierte «de el»/«a el» en «del»/«al» (bordes `\p{L}`, no `\b`, para no
    tocar «día el»). Se aplica al return de `fill` (cubre `fillWith`, `ready`, `offerBeat`, `openerFor` y los mensajes
    de `phoneStory`), a las líneas de la invitación de `beatAfterTalk` y al saludo de `helloFor`.
  - `chooseBeat` idempotente sin `offer`: sólo se contesta lo presentado (`beats[id]`) y una vez; al contestar marca
    `beats['ans:' + id]`. `presentBeat` borra esa marca al volver a decirlo. Reutiliza `beats` (como `msg:`); `cooldown`
    y `once` leen `beats[id]`, nunca las claves `ans:`.
  - `cancelStoryPlan`: friendship −2 (antes −1), con tiempo y el mismo día; trust y mood sin cambios.
- `src/data/amaiaStory.ts`: opener «sigue en pie» con `plan: 'pending'`; opener nuevo «se quedó en el aire» con
  `plan: 'none'`; beat `arreglo-pasar` tras `reconciliar` (vuelve a quedar el `paseo-arreglo`, event `perdon`, sin efecto social).
- `src/systems/Social.ts`: `namedRelationLevel(social, hasProfile, met?)` junto a `chatRelationLevel`: con perfil
  manda Social; `importantNPCsMet` sólo sin perfil.
- `src/scenes/WorldScene.ts`: el chat de personajes con nombre llama a `namedRelationLevel` (se conserva la migración
  de `encounters` y `noteMeeting` sigue escribiendo `importantNPCsMet`).
- `README.md`: la relación de Sara y Ada sale de Social; `importantNPCsMet` sólo migra partidas antiguas.
- `scripts/check-npc-memory.ts`: bloque g) — «Lo del Molinillo» tras un plantón real, ningún texto rendido sin contraer
  en las escenas montadas, «del barrio» sin plan ni sucesos; Amaia (lluvia, ánimo, jugador) con `noPromise`,
  `promises` y `arreglo-pasar`; `chooseBeat` dos veces resta una, sobrevive al guardado y se contesta otro día;
  aceptar+cancelar no sale a cuenta; nivel de trato con y sin perfil.

- `src/systems/Chat.ts`: `withoutGreeting` (`GREETING_HEAD`, con interjección opcional Ah/Oh/Mm/Vaya). Al abrir la
  charla, si ya hubo greet, quita el saludo inicial del opener de historia. Corrige «¡Hola! … Hola. Lo del Molinillo…»
  y «Hola. ¿Qué querías? Hola. Ando liada.».
- `scripts/check-chat.ts`: 30 semillas × sara/ada/amaia × 5 openers; ninguna línea posterior al greet empieza
  saludando; el opener recortado aparece; aserciones unitarias de `withoutGreeting`. Un falso positivo de la aserción
  inicial (greet «Hola, hola.» de Ada) se corrigió en la prueba, sin relajarla.

### Evidencia (ejecutada por el coordinador)

- `npm run build`: exit 0 en cada ciclo.
- Dirigidos con exit 0: `check-npc-memory`, `check-story`, `check-arcs`, `check-amaia-arc`, `check-chat`,
  `check-consequences`, `check-housing`, `check-phone`, `check-regression`, `check-save-torture`, `check-save-slots`.
- Cadena `scripts.check` comando a comando: 152/152 `EXIT=0`, 2836 líneas tras A1-B5; otra vez 152/152 `EXIT=0`,
  2836 líneas tras el arreglo del saludo.
- Navegador (Chrome DevTools; partidas del usuario respaldadas y restauradas con diff vacío en todas las pasadas,
  `activeSlot` `'3'` y `savedAt` originales; consola sin errores):
  - **6 (gameplay-qa) PASS:** arreglo cancelado por ánimo (mood 20 la noche anterior). Primer texto: «¡Hola! Espera, no
    te muevas, que esta luz es buenísima. Hola. Lo del Molinillo se quedó en el aire, ¿eh?». Es veraz y no promete
    cita; el «Hola» duplicado lo corrigió después `withoutGreeting`. Luego `arreglo-pasar`. Ningún «de el»/«a el».
  - **7 (gameplay-qa) PASS:** clic en la opción 1 de `reconciliar` → arreglo `pending`, trust 27→29 una vez,
    `ans:reconciliar`. Toque (pointer touch + click) en «Ahora no puedo» → trust igual, plan no `pending`.
  - **8 (coordinador) PASS:** Amaia propone el paseo por el móvil («¿Me acompañas mañana a las 19:00 al banco del
    parque?»). «Claro, allí estaré» con dos clics seguidos → trust 35→37 una vez, `offer` null, paseo `pending` día 8.
    Después el hilo sólo da respuestas genéricas y «Cancelar el plan». A las 19:05 en el banco → `kept` (+5/+3 una vez).
    La charla no vuelve a ofrecer `desconexion` y sólo suma lo de una charla normal (+2/+1). La agenda exige
    `encounters > 0` para listar el hilo; correcto, porque tener el número implica haberse visto.
  - **9 (coordinador, teclado, pestaña al frente, 57 fps) PASS:** con las flechas de (47,5;57,9) a (51,5;57,9), junto a
    `PARK_BENCH_04`, a las 18:46. Amaia llega y a las 19:00 el paseo queda `kept` («Has venido. Me he dejado el móvil
    en casa. A propósito.»); friendship 45→50, trust 37→40. Controles negativos: a ~10 casillas de Sara → `missed`
    (plantón); sin acercarse a Amaia → `missed`. Ambos según `together` (`WorldScene.ts:1776`, ≤ 3 casillas).
    Lección de QA: `lifesim.story.get().where` puede ir desfasado del sprite; los diálogos bloquean el movimiento; las
    teclas sintéticas, sólo a `document` (a `window` también se duplican) y con ~120 ms entre keydown y keyup.
  - **10 (visual-qa + coordinador; 390×844, DPR 3, táctil, `body.has-touch`) PASS:** `reconciliar` con 3 opciones;
    `scrollWidth` 390, sin desbordamiento; opciones de 34 px (una línea) y 56 px (dos), sin solaparse. El joystick
    (`touch__stick`, y 682-839) se solapa 13 px con la opción 3 (y 661-695), pero `elementFromPoint` en el solape da la
    opción. Toque CDP real en la opción 1 → trust 25→27 una vez, arreglo `pending`. Saludo sin duplicar: «Ya estabas
    tardando en aparecer, ¿eh? Ando liada.».
- **Optimizer:** sin coste por frame añadido. `contract` en `helloFor` como mucho una vez por personaje y día
  (`greetedDay`); `withoutGreeting` y `namedRelationLevel` sólo al abrir charla (este, con un `structuredClone` de
  `state.social` puntual). Lectura actual, sin comparación antes/después: 58 fps en district, calidad high; chunks JS
  3,2 MB sin comprimir. Su FAIL se debe a `vehicles 26/24`, preexistente y ajeno a SIM-02 (ver «Límites y riesgos»).

## SIM-02b · reverificación y ampliación

### (a) Reverificación

- Reverificación de SIM-02, antes de la sección h): `npm run build` exit 0. Dirigidos con exit 0: check-npc-memory, check-chat, check-story, check-arcs, check-amaia-arc, check-consequences y check-save-slots. Cadena completa de scripts.check, ejecutada comando a comando en PowerShell: 152/152 EXIT=0, 2836 líneas, con «memoria social OK» en el comando 68.
- Después de añadir h): `npm run build` exit 0 y `node scripts/check-npc-memory.ts` exit 0, con «h) general: 3 defs (sara, ada, amaia), 4 saludos de favor». El cambio sólo afecta a ese check y no toca src/ ni datos, por eso no se repitió la cadena completa.
- Sensibilidad: cada saludo de favor se prueba en negativo (sin su flag, no sale en 60 días) y en positivo (con su flag, sí sale). Si se quitara la flag del favor de un dato, fallaría el negativo. No se hizo una prueba mutante editando datos: el control positivo y el negativo ya cubren ese caso.
- Especialistas: ninguno en SIM-02b. No hay cambios de código ni de datos del juego, así que no hay nada que comprobar en el navegador, en lo visual ni en rendimiento. La verificación de navegador de SIM-02 (puntos 6-10) sigue valiendo porque el código del juego no ha cambiado desde entonces.
- DeepSeek: NOT EVALUATED.

### (b) Inventario

| personaje | StoryDef | rutina (`characters.ts`) | voz (`NAMED_VOICES`) | memoria social SIM-02 | estado |
|---|---|---|---|---|---|
| sara | sí | sí | sí | sí | cubierta |
| ada | sí | sí | sí | sí | cubierta |
| amaia | sí | sí | sí | sí | cubierta |
| noa | no | sí | no | no | con rutina, sin arco ni voz: fuera de alcance |
| yasmin | no | sí | no | no | con rutina, sin arco ni voz: fuera de alcance |
| angel | no | sí | no | no | con rutina, sin arco ni voz: fuera de alcance |
| jeff | no | sí | no | no | con rutina, sin arco ni voz: fuera de alcance |
| kevin | no | sí | no | no | con rutina, sin arco ni voz: fuera de alcance |
| las otras 22 de `NAMED_PEOPLE` (dependientes, Ribera, metro) | no | no | no | no | sólo identidad: `importantNPCsMet`, sin `Social` |

### (c) Decisión

No se inventan arcos. Para dar memoria social a un personaje hacen falta un `StoryDef`, planes con su rutina de
historia en `characters.ts`, puntos con nombre y una voz en `NAMED_VOICES`. Eso es contenido narrativo y tiene que
pedirlo el usuario. La memoria genérica (`noteSocialMemory`/`socialMemoryReference`, `namedRelationLevel`) sólo
llega a los personajes con voz.

### (d) Generalización

La sección h) de `scripts/check-npc-memory.ts` recorre todo `STORIES` y saca de cada `StoryDef` el arreglo, el plan
del plantón, las flags y los saludos de favor. Así, cualquier arco nuevo con `reconciliar` y `arreglo-pasar` queda
cubierto sin tocar el check.
