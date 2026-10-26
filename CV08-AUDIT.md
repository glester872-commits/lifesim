# CV-08 · Auditoría de gameplay, simulación, QA y rendimiento

26-10-2026. Revisión sin cambios de producción: los hallazgos se corrigen en 09.
El veredicto vale para esta versión y este alcance; no garantiza ausencia de bugs.

## 1. Versión y entorno

| Campo | Valor |
|---|---|
| Repositorio | `C:/Users/glest/Documents/lifesim`, rama `cv07-ciudad-viva` |
| Commit | `4872ade2807389c791480353830d17fbec8ea81b` |
| Estado de trabajo | diff sin commitear de CV-07 (huella `git diff \| sha1sum` = `9dd087eed40d`): `src/systems/Crowd.ts` (llegada del coro), `scripts/check-city-life.ts`, `CV07-VERIFICATION.md`. Se audita commit + ese diff. |
| Base técnica | Phaser 3.90.0 (WebGL, `renderer.type` 2), TypeScript 6.0.3, Vite 8.3, Node 24.19.0. UI en DOM; arte por código salvo AUD-007. Confirmada. |
| Plataforma | Windows 11 Home 10.0.26200; Chrome de escritorio vía DevTools MCP; `MAX_TEXTURE_SIZE` 16384 |
| Resoluciones | escritorio 958×888 @1 (canvas); emulación móvil 390×844 @3 y 844×390 @3, `touch`, `(pointer: coarse)` |
| Dispositivo físico | **ninguno** (no disponible) |
| Controles | teclado (E/flechas/WASD/P/I/M/Esc), ratón/toques CDP, `PointerEvent` sintéticos `touch` para joystick/E/Volver |
| Datos de prueba | partida nueva aislada; **copia** del guardado real del 19-10 (día 665, €1184,20, sha1 `8712125…`); fixtures dañadas desechables. Guardado personal no leído ni escrito. |
| Calidad | `high` (`lifesim.perf()`) |

Arquitectura localizada (sólo lo necesario): estado `state/GameState.ts`; reglas `systems/*`
(Commerce, Retail, Housing, Gifts, Household, Jobs, Parish, Pregnancy, Crowd, StreetLife,
Traffic, TimeSystem, SaveSystem); contenido `data/*`; render `world/*` (Lighting, LightDepth,
HumanArt) y `entities/*`; UI `ui/*` (Menu, Phone, MobileControls, HUD); coordinación
`scenes/WorldScene.ts` (3 733 líneas) y `main.ts`. Persistencia: `SaveSystem` (versión 1,
`parseState` con defaults por campo), autoguardado cada 10 s de escena, tras acciones y en
`beforeunload`.

## 2. Ejecución y tipo de evidencia

- **Automático (scripts reales):** `npx tsc --noEmit` OK (7,7 s); `npm run check` por comando
  (runner que separa los 91 comandos porque el lanzador de npm puede devolver 0 sin ejecutar
  nada): **91/91 PASS, 0 reintentos, 318 s**; `npm run build` OK, con el aviso previo de chunk:
  `index-*.js` 2 674 kB (803 kB gzip). Sin fallos previos en esta ejecución.
- **Sondas (fixtures, node):** `aud_probe.ts` en el scratchpad (fuera del repo) contra los
  módulos reales: guardados dañados, límites de cobro, doble resolución.
- **Navegador interactivo:** contextos aislados `aud-corrupt`, `cv07-touch`, `cv07-oldsave`.
  Incluye los recorridos de CV-07 en esta misma sesión (partida antigua, tres días, imprevisto,
  táctil/móvil emulados; ver `CV07-VERIFICATION.md`, secciones del 26-10). Las acciones las
  hace el jugador (E, menús, toques); las fixtures sólo colocan ante puertas y adelantan el reloj.
- **Simulación:** `check:city` (siete días deterministas) y las simulaciones de la suite. **No es
  una semana jugada a mano.**

## 3. Matriz requisito → comprobación → evidencia → resultado

Resultado: PASA / FALLA / NC (no comprobado, con motivo) / NA.

### Alcance funcional (nuevas funciones)

| Requisito | Comprobación | Evidencia | Resultado |
|---|---|---|---|
| Iglesia utilizable | entrar en San Blas, hablar con Encarna, «Quedarse hasta el final» | día 672: 12:03→13:30, +6 energía, amistad +5, confianza +3, una asistencia tras recargar | PASA |
| Evento comunitario con asistentes | esperar dentro desde 11:30 | día 693 (con el arreglo CV-07): 5/5 a las 11:58; `check-city-life` 20 domingos | PASA |
| Cinco siluetas de coche | tráfico real en Vallesco, 20 muestras | 7 carrocerías vistas: suv-compact, sedan, hatch, wagon, suv, box-truck, coupe; `check-vehicle-variety` 8 carrocerías | PASA |
| Embarazadas adultas, fases coherentes | datos + reloj + sondas | Noa 32, Amaia 37, Yasmin 29 (`namedPeople.ts:56-58`); fases por día (`phaseAt`); salto a 150 días: 12 eventos, 3 nacimientos, 0 al repetir | PASA (lógica) / NC visual del vientre en esta sesión: ninguna estaba en cámara; cubierto por `check-pregnancy` (`bumpOf`) |
| Supermercado con efecto | comprar, comer, cocinar | €9 + €3,20 = €1179; +16 energía; cocinar +30; sin compra, bloqueado con motivo | PASA |
| Ropa con efecto | probar/comprar, armario | Montón €4 puesta; Hilo €25 al armario y puesta desde casa; recarga conserva | PASA |
| Grandes almacenes con efecto | Velarde: monstera | €39, instalada en `esquina-salon`, dibujada en (17,12) tras recargar | PASA |
| Rutinas (trabajo/turnos) | contratar, fichar, bloqueo, turno perdido | +€60, turno único; «ya está hecho»; aviso único «Te lo has perdido» | PASA |
| Conducción / propiedad de coches | — | no existe; no pedido en CV-04 | NA (fuera de alcance, no es un bug) |
| Vidas domésticas para las 60 identidades ambientales | — | no existen (documentado en CV-07) | NA (incumplimiento de alcance ya registrado, backlog) |

