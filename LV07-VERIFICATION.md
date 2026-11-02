# LIFE//SIM · LV-07 · verificación

Fecha: 2 de noviembre de 2026. Repositorio real: `C:\Users\glest\Documents\lifesim`.
Rama: `alpha-09-fachada`; HEAD inicial: `ed0133b` (`Ultimas mejoras`). Sin commit, push, merge ni despliegue.

## Estado inicial y alcance

Se leyeron las instrucciones `AGENTS.md`/`CLAUDE.md` del espacio de trabajo y `CLAUDE.md`/README del repositorio. No hay instrucciones adicionales en `src` o `scripts`. El estado inicial ya tenía cambios ajenos en Ronda, viviendas, personajes, arte, lugares y varias pruebas; se conservaron. Los archivos compartidos (`locations`, `places`, tipos y `package.json`) se editaron sobre ese contenido, sin revertirlo.

Stack verificado en código: Phaser 3.90, TypeScript 6 y Vite 8; UI HTML/CSS, arte procedural, una WorldScene y un GameState/TimeSystem. Se auditaron Transit/World.travel, Places/portales, Commerce, MetroSystem/TrainSystem/PassengerAI, menús, colisiones, recuperación y SaveSystem. El README remoto no se utilizó como prueba de funcionamiento.

## Implementación y decisiones

- L2 conserva sus siete paradas y sus tiempos. L3 añade únicamente dos andenes: Puerta Central y Polígono Norte, conectados por un trayecto exprés de 15 minutos. Su destino es el Polígono Norte existente, con Decathlon y empleo jugables; no se inventa otro barrio.
- Hay pasillos físicos señalizados, de dos minutos, en ambos extremos. Se entra por las bocas existentes, se camina hasta el andén elegido y se espera a que el tren abra sus puertas. El menú sólo ofrece destinos de esa línea. Cambiar de línea exige usar el pasillo.
- Las dos líneas tienen servicio continuo de gameplay. Frecuencia, primeras llegadas, retrasos, pasajeros y puertas siguen usando MetroDaily/TrainSystem. No se simulan otros trenes o mapas fuera de la escena cargada.
- Se valida la tarjeta al subir al primer tren: €2 hasta salir a la calle. El cambio de andén mantiene la validación, incluso tras recargar y con saldo cero. Al salir se cancela; un nuevo viaje de vuelta requiere otros €2. Las esperas y caminatas consumen el reloj existente, además de los minutos declarados de tren/pasillo.
- `Transit.routeBetween` calcula recorridos entre andenes mediante trenes y correspondencias reales; World.travel utiliza ese grafo. Se validan enlaces y spawns. El mapa identifica los andenes a través de la boca compartida; Places, carteles y megafonía reconocen las dos líneas.
- Los destinos sin mapa visitable se deshabilitan y se rechazan antes de cualquier pago, avance de reloj o registro narrativo. Actualmente todas las paradas de la red tienen mapa.

## Persistencia y recuperación

Guardado v3, con migración desde v1/v2. Se almacena una validación versionada ligada al andén (`metroJourney`, fase lógica `platform`). Una partida antigua carga sin una validación inventada; conserva su dinero, saldo, reloj y efectos.

Antes de confirmar el menú no se ha cobrado ni viajado. Al confirmar se validan puertas, origen, destino, horario y saldo. La llegada lógica se confirma y guarda antes del fundido. El destino se establece antes de avanzar el reloj: los sistemas que autoguardan al cruzar medianoche también ven ya el destino y la tarifa correctos. Durante el fundido, la escena anterior deja de actualizar posición/reloj.

El ciclo visual del tren, las puertas, NPC, retrasos y sucesos en curso siguen siendo transitorios. Al cargar se reconstruye la estación; una posición segura se conserva y una posición en vías/borde/colisión se recupera en un spawn seguro. Restaurar repetidamente no cobra, reembolsa ni vuelve a avanzar tiempo. Los menús/diálogos y un posible evento narrativo pendiente no se reanudan; sus efectos ya confirmados permanecen guardados.

## Archivos propios de LV-07

| Responsabilidad | Archivos |
|---|---|
| Red, servicio y pasillos | `src/data/transit.ts`, `src/data/locations.ts`, `src/systems/Transit.ts` |
| Lugares, distrito y orientación | `src/data/places.ts`, `src/data/districtIdentity.ts`, `src/data/tour.ts`, `src/data/catalogs.ts`, `src/data/announcements.ts`, `src/systems/MetroSystem.ts` |
| Viaje e interacción | `src/scenes/Menus.ts`, `src/scenes/WorldScene.ts`, `src/systems/World.ts` |
| Guardado | `src/state/GameState.ts`, `src/types/game.ts`, `src/config/constants.ts`, `src/systems/SaveSystem.ts` |
| Mapa compartido | `src/systems/WorldMap.ts`, `scripts/check-map.ts` |
| Pruebas y documentación | `scripts/check-metro-transfers.ts`, `scripts/lv07-e2e.html`, `scripts/check-regression.ts`, `scripts/check-puerta-central.ts`, `package.json`, `README.md`, este documento |

