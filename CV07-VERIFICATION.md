# CV-07 · Ciudad viva — auditoría y verificación

24 de octubre de 2026. Base: 9f85ab6, main limpio. Ruta confirmada:
`C:/Users/glest/Documents/lifesim`. Leídos CLAUDE.md y README.md; no hay AGENTS.md
en el repositorio ni instrucciones de antecesores encontradas. Phaser 3.90,
TypeScript, Vite, UI DOM, arte procedural. No publicación, despliegue ni push.

## Precondición (inspección de código, antes de editar)

- CV-02, supermercado: PRESENTE. Commerce.checkout, catálogos, inventario,
  Activities, Menus; comida utilizable y gel en casa. check-supermarket disponible.
- CV-03, ropa/hogar: PRESENTE. Retail, fitting en GameState, Housing/Gifts,
  Montón y Velarde por datos; prendas visibles y mejoras instalables.
- CV-04, coches: PRESENTE como tráfico ambiental, Traffic/TrafficView y
  data/vehicles. Conducción/propiedad: AUSENTES, remitir a su encargo si se piden.
- CV-05, iglesia: PRESENTE. Parish, CHOIR, interior, tablón y efecto social.
  PARCIAL en integración: no aparece en Hoy; reservas de sus invitados sólo
  excluyen clientes de la propia parroquia, no los de otros locales.
- CV-06, embarazo: PRESENTE. Pregnancy, registros en GameState/SaveSystem,
  rutinas por fase y dibujo. Fases y nacimientos resueltos al cargar/medianoche.
- Rutinas: PRESENTES para Sara, Ada, Noa, Amaia y Yasmin en Characters.
  La población ambiental usa StreetLife/Crowd, preferencias y traspasos Handoff;
  PARCIAL: identidades con trabajo pueden elegirse como clientes en otro sitio.
  No hay una rutina doméstica individual para las 60 identidades ambientales;
  no se presenta la multitud como simulación de 60 vidas completas.

Cola histórica contrastada con los prompts de Notion 102–106 (consultados sólo
como requisitos; sus casillas no prueban implementación) y con código:

- 102: PARCIAL. SaveSystem, autoguardado, recuperación y ciclos de eventos existen;
  AUSENTES el menú continuar/nueva/exportar/importar. Remitir ese bloque a 102;
  CV-07 no lo simula ni cambia SAVE_KEY/SAVE_VERSION. La versión publicada no se audita.
- 103: PRESENTE camino común HumanArt/HD, Character y CrowdView. Validación
  visual exhaustiva de calidad: NO VERIFICADA en esta auditoría inicial.
- 104: PRESENTES identidad, complexión/altura, ropa y diversidad en Population,
  People, HumanArt; check-npc-diversity. Jugador protegido.
- 105: PRESENTES estados y animaciones compartidas (Character, NpcActivity,
  CrowdView), check-ambient/input/garments. Aceptación de todos los ciclos y
  siluetas en vídeo: NO VERIFICADA; permanece en su encargo.
- 106: PARCIAL. Rutas compartidas y adaptadores para población, personal,
  metro/ciclistas; check-hd-cache/crowd-variety. No se acredita toda la matriz
  visual ni rendimiento en teléfono físico. Remitir validación completa a 106.
- Trabajo, estudios, vivienda, agenda, relaciones y metro: PRESENTES en sus
  módulos y consumidores. La suite real se ejecuta; README y VERIFICATION-WEEK
  son contexto, no evidencia de pruebas de esta entrega.

## Decisiones de integración

Se conserva Characters como planificador, StreetLife/Crowd como población y
Handoff como continuidad corta. Reloj, cartera, bolsa, identidades y guardado
siguen siendo los existentes. Las reservas se consultan al crear/reconciliar,
no se simula la población completa cada frame. Se priorizan obligaciones sobre
ocio y encuentros; ante agotamiento de identidades se reduce afluencia.
Para identidades ambientales con workplace pero sin turno individual, se usa la
regla conservadora ya empleada por Parish: ocupado mientras abre su trabajo,
con 30 min previos para desplazarse. No se inventan salarios ni compras NPC.

