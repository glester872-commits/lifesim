# MAP-EXP-01 — Ampliación de Luna hacia el este (fase 1 de escala de barrios)

Rama `alpha-09-fachada`. Captura previa: `MAP-EXP-01/00-luna-antes.png`.

## Inventario de exteriores (antes, leído de `LOCATIONS`)

| id | w×h | área | edificios | con enter | props | points | escala |
|---|---|---|---|---|---|---|---|
| district (Vallesco) | 110×79 | 8690 | 58 | 25 | 340 | 203 | 1.000 |
| ribera | 40×30 | 1200 | 8 | 7 | 64 | 92 | 0.138 |
| cuatro-rios | 48×34 | 1632 | 25 | 16 | 76 | 58 | 0.188 |
| velaria | 48×38 | 1824 | 23 | 14 | 100 | 93 | 0.210 |
| puerta-central | 56×40 | 2240 | 18 | 10 | 91 | 118 | 0.258 |
| arena | 64×40 | 2560 | 13 | 10 | 86 | 104 | 0.295 |
| campo-alto | 48×34 | 1632 | 13 | 2 | 37 | 29 | 0.188 |
| casco-antiguo | 44×34 | 1496 | 16 | 2 | 30 | 28 | 0.172 |
| luna | 34×24 | 816 | 13 | 3 | 18 | 24 | 0.094 |
| poligono-norte | 56×34 | 1904 | 2 | 2 | 48 | 17 | 0.219 (DEC-02, intocable) |

Después (medido con `scripts/check-map-scale.ts`): **luna 64×24 = 1536, 27 edificios, 3 con enter, 31 props, 45 points, escala 0.177, 17.6 edificios/1000 tiles**.

## Fórmula y densidades

- escala = área / área(district), con área = ancho × alto de `ground`.
- densidad = edificios × 1000 / área (cuenta también las medianeras `backdrop`, como el inventario).
- Umbrales del check: Luna ≥ 1500 tiles y ≥ 12 edificios/1000 tiles. `poligono-norte` queda fuera de los umbrales de densidad.

## Modelo de mapa

No hay sistema paralelo: se reutiliza `LocationDef`/`BuildingDef` de `src/types/game.ts`.

- bounds = `ground` (la rejilla define el tamaño);
- blocks = las filas de `buildings` (norte ty 2, sur ty 16), con medianeras `backdrop`;
- streets = `ground` (aceras `,`, losa `P`, podotáctil `T`) y `areas`;
- npcs = `points`/`links` y la vida de calle de `data/streets.ts`;
- interactives = `inspects` (y `spots` en interiores);
- portals = `enter` de los edificios y `portals`.

Versionado: `SAVE_VERSION` sigue en 4 (no cambia el esquema; una posición guardada que caiga en algo sólido la corrige `safePosition`), más este documento.

## Por qué Luna

La más pequeña (escala 0.094), geometría cerrada (calle con medianeras, sin salida a pie), sin tráfico, y reutiliza lo hecho en LV-08. Descartes: Ribera ya es densa; Campo Alto y Casco Antiguo, para la fase 2; Puerta Central y Arena ya están en ≥ 0.26; Polígono Norte, por DEC-02.

## Qué cambia (todo en datos)

- `src/data/luna.ts`: W 34 → 64; aceras y losa hasta x 60; Plazuela de Luna con dos entrantes (x 44–47, y 3–8 y y 16–21) cerrados por `lu-cierre-pn`/`lu-cierre-ps`; medianera este a x 61. Seis bajos al norte (incluye Horno de Luna `bakery`, Lavandería Luna `laundry`, Locutorio 24h `phone`, los tres sin `enter` ni `point`) y seis viviendas al sur. Props nuevos, nodos de acera en x 33…58, cruce `lu-cm`, `lu-pn`, `lu-ps`, corrillos 09–12, dos `LU_PLAZUELA_WAIT_`, área «Plazuela de Luna», inspects actualizados. Nada existente se desplaza salvo la medianera este, la jardinera y el inspect «Fin de la calle» de x 29 a x 59.
- `src/data/streets.ts`: `maxWalkers` de Luna 24 → 36 (el tope es fijo, no escala con los points; 36 ≤ `BUDGETS.low.agents` 75). La patrulla incluye `LU_PLAZUELA_WAIT_`. Los `LU_CORRILLO_` nuevos los cogen solos los trayectos por prefijo.
- Sin `if (location === 'luna')`; el perfil `transit` (26,0,5,12) no se toca.

