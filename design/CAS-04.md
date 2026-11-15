# CAS-04 · Rarezas, regateo y reventa en el Gran Rastro

Código: `src/systems/Rastro.ts` (reglas puras), `src/scenes/Menus.ts` (`openCatalog`, `openGarment`, `openHaggle`).
Checks: `scripts/check-rastro-rarities.ts`, `scripts/check-rastro-haggle.ts`.

## Rarezas

Cinco puestos tienen una pieza rara (`RARE_BY_VENDOR`): primer vinilo (discos), libro firmado (libros), réflex
(cámaras), figura (retro) y la cazadora de ante (vintage). Cada una sale con probabilidad 0,5 por jornada, determinista
por puesto y día (`weekStock`). Sólo se ven desde su puesto. Lo vendido se apunta en el registro de la jornada
(`RastroLedger.sold`) y queda «Agotado» hasta la siguiente, aunque se regale o se revenda.

## Moods y regateo

Sólo se regatean las rarezas disponibles, en su puesto y con el puesto abierto. Lo común y los demás vendedores no
cambian.

| Puesto  | Mood   | Rebaja máxima |
|---------|--------|---------------|
| cámaras | duro   | 5 %           |
| vintage | duro   | 5 %           |
| discos  | normal | 12 %          |
| retro   | normal | 12 %          |
| libros  | blando | 20 %          |

Ofertas: −10 %, −20 % y −30 %. El suelo es `max(0,01, round2(lista × (1 − máx)))`.
- Si la oferta es ≤ máx, se acepta: se paga `round2(lista × (1 − oferta))`.
- Si la oferta es ≤ 2·máx, hay contraoferta: se paga el suelo.
- Si es mayor, se rechaza: se paga la lista.

El precio siempre queda en [suelo, lista]. Cada mood tiene una frase por resultado.

Decisión (riesgo deliberado): −30 % con un vendedor normal o duro termina en el precio de lista. El menú lo avisa con
una frase fija, igual para todos y sin revelar el margen: «Lo que ofreces no es lo que pagas: puede aceptarlo,
contraofertar o, si pides demasiado, plantarse en el precio de lista.» Cada oferta se etiqueta con el importe ofrecido
y el porcentaje entre paréntesis («Ofrecer €31,50 (−10 %)»).

## Un intento por pieza y jornada

Al ofrecer, el precio resultante se guarda en `RastroLedger.haggled` antes de decidir y se persiste. Si te marchas o
recargas, sólo queda «Pagar €pactado». En otra jornada el registro empieza vacío. El cobro pasa por
`Commerce.checkout` o `Retail.buyGarment` con `factor = pactado / lista`; no hay otra vía de dinero.

## Reventa

Sólo se revende ropa, en Segunda Vuelta (`Retail.sellGarment`): se recibe `resaleValue(pagado)`, el 40 % de lo
realmente pagado con un tope de 40 € y siempre menos de lo pagado. Por eso regatear y revender no deja ganancia. La
cazadora revendida sigue agotada esa jornada. La reventa de las rarezas que son regalos queda pendiente.
