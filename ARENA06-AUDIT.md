# ARENA 06 · Auditoría del Estadio del Halcón contra ARENA 01–05

26-10-2026, 16:20–16:42. Sólo verificación: no se ha cambiado código ni diseño.

## Versión y entorno

| Campo | Valor |
|---|---|
| Ruta | `C:/Users/glest/Documents/lifesim`, rama `cv07-ciudad-viva` |
| Commit | `4872ade` + cambios locales sin commitear (CV-07 a CV-10) |
| Huella de la copia | `(git status --porcelain; git diff) \| sha1sum` = `1da022bb…`, **igual al empezar y al acabar**: ninguna otra sesión cambió la copia durante la auditoría |
| Especificación | Notion, «Estadio del Halcón — Experiencia de espectador · 5 prompts» (ARENA 01–05) |
| Navegador | Chrome de escritorio del MCP (perfil propio), contexto aislado `arena06`, Vite en 127.0.0.1:5298 |
| Viewport | escritorio 958×888 @1. Móvil: no probado en esta auditoría |
| Datos | copia del guardado real del 19-10 (día 665); la partida habitual no se ha leído ni escrito |
| Partidos usados | 672 (18:30, victoria 1-0), 685 (21:00, 2-1, goles de los dos equipos, cruza medianoche en `after`), 686 (sin partido), 689 (16:00, para «demasiado pronto»). Calendario determinista (`Match.upcomingMatches`); sin semilla aparte |
| Fixtures | sólo para adelantar el reloj (`advanceMinutes`), poner al jugador ante una puerta o mostrador, bajar el saldo a €10 (y restaurarlo) y la energía a 70. Las compras, los tornos, el metro, sentarse y caminar se hicieron con controles normales (E, flechas, menús y opciones) |

## Comprobaciones automáticas

| Comprobación | Resultado | Qué afirma |
|---|---|---|
| `check-arena` | OK, 1 s | distrito y fases; 19 partidos en 12 semanas; tope de 72 paseantes |
| `check-stadium` | OK, 1 s | 54 asientos en 3 filas, escalera, césped sin pisar; compra a €25; puerta: sin entrada, pronto, a tiempo, tarde, final, otro partido, sin partido |
| `check-match-play` | OK, 1 s | 1'–45+2 / descanso / 46'–90+3 dentro de los 110 min de `live`; 51 partidos; 8 jugadas distintas; visto = no visto; marcador en su minuto; tarde, salir/volver, saltos y medianoche |
| `check-stand-life` | OK | humor de la grada, avisos de una vez, celebración que se apaga, topes |
| `check-concourse` | OK | quiosco antes del saque y en el descanso; charla sin inventar goles; ≥ 4 frases por tema; no repite |
| `check-attendance` | OK, 1 s | visita de punta a punta en las costuras reales; medianoche; caducidad; partidas antiguas |
| `npm run check` | **agotó el límite de 900 s** (salida 124) tras imprimir hasta `check-pickpocket` | `check-police`, el siguiente, pasa solo en 3 s: es el cuelgue conocido del lanzador de npm en este Windows, no un fallo de prueba |
| runner por comando (los mismos 91 comandos de `scripts.check`) | **91/91 PASS, 0 reintentos, 213 s** | — |
| `npm run build` | OK, 5 s (aviso de chunk de siempre) | — |

**Error del estudio en recarga en caliente** (`portal "exit" busca el spawn "res-olmo-11"`): **no se reproduce en frío**. En Node, el
registro real tiene `district.spawns['res-olmo-11']` = (50,51) y **0 portales** de todo el juego apuntan a spawns inexistentes; el
arranque en frío del navegador no da ni errores ni avisos en consola. Era de la edición en caliente de vivienda/localizaciones;
no es del estadio y no se ha tocado.

## Matriz

R = recorrido jugado en navegador · S = prueba de sistema (script) · NC = no comprobado.

### ARENA 01 — Entradas, tornos, interior

