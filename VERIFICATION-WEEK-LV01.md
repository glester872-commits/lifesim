# LV-01 · Pruebas reales en móvil y primera semana completa

Fecha: 5 de noviembre de 2026. Rama `alpha-09-fachada`, ruta `C:\Users\glest\Documents\lifesim`.
Entrega **parcial** según el orden del ticket: Fase 1 completa, táctil emulado, rendimiento en 3 escenas.
El recorrido de 7 días sin ayudas **no se ha completado** (ver «Fase 2»: piloto listo, día 1 interrumpido). No se
simulan días.

## Fase 1 — Auditoría

### 1. Estado inicial del árbol

`git status` al empezar: 14 archivos modificados y 2 nuevos, todos de entregas anteriores de esta misma
sesión sin commit (ALPHA-09 HUD móvil y zoom, QA-06 luz nocturna, QA-07 comisaría). Se conservan; LV-01
no los toca. `git diff --stat`: 14 files changed, 528 insertions(+), 54 deletions(-).

### 2. Dónde vive cada cosa

| Área | Archivo / función |
| --- | --- |
| Verificación anterior | `VERIFICATION-WEEK.md` (entregas 06–07), `README.md` § Limitaciones actuales, `QA.md` |
| Tests | `npm run check` (cadena de `scripts/check-*.ts`); de la ruta crítica: `check-week`, `check-agenda`, `check-jobs`, `check-study`, `check-household`, `check-economy`, `check-arcs`, `check-metro`, `check-persistence`, `check-save-torture`, `check-title-save`, `check-recovery`, `check-input`, `check-interaction` |
| UI móvil | `src/ui/HUD.ts` (barra, desplegable `#hud-more`), `src/style.css` (media `(max-width:520px),(max-height:480px)`), `index.html` (5 botones `.hud-btn`) |
| Controles | `src/systems/PlayerInput.ts` (estado compartido teclado/táctil), `src/ui/MobileControls.ts` (`bindStick`, botón de acción), `src/ui/PinchZoom.ts`, `WorldScene.bindKeys` / `bindZoomInput` |
| Creador | `src/ui/CharacterCreator.ts` (Nueva partida) |
| Guardado | `src/systems/SaveSystem.ts`: clave `lifesim.save` (`SAVE_KEY`), `SAVE_VERSION = 3`, `migrate()` v1→v2 (identidad) y v2→v3 (`metroJourney`), `inspectRaw()` rechaza versiones más nuevas, copia `lifesim.save.backup`, ilegible a `lifesim.save.unreadable`. Exportar/importar JSON validado desde la pantalla de inicio («Partidas», `src/title.ts`) |
| Pausa | `SimulationPause` en `src/main.ts`: menú y pestaña oculta (`visibilitychange`); `MAX_FRAME_MS = 100` limita el salto por fotograma |

### 3. Evidencia existente, clasificada

| Afirmación | Clase |
| --- | --- |
| Agenda, empleo, estudios, economía, vivienda, guardado/migración, metro | **Test** (`npm run check`) |
| Semana de `VERIFICATION-WEEK.md` (días 1–7 hasta el despertar del 7) | **Recorrido con ayudas** (piloto de teclado, preparación de posiciones y saltos de reloj por depuración) |
| Plantón y reconciliación con Sara | **Recorrido con ayudas** (posiciones y reloj preparados) |
| HUD móvil, iconos, desplegable, pellizco (ALPHA-09) | **Emulación** (Chrome DevTools, esta sesión) |
| Semana continua sin ayudas | **NO VERIFICADO** |
| Teléfono físico | **NO VERIFICADO** |
| Ramas de lluvia de los arcos | **NO VERIFICADO** |

