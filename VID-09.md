# VID-09 · Cocinar y compartir comida

## 1. Auditoría y alcance

Base: main a5ecb3d, con los cambios sin commitear de LOC-01 y VID-01…07, que se conservan.
Cocinar pasa a ser una receta con ingredientes y un resultado en la bolsa: compra y pan dan dos platos caseros.
Se reutilizan el inventario, la compra, el comer, la estación «Cocina», el reloj, la relación y la quedada en casa de VID-05.
No se crea ningún sistema nuevo, ni arte, ni modelo de visitas, ni migración.

| capacidad | archivo/función | evidencia | carencia | decisión |
|---|---|---|---|---|
| inventario | `Wallet.inventory` con `carryMax` (`CARRY_MAX` 12 o `ItemDef.max`) | Existe | No había forma de añadir respetando el tope | Extender: `Commerce.produce` |
| ítems | `src/data/items.ts` | `groceries` ('ingredient') y `bread` ('food') existen | No había plato cocinado | Crear: `home-meal` «Plato casero», food, +15, máximo 4 |
| comer | `Menus.openBag` → `Commerce.consume` | Existe | Ninguna | Reutilizar |
| compra | `catalogs.ts` (`groceries` €9 y `bread` €0,90 en Súper Rosales); `Commerce.checkout` | Existe | Ninguna | Sin cambios |
| estación | Prop `stove` con el spot «Cocina» en las 4 viviendas (`locations.ts` y los datos de ronda y studio) | Existe | Ninguna | Reutilizar, sin arte |
| receta | `'cook'` en `src/data/activities.ts` | Gastaba `groceries` y daba +30 de energía directa | Un solo ingrediente y sin resultado en la bolsa | Extender: `consumes` pasa a lista y se añade `produces` |
| ejecución | `Menus.openSpot`/`run`, `Activities.blocker`/`perform` | Existe | No manejaba `produce` ni la bolsa llena | Extender: `applyOutcome`, la revalidación y la guarda |
| reloj | `clock.advanceMinutes` | Existe | Ninguna | Reutilizar |
| relación y memoria | `Social.applyDelta`, `noteSocialMemory`, patrón `Gifts.giveGift` | Existe | No había compartir comida | Extender: `mealBlocker` y `shareMeal` |
| visitas | VID-05 `HomeGathering.playerInGathering`, quedada en casa | Existe | Ninguna | Reutilizar; no hay modelo de visitas nuevo |
| guardado | `SaveSystem.parseCounts` filtra por `ITEM_IDS`; `SAVE_VERSION` 12 | Existe | Ninguna | Sin migración |

## 2. Contrato de datos y receta

- **`'cook'`, «Cocinar (45 min)»:**
  - Consume `groceries` ×1 y `bread` ×1.
  - Produce `home-meal` ×2.
  - 45 min de reloj y sin energía directa. Antes daba +30; ahora son 2 × 15 al comer.
- **`home-meal`:** kind `food`, energy 15, max 4 y short `'platos'`.
- **Campos opcionales nuevos en `ItemDef`:** `plural` y `short`.
- **Detail del menú:** «compra y pan: 2 platos».
- **Bloqueos:**
  - «Te falta: barra de pan.»
  - «No te caben más platos caseros en la bolsa. Cómete uno antes.»

## 3. Política de recursos, tiempo, cancelación y recuperación

- Abrir el menú o seleccionar no gasta nada; «Nada» o la cancelación cierran sin cambios.
- Al confirmar, `run()` revalida con `blocker`, y `applyOutcome` aplica dinero, ingredientes y resultado sobre una copia.
  - Es todo o nada, con una sola asignación de `state.wallet`.
  - Después vienen `advanceMinutes(45)` y `persist`.
- La guarda `running` evita la re-entrada.
- No existe estado intermedio, así que recargar antes, durante o después es coherente y no hay que persistir nada nuevo.
- La preparación no se puede interrumpir: el reloj salta 45 min de golpe, como el resto de actividades.

## 4. Compartir

- **Cuándo aparece:** la opción «Compartir comida» sale en la charla (`WorldScene`, junto a «Dar un regalo») solo si llevas `home-meal` y `playerInGathering` es verdadero, es decir, si el NPC está en tu casa en una quedada en curso.
- **Confirmación:** «Compartir» o «Ahora no».
- **Reglas de `mealBlocker`:** `encounters ≥ 1`, llevar plato y no haber compartido ese día (memoria con nota `'comida'`).
- **Raciones:** un plato es una persona.
  - Con 2 o más, coméis los dos: −2 platos y +15 de energía para ti.
  - Con 1, se lo das: −1 y sin energía.
