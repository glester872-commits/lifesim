# SIM-00 · Auditoría de arquitectura para simulación de vida

Diagnóstico de solo lectura, 2026-11-18. Rama `met-05-iluminacion`. Ruta `C:\Users\glest\Documents\lifesim`.
No se modificó código. El único archivo nuevo es este documento.

## 0. Estado inicial — FAIL en «confirma que no hay cambios»

El árbol **no estaba limpio** antes de la auditoría (trabajo ajeno de volumen 2.5D / MET-05, sin commit):

```
 M package.json  M src/data/vallesco.ts  M src/types/game.ts  M src/world/BuildingArt.ts
 M src/world/Lighting.ts  M src/world/LocationBuilder.ts  M src/world/Occlusion.ts
?? VOLUME-25D.md ?? design/volume-evidence/ ?? scripts/check-building-volume.ts
?? scripts/qa/run-volume.mjs ?? src/world/BuildingProjection.ts ?? src/world/BuildingVolume.ts
git diff --stat: 7 files changed, 59 insertions(+), 9 deletions(-)
```

No se tocó nada de eso. Importa a SIM-0x: `src/types/game.ts` (donde vive `GameStateData`) tiene cambios sin commit; quien lo edite tiene que conservarlos.

Instrucciones leídas: `CLAUDE.md`, `AGENTS.md` (copia idéntica), `README.md` (Arquitectura, Guardado, Limitaciones, Roadmap), `.claude/skills/autodev/SKILL.md`.
Stack: Phaser 3 + TypeScript + Vite, sin backend de juego (hay `server/index.ts` para la sala online opcional). Node 24.19.0.

---

## Fase 1 · Definiciones previas

| Término | Definición usada en esta auditoría |
|---|---|
| Sistema existente | Un archivo de `src/systems/` (o `state/`) con una responsabilidad nombrada en su cabecera, más su `data/*.ts` de contenido. Las piezas `Sin Phaser` se cuentan como lógica pura comprobable. |
| Tabla de sistemas | Columnas: nombre · archivos · responsabilidad · dependencias · estado persistido · determinismo · check · notas. |
| Dependencias | Matriz «A → B» = A importa B. Acoplamiento **alto**: importa estado o funciones mutadoras de B, o B se escribe desde una Scene. **Medio**: importa funciones puras de B. **Bajo**: solo tipos o datos. |
| Riesgos | Tabla: riesgo · probabilidad (B/M/A) · impacto (B/M/A) · mitigación · tests que lo cubren. |
| Pruebas actuales | Unitarias: **no hay framework** (ni vitest ni jest). Integración: 145 scripts `scripts/check-*.ts` / `simulate-*.ts` encadenados en `npm run check` (asserts en Node puro). E2E: scripts de navegador en `scripts/qa/*.mjs` (piloto de teclado, manual). Manuales: documentos `*-VERIFICATION.md`, `QA.md`. **CI**: `.github/workflows/deploy-pages.yml` solo ejecuta `npm ci && npm run build` y despliega; **no ejecuta ningún check**. |
| Arquitectura incremental | Por **dependencias de datos**: primero lo que otros leen (registro de consecuencias), después quien lo consume. Cada misión cabe en un `SAVE_VERSION`, un `data/*.ts` y un check. |
| Bajo acoplamiento | Un sistema nuevo importa como mucho `Calendar`, `MetroDaily` (semillas) y los **tipos** de otros dominios; no importa Scenes ni escribe estado ajeno; sin ciclos de import. El cableado va en `main.ts` (`onNewDay`) o `GameState`, como `syncHousehold`. |
| Rendimiento en equipos modestos | Objetivo heredado del proyecto: 60 FPS en portátil antiguo y ≥ 30 FPS en móvil gama baja emulado (390×844). Regla para SIM-0x: nada por frame; la lógica nueva corre en `onNewDay` o al interactuar, con coste O(NPC con nombre) o O(eventos del día). |
| Comportamiento determinista | Mismo resultado para la misma tupla (semilla `hashSeed(...)`, día, estado guardado), en orden fijo: medianoche → sistemas en el orden de `main.ts`. `Math.random` prohibido en lógica de sistemas nuevos (ya prohibido en LV-10 §2.1). |
| Única fuente de verdad | Por **entidad**: cada dato vive en un solo campo de `GameStateData` y se escribe por un solo setter de `GameState`. Lo derivable (oportunidades, agenda, rutinas) se recalcula y **no se guarda**. |
| Compatibilidad de partidas | Todo campo nuevo es opcional en `GameStateData`, tiene `parseX` que tolera basura, y entra con un paso en `migrate()` (`SaveSystem.ts:665`) y un `SAVE_VERSION` +1 (`constants.ts:63`, hoy 5). Test: `check-persistence`, `check-save-torture`, `check-save-slots`, `check-title-save`. |
| DeepSeek en el flujo | Requiere una API, una herramienta MCP o un agente con acceso. Ver Fase 4. |
| Consecuencias persistentes (SIM-01) | Un hecho del jugador (plantón, despido, impago, pelea, robo denunciado, mudanza) que deja un registro con día, sitio y duración (`until` o permanente), y que **otros sistemas leen** para cambiar precios, diálogos, oportunidades o accesos. |
| Memoria / comportamiento evolutivo de NPC (SIM-02) | Memoria por NPC con nombre (no por peatón generado): últimos hechos compartidos con día, y una evolución lenta (ánimo, confianza, rutina) que decae con la ausencia. Granularidad: por día de juego, no por frame. |
| Eventos dinámicos (SIM-03) | Eventos **deterministas por semilla** (día, sitio) y **condicionados por estado** (reputación, consecuencias, clima, relación). Frecuencia: como mucho uno por sitio y día, con cooldown persistido. Sin eventos verdaderamente aleatorios. |
| Progresión profesional (SIM-04) | Niveles por empleo (`data/jobs.ts`), ascenso por turnos buenos + desbloqueos de estudio, más consecuencias (despido, referencias). Criterio: lo que el jugador hace en el puesto, no clics. |
| Vivienda y vida personal (SIM-05) | Mudanza, mejoras/decoración y alquiler ya existen. Alcance propuesto: efectos de la casa en descanso y visitas, y convivencia con relaciones de `Story`. No incluye compra de vivienda. |

