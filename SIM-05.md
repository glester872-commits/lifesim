# SIM-05 · Compañero de piso y previsión de gastos

Veredicto: autodev PASS · BALANCED · correcciones 2/2.

Rama `main`. Implementador sin shell: build, checks y QA en navegador los ejecuta el coordinador. Ciclo 1 y correcciones
1 y 2.

## Estado inicial

`main`, SHA `aae58c2`. Al empezar había cambios sin commit de SIM-02, SIM-03 y SIM-04, y otros ajenos (`CLAUDE.md`,
`README.md`, `package.json`, `scripts/{check-chat,check-jobs}.ts`, `src/config/constants.ts`,
`src/data/{ada,amaia,sara}Story.ts`, `src/data/jobs.ts`, `src/scenes/{Menus,WorldScene}.ts`,
`src/systems/{Chat,Jobs,MetroDemand,Social,Story}.ts`, `src/world/*`, `VIS-01/`, `design/visual_art/`). **No se
revirtieron ni se reformatearon.** En los archivos compartidos, SIM-05 sólo hace cambios aditivos y mínimos.

## Resumen

Kevin (31 años, Ribera Norte) puede venirse a vivir contigo a Olmo 7 o a Ronda 8. Paga el 40 % de cada alquiler
semanal compartido. Su parte se fija una vez en la obligación (`Obligation.mate`), rebaja lo que pagas y nunca pasa
por tu cartera. Desde el día siguiente al acuerdo, duerme en tu portal, va a Ribera en metro y por la tarde vuelve a su
sitio del sofá. Pagar tu parte antes de que venza es un compromiso. Cada periodo se evalúa una vez (cumplido o
incumplido) y genera una línea suya en el móvil, una memoria social y un pequeño cambio en la relación. Cuentas
enseña una previsión: disponible, cobrado, previsto con su supuesto, obligaciones próximas con tu parte y alternativas
que se pueden hacer ya.

## Auditoría

| capacidad | archivo/función | evidencia | carencia | decisión |
|---|---|---|---|---|
| gastos de casa | `systems/Household.ts` `sync`, `pay`, `total`, `parseHousehold` | un periodo por gasto, creado una sola vez; 7 días de margen; recargo único | sin reparto | `Obligation.mate?` aditivo; `total()` = importe + recargo − mate, en céntimos |
| vivienda | `systems/Housing.ts` `move`, `moveSummary`, `rentsOf` | el alquiler nuevo sólo se aplica a los periodos nuevos | sin compañero | `HomeDef.mate?` sólo donde hay un segundo asiento real |
| 4 casas | `data/housing.ts` `HOMES` (olmo7 €45, estudio €35, ronda8 €55, mayor17 €25) | olmo7 y ronda8 tienen un sofá de dos plazas | estudio y mayor17 sin un segundo asiento libre | `mate` en olmo7 (`HOME_SOFA`) y ronda8 (`R8_SOFA`) |
| 4 mejoras | `UPGRADES` sofa-lectura, cuadro-carmen, lampara-pie, monstera; `owned` | son del jugador, se reinstalan o van al trastero | — | Sin cambio; `check-roommate` comprueba una compra única y el traslado |
| mudanza | `Menus.openHomeOffer` | único flujo de mudanza | no hablaba de la convivencia | `moveNote` antes de confirmar; `moveEffect` al mudarse |
| visitas | `data/visits.ts` `visitPlans`, `guestSeat` | visita en `HOME_SOFA_02` / `R8_SOFA_02` | — | El asiento del compañero es distinto: no se pisan |
| Kevin | `data/characters.ts` (`RB_RES_2_ENTRANCE`), `data/npcs.ts` | rutina de Ribera, sin StoryDef | no puede ir andando a Vallesco | rutinas `convive-<casa>` con `Routine.homeOf` y el metro como «irse a su barrio» |
| Consequences 'household' | `systems/Consequences.ts` | el impago ya genera una consecuencia | — | Sin cambio; `total()` ya cuenta sólo tu parte |
| SIM-02 memoria social | `systems/Social.ts` `noteSocialMemory`, `applyDelta` | memorias PROMISE con su nota | Kevin no tiene StoryDef (sin openers) | `Roommate.rememberCommitment`, una vez por clave |
| Jobs y previsión | `Jobs.scheduled`, `levelOf(p).wage`, `hireBlocker` | contrato con días y sueldo | Cuentas no daba ninguna previsión | `Roommate.incomeOutlook` + `outlookText` en Cuentas y en el aviso de saldo insuficiente |
| SaveSystem | `SaveSystem.parse`, `GameState.snapshot` | claves opcionales que se omiten si faltan | — | `roommate?` opcional; `SAVE_VERSION` 6 sin cambio |

