# SIM-04 · Candidatura laboral sobre el ciclo de empleo

Rama `main`. Implementador sin shell: build, checks y QA en navegador los ejecuta el coordinador. Ciclo 1 y corrección 1 (ésta sólo toca `src/data/jobs.ts`,
`src/scenes/Menus.ts`, `scripts/check-jobs.ts` y este archivo).

## Estado inicial

`main`, SHA `aae58c2`. Al empezar había cambios sin commit de SIM-02 (`src/systems/{Story,Chat,Social}.ts`,
`src/scenes/WorldScene.ts`, `src/data/{sara,ada,amaia}Story.ts`, `scripts/{check-chat,check-npc-memory}.ts`,
`README.md`, `package.json`), de SIM-03 (`src/systems/MetroDemand.ts`, `scripts/check-event-director.ts`) y ajenos
(`CLAUDE.md`, `src/config/constants.ts`, `src/world/*`, `VIS-01/`, `design/visual_art/`). **No se tocaron.** SIM-04 sólo
toca `src/data/jobs.ts`, `src/systems/Jobs.ts`, `src/scenes/Menus.ts`, `scripts/check-jobs.ts` y crea este archivo.

## Resumen

El ciclo de empleo ya existía entero (oferta, contrato, turnos, faltas, despido, cobro, ascenso, un contrato a la vez),
pero la oferta firmaba al instante: «Firmar con X» llamaba a `hire`. SIM-04 pone una candidatura en medio: «Solicitar
el puesto» abre una resolución con los requisitos marcados (cumple / no cumple, con su cifra) y, si se cumplen, se
acepta o se rechaza el contrato. Atalaya pide ahora ofimática básica (Ofimática ≥ 30, dos clases del curso). Además se
endurecen dos callbacks de menú que usaban el contrato capturado al abrir.

## Auditoría

| capacidad | archivo/función | evidencia | carencia | decisión |
|---|---|---|---|---|
| contratación directa → candidatura | `Menus.jobOffer` | «Firmar con X» llamaba a `hire` + `setJob` + `persist` | sin paso de evaluación | «Solicitar el puesto» → `Menus.jobApplication` (resolución con `applicationCheck`) → aceptar/rechazar |
| requisitos | `Jobs.hireBlocker`; `data/jobs.ts` `JobDef` | sólo disponibilidad (un contrato, 7 días tras despido) | ninguno de conocimiento | `hireRequires` opcional en `JobDef`; Atalaya `ofimatica ≥ 30` |
| oferta | `Jobs.offerText`; `posting` de Atalaya | «Se valora ofimática» no tenía efecto | el requisito no se veía | `posting` → «Se pide ofimática básica»; `offerText` añade la línea de candidatura con `hireRequires` |
| turno como decisión de menú | `Menus.shiftDecision`, `Jobs.work`, `situationFor` | situación + opciones; sin puesto físico | usaba el `contract` capturado al abrir | Se usa `state.job` fresco en el callback. Puestos físicos: requerirían arte o mapa, fuera de alcance |
| puntualidad, faltas y despido | `Jobs.settle`, `clockInBlocker`, `work` (`grace`/`late`, `maxStrikes`) | cubierto por `check-jobs` | — | Sin cambio |
| pago | `Menus.shiftDecision` → `work(fresh, …)` | el pago sale del contrato del momento | antes, del capturado | `state.job` fresco |
| ascenso | `Jobs.promotionReady`, `promote`; `Menus.jobPromotion` | `promote(contract)` con el capturado | podía ascender con un contrato que ya no estaba listo | Antes de `promote`/`decline`, `promotionReady(state.job fresco)` debe dar el mismo nivel; si no, `back()` |
| formación → ascenso | `JobLevel.requires` (`administrativo`, unlock `ofimatica`) | `promotionBlocker` lo nombra | — | Sin cambio; nueva aserción de «una sola vez» |
| formación → contratación | `JobDef.hireRequires` + `Study.skills` | no existía | — | `applicationCheck` lee `state.study.skills` |
| un solo empleo | `Jobs.hireBlocker` | «Ya tienes contrato en …» | — | Reutilizado como ítem «Disponibilidad» |
| horarios | `Jobs.shiftClash` (±30 min, `SHIFT_REST_MIN`) | cubierto en `check-jobs` LV-03 | — | Sin cambio |
| Consequences 'work' | `systems/Consequences.ts:308-313` | `'work'` sólo cuenta con contrato activo | — | Sin cambio: la candidatura no crea contrato hasta aceptar |
| SIM-02: el responsable | `JobDef.manager` | sólo un nombre en el diálogo | sin relación social | Dependencia declarada con SIM-02; no se crea relación |

