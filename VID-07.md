# VID-07 · Tensión del jugador

## 1. Inventario auditado

Base: main a5ecb3d, con los cambios sin commitear de LOC-01 y VID-01…06, que se conservan.
Se añade una sola dimensión, la tensión, en el nuevo `src/systems/Wellbeing.ts`; no se crea ninguna más.
Se reutilizan la energía, el reloj (`advanceMinutes` → `setClock`), la pausa y el guardado existentes.
Solo se extienden turnos, deporte, charlas y guardado; el paseo y el estado de ánimo son nuevos.

| capacidad | archivo/función | evidencia | carencia | decisión |
|---|---|---|---|---|
| energía | `GameState._energy` | Ya existe, de 0 a 100 | Ninguna | Reutilizar; no se duplica |
| turnos/carrera | `src/systems/Jobs.ts` `work`/`clockInBlocker`; `clockIn` en `src/scenes/Menus.ts` | Existe | No recoge el estado del jugador | Extender: banda opcional en `work` |
| reloj y saltos | `src/systems/TimeSystem.ts` `advanceMinutes` → `GameState.setClock` → `settleWellbeing` | El metro, dormir, los turnos y la espera pasan todos por ahí | Ninguna | Reutilizar |
| pausa | `src/main.ts` `SimulationPause`, razones 'menu' y 'hidden' → `game.scene.pause('World')` | El reloj vive en `WorldScene.update` | Ninguna | Reutilizar |
| deporte | `Fitness.train` y `relieveSport` en `WorldScene` (sparring, KickDrill, `applyWorkout`) | Solo cuenta si no se abandona | No aliviaba la tensión | Extender: alivio con tope |
| paseo | `WorldScene.update` | No había contador de tiles reales | Sin contador | Crear |
| social | `WorldScene` `noteMeeting`/`chatEnd` | Existen las charlas | No había alivio ni límite | Extender: −3 por NPC y día, con `encounters > 0` y `mood >= 50` |
| guardado | `SaveSystem` v12, migración v11→v12 | Existe | No existía el campo | Extender: `wellbeing` validado por `parseWellbeing` |
| estado de ánimo del jugador | — | No existía | Todo | Crear: `src/systems/Wellbeing.ts` |
| agenda | `Agenda.ts` | Existe | — | Sin tocar; fuera de alcance |

## 2. Decisión de dimensiones (principio de diseño)

- **Una sola dimensión, la «Tensión».** La motivación se descartó porque no produce una decisión distinta: la variedad ya la recogen las tres vías de alivio, y la repetición, los topes diarios.
- **Por qué no duplica la energía.** La energía es combustible a corto plazo y se repone comiendo o durmiendo. La tensión es carga acumulada durante días y solo baja moviéndose, entrenando, en compañía o con el paso del tiempo. Cada una pide una decisión distinta: comer o dormir frente a salir, entrenar o charlar.
- **Efectos que el jugador puede nombrar:**
  - «Hoy me cuesta concentrarme»: el bonus del turno baja como mucho un 10 % y sale esa línea.
  - «La gente me nota tenso»: la frase del NPC.
  - La consulta opcional en la Bolsa.

## 3. Contrato de datos

Tipos y constantes de `src/systems/Wellbeing.ts`:

```ts
export interface WellbeingSources { day: number; work: number; walk: number; sport: number; social: number; npcs: string[] }
export interface WellbeingState { v: 1; tension: number; lastMinute: number; sources: WellbeingSources }
export type WellbeingSource = 'work' | 'walk' | 'sport' | 'social';
export type TensionBand = 'calm' | 'ok' | 'tense';

export const TENSION_START = 20;
export const TENSION_MIN = 0;
export const TENSION_MAX = 100;
export const DECAY_EVERY_MIN = 120;
export const WORK_GAIN = 8;
export const WORK_LATE_GAIN = 12;
export const WORK_DAILY_CAP = 16;
export const SPORT_RELIEF = 6;
export const SPORT_DAILY_CAP = 12;
export const WALK_TILES_PER_POINT = 40;
export const WALK_DAILY_CAP = 6;
export const SOCIAL_RELIEF = 3;
export const SOCIAL_DAILY_CAP = 6;
export const TENSE_AT = 70;
export const CALM_AT = 25;
export const TENSE_BONUS_CUT = 0.10;
// MAX_NPCS = 20 (interno): NPC distintos que recuerda el día.
```

