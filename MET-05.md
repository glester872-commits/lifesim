# MET-05 · Iluminación y atmósfera del metro

Modo BALANCED. Rama `met-05-iluminacion` (desde `99a16f2`, MET-04). Sin commit.

## Fase 1 · Estado inicial

- `git status` inicial: los cambios ajenos del trabajo de volumen 2.5D siguen sin commitear (`package.json` con `check:volume`/`qa:volume`,
  `vallesco.ts`, `types/game.ts`, `BuildingArt.ts`, **`Lighting.ts`**, `LocationBuilder.ts`, `Occlusion.ts` y los nuevos
  `BuildingVolume.ts`, `BuildingProjection.ts`, `check-building-volume.ts`, `run-volume.mjs`, `VOLUME-25D.md`, `design/volume-evidence/`).
  **MET-05 no edita ninguno**; en concreto, no toca `Lighting.ts` ni `LocationBuilder.ts`: usa sus mecanismos existentes por datos.
- Referencias `design/metro/` (6 fotos, ya inspeccionadas): tubos fluorescentes en filas regulares, suelo claro con brillo bajo cada
  tubo, borde del andén con labio oscuro sobre la vía, túnel negro en los extremos, sombra bajo los coches.

## Auditoría

| Pieza | Dónde | Estado |
| --- | --- | --- |
| Ambiente del andén | `platform()` `ambient: '#dbe7f2'` → `Lighting` multiplica toda la escena por ese color | plano, uniforme |
| Luces | `Lighting`: los props con `light` (`{ dy, cool?, pool? }`) crean un charco con máscara escalonada Bayer de 7 niveles (bordes pixelados, sin desenfoque); dentro, alfa 0,5 | **ningún prop de luz en el andén**: los tubos de la pared (dibujados en el muro) no alumbran nada |
| Día/noche (QA-06) | interior abierto: ambiente fijo; cerrado: oscuro. El metro abre 0–24 | el andén no sigue el ciclo: sin conflicto |
| Sombras de contacto | `LocationBuilder`: elipse de 3 capas (0,14/0,24/0,26) bajo cada prop de suelo (`shadow` o ancho − 4) | bancos, pilares, tornos y máquina ya la tienen |
| Tren | `entities/Train.ts` (MET-02) | **sin sombra** sobre la vía |
| Vía y túnel | `Surfaces.track` (`R`, filas 2–4), llega a los bordes del mapa | **mismo brillo en el centro que en las bocas** |
| Borde del andén | fila `y` (franja amarilla y táctil, MET-01) contra la vía | sin labio/caída marcada |
| Suelo | `p`, baldosa grande clara (MET-01) | **zona plana** |

Medición antes: Chrome escritorio 60 fps estables (Vallesco con el tren en BOARDING). Móvil emulado 390×844 con CPU ×4:
47–56 fps (Puerta Central, en calentamiento). `antes-vallesco-tren.png`, `antes-casco-vacio.png`.

## Definiciones previas

- **Shader pesado:** cualquier pipeline o postproceso nuevo (WebGL custom, blur, bloom, pasadas extra a pantalla completa).
  **No se usa ninguno**: sólo las capas que ya existen (rectángulo MULTIPLY del ambiente, charcos ADD con máscara escalonada,
  elipses de sombra pintadas una vez en la textura del suelo).
- **Medición:** `lifesim.perf()` (fps, tick), en Chrome escritorio y móvil emulado 390×844 con CPU ×4, en Puerta Central (la más
  cargada) y Vallesco con el tren parado. Umbral: caída ≤ 3 fps de media frente al antes, en las dos.
- **Zona plana/oscura/borde difícil:** plana = más de 4×4 tiles del mismo tono sin variación de luz (el suelo del andén);
  oscura = un interactivo (puerta del tren, torno, máquina, señal, NPC) con brillo < 60 % del de alrededor; borde difícil =
  borde andén/vía sin separación de tono.
- **Iluminación superior:** charcos fríos (`cool`) a intervalo fijo sobre el andén, uno cada 4 tiles en la fila de espera,
  coherentes con los tubos de la pared; color `0x9fd8ff` (el `cool` existente), intensidad la de interior (alfa 0,5).
- **Reflejos suaves:** el propio charco ADD sobre la baldosa clara (sin overlay nuevo); opacidad ≤ 0,5.
- **Sombras discretas:** 2–3 niveles, opacidad ≤ 0,3, técnica de elipse/banda como `LocationBuilder`: bajo el tren (banda
  sobre la vía), bajo el labio del andén (banda en la última fila de vía); bancos y columnas ya la tienen.
- **Contraste túnel:** las 2 columnas de vía de cada extremo, oscurecidas en escalón (≈ −35 % y −20 %) en el dibujo de la vía; el tren
  sigue visible (es más claro) y nada interactivo está en la vía.
- **Materiales:** sólo la paleta actual (`PALETTE`, `shade`), ruido determinista; nada de gradientes suaves.
- **Modelo:** `data/stationLighting.ts`: `stationLighting(id) → { stationId, lights: {tx,ty}[], ambientColor, shadow: { train, lip },
  tunnelContrast }`, derivado y común a todos los andenes (sin `if` por estación), no persistido: LV-02 y `SAVE_VERSION` intactos.
- **QA-06:** el andén conserva el ambiente fijo de interior; no se toca `Lighting.ts`.
- **Evidencia:** `MET-05/` antes/después (estación, túnel, tren parado) y tabla al final.