---

## Fase 1 · Inventario — tabla de sistemas existentes

Leído = cabeceras, firmas, tipos persistidos y las líneas citadas. Los cuerpos completos de `Chat.ts` y `SocialDialogue.ts` no se leyeron: **NO VERIFICADO**.

| Sistema | Archivos | Responsabilidad | Dependencias (imports) | Estado persistido | Determinismo | Check | Notas |
|---|---|---|---|---|---|---|---|
| GameState | `state/GameState.ts` (984 l.) | Estado central, setters, `snapshot` | tipos de casi todos los sistemas | todo `GameStateData` | — | check-persistence, save-torture | EventEmitter de Phaser; emite `change` y `midnight` |
| SaveSystem | `systems/SaveSystem.ts` (833 l.), `types/game.ts:770` | Validar, migrar, guardar en `localStorage` detrás de `SaveStorage` | constants, LocationSystem, Ledger | `SaveFile{version,savedAt,state}` | puro | persistence, save-torture, title-save | `SAVE_VERSION=5`; migraciones v1→5 aditivas. Varios campos (credit, study, housing…) se añadieron **sin** subir versión, solo opcionales |
| SaveSlots (LV-02) | `systems/SaveSlots.ts` (211 l.) | 3 ranuras sobre el mismo SaveSystem + resumen con checksum FNV-1a | SaveSystem | `lifesim.save[.slotN]`, `.meta` | puro | save-slots | El README aún dice «una sola ranura»: **desfasado** |
| TimeSystem | `systems/TimeSystem.ts` (89 l.) | Reloj, `advanceMinutes`, retención tras saltos | Calendar | día/hora/minuto en GameState | determinista (no depende del framerate) | week, economy | Emite `midnight` por cada medianoche cruzada, en orden |
| Calendar | `systems/Calendar.ts` (190 l.), `data/cityEvents.ts` | Semana, estaciones, `onNewDay` | — | — | puro | calendar | **Único bus de cambio de día** (3 oyentes en `main.ts:181/195/208`) |
| Weather | `systems/Weather.ts` (275 l.) | Tiempo por día/hora | MetroDaily (semilla) | — | `seededRng(hashSeed('tiempo', day))` | weather, weather-looks | Recalculado, no guardado |
| World / Zones / Districts | `systems/World.ts`, `Zones.ts`, `Districts.ts` | Barrio de un punto, zonas | data | — | puro | world, zones, districts | — |
| Reputation (MAP-07) | `systems/Reputation.ts` (117 l.), `data/reputation.ts` | Reputación por barrio, motivos, efectos en precio, peso de eventos y acceso | districtIdentity, World, Jobs | `reputation{zone→{value,lastUpdated,reasons[≤10]}}` | puro, idempotente por `reasonId` | reputation | **Ya es una consecuencia persistente** (barrio); base de SIM-01 |
| Police | `systems/Police.ts` (227 l.) | Robos denunciados, quién atendió | — | `police` | — | police, pickpocket | Memoria de hechos |
| Jobs | `systems/Jobs.ts` (341 l.), `data/jobs.ts` | Contrato, turnos, faltas, despido, ascensos | Calendar, Commerce | `job{job,status,level,good,strikes,streak,shifts(21 días),dismissals}` | puro | jobs, department | 2 empleos × 2 niveles; `promotionReady/promote/decline` (l.260) |
| Study | `systems/Study.ts` (391 l.), `data/study.ts` | Curso, prácticas, encargos, habilidades, `unlocks` | Calendar, Commerce | `study{skills,course,practice,gig,unlocks[]}` | puro | study, academies | Un curso y un encargo a la vez |
| Household | `systems/Household.ts` (323 l.), `data/household.ts` | Facturas por periodos, recargo, metas, ledger | Calendar, Commerce | `household`, `ledger[≤40]` | puro, idempotente | household, economy | «Nada de intereses, saldo negativo ni desahucio» (l.19): **decisión documentada** |
| Credit (LV-10) | `systems/Credit.ts` (398 l.) | Micropréstamo, cuotas, cooldown | Jobs, Household, Calendar | `credit{loans,cooldownUntil}` | puro | economy (no hay check-credit) | — |
| Housing | `systems/Housing.ts` (278 l.), `data/housing.ts` | Vivienda activa, 4 casas, 4 mejoras con ranuras, mudanza | LocationSystem, Story, saraStory | `housing{home,owned,slots}` | puro | housing | `movePlans` reubica la visita de Story: acoplamiento Housing → Story |
| Social | `systems/Social.ts` (2175 l.) | Afinidad (friendship, trust, romance, mood…), acciones, recuerdos | solo tipos de data | `social{npc→SocialProfile, memories[≤40]}` | **No**: `resolveSocialAction(..., rng = Math.random)` (l.1725) | chat, contact, week | Monolito |
| Story | `systems/Story.ts` (816 l.), `data/saraStory.ts`, `adaStory.ts`, `amaiaStory.ts` | Arcos de Sara, Ada y Amaia: flags, decisiones, beats, planes, rutina fijada | Calendar, MetroDaily (semilla) | `stories{npc→NamedStory}` | sí (`hashSeed`) | story, arcs, amaia-arc | La memoria NPC más rica; solo 3 NPC |
| Characters / People | `systems/Characters.ts` (461 l.), `People.ts` (301 l.) | Rutinas por día, identidades, parentescos | Navigation, Weather, Pregnancy, MetroDaily | — | sí (semilla) | characters, npc-diversity | Rutina depende de clima/embarazo, no de la relación |
| Chat / SocialDialogue | `systems/Chat.ts` (3690 l.), `SocialDialogue.ts` (857 l.) | Conversación contextual | NO VERIFICADO | — | **No**: `Math.random` en Chat:1583, SocialDialogue:64/291/653/804 | chat, section-lines | Monolitos; riesgo alto de regresión |
| Phone | `systems/Phone.ts` (936 l.) | Hilos, planes, avisos | Story, Social | `phone` | — | phone, phone-text | Canal de avisos de consecuencias |
| Agenda | `systems/Agenda.ts` (743 l.) | Guía, avisos, señales de progreso | Jobs, Study, Household, Phone, Story, Social, Parish, Tickets, Fitness, Transit | `agenda` | — | agenda, week | Agregador |
| Opportunities | `systems/Opportunities.ts` (158 l.), `data/opportunities.ts` | Lo que se puede hacer ahora, **derivado** | casi todos los dominios | nada | puro | week (indirecto); no hay check propio | Punto de extensión declarativo para SIM-04/05 |
| WorldEvents | `systems/WorldEvents.ts` (48 l.) | Vocabulario del ciclo de vida de sucesos | — | — | — | event-lifecycle | No es un gestor |
| StreetEvents / AlleyDeals / Protest / Emergencies | `systems/StreetEvents.ts` (658), `AlleyDeals.ts`, `Protest.ts`, `Emergencies.ts` | Peleas, trapicheo, manifestaciones, incendios | MetroDaily, Calendar, Weather, Zones, Reputation | nada (salvo `eventFlags` del 112) | sí, `planNight/planDay(def, loc, day, …)` | street-events, protest*, emergencies, event-lifecycle | Funciones puras de (semilla, día, lluvia, reputación) |
| MetroEventManager | `systems/MetroEventManager.ts` (303 l.), `data/metroEvents.ts` | Eventos narrativos del metro: rareza, condiciones, continuaciones, elecciones | MetroDaily | `events: EventMemory` (eventsSeen, choicesMade, eventFlags, cooldowns, scheduled, importantNPCsMet) | **No por defecto**: `rng = Math.random` (l.163) | metro, simulate-metro-events | Único motor de eventos con memoria y elecciones: patrón para SIM-03 |
| Population / Crowd / StreetLife | `systems/Population.ts`, `Crowd.ts` (1402), `StreetLife.ts` (2223) | Peatones generados, afluencia | MetroDaily | — | sí (semilla por sitio/día/franja) | population, simulate-* | Peatones sin memoria: fuera del alcance de SIM-02 |
| Transit / Metro | `systems/Transit.ts`, `MetroSystem.ts` (2092), `TrainSystem.ts`, `MetroDaily.ts` (1061) | Viajes, tarifa, demanda; `hashSeed/seededRng` | — | `metroJourney`, `cards` | sí | metro*, simulate-metro-days | `MetroDaily` es de facto la librería de RNG del proyecto |
| WorldScene / Menus | `scenes/WorldScene.ts` (4854 l.), `scenes/Menus.ts` (2551 l.) | Coordinación y menús | todo | escribe estado (19 llamadas directas de dinero/empleo/social en WorldScene) | `Math.random` en tiros (l.2906, 3074) | world, regression | Viola en parte «las Scenes coordinan»; ver R4 |

