# DEC-01 · Atención al cliente en Decathlon — auditoría (`--audit`)

Modo BALANCED + `--audit`: sólo Fase 1. **Sin cambios de código.** Único archivo nuevo: este documento (entregable del
ticket). Fecha 17/11/2026.

## 1. Estado Git

- Ruta `C:\Users\glest\Documents\lifesim`, rama `main`, SHA `3aa5929a0f47bfb389805a40043358401c5e9527`.
- `git status`, `git diff`, `git diff --stat` iniciales: vacíos (árbol limpio). Tras la auditoría: sólo `DEC-01.md` sin seguimiento.

## 2. Archivos por categoría (verificados en código)

| Categoría | Archivo · símbolo |
| --- | --- |
| Decathlon | `src/data/decathlon.ts` · `DECATHLON_STORE` (76×52, portal `exit` → `poligono-norte`/`pn-decathlon`, spot información (66,40), fichaje (72,41)), `SECTORS` (34), `AISLES`, `RACKS` (3), `DECATHLON_PROFILE`; `src/data/decathlonLayout.ts` · `DECATHLON_LAYOUT` v1; `src/data/places.ts:243` (`hours: [9, 21]`); render `src/world/StoreArt.ts` |
| Colaboradores | `src/data/decathlon.ts:447-470` · `TILL_STAFF` (Caja 1-6, `cashier()`, offer `shop-decathlon`), `floor()` para Sección de montaña/running/ciclismo/fitness (fitness sólo `WEEKEND` [5,6]), `Reposición` (sin offer, ronda `DECAT_BROWSE_`). Turnos: `systems/Crowd.ts` `staffOnShift` + `levelAt`. Aspectos: `data/npcs.ts` `decathlon_employee*` |
| Interacción | `src/scenes/WorldScene.ts` · `nearestInteractable()` (~3413), `crowdInteractables()` (~2071), `offerOf` (~3723), `startTalk`/`endTalk` (~2020); `src/systems/Interaction.ts` · `pickTarget` (159), `PRIORITY`; `src/entities/Walker.ts` · `talkTo(facing)` (237) |
| Diálogos | `src/systems/DialogueSystem.ts` (`start`, `ask`), `src/ui/DialogueBox.ts`; **atención actual:** `src/data/services.ts:32` tipo `advice` (`greeting` + `questions[{question,answer}]`), datos `decathlon-montana/running/ciclismo/fitness` (53-83); render en `src/scenes/Menus.ts:1050` (`openOffer` → `menu.open`, lista plana + «Gracias, eso es todo»). Charla de calle `systems/Chat.ts` (`ChatLog` anti-repetición). `systems/Story.ts` = arcos de personajes con nombre, no diálogo por sección |
| Navegación | `src/systems/Navigation.ts` · `route(fromId,toId)` (36), `tilePath(loc,from,to,avoid)` (190), `findPoint`, `pointsOfKind`; NPC con `points` nombrados vía plan de `PopulationProfile` (`systems/Crowd.ts`) |
| Secciones | `SECTORS[].rect` + `inRect` (privado), `sectionPoints()` (privado), `inAisle` (exportado). **No existe** `sectorAt(tx,ty)` ni producto→sección |
| Compras | `src/data/retail.ts:291` tienda `decathlon`: 5 prendas con precio (camiseta-tecnica 7,99 · sudadera-entreno 14,99 · pantalon-chandal 12,99 · chandal-gris 9,99 · zapatillas-futbol-sala 24,99); `src/systems/Retail.ts` `stockOf`; `Menus.ts` `openStore`/`buyGarment` (LV-05) |
| Stock / probadores | Stock = lista de prendas a la venta, **sin cantidades ni tallas**. Probadores: prop `fitting-room` ×5 + puntos `DECAT_FITTING_00..04` sólo para visitantes (estado CHECK_ITEM); para el jugador, texto de `inspects`. No funcionales |
| Cajas | `DECATHLON_LAYOUT.checkouts` caja-1..6 (`open.days/minLevel`) + auto-1/2 (decorado). Sin API de estado de cola |
| Persistencia | `src/config/constants.ts:63` `SAVE_VERSION = 5`; `systems/SaveSystem.ts` + SaveSlots (LV-02). Decathlon no guarda estado propio |

## 3. Sistemas reutilizables y conflictos