| Requisito | Prueba | Evidencia | Resultado |
|---|---|---|---|
| Llegar en metro ordinario | R | Vallesco → «Arena · Estadio del Halcón 60 min · €2»: tarjeta €4 → €2, 16:39 → 17:42 | PASA |
| Taquilla: rival, hora, precio, ventana, puerta, aforo | R | «Halcones – Unión Cantera: hoy a las 18:30. Puertas a las 17:00; se puede entrar hasta las 20:20… Puerta 3 · Tribuna. Quedan 7 entradas de 54.»; «Entrada general · Tribuna · fila 3, asiento 15 €25» | PASA |
| Confirmación y cancelación | R | pantalla «CONFIRMAR … Se paga ahora: €25»; «Cancelar» → sin cobro ni entrada | PASA |
| Cobro único, entrada ligada al partido | R | 4 toques rápidos sobre «Pagar»: un solo cobro (€1184,20 → €1159,20, un apunte); entrada `estadio-halcon:672`, fila 3, asiento 15; después la taquilla sólo ofrece «Cerrar» | PASA |
| Pasar la Puerta 3 | R | «Entrada validada. Tribuna, fila 3, asiento 15…» → «Pasar» → `ar-estadio`, `admitted: true` | PASA |
| Vestíbulo, escalera, asiento reservado | R | 13 casillas caminadas en 4 tramos hasta `ESTADIO_SEAT_F3_15`; sentado; 9 espectadores y ninguno en mi asiento | PASA |
| Levantarse, salir y volver sin pagar | R | día 685, minuto 59': salir por el vestíbulo y la puerta → explanada; volver: «Vuelves a pasar con la misma entrada.», mismo dinero | PASA |
| Sin dinero | R (saldo puesto a €10) | opción deshabilitada «No te llega: cuesta €25 y llevas €10.»; sin cobro ni entrada | PASA |
| Sin entrada / entrada de otro partido | R + S | «Esta entrada es del partido contra Unión Cantera (…). Hoy se juega contra Deportivo Marisma.»; «Sin entrada no se pasa» en `check-stadium` | PASA |
| Demasiado pronto | R | día 689, 14:00: «Las puertas abren a las 14:30; el saque es a las 16:00.» | PASA |
| Tarde | S | `check-stadium` («tarde»): se entra hasta el final de `live` | PASA (S) |
| Tras el final | R | 20:34 del día 672: «El partido ha terminado: ya no se entra.» | PASA |
| Día sin partido | R | día 686: «Hoy no hay partido… El próximo partido es el miércoles… 16:00 contra Atlas del Valle.» | PASA |
| Campo no transitable, pasillos y salidas | S + R | `check-stadium` (césped sin pisar); rejilla de la grada con pasillo y escalera; salida y reentrada usadas | PASA |

### ARENA 02 — Partido visible

| Requisito | Prueba | Evidencia | Resultado |
|---|---|---|---|
| Campo, dos equipos, balón y jugadas visibles | R | captura `arena-seat-live.png`: campo completo, rojo contra turquesa, balón, árbitros; marcador «HAL 0 – 0 UCA 11'» | PASA |
| ≥ 6 patrones de jugada | S | `check-match-play`: 8 jugadas distintas | PASA (S) |
| Un único calendario determinista en los 110 min | S + R | fases −90/0/110/155/275; finales iguales en `MatchPlay.timelineOf` y en el estadio (672: 1-0; 685: 2-1) | PASA |
| Visto = no visto = saltado | S + R | `check-match-play`, `check-attendance`; en el navegador, el 685 dio 2-1 con saltos, una recarga y una salida a mitad | PASA |
| Llegada tarde, salir/volver, recarga sin reiniciar ni repetir goles | R | recarga sentado en el 46': 1-0 y grada en calma (sin re-celebrar); fuera, el partido sigue (59', 1-0); dentro otra vez, 1-0 | PASA |
| «Ver hasta el próximo momento» acotado, con coste y ligado al reloj | R | «Ver hasta la próxima ocasión +5/+12/+10 min», «Ver hasta la segunda parte +25 min», «Ver hasta el final +10 min»; nunca pasa del final; el reloj global avanza lo indicado | PASA, con EST-003 |
| Saque tardío que cruza medianoche | R + S | 685 a las 21:00: final a las 22:50, cierre a las 23:35; al día siguiente la entrada ya no vale | PASA |

### ARENA 03 — Afición y vista