### Matriz de revisión

| # | Área | Comprobación | Evidencia | Resultado |
|---|---|---|---|---|
| 1 | Descubrimiento de acciones | etiqueta contextual de E (ENTRAR/SALIR/COMPRAR/ELEGIR/TERMINAR), bloqueos con motivo | táctil 26-10; notas de menú | PASA |
| 1 | Hitboxes, obstáculos, orden de render | suite (`check-layers`, `check-interaction`, `check-navigation`), pared real en y=49 | 91/91 | PASA (auto) |
| 1 | Entradas/salidas, estados bloqueados | 20 ciclos de puerta; diálogos/menús se cierran; `check-recovery` | sin atascos | PASA |
| 1 | Toques rápidos repetidos | doble/cuádruple toque en cobros | AUD-001 | **FALLA** |
| 2 | Reloj único, delta variable | `TimeSystem.update` acota a 100 ms; 1 fps → reloj 10× lento (diseño) | código + medición | PASA |
| 2 | Pausa / segundo plano | `visibilitychange` simulado: Phaser emite hidden/visible sin errores; pestaña oculta real | — | PASA parcial / NC pestaña oculta de verdad (el MCP no oculta la pestaña) |
| 2 | Medianoche, salto de varios días | `advanceMinutes` emite una medianoche por día; turno perdido avisado una vez; facturas sin duplicar | recorrido CV-07, `check-agenda`, `check-household` | PASA |
| 2 | Repetición de eventos al cargar | coro, turno, embarazo, factura: una vez | sondas + recargas | PASA |
| 2 | Prioridades de rutinas | trabajo > coro > ocio (`Places`, `Parish.busy`) | `check-city-life` | PASA (auto) |
| 3 | Rutas, cruces, atascos | `check-signals`, `check-traffic`, `simulate-streets` | 91/91 | PASA (auto) |
| 3 | Identidad persistente / duplicados | irse y volver: 22/24 mismos ids, 0 duplicados; coro 0 caras repetidas | CV-07 | PASA |
| 3 | Timers/listeners tras reinicio de escena | 20 ciclos casa/súper | listeners juego 22, estado 24, escala 5 constantes; timers 2 | PASA |
| 4 | Cobro/entrega atómicos, saldo exacto/insuficiente | sondas `checkout`: exacto sí, −1 céntimo no, cantidad 0/1,5 no; 10 colas = €1,50 exactos | aud_probe | PASA |
| 4 | Doble clic / repetición rápida | caja y facturas | AUD-001 | **FALLA** |
| 4 | Inventario, equipamiento, consumo | bolsa, armario, cocina | recorridos | PASA (salvo AUD-003) |
| 4 | Regalos | límite diario | AUD-006 | FALLA (hipótesis S3) |
| 4 | Exploits por guardar/recargar | recargas tras sueldo, coro, gimnasio, compras | sin duplicar | PASA |
| 4 | Registro de movimientos | Cuentas | AUD-005 | FALLA (S3) |
| 5 | Versión/esquema, versión futura, truncado | sondas | apartado a `.unreadable`, no se pisa | PASA |
| 5 | Migración de partida anterior | copia real pre CV-02 | carga, facturas desde el día de carga, guía vista | PASA |
| 5 | Datos parcialmente inválidos | sondas + navegador | AUD-003, AUD-004 | **FALLA** |
| 5 | Referencias por ID desconocidas | objeto inexistente en inventario | AUD-003 | **FALLA** |
| 7 | Balance ingresos/gastos, ruta de recuperación | `check:city` (saldo mínimo €45,20), `simulate-budget`; cierre con próxima apertura; turno/coro con alternativa | auto + recorrido | PASA |
| 8 | Rendimiento escena normal | sección 5 | dentro de presupuesto | PASA |
| 8 | Rendimiento escenario de carga | sección 5 | AUD-002 | **FALLA** |
| 8 | Memoria tras ciclos | sección 5 | sin tendencia | PASA |
| 8 | Dispositivo móvil real | — | sin dispositivo | NC |
| 9 | Menús, foco, cierre, táctil/teclado, intercepción del movimiento | CV-07 táctil 26-10 | ningún control atascado; menú no tapa el joystick | PASA (emulado) |
| 9 | Contraste / lectores de pantalla | — | no medido | NC (sin herramienta de contraste conectada; queda para 09) |
| 10 | Límites entre módulos, trabajo por frame, fuentes de estado | revisión dirigida | una fuente de verdad por dominio (GameState); el trabajo de la escena es bajo (mediana 2,4–2,8 ms) | PASA, con AUD-002 (render) y AUD-007 |