No se cambian precios, escala, velocidad, controles ni aspecto del jugador sin
una medición que lo justifique. Las oportunidades comunitarias van a Hoy como
opciones, sin convertirlas en obligaciones ni lanzar avisos de falta.


## Resultado implementado

- **Identidad y prioridades:** compras y ocio ambientales excluyen identidades
  reservadas por trabajo, encuentros o visitas en otro local. El personal se
  asigna antes que la clientela; si se agotan identidades, se espera. Se conserva
  el planificador Characters para los cinco personajes con rutina, sus tiempos
  de viaje, preferencias, planes, fases y recuperación tras conversaciones.
- **Salir y volver:** los visitantes observados dejan una ficha en Handoff,
  limitada por el aforo y a 90 minutos como máximo. Se reconstruyen al regresar;
  la visita no se prolonga por entrar repetidamente. El resto del mundo sigue
  usando las funciones del reloj y el LOD existentes.
- **Ciudad por horas:** la afluencia conserva sus perfiles y tiene un límite de
  identidades disponible, con margen para servicios y sucesos. No se calcula una
  rutina para toda la población en cada frame: las reservas se revisan en las
  decisiones existentes de afluencia y al crear agentes.
- **Comunidad en Hoy:** aparece el próximo coro, lugar, viaje estimado y cierre
  de admisión a las 12:45. Asistir pasa a la siguiente oportunidad; perderlo
  conserva la siguiente semana. Es opcional, sin aviso de falta ni agenda nueva.
- **Consecuencias:** se reutilizan comida/bolsa, ropa/armario/render,
  Housing/layout y Parish/Social. No hay dinero, inventario o guardado paralelo.
  Parish también rechaza reintentos en su función de resolución.
- **Tiempo y continuidad:** los saltos no finitos no afectan al reloj ni emiten
  medianoches. Los planes pasan a WeakMap para evitar que la rotación de variantes
  borre planes base de otro personaje. No se crean campos persistentes nuevos;
  se mantienen SAVE_KEY y versión, con parsers/defaults anteriores.
- **Incidencias reproducidas:** un peatón podía atravesar una farola al apartarse
  para esperar el semáforo; ahora rodea el mobiliario y vuelve al paso. Un recado
  siguiente del Carmen cerrado producía una ruta fallida a las 21:22; ahora el NPC
  elige una ruta real de vuelta a casa. El adaptador de almacenamiento ya propaga
  el error a SaveSystem.save, en vez de confirmar una escritura rechazada.

## Prueba jugada en Chrome

Chrome local, contexto independiente, 1280×960. Teclado real y elecciones en el
DOM. Las fixtures preparan fechas, llegada al empleo sin mapa, tarjeta y posiciones
ante las puertas o puestos. No se afirma haber caminado los trayectos completos
ni haber jugado siete días continuos sin ayudas. No se utiliza el perfil personal.
Registro completo: `cv07-browser.json`, junto a este informe.

1. **Día 3, trabajo + supermercado.** Llegada preparada a Decathlon a las 09:40;
   fichar y atender la cola desde la UI: €120 → €180, fin 16:00, energía 65.
   Vuelta en metro: tarjeta €30 → €28. Entrar con E al Rosales, caminar con flecha,
   comprar pan (€0,90), abrir Bolsa y comerlo: energía 71 y sin pan sobrante.
   Salir y volver: tráfico reconstruido (mayor que cero), visitantes sin duplicados.
   Recargar a las 16:47: saldo €179,10 y consecuencias conservadas.
2. **Día 6, ropa/hogar + plaza.** Entrar en Montón por la puerta real, elegir
   camiseta mostaza, PROBAR y COMPRAR: €179,10 → €175,60, equipada y en el armario.
   Velarde: comprar e instalar la monstera, saldo €136,60. Comprobar vivienda y
   visitar/interactuar con la plaza. Recargar: prenda puesta y mueble conservados.
3. **Día 7, comunidad + ocio.** Abrir Móvil → Hoy y leer el coro/cierre. Entrar en
   San Blas, hablar con Encarna y quedarse hasta el final: termina a las 13:30,
   una asistencia, amistad +5 y confianza +3. Descanso en Lamparillas después:
   fin aproximado 13:52, energía 81. Recargar: una sola asistencia y mismo efecto.