## Pendiente de autorización (arte nuevo)

1. **Charcos de luz** bajo los tubos (prop de luz invisible `metro-light`, sin colisión, con el `light` frío existente).
2. **Bocas de túnel oscurecidas** en los extremos de la vía.
3. **Sombra bajo el tren** y **labio oscuro** del borde del andén.

**Autorizado por el usuario (18/11/2026):** charcos de luz, bocas de túnel oscuras, sombra del tren y labio del andén.

## Implementación

| Archivo | Cambio |
| --- | --- |
| `src/data/stationLighting.ts` (nuevo) | `stationLighting(id)` → `{ stationId, kind: 'metro-light', lights, ambientColor: '#dbe7f2', shadow: { train: 0.28, lip: 0.3 }, tunnelContrast: [−0.35, −0.2, −0.1] }`, común a los 12 andenes, no persistido |
| `src/types/game.ts` | **sólo** `\| 'metro-light'` en `PropKind` (autorizado por el usuario; el resto del archivo es trabajo ajeno y no entra) |
| `src/world/tiles.ts`, `src/world/PropArt.ts` | prop `metro-light`: overhead, textura transparente 2×1, `light: { dy: 16, cool: true, pool: [44, 20] }` (charco frío con la máscara escalonada que ya existe) |
| `src/data/locations.ts` | `platform()` coloca los 4 `metro-light` (ty 7; tx 4, 8, 12, 16) y toma el ambiente de `stationLighting` |
| `src/world/Surfaces.ts` | vía: bocas de túnel en 3 escalones hacia el negro (`mix`), rieles apagados en las bocas; labio del andén (1 px −0,15 + 3 px −0,30) en la fila de vía con franja debajo |
| `src/entities/Train.ts` | sombra bajo los coches (2 rectángulos de alfa 0,14, ≈0,26 donde se solapan), se mueve y se oculta con el tren |
| `scripts/check-metro-lighting.ts` (nuevo) + `package.json` | luces = modelo, sobre andén transitable y fuera de puntos, portales, spawns y props; sin cuerpo; charco; alcanzabilidad igual; ambiente `#dbe7f2`; sombras ≤ 0,3; túnel en [−0,4, 0] y en escalón |

No se tocó `Lighting.ts` ni `LocationBuilder.ts` (trabajo ajeno): todo va por los mecanismos existentes (props con `light`, sombras de contacto, materiales).
Sin shaders, pipelines ni pasadas nuevas.

**Corrección 1/2 (visual-qa):** (a) el `shade` restaba 0,35·255 al balasto ya oscuro, de ahí los bloques negros; ahora es una mezcla proporcional en 3 escalones y los rieles van apagados; (b) los tubos `tube-light` colgados tapaban cabezas, así que pasan a ser luz invisible con charco en el suelo; (c) labio y sombra del tren más marcados.

## Evidencia

Chrome vía DevTools, `localhost:5199`; escritorio 958×888; móvil emulado 390×844 con CPU ×4. Ranura 3 respaldada y restaurada.

| Zona | Caso | Esperado | Obtenido | Estado | Notas |
| --- | --- | --- | --- | --- | --- |
| Estación | Andén de Vallesco con el tren parado | luz regular, suelo con profundidad, nada tapado | 4 charcos fríos regulares, NPC visibles | PASS | `antes-vallesco-tren.png` → `c1-vallesco-tren.png` |
| Túnel | Extremos de la vía (Casco Antiguo, vía vacía) | boca de túnel, no recuadro | 3 escalones hacia el negro, rieles apagados; escalón tenue en el borde del mapa (menor) | PASS | `antes-casco-vacio.png` → `despues-casco-vacio.png` (FAIL) → `c1-casco-vacio.png` |
| Tren detenido | Sombra bajo los coches | sombra discreta | banda sutil bajo el coche | PASS con reserva | apenas visible con el tren parado |
| Borde | Pavimento / franja / caída / rieles | planos separados | franja, labio, vía y rieles distintos | PASS | |
| Interactivos | Puertas, tornos, máquina, señales, NPC | sin oscurecer | sin cambios | PASS | |
| Pixel art | Bordes | nítidos, sin blur | charcos con máscara Bayer escalonada | PASS | visual-qa |
| Móvil | Puerta Central 390×844 | legible, HUD igual | legible, HUD sin cambios | PASS | `c1-movil-puerta-central.png` |
| Rendimiento escritorio | Vallesco, tren en BOARDING | caída ≤ 3 fps | 60 → 58–59 fps | PASS | |
| Rendimiento móvil | Puerta Central, CPU ×4 | caída ≤ 3 fps | 47–56 → 49–56 fps | PASS (emulado) | teléfono físico NO VERIFICADO |
| QA-06 | Día/noche | el andén mantiene el ambiente de interior | `#dbe7f2`, `Lighting.ts` sin tocar | PASS | check-metro-lighting |
| LV-02 | Guardado | nada nuevo | nada persistido; check-save-torture | PASS | |
| MET-01/03/04, LV-07 | Base, variación, señalética, metro | sin regresión | checks de variedad, señalética y metro OK | PASS | |
| LV-01 | Rendimiento móvil en partida de 7 días | — | — | NO VERIFICADO | LV-01 no cerrado |

**Veredicto: PASS CON RESERVAS** (sombra del tren sutil; rendimiento móvil sólo emulado; LV-01 NO VERIFICADO).