## 4. Hallazgos

Gravedad: S0 bloqueo/pérdida de datos · S1 grave sin alternativa · S2 relevante con alternativa ·
S3 menor. Todos se reprodujeron salvo los marcados como hipótesis.

### AUD-001 · S2 · Toques rápidos actúan sobre la pantalla siguiente (compras no elegidas, pago sin confirmar)
- **Pasos:** súper → caja → «Barra de pan» → cuatro toques/clics en el mismo punto sobre
  «Pagar» (intervalo 80 ms). Móvil → Cuentas → dos o más toques sobre «Alquiler».
- **Esperado:** un pago de la barra; el alquiler pide confirmación.
- **Real:** se cobran la barra (€0,90) **y un sándwich (€2,20) no elegido**: «Pagar» y el tercer
  producto ocupan la misma fila. En el móvil, el segundo toque cae en «Confirmar pago» (y 472–525,
  la fila estaba en 451–504): se pagan alquiler y luz (€55) sin confirmar. Un doble clic real de CDP
  cobra una vez, pero abre el sándwich.
- **Frecuencia:** 1/1, determinista con la disposición actual.
- **Archivo/causa:** `src/ui/Menu.ts:96-131` (`confirm` → `onPick` → `open/render` sustituye los
  `li` al instante, sin bloqueo de entrada); `src/ui/Phone.ts:749-757` (`item`) y `:615-635`
  (`renderPay`). Las puertas ya tienen un bloqueo de llegada de 450 ms (QA.md), los menús no.
- **Impacto:** gasto no pretendido; la confirmación de pago deja de proteger.
- **Corrección sugerida:** ignorar elecciones (clic, toque, E) durante ~250–300 ms después de
  que un menú o una pantalla del móvil cambie de opciones; o aceptar el clic sólo si su
  `pointerdown` empezó sobre ese mismo `li`.
- **Regresión:** script de navegador en `scripts/qa/` que dispare 4 toques a 80 ms sobre
  «Pagar» y sobre una factura y compruebe un único apunte y ningún pago sin confirmar, más
  una prueba unitaria de `Menu` con reloj inyectado.

### AUD-002 · S2 · Tirones periódicos al repintar la luz (framebuffer recreado), graves al atardecer
- **Pasos:** Puerta Central, sábado (día 671) 19:00–19:20, bucle real a 60 Hz, 900–1 800 frames.
- **Esperado:** intervalo p95 ≤ 16,7 ms (60 Hz) y como mucho alguna caída aislada.
- **Real:** p95 **33,6–33,8 ms**, p99 **67–83 ms**, 142–304 intervalos > 33 ms (16–17 %). A mediodía en
  Vallesco: 14 caídas de 50–66 ms en 30 s. Cada caída coincide con un `Lighting.relight`
  (41 en 15 s al atardecer) y con **2 `RenderTarget.resize`** (82 en 15 s) entre 543×508
  (mapa de luz) y 896×640 / 1760×976. El 95 % de las muestras de CPU de los picos están en
  `checkFramebufferStatus` ← `createFramebuffer` ← `RenderTarget.resize` ← `DynamicTexture.draw`.
- **Archivo:** `src/world/Lighting.ts` (`update`: clave de luz → `relight` + `paintLightmap`;
  `paintZones`/`paintLightmap` hacen un `map.draw()` por zona y por tejado; `relight` hace
  `windowsBaked.clear().draw`) y `src/world/LightDepth.ts` (`rt.draw(batch)` cada frame).
- **Causa:** confirmado el disparador (cada repintado de luz ⇒ 2 recreaciones de framebuffer).
  Hipótesis del mecanismo: en Phaser 3.90 las `DynamicTexture` de distinto tamaño acaban
  redimensionando el mismo `RenderTarget` con `autoResize`; anular `windowsBaked` en la página
  no lo quita (siguen 80), el vaivén sale de mapa de luz ↔ capa de `LightDepth`.
- **Impacto:** pérdida de fluidez visible, sobre todo al amanecer y al anochecer (la clave de luz
  cambia casi cada minuto de juego). Sin medir en móvil, donde recrear un framebuffer suele costar más.
- **Corrección sugerida:** que el mapa de luz se escriba en un solo `beginDraw()/endDraw()` por
  repintado (`stamp`/`batch` en lugar de `draw` sueltos), que las texturas no compartan objetivo
  de tamaño distinto o que no cambien de tamaño, y cuantizar la clave del cielo al atardecer.
- **Regresión:** script de navegador que cuente `RenderTarget.resize` efectivos por repintado (0)
  y mida p95 ≤ 16,7 ms con la misma escena (día 671 19:00, Puerta Central, `pc-metro`).

### AUD-003 · S2 · Un objeto con id desconocido deja la Bolsa inutilizable para siempre
- **Pasos:** copia de partida con `inventory: { "tarta-retirada": 1 }` → cargar → botón Bolsa / I.
- **Esperado:** carga y se descarta (o se muestra) el objeto desconocido; la bolsa funciona.
- **Real:** carga, pero al abrir la Bolsa `Uncaught Error: Objeto desconocido: tarta-retirada` y
  no se abre; el id se vuelve a guardar, así que no se recupera recargando. No se puede comer ni
  regalar desde la bolsa.