## Fases

- F1 (esta): Luna 816 → 1536.
- F2: Casco Antiguo ~2200 y Campo Alto ~2300.
- F3: Ribera ~1900, Cuatro Ríos ~2300 y Velaria ~2400.
- F4: Puerta Central y Arena, solo densidad.
- Polígono Norte fuera hasta cerrar DEC-02.

## Criterios de aceptación

- `npm run build` y `npm run check` en verde (incluye `check-luna` ampliado y `check-map-scale`).
- Desde el metro se llega a pie a todos los points y a los dos entrantes; ningún tile de calle aislado; medianera este en x 61.
- Los tres locales nuevos sin `enter`, portal ni punto; exactamente 3 edificios con `enter`.
- Cada tramo de 12 tiles de acera tiene un nodo `path` y puerta o prop.
- Guardados en Luna recuperables; `SAVE_VERSION === 4`.
- Rendimiento dentro del umbral.

## Rendimiento

- Antes (navegador, Luna (28,12), vie 10:48, calidad high): fps 57–60, agentes 3–6 (todos near), objects 227, over [], vehicles 0.
- Después (navegador, Chrome DevTools, calidad high, 14/11/2026): (28,12) fps 56–59, objects 273–279; (46,12) fps 60, objects 279; (58,12) fps 60, agentes 5–6, objects 278–280, over []. Objetos +23 % con +88 % de área.
- Umbral: fps ≥ 50 sostenidos, `over` vacío, objects ≤ 363 (227 × 1.6), agentes ≤ BUDGETS. Resultado: **PASS**.
- optimizer (plazuela): fps 59–60; frame p50/p95/p99 16.7/16.8/16.9 ms (600 frames rAF); objects 249–250 (6 % del presupuesto high 4200); heap 223–252 MB estable. No justifica culling ni activación por distancia. Bundle: `TextureFactory` 1.42 MB (gzip 395 kB), anterior a MAP-EXP-01.
- Móvil emulado 390×844, DPR 3: fps 55, objects 255, over [], sin scroll horizontal. Teléfono físico: NO VERIFICADO.
- Peor caso nocturno en navegador (14/11/2026, Chrome DevTools, 958×888, calidad high): **PASS**. Hora fijada en memoria con `state.setClock(27, 23, 15)` (sábado 23:15), sin guardar; la ranura 3 se restauró después. Luna, plazuela (46,12), pestaña en primer plano: fps 56–59 sostenido (las primeras lecturas, de 36 a 52, son la recuperación tras el freno de segundo plano). Agentes 13–23, near 6–17, objects 263–306 (umbral 363), over [], budgetScale 1, frame p50/p95 16.7/16.8 ms (300 frames rAF). Captura `MAP-EXP-01/04-luna-noche-sabado.png`.
- Mediciones en calidad low: NO VERIFICADO.

## Casos

