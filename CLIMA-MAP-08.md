# MAP-08 — Clima: tormenta, niebla, previsión y efectos

Amplía `src/systems/Weather.ts` (no hay sistema paralelo). Todo es función de `state.day`/`state.hour`/`state.minute`.

## Definiciones previas

**Modelo**

| Campo | Fuente | Rango |
|---|---|---|
| `current` | `weatherAt(day, hour)` | `Weather` |
| `forecast[]` | `forecast(day, hour, hours = 12, step = 3)` → `{ day, hour, w }[]` | cruza medianoche |
| `intensity` | `w.rain`, `w.cloud`, `w.fog`, `w.gust` | 0..1 |
| `effects` | `weatherEffects(w)` → `{ walkPace, metroDelayPerStop }` | constantes `WALK_PACE`, `METRO_DELAY_PER_STOP` |

`fog` y `gust` son opcionales en el tipo `Weather` (los `Weather` escritos a mano en scripts siguen valiendo); `weatherAt` siempre los rellena.

**Estados (`Sky`)**, por prioridad en `skyOf(cloud, rain, fog, gust)`:
`storm` (gust > 0,4 y rain > 0,08) > `heavy-rain` (rain > 0,55) > `light-rain` (rain > 0,08) > `fog` (fog > 0,5) > `cloudy` (cloud > 0,5) > `clear`.
`isRainy(sky)` = light-rain | heavy-rain | storm (sustituye a `sky.endsWith('rain')` en WorldScene y Characters).
Etiquetas (`weatherLabel`): Despejado, Nublado, Lluvia, Chaparrón, Tormenta, Niebla.

**Transiciones y rampas**

- Tormenta: en `planFor`, tras las tiradas existentes (no cambia la lluvia de ningún día ya conocido), una tirada por episodio; sólo episodios fuertes (pico ≥ 0,75), `celsius` del plan > 8 y estación ≠ invierno, con probabilidad 0,35. `gust` = pico × rampa del episodio tormentoso (la misma rampa de 0,6 h que la lluvia).
- Niebla: dos tiradas más al final de `planFor`; probabilidad 0,3 si el `celsius` del plan < 11; densidad 0,6–0,95. Entra desde la 1:00 (rampa 2 h), plena de 3:00 a 8:00, se levanta hasta las 10:30 (rampa 2,5 h). Multiplicada por `1 − smooth(rain / 0,08)`: nunca hay niebla con lluvia > 0,08.
- Una tormenta de ayer puede seguir de madrugada (como la lluvia).

**Efectos**

| Sky | walkPace | metroDelayPerStop |
|---|---|---|
| clear / cloudy / light-rain | 1 | 0 |
| heavy-rain | 0,9 | 0 |
| storm | 0,85 | +3 min |
| fog | 0,95 | +1 min |

- Paso: `Player.weatherPace` (campo público), multiplicado en `move`. WorldScene lo fija cada frame: `walkPace` si `getLocation(state.locationId).kind === 'exterior'`, si no 1.
- Metro: `Transit.weatherDelay(from, to, hour, day)` = paradas × `metroDelayPerStop` con el tiempo a la hora de salida. Se suma sólo en `prepareRide` (único punto que da los minutos del viaje); el menú de destino enseña el mismo número. Sin `day` (checks antiguos) no hay retraso. Tarifa intacta (€2). Con sol: Vallesco–Ribera 15, Vallesco–Arena 60.
- Eventos: StreetEvents ya cancela por lluvia; la tormenta lleva lluvia alta → cubierto sin tocar.

**Overlay**

- `world/Lighting.weatherSky`: oscurecimiento extra `gust × 0,18` hacia 0x6a7088 y velo `fog × 0,22` hacia 0xc4c8cf. `skyAt` y la noche (QA-06) no se tocan; los interiores y andenes (MET-05) salen antes y no pasan por aquí.
- `world/WeatherView`: rectángulo liso que sigue a `camera.worldView` (coordenadas de mundo en vez de scrollFactor 0, para que cubra exacto con zoom), alpha `fog × 0,38`, color claro de día y gris azulado de noche, por debajo de lo emisivo. Sin shaders ni blur. Con tormenta, gotas al máximo (`rain × 1,15 + gust`). Sin destello de rayo.

**Coordinación QA-06 / MET-05**: ver Overlay; no se modifica `skyAt`, `nightAt` ni nada del metro salvo los minutos del trayecto.

**UI**

- HUD: `<p class="hud__weather">` bajo `.hud__clock`, «Lluvia 12°», actualizado en el mismo `render()` que el reloj y sólo si cambia el texto. En la barra móvil (≤ 520 px de ancho o ≤ 480 de alto) se oculta para no recortar la hora (ALPHA-09); en el móvil está la app. Oculto viendo el partido.
- Móvil: app «Tiempo» (☁) → `{ app: 'weather' }`: «Ahora» y cuatro tramos de 3 h con etiqueta y °C; si hay tormenta en la previsión y no ahora, «Tormenta hacia las HH:00.». Sólo lectura.

**Persistencia**: derivada del reloj; ningún campo nuevo en el guardado.

**Compatibilidad LV-02**: partidas antiguas cargan igual (no hay campos nuevos). El tiempo de los días ya vistos no cambia de lluvia/nubes/temperatura (tiradas al final); sí puede aparecer niebla o tormenta donde antes había el mismo cielo sin nombre. `forceWeather` sin `fog`/`gust` da 0 en ambos (los scripts que fuerzan tiempo siguen igual).

## Evidencia