## Contrato y fuentes canónicas

- `Obligation.mate?: number` (`systems/Household.ts`): la aportación del compañero, fijada una vez (0 ≤ mate ≤ amount).
- `RoommateState` (`systems/Roommate.ts`): `{ mate, home, since, from?, ended?, settled, kept, missed, evaluated? }`.
- `HomeDef.mate?: { seat, portal }` (`data/housing.ts`): el asiento de la tarde y el portal donde duerme.
- `Routine.homeOf?: string` (`data/characters.ts`): dónde duerme esa rutina si no es `CharacterDef.home`. La validación
  de las 06:00 (`systems/Characters.ts`) usa `routine.homeOf ?? def.home`.
- `MateDef` / `MATES` (`data/roommate.ts`): motivo, `share` 0,4 y condiciones.

## Calendario semanal

Ya existía y no cambia. Los periodos duran 7 días y cuentan desde `household.since`. Cada periodo vence al final de su
último día. Después hay 7 días de margen (`GRACE_DAYS`) y luego un recargo único de €5 en el alquiler.

## Importes

| vivienda | alquiler | Kevin | tú |
|---|---|---|---|
| Olmo 7 | €45 | €18 | €27 |
| Ronda 8 | €55 | €22 | €33 |

Luz, agua e internet (€10) los pagas tú enteros. El reparto se hace en céntimos exactos: Kevin paga el `floor` y el resto va a tu parte.

## Reglas del periodo

- **Inicio**: el reparto empieza en el primer periodo estrictamente posterior al que está en curso el día del acuerdo
  (`firstShared`, guardado en `from`). Esto vale aunque se firme el mismo día en que empezó un periodo.
- **Fin**: el periodo en curso el día en que se termina conserva su parte (`start <= ended`). `syncHousehold` lo anuncia y
  lo fija a medianoche o al arrancar, antes de que se pueda terminar. Los periodos siguientes no llevan reparto.
- Nunca se recalcula un periodo pagado ni uno con `mate` ya fijado (`settled` da idempotencia).

## Compañero

- Motivo: en Ribera le suben el alquiler y prefiere compartir con alguien de confianza.
- Condición: haberle conocido (`social.kevin` existe). Si no, la opción se ve deshabilitada y dice por qué.
- Dónde se propone: en el ordenador de casa (catálogo del hogar), «Compartir piso con Kevin». Primero se ven el motivo,
  las condiciones, el reparto, la fecha de inicio, el compromiso y cómo se termina, y luego Confirmar / Volver.
  «Terminar la convivencia» funciona igual.
- Rutina `convive-<casa>` (`story: true`, fijada por `Roommate.routineId` en `WorldScene.storyPicker` y en
  `Opportunities.nowAt`): a las 09:30 entra en el metro (dentro), a las 19:30 está en su asiento del sofá y a las 23:30
  vuelve al portal de la vivienda (dentro). Empieza el día siguiente al acuerdo, para que no salte de sitio en un día ya
  empezado. Con la convivencia activa no aparece en Ribera. Su asiento no coincide con el de las visitas.

## Compromiso

Pagar tu parte antes de que venza. Cada periodo compartido se evalúa una vez (`evaluated`, acotado a 8):

- pagado a tiempo suma `kept`;
- vencido sin pagar (`today > due`, independiente del margen del recargo) suma `missed`.

Cada evaluación deja una línea de Kevin en el móvil y una memoria PROMISE (`alquiler <gasto:periodo> …`) que sube o
baja un poco la relación, una sola vez por clave. No hay doble penalización: Roommate no toca dinero ni importes. El
recargo es de Household y la consecuencia es de SIM-01.

## Decisiones

