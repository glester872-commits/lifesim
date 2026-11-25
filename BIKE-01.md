# BIKE-01 · Sistema de ciclismo jugable

Resultado: **PASS** · BALANCED · correcciones 2/2.
Agentes: planner, builder y evaluator, más los especialistas gameplay-qa, visual-qa y optimizer.

## 1. Archivos y motivo

| archivo | motivo |
|---|---|
| `src/config/cycling.ts` | Parámetros: `MAX_SPEED` (2,5× la velocidad a pie), `ACCEL`, `BRAKE`, `EMERGENCY_BRAKE`, `DRAG`, factores de giro, `MOUNT_MS`/`DISMOUNT_MS`, energía por tile, `PEDESTRIAN_FACTOR` 0,5 y `KMH_PER_PXS` (calibrado para 20 km/h) |
| `src/systems/Cycling.ts` | Estados `ON_FOOT`/`MOUNTING`/`CYCLING`/`BRAKING`/`DISMOUNTING`/`PARKED`; `step` independiente de los FPS con `dt` acotado; montar y bajar; propietarios `player`/`company`/`npc`/`public`; `parseBikes` tolerante; alquiler con `rentPublicBike`, `returnPublicBike`, `rentBlocker`, `bikeShareCharge` y `nextPublicBikeId`; `canRideThrough` |
| `src/world/RiderFrames.ts` | `facingFrame`, función pura |
| `src/world/CyclistArt.ts` | Frente y espalda dibujados por código solo para el jugador (vía `facings`), colores propios y el poste de estación `bikeDockTexture` |
| `src/entities/Player.ts` | `setRiding`, `ride` y `halt` con `facingFrame` |
| `src/scenes/WorldScene.ts` | `rideFrame`; interactuables `'bike'` y `'dock'` por el `pickTarget` único; `riderLookOf` (ropa propia, o uniforme y caja si hay turno); guarda de portales «Aparca la bici antes de entrar.»; `syncBikes`; `rentBike`/`useDock` |
| `src/systems/Interaction.ts` | Tipos `bike` (7.5) y `dock` (7.4); una bici aparcada cede ante lo que miras |
| `src/state/GameState.ts` | `_bikes`/`setBikes`; la marcha montada vive en memoria; `rentPublicBike` con ledger idempotente; el snapshot guarda la bici montada como aparcada en la posición del jugador |
| `src/systems/SaveSystem.ts`, `src/types/game.ts` | Campo opcional `bikes`, sin subir `SAVE_VERSION` (12) |
| `src/data/items.ts` | Bici personal delante de casa |
| `src/data/deliveries.ts` | `address`; 2 `DeliveryDef` nuevos; `ShiftDef` `'ca-turno-reparto'` de 3 tramos (café → ultramarinos → panadería → café), €30, `bikePoint` `CA_DELIVERY_BIKE` |
| `src/systems/Delivery.ts` | `acceptShift`; tramos con un único `runId` y un único cobro `delivery:<runId>`; pista «Entrega n/3 …»; reglas de la bici de empresa: `lendForShift`, `companyBikeBlocker`, `returnsCompanyBike`, `collectCompanyBikes`; `parseRun` tolerante |
| `src/data/campoAlto.ts`, `src/data/vallesco.ts` | Points `CA_DELIVERY_BIKE`, `CA_BIKE_SHARE` y `BIKE_SHARE_METRO` |
| `src/data/bikeShare.ts` | Tarifa de 1 €; 2 estaciones junto al metro de Vallesco y de Campo Alto |
| `src/scenes/Menus.ts` | Turno en el tablón; `syncBikes`; «¿Recoger/Entregar el paquete?»; texto «a pie o en bici» |
| `src/ui/HUD.ts`, `src/main.ts` | «NN km/h» solo montado y en escritorio, sin tocar el DOM si no cambia |
| `src/ui/MobileControls.ts`, `src/systems/PlayerInput.ts`, `src/style.css` | Botón «Frenar» solo montado, en el hueco de «Volver», sin mover ALPHA-09 |
| `scripts/check-bici.ts` | Bloques A-P y O2 |
| `scripts/check-reparto.ts` | Bloques M-P |
| `scripts/check-interaction.ts` | Caso del tablón |
| `package.json` | `check-bici` en la cadena |

## 2. Decisiones