- **Archivo/causa:** `src/systems/SaveSystem.ts:522-533` (`parseCounts` acepta cualquier clave
  con número ≥ 0); `src/scenes/Menus.ts:218` (`openBag` → `getItem` lanza, `data/items.ts:65`).
  Afecta también a `cards`.
- **Impacto:** cualquier partida que guarde un objeto que luego se renombre o elimine de los datos,
  o una partida dañada, pierde el acceso al inventario.
- **Corrección sugerida:** filtrar `inventory`/`cards` por ids conocidos en `parseState` y, como
  defensa, que `openBag` ignore lo desconocido.
- **Regresión:** fixture en `check-save-torture.ts` con id desconocido: carga sin él y la bolsa
  se abre sin lanzar.

### AUD-004 · S3 · `parseState` admite valores imposibles
- **Pasos (sondas):** cargar fixtures con `money: -50`; `inventory: { coffee: 2.5 }`;
  `appearance.player.top` de una prenda que no está en `wardrobe`; `parish.attended` con el mismo
  `coro-7` dos veces.
- **Real:** las cuatro cargan tal cual (dinero −50, 2,5 cafés, prenda puesta sin poseerla, dos
  asistencias). El README promete «ni saldo negativo».
- **Archivo:** `SaveSystem.ts:329` (`money: s.money`), `:522` (`parseCounts` sin entero),
  `parseAppearance`, `parseParish`.
- **Impacto:** sólo con guardados manipulados o dañados; pueden falsear contadores (coro) y la
  economía.
- **Corrección:** acotar el dinero a ≥ 0 y a céntimos, cantidades a enteros, apariencia ⊆ armario
  y asistencias únicas por id.
- **Regresión:** las cuatro fixtures en `check-save-torture.ts`.

### AUD-005 · S3 · Movimientos fusionados con una cantidad falsa
- **Pasos:** comprar 1 barra, volver, comprar 1 barra el mismo día → Móvil → Cuentas.
- **Real:** «1 × Barra de pan · −€1,80» (eran dos de €0,90).
- **Archivo/causa:** `src/state/GameState.ts:272-284` (`record` suma por etiqueta igual el mismo
  día; la etiqueta incluye «N ×»).
- **Corrección:** sumar también la cantidad, o no fusionar compras con cantidad en la etiqueta.
- **Regresión:** `check-economy`: dos compras iguales el mismo día ⇒ «2 × …» o dos líneas.

### AUD-006 · S3 · (hipótesis) El límite de un regalo al día depende de recuerdos con tope
- **Sonda:** regalo → segundo regalo bloqueado → 40 recuerdos más del mismo día → tercer regalo
  **aceptado**.
- **Archivo:** `src/systems/Gifts.ts:29-32` (busca el regalo en `profile.memories`);
  `Social.ts:1657` y `:1869` (tope de 40).
- **Alcance real:** no reproducido jugando; las charlas añaden recuerdos por acción, así que
  parece alcanzable con muchas charlas el mismo día. Ganancia baja (amistad +6 por bombones de pago).
- **Corrección:** guardar `lastGiftDay` en el perfil. **Regresión:** prueba unitaria como la sonda.

### AUD-007 · S3 · PNG binario sin usar, contra la regla del proyecto
- `src/assets/characters/sara-hd.png` (49,9 kB, «Prompt 52», 05-10) se carga en
  `src/scenes/BootScene.ts:2,21` y ninguna parte del código lee la textura `sara-hd`.
  `CLAUDE.md` y `ART_BIBLE.md` dicen «sin assets binarios».
- **Impacto:** descarga y memoria de GPU para nada; regla incumplida sin excepción documentada.
- **Corrección:** quitar la carga y el archivo, o documentar la excepción.
  **Regresión:** comprobación de que no hay binarios en `src/`.

### AUD-008 · S3 · (riesgo, no comprobado) Sin guardado al pasar a segundo plano en móvil
- `src/main.ts:920` sólo guarda en `beforeunload`; el autoguardado (`WorldScene.ts:789`, 10 s de
  tiempo de escena) se detiene con la pestaña oculta. Los navegadores móviles pueden cerrar una
  pestaña en segundo plano sin `beforeunload`, y se pierde lo hecho sin acción guardable desde el
  último autoguardado (≤ 10 s).
- **Corrección:** guardar también en `visibilitychange` (oculta) y en `pagehide`.
- **Regresión:** prueba de navegador que emita `visibilitychange` y compruebe la escritura;
  confirmar en un dispositivo real.

### AUD-009 · S3 · Afordancias de funciones no implementadas
- Móvil: «Cámara» y «Música» visibles, desactivadas con «Próximamente» (`src/ui/Phone.ts:364`).
  `CLAUDE.md`: «Si una feature no está implementada, no debe existir su afordancia».
- **Corrección:** ocultarlas hasta que existan, o registrar la excepción en `CLAUDE.md`.

## 5. Métricas (bucle real, Chrome de escritorio, calidad `high`, ventana visible a ~60 Hz)

Método: `game.loop.callback` cronometrado (trabajo de actualización + render del frame) y los
intervalos entre `requestAnimationFrame`; 1 800 frames tras 2,5 s de asentamiento. La población
sale de la hora y el sitio (semillas por día y franja), en la misma cámara (spawn fijo, sin moverse).