**Reutilizables:** offer `advice` + `Menus.openOffer` (es la semilla de DEC-01/DEC-05), `DialogueSystem.ask`, `startTalk/endTalk` +
`Walker.talkTo` (detener/orientar/reanudar ya existe), `staffOnShift`/`levelAt` (quién está y qué caja abre), `SECTORS`/`DECATHLON_LAYOUT`
(geografía), `route`/`tilePath` (camino), `ChatLog`/hash determinista (variación), `stockOf` (lo que de verdad se vende).

**Conflictos:**
- Ya hay 4 offers `advice` con 2-3 preguntas fijas: DEC-01 debe **extender** ese tipo, no crear otro motor.
- `Reposición` y 26 de 34 secciones no tienen colaborador dedicado → derivación o respuesta genérica de ubicación.
- Tallas, cantidades, bicicletas en venta: no existen. Responder sobre ellas exige DEC-03/DEC-06; hasta entonces, sin cifras.
- «Acompañar» exige pausar el plan del agente en `Crowd` y moverlo por `tilePath`: no existe; es el punto más caro.
- «Ocupado» no existe para el personal de sala (sólo el pozo de agentes).
- Las respuestas actuales de dirección son texto escrito a mano («Al fondo…, hacia el extremo derecho»): si se generan desde `SECTORS`, deben coincidir con ellas o sustituirlas.

## 4. Correspondencia IDs DEC ↔ implementación

| ID | Descrito | Real |
| --- | --- | --- |
| DEC-01 | Atención al cliente | **Parcial embrionario:** offers `advice` de 4 secciones (`services.ts:53-83`), respuestas fijas, sin contexto |
| DEC-02 | Empleados y horarios / rediseño | **Existe** (`DEC-02.md`, `decathlonLayout.ts`, check-decathlon §14) |
| DEC-03 | Compras y bicicletas | **No existe** como tal; hay compra de ropa LV-05 (5 prendas). Sin bicis |
| DEC-04 | Cajas y autopago | **No existe** (sin estados de caja; autopago decorado) |
| DEC-05 | Diálogos por sección | **No existe** como sistema; las offers `advice` cubren su función mínima |
| DEC-06 | Probadores y stock | **No existe** (probadores decorado; sin cantidades/tallas) |

## 5. Arquitectura propuesta

Sin motor nuevo: se amplía el tipo `advice`.

1. **CustomerQuery** (`src/data/storeQueries.ts`, datos): categorías → preguntas (≤5 categorías, ≤4 preguntas). Cada pregunta referencia
   `sector`/`checkout`/`garment` por id, nunca texto de dirección escrito.
2. **EmployeeKnowledge** (`src/systems/StoreKnowledge.ts`, puro): a partir del `StaffRole` (sus `sections`), qué responde él y qué deriva.
3. **ContextResolver** (mismo módulo): `sectorAt`, dirección relativa colaborador→sección (desde `SECTORS.rect`), cajas abiertas ahora
   (`staffOnShift`/`levelAt`), qué hay en `stockOf('decathlon')`, quién atiende cada sección ahora. Exporta helpers de `decathlon.ts` en
   vez de copiarlos.
4. **Response** (mismo módulo): plantillas con 3 variaciones por respuesta, elegidas por hash determinista (colaborador + pregunta + día),
   sin repetir la última dicha por ese colaborador (estado en memoria).
5. **OptionalAction** (`Menus.ts` coordina): indicar (`talkTo` hacia la sección + texto), derivar (nombre y sección del compañero en
   turno o «hoy no está»), informar stock (sólo líneas reales de `stockOf`). **Acompañar** queda para una fase propia.

Render: el menú existente (`menu.open`) en dos niveles (categoría → pregunta), teclado/ratón/táctil igual que hoy. Sin estado en `state/`
ni en `SaveSystem`.

## 6. Definiciones previas

- **Conversación real:** responde según la sección del colaborador, dónde está él, qué cajas abren ahora y qué se vende de verdad; varía
  la frase; puede orientar el cuerpo o derivar. No guarda nada.
- **Menú compacto:** 5 categorías (Secciones · Productos · Probadores · Cajas · Servicios), ≤4 preguntas cada una, sin iconos (texto,
  como el resto de menús), más «Gracias, eso es todo». Bicicletas va dentro de Productos/Secciones.
- **Variaciones:** 3 por respuesta; selección por hash determinista + exclusión de la última respuesta de ese colaborador.
- **Cooldown:** ninguno por conversación; el saludo se acorta si el mismo colaborador ya habló con el jugador en los últimos 30 min de
  juego (memoria de sesión, no guardada).
