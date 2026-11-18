# MET-02 · Rediseño visual del tren de metro

Modo BALANCED. Rama `met-02-tren` (desde `fc7b9b9`, MET-01). Sin commit.

## Fase 1 · Estado inicial

- `git status`/`git diff` iniciales vacíos. HUD móvil (ALPHA-09): sin cambios en este ticket.

## Referencias (`design/metro/`, 6 fotos, inspeccionadas en esta sesión; sin tocar)

Tren de `OIP.webp`/`OIP (2).webp`: carrocería blanca, franja azul ancha en la mitad baja con filete, frontal rojo con parabrisas grande
oscuro, faros bajos a los lados, panel de destino luminoso ámbar sobre el parabrisas, puertas dobles con marco, ventanas oscuras
corridas, juntas oscuras entre coches. `OIP (3).webp`: modelo nuevo, blanco con franja azul oscuro, frontal gris oscuro con panel de
destino. **Logos:** el rombo rojo del operador real no se reproduce (se omite).

## Auditoría

| Pieza | Dónde | Estado |
| --- | --- | --- |
| Textura del coche | `world/TextureFactory.ts:433` `drawCar(ctx, cab)`; `CAR_W` 96 px (6 tiles) × `CAR_H` 48 px (3 tiles) | A MODIFICAR |
| Puertas | `DOOR_CENTERS` [24, 72] (2 por coche), `DOOR_TOP` 17, `DOOR_H` 28, `DOOR_LEAF_W` 6; hojas `drawDoorLeaf` que se deslizan; piloto `drawDoorLight` | A MODIFICAR (sin cambiar medidas) |
| Render | `entities/Train.ts`: 3 coches; el de cola es la cabina espejada (`setFlipX`); máscara al mapa; lee `TrainSystem` | REUTILIZABLE |
| Estados | `systems/TrainSystem.ts`: AWAY, APPROACHING, ARRIVING, STOPPED, DOORS_OPENING, BOARDING, DOORS_CLOSING (piloto parpadea), DEPARTING | EXISTE |
| Construcción | `systems/MetroSystem.ts:258/280` (`new TrainSystem`, `new Train`) | EXISTE |
| Antes | cuerpo gris azulado, franja turquesa, ventanas pequeñas, cabina = canto de 5 px sin frontal, faros ni panel | `MET-02/antes-parado.png`, `MET-02/antes-movimiento.png` (Vallesco, zoom 2) |

## Definiciones previas

- **Trenes afectados:** el único modelo del juego (3 coches), en las dos líneas (L2 y L3). **Referencia:** el de Vallesco (estación de
  referencia de MET-01).
- **Modelo de datos:** sin cambios persistidos. `{ trainId = la estación, lineId = stationLine(estación) (MET-01), length = 3 × CAR_W,
  cars = 3 (cabinas en los extremos), doors = 2 por coche en DOOR_CENTERS, front = cabina, livery = textura, states = TrainState, hitbox
  = la misma }`. Nada se guarda: compatible con LV-02 y LV-07.
- **Rediseño:** modificar `drawCar`, `drawDoorLeaf`, `drawDoorLight` (mismas medidas y posiciones de puerta); el panel de destino de la
  cabina muestra la línea («L2»/«L3», dato de `stationLine`) con una variante de textura de cabina por línea, sin `if` por id.
- **Carrocería:** 96×48 px por coche, 3 coches (= ancho actual), techo gris con rejillas, costado claro.
- **Paleta:** blanco roto/gris claro, **azul oscuro** (franja y filete), gris oscuro del frontal, negro de ventanas, ámbar del panel y
  faros; ≤ 8 tonos por textura, desde PALETTE.
- **Frontal (cabina):** morro más oscuro de ~10 px con parabrisas inclinado oscuro y brillo, faro bajo, piloto rojo, panel ámbar con el
  número de línea (glifos de `drawWord`, ≥ 5 px de alto para leerse a zoom 2).
- **Ventanas:** oscuras, corridas entre puertas, con un reflejo diagonal de 1 px.
- **Puertas:** 2 dobles por coche (las de siempre), hoja clara con ventanilla oscura y marco; se deslizan como ahora.
- **Bandas:** franja azul oscuro de ~4 px en la mitad baja + filete claro de 1 px encima.
- **Juntas:** 2 px oscuros entre coches (fuelle).
- **Direcciones:** el tren sólo se ve de costado y se mueve en horizontal; la cola es la cabina espejada (como hoy).
- **Sombras/contraste:** sombreado por bandas con `shade` (sin overlay ni multiply), sin tocar la luz del andén (QA-06).
- **Estados:** los existentes; nada nuevo que no tenga lógica detrás.
- **Puertas, longitud, hitbox, subir/bajar, sincronía:** no cambian medidas ni posiciones → la alineación con el andén y los NPC es la
  de siempre (check-metro, check-metro-transfers, check-metro-demand).