## Contrato

- **Sin modelo nuevo.** La evidencia del desempeño son `shifts`, `good` y `strikes` de `JobProgress`.
- **Requisitos:** `hireRequires` (conocimiento) + `hireBlocker` (disponibilidad).
- **Evaluación:** `applicationCheck(job, p, today, skills)` → `{ label, ok, why? }[]`, pura; `applicationResult` =
  todos `ok`.
- **Candidatura no persistida:** es una conversación de menú. Denegar o rechazar no llama a `setJob` ni a `persist`.
- **Guardado:** `SAVE_VERSION` 6, sin campos nuevos.

## Los siete pasos

1. Leer la hoja de la oferta (`offerText`): horario, pago, condiciones y, en Atalaya, el requisito de candidatura.
2. «Solicitar el puesto»: deshabilitado con el texto de `hireBlocker` si no estás disponible.
3. Resolución (`job.manager`): cada requisito con «cumple» o «no cumple» y su cifra («Ofimática 15 de 30»).
4. Denegada: el motivo concreto y «Volver». Nada cambia.
5. Aceptada: «Aceptar el contrato» o «Rechazar la oferta».
6. Aceptar vuelve a evaluar con `state.job` y `state.study.skills` frescos; si algo bloquea, se vuelve con el motivo.
   Si no, `hire` + `setJob` + `persist` + el diálogo de bienvenida de siempre.
7. Rechazar: una frase del responsable y el estado intacto.

## Balance

- **Decathlon** (Polígono Norte, L2 orden 2; Vallesco orden 0: dos paradas, 30 min, `data/transit.ts:58,60`).
  - Sección: €60/turno (6 h), 3 turnos (L/X/V 10-16), €180/semana.
  - Responsable: €84 (7 h, M/J/S 9-16), 3 turnos, €252/semana.
  - Perk de fotografía: +€15/turno.
  - Metro: €2 por trayecto, ida y vuelta por turno: 6 × €2 = €12/semana. Neto: sección €168, responsable €240.
- **Atalaya** (oficina de Vallesco, a pie, sin metro).
  - Auxiliar: €36 (4 h, L-V 9-13), 5 turnos, €180/semana.
  - Administrativo: €52 (5 h, 9-14), €260/semana.
  - Perk de ofimática: +€8/turno.
- **Curso de Ofimática y gestión**: €30, 4 clases L/X 18-20, +15 por clase. Llegar a 30 pide 2 clases (una semana).
  No choca con Atalaya: el turno acaba a las 13:00 o 14:00 y la clase abre a las 17:30 (`early` 30). Lo comprueba
  `scripts/check-study.ts:183`. Recuperación S/D 11-13: fuera de los días de Atalaya.

## Corrección 1 · textos de Decathlon en Atalaya

Defecto visto en el navegador: al dejar Atalaya salía «Devuelves el chaleco. «Suerte. Si cambias de idea, ya sabes
dónde está el cartel.»», fijo en `Menus.jobQuit` para todos los empleos. Revisadas las frases de empleo de `Menus.ts`
(openJob, jobOffer, jobApplication, shiftDecision, jobPromotion, jobQuit):