4. **Imprevisto.** Domingo 15:10, intentar la puerta del súper: permanece en la
   calle, informa del cierre y próxima apertura. Lunes 09:05: entrar, comprar
   agua (€0,60), guardar/recargar; inventario y saldo €136 conservados.
5. **Esquema anterior.** Copia separada del guardado de prueba sin parish,
   pregnancy ni agenda; conservar la copia original en disco, cargar en otro
   contexto, comprar pan y recargar: €135,10, armario/hogar anteriores intactos.
   Es una copia sintética compatible, no una partida antigua real del usuario.
6. **Táctil emulado 390×844.** Botón de acción, tocar producto/Pagar, botón Bolsa,
   consumir pan, joystick con eventos de puntero y recarga. €120 → €119,10,
   efecto de comida y movimiento comprobados. Cero errores de página registrados.

Las capturas `cv07-day3.png`, `cv07-day6.png`, `cv07-day7.png` y `cv07-touch.png`
son de estos recorridos. El resultado del piloto fue **PASS**; no es validación de
un teléfono físico. La interacción de plaza quedó registrada como acción E; no
se atribuye una conversación concreta ni un efecto social inexistente a ese paso.

## Simulación determinista de siete días

`npm run check:city`. Prueba separada del navegador. Dos ejecuciones producen
el mismo resultado, con guardar/cargar cada día. Usa salarios, productos,
actividades, tarifas, emisión/recarga de tarjeta y cuentas de los módulos reales.
Los tiempos de acercamiento local son supuestos de escenario; los viajes en metro
se leen de Transit. No son un cronometraje de siete días jugados.

- Día 1: €97,60; tarjeta €10; 82 min de actividades/viajes de escenario.
- Día 2: €45,20; tarjeta €6; 252 min; ropa/hogar, un cierre recuperable registrado.
- Día 3: €95,30; tarjeta €2; ingreso €60; 502 min; obligación y comida/recado caben.
- Día 4: €85,40; tarjeta €2; 82 min.
- Día 5: €125,50; tarjeta €8; ingreso €60, recarga real de €10; 502 min.
- Día 6: €115,60; tarjeta €8; 82 min.
- Día 7: €50,70; tarjeta €8; 202 min, coro y cuentas pagadas.

Saldo mínimo €45,20. 650 agentes de locales inspeccionados en franjas de siete
días, cero identidades duplicadas en esas muestras; se revisan también las
identidades semánticas de la calle (los supervivientes tienen id propio).
Un bloqueo previsto por cierre, alternativa conservada y ningún bloqueo permanente
en ese escenario. No es una prueba exhaustiva de todas las posiciones del mundo.

La prueba cubre también 170 días de rotación de planes, reservas de trabajo/coro,
volver a un local sin prolongar visitas, agotamiento de identidades, guardado con
cuota rechazada, reloj inválido, salto de embarazo a 120 días (tres nacimientos,
ninguno repetido al cargar) y migración sintética sin mutar su original.

## Archivos esenciales y criterios de prueba

- `Places.ts`, `Parish.ts`: disponibilidad, desplazamiento, reservas y resolución.
- `Crowd.ts`, `StreetLife.ts`, `Handoff.ts`: identidades, aforo, continuidad y
  recuperación del recado cerrado/espera del semáforo.
- `Characters.ts`, `TimeSystem.ts`, `SaveSystem.ts`: continuidad de planes,
  validación temporal y escritura veraz.
- `Agenda.ts`, `Phone.ts`, `main.ts`: información en la superficie Hoy existente.
- `WorldScene.ts`: una llamada de coordinación al cerrar la escena.
- `scripts/check-city-life.ts`, `package.json`: regresión integrada, `check:city`.

Se conservan todos los archivos de dibujo, aspecto y animación del jugador, escala,
velocidad y controles. No se cambian precios ni ventanas de actividad: el recorrido
observado y el escenario temporal dejan margen para obligación y recado.