| Escena | Trabajo/frame mediana · p95 · p99 · máx (ms) | Intervalo mediana · p95 · p99 (ms) | > 33 ms | Agentes · cerca · coches · objetos | Texturas · heap |
|---|---|---|---|---|---|
| Normal: Vallesco, día 667 13:00, `home-door` | 2,8 · 4,7 · 8,0 · 78 | 16,7 · 16,9 · 17,3 | 14 / 1 800 | 35 · 18 · 24 · 1 291 | 2 557 · 269 MB |
| Carga: Puerta Central, día 671 19:00, `pc-metro` | 2,4 · 8,2 · 77 · 98 | 16,7 · **33,8** · **83,4** | **304 / 1 800** | 40 · 30 · 8 · 678 | 2 609 · 279 MB |
| Carga repetida, 19:20 (900 frames) | 2,3 · 7,8 · 70 · 96 | 16,7 · 33,6 · 66,9 | 142 / 900 | — | — |

- **Presupuesto aplicado:** `config/budgets.ts` (`high`: 110 agentes, 24 coches, 4 200 objetos) y
  frame de 16,7 ms (60 Hz en el equipo de referencia de escritorio); la calle se recorta sola
  por encima de 22 ms de trabajo. Ningún recuento pasó del presupuesto (`over: []`,
  `budgetScale: 1`). El fallo de carga es de render (AUD-002), no de simulación.
- **Memoria:** 20 ciclos casa ↔ calle ↔ súper: listeners 22/24/5 constantes, timers 2, objetos
  1 087 → 1 105, texturas +6 (caras nuevas, acotadas), heap entre 269 y 310 MB sin tendencia
  (sin GC forzado: el heap es orientativo). Atlas `people` 3 840×4 080 (< 4 096).
- **Límites de la medición:** sin dispositivo móvil ni perfil de GPU. El modo de pasos
  (`game.step` con el bucle dormido) exageraba los picos (hasta 1 s) porque cada paso sincroniza
  con la GPU, así que se descartó para la fluidez y sólo sirve para atribuir causas (traza en el
  scratchpad `aud-trace.json.gz`). Sin GC forzado, la memoria no prueba la ausencia de fugas
  lentas en sesiones largas.

## 6. Riesgos residuales

- Teléfono real: gestos, desplazamiento con el dedo, zonas seguras, coste de AUD-002 en GPU
  móvil, AUD-008 y los 2 px de más de la página (CV-07). Nada de esto está comprobado.
- Pestaña oculta de verdad (el MCP no la oculta): sólo se simuló `visibilitychange`.
- Vientre de las embarazadas en pantalla: no reverificado en esta sesión.
- Contraste y accesibilidad con lector de pantalla: no medidos.
- Semana jugada a mano: sólo existe la simulación `check:city`.
- `WorldScene.ts` concentra 3 733 líneas de coordinación: riesgo de regresiones cruzadas. No se
  propone refactor sin un fallo concreto que lo justifique.

## 7. Backlog de diseño (recomendaciones, no defectos)

- Comer con la energía al máximo gasta el alimento sin efecto ni aviso: avisar o bloquear.
- La pista «Elige con 1–4» sale también en táctil: «Toca una respuesta».
- «Hoy» no muestra facturas vencidas (previsto; están en Cuentas): valorar una línea «Tienes
  pagos vencidos» que lleve a Cuentas.
- Comentario desfasado: `SaveSystem.ts:362` dice «el próximo sábado»; el coro es el domingo.
- Bundle de 2,67 MB (803 kB gzip): dividir si la carga en móvil resulta lenta.
- Pendientes de alcance ya registrados: vidas domésticas de la población, menú de partidas (102),
  conducción/propiedad de coches, nuevos negocios/empleos/barrios.

## 8. Veredicto

- **Escritorio (Chrome, teclado/ratón) y emulación móvil:** **APTO CON RESERVAS.** No hay S0/S1
  abiertos; quedan tres S2 conocidos (AUD-001, AUD-002, AUD-003) con alternativa jugable (tocar
  despacio, tolerar tirones, no tener ids desconocidos) y seis S3.
- **Dispositivo móvil físico:** **PENDIENTE**. Sin dispositivo, faltan pruebas esenciales (táctil
  real, rendimiento de GPU, segundo plano). No se aprueba por falta de evidencia.

## 9. Orden de reparación para 09

1. **AUD-003**: el que más daña datos, y su corrección es pequeña (filtrar ids al cargar más
   defensa en `openBag`).
2. **AUD-001**: bloqueo de entrada tras cambiar un menú o una pantalla del móvil (un solo sitio
   en `Menu.ts` y `Phone.item`).
3. **AUD-002**: repintado de luz sin recrear framebuffers; medir con la escena de carga antes y
   después.
4. **AUD-008**: guardar en `visibilitychange`/`pagehide` (dos líneas, alto valor en móvil).
5. **AUD-004**, **AUD-005**, **AUD-006**: endurecer el parseo, el registro de movimientos y el
   límite de regalos.
6. **AUD-007**, **AUD-009**: limpieza de reglas del proyecto.
7. Repetir en un teléfono real y en una pestaña oculta de verdad; cerrar las NC de la matriz.

---

## 10. CV-09 · Resolución (26-10-2026)

Evidencia inicial (secciones 1–9) conservada sin cambios. Versión corregida: commit
`4872ade` + diff de trabajo (huella `git diff | sha1sum` = `2d7e236d97a1`; sin commit). Mismo entorno
que la sección 1 (Chrome de escritorio vía DevTools MCP, contexto aislado `cv09`, copia del guardado
real del 19-10; sin dispositivo físico).

