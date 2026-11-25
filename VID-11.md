# VID-11 · Diario de vida y álbum de recuerdos

Resultado: **PASS** · BALANCED · correcciones 1/2 · agentes: planner, builder, evaluator, gameplay-qa, visual-qa, optimizer.

Repo: `C:\Users\glest\Documents\lifesim`, rama main, SHA a5ecb3dbb3b8821fc2a4a7bb0c51fb156164ebec.
El árbol ya tenía cambios ajenos sin commitear (130 entradas en `git status` al empezar), que se conservan.
`git diff --stat` del árbol completo tras el ticket: «65 files changed, 2637 insertions(+), 203 deletions(-)». Incluye el trabajo previo sin commitear.
Archivos nuevos del ticket: `src/systems/Diary.ts` y `scripts/check-diario.ts`.

## 1. Auditoría

No existía diario. Las fuentes que ya había no sirven como diario, por tope, por caducidad o porque son internas.
Hay tres fuentes reales con un punto de confirmación claro: el contrato firmado, el proyecto de vida completado y la quedada en casa cerrada.
Compartir comida (VID-09) solo deja un recuerdo interno del NPC: queda fuera.
Decisión: una única proyección persistente mínima `diary` en GameState. No se copian notas ni recuerdos de NPC.

| capacidad | archivo/función | evidencia | carencia | decisión |
|---|---|---|---|---|
| eventos sociales | `SocialEvents.ts`, `socialEvents` | Tope 12 y TTL 30 días | Caducan | No sirve como diario |
| grafo social | `socialGraph.events` | Tope 24, 30 días | Caducan | No sirve como diario |
| recuerdos de NPC | `SocialProfile.memories` | ~40 por NPC | Internos del NPC | No se exponen ni se mezclan |
| ledger | `GameState` ledger | Existe | Solo dinero | No sirve como diario |
| empleo | `JobProgress` | Solo `from` (día) | Sin hora | Se usa como origen del id |
| notas del móvil | `phone.notes` | Tope 50 | Son notas del jugador | No sirven |
| contrato firmado | Menus hire → `GameState.setJob` | Punto de confirmación | Ninguna | Fuente |
| proyecto completado | Todas las vías acaban en `GameState.setLifeProjects` | Punto de confirmación | Ninguna | Fuente |
| quedada en casa | `HomeGathering.tickGatherings` → `GameState.setSocialEvents` | Punto de confirmación | Ninguna | Fuente |
| comida compartida (VID-09) | Recuerdo interno del NPC | Existe | Interno | Fuera |

## 2. Contrato de datos

- **`DiaryEntry`:** `id`, `type` (`'job-hired' | 'project-done' | 'gathering'`), `at` (minuto absoluto del juego), `seq`, `title`, `npcs` (ids), `place?` (id) y `data?`.
- **`Diary`:** `{ v: 1, entries, seq }`.
- **Ids deterministas por origen:** `empleo:<job>:<from>`, `proyecto:<projectId>`, `quedada:<eventId>`.
- **Dedupe:** si el id ya existe, no se añade; reprocesar no duplica. La repetición legítima (dejar el puesto y volver a firmar otro día) da otro `from` y por tanto otro id.
- **Emisión, solo al confirmarse:**
  - Firma: `after` activo y `before` no activo con el mismo job. No cuentan los ascensos, el repaso de turnos ni la carga de partida, porque el constructor no pasa por `setJob`.
  - Proyecto: transición de no completado a completado, con `at = completedAt`.
  - Quedada: paso a `'closed'` con un outcome distinto de cancelada; `at = ev.end`; asistentes no ausentes; `data` `{ outcome, presence = playerPresence }`.
