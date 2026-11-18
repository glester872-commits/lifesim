# MET-01 · Rediseño visual de las estaciones de metro

Modo BALANCED. Rama `met-01-estaciones` (desde `dfea0f9`). Sin commit.

## Fase 1 · Estado inicial

- Ruta `C:\Users\glest\Documents\lifesim`; `git status` y `git diff` iniciales vacíos.
- HUD móvil (ALPHA-09): sin constante de versión; el rediseño no toca HUD.

## Referencias inspeccionadas (`design/metro/`, 6 fotos, sin tocar)

`OIP.webp`, `OIP (2).webp`: andén con tren blanco de franja azul y frontal rojo; bóveda de azulejo blanco; cenefa azul con placa del
nombre («Manuel Becerra»); banco metálico contra el muro; suelo de baldosa clara; franja amarilla de seguridad. `OIP (1).webp`:
muro crema con placa azul «Centenario», gran panel de anuncio enmarcado, rodapié oscuro, franja amarilla y foso de vía. `OIP (3).webp`:
andén moderno, baldosa grande clara, franja amarilla gruesa. `OIP (4).webp`: carteles colgados de dirección (verde/azul), «Salida»,
tiras de fluorescentes, pilares. `OIP (5).webp`: anuncios enmarcados en serie, señal verde de salida, pilar con cinta amarilla y negra,
franja táctil oscura junto al borde.

## Auditoría

| Pieza | Dónde | Estado |
| --- | --- | --- |
| Generador común de andén | `data/locations.ts:269` `platform()` (15 filas de suelo); instancias `vallesco-station` :392, `ribera-station` :416, `cuatro-rios-station` :441, `velaria-station` :451, `puerta-central-station` :461, `decathlon-station` :471, `puerta-central-l3-station` :481; Arena, Campo Alto, Casco Antiguo, Luna en sus archivos de distrito | EXISTE (una sola plantilla: identidad de red) |
| Red | `data/transit.ts:40` `LINES`, `:45` `STOPS` | EXISTE |
| Tiles | `world/tiles.ts`: `W` muro (sólido), `q` andén/borde de foso (sólido), `R` vía (sólida), `y` borde de andén (transitable), `t`/`f` suelo (transitable) | EXISTE |
| Dibujo | `world/TextureFactory.ts`: `drawWall` :74, `drawQuay` :95, `drawRail` :105 (traviesas cada 8 px fijas), `drawPlatformEdge` :116 (franja ámbar de 1 px, sin variantes), `drawMetroSign` :136 («METRO» ámbar sobre noche) | A MODIFICAR |
| Props | `TextureFactory`: banco :829, sign :831, metro-sign :840, line-map :841, poster :842, torno :853; máquina de billetes | REUTILIZABLES |
| Tren | `drawCar` :389, `entities/Train.ts:30` | fuera de alcance (no cambia) |
| Luz | `world/Lighting.ts:32`: el andén no sigue día/noche (QA-06), ambiente fijo `#dbe7f2` | no se toca |
| Zoom | `config/constants.ts:8` `CAMERA_ZOOM` 2; `ZOOM_FINE` 1,1 (ALPHA-09) | no se toca |

Antes (zoom real 2, escritorio 958×888): `MET-01/antes-vallesco.png`, `MET-01/antes-puerta-central.png`. Problemas: muro de ladrillo gris
oscuro y plano; cartel genérico «METRO» (el andén no dice su nombre); foso de vía de 3 filas liso, sin relieve; franja de borde de 1 px,
casi invisible; suelo correcto pero frío; las 10 estaciones son idénticas.

## Fase 1 · Definiciones previas

- **Estaciones afectadas:** todas (comparten `platform()` y las texturas), sin variar su trazado. **Referencia:** `vallesco-station`
  (la central de la red y la más usada) y `puerta-central-station` (correspondencia L2/L3).
- **Modelo de estación:** sin cambios de datos persistidos. `{ stationId = id de location, name = name de location, lines = transit.STOPS,
  platforms/tiles = rejilla de platform(), props = la lista de platform(), signage = nombre de la parada }`. Nada de esto se guarda:
  compatible con LV-02 y LV-07 sin migración.
- **Reutilizable:** `drawWord`, `sprinkle`, `px`, `shade`, PALETTE, banco, tornos, máquina, carteles de plano y anuncios.
- **Rediseño (modificar funciones existentes):** `drawWall`, `drawRail`, `drawPlatformEdge`, `drawMetroSign` y el suelo `t`.
- **Estilo:** pixel art del juego (16 px/tile, sin suavizado, colores de PALETTE), detalle medio; ruido determinista, no recuadros alternos.
- **Perspectiva:** cenital 3/4 del juego (muro visto de frente arriba, suelo cenital).
- **Pavimento:** baldosa clara grande (2×2 tiles lógicos por pieza, junta fina), con variación de tono por ruido determinista para que no
  haga lunares cada 2 tiles.
