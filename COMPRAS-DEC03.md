# DEC-03 · Compras de productos deportivos en Decathlon

Modo BALANCED. Rama `dec-01-atencion` (encima de DEC-01 y DEC-02 sin commit; se conservan). Sin commit.

## Fase 1 · Estado inicial

- Ruta `C:\Users\glest\Documents\lifesim`, rama `dec-01-atencion`, base `3aa5929`.
- `git status`: cambios sin commit de DEC-01 (atención al cliente) y DEC-02 (afluencia): M `package.json`,
  `scripts/check-decathlon.ts`, `scripts/simulate-population.ts`, `src/data/{decathlon,decathlonLayout,population,retail,services}.ts`,
  `src/scenes/{Menus,WorldScene}.ts`, `src/systems/Crowd.ts`; nuevos `StoreKnowledge.ts`, `storeQueries.ts`, `check-footfall.ts`,
  `check-store-knowledge.ts`, `DEC-01.md`, `DEC-01/`, `AFLUENCIA-DEC02.md`. Se editan sólo bloques propios.
- HUD móvil (ALPHA-09): sin constante de versión en `src` (sólo comentarios en `config/constants.ts:22`, `world/PixelScale.ts:29`).
  DEC-03 reutiliza el menú existente y no toca el HUD.

## Fase 1 · Auditoría

| Pieza | Dónde | Estado |
| --- | --- | --- |
| Dinero | `state.wallet` (GameState); cobro puro `systems/Retail.ts:63` `buyGarment` → `Purchase {ok, wallet, wardrobe, appearance, paid, message}`; saldo validado en :72; céntimos | EXISTE |
| Aplicación de la compra | `Menus.openGarment` (~1909) y `openStore` (~1537): aplican wallet, wardrobe y `paid` en el mismo paso síncrono, avanzan el reloj y guardan | EXISTE |
| Cobro único | `Retail.ts:69` rechaza si la prenda ya está en `wardrobe` («Ya tienes una igual»); `PICK_LOCK_MS` del menú evita el doble toque (check-menu) | EXISTE |
| Armario | `GameState` `wardrobe: string[]` (ids de `GarmentDef.id`), `paid: Record<id, precio>`; guardados | EXISTE |
| Equipar | `CATEGORIES` (`retail.ts:25-44`) → slots top/bottom/shoes/cap/scarf/glasses; uno por slot (`Retail.wear`); categorías sin slot no se venden (error al arrancar) | EXISTE |
| Probar | `openGarment` PROBAR: aspecto temporal, Esc lo restaura, sin tocar dinero ni armario | EXISTE |
| Arte de prendas | `HumanArt` pinta por `color`/`dark`/`sleeve`/`lens`: una prenda nueva no necesita arte | EXISTE |
| Catálogo de Decathlon | `retail.ts:291` 5 prendas con precio fijo | PARCIAL |
| Percheros | `decathlon.ts` `RACKS` (3: zapatillas, camisetas y sudaderas, pantalones) → `menus.openRack` filtrado por `categories` (`RackDef` en `types/game.ts:474`) | EXISTE |
| Otros expositores | balones, canasta, mancuernas, bicis de Segunda Vida, tiendas de campaña: decorado o texto de `inspects` | decorado |
| Marcas | No hay campo de marca de producto | FALTA |
| Bicicletas | `data/bikes.ts` = tipos de bici del **tráfico NPC**; el jugador no tiene bici, ni compra, ni velocidad, ni guardado | FALTA |
| Objetos no-ropa deportivos | Hay inventario de objetos (`wallet.inventory`, tiques), pero ningún objeto deportivo comprable | FALTA |
| Stock limitado | Infinito; sólo `unique` (una pieza por jugador) | infinito |
| Precio | Fijo por línea × `priceHere()` (reputación del barrio, MAP-07) | EXISTE |
| DEC-04 (cajas) | No existe: la tienda cobra en la caja con cajero (`shop-decathlon`) y en el perchero | FALTA |

## Fase 1 · Definiciones previas

- **Catálogo en datos:** `GarmentDef` (`retail.ts`) + línea de `STORES.decathlon.stock`. Campos pedidos → reales:
  `id` = `GarmentDef.id` (estable, kebab-case); `category` = `GarmentDef.category`; `name`, `description` = iguales; `price` =
  `StockLine.price`; `stock` = **infinito** (nada que agotar ni reponer; se documenta); `stats` = **ninguna** (prendas cosméticas,
  no hay sistema de atributos que alterar); `equipable` = la categoría tiene slot (todas las vendibles); `mobilityType` = **no aplica**
  (no hay movilidad del jugador); `brand` = **campo nuevo opcional** `GarmentDef.brand`, mostrado en la ficha. Sin cambio de
  `SAVE_VERSION`: el guardado ya sólo guarda ids.