- **Orden:** `at` descendente; desempate por `seq` descendente.
- **Conservación:** `DIARY_MAX` 100; se descartan las más antiguas.
- **`parseDiary` tolerante:** la basura da un diario vacío; descarta tipos desconocidos, ids repetidos y `at` no finito.
- **Nombres resueltos al mostrar.** NPC ausente: «alguien que ya no está en el barrio». Lugar ausente: «un lugar que ya no figura en el mapa». Entrada inexistente: «Este recuerdo ya no está en el diario.».
- **Guardado:** campo opcional `diary`, omitido si está vacío; se parsea en `SaveSystem.parseState`. `SAVE_VERSION` sigue en 12.
- Las partidas antiguas cargan con el diario vacío. El diario pertenece a la ranura (cada ranura tiene su JSON). `startNew` y `adopt` no heredan diario.
- Leer no muta nada.

## 3. Archivos y motivo

| archivo | motivo |
|---|---|
| `src/systems/Diary.ts` (nuevo) | Lógica pura, emisión y formato (`diaryRow`, `diaryDetail`) |
| `src/state/GameState.ts` | `_diary`, getter y `setDiary`, `noteDiary` en `setJob`, `setLifeProjects` y `setSocialEvents`, `toState` |
| `src/systems/SaveSystem.ts` | Parse opcional |
| `src/types/game.ts` | `diary?` |
| `src/ui/Phone.ts` | App «Diario» en la home tras Reputación; pantallas `diary` y `diary-entry`; atrás; refresco con `'diary'` solo si está abierta; filas `phone__row--wrap` |
| `src/style.css` | `.phone__row--button` y su foco; comentario de `--wrap` |
| `scripts/check-diario.ts` (nuevo) | Comprobación del diario |
| `package.json` | `check-diario` en la cadena `check` |

## 4. Pasos reproducibles

Navegador, contexto aislado, ranura 2 nueva.

1. Nueva partida → Empezar; saltar la guía (2).
2. Móvil (P) → Diario: vacío honesto, «Todavía no hay recuerdos…».
3. **(a) Contrato.** Decathlon, «Fichaje · sala de personal» → Leer el cartel → Solicitar el puesto → Aceptar el contrato.
   Resultado: «Firmaste contrato en Decathlon Polígono Norte: Dependiente de sección» · Lun 12 Abr · 10:05 · Polígono Norte · Decathlon · Empresa/Puesto.
4. **(b) Proyecto.** Móvil → Proyectos → «Comprar una bici» → Empezar. Taller Biciclo (Campo Alto), Caja → Bicicleta de ciudad €180.
   Resultado: «Proyecto cumplido: Comprar una bici» · 11:14 · Taller Biciclo.
5. **(c) Quedada.** Hablar con Sara en Vallesco (se presenta). Móvil → Contactos → Sara → «Invitar a casa» → «Vale, mañana a las 19:30 en tu casa.». Estar en casa; la quedada pasa a running y se cierra 'bien' a las 21:00.
   Resultado: «Quedada en casa con Sara: salió bien» · Mar 13 Abr · 21:00 · Con Sara · Tu piso · «La quedada salió bien · Llegaste a tiempo».

Preparación declarada (no acredita eventos, solo habilita):

- Dinero a 300 € para pagar la bici.
- `lifesim.social.set('sara', …)` con `contactExchanged`, friendship 40 y trust 25, para cumplir el umbral de invitación.
- `setClock` para llegar a la hora de la quedada.

## 5. Aceptación