### Dependencias reales (matriz resumida, A → B)

```
                 Cal  Daily Weath Rep  Jobs Study Hhold Hous Story Social Phone
Calendar          ·
Weather          bajo  medio
Reputation                         ·   medio
Jobs             medio                  ·
Study            medio                       ·
Household        medio                             ·
Credit           medio                 alto        medio
Housing                                                  ·   alto*
Story            medio medio                                  ·
Characters       medio medio medio
StreetEvents     medio medio medio medio
MetroEventMgr          medio
Opportunities    medio            medio medio medio medio medio medio  bajo  medio
Agenda           medio                  medio medio medio      medio medio alto
main.ts (cableado) onNewDay → Household, Pregnancy, PlayerStall
WorldScene       ALTO con GameState, Social, events.importantNPCsMet (escritura directa, l.3731)
```
`*` `Housing.movePlans` escribe en planes de `Story`. Ciclos de import: no se detectó ninguno en lo leído (NO VERIFICADO de forma exhaustiva; no hay herramienta tipo madge instalada).

### Limitaciones del inventario
- Afinidad duplicada: `EventMemory.importantNPCsMet[npc].affinity` **y** `SocialProfile` (Social). El primero tiene **cuatro escritores**: `MetroEventManager.ts:241`, `WorldScene.ts:3731`, `WorldScene.ts:3906` y `WorldScene.ts:4350`. Lo lee `MetroEventManager.ts:272` (condición `minAffinity`).
- Memorias acotadas que olvidan: `Social.memories` 40, `Reputation.reasons` 10, `Jobs.shifts` 21 días, `ledger` 40.
- Ningún check cubre `Opportunities` ni `Credit` por nombre.
- La CI no ejecuta checks.

