# CAS-08 · Identidad de barrio histórico en Casco Antiguo

Datos: `data/cascoAntiguo.ts` (fachadas de la Calle Mayor, Calle del Rastro, `inspects`). Tipos: `types/game.ts`
(`BuildingStyle`, `BuildingDef.tone`). Render: `world/BuildingArt.ts` (`LOOKS`, `WALL_TONES`, `HD_MAT` `'stucco'`).
Prueba: `scripts/check-casco-historico.ts` (en `npm run check`).

Objetivo: que Casco Antiguo se lea como barrio histórico, inspirado en la trama de los barrios históricos madrileños
sin copiar edificios ni marcas, y sin cambiar la escala del personaje.

## Fachada `res-historic`

Revoco envejecido, zócalo de piedra, balcones de forja por semilla (si no salen, `ResidentialArt` decide hueco a
hueco) y portal de madera. `BuildingDef.tone` es opcional y fija el tono por datos. Todos los tonos derivan de
`PALETTE` con `mix`/`shade`.

| Edificio | Nombre | `tone` | Color |
|---|---|---|---|
| cas-res-1 | Calle Mayor 2 | 0 | almagre |
| cas-res-2 | Calle Mayor 8 | 1 | ocre |
| cas-res-3 | Calle Mayor 16 | 2 | crema lavado |
| cas-res-12 | Calle Mayor 20 | 3 | rosa viejo |

Son las cuatro fachadas norte de la Calle Mayor; conservan huellas, puertas y `points`.

## Calle del Rastro

Las filas 34–35 pasan de acera a adoquín `'P'` con cenefa de granito. Los puestos del Gran Rastro siguen en sus anclas
(fila 34) y la fila 35 queda de paso.

## Rincones examinables

`inspects` con E al lado. Historia local ficticia, sin NPC con nombre ni misión.

| Casilla | Nombre | Qué es |
|---|---|---|
| (0,9) | Placa de calle | street-sign en la esquina oeste, delante de Calle Mayor 2 y fuera de su puerta: azulejo «Calle Mayor», antes «de los Cesteros», rótulo de 1868 |
| (4,17) | El árbol del mercado | árbol de la plaza |
| (16,25) | Farol de gas | farola de la acera sur |

## El check

- `res-historic` sólo aparece en Casco.
- Las 4 fachadas conservan `rect`/`doorX`/`front` y tienen tonos distintos.
- Los 3 inspects no caen en anclas del Rastro, puertas ni `points`, y tienen casilla pisable al lado.
- La placa está delante de una vivienda y no en su puerta.
- Filas 34–35 adoquinadas.

## Verificación (2026-11-16)

`npm run build` OK; cadena completa de checks: 137 scripts, 0 fallos (330 s). `check-gran-rastro-bloqueo`: 38 puestos
sólidos, 5/5 salidas alcanzables. Navegador de escritorio: día, noche y domingo con Rastro (60 fps, 33 personas). Móvil
sólo emulado (390×844, CPU×4): 55–59 fps en domingo, 59–60 de noche; sin dispositivo real.

Ciclo: el primer intento puso el letrero en (9,9), delante del escaparate del Horno de la Plaza, y las 4 fachadas
salían con el mismo tono; se corrigió en el segundo ciclo.

## Fuera (por prioridad)

1. Más contraste entre Calle Mayor 2 y 8 (ajuste de `WALL_TONES`, sin tocar datos) y recaptura de Calle Mayor 20.
2. Plazuela secundaria (segunda/tercera microzona).
3. Fachada histórica en las casas del sur: con `front: 'n'` sólo se pinta la trasera; es un cambio mayor en
   `BuildingArt`/`ResidentialArt`.
4. Prueba en móvil real.
5. Check que detecte letreros sobre escaparates.
6. Azulejo de calle como prop de pared propio y adoquín en los pasajes.