Las modificaciones previas de los otros archivos del árbol de trabajo no pertenecen a LV-07.

## Resultados

| Comprobación | Estado | Evidencia / alcance |
|---|---|---|
| `npm run build` | PASS | TypeScript y bundle de producción. Persiste el aviso de chunks grandes. |
| `npm run check` | FAIL, previo | Se detiene en `check-population.ts:139`: `sólo 87/153 acompañantes se conocen`. Se reprodujo exactamente cargando las fuentes anteriores a LV-07 mediante un loader de lectura; no se revirtió el repositorio ni se relajó la prueba. |
| Resto de comprobaciones | PASS | 22 anteriores a población y 79 posteriores: 101/102 en conjunto. Se ejecutaron por separado las posteriores. La prueba de mapa detectó inicialmente la nueva relación entre andenes y boca compartida; se corrigieron implementación y prueba, y su repetición pasó. |
| Pruebas dirigidas LV-07 | PASS | Ida/vuelta, cuatro tramos en tren, €4 en total, diez fases guardadas y restauraciones triples idempotentes; saldo cero validado, insuficiente, falta de tarjeta, medianoche, migración v1/v2, datos corruptos, destinos sin mapa y salto directo de línea rechazado. |
| Guardados existentes | PASS | `check-save-torture`, `check-persistence`, regresión y economía. |
| NPC, vías, portales y puertas | PASS en las pruebas | Layouts/spawns/esperas/rondas transitables, portales simétricos; ciclo del tren a framerate regular e irregular; durante el recorrido no hubo NPC visibles en vías. |
| Navegador: teclado y ratón | PASS | Ida y vuelta física Arena → Puerta Central L2 → pasillo L3 → Polígono Norte → calle → vuelta inversa. Cuatro recargas reales. Tarjeta €10 → €8 → €6; cuatro tramos registrados, sin menú residual. |
| Navegador: móvil emulado | FAIL del recorrido completo; validación parcial PASS | Iframe 390 × 844, joystick/botones y menús mediante eventos táctiles sintéticos. Pasan la ida, cuatro recargas, costes, ausencia de desbordamiento, presupuesto y observadores reales de medianoche (23:55 → 00:10). La vuelta alcanza Puerta Central L2, pero el arnés agota el tiempo al caminar a y=192; en la observación posterior aparece Cuatro Ríos. Causa no aislada: no se da por validado el retorno móvil completo. |
| Teléfono real | NO VERIFICADO | No se utilizó hardware móvil. |
| Presupuesto | PASS medido en escritorio | Nuevo andén: un solo interior, 196 objetos, 1–2 agentes observados, sin excesos en `lifesim.perf()`, aproximadamente 59 fps en la sesión. Los perfiles de presupuesto bajo también pasan las pruebas del mundo; esto no mide rendimiento en un teléfono real. |

## Reproducción

1. `npm run dev -- --host 127.0.0.1 --port 5197 --strictPort`.
2. Abrir `http://127.0.0.1:5197/scripts/lv07-e2e.html`. Este arnés sólo permite el puerto 5197 y crea una partida de QA desechable; usar un origen diferente al habitual protege su guardado. Ejecutar «teclado + ratón» o «móvil emulado». Los controles son sintéticos, sobre el juego real; no se teletransporta al jugador durante el recorrido.
3. Para probar a mano: tarjeta con al menos €4, entrar en Arena, L2 hasta Puerta Central, bajar al vestíbulo y tomar el pasillo de la izquierda a L3. Esperar y viajar a Polígono Norte; salir a la calle. Volver por la misma boca, cambiar al andén L3, viajar a Puerta Central y transbordar a L2 hasta Arena.
4. Recargar en entrada, espera, selección, llegada, pasillo y salida. Confirmar que el saldo sólo baja al validar una nueva entrada en la red, y el reloj no repite el tramo confirmado.

Tiempo nominal de ese recorrido de QA: 32 minutos de ida y 34 de vuelta (incluye el acceso de vuelta de L2 a L3 en Polígono Norte), más caminatas en mapas y esperas. La L2 directa Puerta Central–Polígono Norte sigue tardando 75 minutos.

## Impactos, riesgos y límites

No se añaden dependencias, escenas, relojes ni economías. La nueva línea reutiliza arte, colisiones, pools y presupuesto; se mantienen los sistemas existentes. Una versión anterior del juego no reconoce un guardado v3: la compatibilidad se ofrece al cargar v1/v2 en esta versión, no a la inversa. Una partida antigua no permite deducir una validación activa que nunca se guardó.

La espera visual se reinicia al recargar y la partida se recupera en estación, no dentro de un vagón en movimiento. Las colisiones y NPC se han validado con datos, simulaciones y recorridos; no se afirma una prueba exhaustiva de todos los sucesos aleatorios. La batería global sigue roja por el fallo previo de población, que queda fuera de esta funcionalidad. No hubo commit, push, merge ni despliegue.
