# DEC-02 · Rediseño espacial de Decathlon

Rama `alpha-09-fachada`. El implementador no tenía shell; la columna «obtenido» la rellenan los resultados del
orquestador del 14/11/2026 (checks, build y Chrome vía DevTools en `localhost:5199`, viewport 958×888, ranura 3).
Capturas y resumen de comandos: carpeta `DEC-02/`.

## Auditoría

- **Plano:** `design/Decathlon/217426dc-49c3-4ac3-8bbf-39a1f0f320f1.png` (planta por secciones con leyenda de
  familias). Fecha «junio 2025»: NO VERIFICADO. Las otras 6 PNG de `design/Decathlon/` son fotos de referencia;
  `design/references/uniforms/decathlon-empleados.webp` es el chaleco azul (ya en `data/npcs.ts`, `decathlon_employee*`).
  `design/Decathlon/CORRESPONDENCIA.md` mapea plano → tiles.
- **Se preserva:** orden y adyacencia de secciones, pasillos largos norte/sur y laterales, colores de familia, entrada
  abajo a la derecha, Segunda Vida + ciclismo a la derecha. **Se adapta a cenital:** 16 px/tile, pasillos de 2–3 tiles,
  mostradores de una fila, NPC en `points` con nombre.
- **Antes de DEC-02:** `src/data/decathlon.ts` con nave 76 × 46, `AISLES` (10 rects), `SECTORS`, `DECATHLON_STORE`
  (portal `exit` en (67,44) → `poligono-norte`/`pn-decathlon`, spawn `entry` (67,43)), `DECATHLON_PROFILE` (3 cajeros,
  `DECAT_`/`DECAT2_`/`DECAT3_`), `FRONT` con 3 mostradores en y = 37, taquilla (72,40), fichaje (72,41), información
  (66–67,40). Montaje: `data/locations.ts`, `data/places.ts` (9–21 h), `systems/Crowd.ts` (`staffOnShift` con
  `StaffRole.days`/`minLevel` frente a `levelAt`), `scenes/Menus.ts` (`shop-decathlon`), `systems/Navigation.ts`,
  `cashier()` de `data/cuatroRiosVenues.ts`, render `world/StoreArt.ts` + `world/tiles.ts`.
- **Dependencias:** DEC-01, DEC-03, DEC-04 y DEC-06 no existen en `src`. Existen LV-05 (`RETAIL-LV05.md`), LV-02
  (SaveSlots, `SAVE_VERSION` + migrate) y ALPHA-09. No hay estados de caja ni transacción por caja: DEC-04 BLOCKED
  parcial, no implementado.

## Definiciones

- `storeId` `'decathlon-tienda'`; layout `version: 1` (`src/data/decathlonLayout.ts`, sólo datos y tipos, readonly).
- Departamentos: `dep-running-raqueta` (NW), `dep-montana-camping-agua` (N), `dep-ciclismo` (NE),
  `dep-calzado-mochilas-equip` (C), `dep-futbol-fitness-colectivos` (SW), `dep-natacion` (SE). Cada `SECTOR` en uno:
  - NW: raqueta-padel, running, sportswear, probadores, raqueta (banda central).
  - N: montana-jr, montana-mujer, montana-hombre, camping, camping-2, agua, kayak.
  - NE: segunda-vida, ciclismo.
  - C: calzado-mujer, calzado-hombre, escalada, accesorios, mochilas, minoritarios, caza, pesca, salud, golf, equitacion.
  - SW: fitness-mujer, fitness-mat, fitness-hombre, kids, roller, baloncesto, futbol, colectivos.
  - SE: natacion.
- Pasillos (`minWidth`): norte 3, sur 3, `cajas-acceso` «Acceso a cajas» R(1,41,74,43) 3, `salida` R(45,47,66,49) 3;
  laterales, transversal y cortes 2; colas 1 tile de ancho.
- Cajas: `caja-1`..`caja-6` (`staffed`) con c = 47, 50, 53, 56, 59, 62: cola (c,45)=`_01`, (c,44)=`_02`; cliente (c,46)
  `DECAT_TILL_n` mirando a la derecha; mostrador + registradora (c+1,46); cajero (c+2,46) `DECAT_STAFF_n` mirando a la
  izquierda; salida (c,47). `auto-1` (42,46) y `auto-2` (44,46) (`self`): máquina en (42,47)/(44,47), cola (x,45),(x,44),
  salida (41,46)/(45,46); sin cajero, sin punto, sin oferta.
