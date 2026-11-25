# VID-03 — Microhistorias: «El alquiler de Nati»

## 1. Estado del repo

- Ruta: `/c/Users/glest/Documents/lifesim`, rama `main`, SHA base `a5ecb3d`.
- Stack: Phaser 3, TypeScript y Vite.
- Cambios ajenos que se conservan sin tocar: LOC-01, VID-01, VID-02 y `design/coches/`.

## 2. Definiciones previas e inventario auditado

| Id | Estado | Evidencia (rutas) |
|---|---|---|
| SIM-01 | IMPLEMENTADO | `src/systems/Consequences.ts` |
| SIM-02 | PARCIAL | Memoria jugador↔NPC en `src/systems/Social.ts` (`noteSocialMemory`) y NPC↔NPC en `src/systems/SocialGraph.ts`. No había memoria de historias; VID-03 la aporta con `steps`, `consequences` y notas. |
| SIM-03 | PARCIAL | Ciclos por sitio en `WorldEvents`, `StreetEvents` y `MetroEventManager`; `Opportunities` es derivado. No hay director global. VID-03 añade un reductor de datos, no un motor paralelo. |
| Empleo de NPC | NO EXISTE | En `namedPeople`, `work` es texto; en `population`, `staff` solo coloca; `src/systems/Jobs.ts` y `src/data/jobs` son del jugador. |

## 3. Decisión de alcance

«El vecino pierde su trabajo» necesita empleo de NPC, que no existe. Se sustituye por la alternativa declarada **«El alquiler de Nati»**. Nati es la barbera de Vallesco, está en `NPC_DEFS` y no está en `EXCLUDED_NPCS`. Las tres opciones se apoyan en sistemas reales: el ledger, Gifts, SocialProfile, el teléfono y las notas.

## 4. Contrato de datos

Tipos en `src/systems/MicroStories.ts`:

| Tipo | Forma |
|---|---|
| `MicroTrigger` | `{ kind: 'npc-shortfall'; npc: string }` |
| `MicroStep` | `{ id; day; kind: 'offer' \| 'choice' \| 'response'; option? }` |
| `MicroConsequence` | `{ id; appliedAt?; movementId?; memoryRef? }` |
| `MicroStory` | instancia: id, def, actor, estado, pasos y consecuencias |
| `MicroStoriesState` | `{ v: 1; items: MicroStory[]; lastTickDay: number }` |

- `sourceEventId`: `ms:<def>:<día>`. `id`: `<def>#<día>`.
- Save v9 (`SAVE_VERSION` en `src/config/constants.ts`), migración `version < 9` idempotente en `src/systems/SaveSystem.ts`. `SaveSlots` sin cambios.
- Se guarda: `items` y `lastTickDay`. Se deriva y no se guarda: la señal (`shortfallSignal`), la elegibilidad del actor, las opciones disponibles, la línea de diálogo (`storyLineFor`) y la traza (`explainStory`).

## 5. Historia vertical

**Trigger.** Día de ciclo ≥ 26 con `shortfallSignal` determinista (señales de Nati en los días 27, 56, 57, 87, 89 y 116-119). Nati debe ser conocida (`encounters > 0`), no estar dormida ni ocupada y no estar excluida.

**Planteamiento.** Al hablar con ella en la barbería (`DialogueSystem.ask`). Si el jugador tiene su contacto, llega un mensaje a su hilo. Sin popups.

**Opciones.**

| Opción | Efecto inmediato | Después |
|---|---|---|
| lend | −30 € («Préstamo a Nati») | Al día siguiente +36 € («Nati te devuelve el préstamo»), friendship +6, trust +4, memoria y nota «Le presté 30 € a Nati para el alquiler». |
| gift | `giveGift`, sin dinero. Solo se ofrece si hay un regalo en la bolsa. | Respuesta a los 2 días. |
| ignore («Ahora no puedo») | mood −4, trust −2, memoria «no le dijiste nada del alquiler» | Línea fría. |
| «Ahora no» | No gasta la historia | Abre el menú normal de la barbería. |

**Expiración.** A los 3 días sin respuesta; si el jugador no está, se aplica ignore una sola vez.

**Reproducción.**
1. Partida nueva; hablar con Nati al menos una vez (encounters > 0).
2. Avanzar hasta el día 27 en horario de apertura.
3. Entrar en la barbería y hablar con Nati: aparece el planteamiento y, con contacto, 1 mensaje en el hilo.
4. Elegir una opción y avanzar un día (lend) o dos (gift); revisar Cuentas, notas y relación.
5. Para la expiración: esperar a la señal del día 56 sin hablar con ella y comprobar `expired` el día 60.

## 6. Ritmo

| Regla | Valor |
|---|---|
| `MAX_ACTIVE` | 1 |
| Cooldown por historia | 14 días |
| Cooldown por actor | 10 días |
| Cooldown global | 3 días |
| Exclusividad del actor | no si tiene un plan pendiente en Story/Phone o está en `EXCLUDED_NPCS` |
| Catch-up | 3 días como mucho, una historia por tick |
| `MAX_STORIES` / `MAX_STEPS` | 12 / 8 |