- **Valores:** mínimo 0, máximo 100 e inicial 20.
- **Timestamps:**
  - `lastMinute`: minuto absoluto de juego, `(día-1)*1440 + hora*60 + minuto`.
  - `sources.day`: día al que pertenecen los topes.
- **Caducidad:** −1 cada 120 minutos de reloj. `lastMinute` solo avanza lo que se consume. Si el reloj retrocede, la tensión no cambia.
- **Recuperación, con topes diarios:**
  - Deporte: −6, tope −12.
  - Paseo: −1 cada 40 tiles reales, tope −6.
  - Charla amistosa: −3 por NPC y día, si `encounters > 0` y `mood >= 50`; tope −6.
- **Dificultad, también con tope diario:** trabajo +8, o +12 si se llega tarde; tope +16.
- **Validación de `parseWellbeing`:**
  - Se exige `v === 1`, con `tension` y `lastMinute` finitos.
  - En `sources`, `day`, `work`, `walk`, `sport` y `social` deben ser finitos, y `npcs` un array.
  - Si algo no cuadra, se vuelve a `startWellbeing(nowMinute)`.
  - La tensión se recorta a 0..100 y los contadores negativos pasan a 0.
  - De `npcs` solo se conservan las cadenas, con un máximo de 20.
- **Guardado:**
  - `SAVE_VERSION` es 12.
  - La migración v11→v12 usa el minuto del propio save.
  - Un save v13 da 'newer'.
  - Es compatible con LV-02 por las ranuras.

## 4. Archivos modificados

- `src/systems/Wellbeing.ts` (nuevo)
- `scripts/check-bienestar.ts` (nuevo)
- `src/state/GameState.ts`
- `src/systems/SaveSystem.ts`
- `src/types/game.ts`
- `src/config/constants.ts`
- `src/systems/Jobs.ts`
- `src/scenes/Menus.ts`
- `src/scenes/WorldScene.ts`
- `package.json`

Además, los asserts de versión 11→12 de 10 scripts de check.

## 5. Pasos para reproducir

1. Ficha un turno: la tensión sube.
2. Con la tensión en 70 o más, ficha otro turno: el bonus baja y aparece «Hoy me cuesta concentrarme.».
3. Anda, entrena o charla con Sara, Ada o Amaia: la tensión baja.
4. Abre la Bolsa (I): muestra el estado.

## 6. Tabla QA