- **Orientación del NPC:** `startTalk` → `Walker.talkTo` hacia el jugador (existente); al indicar, gira hacia la sección (4 direcciones,
  sin animación nueva). Al cerrar, `endTalk` reanuda su plan.
- **Acompañar unos metros:** hasta 6 tiles por `tilePath`, sólo si el colaborador no está cobrando y el destino está en el mismo local;
  luego vuelve a su plan. Fase propia; si `Crowd` no admite pausar plan sin refactor, queda NO IMPLEMENTADO y se indica sólo.
- **Derivación:** a un `StaffRole` en turno (`staffOnShift`) cuyas `sections` incluyan la pedida; se le nombra y se dice dónde está.
  Sin teletransporte ni apertura automática de su diálogo. Si no está en turno: «hoy no hay nadie en X; pregunta en información».
- **Señalar dirección:** texto con dirección relativa calculada desde `SECTORS` + giro del NPC. Sin flecha ni marcador (sería arte/HUD nuevo).
- **Información de producto:** nombre y precio de `STORES['decathlon'].stock`, y sección si el perchero (`RACKS`) la da. Nada más.
- **Stock real verificable:** sólo «se vende / no se vende» desde `stockOf`. Sin cantidades ni tallas hasta DEC-06.
- **Probadores:** ubicación (sector `probadores`); no hay uso para el jugador.
- **Cajas:** cuáles abren ahora (`open` + `staffOnShift`/`levelAt`). El autopago no se ofrece (decorado hasta DEC-04).
- **Sección:** entrada de `SECTORS` (id, rect, label); se consulta con `sectorAt(tx,ty)` nuevo, exportado de `decathlon.ts`.
- **Empleado ocupado:** un cajero con cliente en `DECAT_TILL_n`, o Reposición en movimiento: se detecta por estado del agente; responde
  una frase corta y deriva. No se le bloquea.
- **No existe empleado especializado:** ninguna `StaffRole` en turno cubre la sección → indica la ubicación él mismo y lo dice.
- **Información inexistente:** tallas, cantidades, bicicletas a la venta, precios fuera de `stock` → la pregunta no se ofrece (sin
  afordancia falsa); si llega por derivación, «eso no lo sé, mira en la sección».
- **Persistencia relacionada:** ninguna. No se guarda conversación, cooldown ni derivación.
- **Compatibilidad con saves:** sin cambios; `SAVE_VERSION` sigue en 5, sin migración.
- **BLOCKED:** no se puede leer el repo, ejecutar `npm`/checks o abrir el juego cuando el criterio lo exige.
- **NO VERIFICADO:** el criterio no se pudo comprobar (ni check ni navegador), con motivo.
- **PARTIAL:** parte de los criterios PASS y el resto pendiente y documentado.
- **PASS:** criterio comprobado con check determinista o recorrido en navegador con captura.
- **Formato de evidencia:** carpeta `DEC-01/` (capturas) + tabla de verificación en este archivo (caso, esperado, obtenido, estado, notas).
- **Evidencia:** salida de comando con exit code, captura de navegador, logs de consola.
- **Regresiones detectadas:** fallo en check-decathlon, check-interaction, check-regression, check-uniform, check-chat, o cambio de
  comportamiento de cajas/compra en navegador.
- **Trabajo futuro:** lo que depende de DEC-03/04/06 o de un cambio en `Crowd`; se lista en la ficha final.

## 7. Dependencias

| Dep. | Estado | Evidencia |
| --- | --- | --- |
| DEC-02 | Cerrado | `DEC-02.md`, check-decathlon exit 0 |
| DEC-03 | No existe | sin código; LV-05 cubre 5 prendas |
| DEC-04 | No existe | sin estados de caja |
| DEC-05 | Parcial (embrionario) | offers `advice` |
| DEC-06 | No existe | probadores decorado, stock sin cantidades |
| LV-02 | Cerrado | SaveSlots, `SAVE_VERSION` 5; DEC-01 no lo toca |
| LV-06 | Cerrado (no afectado) | `AVATAR-LV06.md`; DEC-01 no toca apariencia |
| LV-01 | Parcial | `VERIFICATION-WEEK-LV01.md`: semana de 7 días no completada → QA funcional NO VERIFICADO |
| HD-02 / MET-01..05 | No afectados | DEC-01 no toca NPC fuera de Decathlon |
| HOSP-01 / LOC-01 | No existen en el repo | sin rastro en código ni .md |
| ALPHA-09 | Existe; no se toca | HUD móvil fuera de alcance |