Se han hecho explícitas fixtures antes dependientes de una semilla: terraza con
asientos reservados antes de poblar; víctima de policía tras una parada real;
espectáculo con ocho semillas y tiempo de viaje; parejas en dos sábados; seguridad
ambiental del estadio en hasta cinco llegadas. Las pruebas de taxis exigen
exclusividad entre recogidas simultáneas (un taxi libre puede usarse después) y
cuentan la cancelación desde el comienzo real de la espera. No se sustituyen las
comprobaciones funcionales por mensajes de éxito.


## Comprobaciones finales

- **PASS — `npm run check`:** los 91 comandos de package.json, incluida la
  semana CV-07. Ejecución final completa con salida 0. Registro `cv07-check.log`.
- **PASS — tipos y `npm run build`:** TypeScript y bundle de producción,
  salida 0. Permanece el aviso previo de chunk mayor de 500 kB; no es un error.
- **PASS — `npm run check:city`:** horarios/economía de siete días, dos
  resultados iguales, 650 agentes inspeccionados y cero duplicados de identidad.
- **PASS — Chrome:** tres jornadas, recuperación del cierre, guardar/recargar,
  copia sintética de esquema anterior, controles táctiles emulados y joystick.
  Cero errores de página; el registro distingue las fixtures de las acciones UI.
- **PASS — `git diff --check`:** sin errores de formato. Jugador/render/escala
  sin cambios. No se afirma una revisión visual exhaustiva de la cola 103–106.

La ejecución inicial de `check` falló en la ruta del Carmen ya existente; el runner
intermedio detectó cambios de muestras y el rodeo del semáforo. Se compararon
fallos en una copia temporal del commit base; se corrigió el comportamiento real
y se hicieron explícitas las fixtures descritas arriba. Se informa del resultado
final completo, sin ocultar esos hallazgos ni atribuir a build una prueba jugada.

Para repetir: en el repositorio ejecutar `npm run check:city`, `npm run check`
y `npm run build`. Para el piloto de navegador de este entorno, mantener Vite en
el puerto 5297 y ejecutar con Node el archivo
`C:/Users/glest/Documents/Codex/2026-10-24/life-sim-cv-07-ciudad-viva/work/browser-cv07.cjs`.
Ese piloto crea sus propios contextos, conserva la fixture original y vuelve a
generar registros y capturas. Requiere el Playwright empaquetado y Chrome usados
en esta sesión. Para prueba manual, seguir las seis rutas detalladas arriba:
E interactúa, flechas/WASD caminan, P abre Hoy, I abre Bolsa y Esc vuelve.

## Límites, backlog y punto de continuación

- **Pendiente de aceptación externa:** una partida antigua real y un teléfono
  físico. No se encontró una copia histórica real disponible; no se leyó ni
  alteró el guardado personal del usuario. El original de la fixture sintética
  queda conservado en `work/old-save-original-copy.json` de este chat.
- **Población ambiental parcial:** las 60 identidades no tienen casa y agenda
  doméstica individual. Se mantienen los viajes, preferencias y perfiles de los
  sistemas disponibles, con reservas acotadas. El horario laboral ambiental es
  conservador (apertura del trabajo), no un turno individual ni una economía NPC.
  Los personajes con rutina conservan su planificador real. Ampliar a 60 vidas
  domésticas completas requiere un encargo propio; no se da por implementado.
- **Cola priorizada:** P1 cerrar menú/transferencia de partidas de 102; P1 completar
  evidencia visual/móvil de 103–106; P2 turnos/casas individuales de población;
  P3 nuevos negocios, empleos y barrios. No hay conducción/propiedad de coches.
- **Último cambio de comportamiento:** un recado NPC cuyo siguiente destino
  cerró vuelve a casa mediante Navigation; ajustes de pruebas y documentación.
- **Siguiente comprobación:** importar una copia histórica real en un origen
  aislado, repetir trabajo → súper → guardar → recargar y probar en teléfono real.

No se ha hecho push, publicación, despliegue ni merge. Trabajo local en
`cv07-ciudad-viva`, partiendo de un árbol limpio. La instancia de desarrollo usa
`http://127.0.0.1:5297`, un origen separado del habitual 5173.

## Reverificación del 26-10-2026 (partida antigua real)