| Requisito | Prueba | Evidencia | Resultado |
|---|---|---|---|
| Público variado, grupos, colores, asientos respetados | R + S | grada con aficionados locales y visitantes (`away: 1`), nadie en mi asiento, ninguna cara repetida; `check-stand-life` | PASA |
| Reacción a ocasión, gol local, gol visitante, final | R | 685: `attack away` (65') → `goal away 0,97` (68', 1-1) → `calm` → `attack home` (82') → `goal home 0,97` (88', 2-1) → `final home 0,96` | PASA |
| Eventos antiguos no se celebran de nuevo | R | recarga y salida/vuelta sin repetir reacciones; tras un salto, una sola reacción | PASA |
| Cámara comprensible desde la localidad (escritorio) | R | `arena-seat-live.png` | PASA, con EST-004 |
| Pantalla estrecha / móvil | — | no probado en esta auditoría | NC |
| Silencio, aviso visual, movimiento reducido | código | sonido procedural por la ganancia maestra de `CityAudio` (tecla N); `WorldScene` respeta `prefers-reduced-motion` («reacciona igual, pero quieta»); todo aviso tiene texto | PASA (código) / NC en navegador |

### ARENA 04 — Quiosco y charlas

| Requisito | Prueba | Evidencia | Resultado |
|---|---|---|---|
| Quiosco atendido con ≥ 3 artículos y precio | R | «Quiosco · Tribuna»: agua €2, sándwich €4,50, patatas €2, cola €2,50 | PASA |
| Compra al inventario y consumo real | R | sándwich €4,50 → bolsa → comido desde la Bolsa: energía 70 → 82 | PASA |
| Abierto antes del saque y en el descanso; cerrado con el balón en juego | R (antes) + S | compra a las 20:17 antes del saque; descanso y cierre en `check-concourse` | PASA (S para el descanso); descanso en navegador NC |
| Dinero insuficiente, cancelación, repetición | S + R | regla común de Commerce (comprobada en el súper y la taquilla); doble toque bloqueado por AUD-001 | PASA |
| Compra que cruza un gol/final | — | no probado | NC |
| Charla con variación contextual | R (parcial) + S | antes del saque: rival («Deportivo Marisma viene con bajas»), previa, respuestas a «Animar»; ≥ 4 frases por tema en `check-concourse` | PASA (S), con EST-002 |
| Descanso, resultado, despedida en navegador | — | no probado | NC |
| Animar/Celebrar sólo cuando toca, sin recompensas explotables ni contactos falsos | R + S | «Animar» antes del saque; los espectadores no ofrecen contacto | PASA |

### ARENA 05 — Salida, metro, guardado