- Turnos (`open` → `StaffRole.days`/`minLevel`; días 0 lunes … 6 domingo; niveles `VERY_LOW`, `LOW`, `MEDIUM`, `HIGH`,
  `VERY_HIGH` de `config/population.ts`): caja-1 siempre; caja-2 `LOW`; caja-3 `MEDIUM`; caja-4 `MEDIUM` días [4,5,6];
  caja-5 `HIGH` días [4,5,6]; caja-6 `VERY_HIGH`. auto-1 siempre, auto-2 `MEDIUM` (dato sin efecto: no hay personal).
- Entrada `entrada-clientes` y salida `salida-cajas`: el mismo portal `exit` (67,50); spawn `entry` (67,49).
- Nave 76 × 52: filas 0–43 sin cambios; desde la 44 sólo es nave x 41..74 (el resto, muro); fila 50 la puerta; 51 muro.

### Ajustes respecto al encargo

- **Carácter de cola `'e'`, no `'q'`:** `'q'` ya es `tile-quay` (muelle, sólido) en `world/tiles.ts`. `'e'` =
  `tile-floor-queue`, 3 variantes (con 2, `variantKey` da un damero por `(7x+13y) % 2`), cinta `PALETTE.floorTape`
  (entrada nueva en `config/constants.ts`).
- **`salida` empieza en x 45** (no 41): las máquinas de autopago en (42,47) y (44,47) caerían dentro del pasillo, y los
  pasillos no se amueblan.
- **`cajas-acceso` sustituye al pasillo `cajas`** (mismo rect R(1,41,74,43)) en vez de duplicarlo.
- **Colas de autopago de 2 plazas** ((x,45) y (x,44)) para que la regla «cola ≥ 2» valga para todas.
- **raqueta (banda central), kayak, minoritarios, caza y pesca** no estaban asignadas: NW, N, C, C, C.
- **Tres chalecos nuevos** `decathlon_employee_9..11` en `data/npcs.ts`: seis cajeros y check-uniform exige que nadie
  repita aspecto.
- **Mochilas** R(54,14,56,20) y **accesorios** R(57,14,60,20) se reparten el bloque; **fútbol** R(25,26,29,28) y
  **baloncesto** R(25,23,29,25) se reparten el suyo (las dos jaulas de balones pasan a fútbol). Camping arriba crece a
  R(45,2,60,10) sin muebles nuevos; se quitan los muebles de pared de mochilas (55,1),(57,1) y fútbol (59,1).

## Modelo

`DECATHLON_LAYOUT` (`src/data/decathlonLayout.ts`) es la fuente; `src/data/decathlon.ts` deriva de él `AISLES`, los
mostradores y registradoras (`FRONT`), el suelo de cola (`'e'`), los puntos `DECAT_TILL_n` / `DECAT_STAFF_n` /
`DECAT_QUEUE_n_01..02` y los seis `StaffRole` de caja (`days`/`minLevel` copiados de `open`). La clientela sigue el plan
de siempre (BROWSE → QUEUE `DECAT_QUEUE_` → CHECKOUT `DECAT_TILL`). Sin lógica nueva en `systems/`.

**Sin estado guardado nuevo:** no cambia `SAVE_VERSION` ni hay migración. Las partidas dentro de la tienda reaparecen
por `safePosition` (check-decathlon §11 añade (7,43), (67,43) y (67,44)).

## Verificación