## 8. Riesgos

- Regresión de cajas: los cajeros comparten `offerOf`; cambiar su offer rompería la compra (check-decathlon, check-interaction).
- Inventar datos (tallas, stock) si el texto se escribe a mano en vez de derivarse.
- Direcciones generadas que contradigan el plano real (las 34 secciones deben pasar un check).
- «Acompañar» puede obligar a tocar `Crowd`/plan del agente: riesgo de desincronizar la población.
- `WorldScene.ts` es muy grande: el cambio debe vivir en `systems/` + `Menus.ts`, con WorldScene sin tocar o mínimo.
- Partida del usuario: la QA en navegador debe respaldar y restaurar todas las claves `lifesim*`.

## 9. Plan de implementación (BALANCED sin `--audit`)

1. **Contexto** — exportar `sectorAt` e índice sección→colaborador; `systems/StoreKnowledge.ts` puro. Criterio: `scripts/check-store-knowledge.ts`
   prueba las 34 secciones y todos los puntos `DECAT_*`; dirección relativa coherente con `rect`.
2. **Consultas en dos niveles** — ampliar `advice` con categorías (compatible con las 4 offers actuales). Criterio: menú categoría→pregunta con
   teclado/ratón/táctil; las preguntas actuales siguen accesibles; check-interaction exit 0.
3. **Respuestas contextuales y variación** — cajas abiertas ahora, stock real, derivación. Criterio: mismo colaborador no repite la última
   respuesta; caja cerrada nunca se recomienda; ninguna respuesta menciona prenda fuera de `stock`.
4. **Orientar / derivar** — giro hacia sección, compañero en turno o «no está». Criterio: navegador con capturas en `DEC-01/`.
5. **(DEEP o ticket aparte) Acompañar** — sólo si `Crowd` admite pausa sin refactor.
6. **QA** — `npm run build`, `npm run check` completo, check-regression/save-torture/save-slots, recorrido en navegador (escritorio y 390×844 emulado).

Recomendación: **BALANCED sin `--audit`** para fases 1-4; acompañar como DEEP o ticket aparte.

## 10. Observado en navegador (antes de DEC-01) y no verificado

Observado (Chrome, escritorio 958×888, `localhost:5199`, ranura 3, viernes 7 may):
- Al acercarse a la colaboradora de montaña aparece el aviso **«E»** sobre ella. Capturas `DEC-01/01-antes-montana-advice.png`,
  `02-antes-montana-respuesta.png`: menú «SECCIÓN DE MONTAÑA», saludo «¿Paseo corto o ruta de todo el día?», 3 preguntas + «Gracias, eso
  es todo», pie «W/S elegir · E aceptar · Esc salir»; el reloj pasa a **PARADO**. La respuesta («Al fondo, en la fila de montaña, hacia el
  extremo derecho. Están junto a camping.») sale como nota bajo la lista, en el mismo menú.
- `DEC-01/03-antes-caja-tienda.png`: «DECATHLON · CAJA 1», las 5 prendas con precio y «Sólo miraba».
- **Hallazgos para la implementación:** (1) el saludo de la tienda promete «si no es tu talla, te la busco» y no existen tallas
  (afordancia falsa en texto); (2) dos líneas se llaman igual, «Pantalón de chándal» (€12,99 `pantalon-chandal` y €9,99 `chandal-gris`).
- Método: el menú se abrió llamando a `menus.openOffer` (lo mismo que hace la tecla E en `WorldScene.ts:3574`); el E sintético no llegó
  a disparar el menú porque la colaboradora se movía entre llamadas. Partida respaldada y restaurada (verificada tras recargar).

No verificado:
- Que la tecla E real abra el menú (el aviso «E» sí se vio), y si el NPC se queda quieto y reanuda al cerrar.
- Comportamiento exacto de Reposición al hablarle (sin offer).
- Si `Crowd` permite pausar y reanudar el plan de un agente sin refactor.
- Quién ocupa el punto de información (66,40): ningún `StaffRole` lo tiene como punto.
- `npm run check` completo: no ejecutado (no hay cambios de código); sí build y 3 checks.