- **Franja amarilla:** la fila `y` (borde transitable): 3 px de amarillo a 1 px del canto + 2 px de franja táctil oscura con puntos.
- **Vía/espera:** foso oscuro (balasto) con dos raíles metálicos y traviesas con espaciado variable; el andén, claro y cálido.
- **Muros:** azulejo crema/blanco (≈70 %), cenefa azul arriba (≈15 %), rodapié oscuro (≈15 %); igual en toda la red.
- **Cartel de estación:** placa azul con letra blanca y el **nombre de la parada** (no «METRO»), con `drawWord`; en español, tal cual el
  nombre de la estación.
- **Paneles y anuncios:** los `poster` y `line-map` existentes.
- **Mobiliario:** los existentes (banco, papelera si existe, tornos, máquina), sin cambiar tamaño ni cuerpo de colisión.
- **Identidad de red:** igual en todas; varía el nombre de la placa (y, si sobra, el color de la cenefa por línea L2/L3).
- **Zoom real:** `CAMERA_ZOOM` 2; capturas antes/después a ese zoom y en la misma posición (`teleport(estación, {11,10}, 'up')`).
- **Borde seguro:** la fila `y` (transitable) es la última pisable; `q` y `R` siguen sólidos.
- **Vías no peatonales:** no cambia la solidez de ningún char; los checks de metro/colisiones lo vigilan.
- **Evidencia:** carpeta `MET-01/` y tabla al final de este archivo.

## Pendiente de autorización (arte nuevo)

Faltan en el código y requieren **autorización** antes de dibujarlos (procedurales, sin archivos binarios): (1) cenefa azul con placa de
nombre por estación (necesita que el cartel reciba el nombre: un dato por estación); (2) rodapié oscuro del muro; (3) tiras de
fluorescentes en el techo; (4) pilares con cinta amarilla y negra. Lo demás es modificación de funciones de dibujo existentes.

**Autorizado por el usuario (17/11/2026):** placa azul con el nombre, rodapié oscuro, fluorescentes y pilares con cinta amarilla y negra.

## Implementación

| Archivo | Cambio |
| --- | --- |
| `src/config/constants.ts` | 3 colores nuevos en PALETTE: `metroBlue`, `metroCream`, `metroTube` (el resto, reutilizados) |
| `src/world/tiles.ts`, `src/types/game.ts` | chars nuevos sólo para el andén: `w` (muro, sólido, `wall: true`) y `p` (suelo, transitable); `isWall()`; prop `metro-pillar` (cuerpo en su fila base); `metro-sign` con una variante por nombre |
| `src/world/Surfaces.ts`, `src/world/LocationBuilder.ts` | materiales `metroWall` (azulejo crema a matajunta, cenefa azul, rodapié, fluorescentes en la fila de techo), `metroFloor` (baldosa grande 2×2 con tono por pieza, sin damero) y `track` (balasto, raíles con brillo, traviesas de hueco y tono variables); las comprobaciones `=== 'W'` pasan a `isWall` |
| `src/world/TextureFactory.ts`, `src/world/paint.ts` | borde `y` (canto, 3 px de amarillo, banda táctil con botones); placa azul con letra blanca por estación; pilar con cinta amarilla y negra; glifos nuevos para los nombres |
| `src/data/transit.ts`, `src/data/locations.ts` | `STATION_SIGNS`/`stationSign(id)` desde `STOPS`; `platform()` usa `w`/`p`, coloca la placa con el nombre y 2 pilares en las esquinas sin salida (1,9) y (20,9) |

Corrección 1/2: un import sin extensión `.ts` rompía los checks que cargan con node (Vite sí lo resolvía).
Sin archivos binarios, sin cambios de solidez de ningún char existente, sin tocar cámara, zoom, iluminación, HUD ni el tren.

## Fase 4 · Evidencia

Navegador: Chrome vía DevTools, `localhost:5199`, escritorio 958×888, zoom real del juego (`CAMERA_ZOOM` 2). Misma posición antes y
después: `teleport(estación, {11,10}, 'up')`, 12:00. Ranura 3 respaldada y restaurada.