| frase | antes | ¿se ve en Atalaya? | ahora |
|---|---|---|---|
| despedida (`jobQuit`) | fija, chaleco + cartel | sí | `job.quitLine ?? JOB_FALLBACK.quitLine` (`Menus.ts:744`) |
| fichaje con contrato (`openJob`) | `desk ?? 'Tu taquilla, el chaleco…'` | no (Atalaya tiene `desk`) | `desk ?? JOB_FALLBACK.desk` (`Menus.ts:585`); el texto de taquilla pasa al `desk` de Decathlon |
| leer la oferta (`jobEntries`) | `offerLabel ?? 'Leer el cartel…'` | no (Atalaya tiene `offerLabel`) | `offerLabel ?? JOB_FALLBACK.offerLabel` (`Menus.ts:613`); el del cartel pasa a Decathlon |
| ascenso (`jobPromotion`) | fijo «…la sección a tu cargo, desde mañana.» | sí | `job.promotionLine ?? JOB_FALLBACK.promotionLine` (`Menus.ts:717`) |
| bienvenida, rechazo, turno | — | — | ya eran dato (`welcome`, `waitAt`) o neutros; sin cambio |

- `JobDef.promotionLine?` y `JobDef.quitLine?`, con comentario (`src/data/jobs.ts:66-69`).
- `JOB_FALLBACK` exportado, neutro, sin chaleco, cartel ni taquilla (`src/data/jobs.ts:91-100`).
- Decathlon conserva sus cuatro textos de siempre como dato (`src/data/jobs.ts:110-113`): lo que ve el jugador allí
  no cambia.
- Atalaya: `promotionLine` «…la cartera de clientes a tu cargo…» y `quitLine` «Dejas la tarjeta en recepción.
  Lucía: «Suerte. Si cambias de idea, la hoja sigue en el mostrador.»» (`src/data/jobs.ts:183-184`).
- `scripts/check-jobs.ts:205-217`, ampliando la aserción de textos de la oficina (no duplicada en el bloque SIM-04):
  el fallback es neutro; cada JobDef tiene despedida y cierre de ascenso (propios o fallback); ninguna frase visible de
  Atalaya (posting, desk, quitLine, offerLabel, promotionLine, offerText) contiene chaleco, cartel, taquilla, sala de
  personal ni sala de descanso; la despedida de Atalaya nombra a Lucía y la de Decathlon conserva el chaleco.

## Validación

Antes de la corrección 1 (ejecutado por el coordinador):

- `npm run build`: exit 0.
- Dirigidos, todos exit 0: check-jobs, check-study, check-agenda, check-week, check-economy, check-eco-01,
  check-consequences, check-regression, check-save-slots, check-save-torture, check-persistence, check-title-save.
- Cadena completa `scripts.check`, comando a comando: 153/153 EXIT=0, 2838 líneas; check-jobs en el puesto 119.

Tras la corrección 1: npm run build exit 0; check-jobs, check-study, check-regression, check-save-torture, check-save-slots y check-persistence exit 0; cadena completa scripts.check, comando a comando, 153/153 EXIT=0, 2838 líneas.

## Especialistas

- **gameplay-qa** (principal): parte A en Decathlon y parte B en Atalaya, pasos 1-3; el resto lo verificó el
  coordinador.
- **visual-qa**: PASS.
  - Escritorio (958×888, DPR 1): la resolución denegada usa el mismo componente de menú, sin cards ni estilos nuevos;
    texto legible sin desbordes; «cumple»/«no cumple» se distinguen por la palabra, no por el color; pixel art nítido.
  - Móvil (390×844, DPR 3, táctil), con capturas de la resolución aceptada (`scratchpad/sim04-movil-resolucion.png`),
    la denegada (`scratchpad/sim04-movil-denegada.png`) y la recepción (`scratchpad/sim04-movil.png`):
    - b) el texto cabe;
    - c) «no cumple» frente a «cumple» por texto;
    - d) las opciones (36 px) quedan libres del joystick y de los botones táctiles;
    - e) el oscurecimiento es el velo común de los menús.
  - Observaciones menores: el cuerpo de texto mide unos 13 px a 1×; en la captura denegada se ven dos bandas grises
    encima y debajo del panel, que el coordinador comprobó que son los muros del interior pequeño de la oficina vistos
    a través del velo, no interfaz; las opciones miden 36 px, por debajo de los 44 recomendados, pero es el estilo del
    HUD móvil ALPHA-09, que el ticket prohíbe tocar y el usuario decidió mantener.