### Estado por hallazgo

«Código cambiado» = hay un cambio en el módulo dueño. «Verificado» = la regresión falla sin el
cambio y pasa con él, y el caso original se repitió con acciones de jugador.

| ID | Código cambiado | Verificado | Estado |
|---|---|---|---|
| AUD-001 | `ui/Menu.ts` (`confirm` ignora elecciones durante `PICK_LOCK_MS` = 300 ms tras una pantalla nueva; rehacer la misma pantalla, p. ej. «Más», no bloquea), `ui/Phone.ts` (mismo bloqueo al cambiar de pantalla: `confirm`, `pick`, clic), `config/constants.ts` | `scripts/qa/cv09-regressions.js`: sin el cambio, el doble toque elige `A2,B2` y el segundo toque paga el alquiler (€1129,20 → €1084,20); con él, `A2` y ningún pago hasta confirmar a propósito. Recorrido real: cuatro toques a 80 ms sobre «Pagar» cobran sólo la barra (€1074,20 → €1073,30), 3/3 veces | **RESUELTO** |
| AUD-002 | `world/Lighting.ts` (`ownCapture`: el repintado del mapa de luz y de las ventanas usa objetivos de captura propios, uno por tamaño; el del renderer no se redimensiona; se destruyen al cerrar la escena) | Escena de carga en A/B alterno: cambios de tamaño del objetivo compartido 82 → **0**; trabajo por frame máx. 70–99 → 8–10 ms; peor intervalo 100 → 67 ms. Normal: >33 ms 14 → 2. Framebuffers vivos 102 → 102 tras 20 ciclos | **RESUELTO** en su causa; queda AUD-010 |
| AUD-003 | `systems/SaveSystem.ts` (`parseCounts` sólo con ids de `data/items.ts`; inventario en unidades enteras; tarjetas sólo `card`, en céntimos) | `check-save-torture` (falla antes: «dinero negativo al cargar»); navegador: un objeto desconocido no entra al cargar. Recorrido real con recarga: la Bolsa abre con I, se come una barra, nada se duplica al recargar | **RESUELTO** |
| AUD-004 | `SaveSystem.ts` (dinero ≥ 0 en céntimos; ropa puesta del jugador ⊆ armario), `systems/Parish.ts` (`parseParish` sin ensayos repetidos) | `check-save-torture`: −50 → 0, 12,3456 → 12,35, 2,5 cafés → 2, prenda ajena fuera, coro repetido → 1 | **RESUELTO** |
| AUD-005 | `systems/Household.ts` (`recordMovement`, regla del registro con suma de cantidades), `state/GameState.ts` delega | `check-household`: 1+1+2 barras ⇒ «4 × Barra de pan −3,60»; otro producto u otro día, línea aparte. Recorrido real: «2 × Barra de pan · −€1,80» en Cuentas y tras recargar | **RESUELTO** |
| AUD-006 | — | — | **ABIERTO (S3, hipótesis)**: necesita un campo nuevo en el perfil social con migración; no reproducido jugando |
| AUD-007 | — | — | **ABIERTO (S3)**: quitar `sara-hd.png` es borrar un activo del autor; decisión del propietario (quitarlo o documentar la excepción) |
| AUD-008 | `main.ts` (guardar en `visibilitychange` oculta y `pagehide`) | `cv09-regressions.js`: sin el cambio `savedAt` no cambia al ocultarse; con él, sí. **No comprobado en un móvil real** | **RESUELTO (código y simulación)**; falta un dispositivo |
| AUD-009 | — | — | **ABIERTO (S3)**: «Cámara»/«Música» «Próximamente»; decisión de producto (ocultar o registrar la excepción) |

### Hallazgo nuevo

**AUD-010 · S2 · Al anochecer y de noche en Puerta Central uno de cada 5–10 frames pasa de 33 ms con la
CPU desocupada.** Lo destapó el arreglo de AUD-002. Con el objetivo compartido ya sin cambios de tamaño
y un trabajo de CPU p99 de 7–8 ms, el intervalo p95 sigue en ~33,5 ms (21 → 57 intervalos > 33 ms en
450 frames entre 19:00 y 20:00, creciendo con la noche). Hipótesis: coste de GPU por frame (capas aditivas
de `LightDepth`, mapa de luz `MULTIPLY` a pantalla completa, luces de escaparate), no medido porque no hay
perfil de GPU disponible. Parte de la cifra de carga de la sección 5 (p95 33,8 ms) era esto, no AUD-002.
Siguiente paso: traza de GPU (Chrome «GPU» o `EXT_disjoint_timer_query`) en la misma escena, desactivando
capas una a una. No se corrige en este lote.

### Rendimiento antes/después (bucle real, misma máquina y escena)

| Escena | Métrica | Auditoría (antes) | CV-09 (después) |
|---|---|---|---|
| Vallesco 13:00, `home-door`, 1 800 frames | trabajo/frame p99 · máx | 8,0 · 78 ms | 6,1 · 7,5 ms |
| | intervalo p95 · p99 · máx | 16,9 · 17,3 · 66,8 ms | 16,8 · 16,9 · 66,7 ms |
| | intervalos > 33 ms | 14 | 2 |
| Puerta Central 19:00–20:00, `pc-metro`, A/B alterno 4 × 450 | cambios de tamaño del objetivo compartido | 82 por 900 frames | 0 |
| | trabajo/frame máx | 70 / 99 ms (sin el arreglo) | 8 / 10 ms (con él) |
| | peor intervalo | 67 / 100 ms | 67 / 67 ms |
| | intervalo p95 | 33,4–50,1 ms | 33,5–33,6 ms (AUD-010) |