Base `4872ade`, árbol limpio en `cv07-ciudad-viva`. Se reejecutó todo en vez de
fiarse de este informe. Suite `npm run check` con un runner por comando (el
lanzador de npm puede devolver 0 sin ejecutar nada): 91/91 PASS sin reintentos.

**Partida antigua real.** Copia del guardado del usuario del 19-10 (día 665,
domingo 21:49, en casa, €1184,20, café; sin `job`, `household`, `agenda`,
`parish`, `pregnancy` ni `housing`). Se cargó en un contexto de Chrome aislado
(puerto 5298); el guardado personal no se leyó ni se escribió y el original
sigue en disco. Migración: carga sin `.unreadable`, facturas desde el día 665
sin cargos retroactivos, guía de la agenda dada por vista, embarazos con fase.

Recorrido jugado sobre esa copia, con E/flechas/menús reales. Las fixtures sólo
colocan al jugador ante una puerta o un puesto y avanzan el reloj
(`advanceMinutes`, con sus medianoches); no se caminaron los trayectos enteros.

1. **Lun 666, ropa/hogar + plaza.** Dormir en la cama (8 h). Metro L2 a
   Decathlon (30 min, tarjeta €4→€2), firmar con Marta; «Fichar» bloqueado con
   «Hoy no tienes turno. El siguiente: miércoles a las 10:00.». Recarga de €10
   (€1174,20) y vuelta. Puerta Central: camiseta de rayas en Montón, probar y
   comprar (€4, puesta y en el armario); monstera en Velarde (€39, esquina del
   salón); sentarse con E en el banco PC_BENCH_01 (calle con 33–36 peatones,
   6–8 coches, 0 ids repetidos). En casa, la planta dibujada en (17,12).
   Irse y volver a la calle (43 min dentro): 28→24 peatones, 22 son los mismos ids,
   coches 18→18, 0 duplicados. Recargar: todo conservado.
2. **Mié 668, trabajo + súper.** El HUD avisa del turno y del viaje (~53 min).
   Fichar a las 09:08 → fin 16:00, +€60, energía 100→59, un turno `done`; un
   segundo intento se bloquea («El turno de hoy ya está hecho…»). Un suceso de
   metro con elección, resuelto por UI. Súper a las 17:01 (9 agentes, 0 dup):
   compra para cocinar €9 + plato €3,20 = €1179; plato comido desde la Bolsa (+16);
   cocinar en casa 45 min (+30 hasta el tope), y sin compra la cocina se bloquea con
   «Te falta: bolsa de la compra.». Recargar: un solo sueldo, €1179.
3. **Dom 672, comunidad + ocio.** El turno del viernes perdido avisa una vez
   («Te lo has perdido»). Hoy: coro 12:00, ~31 min a pie, admisión hasta 12:45.
   Encarna a las 11:58: «Empieza a las 12:00 (faltan 2 min)…». Quedarse
   hasta el final: 12:03→13:30, energía +6, amistad +5, confianza +3, una
   asistencia. Lamparillas 20 min (+4). Recargar: sin duplicar.
4. **Imprevisto.** Dom 15:10, puerta del súper: «Está cerrado. Ya ha cerrado por
   hoy. / Abre mañana a las 09:00. / horario». Lunes 673 09:07: agua €0,60,
   guardar y recargar → €1178,40, conservado. 0 errores de página.

**Defecto encontrado y corregido.** Con el jugador esperando dentro de la parroquia
(lo que sugiere la propia nota), los invitados del coro entraban de uno en uno cada
5–10 min de juego y se paraban en la puerta: medio coro llegaba empezado, el último
hacia las 12:20–12:30. Entrando después ya estaban todos sentados, así que lo que
se veía dependía de si se miraba. `Crowd.reconcile`: mientras falte un invitado,
se vuelve a mirar la puerta tras el tiempo de reacción, y el invitado no se para en
el umbral. Medido en 20 domingos: completos entre las 11:49 y las 12:04. Navegador
(día 693): 5/5 a las 11:58, 0 caras duplicadas. No se tocó `ARRIVE_EARLY` (cambiaría
quién está libre para ir y, con ello, reservas y calle). Regresión nueva en
`check-city-life.ts` (falla sin el arreglo).