| Estación | Caso | Esperado | Obtenido | Estado | Notas |
| --- | --- | --- | --- | --- | --- |
| Vallesco | muro | azulejo crema, cenefa azul, rodapié | sí; fluorescentes en la fila de techo | PASS | `MET-01/antes-vallesco.png` → `despues-vallesco.png` |
| Vallesco | señalética | placa azul con el nombre | «VALLESCO» en blanco sobre azul (antes «METRO» genérico) | PASS | |
| Vallesco | suelo | baldosa grande clara, sin lunares | baldosa beige 2×2 con tono por pieza | PASS | visual-qa: retícula regular, sin lunares |
| Vallesco | borde seguro | franja amarilla + táctil, legible | franja amarilla gruesa con banda táctil (antes 1 px ámbar) | PASS | |
| Vallesco | vía | foso con raíles, distinto de la espera | balasto oscuro, raíles con brillo, traviesas variables | PASS | |
| Vallesco | mobiliario | pilares a escala, sin estorbar | 2 pilares con cinta en las esquinas sin salida | PASS | check-prop-bodies, check-world |
| Puerta Central | identidad de red | igual que Vallesco con su nombre | «PUERTA CENTRAL» cabe en la placa; resto igual | PASS | `antes-puerta-central.png` → `despues-puerta-central.png` |
| todas | colisiones / vía no peatonal | ningún char cambia de solidez | `w` sólido, `p` y `y` transitables, `R`/`q` sólidos | PASS | check-save-torture «nada en la vía», check-world |
| todas | rutas NPC | sin NPC en vías, nadie atrapado | check-metro-demand 8706 viajes OK; check-world todo alcanzable | PASS | |
| todas | metro funcional (LV-07) | sin regresión | check-metro, check-metro-transfers PASS | PASS | |
| Puerta Central | rendimiento | sin caída | 60 fps, peor frame 16,9 ms, `over` vacío | PASS | escritorio |
| — | pixel art / nitidez | sin suavizado | check-pixel-scale, check-art OK; visual-qa PASS | PASS | |
| — | día/noche (QA-06) | el andén no sigue el cielo | sin cambios en Lighting | PASS | |
| — | móvil 390×844 / teléfono | sin regresión de HUD | no probado (no cambia HUD) | NO VERIFICADO | |
| — | LV-01 (7 días) | — | no cerrado | NO VERIFICADO | rutas NPC y rendimiento cubiertos por checks |

Comandos: `npx tsc --noEmit` 0; `npm run build` OK; checks dirigidos exit 0 (check-art, check-hd-cache, check-layers, check-prop-bodies,
check-pixel-scale, check-shading, check-metro, check-metro-transfers, check-metro-demand, check-concourse, check-world, check-map,
check-regression, check-interaction, check-save-torture). Cadena completa: **147 de 147 OK**, 398 s, 2566 líneas.

Notas de visual-qa (menores): el bloque amarillo de Puerta Central es la escalera de correspondencia que ya existía; las barras negras
delante del tren son los huecos de puertas abiertas, no pilares. Pendiente opcional: color de cenefa por línea (L2/L3); proporción
del azulejo (≈62 %, por debajo del 70 % orientativo).

## Ciclo 2 · pendientes cerrados

| Caso | Esperado | Obtenido | Estado | Notas |
| --- | --- | --- | --- | --- |
| Glifos de las placas | un nombre sin glifo hace fallar un check | `check-art` recorre `STATION_SIGNS` con `canSpell` y nombra el glifo que falta | PASS | |
| Cenefa por línea | color de la línea como dato | `TransitLine.wall`: L2 → `w` azul, L3 → `x` verde (`metroGreen`); placa del mismo color; sin `if` por id | PASS | `MET-01/despues-puerta-central-l3.png` (verde), `despues-vallesco.png` (azul) |
| Proporción del muro | ≈70 % azulejo | 1 px cenefa + 1 filete, 9 px azulejo, 2 rodapié (≈69 %) | PASS | |
| Móvil 390×844 (emulado) | andén legible, HUD sin regresión | andén entero, «VALLESCO» legible, joystick y E sin tapar; 60 fps estable (48 sólo en la primera lectura, al cargar) | PASS | `despues-vallesco-movil.png` |
| Teléfono físico | — | no disponible | NO VERIFICADO | requiere el móvil del usuario |
| LV-01 (semana de 7 días) | — | ticket aparte | NO VERIFICADO | rutas y rendimiento cubiertos por checks |

Comandos del ciclo 2: `tsc` 0; build OK; check-art, check-metro-transfers, check-world, check-save-torture, check-prop-bodies OK; cadena
completa **147 de 147 OK** (532 s).
