# LOC-01 · Tres tiendas de barrio con interior

## Auditoría previa

- **Campo Alto**: Café Campo Alto, Taller Biciclo (CA-03) y Panadería Cuatro Hornos (CA-04). El resto, portales de vecinos.
- **Luna**: Bar Luna Llena y Abierto Toda la Noche. `lu-horno`, `lu-lavanderia` y `lu-locutorio`, sólo fachada (MAP-EXP-01).
- **Casco Antiguo**: frutería del mercado, Taberna La Lonja (CAS-06) y Anticuario Ventura (CAS-06b). `cas-horno`,
  `cas-ultramarinos`, discos, encuadernación y churrería, sólo fachada.
- LIFE-02 no existe. HOSP-01 sólo afecta a Vallesco.

## Ubicaciones

| Local | id | Barrio | Fachada | Puerta / nodo | Horario |
|---|---|---|---|---|---|
| Ultramarinos Esquina | `ca-ultramarinos` | Campo Alto | antigua `ca-res-2` (Calle del Campo 6), estilo `grocer`, [8,2,7,7] | x 11 → `ca-n11` | 9–21; domingo 10–14 |
| Horno de Luna | `lu-horno` | Luna | `lu-horno` [36,2,4,7] | x 37 → `lu-n37` | 22–7 (cruza medianoche) |
| Ultramarinos Mayor | `cas-ultramarinos` | Casco Antiguo | `cas-ultramarinos` [22,2,5,7] | x 24 → `cas-n24` (nuevo nodo en NORTH: 21, 24, 29) | lunes a sábado 9–20; domingo cerrado |

Decisiones: en Campo Alto no había nada que dependiera de `ca-res-2` / `CA_RES_2_ENTRANCE` salvo su LINK y el lugar
`res-ca-2` de `places.ts`, que se borró (Campo Alto queda con dos portales de vecinos con punto: `res-ca-1`, `res-ca-3`).
Estilo `grocer` existe y está permitido en el distrito `residential`.

## Sistemas reutilizados

- `shopRoom` (data/cuatroRiosVenues.ts): planta pequeña con mostrador, caja (`terminals`), STAFF/TILL/QUEUE/BROWSE.
- Cobro: `Commerce.purchase` desde la caja de la planta; sin cobro nuevo, sin items nuevos, sin cambios en GameState/SaveSystem.
- `cashier` / `customer` para perfiles de población; `placeForInterior` por id del interior = id del lugar.
- Catálogos: `supermarket-till` (existente) en Campo Alto; nuevos `lu-horno-mostrador` (bread, croissant, pastry,
  coffee, water; precios ≤ `cafe-counter`) y `cas-ultramarinos-mostrador` (groceries, bread, sandwich, water,
  chocolate, chips; sin fruta), sólo con ids que ya venden otros catálogos.

## Archivos modificados

- src/data/campoAlto.ts, src/data/campoAltoVenues.ts
- src/data/luna.ts, src/data/lunaVenues.ts
- src/data/cascoAntiguo.ts, src/data/cascoAntiguoVenues.ts
- src/data/places.ts, src/data/catalogs.ts, src/data/streets.ts (trip `errands` de Campo Alto al ultramarinos, 9:30–20:30)
- scripts/check-campo-alto.ts, check-campo-alto-panaderia.ts, check-campo-alto-taller.ts (puertas 4→5)
- scripts/check-luna.ts (puertas 3→4, ida y vuelta, caja y horario del horno; fuera de la lista de sólo fachada)
- scripts/check-casco-antiguo.ts (2 asserts 4→5), check-casco-anticuario.ts (4→5)

## Actividades

Entrar, mirar (puntos BROWSE) y comprar en la caja. Dependiente detrás del mostrador y clientes según franja.

## Pruebas

Resultados del orquestador (gate) y de la QA de juego en navegador, con una partida aislada nueva.