Ningún recuento pasó de `config/budgets.ts`. La memoria tras 20 ciclos: framebuffers 102 → 102,
texturas +81 (caras nuevas), heap 211 → 249 MB sin GC forzado (orientativo).

### Compatibilidad de partidas

- Copia de la partida real del 19-10 (anterior a CV-02): carga en el contexto `cv09` con los arreglos,
  compra, come, paga y recarga; saldo, bolsa, facturas pagadas y movimientos iguales tras recargar.
- Partida nueva: `check-regression`, `check-save-torture` y `check-city-life` (migración sintética).
- Sin cambio de `SAVE_KEY` ni de `SAVE_VERSION`; ningún campo nuevo en el guardado. Lo que cambia
  es lo que se descarta al cargar: ids desconocidos, cantidades fraccionarias, dinero negativo,
  ropa puesta que no está en el armario y ensayos repetidos. Una partida sana carga igual
  (`guardar→cargar ×5 estable`).

### Pruebas ejecutadas en este lote

- Por grupo: `check-save-torture`, `check-regression`, `check-economy`, `check-parish`, `check-recovery`,
  `check-city-life`, `check-pregnancy`, `check-household`, `check-garments`, `check-housing`,
  `simulate-budget`: OK. `tsc --noEmit`: OK.
- Navegador: `scripts/qa/cv09-regressions.js` 7/7 con los arreglos; sin ellos fallan las de AUD-001,
  AUD-003 y AUD-008 (véase la tabla).
- Validación global: sección 10.1, abajo.

### Pendiente

AUD-010 (perfil de GPU), AUD-006/007/009 (S3, decisión o migración), teléfono físico (táctil, rendimiento,
segundo plano real), pestaña oculta de verdad, vientre en pantalla, contraste, semana jugada a mano.

### 10.1 Validación global (versión corregida)

- `npx tsc --noEmit`: OK.
- `npm run check` con el runner por comando: **91/91 PASS, 0 reintentos, 219 s**.
- `npm run build`: OK; `index-*.js` 2 675,85 kB (804,07 kB gzip), el mismo aviso de chunk de antes.

### 10.2 Veredicto CV-09

- **Escritorio (Chrome, teclado/ratón) y emulación móvil: APTO CON RESERVAS.** Ningún S0/S1 reproducible
  abierto. Resueltos y verificados AUD-001, 002, 003, 004 y 005; AUD-008 resuelto en código y
  simulación. Abiertos: **AUD-010 (S2, rendimiento nocturno en Puerta Central, sin perfil de GPU)** y
  AUD-006/007/009 (S3).
- **Dispositivo móvil físico: PENDIENTE** (sin dispositivo; sin aprobar por falta de evidencia).

### 10.3 Punto de continuación

Último cambio: `Lighting.ownCapture` (AUD-002) y regresiones `scripts/qa/cv09-regressions.js`. Siguiente
comprobación: traza de GPU de AUD-010 en Puerta Central (día 671, 19:00–20:00, `pc-metro`) y repetir
`cv09-regressions.js` y las mediciones en un teléfono real.

## 11. Pendientes de CV-09 (26-10-2026, sesión interrumpida por límite de uso)

**AUD-010 · NO REPRODUCIDO, sin cambio de código.** Misma escena (copia de la partida, Puerta Central,
día 672, `pc-metro`), Chrome de escritorio con la página **traída al frente** (`select_page bringToFront`):
19:25, 19:40, 21:43 y 21:53 → intervalo p95 16,8–16,9 ms, p99 ≤ 17 ms, **0 frames > 33 ms**; CPU
(loop.callback) p99 4–7 ms; **GPU medida con `EXT_disjoint_timer_query`** (AMD RX 6600, ANGLE D3D11):
mediana 6,4–8,0 ms, p99 12–14,8 ms, 0 disjoint. Traza nocturna (`aud010-night-trace.json.gz`, scratchpad):
`CrRendererMain` p95 2,8 ms; `CrGpuMain` p95 ~15 ms (incluye la espera de swap). Con la ventana tapada,
rAF cae a 1 fps (medido: 1001 ms): factor no controlado en la medida de CV-09; no se puede demostrar que
fuera la causa. Riesgo residual: la GPU usa hasta ~15 ms de 16,7 en el p99 de esta máquina; en móvil, sin medir.

**AUD-006 · RESUELTO (automático); recorrido en navegador PENDIENTE.** Especificación: «a la misma
persona, un regalo al día» (`Gifts.ts`, `QA.md:159`): límite **por persona**. Reproducido con las funciones
reales: tras 40 charlas con cumplido el mismo día (no hay enfriamiento entre charlas) se aceptaba un segundo
regalo. Cambio: `SocialProfile.giftDay?` (opcional; `parseSocialState` lo valida; `cloneProfile` lo copia),
`giveGift` lo fija y `giftBlocker` lo consulta además del recuerdo (partidas antiguas). Regresión en
`check-department.ts`: falla sin el cambio («tras 40 charlas el mismo día se regala otra vez»), pasa con él;
cubre segundo regalo bloqueado sin gastar la caja, guardar/cargar, día siguiente permitido, otra persona no
afectada y `giftDay` inválido descartado. Pasan también `check-chat`, `check-contact`, `check-story`,
`check-phone`, `check-regression`, `check-save-torture` y `check-parish`. El recorrido con una charla real
en el navegador no se terminó: no se consiguió a Sara como objetivo de E (junto a una puerta).