- **Efecto:** amistad +5, confianza +2, ánimo +8 y una memoria `SHARED_EVENT` `'comida: plato casero'`.
- **Un solo efecto por NPC y día:** aguanta el doble clic (`done` en `offerMeal`) y la recarga.
- El recuerdo propio de la quedada es aparte y no se duplica.

## 5. Archivos modificados

- `src/data/items.ts`: `home-meal`, `plural`, `short` y `groceries.where`.
- `src/data/activities.ts`: `consumes` en lista, `ingredientsOf`, `produces` y la receta `cook`.
- `src/systems/Activities.ts`: `blocker`/`perform` con resultado y bolsa llena.
- `src/systems/Commerce.ts`: `produce`, que respeta el tope.
- `src/systems/Gifts.ts`: `mealBlocker` y `shareMeal`.
- `src/scenes/Menus.ts`: `openSpot`/`run` con `applyOutcome`, revalidación y guarda.
- `src/scenes/WorldScene.ts`: «Compartir comida» y `offerMeal`.
- `scripts/check-cocina.ts` (nuevo).
- `scripts/check-supermarket.ts` y `scripts/check-places.ts`: leían `consumes.item`; ahora usan `ingredientsOf` o la lista.
- `package.json`: `check-cocina` en la cadena.
- `src/systems/Traffic.ts`: `limit` y el getter `capacity`.
- `src/scenes/WorldScene.ts`: reparto del presupuesto de vehículos entre coches y bicis (`populate` y `update`).
- `scripts/check-regression.ts`: el fixture de posición usa `createInitialState().position`.

## 6. Pasos para reproducir

1. Ve a Súper Rosales (abre a las 9:00), Caja, y compra «Compra para cocinar» (€9) y «Barra de pan» (€0,90).
2. En casa, Cocina → «Cocinar (45 min)», con el detail «compra y pan: 2 platos».
3. Abre la Bolsa (I): «Plato casero ×2 +15 ⚡». Come uno.
4. Desde el móvil (P), invita a casa a alguien con el número intercambiado. En la franja de la quedada, háblale y elige «Compartir comida».

## 7. Tabla QA

