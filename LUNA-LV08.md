# LV-08 · Luna: barrio jugable mínimo

Implementado solo con datos, con la receta de Casco Antiguo. Nada de lo que sigue se ha ejecutado: ni `tsc`, ni los checks, ni el navegador.

## Definiciones previas

- **Identidad.** El barrio de la noche: perfil `luna` que ya existía en `data/districtIdentity.ts` (sin cambios). Vive de 17:00 a la madrugada; de día, casi nadie.
- **Calle en tiles.** Mapa 34 × 24 (`data/luna.ts`). Filas 2–8, bajos del norte; 9–10, acera norte; 11–13, calzada de losa peatonal; 14–15, acera sur; 16–23, bajos del sur. Columnas 0–2 y 31–33, medianeras.
- **Transición.** Metro L2, parada `luna`, order 4. Boca `lu-metro` (puerta en 28,8) ↔ `luna-station` (salida a spawn `lu-metro`, en 28,9). €2 fijos y 15 min por parada.
- **Destinos.** `lu-bar` (Bar Luna Llena, 18:00–03:00) y `lu-abierto` (Abierto Toda la Noche, 17:00–04:00, caja `supermarket-till`). La Sala Eclipse es fachada sin `enter`, con cartel de obras. Seis portales de vecinos sin interior.
- **Actividad.** `lu-copa`, «Una copa con música», en la barra del bar: 20 min, €6, +4 de energía. Junto a `club-water` (5 min, €2, +2).

### Modelo

| campo | valor |
| --- | --- |
| districtId | `luna` |
| name | Luna |
| zones | Sin entradas en `data/zones.ts` (igual que Casco Antiguo). Zona visual: `transit` en 26,0 de 5 × 12 |
| locations | `luna`, `luna-station`, `lu-bar`, `lu-abierto` |
| spawns | Generados por edificio: `lu-bar` (10,9), `lu-abierto` (16,9), `lu-metro` (28,9); `entry` y `train` en sus interiores |
| transitions | Puertas a `lu-bar`, `lu-abierto` y `luna-station`; salidas de vuelta a su spawn; tren L2 desde el andén |
| bounds | x 3–30 e y 8–16 a pie (filas 8 y 16: solo los tiles de puerta) |

### Cada borde con su opción

| borde | qué hay | opción |
| --- | --- | --- |
| Oeste (x 0–2) | `lu-cierre-o`, medianera | Cerrado. Jardinera en 4,12 con «Fin de la calle» |
| Este (x 31–33) | `lu-cierre-e`, medianera | Cerrado. Jardinera en 29,12 con «Fin de la calle» |
| Norte (fila 8) | Fachadas | Puertas de bar, tienda y metro; el resto, sin afordancia salvo el cartel de la sala |
| Sur (fila 16) | Fachadas | Portales de vecinos sin interior |
| Resto de la ciudad | Metro | Única salida del jugador. La gente de la calle sale por `EDGE_LU_W` (5,15) y `EDGE_LU_E` (28,15), umbrales de portal |

### Posiciones de las paradas: ninguna se desplaza

| parada | order antes | order ahora |
| --- | --- | --- |
| campo-alto | -5 | -5 |
| arena | -4 | -4 |
| puerta-central | -3 | -3 |
| velaria | -2 | -2 |
| cuatro-rios | -1 | -1 |
| vallesco | 0 | 0 |
| ribera | 1 | 1 |
| decathlon | 2 | 2 |
| casco-antiguo | 3 | 3 |
| luna | — | 4 |

L3 no cambia. Tampoco se ha movido ningún mapa ni spawn existente.

### Ida y vuelta

Vallesco → Luna: 60 min, €2. Calle → bar o tienda a pie → salida a la calle → andén → Luna → Vallesco: 60 min, €2. Con la tarjeta a 10, acaba en 6.

### Presupuestos usados

- Calle: `maxWalkers` 24, frente a los 75 agentes de la calidad baja (`config/budgets.ts`).
- Locales: `maxVisitors` 12 en el bar y 5 en la tienda.
- Sin tráfico, sin arte nuevo, sin texturas nuevas.

## Contraste con Notion

Según el encargo, sin consulta directa de este agente: EXP-06 y los barrios previos ya están en el repo. El prompt archivado «50 — Distrito Luna» incluía club de adultos y servicios sexuales; quedan excluidos porque LV-08 no los pide, ni como texto ni como decorado.

## Rendimiento

**ANTES**, ya medido en Vallesco, sábado 00:00, Chrome 156: carga 9,0 s; frame-time p50 16,7 ms, p95 16,9 ms, p99 17,0 ms; 26 agentes, 1413 objetos, `over` vacío. La media no es válida: la pestaña se estranguló al final.

