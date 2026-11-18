# MET-03 · Variaciones entre estaciones de metro

Modo BALANCED. Rama `met-03-variaciones` (desde `682e738`, MET-02 sobre MET-01). Sin commit.

## Fase 1 · Estado inicial y referencias

- `git status`/`git diff` iniciales vacíos. HUD móvil sin cambios en este ticket.
- Referencias `design/metro/` (6 fotos, inspeccionadas en esta sesión): la red comparte cenefa con placa del nombre, franja amarilla y
  tipografía; cada estación cambia el azulejo (blanco, crema), los anuncios (paneles enmarcados distintos) y el mobiliario.

## Auditoría

- **12 andenes**, todos de `platform()` (`data/locations.ts:270`): `vallesco-station`, `ribera-station`, `cuatro-rios-station`,
  `velaria-station`, `puerta-central-station`, `decathlon-station`, `puerta-central-l3-station`, `decathlon-l3-station`, `arena-station`,
  `campo-alto-station`, `casco-antiguo-station`, `luna-station`.
- **Igual en todos:** trazado de 22×15, muro `w`/`x` (MET-01), suelo `p`, 2 posters, 2 planos de línea, placa, 2 pilares, 4 bancos,
  3 postes de señal, 3 tornos, máquina de billetes, 1 poster del vestíbulo, ambiente `#dbe7f2`. **Cambia sólo:** nombre de la placa,
  color de la línea (L2 azul / L3 verde) y NPC/guardias.
- **Antes:** `MET-03/antes-arena.png`, `antes-casco-antiguo.png`, `antes-luna.png` (+ Vallesco y Puerta Central en `MET-01/`): clones.
- **Props reutilizables:** `bench`, `bin` (papelera, interactiva), `planter`, `plant`, `sign`, `line-map`, `poster` (una sola variante),
  `metro-pillar`, `metro-sign`.

## Definiciones previas

- **Estándar:** andén de una línea en barrio residencial (Vallesco, Ribera, Cuatro Ríos, Velaria, Campo Alto, Luna). Varía el azulejo
  y la combinación de anuncios.
- **Amplia/importante:** correspondencia L2/L3 o gran afluencia: Puerta Central (L2 y L3), Polígono Norte · Decathlon (L2 y L3), Arena
  (estadio, aforo 200). Más anuncios y planos de red, papeleras extra y un rótulo secundario («Correspondencia L3» / «L2»).
- **Identidad particular:** Arena (estadio del Halcón: carteles del club, rótulo «Estadio»), Casco Antiguo (barrio histórico:
  azulejo ocre tradicional y rótulo «Casco histórico»).
- **Modelo de datos** (`data/stationStyles.ts`, sólo datos, no se guarda): `{ stationId, type: 'estandar'|'amplia'|'identidad',
  tile: tono del azulejo, posters: variantes de anuncio, extraProps: props extra en tiles seguros, subSign?: rótulo secundario }`.
  Compatible con LV-02 (nada persistido) y LV-07 (no toca líneas ni portales).
- **Determinismo:** tabla fija por `stationId` (sin azar en tiempo de ejecución); el reparto de anuncios sale de un hash del id. Igual
  tras cargar partida.
- **Variedad perceptible:** cada estación distinta de cualquier otra en al menos 2 ejes visibles (azulejo, anuncios, mobiliario o
  rótulo); las de identidad, en 3.
- **Continuidad:** igual en toda la red: cenefa y placa (color de línea), tipografía, franja amarilla y táctil, pilares, tornos, máquina.
  Varía: tono del azulejo, anuncios, papeleras/maceteros, rótulo secundario.
- **Ancho, longitud y composición:** **no cambian** (las puertas del tren, los puntos de espera de NPC, los spawns y los portales dependen
  del trazado de 22×15). Props extra sólo en tiles de una lista blanca comprobada: fila del muro (anuncios, sin colisión de suelo) y
  rincones sin paso del andén y del vestíbulo, validados por los checks de alcanzabilidad y de cuerpos de props.