- **Zoom real:** `CAMERA_ZOOM` 2; antes/después en Vallesco, parado y entrando (escena en pausa para la captura en marcha).
- **Evidencia:** carpeta `MET-02/` y tabla al final.

**Arte:** sólo se modifican las texturas existentes del tren (sin props ni archivos nuevos); el panel y los faros son detalles dentro
de la cabina actual.

## Implementación

| Archivo | Cambio |
| --- | --- |
| `src/world/TextureFactory.ts` | `drawCar`: techo gris con rejillas; costado blanco roto sombreado por bandas; filete claro y franja azul oscuro de 4 px; ventanas negras corridas con reflejo; huecos de puerta con marco, interior gris tenue, suelo y barra; fuelle de 2 px entre coches. Cabina: morro gris oscuro, parabrisas con borde y reflejo de 2 px, faro blanco-ámbar 2×2, piloto rojo 2×2 y panel de destino con la línea en ámbar; cola: mismo morro, faro apagado, dos pilotos rojos, panel apagado sin texto. `drawDoorLeaf`: hoja clara con ventanilla, filete y franja alineados. `drawDoorLight`: ámbar con centro blanco. Una textura de cabina por línea (`train-car-cab-<línea>`) generada desde `LINES` |
| `src/entities/Train.ts`, `src/systems/MetroSystem.ts` | `Train` recibe el id de línea (`stationLine(estación).id`) para la cabina delantera; la cola usa la cabina sin texto espejada |
| `src/world/paint.ts`, `scripts/check-art.ts` | glifos «2» y «3»; check-art exige que cada id de línea se pueda escribir y quepa en el panel |

Sin cambios en `CAR_W`, `CAR_H`, `DOOR_CENTERS`, `DOOR_TOP`, `DOOR_H`, `DOOR_LEAF_W`, `TRAIN_CARS` ni en `TrainSystem`. Sin logos reales.
Corrección 1/2 (pulido tras visual-qa): cola con morro y pilotos, frontal más claro, sin ventana de 3 px, interior en puertas abiertas.

## Fase 4 · Evidencia

Navegador: Chrome vía DevTools, `localhost:5199`, escritorio 958×888, zoom 2; Vallesco (L2) y Puerta Central L3. Captura en movimiento
pausando la escena al entrar el tren. Ranura 3 respaldada y restaurada.

| Caso | Esperado | Obtenido | Estado | Notas |
| --- | --- | --- | --- | --- |
| frontal | parabrisas, faro, piloto y panel legibles | morro con parabrisas y reflejo, faro 2×2, piloto rojo, panel «L2» | PASS | `MET-02/despues-movimiento.png`, `despues-parado.png` |
| panel por línea | «L2» / «L3» según la línea | «L2» en Vallesco, «L3» en Puerta Central L3 | PASS | `despues-l3.png` |
| cola | sin texto invertido | morro con pilotos rojos, panel apagado | PASS | |
| ventanas | oscuras con reflejo | sí; sin hueco de 3 px | PASS | |
| puertas | 2 por coche, separación reconocible | marco, hoja clara; abiertas con interior gris y barra | PASS | |
| bandas | franja azul oscuro + filete | sí, alineadas en coche y hojas | PASS | |
| juntas | fuelle entre coches | 2 px oscuros | PASS | |
| sombras/contraste | moderado | sombreado por bandas; contraste aceptable con el andén | PASS | visual-qa |
| estados | llegando, parado, saliendo sin funciones falsas | estados de `TrainSystem` sin cambios; piloto de cierre más visible | PASS | |
| subir al tren | menú de destino | «LÍNEA 2 · DESTINO» al entrar por la puerta | PASS | `despues-subir.png` |
| sincronía y hitbox | puertas alineadas con el andén | medidas y posiciones intactas; check-metro, check-metro-transfers, check-metro-demand OK | PASS | |
| escala (MET-01) | proporcionado al andén y a las personas | ≈2 personajes de alto, igual que antes | PASS | visual-qa |
| logos | sin logos reales | ninguno | PASS | |
| móvil 390×844 (emulado) | — | no repetido; el HUD no cambia | NO VERIFICADO | |
| teléfono físico | — | servidor de red abierto para el usuario | PENDIENTE DEL USUARIO | |
| LV-01 | — | ticket aparte | NO VERIFICADO | |

Comandos: `tsc` 0; build OK; check-art, check-metro, check-metro-transfers, check-metro-demand, check-hd-cache, check-layers,
check-save-torture, check-world OK; cadena completa **147 de 147 OK** (433 s, 2566 líneas). visual-qa: PASS (ciclo 0), detalles
menores corregidos en la corrección 1.