| caso | pasos | esperado | observado | resultado | evidencia |
|---|---|---|---|---|---|
| 1 · turno acotado | `wellbeingSource('work', 8)` tres veces; check-bienestar (a) y (h) | El trabajo sube la tensión con tope diario; el turno sin banda no cambia | Da 8, 16, 16. work() sin banda, con 'ok' o con 'calm' es deepEqual al anterior. Con 'tense', el bonus baja como mucho un 10 %, y el sueldo base, score y good no cambian | PASS | check-bienestar (a) y (h). Fichaje real en el navegador: PASS. Contratarse en Decathlon desde «Fichaje · sala de personal» («Leer el cartel» → «Solicitar el puesto» → «Aceptar el contrato»). Día 3 a las 10:40 (40 min tarde, inicio 10:00), tensión 80, «Fichar · Dependiente de sección» → «Atender la cola primero». La tensión pasa de 80 a 90 (+12 por llegar tarde y el decay del turno) y `sources.work` = 12. El diálogo dice «Llegas 40 min tarde. Marta lo apunta y te paga lo trabajado: €53,33.» y después «Hoy me cuesta concentrarme.». Esa opción no tiene bonus, así que el recorte del 10 % no se ve en euros; lo cubre check-bienestar (h) |
| 2 · paseo o deporte recuperan | Andar unos 1000 px; cuatro teleports; bici del gimnasio cortada y completa | −1 cada 40 tiles; los teleports no cuentan; el deporte solo alivia si se completa | Pasa de 60 a 59 y luego a 58; los teleports no lo cambian | PASS | Tope diario del paseo en el navegador: PASS. Partiendo de `sources.walk=5` y tensión 60, en 'district' (40,40), zigzag a izquierda y derecha: el contador llega a 6 hacia la casilla 22 (el resto de los paseos previos se acumula en memoria) y la tensión baja a 58 (el 60 → 59 previo fue el decay). Siguiendo hasta 81 casillas no baja más: se queda en 58 y walk en 6. Deporte en el navegador: PASS. Gimnasio Forja, bici, «Suave 15 min»: cortada al 30 %, «Lo dejas a medias…» y la tensión se queda en 60, sin bajar; completa, «Sesión terminada…», la tensión pasa de 60 a 54 y `sources.sport` = 6 |
| 3 · sin farmeo | check-bienestar (a), (c), (d) y (e); tope del paseo en el navegador (caso 2); en el navegador, contexto aislado 'vid07qa': diez teleports gym↔decathlon-tienda; Bolsa abierta y cerrada diez veces con T=77; `wellbeingSource('social')` con 'sara' dos veces el mismo día y otra al día siguiente | Ninguna acción repetida da alivio o carga sin límite | Teleports: walk se queda en 0 y walkTiles en 0. Bolsa ×10: wellbeing idéntico (comparado con JSON) y Δ reloj 0. Social con 'sara': −3 y luego 0 (80→77); al día siguiente, −3 otra vez (53→50) | PASS | check-bienestar (a), (c), (d), (e); navegador 'vid07qa'. El social se hizo por la API (`wellbeingSource`); la charla real está en el caso 5 |
| 4 · efecto reversible | check-bienestar (b) y (h); en el navegador, contexto 'vid07d', Bolsa con T=75, después sport −6 y Bolsa con T=69, y Bolsa con T=22; abrir la Bolsa con tensión alta | La línea de la Bolsa sigue a la tensión en ambos sentidos; el bonus baja como mucho un 10 % | T=75: «Llevas días con mucha tensión encima.». T=69: «Ni fu ni fa.». T=22: «Te notas en calma.». Tensión alta: «1. Llevas días con mucha tensión encima. / 2. Cerrar», con el cursor en Cerrar | PASS | check-bienestar (b) y (h); navegador 'vid07d'. Nada obliga a cambiar de actividad; el efecto máximo es −10 % del bonus |
| 5 · social con relación, horario y cooldown | Día 2 a las 17:30, con Ada en la calle (encounters 3, mood 60, tensión 80), charlar dos veces; check-bienestar (d) | Frase de tensión una vez; −3 una vez por NPC y día; al día siguiente vuelve a aliviar | Abre con «Pareces con mucha cosa encima hoy. Ey. ¿Qué tal?…»; pasa de 80 a 77 (social 3, npcs ['ada']); la segunda charla deja 77 y no repite la frase | PASS | check-bienestar (d). Fuera de escena por su horario, Ada no está disponible |
| 6 · pausa y reanudación | (a) Pestaña oculta unos 10 s; (b) Bolsa abierta 10 s | El reloj y la tensión no avanzan en pausa | (a) En 24 s reales el reloj avanzó +19 min de juego, que corresponden solo a los ~14 s visibles (≈2 min/s); T=28 y L=3480 sin cambio. (b) abs 3499→3499, T y L sin cambio | PASS | Navegador, observación directa del reloj y de wellbeing |
| 7 · guardar y cargar antes, durante y después | Recargar y continuar dos veces; check-bienestar (g); setClock(3,10,0) + work, setClock(3,11,59), guardar y recargar; setClock(3,12,0), repetir, guardar y recargar; en 'vid07d', metro, guardar y recargar | No se aplican horas de más ni se pierde estado | La tensión sigue en 77 y lastMinute en 2490. Tras work: T=36, L=3480; a las 11:59, recarga: abs 3599, T=36, L=3480 y work=16, sin cambios. A las 12:00: T=35, L=3600; repetir no lo baja más; recarga: T=35, L=3600. En 'vid07d', tras el metro, la recarga conserva T=28 y L=693 | PASS | check-bienestar (g); navegador. Consola sin errores ni avisos, también en las recargas |
| 8 · partida antigua | check-bienestar (g) | La migración v11→v12 usa el minuto del save, es idempotente, v13 da 'newer' y la basura vuelve a `startWellbeing` | Todo se cumple en node | PASS | check-bienestar (g). Solo node; no se inyectó en el navegador |
| 9 · dormir, viajar y avanzar | En 'home', 22:18 del día 1, tensión 100: Cama → Dormir (8 h); avanzar de día 3 12:00 a día 4 10:00 y +48 h; setClock hacia atrás; en 'vid07d', comprar la «Tarjeta de transporte (con €10 de saldo)» por €12,50 en la Máquina de billetes y viajar Vallesco→Arena (60 min) | −1 cada 120 min en cualquier salto; hacia atrás no cambia la tensión | Dormir: día 2 a las 6:18, tensión 96 (−4 en 8 h), energía 100. Avanzar Δ1320: 35→24 (−11); Δ2880: 40→16 (−24). Hacia atrás: T=16, solo baja L. Metro: reloj 615→689 (60 de viaje más unos 14 de reloj normal en la espera), tarjeta 10→8, metálico sin cambio, T=20 sin cambio por pasar menos de 120 min | PASS | Navegador. El viaje de vuelta no se pudo disparar con eventos sintéticos (el menú dejó de responder tras el primero), así que el decay dentro de un trayecto no se observó en directo; lo cubre el mismo camino `advanceMinutes` → `setClock`, verificado al dormir y al avanzar |
| 10 · límites tras ciclos repetidos | Bucle de 5 días (7 a 11); cada día work 12×2, sport 6×3, social sara/ada/marco y walk ×20 | Topes diarios respetados, T en 0..100, save estable | Cada día: work 16, sport 12, social 6 y walk 6, justo en el tope; npcs 3; T en 0..100 (llegó a 0 sin bajar de ahí); tamaño del save 3460 los 5 días | PASS | Navegador; consola sin errores ni avisos |
| 11 · sin bloqueos | Tensión 100, andar; dormir con 100; tras el bucle del caso 10, seguir jugando | La tensión no bloquea nada ni toca la energía | Anda 114 px y la energía queda en 100. Dormir con 100: PASS (caso 9). Tras el bucle se siguió jugando (metro y Bolsa) | PASS | clockInBlocker no recibe la tensión (lo verificó el evaluador en el código); consola sin errores ni warnings |
| 12 · sin regresiones | Build, cadena, FPS, visual-qa | Sin regresiones | Build y cadena en la sección 7. FPS en district: 94-95, over []. visual-qa: PASS, sin elementos nuevos en el HUD y sin lenguaje clínico | PASS | Sección 7. Detalles menores: el «1.» delante de una línea que no se puede elegir y la coincidencia de «encima» con «No llevas nada encima.». Cámara, zoom, HUD, safe-areas, pixel art y economía (salario base) sin tocar |