- **Marcas ficticias:** el juego no tiene marcas de producto; se inventan dos propias de Decathlon, sin marcas reales:
  «Trazo» (running y trail) y «Ondra» (montaña y exterior). Sólo en prendas nuevas de Decathlon.
- **Expositores:** percheros (`RACKS`) nuevos sobre tiles de sectores que ya tienen muebles (montaña, calzado, accesorios), alcanzables,
  fuera de pasillos, colas y cajas. Sin arte nuevo: un perchero es un tile interactuable sobre un mueble que ya existe.
  Balones, mancuernas y bicis siguen siendo decorado: no se les da afordancia porque no hay nada que vender (CLAUDE.md).
- **UX de compra:** la de LV-05, sin cambios: perchero → lista filtrada → ficha (nombre, marca, descripción, precio) → PROBAR / COMPRAR /
  CANCELAR. Compra directa, sin cesta. También en la caja (`shop-decathlon`).
- **Confirmación:** la ficha es la confirmación (precio a la vista, COMPRAR explícito). `PICK_LOCK_MS` impide que un doble toque o
  la E repetida compren. No se añade otro modal.
- **Transacción atómica:** `buyGarment` es una función pura que devuelve el estado nuevo completo o `ok:false`; Menus lo aplica en un
  único paso síncrono y guarda. No hay estado intermedio que pueda quedar a medias.
- **Idempotencia:** rechazo por `wardrobe.includes(id)` (no se puede comprar dos veces la misma prenda) + bloqueo de toque del menú.
  Recargar: la compra ya está guardada en el armario, así que repetirla se rechaza.
- **Persistencia:** `wardrobe` y `paid` en el guardado de LV-02 (ranuras). Ids nuevos compatibles con partidas viejas.
- **Ropa equipable:** slots de `CATEGORIES`; uno por slot; se ve en el avatar en las 4 direcciones (HumanArt; las gafas no se pintan
  de espaldas, como ya pasa); se equipa en el armario de casa.
- **Bicicletas:** **dependencia no resuelta.** No hay bici del jugador. No se venden bicis ni se crea su afordancia.
- **Movilidad:** **dependencia no resuelta** (sin bici propia no cambia velocidad, coste de viaje ni metro).
- **DEC-04:** no existe. Contrato esperado: la caja cobra la cesta una sola vez con un id de transacción; el perchero sólo reserva.
  Hoy la compra se cobra al pulsar COMPRAR (perchero o caja) → integración NO VERIFICADO.
- **Sin cobro doble:** ver idempotencia.
- **Stock:** infinito. No se agota ni se repone (DEC-02 no interviene).
- **Precio:** fijo por línea, con el factor de reputación del barrio que ya existe. Sin IVA aparte (precio final), sin ofertas,
  sin descuento por demanda.
- **Estadísticas:** prendas cosméticas, sin stats.
- **Formato de evidencia:** tabla al final de este archivo (caso, pasos, esperado, obtenido, estado, notas).

## Plan

1. **Catálogo:** 5 prendas deportivas nuevas en categorías dibujables (cortavientos, malla, zapatillas de trail, gorra, gafas de sol
   deportivas), `brand` opcional mostrado en la ficha, en el stock de Decathlon con precio < 30 €.
2. **Expositores:** 2 o 3 percheros nuevos (chaquetas de montaña, gorras y gafas en accesorios) en tiles válidos.
3. **Flujo:** sin cambios en la compra (LV-05). Sólo la marca en la ficha.
4. **QA:** `scripts/check-decathlon-sport.ts` (ejecuta `buyGarment`: cobro exacto, una vez, sin saldo nada, armario, filtros de
   perchero, ids únicos, slot no nulo) + build + `npm run check` + navegador (probar, comprar, recargar).

## Implementación (Fases 2–5)

| Archivo | Cambio |
| --- | --- |
| `src/data/retail.ts` | `GarmentDef.brand?` (marca ficticia); 5 prendas nuevas: `cortavientos-trazo` (chaqueta, Trazo, 19,99 €), `polar-ondra` (chaqueta, Ondra, 24,99 €), `zapatilla-trail-trazo` (zapatillas, Trazo, 29,99 €), `gorra-running-trazo` (gorro, Trazo, 6,99 €), `gafas-deporte-ondra` (gafas de sol, Ondra, 12,99 €), en el stock de `decathlon` |
| `src/scenes/Menus.ts` | La ficha antepone la marca al título («Trazo · Chaqueta cortavientos · €19,99») sólo si la prenda la tiene |
| `src/data/decathlon.ts` | Percheros «Chaquetas de montaña» (40,6, Montaña hombre) y «Gorras y gafas» (58,17, Accesorios), sobre puntos de mirar de su sección; las zapatillas de trail salen en el perchero «Zapatillas» ya existente |
| `scripts/check-decathlon-sport.ts` (nuevo) + `package.json` | Catálogo, marcas, percheros (punto del suelo, transitable, fuera de pasillo/cola/caja, alcanzable) y cobro real con `buyGarment` |