**Observaciones sin cambio.** «Hoy» no lista facturas ya vencidas (sólo en Cuentas
como «vencido»); con una semana sin pagar puede leerse como si sólo hubiera las del
sábado siguiente. Revisado el 26-10 (sección siguiente): es la regla prevista.
Con la ventana de Chrome tapada el bucle va a ~1 fps y se
pierden pulsaciones de un fotograma (de la prueba, no del juego).

**Sin reverificar en esta sesión:** táctil y teléfono (hechos en emulación en la
sección siguiente), dispositivo físico y los siete días jugados sin ayudas.

## Táctil y móvil en emulación (26-10-2026, segunda pasada)

**Entorno.** Chrome de escritorio vía DevTools MCP, contexto aislado `cv07-touch`
(partida nueva propia; el guardado del usuario ni se lee ni se escribe), Vite en
127.0.0.1:5298 con el código actual (incluida la corrección de `Crowd`).
Emulación `390×844 @3x, mobile, touch` (vertical) y `844×390 @3x, mobile, touch,
landscape`; `(pointer: coarse)` activo. **No es un dispositivo físico**: no se ha
usado ningún teléfono real y no se declara validado.

**Cómo se tocó.** Botones del HUD, opciones de menú y botones del móvil: toques de
CDP (`click` sobre el elemento). Joystick, botón E y Volver: `PointerEvent`
sintéticos con `pointerType: 'touch'` e ids distintos, despachados a los propios
elementos (`.touch__stick/.touch__base`, `.touch__action`, `.touch__back`), es decir,
por los manejadores reales del juego pero sin la capa de gestos del navegador. El MCP
no expone `Input.dispatchTouchEvent`, así que un deslizamiento con el dedo de verdad
(desplazar listas, gestos del sistema) no se ha podido reproducir.

**Controles táctiles — resultados.**

| Prueba | Vertical | Horizontal |
|---|---|---|
| Caminar en 4 direcciones y 2 diagonales, mirar hacia donde se va | OK (≈3,3 casillas en 0,7 s; arriba frenó en una pared real, y=49) | OK |
| Soltar: se detiene | deriva 0 en todos los casos | deriva 0 |
| Cambiar de dirección sin levantar el dedo | OK (derecha → izquierda, gira) | — |
| Zona muerta | 18 % de radio 34 px = 6,1 px: a 3–5 px quieto, a 7 px anda con intensidad parcial (correcto) | — |
| Multitoque (dedo 1 en el joystick + dedo 2 en E) | OK: E «ENTRAR» entra en casa con el joystick pulsado; dentro no camina solo; al soltar, deriva 0 | — |
| Entrar/salir de edificios | casa, súper, Hilo, gimnasio; E cambia a ENTRAR / SALIR / COMPRAR / ENTRENAR / TERMINAR | OK |
| Abrir menú con el joystick pulsado | no se mueve; E → «ELEGIR», aparece Volver | — |
| Navegar menú con el joystick y elegir con E | la selección baja y queda a la vista hasta «13. Salir»; «Nada» cierra sin efecto | — |
| Volver cierra el menú | sin acción en el mundo, ningún control queda `is-active` | — |
| Charla con respuestas | se elige tocando la respuesta; E queda sin acción (previsto, `WorldScene.ts:918`); Volver termina la charla | OK |
| Gimnasio | E «TERMINAR» corta la sesión (previsto); sesión completa: 1 sesión, energía 100 → 89 | — |
| HUD y cámara | el panel del menú más largo (súper) acaba en y=678, el joystick empieza en 682: no se tapan; listas con `overflow-y: auto` | el interior completo centrado; HUD arriba a la izquierda, botones a la derecha, joystick y E en las esquinas inferiores |
| Girar con la partida en marcha | canvas y controles se recolocan y el joystick responde | ídem |

**Móvil del juego — resultados.**

- Abrir/cerrar con los botones táctiles «Abrir el móvil (P)» y ✕ (toques CDP): OK en
  ambas orientaciones. Al abrirlo se suelta el joystick (no se mueve con el móvil
  abierto ni al cerrarlo; el mando vuelve a 0). Con un diálogo abierto no se abre.