### Dependencias de misiones anteriores

| Misión | Qué aporta (evidencia) | Reutilizable para | Acoplamiento / riesgo |
|---|---|---|---|
| **LV-02** (multi-ranura) | `SaveSlots.ts`: 3 ranuras, cada una un `SaveSystem` con validación, copia y checksum FNV-1a; las ranuras pasan por `inspectRaw` → `migrate`. Check: `check-save-slots` exit 0. | **Sí soporta las cinco mejoras**: un campo nuevo opcional + paso en `migrate` se aplica igual a las 3 ranuras. El resumen `.meta` no necesita cambios salvo que se quiera enseñar algo nuevo en la lista. | Bajo. Riesgo: un campo grande (registro sin tope) acerca la ranura a `SAVE_MAX_BYTES` (5 MB, `SaveSystem.ts:686`) → caducar o compactar lo vencido. |
| **LV-01** (QA 7 días) | `VERIFICATION-WEEK-LV01.md` y `check-week.ts` (persistencia de recuerdos, ausencia de huecos; exit 0). Según el README, las pruebas táctiles se hicieron en emulación, no en un teléfono real, y la semana no está acreditada sin ayudas de depuración. | Plantilla del recorrido de 7 días para SIM-01/02/05 (efectos que solo aparecen tras varios días). | Medio: **no cubre ningún sistema nuevo**. Cada SIM-0x debe ampliar `check-week` o añadir su simulación multidía. Teléfono real: NO VERIFICADO. |
| **DEC-06** (simulación comercial) | `PROBADORES-STOCK-DEC06.md`: `Retail.soldOutToday(store, garment, day)`, agotado **determinista por hash del día**, sin campos nuevos en el guardado; cabina libre por `pickFitting`. | **SIM-03**: patrón de evento diario recalculable por semilla en vez de persistido (lo efímero no se guarda; solo se guarda lo que el jugador cambia). **No** sirve para la memoria de NPC (SIM-02): no recuerda nada. | Bajo; es un patrón, no una dependencia de código. |
| **LV-09** (arcos narrativos) | `ARCOS-LV09.md`: motor `Story` (flags, `decisions`, beats, planes); guardado/carga deepEqual tras un hito, una decisión y un cierre; «consecuencias persistentes: 100 días de invitaciones tras cada cierre» con PASS automático (`check-arcs`, `check-amaia-arc`, exit 0). | **SIM-01** (decisiones con efecto duradero ya resueltas para 3 NPC) y **SIM-02** (ánimo con retorno, beats por día). El patrón de prueba deepEqual en cada hito es la plantilla para `check-consequences`/`check-npc-memory`. | Medio: `Housing.movePlans` y `Opportunities` ya leen `Story`; SIM-01 debe **leer** `stories.decisions`, no copiarlas (fuente única). |
| **LV-10** (crédito y ahorro) | `ECONOMIA-LV10.md`/`BALANCE-LV10.md`: ledger v4 con ids deterministas («nunca `Math.random`»), idempotencia por id, micropréstamo con estado propio porque el ledger olvida (40); `simulate-budget`. | **SIM-04** (salario por nivel en el balance) y **SIM-05** (alquiler y mejoras); su regla «el estado vivo no depende de una lista con tope» es la misma que el riesgo R7. | Medio: `Credit` importa `Jobs.levelOf`; los niveles nuevos de SIM-04 cambian la solvencia → repasar `simulate-budget`. |