- **Aislamiento:** todas las pruebas de navegador usaron contextos aislados de Chrome ('vid07qa', 'vid07c', 'vid07d'). 'vid07d' empezó con localStorage vacío (0 claves). La partida del perfil normal del usuario no se abrió ni se modificó.
- **Dispositivo físico:** NO VERIFICADO.

- **Plataforma:** Chrome por CDP en escritorio.
- **Móvil:** PASS (emulado). Con Chrome emulando 390×844 DPR3 táctil, un toque CDP real en «Abrir la bolsa» muestra «1. Llevas días con mucha tensión encima. / 2. Cerrar», con el cursor en Cerrar, sin scroll horizontal (scrollWidth 390) y con la consola limpia. Captura: `C:\Users\glest\AppData\Local\Temp\claude\1cd68afec0b9951e\bd56eae1-9b20-4f82-9c8c-ddc89ecf6478\scratchpad\vid07-bolsa-movil.png`. No se ha probado en un dispositivo físico.
- **Captura:** `C:\Users\glest\AppData\Local\Temp\claude\1cd68afec0b9951e\bd56eae1-9b20-4f82-9c8c-ddc89ecf6478\scratchpad\vid07-bolsa.png`. No se crea la carpeta `VID-07/` para no meter binarios en el repo.