| caso | pasos | esperado | obtenido | estado | notas |
| --- | --- | --- | --- | --- | --- |
| a. Layout de la tienda | check-decathlon §14a | `storeId === loc.id`, `version 1` | `check-decathlon` exit 0 («OK · … 34 secciones · 11 pasillos · 10 circuitos · 331 muebles de 32 tipos · 2936 tiles alcanzables») | PASS | |
| b. Departamentos | §14b | 6 zonas; cada sección en uno; centro de cada departamento en su zona | check exit 0; navegador, las 6 zonas: NW (running) y SW (fútbol, jaulas de balones, canasta) con carteles por sección; N (tiendas de campaña y cartel de montaña), C (muros de mochilas de colores y góndolas), NE (bicicletas a la derecha); SE (cartel de natación sobre el banco de cajas) | PASS | zona por centro medio de rects respecto a (38, 22). Capturas `03`, `04`, `06-centro-norte-ciclismo.png` (N, C, NE) y `02`, `05` (SE) |
| c. Cajas | §7, §14c | 6 + 2; todo pisable; cola ≥ 2 fuera de pasillos y en `'e'`; mostrador entre cliente y cajero | check exit 0; navegador: 6 mostradores con registradora, colas con cinta amarilla vertical (sin damero ni lunares), cajeros con chaleco azul detrás del mostrador | PASS | capturas `02-entrada-cajas.png`, `05-cajas-autopago.png` |
| d. Posición | §14d | bajo natación, solapando su ancho, a la izquierda de la puerta | check exit 0; navegador: banco de cajas bajo el cartel de Natación y a la izquierda de la puerta | PASS | |
| e. Alcance y salida | §5, §14e | BFS desde `entry` llega a todo; cada caja a la puerta sin pisar otra cola ni cajero | check exit 0 (BFS entry→todo; till→puerta sin cruzar colas ajenas ni personal) | PASS | |
| f. Anchos | §2 | `minWidth` por rect; principales ≥ 3 | check exit 0 | PASS | |
| g. Puntos y rutas | §5, §8, §14g | `isStandable` y `route()` puerta ↔ cada `DECAT_*` | `check-decathlon` y `check-navigation` exit 0 | PASS | el resumen del orquestador no desglosa §14g; cuenta por el exit 0 del script completo |
| h. Puerta y salida | §14h | portal (67,50), vecinos pisables, nada en `salida`, franja x 41..74 | check exit 0; navegador: se entra en (67,50) con «Salir al aparcamiento»; desde (67,49) E sale a Polígono Norte (38,15) | PASS | |
| i. Turnos | §7, §8 | lunes 12 h ≤ miércoles 18 h ≤ sábado 18 h; sábado 12 h > lunes; nunca 6 a `MEDIUM`; 0 a las 7 y 22 | check exit 0; navegador viernes 13:46: 5 cajeros (la 6.ª sin cajero) | PASS | por cálculo: 3, 3, 6; sábado 12 h 6; a `MEDIUM` máx. 4. Lunes frente a sábado en navegador: NO VERIFICADO (no se fija la hora sin tocar el estado) |
| j. Autopago decorado | §14j | sin punto, oferta, spot, inspect ni perchero | check exit 0; navegador: en (42,46) y (44,46) E no abre nada; las máquinas colisionan (600 ms hacia abajo, avance 2 px) | PASS | |
| k. Ids | §14k | ids únicos; prefijos de caja sin colisión | check exit 0 | PASS | |
| Guardados antiguos | §11 | reaparecen en sitio pisable | check exit 0: (7,43), (67,43), (67,44) a tile pisable | PASS | |
| Resto de checks y build | check-uniform, -agenda, -population, -places, -navigation, -prop-bodies, -world, -art, -layers, -persistence, -recovery, -save-torture, -save-slots, -resale; `npm run build`; `npm run check` | pasan | todos exit 0 (también check-regression y `npx tsc --noEmit`); build exit 0 con el aviso habitual de chunks > 500 kB; `npm run check` exit 0, 235 s, 2376 líneas, «fail 0» | PASS | |
| Navegador: entrar y salir | `npm run dev`, ranura 3, viernes; teclado hasta (38,13), E; salir desde (67,49) | se entra y se sale por la fachada | entra en (67,50); sale a (38,15) | PASS | capturas `01-explanada.png`, `02-entrada-cajas.png` |
| Navegador: pagar en una caja | en `DECAT_TILL_1` (47,46) mirando a la derecha, E | menú de caja; cobra | «DECATHLON · CAJA 1»; «Camiseta técnica» €7,99: €107,50 → €99,51, pasa a «la llevas»; un NPC en cola detrás | PASS | |
| Navegador: tiempo de cobro | menú de CAJA 1 abierto; leer el reloj; pagar «Camiseta técnica» | el contrato decía 2 min; el código cobra la ropa por la ruta del armario (LV-05, `buyGarment` en `src/scenes/Menus.ts:1422`), que suma 5 min por diseño; los 2 min de `CHECKOUT_MINUTES` (`Menus.ts:222`) son de la ruta de catálogo (supermercado) | con el menú abierto el reloj no avanza (0 min en 4 lecturas de 320 ms); al pagar, €107,50 → €99,51 y el reloj sube 5 min | PASS | coincide con el código existente. 2 min para la ropa en caja sería un cambio de LV-05, fuera de DEC-02 |
| Navegador: guardar y recargar dentro | Esc → GUARDAR en (67,48); recargar; CONTINUAR | misma posición, dinero y hora | portada «Decathlon · Polígono Norte · €99,51 · 15:41»; vuelve a (67,48), €99,51, 15:41 | PASS | |
| Navegador: consola | 3 navegaciones | sin errores | sin errores ni avisos | PASS | |
| Móvil / ALPHA-09 | emulación Chrome 390×844, DPR 3, mobile + touch, dentro de la tienda | sin regresión | HUD superior completo (fecha, dinero, Online, mapa, móvil, sonido, bolsa, menú); joystick y botón E visibles; sin scroll horizontal (`scrollWidth` 390); cajas, colas con cinta y cajeros reconocibles | PASS | captura `07-movil-390x844.png` |
| Móvil en dispositivo físico | safe areas de un notch real | sin recortes | no ejecutado (la emulación no las reproduce) | NO VERIFICADO | |
| Cámara, zoom y noche | navegador de noche | sin cambios | no mirado de noche | NO VERIFICADO | el diff no los toca |
| Revisión humana de capturas | revisar `DEC-02/*.png` | aprobadas | pendiente | NO VERIFICADO | |