| Requisito | Prueba | Evidencia | Resultado |
|---|---|---|---|
| Final → grada → vestíbulo → puerta → explanada, sin teletransporte | R | «Quedarse un rato / Salir con la gente»; me levanto y salgo andando (13 casillas) | PASA |
| Bar abierto o metro | R | Bar El Larguero abierto (13 personas, ninguna repetida); metro de vuelta: tarjeta €2 → €0, 20:46 → 21:49 | PASA |
| Salir antes no termina el partido | R | fuera a las 22:15, partido en el 59' | PASA |
| Tarifa y duración del metro | R | €2 coincide; duración real Vallesco↔Arena 60 min + espera, no 15 | PASA, con EST-005 (documentación) |
| Guardar/cargar fuera, sentado, tras el final, estadio cerrado | R | fuera (672, tras el final): igual salvo EST-001; sentado (685, 46'): dentro, pasillo, 1-0; dentro tras el cierre (23:40): al cargar, en la explanada con el mismo dinero | PASA (EST-001 aparte) |
| Guardar en el descanso | — | no probado | NC |
| Entrada caducada no vale para otro encuentro | R + S | 678/689: «Esta entrada es del partido contra…» | PASA |
| Partida anterior en posición válida, conservando dinero, inventario, identidad y ropa | R + S | copia del 19-10 carga y juega dos partidos; `check-attendance` (partidas antiguas) | PASA |
| Visitas repetidas sin duplicar personas, listeners, audio, cámaras ni input | R (2 visitas, 3 recargas) + S | 0 caras repetidas en grada y bar; `check-attendance` (la grada no crece al entrar y salir) | PASA parcial (sin medir listeners en el estadio) |

## Hallazgos

| ID | Gravedad | Tipo | Resumen |
|---|---|---|---|
| EST-001 | S2 | **externo**: regresión de CV-09 | la tarjeta de transporte con saldo €0 desaparece al cargar |
| EST-002 | S3 | estadio | dos aficionados distintos saludan con la misma frase en el mismo minuto |
| EST-003 | S3 | diseño | «Ver hasta…» no se detiene al empezar el descanso |
| EST-004 | S3 | visual | el panel del HUD tapa el área de la portería izquierda desde la Tribuna |
| EST-005 | S3 | documentación | «€2 y 15 minutos» no describe el viaje real al estadio |

### EST-001 · S2 · La tarjeta de transporte con saldo €0 se pierde al cargar (regresión externa, de CV-09)
- **Reproducción:** viajar en metro hasta dejar la tarjeta en €0 (ida y vuelta al estadio con €4) → guardar → recargar.
- **Esperado:** la tarjeta sigue en la bolsa con €0 y se recarga por €10.
- **Real:** `cards: {transport: 0}` → `{}`: desaparece la tarjeta, hay que comprar otra por €12,50 y el HUD deja de mostrarla. 1/1.
- **Código:** `src/systems/SaveSystem.ts:545`, `if (v > 0) out[id] = v;` en `parseCounts`, introducido por el arreglo de AUD-003. Para
  las tarjetas, un saldo de 0 es válido. **Causa confirmada.**
- **Impacto:** €2,50 de más y un susto tras cada ida y vuelta justa al estadio. No es del estadio, pero el estadio lo dispara a menudo.
- **Corrección sugerida (encargo aparte):** para `cards`, conservar los valores ≥ 0 (en céntimos). Regresión: tarjeta a 0 en
  `check-save-torture`.

### EST-002 · S3 · Saludo repetido por distintos aficionados
- **Reproducción:** día 685, 20:17, antes del saque, acercarse a varios espectadores.
- **Real:** 4 veces la misma frase «¡Vamos! Con la grada así, se gana seguro.», de aficionados distintos (Aficionada, Aficionado), incluida la
  que se acerca sola a saludar. Lo demás varía (rival, respuestas a «Animar»).
- **Código:** `WorldScene.ts:3621` → `Concourse.fanLine(…, agent.id, heard, this.fanRecent)`. `fanRecent` debería evitar oír otra vez lo que
  acaba de decir otro. **Hipótesis:** el saludo de llegada no pasa por ese filtro o no lo actualiza.
- **Impacto:** se nota repetitivo; ARENA 04 pide «not one static greeting». `check-concourse` sólo garantiza que una misma persona no repita.

### EST-003 · S3 (diseño) · «Ver hasta…» no se detiene al empezar el descanso
- Las marcas de `MatchPlay.nextMoment` (`MatchPlay.ts:164-169`) son el saque, las jugadas, la segunda parte y el final. Desde el 38' se ofrece
  «Ver hasta la segunda parte +25 min», que pasa por encima del descanso, justo cuando abre el quiosco. Para usarlo hay que
  esperar en tiempo real con «Seguir mirando». No es un fallo de reglas: es una discrepancia con «allow leaving between segments».

### EST-004 · S3 (visual) · El HUD tapa parte del campo
- Escritorio 958×888, sentado en la fila 3: el panel del HUD, arriba a la izquierda, cubre el área de la portería izquierda
  (`arena-seat-live.png`). La jugada sigue siendo legible; ARENA 03 pide no tapar el campo.

### EST-005 · S3 (documentación) · «€2 y 15 minutos»
- `CLAUDE.md` («coger el metro (cobra €2 y 15 min)») y el encargo citan 15 min. En el juego, la tarifa es €2 y cada tramo dura 15 min,
  pero Vallesco↔Arena es «60 min · €2» (medido: 16:39 → 17:42 con la espera). El dato antiguo está en la documentación, no en el juego.
- **Corregido (sólo documentación).** Las fuentes del juego no se contradicen: `METRO_FARE = 2` es fija por viaje y
  `METRO_MINUTES = 15` son minutos *por parada* (`Transit.destinationsFrom`: `|orden destino − orden origen| × 15`). Vallesco (orden 0)
  y Arena (−4) están a 4 paradas: 60 min. «15 min» sólo vale para paradas contiguas (Vallesco–Ribera, Vallesco–Cuatro Ríos).
  Cambiado: `CLAUDE.md` («€2 fijos y 15 min por parada: Vallesco–Ribera 15, Vallesco–Arena 60») y el comentario de
  `METRO_FARE`/`METRO_MINUTES` en `src/config/constants.ts`, que decía «duración del trayecto». Sin cambio de valores ni de código.
  No se tocan: `QA.md:25` (resultado histórico de una prueba de una parada, con 15 min correctos para ese trayecto) ni la cita de
  «Ribera Norte · €2 · 15 min» en `anti-slop/audit-001-2026-09-24.md` (una parada: correcta).

**Fallos externos que no bloquean la QA:** el cuelgue del lanzador de `npm run check` (salida 124; el runner pasa 91/91) y el error del
estudio en caliente (no se reproduce en frío).

## Rendimiento

Lectura puntual, no una medición comparativa:
- Partido visible desde la grada: `lifesim.match()` da 31 objetos, coste medio 0,04 ms y máximo 4,5 ms por frame (día 672, minuto 11').
- No se midió la misma grada sin figuras del partido, ni el pico con la grada llena, ni los recursos antes y después de visitas
  repetidas: queda **NC**. La referencia de la ciudad es la de `CV08-AUDIT.md` §10–§12.

## No comprobado (motivo)

- Móvil y pantalla estrecha en el estadio (cámara, táctil): no se hizo en esta sesión.
- Quiosco y charla en el descanso, charla de resultado y de despedida, «Celebrar» tras un gol: el avance pasó por encima del descanso
  (EST-003) y no se repitió la visita.
- Compra que cruza un gol o el final; guardar en el descanso.
- Medición de rendimiento comparable y recuento de listeners tras visitas repetidas.

## Veredicto

**PENDIENTE.** El recorrido principal (metro → taquilla → puerta → asiento → partido → compra y charla → salida → bar → metro) funciona en
partida y tras guardar/cargar, y todos los casos de puerta pasan. No hay S0/S1 del estadio. Faltan pruebas que las especificaciones
exigen (móvil, el descanso en el navegador, medición de rendimiento comparable), así que no se declara completo ni apto.

## Orden de reparación (encargos aparte)

1. **EST-001**: conservar tarjetas con saldo 0 al cargar (externo, pero lo dispara el estadio).
2. **EST-002**: que el saludo de llegada pase por `fanRecent`.
3. **EST-003**: una marca «el descanso» en `nextMoment`.
4. **EST-004**: separar el HUD del campo desde la Tribuna.
5. ~~**EST-005**~~: corregido en documentación (ver EST-005).
6. Completar las NC: móvil, descanso, guardar en el descanso, compra que cruza un gol, rendimiento con y sin figuras, y visitas repetidas.

## ARENA 07 · Correcciones y cierre de pendientes (2026-10-26)

Mismo entorno (`cv07-ciudad-viva`, `4872ade` + cambios locales sin commit), Chrome de escritorio 958×888 y emulación móvil, contexto
aislado `arena07` con una copia de la partida del 19-10 (la partida habitual no se toca). Partidos jugados: 671, 672, 678, 679, 685, 692 y 703.

### Incidencias

| ID | Estado | Código cambiado | Verificado |
|---|---|---|---|
| EST-001 | **Cerrada** | `SaveSystem.parseCounts(…, keepZero)`: las tarjetas conservan saldo 0 (la bolsa sigue sin unidades a 0) | `check-save-torture` (tarjeta a €0); navegador: ida y vuelta Vallesco–Arena con €4 → `transport: 0` → recarga → la tarjeta sigue (HUD «tarjeta · €0»), la máquina ofrece «Recargar €10», cobra €10 una vez |
| EST-002 | **Cerrada** | `Concourse.fanLine`: de lo no dicho por esa persona, la frase que hace más que no se oye en la grada; `fanRecent` guarda 40 | `check-concourse` (6 aficionados seguidos, «animar» no repite en 4: antes alternaba 2 de 4); navegador: 4 aficionados en el descanso, las 4 respuestas a «Animar» y las 4 despedidas distintas |
| EST-003 | **Cerrada** | `MatchPlay.nextMoment`: marca «el descanso» en el minuto 47 | `check-match-play` (51 partidos: se para en el descanso antes de la segunda parte); navegador: 39' → «Ver hasta el descanso +9 min» → 19:17, «Descanso» |
| EST-004 | **Cerrada** | `HUD.setWatching` + CSS `#hud[data-watch]`: viendo el partido, la placa sólo lleva hora, dinero y energía; `WorldScene.frameMatch`/`fitCamera`: el césped se coloca bajo el HUD y los botones de arriba (`HUD.topInset`), ampliando los límites de cámara hacia arriba sólo mientras se mira | escritorio 958×888: el campo queda entero bajo la placa y los cuatro botones, el jugador se ve; al levantarse vuelven la placa completa y los límites de cámara normales |
| EST-005 | Cerrada (ya en el encargo anterior) | documentación | — |
| EST-006 (nuevo) | **Cerrada** | CSS: en apaisado táctil (alto ≤ 480 px) el marcador baja al pie y la pista va encima, en dos líneas si no cabe | móvil 844×390: antes el marcador tapaba el asiento del propio jugador; ahora se ve el asiento y nada pisa el joystick ni «Volver» |
| EST-007 (nuevo) | **Cerrada** con EST-004 | la misma colocación de cámara | ventana estrecha 360×740 sin táctil: antes la placa y la columna de botones tapaban casi todo el césped visible; ahora el campo queda debajo |

Observación sin cambio (fuera de alcance): en táctil la pista dice «Esc: levantarse» aunque el botón sea «Volver»; ninguna pista del
juego tiene variante táctil (la canasta tampoco), no es del estadio.

### Pruebas que estaban NC

- **Móvil vertical 390×844 (táctil):** campo entero, nada encima; sentarse («Sentarse»), opciones («Elegir»), «Volver» para levantarse:
  la placa se compacta y se restaura. **Apaisado 844×390:** ver EST-006. **Estrecha 360×740:** ver EST-007; la cámara sigue el balón
  y el asiento puede quedar fuera por un lado (diseño de `followBall`). Emulación, no dispositivo físico.
- **Quiosco en el descanso:** sándwich €4,50 una vez, a la bolsa. Con el menú abierto el reloj sigue: elegido después del cierre
  (19:31 → 19:37) o abierto antes del saque y elegido después (18:29 → 18:32), no cobra, desactiva los productos y explica «Con el balón
  en juego no se atiende…».
- **Charlas:** del descanso (con empate hay 4 frases y cada charla gasta 2: rotan sin repetirse hasta agotarlas), de resultado
  («¡Ganado! 1–0…»), de despedida (4 distintas) y «Celebrar» tras la victoria (672) y tras un gol en directo (692, 23': «¡Golazo! ¿Lo
  has visto? ¡En el 23'!» y respuestas distintas a «Celebrar»).
- **Guardar en el descanso** (672, 19:20) → recargar: en el estadio, «Descanso», 0-0, mismo dinero, sándwich y entrada.
- **Compra que cruza un gol:** refresco en El Larguero 19:05 → 19:15 (gol local de las 19:11): €2 una vez; fuera, «Halcones 2 – 1 (45+1)»;
  dentro, 2-1 en el descanso, un solo gol contado. En el 685 (22:38 → 22:48, gol de las 22:44) igual: €2 una vez.
- **Compra que cruza el final:** caña 20:15 → 20:35 (final 20:20): €2,50 una vez; fuera, «final: Halcones 2 – 1»; la puerta: «El partido ha
  terminado: ya no se entra».

### Rendimiento y visitas repetidas (escritorio 958×888, sentado en la Tribuna, 1.ª parte 12'–20', 240 frames con el reloj corriendo)

| Medición | Trabajo por frame (mediana / p95 / máx) | Intervalo (mediana / máx) | Frames > 33 ms | Listeners state / game / scale / escena | Objetos |
|---|---|---|---|---|---|
| Referencia: 678, primera visita tras cargar | 1,6 / 2,1 / 17,9 ms | 16,7 / 17,1 ms | 0 | 23 / 20 / 5 / 56 | 353 |
| Tras 5 salidas y entradas (678) y otra visita (679), sin recargar | 1,4 / 1,8 / 2,3 ms | 16,7 / 17,1 ms | 0 | 23 / 20 / 5 / 56 | 353 |
| Con la cámara de EST-004/007, tras las visitas de 685, 692 y 703 | 1,8 / 2,8 / 19,8 ms | 16,7 / 17,0 ms | 0 | 23 / 20 / 5 / 56 | 359 |

Los listeners no crecen con las visitas. Las texturas suben (2 487 → 2 535 → 2 600): son variantes de gente que se pintan la primera vez
que aparece cada aspecto (`person-fine:vecino-19~fan`, `rider-…`); no se repiten ni se pierden, es una caché acotada por combinación de
aspecto. El partido en sí cuesta 0,08 ms de media por frame (31 objetos). No se midió con un perfil de GPU.

### Validación

`tsc --noEmit` OK; runner por comandos de `scripts.check` 91/91 (292 s, sin reintentos); `npm run build` OK (11 s; el aviso de chunk
> 500 kB es el de siempre).

### Veredicto ARENA 07

Las cinco incidencias de la auditoría y las dos nuevas quedan corregidas y verificadas en el navegador y con regresión. Lo que queda
sin comprobar: un dispositivo físico (sólo emulación) y una medición de GPU. Ninguna de las dos bloquea el estadio.