- Física pura en `systems/`; la Scene solo coordina.
- Frenar es la acción `'advance'` (Espacio o el botón «Frenar»).
- La zona peatonal se decide por el tile `ROADWAY`.
- Montado no se entra en interiores ni en el metro.
- El turno es un `ShiftDef` de 3 tramos con un solo `runId`: un cobro, idempotente sin tocar `applyDelivery`.
- La bici de empresa se presta en un point con nombre y se recoge al terminar.
- Alquiler con un id único por alquiler y cobro idempotente en el ledger (`'transport'`, source `'bike-share'`).
- Frente y espalda solo para la textura del jugador (optimizer: ~2,6 MB menos al tope de 48).

## 3. Sistemas reutilizados

`pickTarget`/Interaction, LocationSystem (points, `ROADWAY`, portales), Delivery y `deliveries` de VID-10, el ledger de GameState, SaveSystem, Player/CyclistArt/`PALETTE`, HUD, MobileControls/`bindButton` y Traffic (límite de vehículos).

## 4. Evidencias

| comprobación | resultado |
|---|---|
| `tsc` | PASS, 0 errores |
| `npm run check` completo | PASS, 166/166, FAILS=0 |
| `npm run build` | PASS, exit 0 |
| Montar y bajar con E (escritorio, 958x888) | PASS |
| Velocidad: acera 95 px/s, calzada >150 | PASS |
| Aceleración progresiva, inercia, freno con Espacio, colisiones | PASS |
| «Frena antes de bajarte» con freno de emergencia | PASS |
| Vista de frente (frames 5-8) y de espalda (9-12) sin flip | PASS |
| Ropa propia al montar | PASS |
| «Aparca la bici antes de entrar.» | PASS |
| Guardar montado → la recarga la deja aparcada | PASS |
| Tablón «Turno de reparto · 3 entregas €30», bici de empresa junto al tablón, uniforme con turno | PASS |
| Pistas «Entrega 1/3: … Ultramarinos Esquina, Calle del Campo, acera norte, antes de las 11:34» | PASS |
| Tramos 1-2 sin pago; el 3.º cobra 30 € una vez (110 → 140); una sola línea `delivery:ca-turno-reparto:1:552`; recarga sin duplicar | PASS |
| Cancelar antes de recoger: 0 € y 0 rep | PASS |
| Cancelar tras recoger: 0 € y −1 rep; bici de empresa recogida | PASS |
| Recarga a mitad de turno con pública aparcada y bici de empresa: todo recuperado, a pie | PASS |
| Alquiler «Coger bici (€1)»: cobra 1 € una vez y monta; «Devolver bici»; la segunda se bloquea con una activa; realquiler con id nuevo | PASS |
| «10 km/h» en acera | PASS |
| Consola sin errores | PASS |
| 7 ciclistas NPC circulando | PASS |
| 56-60 fps, vehículos 23/24 | PASS |
| Móvil emulado 390x844 DPR3: «Frenar» solo montado, sin solape con «E Bajar» | PASS |
| gameplay-qa (8 direcciones y diagonales, frenos, colisiones, km/h) | PASS |
| visual-qa | PASS con reservas menores (cesta marrón, quitada) |
| optimizer a pie (58-60 fps, 0 texturas por frame, 0 mutaciones de `.hud__kmh`) | PASS |
| evaluator | PASS |
| Dispositivo móvil físico | NO VERIFICADO |
| Expirar un turno por plazo en navegador | NO VERIFICADO (cubierto por `check-reparto` N) |
| FPS medidos pedaleando con muchos NPC | NO VERIFICADO (solo a pie, y 56 fps con la bici) |
| Realquiler en el mismo minuto exacto en navegador | NO VERIFICADO (cubierto por `check-bici` O2) |
| Tablón con bici delante en navegador | NO VERIFICADO (cubierto por `check-interaction`) |

## 5. Limitaciones

- Si el turno termina montado, el uniforme se mantiene hasta volver a montar.
- Una bici de empresa bajada lejos de su punto se recoge al cambiar de ubicación.
- Las direcciones van sin número porque los datos no lo tienen («Calle del Campo, acera norte»).
- Solo hay turno en Campo Alto y 2 estaciones.
- La bici no viaja en metro.
- El manillar es de tinta, igual que en todas las bicis.
- No hay compra nueva en Decathlon: se reutiliza el ítem `bike` existente.

Sin commit, push, merge ni deploy.