---

## Fase 2 · Análisis por mejora

### SIM-01 · Consecuencias persistentes
- **A. Existe:** reputación por barrio con motivos y efectos (precio ±10 %, peso de eventos ±30 %, veto bajo −70); despido con `dismissals` y `REHIRE_DAYS=7`; recargo único de facturas; memoria de la comisaría; decisiones y cierres de los arcos (check-arcs: «consecuencias persistentes, 100 días de invitaciones tras cada cierre», LV-09).
- **B. Parcial:** las consecuencias viven repartidas en 5 sitios con formatos distintos y topes que olvidan; no hay un «qué recuerda el mundo de ti» consultable de forma uniforme.
- **C. Falta:** un registro común de hechos `{id, kind, day, place?, npc?, until?}` (sin tope que olvide hechos vigentes) y lectores declarativos (condición `consequence:<kind>` en `data/opportunities.ts`, en `Story.Cond` y en `chat`).
- **D. Reutilizar:** `Reputation.apply` (idempotencia por `reasonId`), `EventMemory.eventFlags` (flag→día), patrón `Story.Cond`, `onNewDay` para caducar.
- **E. Riesgo de regresión:** duplicar la reputación (dos fuentes); cambiar precios ya equilibrados (BALANCE-LV10).
- **F. Protegen:** check-reputation, check-arcs, check-jobs, check-household, check-persistence.

### SIM-02 · Memoria y comportamiento evolutivo de NPC
- **A. Existe:** `SocialProfile` (estadísticas, encuentros, `lastInteraction`, 40 recuerdos tipados); `NamedStory` (flags, ánimo que vuelve a su base, decisiones, beats, rutina fijada por día); rutinas deterministas en `Characters`.
- **B. Parcial:** la evolución solo existe para Sara, Ada y Amaia; el resto de personajes con nombre recuerda pero no cambia de rutina ni de trato. No se vio decaimiento por ausencia en `Social` (NO VERIFICADO en el cuerpo).
- **C. Falta:** decaimiento diario por ausencia en `onNewDay`; que la rutina (`Characters.routineFor`) lea la relación o las consecuencias; unificar la afinidad del metro con `Social`.
- **D. Reutilizar:** `Story` (beats, mood con retorno), `Social.noteSocialMemory`, `Characters` con `hashSeed`.
- **E. Riesgo:** `Social.ts`/`Chat.ts` son monolitos con `Math.random` → los cambios rompen el determinismo y los checks de charla; la doble afinidad diverge.
- **F. Protegen:** check-story, check-arcs, check-amaia-arc, check-chat, check-contact, check-characters, check-week.