- **Iluminación:** sin cambios (QA-06; el andén tiene luz fija).
- **Evidencia:** tabla al final de este archivo.

## Pendiente de autorización (arte nuevo)

Faltan en el código y requieren autorización: (1) **variantes del anuncio** (`poster` tiene un solo dibujo: 4-5 anuncios ficticios
distintos, sin marcas reales); (2) **tonos del azulejo** por estación (blanco, crema, verde pálido, ocre tradicional); (3) **rótulo
secundario** (placa pequeña con texto: «Correspondencia L3», «Estadio», «Casco histórico»); (4) **carteles del club** en Arena
(colores del CD Halcones, ficticio del propio juego).

**Autorizado por el usuario (18/11/2026):** variantes de anuncio, tonos de azulejo, rótulo secundario y carteles del club.

## Implementación

| Archivo | Cambio |
| --- | --- |
| `src/data/stationStyles.ts` (nuevo) | `STATION_STYLES` de las 12 estaciones (tipo, tono, anuncios, extras, rótulo), `stationStyle(id)`, `WALL_TONES`/`WALL_CHARS` (un char de muro por tono y línea, generado a partir de los datos), `SAFE_EXTRA_TILES` y `SUB_SIGNS` |
| `src/data/locations.ts` | `platform()` aplica el muro, los anuncios, el rótulo y los extras de `stationStyle(id)`; `PLATFORM_GROUND` sin cambios |
| `src/world/tiles.ts` | TileDef de muro por tono (`tile` + `trim`); `poster` con 8 variantes y `defaultVariant: 0` (fuera del metro, el dibujo de siempre); prop `metro-subsign` |
| `src/world/Surfaces.ts` | `metroWall` lee el tono de `TILES[char].tile` |
| `src/world/TextureFactory.ts` | 7 anuncios procedurales (zapatillas, concierto, museo, refresco, ciudad, club, club-escudo) + el clásico; `drawSubSign` (techo liso bajo la caja, sin tubo) |
| `src/config/constants.ts`, `paint.ts`, `types/game.ts` | `metroTile*` en PALETTE; glifos D, H, Ó; `PropDef.defaultVariant` |
| `scripts/check-station-variety.ts` (nuevo) + `package.json`; `check-art.ts` | variedad 2/3 ejes, determinismo, trazado, lista blanca, alcanzabilidad, rótulo escribible, distancia de tonos ≥20 RGB |

Lista blanca de extras: muro (1,1) y (20,1) (cara libre junto a los planos) y suelo (3,9) y (18,9) (entre el poste y el banco, contra el muro).
Ninguno de esos tiles es puerta del tren, espera, asiento, torno, salida, máquina ni portal.

Desviación: el rótulo de correspondencia dice «CORRESPONDENCIA», y la línea de destino se indica con el color del panel (verde = L3,
azul = L2), porque «CORRESPONDENCIA L3» no cabe con la fuente 5×7. Mide 6 tiles en vez de ≤4, porque «CASCO HISTÓRICO» no cabe en 4.

Correcciones: (1/2) el check comparaba el LocationDef entero y Puerta Central lleva la escalera de correspondencia; además, los
`poster` sin variante de fuera del metro (Carmen, Ronda) volvían al dibujo clásico. (2/2, visual-qa) los tonos no se distinguían a
zoom de juego, así que se subió su croma (mínimo 22 RGB entre pares; Luna/Velaria 43); el rótulo tapaba el tubo central y ahora pinta techo liso.

## Evidencia

Chrome vía DevTools, `localhost:5199`, escritorio 958×888. Ranura 3 respaldada y restaurada (día 26, 10:15, €107,50).