| caso | pasos | esperado | observado | resultado | evidencia |
|---|---|---|---|---|---|
| 1 · compra real | Súper Rosales, Caja, comprar compra y pan | Se cobra y entran los dos ingredientes | Dinero 120 → 111 → 110,10; `{groceries:1, bread:1}` | PASS | gameplay-qa, contexto 'vid09qa'. El listado muestra «€8,99» al volver tras cobrar €9: es el comportamiento correcto, ver sección 16 |
| 2 · preparación | Cocina → «Cocinar (45 min)» | Detail correcto, 2 platos, 45 min y sin energía directa | Detail correcto; después `{home-meal:2}`, reloj 739 → 784 (+45) y energía 100 → 100 | PASS | Navegador |
| 3 · ingredientes insuficientes | Cocina sin pan | Opción deshabilitada y nada cambia | Deshabilitada con «Te falta: barra de pan.»; inventario y reloj sin cambios | PASS | Navegador; check-cocina (D): sin descuento parcial |
| 4 · cancelación previa | Abrir Cocina y elegir «Nada»; `menu.cancel()` | Cierra sin cambios | Cartera, energía y dinero sin cambios | PASS | Contexto 'vid09o'. Un Esc instantáneo por CDP no cierra el menú: es el comportamiento correcto, ver sección 16 |
| 5 · interrupción posterior | — | Sin estado intermedio | No aplica: política atómica (sección 3); recargar después conserva todo (caso 8) | PASS | Por diseño, más el caso 8 |
| 6 · capacidad | Con `home-meal` 4 y los ingredientes, ir a Cocina | Deshabilitado y sin cambios | Deshabilitado y sin cambios | PASS | Navegador; check-cocina (E) |
| 7 · pulsaciones repetidas | Doble E al cocinar; doble clic en «Compartir» | Un solo efecto | Doble E: +2 platos (no +4) con un solo gasto. Doble clic en «Compartir»: se aplica una sola vez | PASS | Navegador |
| 8 · guardar y cargar | Cocinar y recargar; compartir y recargar | Se conserva todo | Tras cocinar: `{home-meal:1, groceries:1, bread:1}`, energía 65 y €110,10, iguales tras recargar. Tras compartir y recargar: plato 1, relación 50/37/78 y una sola memoria 'comida@2' | PASS | Navegador; check-cocina (H) |
| 9 · comer solo | Bolsa → Plato casero | +15 de energía y un plato menos | Energía 50 → 65 y `home-meal` 2 → 1 | PASS | Navegador. Hizo falta un segundo E porque la Bolsa se acababa de abrir; es el bloqueo de pulsación previo (`PICK_LOCK_MS`) |
| 10 · compartir | Quedada real con Ada (`contactExchanged`, encounters 4), día 2 a las 19:45, evento running; hablarle | Aparece «Compartir comida»; «Ahora no» no cambia nada; «Compartir» aplica una vez; repetir el mismo día se bloquea | «Ahora no»: platos 2 y energía 60 sin cambio (la amistad +1 viene de cerrar la charla, mecánica previa). «Compartir» con doble clic: platos 2 → 0, energía 60 → 75, amistad 45 → 50, confianza 35 → 37, ánimo 70 → 78 y memoria 1. Repetir con 1 plato: «Hoy ya habéis comido juntos. Mejor otro día.», sin cambios | PASS | Navegador |
| 11 · sin invitado elegible | Amaia en la calle sin quedada, con 2 platos | La opción no aparece | No aparece y los platos se conservan | PASS | Navegador |
| 12 · partida antigua | Cargar un save sin `home-meal` | Carga sin migración | `parseCounts` acepta `home-meal` como un ítem más; el save sin él carga; las partidas recargadas durante las pruebas funcionan | PASS | check-cocina (H) en node y las recargas. No se inyectó un save v11 real en el navegador |
| 13 · sin regresiones | Build, cadena completa, consola | Sin regresiones | Cadena TOTAL=164, FAILS=0. Pasan check-supermarket, check-places, check-agenda, check-economy, check-quedadas y check-bienestar. Consola sin errores | PASS | Sección 9 |
| 14 · cámara, zoom, HUD y pixel art | visual-qa, escritorio y móvil | Sin cambios visuales ni desbordes | No se tocaron. Primera pasada: FAIL, el detail largo se cortaba con scroll horizontal; se corrigió con «compra y pan: 2 platos». Segunda pasada: overflow de `.menu__list` 0 en escritorio y en móvil, scrollWidth 390 | PASS | visual-qa, segunda pasada. “(45 min)” entero en móvil, visual-qa PASS (vid09-cocina-movil-v4.png) |

## 8. Compatibilidad de guardados

`SAVE_VERSION` sigue en 12, sin cambios ni migración.

## 9. Build y check

- `npm run build`: exit 0.
- `node scripts/check-cocina.ts`: exit 0, «OK: cocina en 4 viviendas; compra + pan → 2 platos caseros en 45 min, todo o nada; bolsa de 4; compartir: conocerse, llevar plato, una vez al día; con 1 plato se lo das, con 2+ coméis los dos.»
- Cadena completa: TOTAL=164 y FAILS=0.

## 10. Navegador

- **Plataforma:** Chrome por CDP en escritorio, con contextos aislados ('vid09qa', 'vid09o', 'vid09v2', 'vid09perf' y 'vid09vis'). La partida del perfil normal no se usó.
- **Móvil:** emulado, 390×844 DPR3 táctil.
- **Dispositivo físico:** NO VERIFICADO.
- **Rendimiento (optimizer):** district 59-60 FPS (tope de 60 Hz) y home 60. Sin trabajo nuevo por frame.
  - over vehicles 26/24 en district: resuelto, ver sección 16: máximo 23/24 y 0 overs.
- **Capturas** en `C:\Users\glest\AppData\Local\Temp\claude\1cd68afec0b9951e\bd56eae1-9b20-4f82-9c8c-ddc89ecf6478\scratchpad\`: `vid09-cocina-v2.png`, `vid09-cocina-movil-v2.png` y `vid09-bolsa.png`. No se meten binarios en el repo.

## 11. DeepSeek

NOT EVALUATED.

## 12. Correcciones 2/2

1. El detail del menú (visual): el texto largo se cortaba con scroll horizontal y pasó a «compra y pan: 2 platos».
2. Esta ronda: la carrera del tope de vehículos y el espacio duro en «Cocinar (45 min)».

## 13. git diff --stat

```
 package.json                 |   2 +-
 scripts/check-places.ts      |   5 +-
 scripts/check-supermarket.ts |   6 +-
 src/data/activities.ts       |  26 +++-
 src/data/items.ts            |  16 ++-
 src/scenes/Menus.ts          | 162 +++++++++++++++------
 src/scenes/WorldScene.ts     | 328 ++++++++++++++++++++++++++++++++++++---
 src/systems/Activities.ts    |  38 ++++-
 src/systems/Commerce.ts      |  19 +++
 src/systems/Gifts.ts         |  40 ++++++
 10 files changed, 556 insertions(+), 86 deletions(-)