- **A · previsión**: muestra el disponible (cartera menos lo que debes; los negativos, como «−€55»), lo cobrado en el
  periodo, lo previsto («si fichas todos los turnos»: sueldo × turnos programados hasta el próximo vencimiento; sin
  contrato, nada) y las obligaciones con tu parte y la de Kevin. Sólo ofrece alternativas ejecutables: compartir piso
  desde el ordenador de casa, pedir trabajo y mudarse a una casa más barata si `moveBlocker` lo permite. «Aplazar una
  mejora» no se ofrece porque no hay ninguna acción que ejecutar.
- **B · reparto**: 40 % del alquiler e inicio y fin como en «Reglas del periodo». Un acuerdo nuevo empieza con kept y
  missed a cero. La reacción llega por notificación, memoria y relación. Carencia conocida: al hablarle en persona dice
  la línea genérica de su parada, porque Kevin no tiene StoryDef.
- **C · mudanza**: `moveNote` se enseña antes de confirmar y `moveEffect` se aplica al mudarse. Mudarse a una casa sin
  `mate` termina la convivencia ese día. A una con `mate` se mantiene, y el nuevo alquiler sólo cuenta en los periodos
  nuevos (lo ya fijado no se rehace). Las mejoras siguen en `owned`: se reinstalan o van al trastero, sin cobro y sin
  duplicarse.

## Archivos modificados

| archivo | motivo |
|---|---|
| `src/data/roommate.ts` (nuevo) | `MateDef`, `MATES`, `getMate` |
| `src/systems/Roommate.ts` (nuevo) | reglas puras: `split`, `firstShared`, `quote`, `startRoommate`, `endRoommate`, `applyShare`, `evaluateCommitment`, `rememberCommitment`, `moveEffect`, `moveNote`, `routineId`, `parseRoommate`, `incomeOutlook`, `outlookText` |
| `src/systems/Household.ts` | `Obligation.mate`, `total()`, `parseHousehold` |
| `src/data/housing.ts` | `HomeDef.mate` en olmo7 y ronda8 |
| `src/data/characters.ts` | `Routine.homeOf`; rutinas `convive-<casa>` de Kevin |
| `src/systems/Characters.ts` | validación de las 06:00 con `homeOf` |
| `src/types/game.ts`, `src/state/GameState.ts`, `src/systems/SaveSystem.ts` | `roommate?` en el estado, el snapshot y el parse |
| `src/main.ts` | `syncHousehold`: `applyShare`, `evaluateCommitment`, memoria y avisos |
| `src/scenes/WorldScene.ts`, `src/systems/Opportunities.ts` | rutina forzada por `routineId` |
| `src/scenes/Menus.ts` | compartir y terminar en el ordenador de casa; mudanza con `moveNote` y `moveEffect` |
| `src/ui/Phone.ts` | Cuentas: previsión, desglose y alternativas en el aviso de saldo insuficiente |
| `scripts/check-roommate.ts` (nuevo), `package.json` | comprobación de SIM-05 dentro de `npm run check` |
| `scripts/check-schedules.ts` | las rutinas con `homeOf` se validan aparte; el invariante «fuera de su barrio» sigue para las demás |
| `README.md` | sección «Compañero de piso (SIM-05)» |

## Pasos reproducibles

1. Partida nueva: conoce a Kevin en Ribera Norte.
2. Vuelve a Olmo 7. En el ordenador de casa, elige «Compartir piso con Kevin», lee el reparto (€18 / €27) y la fecha, y confirma.
3. El periodo en curso sigue a €45. Cuando se anuncia el siguiente, Cuentas dice «€45 en total, €18 los pone tu compañero, tu parte €27».
4. Al día siguiente, Kevin sale a las 09:30 y a las 19:30 está en `HOME_SOFA`.
5. Paga tu parte antes de que venza: a medianoche llega la línea de Kevin y su memoria. Déjala vencer en otro periodo: missed sube, y el recargo sólo llega pasado el margen.
6. Recarga la partida: no se duplica nada.
7. Mudarte al Estudio avisa de que termina la convivencia. Mudarte a Ronda 8 la mantiene (€22 / €33 en los periodos nuevos).

## Persistencia y migración

