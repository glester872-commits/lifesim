# DEC-06 · Probadores y stock en Decathlon

Modo BALANCED. Rama `dec-01-atencion`, base `cc98a1e` (DEC-01 a DEC-05 en commits). Sin commit. El usuario pidió ejecutar DEC-06 sin
contrato propio: el alcance sale de DEC-01 («probadores y stock: si no hay stock real verificable, no inventar») y de la auditoría.

## Fase 1 · Estado inicial

- `git status`: sólo la evidencia añadida a `DIALOGOS-SECCION-DEC05.md` y sus capturas 07/08 (DEC-05, sin commit). Se conservan.
- HUD móvil (ALPHA-09): sin constante de versión; el menú del probador es el mismo componente de menú ya verificado a 390×844.

## Fase 1 · Auditoría

| Pieza | Dónde | Estado |
| --- | --- | --- |
| Cabinas | prop `fitting-room` (`world/PropArt.ts:658`, una sola variante, cortina cerrada) ×5 en el sector `probadores` | EXISTE (decorado para el jugador) |
| Puntos | `DECAT_FITTING_00..04` (`data/decathlon.ts:386,435`, delante de cada cabina) | EXISTE, sólo NPC (`CHECK_ITEM`) |
| Libre/ocupado | `Crowd.occupancy(point)` (`systems/Crowd.ts:959`): FREE / RESERVED / IN_USE; WorldScene marca puntos del jugador en `claimed` (`:1489-1534`) | EXISTE |
| Probar | `Menus.openGarment` PROBAR: una prenda, en el perchero; `endFitting` restaura; el guardado guarda el aspecto previo (`GameState.ts:925`, `SaveSystem.ts:376`) | EXISTE |
| Probador funcional del jugador | — | **FALTA** |
| Stock | `STORES.decathlon.stock` = líneas infinitas `{garment, price}` | infinito |
| Agotado por día | patrón `weekStock` derivado por día (`systems/Rastro.ts:30`) y «Agotado» en la ficha (`Menus.ts:1894,1930`) | PARCIAL (sólo Rastro) |
| Textos | saludo de Decathlon «Lo que ves en los percheros es lo que hay» (`retail.ts:302`); `StoreKnowledge.stockText` lista todo | a ajustar |

## Fase 1 · Definiciones

- **Probador del jugador:** E delante de una cabina libre (`DECAT_FITTING_n` con `occupancy` FREE) abre «Probador n». Si las cinco
  están ocupadas: «Están todos ocupados, espera un momento.» Mientras está dentro, su punto queda en `claimed` (ningún NPC lo coge);
  al salir vuelve a FREE.
- **Qué aporta frente a PROBAR del perchero:** probarse **varias prendas a la vez** (una por slot: camiseta + pantalón + chaqueta +
  zapatillas + gorra + gafas) entre las de la **cesta** y las del catálogo que no tienes, verlas juntas, y desde ahí **añadir a la
  cesta** o **quitar de la cesta**. Opciones «Quitarse todo» y «Salir» (Salir y Esc restauran tu ropa). El pago sigue en caja o
  autopago (DEC-04): el probador no cobra ni tiene atajo de pago (sería una afordancia sin cajero).
- **Estado visual de la cabina:** no se cambia el arte (QA-07); la ocupación se ve por el NPC o el jugador delante. NO IMPLEMENTADO.
- **Stock:** el jugador nunca puede tener dos iguales (el armario lo impide), así que una cantidad por prenda no es verificable. Se
  implementa **agotado por día**: `soldOutToday(store, garment, day)` determinista (hash del día, como `weekStock`), sólo en tiendas
  con `basket` (Decathlon), como mucho 2 prendas al día, nunca más de la mitad del catálogo y nunca una que ya tengas. **Reposición:**
  al día siguiente cambia el sorteo.
- **Dónde se ve y se respeta:** perchero (lista «Agotado»), ficha (COMPRAR y A LA CESTA desactivados con motivo), lista de la caja,
  probador (no se ofrece), cesta (una línea que hoy está agotada impide pagar: todo o nada, el mensaje la nombra), `buyGarment` y
  `payBasket` lo rechazan sin tocar nada (el día entra como parámetro con valor por defecto que no cambia otras tiendas).
- **Textos:** `stockText` recibe el día y dice «hoy no tenemos X; mañana lo reponen»; el saludo de la tienda deja de prometer «es lo que
  hay» sin matizar. Sin pedidos, reservas ni encargos (no existen).
- **Guardado:** nada nuevo. `SAVE_VERSION` sigue en 5 (lo afirman check-luna y check-metro-transfers).
- **Evidencia:** tabla al final (caso, pasos, esperado, obtenido, PASS/FAIL/NO VERIFICADO, notas).

## Implementación