- Apps Hoy, Mensajes, Contactos, Trabajo, Estudios y Cuentas: se abren; Atrás e
  Inicio vuelven al menú. Ningún texto recortado, ningún objetivo táctil < 32 px,
  sin desbordamiento horizontal. Hoy desplaza (1370 px de contenido en 736 en vertical
  y en 282 en horizontal) y el último elemento se alcanza; Cuentas desplaza en
  horizontal. Cámara y Música salen desactivadas con «Próximamente» (ya existían así).
- Vertical: el móvil ocupa la pantalla y oculta joystick/E. Horizontal: el móvil
  (380×366) queda centrado y E/Volver siguen visibles; con el móvil abierto E no
  actúa en el mundo (había un cliente con «Hablar» al alcance y no se abrió la
  charla) y Volver hace de Atrás.
- Acción involuntaria: el ✕ del móvil (296–340, 792–826 en vertical) cae encima del
  botón E (295–365, 749–819), que mostraba «COMPRAR» ante la caja. Al cerrar con un
  toque CDP real: ni menú, ni diálogo, ni movimiento, mismo saldo y bolsa.

**Guardar y recargar (misma partida aislada).** Todo con toques: 2 panes en el
súper (€120 → €118,20, un apunte, 2 min), camiseta de algodón en Hilo (€25 →
€93,20; COMPRAR sin PROBAR la guarda en el armario, como documenta `Menus.ts`), ponerla en
el armario de casa, cinta de correr 30 min y comer un pan (89 → 95). El
autoguardado del juego coincidía con el estado vivo; tras dos recargas: €93,20,
energía 95, bolsa vacía, camiseta en armario y puesta, 2 apuntes, 1 sesión,
forma 18,27, guía saltada sin volver a salir. Nada duplicado ni aplicado dos veces.
0 errores y 0 avisos en consola.

**«Hoy» y facturas vencidas.** Es la regla prevista, no un defecto: la agenda es «lo
próximo que el jugador tiene que hacer» (cabecera de `Agenda.ts`, README «Ritmo del
día, agenda y progreso») y una cuenta entra hasta acabar su día de vencimiento
(`Agenda.ts:182`, `if (end < now) continue`). Vencida, pasa a Cuentas como «vencido ·
margen hasta el …» con 7 días de gracia y un recargo único (`Household.dueLabel`,
README «Cuentas»). No se cambia. Ninguna prueba fija esa omisión.

**Observaciones (sin cambio, no reproducidas como fallo):**
- La página mide 2 px más que la ventana en ambas orientaciones (846/844, 392/390)
  con `overflow: hidden` en html/body; sólo se desplaza por programa. Si se nota con el
  dedo, sólo un teléfono real puede decirlo.
- Comer con la energía a 100 gasta el alimento sin efecto, sin aviso.
- La pista de las charlas dice «Elige con 1–4» (teclado) también en táctil.

**Archivos.** Sin cambios de código en esta pasada; sólo este informe. Pruebas
automáticas reejecutadas: `check-input`, `check-phone`, `check-agenda`,
`check-household`, `check-interaction`, `check-city-life`: todas OK. La corrección
de `Crowd.ts` y su prueba se confirmaron con `check-city-life` sin rehacerlas.

**Capturas (fuera del repositorio):**
`C:/Users/glest/AppData/Local/Temp/claude/C--Users-glest--claude/ce5dbb98-d972-4395-b214-38d7e3966a6d/scratchpad/`
`touch-portrait-start.png`, `phone-portrait-home.png`, `touch-landscape-super.png`,
`phone-landscape-hoy.png`.

**Pendiente.** Dispositivo físico (iOS/Android): gestos reales, desplazamiento con
el dedo, zonas seguras, rendimiento y los 2 px de más. Semana jugada a mano (la de
siete días sigue siendo la simulación `check:city`).

## Seguimiento de la auditoría (26-10-2026)

Los pendientes de esta verificación (táctil y móvil en un dispositivo real, pestaña oculta, embarazo en
pantalla, contraste, semana jugada) y los hallazgos AUD-001…010 se registran en `CV08-AUDIT.md`, §10–§12.
Resumen: embarazo en pantalla y contraste comprobados; dispositivo físico, pestaña oculta real y semana
jugada siguen pendientes.