**DESPUÉS**: pendiente.

## Adaptaciones respecto al encargo

- **Madrugada de la calle.** El perfil `district` no tiene franjas tras medianoche, pero el formato existe en el mismo archivo y `streetLevelAt` lo lee: se usan `[0, 3, 'MEDIUM']` y `[3, 6, 'LOW']`, los valores de `puerta-central`. Si no se quieren, basta quitar esas dos franjas y la madrugada contará como `VERY_LOW`.
- **Puestos del camarero.** `points` lleva `LUBAR_STAFF_01`, `_02` y `_03` en vez del prefijo `LUBAR_STAFF_`. `lu-bar` tiene `why`, y `scripts/check-places.ts` busca cada puesto por id exacto cuando el local lo tiene. Los bares con prefijo (Ribera, Arena) no llevan `why`. `Crowd` resuelve por `startsWith`: el efecto es el mismo.

## Bloqueos parciales y límites

- Sin bloqueos que impidan el barrio mínimo.
- `EDGE_LU_W` y `EDGE_LU_E` no están en el límite del mapa: la gente aparece y desaparece en esos umbrales, a la vista si el jugador está cerca. Sin comprobar en pantalla.
- Sin rol de limpieza, por encargo (sin `sweep`).
- El bar no enseña ninguna música real: «con música» es solo el texto de la actividad.

## Casos

| caso | pasos | esperado | obtenido | PASS/FAIL/NO VERIFICADO | notas |
| --- | --- | --- | --- | --- | --- |
| acceso: metro | Andén de Vallesco → Luna | Llega al andén `luna-station`, 60 min y €2 | pendiente de ejecución | NO VERIFICADO | `check-luna.ts` y navegador |
| acceso: salida | Andén → salir a la calle | Aparece en 28,9, sin solaparse | pendiente de ejecución | NO VERIFICADO | |
| destino: bar | Calle → puerta del bar, 18:00–03:00 | Entra a `lu-bar` | pendiente de ejecución | NO VERIFICADO | |
| destino: tienda | Calle → puerta de la tienda → caja | Entra y compra en la caja | pendiente de ejecución | NO VERIFICADO | |
| destino: cerrado | Puerta del bar a las 12:00 | Dice que está cerrado y cuándo abre | pendiente de ejecución | NO VERIFICADO | |
| destino: sala | Interactuar con la Sala Eclipse | Solo el cartel de obras; no se entra | pendiente de ejecución | NO VERIFICADO | |
| actividad: copa | Barra, sábado 23:00, €10 | 20 min, −€6, +4 de energía | pendiente de ejecución | NO VERIFICADO | |
| actividad: sin dinero | Barra con €1 | Rechazada, sin cambios | pendiente de ejecución | NO VERIFICADO | |
| retorno: locales | Salir del bar y de la tienda | Vuelve delante de su puerta | pendiente de ejecución | NO VERIFICADO | |
| retorno: Vallesco | Luna → Vallesco | 60 min, €2, tarjeta en 6 | pendiente de ejecución | NO VERIFICADO | |
| retorno: recarga | Guardar en `lu-bar` y recargar | Sigue en `lu-bar`, reloj y saldo iguales | pendiente de ejecución | NO VERIFICADO | |
| borde: oeste y este | Caminar hasta las medianeras | Colisión; no se sale de x 3–30 | pendiente de ejecución | NO VERIFICADO | BFS en `check-luna.ts` |
| borde: norte y sur | Caminar contra las fachadas | Solo se pisan los tiles de puerta | pendiente de ejecución | NO VERIFICADO | |
| borde: sin coches | Observar la calzada | Ningún vehículo | pendiente de ejecución | NO VERIFICADO | |
| vida: noche | Sábado 23:00 y 01:00 en la calle | Gente en corrillos y hacia el bar; dentro de 24 | pendiente de ejecución | NO VERIFICADO | |
| regresión: tarifas | Vallesco–Ribera, –Arena, –Casco | 15, 60 y 45 min; €2 | pendiente de ejecución | NO VERIFICADO | |
| regresión: checks | `npm run build` y `npm run check` | Sin errores | pendiente de ejecución | NO VERIFICADO | |
| rendimiento: después | Misma medida que ANTES, en Luna | Dentro de presupuesto, `over` vacío | pendiente de ejecución | NO VERIFICADO | |
| móvil | Recorrido en móvil | Igual que en escritorio | pendiente de ejecución | NO VERIFICADO | |

## Comandos

Pendiente de la ejecución final.