### SIM-03 · Eventos dinámicos
- **A. Existe:** 5 tipos de suceso del mundo con ciclo de vida común y planificación pura por semilla; eventos narrativos del metro con condiciones, continuaciones (`scheduled`), cooldowns y elecciones guardadas; la reputación ya pondera el peso de los eventos.
- **B. Parcial:** los sucesos de calle no recuerdan su resultado ni dependen de consecuencias o relaciones; el motor rico (MetroEventManager) solo funciona en el metro.
- **C. Falta:** un catálogo `data/` de eventos de barrio con condiciones sobre el estado, planificado con `hashSeed(tipo, sitio, día)` y que deje rastro en el registro de SIM-01.
- **D. Reutilizar:** `MetroEventManager` (condición/rareza/continuación/elección) generalizado por datos, `WorldEvents.Lifecycle`, `planDay/planNight` como firma, `EventMemory.eventCooldowns`.
- **E. Riesgo:** condicionar un plan puro al estado rompe la suposición de check-street-events/event-lifecycle; `MetroEventManager` usa `Math.random` por defecto.
- **F. Protegen:** check-street-events, check-event-lifecycle, check-protest*, check-emergencies, simulate-metro-events, check-cross-system.

### SIM-04 · Progresión profesional
- **A. Existe:** contrato con niveles, turnos evaluados (`shifts` con nota y paga), ascenso por `promoteAfter` turnos buenos + desbloqueo de estudio, rechazar ascenso, despido y readmisión; oportunidad «ascenso» derivada. Salidas vistas: Dependiente 60 € → Responsable de montaña 84 €.
- **B. Parcial:** 2 empleos × 2 niveles; la reputación sí se mueve con los turnos, pero el ascenso no lee reputación ni relaciones; sin historial de carrera (los turnos se olvidan a los 21 días).
- **C. Falta:** más niveles por datos; historial de carrera compacto (puesto, desde, hasta, motivo de salida) que sirva de referencia en una nueva contratación (consecuencia de SIM-01).
- **D. Reutilizar:** `data/jobs.ts` (`levels`, `requires.unlock`), `Study.unlocks`, `Opportunities`, `Credit` (ya lee `levelOf`).
- **E. Riesgo:** balance de dinero (`simulate-budget`, BALANCE-LV10); el principio del README «no subir estadísticas con clics».
- **F. Protegen:** check-jobs, check-department, check-study, check-economy, simulate-budget, check-agenda.

### SIM-05 · Vivienda y vida personal
- **A. Existe:** 4 viviendas, alquiler semanal integrado en Household, mudanza con coste y bloqueo por deudas, 4 mejoras con ranuras por casa, y planes de visita de Story que siguen a la casa.
- **B. Parcial:** las mejoras son estéticas con efecto limitado; la vivienda no afecta a las relaciones salvo el lugar de la visita.
- **C. Falta:** efectos de la casa (descanso, visitas que aceptan o no), consecuencias del impago **dentro** de la decisión ya tomada (sin desahucio), convivencia solo si se pide explícitamente.
- **D. Reutilizar:** `Housing` (`move`, `moveBlocker`, `rentsOf`), `Household`, `Story.movePlans`, `Opportunities`.
- **E. Riesgo:** cambiar «nada de desahucio» rompe una decisión documentada; `Housing↔Story` ya acoplados; arte nuevo de mueble = QA-07 (requiere autorización).
- **F. Protegen:** check-housing, check-household, check-arcs, check-places, check-prop-bodies.

---

## Fase 3 · Arquitectura incremental

Principio: **ampliar, no reconstruir**. Ningún gestor nuevo «de todo»: cada misión añade un campo opcional, un archivo puro `Sin Phaser`, datos y un check.

1. **SIM-01 · Registro de consecuencias** (base del resto)
   - `systems/Consequences.ts` puro + `data/consequences.ts`; campo `consequences?` en `GameStateData`; `SAVE_VERSION 5 → 6` con `migrate` que deriva lo existente (despidos de `job.dismissals`, cierres de `stories.decisions`) **sin** moverlo: la fuente sigue siendo la original y el registro solo guarda lo que hoy no se guarda.
   - Idempotente por `id` (patrón `Reputation.apply`); caduca en `onNewDay`.
   - Lectores: condición nueva en `OpportunityCond` y en `Story.Cond`.
2. **SIM-02 · NPC** (depende de 1)
   - Decaimiento diario en `onNewDay` (un pase por NPC con nombre: O(n), barato).
   - Unificar afinidad: `importantNPCsMet` pasa a ser lectura; la escritura va a `Social` (un setter). Sacar la mutación de `WorldScene.ts:3731` a un sistema.
   - Inyectar RNG con semilla en `resolveSocialAction` desde la escena (`hashSeed('social', npc, day, encounters)`).
   - Rutina sensible a la relación: un modificador en `Characters` por datos, no `if` por NPC.