## Comandos ejecutados

| Comando | Exit | Salida clave |
| --- | --- | --- |
| `npm run build` | 0 | `✓ built`; aviso de chunks > 500 kB |
| `npx tsx scripts/check-decathlon.ts` | 0 | `OK · calle 15 tiles … 34 secciones · 11 pasillos · 10 circuitos · 331 muebles de 32 tipos · 2936 tiles alcanzables` |
| `npx tsx scripts/check-interaction.ts` | 0 | `OK: una sola regla decide qué se ofrece, todo se alcanza…` |
| `npx tsx scripts/check-regression.ts` | 0 | `OK: 2 escenas · … 319 interacciones … guardado ida y vuelta.` |

Navegador: Chrome vía DevTools MCP, `localhost:5199`, escritorio. Ranura 3 respaldada y restaurada byte a byte (10 claves `lifesim*`);
observado en vivo (viernes 10:15): Sección de montaña, running, ciclismo y Reposición en estado WORK; Caja 1-4 en sus puestos; fitness
ausente (sólo fin de semana). Segunda pasada (orquestador): 3 capturas en `DEC-01/` (ver §10), partida restaurada de nuevo.

## Implementación (BALANCED sin `--audit`, fases 1-4) · rama `dec-01-atencion`

Aprobada por el usuario tras la auditoría. 1 corrección usada de 2. Sin commit.

| Archivo | Cambio |
| --- | --- |
| `src/systems/StoreKnowledge.ts` (nuevo) | Reglas puras: dirección relativa (`heading`/`pathTo`/`goTo`), `facingTo`, `describe` (agrupa secciones por nombre y zona), `sectionsOf(role)`, `advisers`/`adviserFor`, `storeNow`/`onShift`, `openCheckouts` (sólo cajas con cajero), `stockText`, `listEs`, `say` (3 variaciones por hash + anti-repetición en un `Map` en memoria), `answer` |
| `src/data/storeQueries.ts` (nuevo) | 4 categorías: ¿Dónde está…? (6 departamentos) · Ropa y precios · Probadores y cajas · ¿Quién me asesora?; plantillas `STORE_REPLIES` |
| `src/scenes/Menus.ts` | `openOffer(…, staff?)`: `advice` con `store` → `openStoreDesk` (categorías + «Consejo de <sección>» + «Gracias, eso es todo») → `openStoreQueries` / `openStoreAdvice` con «Volver» y Esc atrás |
| `src/scenes/WorldScene.ts` | Pasa `{tile, role, face}` del colaborador a Menus (sin condicional de sitio); `startTalk` pone `agent.moving = false` |
| `src/data/decathlon.ts` | `sectorAt(tx,ty)`; Reposición con offer `decathlon-tienda` y sus puntos explícitos (los mismos) |
| `src/data/services.ts` | `advice.store?`; offer `decathlon-tienda`; las 4 de sección con `store` |
| `src/data/retail.ts` | Saludo sin promesa de tallas |
| `src/systems/Crowd.ts` | `export staffDay` |
| `scripts/check-store-knowledge.ts` (nuevo) + `package.json` | Check en la cadena tras check-decathlon |

**Decisiones:** se amplía `advice` en vez de un motor nuevo; las preguntas que no tienen dato real (tallas, cantidades, bicis a la venta, autopago) no se ofrecen; sin estado en `state/` ni en el guardado (`SAVE_VERSION` sigue en 5); el giro del NPC usa `talkingTo`, el mismo campo que la charla; la derivación nombra a quien lleva la sección y si hoy trabaja, sin abrir su diálogo ni teletransportar.

### Verificación de la implementación

