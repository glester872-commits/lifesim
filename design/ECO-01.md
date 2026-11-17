# ECO-01 · Compraventa de segunda mano: del Rastro a Segunda Vuelta

Reglas: `systems/Retail.ts` (`sellItem`, `resaleValue`, `resaleOffer`, `buysItem`). Datos: `data/catalogs.ts`
(puestos `rastro-*`), `data/retail.ts` (`RetailStoreDef.buysItems`, `RESALE_KINDS`). Menús: `scenes/Menus.ts`
(`openCatalog` registra el tique, `openSellItems`/`openSellItemConfirm` venden, `openBag` enseña la oferta).
Prueba: `scripts/check-eco-01.ts` (en `npm run check`, tras `check-rastro-resale.ts`).

Objetivo: que lo comprado en el Gran Rastro se pueda revender en una tienda real, con el tique de lo realmente
pagado, sin que comprar y vender sea un negocio.

## Qué se compra y quién lo recompra

| Categoría (bolsa) | Ids | Dónde se compra | Quién lo recompra |
|---|---|---|---|
| disco | `rastro-vinyl`, `rastro-vinyl-first` | `rastro-discos` | Segunda Vuelta (`vuelta`) |
| libro | `rastro-book`, `rastro-book-signed` | `rastro-libros` | Segunda Vuelta |
| coleccionable | `rastro-camera`, `rastro-camera-slr` | `rastro-camaras` | Segunda Vuelta |
| coleccionable | `rastro-pocketwatch` | `rastro-antiguedades` | Segunda Vuelta |
| coleccionable | `rastro-cartridge`, `rastro-handheld`, `rastro-figure` | `rastro-retro` | Segunda Vuelta |
| coleccionable | `rastro-badge`, `rastro-keyring` | `rastro-pequenos` | Segunda Vuelta |

Segunda Vuelta acepta `buysItems: ['rastro-*']`; la ropa sigue por `sellGarment` y no cambia. La categoría sale de
`RESALE_KINDS` (primer prefijo que encaja), no de nombres de barrio ni de tienda.

Fórmula: `resaleValue(paid) = min(40, floor(paid × 0,4), paid − 0,01)` sobre el tique más antiguo (FIFO). La venta
saca una unidad y ese tique, cobra una vez y avanza 5 minutos.

## Tique

Comprar en un puesto del Rastro (precio de lista o regateado) añade a `paidItems[itemId]` lo realmente cobrado, con
el mismo redondeo que `Commerce.checkout`. Sin tique, «Sin tique no lo quieren.».

En la bolsa, cada objeto que alguna tienda compra lleva su oferta (`resaleOffer`: primera tienda con `buysItems`
que lo acepta, mismo importe que `sellItem`):

- con tique: `disco · €12 → €4,80` (pagado → lo que dan)
- sin tique: `disco · sin tique`

La cabecera de la bolsa nombra la tienda y la calle a la que sale su local (por datos: la location con sus `racks`
y su portal de salida): «Lo de segunda mano lo recompra Segunda Vuelta (Barrio Vallesco), con tique.».

## Tu puesto del Rastro (CAS-09)

Listar en el puesto propio no aparta la unidad de la bolsa. Por eso la tienda sólo compra si quedan más unidades
que listados (`sellItem(…, reserved)`; Menus cuenta los listados de un puesto no cerrado y antes cierra el que ya
toca con `settleStall`). Si no, la opción sale deshabilitada: «Está en tu puesto del Rastro: retíralo primero.». No
se retira el listado en silencio.

## Contra el arbitraje

La recompra es siempre menor que lo pagado (también regateado) y tiene tope de 40 €. Un tique de 0, negativo, NaN o
tan bajo que su 40 % redondea a 0 no se compra. La prueba recorre todos los productos `rastro-*` y 20 vueltas de
compra y venta: el saldo final siempre es menor.

## Guardados antiguos

Una partida sin `paidItems` carga con `{}`: lo que lleve del Rastro sale como «sin tique» y no se vende. El saneado de `SaveSystem` descarta tiques dañados.

## Plan (no implementado)

- Otros comercios receptores (una librería de viejo, una tienda de discos) como entradas `buysItems` más.
- Compra de ropa usada en otros barrios.
- Tique por unidad: regalar un objeto no quita su tique (ver comentario `ponytail:` en `Menus.openCatalog`).
- Retirar del puesto entre las 15:00 y el cierre de las 17:00: hoy la unidad sigue reservada hasta `settle`.