- **optimizer**: OMITIDO a propósito. SIM-04 sólo cambia funciones puras que se ejecutan al abrir un menú
  (`applicationCheck`), datos de texto y callbacks de menú. No toca el render, el update por frame, el número de NPC
  ni la memoria. La cadena 153/153 no mostró regresiones.

## Navegador

Escritorio, Chrome DevTools, contextos aislados; partidas del usuario sin tocar; consola sin errores. Fecha y
teletransporte por consola; menús, teclas y clics, con los controles del juego.

**Parte A · Decathlon** (gameplay-qa)

- Cartel: «Dependiente de sección: lunes, miércoles, viernes de 10:00 a 16:00 · €60 por turno».
- Solicitar → «Candidatura aceptada. Disponibilidad: cumple.» → Rechazar: `job` null y €120.
- Solicitar → Aceptar con doble clic a 30 ms: un único contrato `{job:'decathlon', level:0, from:2, shifts:{}}`.
- Miércoles 14/04 a las 9:52, Fichar y doble clic en «Atender la cola primero»: €120 → €180 una sola vez; shifts
  `{"3":{done, score 2, pay 60}}`; ledger con una sola línea «Sueldo · Decathlon Polígono Norte 60». Diálogo: «Turno
  cerrado: te pagan €60».
- Recarga + Continuar: el mismo dinero, shifts y ledger; sin cobro nuevo.
- «Fichar» visible tras el turno: es la opción apagada (`is-disabled`), que escribe su motivo en `.menu__note`
  (`src/ui/Menu.ts:134`). Comprobado en la parte B.
- Puntualidad: la cubre `scripts/check-jobs.ts:47-67, 187-194`; la falta por llegar tarde se vio además en navegador,
  en Atalaya (ver «Falta por llegar tarde», abajo).

**Parte B · Atalaya** (gameplay-qa pasos 1-3; el resto, el coordinador)

1. Hoja: «Auxiliar administrativo: lunes, martes, miércoles, jueves, viernes de 09:00 a 13:00 · €36 por turno … Para la
   candidatura: nociones de ofimática (…) (Ofimática 30 o más).»
2. Solicitar sin curso: «Candidatura denegada. Disponibilidad: cumple · Ofimática 0 de 30: no cumple.», con «Volver»
   como única opción; `job` null y €120.
3. Matrícula el lunes 12 a las 17:40: €120 → €90, ledger «Matrícula · Ofimática y gestión -30»; clases los días
   [3, 8, 10, 15] (mié 14, lun 19, mié 21, lun 26 a las 18:00).
   - Miércoles 14 a las 17:50, «Entrar a clase 2 h» con doble clic: ofimática 0 → 15 una vez, attended [0], el reloj
     salta a las 20:00. Volver a entrar: apagado, «Ahora no hay clase. Próxima: Clase 2 · Correo y agenda · lunes, 19
     de abril a las 18:00.».
   - Lunes 19 a las 17:50, clase 2: ofimática 30.
   - El primer FAIL de gameplay-qa («Entrar a clase» apagado a las 17:50) venía de reutilizar un menú abierto el lunes.
     Con el menú recién abierto la clase estaba habilitada (`Study.lessonStatus`, `early` 30 min).