| Prueba | Resultado |
|---|---|
| npm run build | PASS (exit 0) |
| Checks de los barrios (campo-alto, -panaderia, -taller, luna, casco-antiguo, -anticuario, …) | PASS (exit 0) |
| Cadena completa (156 comandos) | PASS salvo check-regression, que ya fallaba en la base a5ecb3d (comprobado con stash) |
| check-player-stall | corregido en el ciclo 1: el Tablón de Campo Alto trae 5 carteles (el nuevo, el horario del Ultramarinos Esquina) |
| check-npc-diversity | corregido en el ciclo 1: dependientes propios dependiente-caultra, dependiente-luhorno y dependiente-casultra en CLERKS |
| Campo Alto, lunes 11:00 | PASS: desde la acera (11,10) se camina a la puerta y se entra con E; interior con cajero, cliente y caja; pan €120 → €119,10 con un solo cobro, inventario {bread:1}; salida por la puerta a la calle |
| Luna, 23:35 | PASS: puerta en (37,8.5), se entra con E, roomOpen=true; pan €1, cruasán €1,50, napolitana €1,80, café con leche €1,60, agua €1,10; cruasán €119,10 → €117,60; a mediodía roomOpen=false, la caja dice «Vamos cerrando: ya no se cobra nada más» y el dinero no cambia; salida a la acera (37,10) |
| Casco Antiguo, lunes 19 abr 11:00 | PASS: desde (24,12) se camina a la puerta y se entra; agua €0,70 (€117,60 → €116,90); domingo 25 abr 11:00 roomOpen=false, mismo mensaje y sin cobro; salida a la acera (24,10) |
| Persistencia | PASS: save.save(), recargar y Continuar conserva €116,90 e inventario {bread:1, croissant:1, water:1}, sin duplicados |
| Consola | PASS: sin errores |
| Cierre del Ultramarinos Esquina (navegador) | PASS: lunes 22:00 roomOpen=false, la caja dice «Ya no se atiende: no se cobra nada más» y el dinero sigue en €120; domingo 15:00 cerrado, «Abre mañana a las 09:00», sin cobro; domingo 11:00 abierto |
| QA visual (visual-qa) | PASS en 6 capturas contra Estética de CLAUDE.md y §10 de ART_BIBLE.md: cada local se reconoce por fachada e icono. Capturas loc01-{campoalto,luna,casco}-{ext,int}.png en `C:\Users\glest\AppData\Local\Temp\claude\1cd68afec0b9951e\bd56eae1-9b20-4f82-9c8c-ddc89ecf6478\scratchpad\` (temporales, no van en el repo). Observaciones menores no bloqueantes en Riesgos |
| Móvil 390×844 con touch | PASS: la caja del Horno de Luna se lee entera con iconos y precios; E / ELEGIR / VOLVER no se solapan con el HUD (loc01-luna-int-mobile.png, misma carpeta temporal) |
| QA de rendimiento (optimizer) | PASS, calidad high, ventana 958×888, presupuesto de src/config/budgets.ts: campo-alto 53-59 fps, 319-325 objects; ca-ultramarinos 59-60 fps, 179 objects; luna 54-59 fps, 13-15 agents, 313-361 objects; lu-horno 55-60 fps, 172 objects; casco-antiguo 57-60 fps, 18-21 agents, 563 objects; cas-ultramarinos 60 fps, 179 objects. over [] en todos; heap estable 263-325 MB; bundle sin cambio medible (sólo datos). El pico de vehicles 26/24 en 'district' al crear la partida no tiene que ver con LOC-01 |
| Gate final | npm run build exit 0; cadena completa scripts.check (156 comandos, ~3094 líneas): sólo falla check-regression, que ya fallaba en la base a5ecb3d (comprobado con git stash) |

## git diff --stat

```
 scripts/check-campo-alto-panaderia.ts |  4 ++--
 scripts/check-campo-alto-taller.ts    |  2 +-
 scripts/check-campo-alto.ts           |  3 ++-
 scripts/check-casco-anticuario.ts     |  4 ++--
 scripts/check-casco-antiguo.ts        |  6 ++++--
 scripts/check-luna.ts                 | 18 +++++++++++++-----
 scripts/check-player-stall.ts         |  2 +-
 src/data/campoAlto.ts                 | 10 +++++-----
 src/data/campoAltoVenues.ts           | 18 +++++++++++++++++-
 src/data/cascoAntiguo.ts              | 11 ++++++-----
 src/data/cascoAntiguoVenues.ts        | 17 ++++++++++++++++-
 src/data/catalogs.ts                  | 12 ++++++++++++
 src/data/luna.ts                      | 11 ++++++-----
 src/data/lunaVenues.ts                | 14 ++++++++++++++
 src/data/npcs.ts                      |  3 +++
 src/data/places.ts                    | 10 ++++++++--
 src/data/streets.ts                   |  2 ++
 17 files changed, 114 insertions(+), 33 deletions(-)
 (+ LOC-01.md sin versionar)
```

## Compatibilidad

- Rastro: no se tocan anclas (45,9), (50,9) ni rutas `CAS_RASTRO_BROWSE`; el nodo nuevo `cas-n24` está en la fila 10, sin props.
- Metro: sin cambios en estaciones, tarifas ni minutos.
- Portales: los generan los `BuildingDef` con `enter`; los interiores vuelven al spawn de su fachada.

## Riesgos y pendientes

- Quitar `res-ca-2` reduce los hogares de Campo Alto (12 de capacidad); scripts que cuenten residencias podrían notarlo.
- El trip de recados de Campo Alto llega hasta las 20:30 también en domingo (el ultramarinos cierra a las 14): sólo camina hasta la puerta.
- `cas-n24` inserta un nodo en la cadena norte del Casco: revisar check-gran-rastro (limpieza 21→m21) y conectividad.
- Clientes del Horno de Luna de 22 a 7 dependen del soporte de bandas que cruzan medianoche (como lu-abierto).
- No se comprobó con captura que el NPC cajero desaparezca del dibujo con el local cerrado; sí que, cerrado, la caja no cobra.
- El recado vecinal de los domingos por la tarde va al ultramarinos de Campo Alto aunque esté cerrado.
- Observaciones visuales menores (no bloquean): los dos ultramarinos comparten la misma planta interior; las estanterías
  de madera parecen de librería; la fila de estantes de pan del horno es repetitiva; el glifo del rótulo del horno no se
  lee como panadería; algún prop junto a la cajera del horno parece suelto.
- No se probaron las calidades medium ni low.