| zona | caso | esperado | obtenido | estado | notas |
|---|---|---|---|---|---|
| escala | área de Luna | ≥ 1500 | 1536 (64×24), escala 0.177 | OK | check-map-scale |
| escala | densidad de Luna | ≥ 12/1000 | 17.6/1000 (27 edificios) | OK | check-map-scale |
| escala | locales con enter | 3 | 3 | OK | check-luna / check-map-scale |
| calle | BFS desde el metro a points y entrantes | todos | sin fallos | OK | check-luna |
| calle | tiles aislados | ninguno | ninguno | OK | check-luna (excluye césped `g` tras los bajos, preexistente) |
| calle | sin calles vacías | nodo + puerta/prop por tramo | cumple | OK | check-luna |
| población | navegación de agentes | 0 fallos/atascos | pico 29 a las 23:30, 0 fallos | OK | check-navigation |
| guardado | (28,12) y (32,12) | se recuperan idénticas | ok | OK | check-luna |
| guardado | (4,12) y (30,9) | idénticas si son pisables | corregidas a tile libre | OK | jardinera y tótem del metro las ocupan desde antes; no pueden volver idénticas |
| guardado | tile bloqueado (33,5) | safePosition lo corrige | ok | OK | check-luna |
| guardado | SAVE_VERSION | 4 | 4 | OK | check-luna |
| navegador | caminar hasta x 60 y la plazuela | sin choques raros | medido en (28,12), (46,12) y (58,12); visual-qa PASS | PASS | capturas 01-luna-plazuela.png y 02-luna-union-antigua-nueva.png; el informe no detalla colisiones |
| navegador | fps / objects / over / agentes | dentro del umbral | fps 56–60, objects ≤ 280, over [], agentes 5–6 | PASS | ver Rendimiento |
| navegador | lectura visual de horno, lavandería y locutorio | fachada con puerta, sin afordancia | visual-qa PASS | PASS | menores: remate de teja en los entrantes de la plazuela, fachadas residenciales repetidas, mesas de café poco legibles (ya lo eran antes) |
| navegador | guardar, recargar y recuperar en el tramo nuevo | misma posición | guardado en (55,12), recargar y CONTINUAR vuelve a (55,12) en Luna | PASS | |
| navegador | consola | sin errores ni avisos | sin errores ni avisos | PASS | |
| navegador | móvil emulado 390×844, DPR 3 | dentro del umbral, sin scroll horizontal | fps 55, objects 255, over [], sin scroll horizontal | PASS | captura 03-luna-movil-390x844.png |
| navegador | teléfono físico | — | — | NO VERIFICADO | |
| navegador | peor caso nocturno | dentro del umbral | sáb 23:15 (`state.setClock(27, 23, 15)`, sin guardar), plazuela (46,12), 958×888, high: fps 56–59 sostenido, agentes 13–23, near 6–17, objects 263–306, over [], budgetScale 1, p50/p95 16.7/16.8 ms | PASS | primeras lecturas 36–52 por recuperación tras el freno de segundo plano; ranura 3 restaurada; captura 04-luna-noche-sabado.png |
| navegador | encuadre de cámara y mapa 'M' a 64 de ancho | revisado a mano | límites de cámara 1024 px = 64×16; en (60,12) la vista queda pegada al borde este sin salirse (worldView.x 545 = 1024 − 479); el mapa M dibuja la calle entera con «Calle de la Luna», «Plazuela de Luna» y «Estás aquí» en el extremo este | PASS | capturas 05-luna-extremo-este.png y 06-mapa-m-luna.png |
| rendimiento | optimizer en la plazuela | sin necesidad de culling | fps 59–60, p95 16.8 ms, objects 249–250, heap estable | PASS | |
| evaluación | evaluator | PASS | PASS | PASS | |
| build | `npm run build` | exit 0 | exit 0 | PASS | |
| check | cadena completa de `scripts.check` | OK | OK, 121 comandos en 274 s, 2632 líneas | PASS | ejecutados uno a uno con node: npm/cmd.exe se colgaba en esta máquina antes del primer script |
| LV-08 | casos de `LUNA-LV08.md` | — | — | NO VERIFICADO | |

## Riesgos

- Los casos de LV-08 en `LUNA-LV08.md` siguen NO VERIFICADO; esta ampliación no los verifica.
- El doble de calle con 36 caminantes puede subir objetos y luces (6 farolas más): medir en low.
- Las fachadas `bakery`/`laundry`/`phone` sin interior podrían leerse como entrables; no tienen afordancia.
- Rendimiento en calidad low: NO VERIFICADO.