4. Martes 20 a las 10:00: Solicitar → «Candidatura aceptada. Disponibilidad: cumple · Ofimática 30 de 30: cumple.» →
   Rechazar: `job` null, €90, «Entendido. Si cambias de idea, ya sabes dónde encontrarme.». Solicitar → Aceptar con
   doble clic: un único contrato `{job:'atalaya', level:0, from:10, shifts:{}}` y la bienvenida de Lucía.
5. Miércoles 21 a las 9:00: Fichar → «La reunión de las diez se alarga…» → doble clic en la opción 1: €90 → €126 una
   vez; shifts `{"10":{done, score 2, pay 36}}`; ledger «Sueldo · Atalaya Gestión 36». El reloj pasa a las 13:00.
6. Fichar otra vez: `is-disabled`, nota «El turno de hoy ya está hecho. El siguiente: jueves a las 09:00.»; el dinero
   no cambia.
   - Recarga + Continuar: €126, los mismos shifts, ledger con 2 líneas, contrato activo en la oficina.
7. Dejar el puesto («¿Dejas el puesto? Lo cobrado es tuyo…» → «Sí, lo dejo»): status `quit`, ended 10, shifts y
   sueldo conservados, ledger sin cambios. Volver a solicitar: «Disponibilidad: cumple» (dimitir no bloquea; sólo un
   despido, `hireBlocker`, 7 días). Defecto: la frase del chaleco, arreglada en la corrección 1.
8. Tras la corrección 1, frase de despedida en navegador: PASS. Contexto aislado y partida nueva; Ofimática puesta a
   30 con `state.setStudy` como preparación declarada (el curso real ya se jugó en B3). Recepción → Leer → Solicitar
   («Candidatura aceptada. Disponibilidad: cumple · Ofimática 30 de 30: cumple.») → Aceptar → Dejar el puesto → «Sí,
   lo dejo». Nota: «Dejas la tarjeta en recepción. Lucía: «Suerte. Si cambias de idea, la hoja sigue en el
   mostrador.»»; `job` queda en `{job:'atalaya', status:'quit'}`.

**Evidencia adicional** (coordinador, contexto aislado)

- Evaluación visible antes del ascenso: en el móvil del juego, app Trabajo, con contrato de Atalaya: «Siguiente turno:
  Mar a las 09:00, ya se puede fichar. Buenos turnos: 0 de 6 para el ascenso.», con el calendario de la semana.
- Falta por llegar tarde (regla canónica): el reloj llegó a las 11:29 con el turno de las 9:00 sin fichar, por encima
  de los 90 min de margen. Resultado: shifts `{"2":{"result":"missed","score":-2,"pay":0}}`, strikes 1, contrato
  activo y dinero sin cambios.
- Diff verificado con `git diff --stat`: los archivos de SIM-02, SIM-03 y los ajenos tienen exactamente las mismas
  cifras que antes de SIM-04 (CLAUDE.md 8, README 2, package.json 2, check-chat 33, constants 4, ada/amaia/saraStory
  15/14/17, WorldScene 33, Chat 65, MetroDemand 7, Social 17, Story 26, world 3/10/35/3). SIM-04 sólo suma sus 4
  archivos.

- Conflicto con un contrato activo: lo cubre check-jobs («Ya tienes contrato en Atalaya Gestión»).
- Escritorio: sí.
- Móvil emulado, PASS (ejecutado por el coordinador). Contexto aislado sim04-movil, viewport 390×844, DPR 3, móvil y
  táctil, body.has-touch, partida nueva.
  - Recepción de Atalaya → Leer → Solicitar sin el curso: resolución «Candidatura denegada… Ofimática 0 de 30: no
    cumple…». scrollWidth 390, sin desbordar. Panel en y 317-527, x 16-374. La opción «1. Volver» mide 36 px y queda
    fuera del joystick (touch__stick, y 682-839) y del botón de acción (y 749-819). Un toque real por CDP en «Volver»
    vuelve a la recepción con job null.
  - Ofimática a 30 con state.setStudy (preparación declarada) → Solicitar: «Candidatura aceptada… Ofimática 30 de 30:
    cumple…», con «Aceptar el contrato» y «Rechazar la oferta», de 36 px cada una (y 441 y 476). Un toque real en
    «Rechazar la oferta» deja job null, €120 y la nota «Lucía: «Entendido. Si cambias de idea, ya sabes dónde
    encontrarme.»».
  - Captura: scratchpad/sim04-movil.png.