`SAVE_VERSION` sigue en 6. Sin `roommate` (partida antigua o dañada) no hay convivencia ni cobros históricos. Una
obligación sin `mate` cuenta entera. `parseRoommate` valida `mate`, `home` (con `HomeDef.mate`), `since`, `from`,
`ended` y `settled`. `parseHousehold` descarta un `mate` fuera de 0..amount. `settled` y `evaluated` se acotan a 8.

## Tabla de aceptación

| # | pasos | esperado | observado | estado | evidencia |
|---|---|---|---|---|---|
| 1 | Repartir €45, €55, €35, €25, €33,33, €0,01 y €10,05 al 40 % | su parte + tu parte = total en céntimos; el resto va a tu parte; €18 / €27 en Olmo 7 y €22 / €33 en Ronda 8 | se cumple en todos los importes | PASS | check-roommate «reparto exacto en céntimos», (g) |
| 2 | Ordenador de casa → «Compartir piso con Kevin» → leer → Confirmar | motivo, condiciones, reparto, fecha de inicio, compromiso y cómo se termina, en 4 párrafos, antes de confirmar | acuerdo hecho con los controles (E en el ordenador); texto en 4 párrafos y legible | PASS | navegador; visual-qa PASS; check-roommate (4 párrafos) |
| 3 | Abrir el ordenador sin haber conocido a Kevin | opción deshabilitada que dice por qué | 1.ª pasada de gameplay-qa: clase is-disabled y «Aún no conoces a Kevin: vive en Ribera Norte.» (código del ciclo 1, que la corrección no tocó); sin aserción en ningún check | NO VERIFICADO (sobre el código final) | gameplay-qa, 1.ª pasada; lectura de Menus.ts |
| 4 | Firmar el día en que empieza un periodo y otro a mitad de periodo | el periodo en curso sigue a €45; el siguiente lleva mate 18, una sola vez | rent:0 sin mate y rent:1 con mate 18 | PASS | check-roommate (a), (b); navegador |
| 5 | Abrir Cuentas con la convivencia activa | desglose «€45 (€18 los pone tu compañero) → tu parte €27»; Disponible con «−€»; Cobrado; Previsto con su supuesto | «Disponible: −€87», «Cobrado esta semana: €0», «Previsto: €0, sin contrato no hay sueldo previsto» | PASS | navegador; check-roommate (sin «€-») |
| 6 | Pagar tu parte con €5 | no se paga, no hay pago parcial ni saldo negativo, sigue pendiente y se ofrecen alternativas ejecutables | «Te faltan €40… También puedes: Pedir trabajo en Decathlon Polígono Norte…»; el dinero se queda en €5 | PASS | navegador; check-roommate «saldo insuficiente» |
| 7 | Pagar tu parte antes de que venza y pasar el vencimiento | kept +1, una línea de Kevin, una memoria PROMISE y la relación sube una vez | se cumple en el check; en el navegador no se jugó el caso cumplido | PASS (check) | check-roommate (d), «compromiso cumplido/incumplido» |
| 8 | Dejar vencer un periodo sin pagar | missed +1; los importes no cambian; el recargo de €5 llega sólo pasado el margen de 7 días | missed 1 y una sola memoria PROMISE, estable tras recargar | PASS | check-roommate (f); navegador |
| 9 | Evaluar dos veces el mismo periodo (también tras serializar) | la relación cambia una sola vez; sin doble penalización | sin eventos repetidos | PASS | check-roommate (d) |
| 10 | Guardar, recargar y saltar varios periodos | sin aportaciones, cobros ni memorias duplicadas | estado idéntico tras guardar y Continuar dos veces | PASS | check-roommate «recarga y salto…»; navegador; check-save-torture |
| 11 | Día siguiente al acuerdo, 09:30 / 19:30 / 23:30 | sale en metro, por la tarde está en su asiento (distinto del de las visitas), no está en Ribera ni en dos sitios | a las 20:05 y a las 20:42, una sola instancia en HOME_SOFA (3,10) y la visita en (4,10); no se observó la salida de las 09:30 | PASS | check-roommate «rutinas de convivencia», «nunca en Ribera»; check-schedules; navegador; captura |
| 12 | Hablarle a Kevin en el piso con E | interacción sin error; reacción a SIM-05 por notificación, memoria y relación | «Hoy estoy bastante tranquilo, la verdad.»: línea genérica de su parada (Kevin no tiene StoryDef) | PASS (con carencia documentada) | navegador; Decisión B |
| 13 | «Terminar la convivencia» | el periodo en curso el día del fin conserva su parte; los siguientes no; terminar dos veces no mueve la fecha | ended 15 y rent:2 conserva 18 | PASS | check-roommate (c); navegador |
| 14 | Mudarse al Estudio / a Ronda 8 con la convivencia activa | aviso antes de confirmar; el Estudio la termina; Ronda 8 la mantiene con €22 / €33 sólo en los periodos nuevos; las mejoras no se duplican ni se cobran | se cumple en el check; no se jugó en el navegador | PASS (check) | check-roommate (g), «mudanza…», «mejora comprada una vez»; lectura de Menus.openHomeOffer |
| 15 | Cargar una partida sin roommate ni mate, o con datos dañados; regresiones | sin convivencia ni cobros históricos; SAVE_VERSION 6; nada roto en economía, NPC, Story, agenda, metro, guardado, controles, cámara ni HUD | se cumple; la cadena completa pasa | PASS | check-roommate «partida antigua»; check-save-torture, check-save-slots, check-persistence; cadena 154/154 |

