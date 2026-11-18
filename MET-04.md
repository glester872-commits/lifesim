# MET-04 · Señalética y mobiliario de estaciones

Modo BALANCED. Rama `met-04-senaletica` (desde `f6416b4`, MET-03). Sin commit.

## Fase 1 · Estado inicial

- `git status` inicial: **cambios ajenos sin commitear** que no son de este ticket: `src/data/vallesco.ts`, `src/types/game.ts`,
  `src/world/BuildingArt.ts`, `Lighting.ts`, `LocationBuilder.ts`, `Occlusion.ts` (+46 −8) y `scripts/qa/run-volume.mjs` y
  `src/world/BuildingVolume.ts` nuevos. Se conservan sin tocar y no entran en el commit de MET-04 salvo que el usuario lo decida.
- Referencias `design/metro/` (6 fotos, ya inspeccionadas): placa de nombre en la cenefa, paneles de salida y de línea en
  postes o colgados, plano lineal de la línea con la parada marcada, bancos contra el muro, papeleras, franja amarilla.

## Auditoría

| Pieza | Dónde | Estado |
| --- | --- | --- |
| Placa con el nombre | `metro-sign` (7,1), texto de `STOPS` (`stationSign`) | real y correcto (MET-01) |
| Rótulo secundario | `metro-subsign` (7,0) (MET-03) | real (correspondencia, estadio, casco) |
| Postes de señal | `sign` en (2,9), (19,9) (andén) y (6,12) (vestíbulo); `drawSign` = panel gris con 3 rayas ámbar | **decorado sin significado** (afordancia visual falsa) |
| Planos de línea | `line-map` (2,1), (16,1); `drawLineMap` = 5 puntos genéricos | **no corresponde a la red** (L2 tiene 10 paradas, L3 tiene 2) |
| Salida | portal `exit` (11,13), tras los tornos (8/10/12,10) | real |
| Correspondencia | portal `transfer` (7,11) en Puerta Central y Polígono Norte (L2↔L3), escalera `Y`, inspect en (6,12) | real |
| Dirección del tren | el tren para y el menú ofrece todos los destinos de la línea | no hay sentido único: una señal «dirección X» no tendría respaldo |
| Mobiliario | 4 bancos (4-5,9)/(16-17,9) contra el muro de abajo mirando a la vía; 2 pilares; papeleras y maceteros de MET-03 en tiles de la lista blanca | con lógica espacial; nada que añadir |

## Definiciones previas

- **Nombres:** los de `STOPS` (español): Campo Alto, Arena, Puerta Central, Velaria, Cuatro Ríos, Vallesco, Ribera Norte,
  Polígono Norte, Casco Antiguo, Luna (L2); Puerta Central y Polígono Norte (L3). Ya en la placa.
- **Respaldo lógico:** una señal sólo existe si su `targetId` es un portal real del andén (`exit`, `board`, `transfer`) y su flecha
  se calcula de la posición de la señal hacia ese portal; el plano de línea se dibuja a partir de `STOPS` (orden, paradas,
  correspondencias `hub`) y marca la parada actual. Sin señales de dirección (no hay sentido único).
- **Modelo:** `data/stationSigns.ts` deriva por estación `{ stationId, signId, type: 'salida'|'anden'|'correspondencia'|'plano',
  text, position, targetId }` del LocationDef, sin tabla escrita a mano. No se guarda: LV-02 y `SAVE_VERSION` intactos.
- **Familia visual:** pictograma + flecha en blanco sobre panel de color: verde = salida, color de la línea (azul L2, verde L3)
  = andén y correspondencia (con «L2»/«L3» en la fuente 5×7 del juego). Planos: fondo oscuro, trazo del color de la línea y la
  parada actual en ámbar.
- **Texto diminuto:** mínimo la fuente 5×7 existente (glifos de la placa); nada por debajo. Lo que no cabe se dice con pictograma.
- **Exceso de props:** sin props nuevos: se reutilizan las 3 posiciones de poste y los 2 planos existentes (cero cambios de
  colisión). Máximo por estación: lo de MET-03 (≤ 4 extras).
- **Flotante o superpuesto:** cualquier dibujo fuera de la base de su prop o que pise otro prop, puerta, vía o punto de NPC; lo
  evita reutilizar posiciones ya validadas y el check de solapes de MET-03.
- **Evidencia:** tabla al final (estación, señal, tipo, respaldo lógico, legibilidad, colisiones, estado, notas).

## Pendiente de autorización (arte nuevo)

1. **Paneles con pictograma** en los postes existentes: salida (puerta y flecha), andén (tren y flecha) y correspondencia
   («L3»/«L2» y flecha).
2. **Plano real de la línea** en los paneles existentes: las 10 paradas de L2 o las 2 de L3, con la parada actual marcada y las
   correspondencias con anillo.

**Autorizado por el usuario (18/11/2026):** paneles con pictograma y plano real de la línea. Los cambios ajenos se dejan sin tocar y fuera del commit.

## Implementación