- Dispositivo físico: pendiente de la prueba del usuario en su móvil (pasos entregados).

## Aceptación (16)

| # | criterio | resultado | evidencia |
|---|---|---|---|
| 1 | progreso | PASS | `shifts`/`good` por turno: check-jobs y navegador (A, B5) |
| 2 | sin farmeo | PASS | doble clic en situación (A, B5) y en clase (B3); reentrada en el fichaje apagada (B6) |
| 3 | evaluación con requisitos visibles | PASS | hoja (B1) y resolución con cifra (B2, B4); ascenso con «Buenos turnos X de N» (`src/ui/Phone.ts:621`), visto en navegador: «Buenos turnos: 0 de 6 para el ascenso.» en la app Trabajo |
| 4 | ascenso una sola vez | PASS | check-jobs, bloque SIM-04 («el ascenso no se repite») |
| 5 | siete pasos | PASS | navegador, B1-B7 |
| 6 | requisitos insuficientes | PASS | denegada con 0 de 30 (B2); 29 no basta en check-jobs |
| 7 | rechazar o abandonar | PASS | navegador (A, B4, B7); frase de despedida corregida en la corrección 1 y vista en navegador: PASS (B8) |
| 8 | cambio de empleo sin duplicar | PASS | check-jobs («un único contrato», `dismissals` conservados) |
| 9 | formación una sola vez | PASS | navegador, clase 15 → 30 sin repetir (B3); check-jobs |
| 10 | conflictos de horario | PASS | `shiftClash` ±30 min, `scripts/check-jobs.ts` LV-03; `scripts/check-study.ts:183`. Ofimática L/X 18-20 no choca con Atalaya 9-13. Falta en navegador: turno de las 9:00 sin fichar a las 11:29 (más de 90 min) → `missed`, score −2, pay 0, strikes 1, contrato activo, dinero igual |
| 11 | pagos frente a doble clic, reentrada y recarga | PASS | navegador (A, B5, B6 y recargas) |
| 12 | consecuencias | PASS | Consequences `'work'` sin cambios, check-consequences. SIM-02: el responsable no tiene relación social; dependencia declarada, no fallo |
| 13 | guardar y cargar | PASS | navegador en turno (A, B6); la candidatura no se persiste por diseño |
| 14 | partidas antiguas | PASS | `scripts/check-jobs.ts:152-173` (`parseJob`), check-save-* |
| 15 | balance | PASS | sección «Balance» |
| 16 | regresiones | PASS | cadena 153/153 antes y después de la corrección 1 (2838 líneas); build y dirigidos exit 0 |

## DeepSeek

NOT EVALUATED. No hay herramienta ni servidor MCP de DeepSeek en el repo (sin `.mcp.json`; nada en `.claude/`) ni en
la configuración de usuario: la única mención en `~/.claude` es el catálogo cacheado de plugins
(`plugins/plugin-directory-cache-v2.json`), que no es una instalación. Las menciones del repo son sólo de documentos
(`SIM-00..03.md`, `MOV-01.md`, `HD-02.md`). No se configuró nada.

## git diff --stat

- `scripts/check-jobs.ts` 68 (+65 −3)
- `src/data/jobs.ts` 29 (+28 −1)
- `src/scenes/Menus.ts` 55 (+43 −12)
- `src/systems/Jobs.ts` 27 (+26 −1)

4 archivos, +162 −17; `SIM-04.md` es nuevo. Los cambios de SIM-02, SIM-03 y los ajenos siguen sin tocar.