Sin cambios en `Retail.buyGarment`, guardado (`SAVE_VERSION` 5), HUD, cámara ni arte. Corrección 1/2: el primer tile de «Chaquetas de
montaña» (40,8) no estaba sobre un punto del suelo, como exige check-economy; se movió a (40,6).

## Fase 6 · Evidencia

Navegador: Chrome vía DevTools, `localhost:5199`, escritorio 958×888 y móvil emulado 390×844 (DPR 3, táctil). Teléfono físico: no disponible.
Ranura 3 respaldada y restaurada tras cada pasada (día 26, 10:15, €107,50).

| Caso | Pasos | Esperado | Obtenido | Estado | Notas |
| --- | --- | --- | --- | --- | --- |
| Catálogo y ficha | Perchero «Chaquetas de montaña» → cortavientos | Nombre, marca, descripción, precio | Lista: cortavientos €19,99, polar €24,99; ficha «Trazo · Chaqueta cortavientos · €19,99» con descripción | PASS | `COMPRAS-DEC03/01-lista-chaquetas.png`, `02-ficha-cortavientos.png` |
| Saldo suficiente | COMPRAR cortavientos | Descuenta una vez, entrega, guarda | €107,50 → €87,51 (−19,99); armario `['cortavientos-trazo']`; `paid` 19,99 | PASS | `03-compra-cortavientos.png` |
| Saldo insuficiente | Dinero a 1 € → COMPRAR gafas | Rechazo sin efectos | «No te llega: cuesta €12,98»; cartera y armario idénticos | PASS | |
| Cancelación / PROBAR | PROBAR y Esc | Sin cobro ni entrega; aspecto restaurado | aspecto cambia y vuelve; dinero, armario y `paid` sin cambios | PASS | |
| Doble clic en COMPRAR | Doble E sobre COMPRAR de la gorra | Una transacción | un cobro de €6,98 | PASS | además `PICK_LOCK_MS` (check-menu) |
| Doble compra / reentrada | Comprar otra vez la cortavientos | Rechazo | «Ya tienes una igual»; dinero igual | PASS | idempotencia por armario |
| Persistencia | Comprar → guardar → recargar → Continuar | Compra, armario y dinero intactos | €87,51 y `['cortavientos-trazo']` tras recargar | PASS | |
| Inventario (id estable) | Leer armario y guardado | Id de `GarmentDef` | `cortavientos-trazo` en armario y en el guardado | PASS | |
| Equipamiento | Cortavientos + gorra en el avatar | Se ven; uno por slot | chaqueta naranja y gorra blanca visibles | PASS | `05-avatar-abajo.png`; comprar no equipa (se equipa en el armario, LV-05) |
| Zapatillas de trail | Perchero «Zapatillas» | Aparecen | «1. Zapatillas de fútbol sala / 2. Zapatillas de trail» | PASS | |
| Móvil 390×844 (emulado) | Abrir perchero | Menú legible sin pisar HUD | menú completo, HUD arriba, E/VOLVER abajo libres | PASS | `07-movil-390x844-perchero.png` |
| Teléfono físico | — | — | no disponible | NO VERIFICADO | |
| Bicicletas / movilidad | — | Sólo si hay sistema | no hay bici del jugador; no se venden ni se crea afordancia | NO VERIFICADO | dependencia documentada |
| DEC-04 (cajas) | — | Sin cobro doble | DEC-04 no existe; contrato esperado en Fase 1 | NO VERIFICADO | |
| Stock | — | Según definición | infinito (`unique` no usado) | PASS | definición: sin agotarse |
| Precio | Comparar mostrado y cobrado | Fijo × factor del barrio | €19,99 → €19,97 según la reputación del barrio (MAP-07); cobrado = mostrado | PASS | |
| Errores JS | Listeners `error`/`unhandledrejection` | 0 | 0 | PASS | |
| No regresión | `npm run check` | exit 0 | exit 0, 463 s, 2575 líneas | PASS | incluye check-economy, check-menu, check-resale, check-avatar, check-persistence, check-save-torture |

Comandos: `npm run build` exit 0. Checks dirigidos tras la corrección, todos exit 0: check-economy («OK: compras, céntimos, tarjeta…
percheros y probador…»), check-decathlon-sport («OK · decathlon-sport: 5 prendas Trazo/Ondra, 5 percheros (2 nuevos) y cobro único y
exacto»), check-decathlon, check-interaction, check-store-knowledge, check-menu, check-garments, check-resale, check-avatar,
check-persistence, check-save-torture, check-uniform. `npm run check` completo (cadena ejecutada con bash): exit 0, 463 s, 2575 líneas.