3. **SIM-03 · Eventos** (depende de 1, aprovecha 2)
   - Generalizar el patrón de `MetroEventManager` a un catálogo de barrio en `data/`; planificación `plan(def, place, day, ctx)` con `ctx` = resumen inmutable del estado (reputación, consecuencias), para que siga siendo pura y comprobable.
   - Resultado → registro de SIM-01; cooldowns en `EventMemory.eventCooldowns`.
4. **SIM-04 · Carrera** (depende de 1)
   - Más niveles en `data/jobs.ts`; `career?: {job, level, from, to, reason}[]` sin tope de olvido; la readmisión y las nuevas ofertas leen la carrera y el registro.
5. **SIM-05 · Vivienda y vida personal** (depende de 1 y 2)
   - Efectos de la casa por datos (`data/housing.ts`); visitas que leen la relación (SIM-02); impago → consecuencia (SIM-01) sin desahucio salvo decisión explícita del usuario.

Restricciones transversales por misión:

| Restricción | Riesgo de violarla | Misiones |
|---|---|---|
| QA-02 cámara/zoom | Bajo: ninguna misión toca cámara | — |
| ALPHA-09 HUD móvil/safe-areas | **Medio**: avisos nuevos en el HUD → usar `phone.notice` y la agenda ya existentes | 01, 03, 04 |
| QA-06 pixel art | Bajo: sin render nuevo salvo props de casa | 05 |
| QA-07 arte nuevo | **Alto** en SIM-05 (muebles) y SIM-03 (props de evento): requiere autorización | 03, 05 |
| Sin sistemas paralelos | **Alto** en SIM-03 (tentación de un «EventManager» nuevo) y SIM-01 (duplicar reputación) | 01, 03 |
| Sin condicionales por sitio | Medio en SIM-03/05 | 03, 05 |
| UI en español | Bajo | todas |
| Alcance (CLAUDE.md: «no implementes trabajo, relaciones ni eventos salvo petición explícita») | Cada SIM-0x necesita su petición explícita | todas |

---

## Riesgos técnicos

| # | Riesgo | Prob. | Impacto | Mitigación | Tests que lo cubren |
|---|---|---|---|---|---|
| R1 | Campo nuevo rompe partidas viejas o ranuras | M | A | Campo opcional + `parseX` + paso en `migrate` + `SAVE_VERSION` +1 | check-persistence, save-torture, save-slots, title-save |
| R2 | Pisar cambios ajenos sin commit en `types/game.ts` | A | M | Commit o stash del usuario antes de SIM-01; el builder edita sobre el árbol actual | ninguno automático |
| R3 | Doble fuente de afinidad NPC diverge | A | M | SIM-02 unifica: un solo escritor | check-chat, check-story (parcial) |
| R4 | `WorldScene` (4854 l.) escribe estado directamente | A | M | Mover cada escritura nueva a un sistema puro; no añadir más | check-regression, check-world |
| R5 | `Math.random` en Social/Chat/MetroEventManager impide el determinismo | A | M | Inyectar RNG con semilla en lo que se toque; no reescribir los monolitos | ninguno (los checks pasan RNG propio) |
| R6 | Eventos condicionados al estado rompen planes puros | M | M | `ctx` inmutable como parámetro, no lectura global | check-street-events, check-event-lifecycle |
| R7 | Memorias con tope olvidan consecuencias vigentes | M | M | Registro propio sin tope para lo vigente; tope solo para lo caducado | check-week (recuerdos) |
| R8 | Desequilibrio económico (ascensos, efectos de casa) | M | M | `simulate-budget` con escenario nuevo | simulate-budget, check-economy |
| R9 | Cambiar «sin desahucio» | B | A | No cambiar sin decisión explícita del usuario | check-household |
| R10 | Ciclos de import por `Opportunities`/`Agenda` | M | B | Sistemas nuevos importan solo tipos de esos agregadores | `npm run build` (tsc) |
| R11 | Regresión no detectada en CI | A | M | Añadir `npm run check` a CI (fuera del alcance de SIM-00) | — |
| R12 | Coste por frame en móvil | B | M | Lógica en `onNewDay`/interacción, nunca en `update` | optimizer (BLOCKED aquí, no ejecutado) |

---

## Plan de pruebas por misión

Común a todas: `npm run build`; `check-persistence`, `check-save-torture`, `check-save-slots`, `check-title-save`; cadena completa `npm run check` (≈4 min, ≈2400 líneas; si vuelve en segundos no cuenta); partida v5 real cargada en v6 (fixture); 7 días con `check-week`.