## Gate

- `npm run build` (tsc + bundle): exit 0, tras la corrección 2.
- `node scripts/check-roommate.ts`: «19 bien, 0 mal», exit 0. `check-schedules`, `check-save-torture`, `check-household` y `check-housing`: exit 0, tras la corrección 2.
- Tras el ciclo 1: también exit 0 en `check-consequences`, `check-npc-memory`, `check-jobs`, `check-save-slots`, `check-regression`, `check-characters`, `check-agenda`, `check-event-director`, `check-economy`, `check-persistence` y `check-story`.
- Cadena completa de `scripts.check` (154 comandos), ejecutados uno a uno en PowerShell porque `npm run check` se cuelga en esta máquina: 154/154 con exit 0, 2846 líneas y 295 s, tras la corrección 1. La corrección 2 sólo cambió texto de `Roommate.ts` y aserciones de `check-roommate`, que se volvió a ejecutar aparte.
- Fallo encontrado y corregido: tras el ciclo 1, `check-schedules` salía con 1 («[kevin/convive-olmo7] METRO_ENTRANCE fuera de su barrio»).

## Navegador

Contexto aislado (no toca las partidas del usuario). Chrome de escritorio a 958×888 y móvil emulado a 390×844. Sin dispositivo físico.

- Preparación para QA, no hecha con controles: `social.set` de Kevin, teleport, `date.addDays`, `date.set` y dinero a €5. Con controles: el acuerdo (E en el ordenador, elegir opción, Confirmar), Cuentas desde el móvil del juego, hablar con Kevin (E) y terminar la convivencia.
- El fallo de la 1.ª pasada (el periodo en curso recibía la parte de Kevin si se firmaba el día de inicio) quedó corregido en la corrección 1 y verificado: rent:0 sin mate y rent:1 con mate 18.
- Cuentas, saldo insuficiente, guardar/recargar dos veces, vencido sin pagar, Kevin en el sofá, hablarle y terminar: ver la tabla de aceptación.
- Consola sin errores ni avisos en tres sesiones.
- No jugado en el navegador: la mudanza, la salida de las 09:30, el periodo cumplido y la opción deshabilitada con el código final.
- visual-qa: PASS. Menores: el desglose de Cuentas va en un párrafo largo; en el HUD móvil, «PARTIDA GUARDADA» queda tapado por «ONLINE» (ALPHA-09, anterior y fuera de alcance).

## Rendimiento

- Piso con Kevin presente: fps 60 en 8 muestras seguidas, quality high, over []. También 60 fps sin Kevin.
- `addDays(14)`: unos 10 ms. `syncHousehold` y `routineId` no corren por frame, sólo al arrancar, a medianoche o al elegir la rutina del día.
- optimizer: FAIL sólo por vehicles 26/24 en la calle. El diff de SIM-05 no incluye ningún archivo de vehículos ni de tráfico, así que no se le atribuye y queda pendiente para otra tarea.
- Bundle: main 854 kB, index 955 kB, TextureFactory 1446 kB. No hay referencia anterior para comparar.

## Revisión externa

DeepSeek: **NOT EVALUATED**. No está conectado al flujo real y no se ha configurado ninguna integración.