## BLOCKED / NO VERIFICADO

- **DEC-04 (BLOCKED parcial):** no hay estados de caja ni transacción por caja. El autopago es decorado (sin punto ni
  oferta). El `open` de `auto-2` no tiene efecto.
- **DEC-01, DEC-03, DEC-06:** no existen en `src`; nada depende de ellos.
- **Fecha del plano** («junio 2025»): NO VERIFICADO.
- **Móvil en dispositivo físico** (safe areas de un notch real): NO VERIFICADO; la emulación 390×844 pasa.
- **Lunes frente a sábado en navegador:** NO VERIFICADO; cubierto por check-decathlon.
- **Cámara, zoom y noche:** NO VERIFICADO (no mirado de noche).
- **Revisión humana de capturas:** pendiente.
- **Segunda puerta** del plano: fuera de alcance; un solo portal bidireccional.
- **Reposición con objetos reales:** sigue como ronda por los `DECAT_BROWSE_`, sin mercancía física.

## Riesgos

- **Cliente en una caja cerrada (confirmado por el evaluator):** el plan de visitante resuelve `DECAT_QUEUE_` y
  `DECAT_TILL` por prefijo con `Crowd.freePoint`, así que un cliente puede hacer cola en una caja y pagar en otra o en
  una sin cajero (`src/data/decathlon.ts:468-469`). Queda para DEC-04 (no se ha escrito lógica nueva en Crowd).
- **Efecto lateral de QA:** la pasada anterior de gameplay-qa hizo que el autoguardado modificara la ranura 3 del usuario
  sin copia previa (no existe `lifesim.save.slot3.backup`); el orquestador la devolvió al estado del inicio de su prueba
  (Día 26 · Vie 7 May · 10:15 · €107,50). Tras la pasada de navegador del 14/11/2026 (departamentos, tiempo de
  cobro, móvil) se devolvió otra vez a ese mismo estado.
- **Entorno de prueba:** con la pestaña en segundo plano Chrome baja el juego a 1 fps; hay que traerla al frente para
  probar.
- La nave crece 6 filas: más tiles en `LocationBuilder` y en las mallas de navegación (impacto de rendimiento NO
  VERIFICADO).
- `PALETTE.floorTape` es una entrada nueva de paleta; `tile-floor-queue` se ha visto en el navegador (cinta amarilla
  vertical, sin damero ni lunares); falta la revisión humana de las capturas.
- El cartel de fútbol (27,22) cuelga sobre la transversal; check §9 vigila solapes entre colgados.