| # | criterio | estado | evidencia |
|---|---|---|---|
| 1 | Tres actividades reales generan los tres tipos | PASS | Navegador (a)(b)(c); gameplay-qa (firma) |
| 2 | Fecha, origen y resultado coinciden | PASS | 10:05 firma, 11:14 compra, 21:00 fin de la quedada 'bien' |
| 3 | Reprocesar no duplica | PASS | check-diario (`addEntry` idempotente, mismo objeto); con contrato activo la UI no ofrece repetir la firma (gameplay-qa); recarga sin duplicar |
| 4 | Repetición legítima | PASS | gameplay-qa: dejar el puesto y volver a firmar al día siguiente → `empleo:decathlon:3` (at 1980) además de `:2` |
| 5 | Guardar/cargar conserva entradas y orden | PASS | Recarga → 3 entradas iguales en el mismo orden (solo cambia el orden de claves JSON); check-diario ida y vuelta; check-save-torture |
| 6 | Nueva partida y cambio de ranura no mezclan | PASS | Ranura 2 nueva vacía; ranura 1 sin entradas de la 2; volver a la 2 conserva sus 3 |
| 7 | Partida antigua sin inventar | PASS | Ranura 1 (guardado anterior a VID-11 sin clave `diary`) carga con el diario vacío; check-diario v12 sin `diary` y con `diary` dañado |
| 8 | Referencia ausente no rompe | PASS (script) / NO VERIFICADO en navegador | check-diario bloque l: NPC y lugar ausentes y resolutores que lanzan → texto neutro |
| 9 | Teclado, ratón y táctil | PASS | Teclado P/D/S/E/Esc (escritorio); clic; toque en móvil emulado 390x844 DPR3 |
| 10 | Abrir/cerrar recupera controles; HUD, cámara, safe-areas | PASS | El personaje no se mueve con el móvil abierto; al cerrar vuelven joystick y E; zoom 3 sin cambio; visual-qa PASS |
| 11 | Consultar no concede ni cambia nada | PASS | Snapshot de dinero, energía, relación con Sara, job, proyectos y diario igual antes y después; check-diario: `sortedEntries` no muta |
| 12 | Límite y fallo de almacenamiento | PASS (script) / NO VERIFICADO en navegador | `DIARY_MAX` 100 y `parseDiary` tolerante en check-diario; ~250-300 B por entrada, ≤30 KB con 100 (optimizer) |
| 13 | Fotografías | NO IMPLEMENTADO | Sin mecanismo de captura; no se añade botón |
| 14 | Sin regresiones | PASS | `npm run check` completo 167/167, FAILS=0; tsc 0; `npm run build` 0; consola sin errores ni avisos |

## 6. Resultados

- `npx tsc --noEmit -p .`: exit 0.
- `npm run build`: exit 0.
- Cadena `check` de `package.json` ejecutada comando a comando: 167 comandos, 0 fallos.
- Dirigidos OK: check-diario, check-consequences, check-regression, check-save-torture, check-life-projects, check-reparto, check-bici, check-interaction.

## 7. Evidencia de navegador y limitaciones

- Escritorio 958x888 y móvil emulado 390x844 DPR3 (no dispositivo físico).
- Corrección 1/2: el detalle cortaba el texto con «…» (estilo de `.phone__row`). Se aplica el modificador existente `phone__row--wrap`, solo en el Diario; verificado en móvil.
- visual-qa: PASS. Menor: el contraste del texto secundario es igual que en el resto de apps.
- optimizer: PASS. Sin trabajo por frame; el diario solo se clona al abrir. Propuesta opcional no aplicada: clonar solo la entrada en el detalle.
- gameplay-qa: vacío, firma y repetición PASS.

## 8. No implementado

- Fotografías: NO IMPLEMENTADO.
- Filtros: no añadidos (tres tipos y lista corta).
- «Anterior al diario · fecha no registrada»: NO IMPLEMENTADO (opcional). Las partidas antiguas empiezan vacías, sin inventar.

## 9. Revisión DeepSeek

NOT EVALUATED (no conectada al flujo).

## 10. BLOCKED

Ninguno.

## 11. Riesgos y pendientes

- Exportar/importar y restaurar copia sin probar en navegador (usan el mismo JSON del guardado).
- Dispositivo físico sin probar.
- El título se congela al registrar: si un NPC no se resolvía en ese momento, queda su id.
- Referencia ausente y tope solo probados por script.
- El lugar mezcla espacios de nombres (parada, lugar, location), resueltos con un resolutor genérico.
- Sin commit, push, merge ni deploy.