| Caso | Esperado | Obtenido | Estado | Notas |
| --- | --- | --- | --- | --- |
| A. E real ante colaborador de sección | Menú de 2 niveles, NPC quieto, reloj parado | «SECCIÓN DE RUNNING»: ¿Dónde está…? · Ropa y precios · Probadores y cajas · ¿Quién me asesora? · Consejo de running · Gracias; `moving=false`; PARADO | PASS | `DEC-01/10-menu-running.png` |
| B. «¿Dónde está…?» | Secciones + dirección; NPC se gira | Ciclismo: «…Segunda Vida… hacia la entrada y luego a la derecha»; `talkingTo=right` | PASS | texto vía DOM |
| C. Cajas abiertas | Coinciden con cajeros presentes | «cajas 1, 2, 3 y 4» con Caja 1-4 en WORK | PASS | `DEC-01/12-cajas.png` |
| D. Ropa y precios | Stock real, sin «talla», bien redactado | Ciclo 0 FAIL (minúscula, «y…y»); ciclo 1: «Zapatillas, en Running; camisetas, sudaderas y pantalones de deporte, en Sportswear…» | PASS | `DEC-01/13-ropa.png` |
| E. Sin repetición seguida | Dos textos distintos | «Te cuento…» / «Mira…» | PASS | además el check lo recorre para 5 colaboradores × 4 horas |
| F. Volver / Esc / Gracias; NPC reanuda | Navegación correcta; vuelve a andar al cerrar | Volver y Esc al raíz, Gracias cierra; Reposición: `talking=false` y en ~12 s anda con ruta nueva | PASS | |
| G. Reposición | Atención general sin consejo; quieta al hablar | «REPOSICIÓN · Dime, ¿qué buscas?», 4 categorías + Gracias; `moving=false` 2 s con el menú abierto (ciclo 1) | PASS | `DEC-01/14-reposicion.png` |
| H. Cajero intacto | E abre «DECATHLON · CAJA n» | «DECATHLON · CAJA 1», 5 prendas, saludo nuevo sin tallas | PASS | `DEC-01/15-caja.png` |
| I. Errores JS | Ninguno | `window` error/unhandledrejection vacíos | PASS | no captura `console.error` |
| Móvil 390×844 (táctil) | Menú usable | No probado | NO VERIFICADO | usa el mismo `menu.open` que check-menu/check-interaction (móvil igual) |
| Teléfono físico | — | No disponible | NO VERIFICADO | |

Comandos: `npm run build` exit 0 (ciclos 0 y 1). `npm run check` completo ciclo 0: exit 0, 277 s, 2569 líneas. Ciclo 1 dirigidos (exit 0):
check-store-knowledge, check-decathlon, check-places, check-interaction, check-menu, check-chat, check-population, check-crowd-variety,
check-uniform, check-regression, check-save-torture. `npm run check` completo ciclo 1: exit 0, 2570 líneas (check-store-knowledge OK en la línea 207).

Evaluador: PASS (sin `any`, sin condicionales por localización, WorldScene sólo coordina). Riesgos no bloqueantes: StoreKnowledge está atado a
Decathlon (si otra tienda lo quiere, parametrizar por datos); `face()` sincroniza todas las vistas del crowd en cada giro.

## Ficha

| Campo | Valor |
| --- | --- |
| Estado | PASS (auditoría) · PARTIAL (implementación: fases 1-4 PASS; fase 5 «acompañar» y móvil táctil sin verificar) |
| Archivos | `DEC-01.md`, `DEC-01/` + los de la tabla «Implementación» |
| Sistemas reutilizados | offer `advice`, `Menus.openOffer`, `DialogueSystem`, `startTalk`/`Walker.talkTo`, `staffOnShift`/`levelAt`, `SECTORS`/`DECATHLON_LAYOUT`, `route`/`tilePath`, `stockOf`, `ChatLog` |
| Dependencias | DEC-02 cerrado · DEC-05 parcial · DEC-03/04/06 no existen · LV-01 parcial · LV-02/LV-06/ALPHA-09 sin impacto |
| Implementado | Fases 1-4: contexto, consultas en 2 niveles, respuestas contextuales con variación, orientar y derivar; Reposición atiende; saludo sin tallas |
| No implementado | Fase 5 «acompañar»; saludo corto si ya habló hace <30 min; colaborador «ocupado»; tallas/cantidades/bicis/autopago (DEC-03/04/06) |
| QA PASS | A-I (tabla «Verificación de la implementación») |
| QA FAIL | — (D falló en el ciclo 0 y se corrigió) |
| QA NO VERIFICADO | Móvil 390×844 táctil; teléfono físico |
| Riesgos | §8 |
| Regresiones | Ninguna detectada (check completo y dirigidos en verde; cajero intacto en navegador) |
| Trabajo futuro | Acompañar (requiere `Crowd`); tallas/cantidades (DEC-06); bicicletas a la venta (DEC-03); estado de cola y autopago (DEC-04) |

**Status final de la auditoría: PASS** (evaluador) — código auditado y menú actual observado con capturas; sólo la tecla E real y
la reanudación del NPC quedan NO VERIFICADAS (§10).