Fuente externa `github.com/glester872-commits/lifesim` (#limitaciones-actuales): no consultada; se usó la
copia local de `README.md` § Limitaciones actuales, que es la misma sección del repo.

### 4. Partida sintética aislada

Contexto de navegador aislado de Chrome DevTools (`isolatedContext`): almacenamiento propio, distinto del
perfil del usuario. La partida personal (`lifesim.save` del perfil real) no se lee ni se escribe. Alternativa
equivalente ya existente: exportar/importar JSON en «Partidas».

### 5. Registro diario (formato fijo)

| Día | Tiempo in-game | Lugar | Saldo | Energía | Decisiones | Bloqueos | Captura / descripción |
| --- | --- | --- | ---: | ---: | --- | --- | --- |
| 1 (parcial) | Lun 08:30–09:53 | Olmo 7 → Plazuela del Metro → Metro · Vallesco (vestíbulo, máquina, andén) | €107,50 (tarjeta €10) | 100 | Tarjeta comprada (€12,50: €120 → €107,50, HUD «tarjeta · €10»); guía saltada; no se subió al tren | Recorrido detenido por coste (ver «Fase 2 — estado 15 nov»); sin turno, cobro, vuelta, cena ni Dormir | scratchpad day1-n.png |

### 6. Severidades

- **P0** — rompe la ruta crítica o los datos: no se puede subir al metro, el turno de Decathlon no paga, la
  matrícula no se aplica, el guardado no carga o pierde dinero/relaciones, el jugador queda atrapado.
- **P1** — la ruta se completa con un rodeo serio o información errónea: el HUD tapa el botón E, la agenda da
  hora o sitio equivocados, el joystick no responde en una orientación, la pausa deja correr el reloj.
- **P2** — molestia sin bloqueo: «PARTIDA GUARDADA» pisa un momento los iconos, 2 px de desborde a 320 px,
  texto con tecla en móvil.

### 7. Escenas densas para rendimiento

1. Vallesco a mediodía (calle principal, ~1 400 objetos de escena).
2. Andén de Vallesco en hora punta (08:15).
3. Ribera de noche (23:30: mapa de luz, farolas, neón, agua).
4. Estadio de Arena con partido en juego (día 10, 21:46, fase `live`).
5. Concentración vecinal en el Casco Antiguo (suceso forzado, 13–17 participantes).

### 8. Versión del HUD móvil

El árbol de trabajo tiene ALPHA-09 aplicado (barra de una línea, fila de iconos, desplegable, zoom ajustable),
**sin commit**. `HEAD` (8e292cb) aún tiene el HUD anterior. Discrepancia a tener en cuenta en cualquier
prueba sobre un build desplegado desde `HEAD`.

## Fase 2 (recorrido de 7 días): piloto de entradas reales

Las herramientas de navegador de la sesión (Chrome DevTools MCP) no mantienen una tecla ni un dedo, y andar lo
exige. Se añadió `scripts/qa/pilot.mjs`: un Chrome propio con perfil temporal aislado y órdenes sueltas por CDP
con entradas reales del navegador (`Input.dispatchKeyEvent` mantenido con autorrepetición, `dispatchTouchEvent`
mantenido, clics), capturas y lectura del texto visible (HUD, aviso, diálogo, menú). No lee ni escribe `lifesim`
ni el guardado durante el recorrido; sólo su `selftest` lee la posición del jugador, para probar la herramienta.

**Decisión del usuario (5 nov 2026):** un recorrido automatizado con esta herramienta, en **escritorio**, cuenta
como «sin ayudas» para cerrar LV-01. Sigue prohibido lo demás: consola para cambiar estado, teletransporte,
cambiar la hora o editar el guardado.

Pausa del propio juego (permitida): cada acción reanuda con «Seguir» y vuelve a pausar con el botón Menú, para
que el reloj no corra mientras se decide el siguiente paso. Medido tras corregir la herramienta: en pausa el
reloj no avanza (08:31 → 08:31 en 20 s); una orden vacía cuesta 0–1 min de juego (antes 1–2 min); `read` y
`shot` no reanudan. Al salir de la pausa el juego suelta las teclas (`releaseAll`/`resetKeys`): por eso el
mantener repite `keyDown` cada 50 ms, como la autorrepetición del sistema.

Limitación del piloto: Chrome sin ventana con render por software va a ~9,5 fps en 1440×900; el juego limita el
paso por fotograma a 100 ms, así que andar va a velocidad casi real (~75 px/s medidos), pero la cámara se ve
retrasada en las capturas.

Estado: herramienta lista y medida; el recorrido del día 1 se empezó (guía leída, camino al metro) y se
interrumpió en la boca del metro de Vallesco, lunes 09:26, sin registrar. **Ningún día completado todavía.**

**Estado 15 nov 2026 (con MAP-08 sin commit en el árbol).** `pilot.mjs` admite ahora `start <modo> --profile <dir>` (perfil persistente; `stop` no lo borra) y `key F5`. Se comprobó cerrando y reabriendo Chrome: la portada recupera la partida (Día 1 · Lun 12 Abr · 08:30 · Barrio Vallesco · €120). El perfil está en el scratchpad de la sesión: `lifesim-week`. Se reinició el día 1 con partida nueva. Dos sesiones de QA (unos 40 turnos) avanzaron solo de 08:30 a 09:53. A ese ritmo, la semana completa costaría más de 30 sesiones, y el usuario decidió parar y documentar. **LV-01 sigue abierto.** Cubre la semana, de forma sintética, `check-week` (en `npm run check`, en verde con MAP-08).
Clima observado (MAP-08): HUD «Despejado 20°» a las 08:30 y «Despejado 21°» de 09:08 a 09:53. App Tiempo a las 08:30: Ahora Despejado 20° · 11:00 22° · 14:00 24° · 17:00 24° · 20:00 21°, todo despejado. No hubo lluvia, tormenta ni niebla. Sin efectos que medir.
Hallazgos (todos P2, sin confirmar a mano):
- Los torniquetes del vestíbulo de Metro · Vallesco dejan una rendija estrecha y sin señalizar hacia el andén: se perdieron unos 20 min de juego (09:30→09:50) y un tren. Puede ser solo la granularidad de `walk`.
- En day1-n.png el personaje parece pisar la franja amarilla del andén. Puede ser el orden de dibujo de los sprites.
- La primera E delante de la boca de metro abrió «GUÍA 1/5 · CASA» en vez de entrar; la segunda E entró.
- «1. Tarjeta de transporte €12,50» se sigue ofreciendo después de comprarla. No se probó una segunda compra.
Notas de pilot: cada orden cuesta 1–3 min de juego aunque solo sea `key E` + `read`. `walk` avanza unos 60–80 px de pantalla por segundo y se atasca con NPC y mobiliario sin avisar. `tap "Hoy"` falla si hay una app del móvil abierta.
Navegación reutilizable: desde el portal de Olmo 7, walk s 250 → w 700 → n ~3000 hasta «Metro · Vallesco» y E. En el vestíbulo, la máquina está a la derecha (s 250 → e 600 → n 300). Al andén, desde la máquina: s 200 → w 120 → n 1200 → e 300 → n 1200. El menú de destino sale con E en el andén cuando el tren está parado con las puertas abiertas.

## Fase 3 — Táctil

| Prueba | Emulado (390×844@3, 844×390@3) | Físico |
| --- | --- | --- |
| Joystick 360°, diagonales, cambio brusco, soltar | **PASS** con dedo real por CDP (`pilot.mjs selftest` en 390×844@3 táctil): las 8 direcciones mueven hacia su lado — s [0,56], n [0,−56], e [118,0], w [−104,0], se [68,81], nw [−75,−72], sw [−104,15], ne [73,−43] px. Control positivo: con la bolsa abierta todas dan [0,0] y el `selftest` falla (exit 1). Lógica también por test (`check-input`). Los `PointerEvent` sintéticos por JS no sirven (pierden la captura del puntero) | NO VERIFICADO |
| Botón contextual | **PASS** (aparece con «ENTRAR»/«HABLAR» junto a puertas y gente; el hint ya no repite el verbo) | NO VERIFICADO |
| Mapa, móvil, bolsa, sonido, menú | **PASS** (cada icono abre su panel; sonido cambia de nivel) | NO VERIFICADO |
| Pellizco (zoom) | **PASS** (3 → 3,3 → 4 → 5 y vuelta; se guarda) | NO VERIFICADO |
| Cambio de orientación | **PASS**: día, hora, dinero, energía, lugar y posición idénticos; lienzo 1170×2532 → 2532×1170; zoom 3; HUD [10,10,290,44], stick [5,228,157,157], E [749,295,70,70] | NO VERIFICADO |
| Pausa manual (Menú) | **PASS** (se abre; Esc con el desplegable abierto no la dispara) | NO VERIFICADO |
| Pestaña oculta / foco | Por código: `SimulationPause('hidden')` en `visibilitychange`. Observado: con la pestaña de pruebas en segundo plano el navegador baja a ~1 fps y el reloj avanza a ~0,05 min/s por el tope `MAX_FRAME_MS`, sin saltos. Pausa al ocultar: **NO VERIFICADO** en emulación | NO VERIFICADO |
| Teclado virtual | **N/A** en juego (sin campos de texto); el nombre del creador sí usa uno: NO VERIFICADO | NO VERIFICADO |
| Recarga con partida en curso | **PASS** (Continuar recupera la partida en cada recarga de esta sesión) | NO VERIFICADO |

Dispositivo físico: ninguno disponible en esta sesión.

## Fase 4 — Correcciones

Ningún P0/P1 de ruta crítica encontrado en lo que se pudo probar; no se ha modificado código.
P2 conocidos (de ALPHA-09, documentados, sin corregir): «PARTIDA GUARDADA» se solapa unos segundos con la
fila de iconos/ONLINE en móvil; a 320 px el botón de detalles sobresale ~2 px de la barra.

## Fase 5 — Rendimiento

Medición: 5 s de `requestAnimationFrame` y `game.loop.actualFps`, pestaña en primer plano, calidad por defecto.
Para llegar a cada escena se usó teletransporte y hora forzada (sólo medición, no recorrido).

| Escena | Escritorio 1440×900@1 (mediana / p95 / fps) | Móvil 390×844@3 emulado |
| --- | --- | --- |
| Vallesco 12:00 | 16,7 / 17,7 ms / 55,6 | 16,7 / 17,7 ms / 56,1 |
| Andén Vallesco 08:15 | 16,7 / 17,2 ms / 59,6 | 16,7 / 17,2 ms / 59,7 |
| Ribera 23:30 | 16,7 / 17,3 ms / 59,4 | 16,7 / 17,6 ms / 59,7 |
| Estadio, partido en juego (21:46) | 16,7 / 17,3 ms / 58,8 | 16,7 / 17,1 ms / 56,6 |
| Concentración vecinal (Casco Antiguo) | 16,7 / 17,2 ms / 59,5 (fase activa, 17 participantes) | 16,7 / 17,2 ms / 58,2 (fase de llegada, 13) |

Partido y concentración se prepararon con hora forzada y `lifesim.events.force` (sólo medición). Una primera
toma de la concentración salió a 1 001 ms por fotograma porque la pestaña quedó en segundo plano (el
navegador la limita a 1 fps); se descartó y se repitió con la pestaña al frente.

Emulación en un PC: la CPU es la del PC, no la de un teléfono. Sin correcciones, no hay antes/después.

## Criterios

| Criterio | Estado |
| --- | --- |
| git status/diff iniciales; cambios ajenos conservados | PASS |
| Evidencia existente clasificada | PASS |
| Partida aislada documentada y usada | PASS (contexto aislado) |
| Registro diario en este archivo | Formato PASS; día 1 parcial, días 2–7 NO VERIFICADO (parado por coste, 15 nov) |
| 7 días o corte exacto | Corte en el día 1, lunes 09:26, boca del metro de Vallesco (sin registrar); piloto listo |
| Ruta crítica cubierta | NO VERIFICADO (sólo por tests) |
| Sin bloqueos de ruta crítica abiertos | NO VERIFICADO |
| Táctil emulado / físico por separado | PASS / NO VERIFICADO |
| P0/P1 corregidos; P2 documentados | N/A (ninguno hallado) / PASS |
| Rendimiento en escenas densas | PASS (5 de 5) |
| Sin regresión de cámara, zoom, HUD, safe-areas, controles, pixel art | PASS (sin cambios de código) |
| No se declara prueba real con sólo emulación | PASS |