Sin trackear: scripts/check-cocina.ts, VID-09.md
Árbol completo: 54 files changed, 1531 insertions(+), 164 deletions(-)
```

El stat acumula los cambios sin commitear de otros tickets en esos archivos.

## 14. Riesgos y pendientes

- Cambio de balance: cocinar ya no da energía al momento.
- El límite diario de compartir se apoya en las memorias, que se recortan a 40 por persona.
- Con 2 o más `hail()` o `forceSpawn()` simultáneos se podría llegar a 25 vehículos.
- Si se baja la calidad en caliente, el exceso se va al salir los vehículos por el borde.
- Único pendiente fuera de mi alcance: la prueba en un dispositivo físico. La hace el usuario: abrir el juego en el móvil, cocinar en la Cocina de casa con compra y pan, comer un plato desde la Bolsa, y comprobar que el menú se lee entero.

## 15. Rollback

1. Borrar `scripts/check-cocina.ts` y `VID-09.md`.
2. Revertir los hunks de VID-09 en:
   - `src/data/items.ts`: `home-meal`, `plural`, `short` y `groceries.where`.
   - `src/data/activities.ts`: `consumes` en lista, `ingredientsOf`, `produces` y `cook`.
   - `src/systems/Activities.ts`.
   - `src/systems/Commerce.ts`: `produce`.
   - `src/systems/Gifts.ts`: `mealBlocker` y `shareMeal`.
   - `src/scenes/Menus.ts`: `openSpot`/`run`.
   - `src/scenes/WorldScene.ts`: «Compartir comida» y `offerMeal`.
   - `scripts/check-supermarket.ts` y `scripts/check-places.ts`.
   - `package.json`.
3. No hay migración que deshacer.

## 16. Pendientes cerrados

| pendiente | causa | arreglo | verificación |
|---|---|---|---|
| Esc no cerraba los menús de Cocina o Cama | No era un bug del juego. Phaser descarta la pulsación instantánea de CDP (keydown y keyup en el mismo frame): `Key.onUp` resetea `_justDown` | Ninguno | Un Esc mantenido 150 ms cierra la Cocina y la Cama sin abrir la pausa (`menu.isOpen` pasa a false) |
| €8,99 frente a €9 | Descuento por reputación del barrio (`Menus` `priceFactor`, MAP-07). Al pagar sube la reputación y el listado muestra 9 × 0,999 | Ninguno, es correcto | — |
| «vehicles 26/24» en district | `Traffic` solo limitaba por carril (peak × carriles: coches 18 y bicis 8) y nadie aplicaba `BUDGETS[calidad].vehicles` | `Traffic.limit` y el getter `capacity`. `WorldScene` reparte el presupuesto menos 1 entre coches y bicis: en `populate`, de forma proporcional; en `update`, los coches antes y las bicis después, con la cuenta del mismo frame. Queda 1 plaza reservada para `hail()` y `forceSpawn()` | El primer intento daba 25/24 en 6 de 8 muestras. El final da máximo 23 en 99 muestras a las 08:30 y en 98 a las 18:00, 0 overs, 56-60 FPS (optimizer, PASS). Evaluador PASS |
| La etiqueta «(45 min)» se partía en el móvil | — | El nombre pasa a «Cocinar (45 min)» con espacio duro | En móvil 390 px, «(45 min)» queda entero, overflow 0 y scrollWidth 390 (visual-qa PASS, captura `vid09-cocina-movil-v4.png`) |
| «1 platos» posible con qty 1 | — | `Menus.openSpot` usa el nombre singular cuando qty === 1 | `home-meal` se llama «Plato casero»; evaluador PASS |
| check-regression fallaba (ya en a5ecb3d) | El fixture guardaba la posición (123,456), que ya no es una casilla libre en el mapa de inicio, y `SaveSystem.safePosition` la recoloca en (120,448) al cargar, como debe | El fixture usa `createInitialState().position` | exit 0, «guardado ida y vuelta» |
| Textos «+30» en README o docs | No hay ninguno en README ni en `design/` | Ninguno | — |
| «Te falta: barra de pan.» en minúscula | Es la minúscula correcta tras los dos puntos | Se mantiene | — |