| Archivo | Cambio |
| --- | --- |
| `src/data/stationSigns.ts` (nuevo) | `stationSigns(loc)` deriva del LocationDef `{ stationId, signId, type, text, position, targetId, arrow }`: postes de encima de los tornos = salida hacia `exit`, poste del vestíbulo = correspondencia hacia `transfer` (texto = línea del otro andén) o andén hacia `board`; planos = la línea del andén. Flecha por el eje dominante. `SIGN_BACKGROUND` por tipo. `withSignage(loc)` pone las variantes |
| `src/data/locations.ts` | `platform()` y `correspondence()` devuelven `withSignage(...)` (el poste de Puerta Central y Polígono Norte se recalcula tras añadir el pasillo) |
| `src/world/tiles.ts` | `sign` y `line-map` con variantes y `defaultVariant: 0` (los postes de Campo Alto y el plano de Colosseo siguen igual) |
| `src/world/TextureFactory.ts` | `drawSignFace` (salida: puerta y flecha sobre verde; andén: tren y flecha sobre el color de la línea; correspondencia: fondo blanco, marco y «L2»/«L3» del color de la línea, flecha oscura), `drawLineMapFace` (paradas reales de 2×2, anillo en las correspondencias, la actual en ámbar 4×4) |
| `scripts/check-station-signage.ts` (nuevo) + `package.json` | posiciones intactas, variante = derivada, destino real, flecha hacia el destino, correspondencia sólo con pasillo, texto ≥ 5×7, 2 salidas, plano = paradas de la línea en orden con la propia marcada, fondo de salida ≠ correspondencia ≠ líneas, nada cambia fuera del metro |

Sin props nuevos ni cambios de colisión, rutas o guardado. Sin tocar los archivos ajenos sin commitear.

**Corrección 1/2 (visual-qa):** el panel de correspondencia «L3» tenía el verde de la salida, así que ahora es blanco con color de línea; las paradas del plano eran píxeles sueltos, y ahora son de 2×2 con anillo.

## Evidencia

Chrome vía DevTools, `localhost:5199`; escritorio 958×888 y móvil emulado 390×844. Ranura 3 respaldada y restaurada.

| Estación | Señal | Tipo | Respaldo lógico | Legibilidad | Colisiones | Estado | Notas |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Las 12 | postes (2,9) y (19,9) | salida → / ← | portal `exit` (11,13) tras los tornos | puerta y flecha sobre verde, se lee en escritorio y móvil | misma posición que antes | PASS | `05-c1`, `06-c1`, `07-c1` |
| 8 sin pasillo (p. ej. Vallesco) | poste (6,12) | andén ↑ | portal `board` (11,5) | tren y flecha sobre azul L2 | igual | PASS | `02-vallesco.png` |
| Puerta Central L2 · Polígono Norte L2 | poste (6,12) | correspondencia «L3» → | portal `transfer` (7,11) a la L3 | fondo blanco, «L3» verde | igual | PASS | `05-c1-puerta-central.png` |
| Puerta Central L3 · Polígono Norte L3 | poste (6,12) | correspondencia «L2» → | portal `transfer` a la L2 | fondo blanco, «L2» azul | igual | PASS | `06-c1-poligono-l3.png` |
| Las 12 | planos (2,1) y (16,1) | plano de línea | `STOPS` de la línea (10 L2 / 2 L3), su parada en ámbar, `hub` con anillo | actual y L3 claras; en el móvil, los puntos de L2 pequeños | igual | PASS (matiz menor) | visual-qa |
| Las 12 | nombre | placa | `STOPS` (MET-01) | sin cambios | — | PASS | |
| — | dirección | no se dibuja | el tren sirve todos los destinos desde el mismo andén | — | — | PASS (decisión) | evita una señal falsa |

| Criterio | Estado | Evidencia |
| --- | --- | --- |
| git status inicial; cambios ajenos | PASS | arriba; los 8 archivos ajenos sin tocar y fuera del ticket |
| Referencias | PASS | `design/metro/` |
| Definiciones previas | PASS | arriba |
| Nombres reales, español | PASS | `STOPS` |
| Modelo compatible con LV-02 | PASS | derivado, no persistido; check-save-torture y check-metro-transfers OK |
| Familia visual | PASS | pictograma + flecha; verde = salida, color de línea = andén, blanco + línea = correspondencia |
| Señales con respaldo, ninguna falsa | PASS | check-station-signage (60 señales) |
| Mobiliario con lógica espacial | PASS | auditoría: bancos contra el muro mirando a la vía, papeleras/maceteros en lista blanca (MET-03) |
| No cubren puertas, accesos, vías ni rutas NPC | PASS | posiciones intactas; check-prop-bodies, check-world |
| Sin texto diminuto ni exceso de props | PASS | ≥ 5×7, 0 props nuevos |
| Móvil/escritorio, sin flotantes | PASS | `07-c1-movil-puerta-central.png`, visual-qa |
| No regresión MET-01/MET-03/LV-07/ALPHA-09/LV-02/pixel art | PASS | checks + capturas; HUD sin cambios |
| Orientación en partida real de 7 días (LV-01) | NO VERIFICADO | LV-01 no cerrado |

Comandos tras la corrección 1: `npx tsc --noEmit` exit 0; `npm run build` OK; check-station-signage, check-station-variety,
check-art, check-regression y check-prop-bodies OK; cadena completa (149 comandos uno a uno en PowerShell): **149 de 149 OK**, 434 s.
Antes, en la primera pasada, check-puerta-central (coste de la calle) falló una vez con 4,98 ms > 4 por carga de la máquina;
repetido 2 veces, OK. MET-04 no toca la calle.

`git diff --stat` de MET-04: `package.json` (+1 check), `src/data/locations.ts`, `src/world/tiles.ts`, `src/world/TextureFactory.ts`;
nuevos `src/data/stationSigns.ts`, `scripts/check-station-signage.ts`, `MET-04.md`, `MET-04/`. Los demás cambios del árbol
(volumen 2.5D de edificios: vallesco, types, BuildingArt, Lighting, LocationBuilder, Occlusion, BuildingVolume, BuildingProjection,
check-building-volume, VOLUME-25D.md) son de otro trabajo en curso y quedan fuera.

**Veredicto: PASS CON RESERVAS.** Reservas: LV-01 NO VERIFICADO; en el móvil, los puntos del plano de L2 pequeños (la parada actual
sí se identifica).
