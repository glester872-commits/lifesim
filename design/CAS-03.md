# CAS-03 · Puestos que venden en el Gran Rastro

Datos: `data/popups.ts` (`gran-rastro` → `stalls.vendors`), `data/catalogs.ts` (`rastro-*`), `data/retail.ts`
(`rastro-vintage`, `rastro-zapatillas`), `data/items.ts` (`rastro-*`, `kind: 'gift'`) y `systems/Gifts.ts`.
Regla: `systems/PopUps.stallVendors`. Prueba: `scripts/check-gran-rastro-shop.ts`.

## Los 10 que venden

| Ancla | Zona | Familia (pieza) | Catálogo / store | Nombre |
|---|---|---|---|---|
| casco.plaza.market.01 | plaza | ropa vintage (stall-clothes) | store `rastro-vintage` | Puesto de ropa vintage |
| casco.plaza.market.04 | plaza | discos (stall-books) | `rastro-discos` | Puesto de discos |
| casco.plaza.market.10 | plaza | antigüedades (stall-junk) | `rastro-antiguedades` | Puesto de antigüedades |
| casco.plaza.market.13 | plaza | objetos pequeños (stall-junk) | `rastro-pequenos` | Puesto de chapas y llaveros |
| casco.calleMayor.stall.03 | calleMayor | zapatillas (stall-clothes) | store `rastro-zapatillas` | Puesto de zapatillas |
| casco.calleMayor.stall.07 | calleMayor | libros (stall-books) | `rastro-libros` | Puesto de libros |
| casco.calleMayor.stall.09 | calleMayor | cámaras (stall-junk) | `rastro-camaras` | Puesto de cámaras |
| casco.calleSecundaria.stall.02 | calleSecundaria | ropa vintage (stall-clothes) | store `rastro-vintage` | Perchero de ropa vintage |
| casco.calleSecundaria.stall.06 | calleSecundaria | videojuegos retro (stall-junk) | `rastro-retro` | Puesto de videojuegos retro |
| casco.calleSecundaria.stall.10 | calleSecundaria | objetos pequeños (stall-junk) | `rastro-pequenos` | Puesto de baratijas |

## Los 28 de ambientación

38 puestos − 10 que venden = 28. Su familia sigue saliendo del hash, repartida por turno entre las anclas que no
venden de cada zona (las cuatro familias siguen en las tres zonas).

- plaza (10): market.02, 03, 05, 06, 07, 08, 09, 11, 12, 14
- calleMayor (9): stall.01, 02, 04, 05, 06, 08, 10, 11, 12
- calleSecundaria (9): stall.01, 03, 04, 05, 07, 08, 09, 11, 12

## Reglas

- Horario: sólo venden mientras el Rastro está en marcha (`activePopUp`): domingos de 9:00 a 15:00, sin lluvia fuerte.
  Montando, recogiendo o fuera de horario no hay interactuable (ni E ni botón). Con el menú abierto, a las 15:00 deja
  de cobrar y dice «El Rastro vende los domingos de 9:00 a 15:00».
- Sin stock persistido ni registro de compras: los objetos se cobran con `Commerce.checkout` (de uno en uno, todo o
  nada) y la ropa con `Retail.buyGarment`.
- La prenda única (`unique`) es un stock de uno: cuando está en tu armario, no se vende otra vez (tampoco tras cargar).
- La bolsa manda: cada objeto tiene `max` 2 o 3 y comprar de más se rechaza.
- Lo que no es ropa es un regalo (`kind: 'gift'`) con su efecto en `systems/Gifts.ts`.

## Fuera (CAS-04)

Regateo, rarezas y piezas especiales; stock por puesto o por domingo; vendedores con diálogo propio.