## git diff --stat

Árbol de trabajo frente a `aae58c2`. Incluye cambios ajenos sin commit (SIM-02, SIM-03, SIM-04 y otros) que SIM-05 no tocó: `CLAUDE.md`, `scripts/check-chat.ts`, `scripts/check-jobs.ts`, `src/config/constants.ts`, `src/data/{ada,amaia,sara}Story.ts`, `src/data/jobs.ts`, `src/systems/{Chat,Jobs,MetroDemand,Social,Story}.ts` y `src/world/*`. En `README.md`, `package.json`, `src/scenes/Menus.ts` y `src/scenes/WorldScene.ts` conviven cambios ajenos con las adiciones de SIM-05.

```
 CLAUDE.md                    |   8 +++-
 README.md                    |  14 +++++-
 package.json                 |   2 +-
 scripts/check-chat.ts        |  33 +++++++++++++-
 scripts/check-jobs.ts        |  68 ++++++++++++++++++++++++++--
 scripts/check-schedules.ts   |  17 ++++++-
 src/config/constants.ts      |   4 ++
 src/data/adaStory.ts         |  15 ++++++-
 src/data/amaiaStory.ts       |  14 +++++-
 src/data/characters.ts       |  17 +++++++
 src/data/housing.ts          |   7 +++
 src/data/jobs.ts             |  29 +++++++++++-
 src/data/saraStory.ts        |  17 ++++++-
 src/main.ts                  |  21 +++++++--
 src/scenes/Menus.ts          | 105 +++++++++++++++++++++++++++++++++++++------
 src/scenes/WorldScene.ts     |  41 ++++++-----------
 src/state/GameState.ts       |  15 +++++++
 src/systems/Characters.ts    |   6 +--
 src/systems/Chat.ts          |  65 ++++++++++++++++++++++++---
 src/systems/Household.ts     |   8 +++-
 src/systems/Jobs.ts          |  27 ++++++++++-
 src/systems/MetroDemand.ts   |   7 ++-
 src/systems/Opportunities.ts |   7 ++-
 src/systems/SaveSystem.ts    |   3 ++
 src/systems/Social.ts        |  17 +++++++
 src/systems/Story.ts         |  26 ++++++++---
 src/types/game.ts            |   2 +
 src/ui/Phone.ts              |  20 +++++++--
 src/world/LocationBuilder.ts |   3 ++
 src/world/Surfaces.ts        |  10 ++++-
 src/world/UrbanFinish.ts     |  35 +++++++++------
 src/world/tiles.ts           |   3 +-
 32 files changed, 561 insertions(+), 105 deletions(-)
```

Nuevos de SIM-05 (sin seguimiento): `src/data/roommate.ts`, `src/systems/Roommate.ts`, `scripts/check-roommate.ts` y `SIM-05.md`.

Sin commit, push, merge ni despliegue.

## Riesgos

| riesgo | impacto | mitigación / estado |
|---|---|---|
| La opción deshabilitada sin conocer a Kevin no está verificada con el código final | B | Probarla en una partida nueva sin `social.set` o añadir una aserción |
| Kevin no tiene StoryDef: en persona dice la línea genérica | M | Documentado (Decisión B); su reacción llega por notificación, memoria y relación |
| La mudanza no se jugó en el navegador | M | Cubierta por check-roommate (g) y por la lectura de `Menus.openHomeOffer` |
| Kevin puede dar un salto de sitio si te mudas a mitad de día | B | Conocido |
| A las 23:30 sale por la puerta del piso y desaparece en el portal | B | Conocido; usa el portal de la vivienda |
| kept y missed vuelven a cero con un acuerdo nuevo | B | Decisión B |
| friendship y trust tienen suelo 0 | B | Los incumplimientos repetidos dejan de restar al llegar a 0 |
| check-schedules valida aparte las rutinas con `homeOf` | M | El invariante «fuera de su barrio» sigue en las demás rutinas |
| Archivos compartidos con cambios ajenos sin commit | M | Cambios de SIM-05 aditivos; nada revertido |
| vehicles 26/24 en la calle | M | Ajeno a SIM-05; investigar en otra tarea |
| Sin dispositivo móvil físico ni revisión externa | M | Pendiente |