## 7. Build y check

- `npm run build`: exit 0 («✓ built in 1.00s»).
- Cadena completa: TOTAL=163 y FAILS=1. El fallo es `node scripts/check-regression.ts` (exit 1), que ya fallaba en a5ecb3d.

## 8. Corrección 1/2

El assert de `check-bienestar.ts:68` no tenía en cuenta el decay de 1440 minutos. Se arregló el test, no el modelo.

## 9. DeepSeek

NOT EVALUATED.

## 10. git diff --stat

```
 package.json              |   2 +-
 src/config/constants.ts   |   2 +-
 src/scenes/Menus.ts       | 100 ++++++++++----
 src/scenes/WorldScene.ts  | 287 ++++++++++++++++++++++++++++++++++++---
 src/state/GameState.ts    | 338 +++++++++++++++++++++++++++++++++++++++++++++-
 src/systems/Jobs.ts       |  34 ++++-
 src/systems/SaveSystem.ts |  41 ++++++
 src/types/game.ts         |  13 ++
 8 files changed, 756 insertions(+), 61 deletions(-)
Sin trackear: src/systems/Wellbeing.ts, scripts/check-bienestar.ts, VID-07.md
```

El stat acumula los cambios sin commitear de LOC-01 y VID-01…06 en esos archivos. Árbol completo: 49 files changed, 1325 insertions(+), 126 deletions(-). Los asserts de versión 11→12 también se cambiaron en 10 scripts de check.

## 11. Riesgos

- «Amistoso» significa `mood >= 50`.
- La frase solo sale en la charla libre de Sara, Ada y Amaia.
- El paseo hacia una máquina de entrenar también cuenta, dentro de su tope.
- El paseo no se guarda al instante: se puede perder como mucho 1 punto.
- La línea de concentración sale aunque el turno no tenga bonus.
- `tenseNoticed` no se guarda, así que tras recargar la frase puede repetirse una vez por NPC.
- En la Bolsa, la línea deshabilitada lleva un «1.» delante, y su «encima» coincide con el de «No llevas nada encima.».
- check-regression ya fallaba antes.
- En una partida nueva, `wellbeing` no se crea hasta la primera fuente. El getter devuelve `startWellbeing(ahora)`, así que antes del primer turno, paseo o charla no hay decay y la tensión se queda en 20. Es inocuo.
- Mover el reloj hacia atrás con `setClock` reinicia los topes diarios al volver a un día anterior. En el juego el reloj no retrocede; solo puede pasar con las herramientas de depuración, o en el futuro con multijugador o un reloj compartido.

## 12. Rollback

1. Borrar `src/systems/Wellbeing.ts` y `scripts/check-bienestar.ts`.
2. Revertir los hunks de VID-07 en:
   - `src/config/constants.ts`: `SAVE_VERSION` de 12 a 11.
   - `src/state/GameState.ts`: `wellbeing`, `wellbeingSource`, `settleWellbeing` y `absMinute`.
   - `src/systems/SaveSystem.ts`.
   - `src/types/game.ts`.
   - `src/systems/Jobs.ts`: `work`, parámetro `band`.
   - `src/scenes/Menus.ts`: `clockIn` y `openBag`.
   - `src/scenes/WorldScene.ts`: `relieveSport`, el paseo en `update`, `noteMeeting` y `tenseOpening`.
   - `package.json`.
   - Los asserts de versión de los 10 scripts.
3. Tras el rollback, los saves v12 darían 'newer' en v11.

## 13. Ampliación del ticket (12 casos)

- El ticket ampliado no requirió cambios de código.
- La auditoría y los 12 casos se completaron con pruebas nuevas en el navegador.
- Correcciones: 0/2.