| Misión | Check nuevo (uno) | Checks existentes | Manual / navegador |
|---|---|---|---|
| SIM-01 | `check-consequences.ts`: idempotencia por id, caducidad en salto de 30 h, migración v5→v6 sin pérdida, lectores de condición | reputation, jobs, household, arcs | Faltar a un turno → efecto visible tras recargar |
| SIM-02 | `check-npc-memory.ts`: decaimiento por ausencia, misma semilla = mismo resultado, una sola afinidad | story, arcs, amaia-arc, chat, contact, characters | gameplay-qa: hablar, irse 5 días, volver |
| SIM-03 | `check-dynamic-events.ts`: plan puro por (semilla, día, ctx), cooldown persistido, rastro en el registro | street-events, event-lifecycle, protest*, emergencies, simulate-metro-events | gameplay-qa + optimizer (FPS con evento activo) |
| SIM-04 | ampliar `check-jobs.ts`: niveles nuevos, historial sin tope, readmisión con referencia | department, study, economy, simulate-budget, agenda | Ascender y recargar a mitad |
| SIM-05 | ampliar `check-housing.ts`: efectos por casa, visitas según la relación, impago → consecuencia | household, arcs, places, prop-bodies | visual-qa si hay props; mudanza con plan de visita |

---

## Orden definitivo de implementación

**SIM-01 → SIM-02 → SIM-04 → SIM-03 → SIM-05**

1. **SIM-01 primero**: el resto lee el registro; es puro, sin render y de bajo riesgo visual.
2. **SIM-02**: paga deudas técnicas (doble afinidad, RNG sin semilla) antes de que los eventos las amplifiquen.
3. **SIM-04 antes que SIM-03**: solo datos y un historial, riesgo bajo, y produce consecuencias (despidos, referencias) que los eventos pueden usar.
4. **SIM-03**: el más arriesgado (pureza de planes, tentación de un sistema paralelo, posible arte); llega con el registro y la memoria ya estables.
5. **SIM-05 al final**: depende de 01 y 02, toca una decisión de diseño (desahucio) y quizá arte (QA-07).

Prerrequisito no técnico: commit o stash del trabajo de volumen 2.5D antes de SIM-01 (R2).

---

## Fase 4 · Evaluación DeepSeek

**NOT EVALUATED.** Esta sesión no tiene acceso a DeepSeek: ninguna herramienta ni MCP, ninguna variable `DEEPSEEK_API_KEY` y nada en la configuración de `.claude`. Solo aparecen menciones de texto en `HD-02.md` y `MOV-01.md`. No se simuló ninguna revisión. Para una revisión independiente, este archivo sirve tal cual como entrada.

---

## Evidencia de pruebas ejecutadas (Node 24.19.0, 2026-11-18)

Exit 0 en los 18: check-persistence, save-torture, save-slots, title-save, story, arcs, amaia-arc, jobs, housing, household, study, agenda, week, reputation, street-events, event-lifecycle, economy, cross-system.
No ejecutados: `npm run build` y la cadena completa de `npm run check`. Es una auditoría sin cambios de código, y el árbol tiene trabajo ajeno a medias que no es objeto de SIM-00. Navegador, móvil y rendimiento: **NO VERIFICADO**. No hubo especialistas.

## `git diff --stat` final
Idéntico al inicial (7 archivos, +59 −9, todos ajenos). Este documento (`SIM-00.md`) es el único archivo nuevo, sin seguimiento. No se modificó código.

## Revisión del evaluador (lifesim-evaluator)

Primera pasada: **FAIL**. Huecos señalados y cómo se cerraron:
- DEC-06 sin evaluar; LV-09 y LV-01 sin evaluar como dependencias → añadida la sección «Dependencias de misiones anteriores».
- Más escritores de `importantNPCsMet` → corregido en «Limitaciones del inventario».
- Cita de `Social.ts:1725` señalada como inexacta → **se mantiene**: en `Social.ts:1720-1726` está `resolveSocialAction(..., rng: () => number = Math.random)`, que es el parámetro por defecto.
- «Build y check completo no declarados» → ya estaba declarado en «Evidencia de pruebas ejecutadas».

## Pendiente / no cerrado
- Cuerpos de `Chat.ts`, `SocialDialogue.ts` y `Social.ts`: decaimiento y RNG en cada llamada, NO VERIFICADO.
- Ciclos de import: no hay herramienta; NO VERIFICADO de forma exhaustiva.
- LV-01: la semana completa sin ayudas de depuración no está acreditada (README, Limitaciones).
- README desfasado sobre las ranuras (dice una; hay tres desde LV-02).
- Revisión DeepSeek: NOT EVALUATED.