**Sin hacer en esta sesión:** AUD-007 (documentar o no la excepción de `sara-hd.png`), AUD-009 (comprobar al
pulsar Cámara/Música y documentar), suite completa y build tras el cambio de AUD-006, y las comprobaciones
pendientes (dispositivo físico, pestaña oculta de verdad, embarazo en pantalla, contraste, semana jugada).

## 12. Cierre de pendientes (26-10-2026, continuación)

Entorno: Chrome de escritorio del MCP (perfil propio `.cache/chrome-devtools-mcp`), contexto aislado `cv11`,
copia del guardado real del 19-10; la partida del usuario no se ha leído ni escrito. Sin dispositivo físico
(`adb` no instalado y ningún teléfono conectado).

| Pendiente | Estado | Evidencia | Cambio |
|---|---|---|---|
| Validación tras AUD-006 | **PASA** | `tsc` OK; `npm run check` por comando **91/91, 0 reintentos, 205 s**; `npm run build` OK | — |
| AUD-006 en el navegador | **VERIFICADO salvo «día siguiente»** | Charla real con Sara en Hilo (día 673): 1.º regalo amistad 50 → 56, ánimo 67 → 77, `giftDay` 673, 1 caja menos y el mismo dinero; 2.º regalo «Hoy ya le has dado algo. Mejor otro día.» sin perder caja ni dinero; **tras guardar y recargar**, otra vez bloqueado. «Al día siguiente se puede» sólo en `check-department`: al aceptar el favor de su historia, Sara cambió de plan y no se la encontró el día 674 | código de §11 |
| AUD-007 `sara-hd.png` | **DOCUMENTADO** | `src/assets/characters/sara-hd.png`, hoja de caminar 4×4 de 48×72 («Prompt 52», 05-10, junto a `design/render-pass/`). Sólo la carga `BootScene`; ningún commit lee la textura. Material de reserva y referencia: no se borra | excepción en `design/ART_BIBLE.md` y en la línea de `CLAUDE.md` que prohíbe binarios |
| AUD-009 Cámara/Música | **DOCUMENTADO, sin fallo** | Marcadores intencionados (`Phone.renderHome`: «Decorativas»), `disabled` con «Próximamente». Clic de CDP rechazado («no interactivo»); toque por coordenadas: se sigue en el inicio, sin errores, sin efecto en el mundo; el teclado recorre sólo las 6 apps activas | excepción en `CLAUDE.md` (regla de afordancias) |
| Pestaña oculta de verdad | **NO COMPROBADO (bloqueado)** | La ventana del juego se minimizó de verdad (`ShowWindow` → `IsIconic: True`, 8 s): no llegó `visibilitychange`, `document.hidden` siguió en `false` y el reloj avanzó 12 min. El MCP arranca Chrome con `--disable-backgrounding-occluded-windows` y `--disable-background-timer-throttling`, que lo impiden. Sigue siendo sólo simulado (§10) | — |
| Embarazo en pantalla | **VERIFICADO** | Texturas por fase en la escena real: `yasmin~p1` (early, día 687), `amaia~p2` (mid, día 675), `noa~p3` (late, día 674). Capturas a ×8: `preg-phases-p1-p2-p3.png`, `preg-early-profile.png` (early: 1 px de perfil, plana de frente, como el diseño), `preg-frames-late-vs-waiting.png`, `preg-noa-late.png` (Noa sentada en la calle) | — |
| Contraste HUD/móvil/menús | **PASA (WCAG AA)**, diálogos sin medir | Pila de fondos compuesta sobre blanco (día) y negro (noche), peor caso: HUD 6,21; móvil inicio 8,48; Hoy 5,76; Cuentas 4,56; Bolsa 3,79 sólo en la opción **deshabilitada** «Tarjeta de transporte» (inactiva: WCAG no lo exige) | — |
| Teléfono y táctil en dispositivo físico | **NO COMPROBADO** | Sin dispositivo | — |
| Semana jugada a mano | **NO COMPROBADO** | Sólo existe la simulación `check:city`; no se presenta como jugada | — |

Capturas en `C:/Users/glest/AppData/Local/Temp/claude/C--Users-glest--claude/ce5dbb98-d972-4395-b214-38d7e3966a6d/scratchpad/`.
Observación sin cambio: con un perchero al lado de un personaje con nombre, E elige el perchero y no se puede
hablar con él hasta que se mueve (la regla única de objetivos de `check-interaction`); no se ha tratado como
fallo.

### Veredicto actualizado

Escritorio y emulación móvil: **APTO CON RESERVAS**. Sin S0/S1. Resueltos y verificados AUD-001–006;
AUD-008 en código y simulación; AUD-007 y AUD-009 documentados como excepciones; AUD-010 no reproducido
(§11). Dispositivo físico, pestaña oculta real y semana jugada: **PENDIENTES** por falta de hardware o por
la configuración del navegador de pruebas.