## 7. Causalidad y mecanismo de datos

Las consecuencias pasan por los sistemas existentes: el ledger (`movementId` estable más `pendingMoney`), `applyDelta`, `noteSocialMemory`, `giveGift`, `saveNote` y `postMessage`. `explainStory` deja la traza. Una historia nueva es una entrada nueva en `MICRO_STORIES` (`src/data/microStories.ts`) sin tocar `systems/`; `scripts/check-micro-stories.ts` lo prueba con una segunda def sintética.

## 8. Pruebas

| # | Caso | Pasos | Esperado | Observado | Estado | Notas |
|---|---|---|---|---|---|---|
| 1 | Trigger real | Avanzar días 2-27 | Nada en 2-26; el día 27, historia active `ms:rent-nati:27` y 1 mensaje en el hilo | Igual | PASS | |
| 2a | lend | Elegir lend | 120→90 y luego 126; ledger lend y repay; nota | Igual | PASS | Navegador |
| 2b | ignore por expiración | Señal del día 56 sin responder | expired el 60; trust −2, mood −4; dinero sin cambios | Igual | PASS | Navegador |
| 2c | «Ahora no puedo» a mano | Elegir ignore | choice ignore; dinero sin cambios | Igual | PASS | Navegador |
| 2d | gift | Elegir gift con regalo en la bolsa | `giveGift` y respuesta a los 2 días | Igual en el check | PASS (check) / NO VERIFICADO (navegador) | |
| 3 | Ignorar sin bloquear | «Ahora no» y día 60 | Nati disponible; su menú abre | Igual | PASS | Antes de la corrección 1 «Ahora no» la bloqueaba hasta 3 días. Al cerrar el menú se libera la charla (`offerTalk` vuelve a false). |
| 4 | Guardar y cargar sin duplicar | lend, guardar, recargar | 126 €, 1 lend, 1 repay, 1 nota | Igual | PASS | Elegir dos veces devuelve «Eso ya está decidido.» |
| 5 | Solapamiento y FPS | Check, navegador y node | `MAX_ACTIVE`=1 y cooldowns respetados; FPS estable | Nada entre los días 29 y 55. FPS calle 54-59, barbería 54-58 sin over. Reductor: 0,07 ms de media por día (máx 0,35 ms), 0,0002 ms el mismo día. 400 jornadas dejan 12 historias (el tope). | PASS | El aviso `vehicles 26/24` de la calle es preexistente. `setClock` cuesta unos 19 ms de media por sus oyentes; VID-03 añade menos de 0,4 ms. |
| 6 | Ledger en Cuentas | Abrir Cuentas tras lend | «Préstamo a Nati −€30» / «Nati te devuelve el préstamo +€36» en español | Igual | PASS | Tras la corrección 1 |
| 7 | Consola | Recorrer la historia | Sin errores | Sin errores | PASS | |
| 8 | Visual, teclado, táctil, móvil | — | — | — | NO VERIFICADO | visual-qa omitido: no hay UI ni arte nuevos (diálogo, menú, hilo y Cuentas son los existentes). LV-01: NO VERIFICADO. |
| 9 | No regresión | build y cadena completa | build exit 0; sin fallos nuevos | 159 comandos con 1 fallo (`check-regression`), preexistente en `a5ecb3d` | PASS | `check-interaction` se rompió con la corrección 1 y se arregló en la corrección 2 (`offerTalk` justo después de `startTalk`). Cámara, zoom, HUD y safe-areas sin tocar: PASS por diff. |

## 9. Build y cadena

- `npm run build`: exit 0.
- Cadena: TOTAL=159, LINES=3100, FAILS=1 (`check-regression`, preexistente).

## 10. DeepSeek

NOT EVALUATED.

## 11. git diff --stat

37 archivos con seguimiento, +696/−79, incluidos los cambios ajenos.

Archivos de VID-03 con seguimiento:
- `src/state/GameState.ts`
- `src/systems/SaveSystem.ts`
- `src/types/game.ts`
- `src/config/constants.ts` (`SAVE_VERSION` 9)
- `src/scenes/WorldScene.ts`
- `package.json`
- Asserts de versión 8→9 en `check-consequences`, `check-fitting-stock`, `check-life-projects`, `check-luna`, `check-metro-transfers`, `check-reputation` y `check-social-graph`.

Sin seguimiento: `VID-03.md`, `src/systems/MicroStories.ts`, `src/data/microStories.ts` y `scripts/check-micro-stories.ts`.

## 12. Riesgos

- Solo hay una historia en datos.
- La señal del día 56 cae en domingo, con la barbería cerrada; la ventana 57-59 sí abre y el check lo afirma.
- `ctx.asleep` mira el mediodía.
- «Ahora no» con Esc también abre el menú.
- Si `giveGift` falla, la elección cuenta igual.
- El dinero se registra con el tipo `'loan'`.
- `storyLineFor` se repite al hablar varias veces el mismo día.

## 13. Rollback

Revertir los archivos de VID-03 y bajar `SAVE_VERSION` a 8. Un save v9 se rechazaría por ser más nuevo, así que hay que avisar antes.