| Caso | Pasos | Esperado | Obtenido | Estado | Notas |
|---|---|---|---|---|---|
| Build | `npm run build` | sin errores | exit 0; solo el aviso habitual de bloque > 500 kB | PASS | |
| Cadena completa | `npm run check` | todo verde | exit 0, 2394 líneas, `fail 0` | PASS | incluye check-weather ampliado, metro, guardado, regresión |
| Frecuencias | 400 días a pasos de 10 min | storm y fog raros, deterministas | tormenta 10 días (2,5 %), niebla 38 (9,5 %) | PASS | script temporal, borrado |
| Sol: paso | `force({rain:0,cloud:0,fog:0,gust:0,celsius:20})`, andar 1 s | HUD «Despejado 20°», ritmo 1 | «Despejado 20°», weatherPace 1, ±76 px/s | PASS | Chrome 157, escritorio |
| Chaparrón: paso | `force({rain:0.8,...})` fuera y en la cafetería | ~0,9 fuera, 1 dentro | «Chaparrón 15°», 0,9 (±68,4 px/s, 90 %); dentro 1 (~76 px/s) | PASS | |
| Tormenta: paso y cielo | `force({rain:0.9,gust:0.9})` | «Tormenta», ~0,85, más oscuro | «Tormenta 15°», 0,85 (±64,6 px/s); luminancia sol 121,9 · chaparrón 78,8 · tormenta 71,9 | PASS | paraguas visibles en móvil |
| Metro sol / tormenta / niebla | `prepareRide` por script y viaje jugado en navegador con `force({rain:0.9,gust:0.9})`: andén de Vallesco, esperar puertas abiertas, elegir Ribera Norte | 15/60 con sol; más minutos con tormenta y niebla; €2 siempre | script: sol 15/60 · tormenta 18/72 · niebla 16/64. Navegador: el tablero muestra «Ribera Norte 18 min (retraso por el tiempo) · €2» y «Arena 72 min»; tras el viaje se llega a ribera-station y la tarjeta pasa de €8 a €6 | PASS | el reloj avanzó 28 min = 18 del viaje + ~10 de juego en los 5 s de espera (sin viajar, 5 s = 10 min) |
| Check permanente del retraso | `node scripts/check-weather.ts` | 15/60, 18/72, 16/64 con €2; sin day no hay retraso | check-weather exit 0; check-characters exit 0; `npm run check` completo exit 0, 2393 líneas, fail 0 | PASS | corrección 2; check-characters usa isRainy como el juego |
| Niebla: velo | `force({fog:0.9,rain:0,celsius:6})`, andar | «Niebla», velo claro que cubre la vista | «Niebla 6°», luminancia 137,3; velo 487×452 sobre vista 479×444 tras moverse | PASS | |
| HUD escritorio | jugar | «Etiqueta N°» bajo el reloj | «Nublado 26°» bajo el reloj | PASS | |
| HUD móvil 390×844 | emulación móvil táctil DPR 3 | sin desbordar; línea del tiempo oculta | scrollWidth 390, `.hud__weather` display none, barra intacta | PASS | emulado, no teléfono físico |
| App Tiempo | móvil → ☁ Tiempo (escritorio y 390×844) | Ahora + 4 tramos, español, sin botones muertos | «Ahora · Nublado 28°», 15:00…00:00 (cruza medianoche) | PASS | Cámara y Música siguen como marcadores registrados |
| force(null) | volver al clima del calendario | HUD coincide con now() | corregido: el atajo emite 'change' y el HUD se repinta al instante | PASS | ciclo de corrección 1 |
| Recargar | Continuar tras recarga | mismo cielo, sin errores | HUD «Nublado 26°» = weatherAt; consola 0 errores y 0 avisos | PASS | sin campos nuevos en el guardado |
| Rendimiento | `lifesim.perf()` | FPS como con sol | 60 fps chaparrón, 59 interior, 74 tormenta (móvil emulado) | PASS | niebla+tormenta juntas no medidas |
| Noche + niebla (QA-06) | `lifesim.date.set(2027,5,7,23,0)` en Ribera, `force({fog:0.9})` y comparar con despejado | sin conflicto con la luz nocturna | velo azulado suave; farolas y ventanas siguen iluminando; 79 fps | PASS | revisión visual por captura (c8-noche-niebla.png / c8-noche-clara.png) |
| Iluminación del metro (MET-05) | tormenta forzada dentro de vallesco-station | sin lluvia ni oscurecimiento dentro | interior del metro sin cambios con tormenta | PASS | captura c3-anden.png |
| LV-01 (7 días) | — | — | — | NO VERIFICADO | LV-01 no cerrado |

Navegador: Chrome 157.0.0.0, Windows 11; móvil solo emulado (390×844, DPR 3, táctil), sin teléfono físico. La partida del usuario (ranura 3) se respaldó y se restauró exactamente tras las pruebas.

Veredicto: PASS con limitaciones. Funcionan los estados, la previsión, el paso, el retraso del metro, el velo, el HUD y la app Tiempo, y el guardado no cambia. Queda sin verificar: LV-01 (7 días), y el móvil solo se ha probado emulado.

## No implementado

- **Energía pasiva por clima**: no existe sistema de desgaste pasivo de energía; crearlo amplía el alcance.
- **Ánimo**: no existe estado de ánimo del jugador.
- **Notificación push de tormenta (MAP-06)**: no hay sistema de notificaciones push; la app Tiempo avisa en su pantalla.
- **Diario (MAP-05)**: no existe diario donde anotarlo.
- **Destello de rayo**: opcional y no trivial sin tocar la luz; omitido.