| Archivo | Cambio |
| --- | --- |
| `src/systems/Retail.ts` | `soldOutList`/`soldOutToday` (determinista por tienda y día, sólo tiendas con `basket`, 0–2 prendas, ≤ mitad, nunca lo del armario); `buyGarment(…, day?)` rechaza lo agotado; `pickFitting` (cabina pedida si está libre, si no la libre más cercana, si no ninguna) |
| `src/systems/Basket.ts` | `addLine` y `payBasket` con `day?`: lo agotado se rechaza; el pago es todo o nada y nombra la prenda |
| `src/systems/StoreKnowledge.ts` | `stockText(…, day)` omite lo agotado; `soldOutText` añade «Hoy no tenemos X; mañana lo reponen.» |
| `src/data/retail.ts` | saludo de Decathlon: «…es lo que hay hoy…» |
| `src/types/game.ts`, `src/data/decathlon.ts` | `LocationDef.fittings`, derivados de los puntos `DECAT_FITTING_*` («Probador n») |
| `src/scenes/Menus.ts` | «Agotado» en perchero, ficha (COMPRAR y A LA CESTA desactivados), caja y cesta (CONFIRMAR desactivado); `openFittingRoom` (probar varias, una por hueco; añadir o quitar de la cesta; Quitarse todo; Salir); `endFitting` = devolver la ropa + liberar la cabina |
| `src/scenes/WorldScene.ts` | interacción de probador en cada cabina; la cabina del jugador va en `claimed` |
| `scripts/check-fitting-stock.ts` (nuevo) + `package.json` | agotados estables, límites, rechazo en compra/cesta/pago, día siguiente, textos, probadores, `SAVE_VERSION` 5 |

Corrección 1/2: `check-resale` exige textualmente que cerrar el menú llame a `endFitting()`; en vez de tocar el check, `endFitting`
pasó a liberar también la cabina. Sin arte nuevo (la cabina no cambia de aspecto: NO IMPLEMENTADO), sin campos nuevos en el guardado.

## Evidencia

Navegador: Chrome vía DevTools, `localhost:5199`, escritorio 958×888. Día 27 (sábado): agotados `pantalon-chandal` y
`zapatillas-futbol-sala`; día 32: `cortavientos-trazo`. Ranura 3 respaldada y restaurada (día 26, 10:15, €107,50).

| Caso | Pasos | Esperado | Obtenido | Estado | Notas |
| --- | --- | --- | --- | --- | --- |
| Agotado en perchero | Día 27, perchero «Pantalones de deporte» | la agotada marcada | «Pantalón de chándal · Agotado» y el otro a €9,99 | PASS | `PROBADORES-STOCK-DEC06/01-perchero-agotado.png` |
| Entrar al probador | E delante de la cabina (23,4) | menú del probador, sin pago | «Probador 2»: 8 de 10 prendas (sin las agotadas), Quitarse todo, Salir | PASS | `02-probador.png` |
| Mismo hueco | Probar camiseta y luego cortavientos | sustituye | `top` = cortavientos | PASS | |
| Varias a la vez | + pantalón + gorra | tres huecos puestos | `top`, `bottom`, `cap` a la vez | PASS | `03`, `04-probador-combinado.png` |
| Añadir a la cesta | «Añadir gorra de running a la cesta» | a la cesta, sin cobro | cesta `[gorra]`, €107,50 | PASS | |
| Salir | Esc | ropa original, cabina libre | aspecto original, `fittingRoom` null, €107,50 | PASS | |
| Cesta con línea agotada | Cortavientos a la cesta el día 27 → día 32 → caja | no se paga, nada cambia | «Agotado · €19,99», CONFIRMAR desactivado, estado idéntico | PASS | `05-cesta-con-agotado.png` |
| Quitar y pagar | Quitar la agotada → CONFIRMAR | cobra el resto una vez | €107,50 → €100,51, gorra al armario, cesta vacía | PASS | |
| Determinismo y reposición | check-fitting-stock | mismo día igual, cambia entre días, ≤2, ≤ mitad | 58 combinaciones en 200 días | PASS | |
| Rechazo en compra/cesta/pago | check-fitting-stock | sin cambios | pasa | PASS | |
| Texto de stock | check-fitting-stock | omite lo agotado; «Hoy no tenemos…» | pasa | PASS | |
| Cabina ocupada por el jugador | `Crowd.occupancy` con el menú abierto | IN_USE | FREE (el mundo está en pausa con el menú: la marca se aplica en el tick, que no corre); ningún NPC se mueve mientras tanto | PASS con matiz | |
| Todas ocupadas | — | aviso | lógica `pickFitting` en el check; no reproducido en navegador | NO VERIFICADO | |
| Móvil 390×844 (emulado) | E delante de la cabina (23,4) | probador legible sin pisar el HUD | «Probador 3», 10 prendas, lista con desplazamiento (Quitarse todo y Salir quedan bajo el pliegue; VOLVER del HUD también sale) | PASS | `06-movil-probador.png`; teléfono físico NO VERIFICADO |
| Errores JS | listener `error` | 0 | 0 | PASS | |

Comandos: `npx tsc --noEmit` exit 0; `npm run build` OK; checks dirigidos exit 0: check-fitting-stock, check-checkout-basket,
check-decathlon-sport, check-store-knowledge, check-section-lines, check-economy, check-interaction, check-regression, check-decathlon,
check-menu, check-luna, check-metro-transfers, check-persistence. Cadena completa (147 comandos uno a uno en PowerShell): **147 de
147 OK**, 427 s, 2566 líneas.

**Corrección 2/2 (evaluador):** «Agotado hoy: mañana lo reponen» debe ser cierto. Opción A: `soldOutList` del día d descarta lo que
salió en el sorteo del día d−1 (`rawSoldOut` interno), así que nada está agotado dos días seguidos. `check-fitting-stock` comprueba
en 200 días que ninguna prenda agotada el día d lo está el d+1 (51 combinaciones distintas). Tras la corrección: `tsc` 0, build OK,
check-fitting-stock, check-store-knowledge, check-checkout-basket y check-section-lines OK, cadena completa **147 de 147 OK** (421 s).
Los días concretos de la prueba en navegador (27 y 32) pueden cambiar de agotados con esta regla; la interfaz no cambia.