| Estación | Variación aplicada | Variedad perceptible | Continuidad | Colisiones | Rutas | Estado | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Arena (identidad) | blanco, 3 carteles del club + 2 extra, «ESTADIO», 2 papeleras | sí, frente a `antes-arena.png` | cenefa, placa, franja, pilares, tornos y tren intactos | check | check | PASS | `c2-arena.png`, 59 fps |
| Casco Antiguo (identidad) | ocre, museo/ciudad, «CASCO HISTÓRICO», maceteros | sí | igual | check | check | PASS | `c3-casco-antiguo.png` (tras corrección 2: ocre, sin tubo bajo el rótulo) |
| Puerta Central (amplia) | blanco, «CORRESPONDENCIA» verde, 2 carteles extra, 2 papeleras | sí | igual (escalera de L3 intacta) | check | check | PASS | `c3-puerta-central.png`, 58–59 fps |
| Velaria (estándar) | rosa, museo/zapatillas/concierto | sí, tras la corrección 2 | igual | check | check | PASS | `c2-velaria.png` |
| Cuatro Ríos (estándar) | menta, concierto/ciudad/refresco, macetero | sí | igual | check | check | PASS | `c2-cuatro-rios.png` |
| Luna (estándar) | blanco, ciudad/concierto/museo | sí (por anuncios y tono frente a sus vecinas) | igual | check | check | PASS | `c2-luna.png` |
| Las 12 | tabla | ≥2 ejes entre cualquier par, ≥3 con identidad | — | check-station-variety, check-prop-bodies | check-world, check-metro* | PASS | determinismo verificado en el check |

| Criterio | Estado | Evidencia |
| --- | --- | --- |
| git status inicial; cambios ajenos | PASS | árbol limpio al empezar |
| Referencias | PASS | `design/metro/` |
| Definiciones previas y modelo LV-02 | PASS | arriba; nada persistido, `SAVE_VERSION` sin cambios (check-save-torture, check-metro-transfers) |
| Determinismo | PASS | check-station-variety (doble generación) |
| Tres tipos | PASS | tabla |
| Sin obstrucción | PASS | alcanzabilidad antes/después, lista blanca |
| ≥3 estaciones recorridas | PASS | 6 en navegador |
| Rendimiento | PASS | 58–59 fps en las más cargadas; 0 errores JS |
| No regresión MET-01/MET-02/LV-07 | PASS | capturas + check-metro, check-metro-transfers, check-metro-demand |
| ALPHA-09 HUD móvil | PASS (sin cambios de HUD) | no se toca la UI |
| Pixel art (QA-06/07) | PASS | visual-qa (nítido); luz sin cambios |
| Variedad «percibida» en partida de 7 días (LV-01) | NO VERIFICADO | LV-01 no cerrado |

Comandos: `npx tsc --noEmit` exit 0; `npm run build` OK; cadena completa (148 comandos uno a uno en PowerShell): **148 de 148 OK**, 270 s.

`git diff --stat`: 9 archivos, +203 −41; nuevos: `src/data/stationStyles.ts`, `scripts/check-station-variety.ts`, `MET-03.md`, `MET-03/`.

Capturas tras la corrección 2 que faltaban (evaluador): `c3-ribera.png` (cielo, L2), `c3-campo-alto.png` (arena, papelera),
`c3-decathlon-l3.png` (cielo, L3 verde, «CORRESPONDENCIA» en panel azul, 59 fps), `c3-casco-antiguo.png`, `c3-puerta-central.png`.
En todas, los tonos se distinguen y el rótulo deja el techo liso. La «V» negra y naranja es el anuncio «concierto» (dos focos que
convergen sobre una silueta con micro, `drawPoster`), no una marca. 0 errores JS. Ranura 3 restaurada.

**Veredicto (evaluador, tras completar evidencia): PASS CON RESERVAS.** Reservas: LV-01 NO VERIFICADO; desviaciones de texto y ancho del rótulo
(«CORRESPONDENCIA» sin número de línea, 6 tiles), pendientes de que el usuario las acepte.
