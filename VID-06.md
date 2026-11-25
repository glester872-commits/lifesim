# VID-06 · Vecindario: paquetes y favores

## 1. Inventario auditado

- Base: `main` a5ecb3d. Hay cambios sin commitear de LOC-01 y de VID-01 a VID-05; se conservan.
- Olmo 7 = `BuildingDef` `'home-door'` (`vallesco.ts:146`). No tiene interiores de otros pisos ni NPC que vivan en él.
- Ada vive en `RES_OLMO_3` y Amaia en `RES_OLMO_11`. Las dos tienen rutinas que salen y entran por su portal.
- SIM-05 existe (`Housing.ts`, `HOMES`).
- SIM-02 no existe como sistema: se usa `SocialProfile.memories`. NO VERIFICADO como sistema aparte.
- SIM-03 no existe: el evento es un tick determinista con id trazable `pkg-<día>-<npc>`. Queda como BLOCKED parcial para un evento trazable genérico.
- El inventario son contadores, sin objetos únicos ni objetos en el suelo.
- El recado del vecino de VID-03 se sustituyó, así que no había nada que reutilizar.

## 2. Definiciones y alcance

- Edificio y residentes se derivan de los datos (`residentsOf` y `neighborCandidates` sobre `CHARACTERS[].home` y los `BuildingDef`), sin NPC nuevos.
- La vivienda canónica es el portal de cada personaje.
- La vida del portal usa las rutinas existentes (sistema 77).
- Paquete:
  - Cooldown de 7 días, probabilidad de 0,35 y solo para NPC conocidos.
  - Plazo de 3 días; si vence pasa a `lost`, con −1.
  - Se recoge al cruzar la puerta de tu vivienda y se entrega solo a su destinatario, con +2 y una memoria `pkg:<id>`.
  - El estado es único (`pending`/`held`/`delivered`/`lost`), así que nunca está en la bolsa y en el suelo a la vez.
- Favor «Subirle la compra»:
  - Oferta determinista (`favorOfferFor`), con un 50 % por día y NPC y cooldown de 5 días. Solo se ofrece a candidatos, sin otro favor vivo y si no hay nada pendiente con esa persona.
  - Estados: `offered`, `accepted`, `done`, `declined` y `expired`.
  - Cuesta 20 minutos reales de reloj (`services.clock.advanceMinutes`), da +2 y una memoria `favor:<id>`.
  - Si no se hace, caduca con −1. Si se rechaza o no se contesta, no tiene efecto.
- Escalabilidad: como mucho 1 paquete y 1 favor vivos, MAX 12 por lista, sin trabajo por frame y catch-up de 3 días.

## 3. Contrato de datos

Tipos de `src/systems/Neighborhood.ts`:

```ts
export type PackageStatus = 'pending' | 'held' | 'delivered' | 'lost';
export interface Package { id: string; recipient: string; day: number; deadlineDay: number; status: PackageStatus; resolvedDay?: number }
export type FavorStatus = 'offered' | 'accepted' | 'done' | 'declined' | 'expired';
export interface Favor { id: string; kind: 'groceries'; npc: string; day: number; deadlineDay: number; minutes: number; status: FavorStatus; resolvedDay?: number }
export interface NeighborhoodState { v: 1; packages: Package[]; favors: Favor[]; lastEventDay: number; lastFavorDay: number; lastTickDay: number }
export interface NeighborEffect { npc: string; delta: Partial<SocialDelta>; memory: { ref: string; note: string; outcome: SocialOutcome } }
```

Validación de `parseNeighborhood(v, knownNpcs?)`:

- Si la entrada no es un objeto, devuelve `emptyNeighborhood()`.
- Descarta cada paquete o favor mal formado: id o npc vacíos, npc desconocido (si se pasa `knownNpcs`), días que no son enteros ≥ 0, `kind` distinto de `'groceries'`, `minutes` inválido o estado fuera de la lista.
- Si hay varios paquetes o favores vivos, solo se queda vivo el más reciente. Los demás pasan, sin efectos, a `lost` en el caso del paquete; en el del favor, a `declined` si estaba `offered` y a `expired` si estaba `accepted`.
- Recorta cada lista a `MAX_ITEMS` (12), ordenada por día.
- `lastEventDay`, `lastFavorDay` y `lastTickDay` inválidos pasan a 0 («nunca»).
- Los efectos se aplican una sola vez: `GameState.applyNeighborEffects` no reaplica uno si el NPC ya tiene una memoria con esa `ref`.

Guardado:

- `SAVE_VERSION` 11. La migración v10→v11 es idempotente y un guardado v12 se trata como `newer`.
- Hay compatibilidad con LV-02 vía slots.

## 4. Archivos modificados

Parte 1 y parte 2:

- `src/systems/Neighborhood.ts` (nuevo)
- `scripts/check-vecinos.ts` (nuevo)
- `src/config/constants.ts`
- `src/state/GameState.ts`
- `src/systems/SaveSystem.ts`
- `src/types/game.ts`
- `src/scenes/WorldScene.ts`
- `src/scenes/Menus.ts`
- `package.json`

Parte 3:

- `src/systems/Neighborhood.ts`: `favorFor` y `favorOfferFor`.
- `src/state/GameState.ts`: el helper `neighborCandidates()`, que ahora reutiliza `tickNeighbors`.
- `src/scenes/WorldScene.ts`: la rama de hablar con un personaje, con «Subirle la compra (20 min)» y la petición del favor.
- `src/scenes/Menus.ts`: en `openBag`, una línea deshabilitada para el favor aceptado.
- `scripts/check-vecinos.ts`: la sección j.

Corrección 1:

- `scripts/check-metro-transfers.ts`

## 5. Pasos para reproducir

1. Conocer a Ada o a Amaia y esperar o forzar un paquete.
2. Cruzar la puerta de Olmo 7: sale el aviso.
3. La bolsa (I) muestra la línea del paquete.
4. Hablar con el destinatario → «¿Qué tal?» → «Darle el paquete».
5. Favor: hablar con un vecino → «Vale, luego te la subo» → volver a hablarle → «¿Qué tal?» → «Subirle la compra (20 min)».

Para forzar el favor en la consola:

```js
s.setNeighborhood({ ...s.neighborhood, favors: [{ id: `fav-${s.day}-amaia`, kind: 'groceries', npc: 'amaia', day: s.day, deadlineDay: s.day, minutes: 20, status: 'accepted' }], lastFavorDay: s.day })
```

## 6. Tabla de QA

| caso | pasos | esperado | observado | resultado | notas |
|---|---|---|---|---|---|
| 1 · Vecina en el portal | Volver a casa por la tarde y salir por la mañana | Ada aparece una sola vez, con un único interactable | Ada aparece una sola vez en 5 muestras (19:53 a 20:33 al volver y 8:51 al salir), con 1 interactable | PASS | |
| 2 · Paquete | Cruzar la puerta, guardar, recargar, cruzar dos veces más y entregar | pending → held una sola vez; delivered con +2; persiste | pending → held al cruzar, con el aviso «El repartidor ha dejado en tu portal un paquete para Ada. Tienes hasta el jueves, 15 de abril de 2027.». Tras guardar, recargar y cruzar 2 veces más sigue habiendo 1 held, sin aviso nuevo y sin estar en inventory. Al entregarlo pasa a delivered, con amistad de 0 a 2 y 1 memoria; tras recargar sigue igual | PASS | |
| 3 · Destinatario equivocado | Hablar con Amaia llevando el paquete de Ada | No se ofrece «Darle el paquete» | Las opciones son «Hablar de comida», «¿Qué tal?» y «Tengo que seguir», sin «Darle el paquete», y el paquete sigue held | PASS | |
| 4 · Interior de casa | Entrar en 'home' y cruzar la puerta 4 veces | Ningún NPC dentro y el jugador no se queda atascado | Ningún NPC visible dentro de 'home'. El jugador se mueve 48 y 46 px después de 4 cruces | PASS | |
| 5 · Favor | Aceptar el favor y subir la compra; recargar | +20 min, +2 y done; persiste | El reloj avanza +20 min exactos, la amistad va de 0 a 2 y el favor queda done; tras recargar se mantienen done, 2 y 1 memoria | PASS | |
| 6 · Regresiones: bolsa | Abrir la bolsa (I) con un paquete | La línea del paquete, deshabilitada | Correcta | PASS | visual-qa. Detalle menor: el atenuado se confunde con el resaltado bajo el cursor |
| 6 · Regresiones: consola | Recorrer los casos anteriores | Sin errores | Sin errores | PASS | |
| 6 · Regresiones: rendimiento | Medir en la calle y en casa | Sin presupuestos nuevos superados | Calle: 57-59 fps, con over solo «vehicles 26/24», que ya venía de antes. Casa: 54-59 fps, con over []. tickNeighbors tarda 0,016 ms por llamada y el getter 0,0038 ms | PASS | optimizer: revisión estática PASS, sin trabajo por frame |
| 6 · Regresiones: checks dirigidos | Ejecutar los checks | exit 0 | exit 0 en check-vecinos, check-interaction, check-micro-stories, check-story, check-contact, check-week, check-housing, check-save-torture, check-persistence, check-quedadas, check-social-graph, check-consequences, check-reputation, check-luna, check-life-projects, check-fitting-stock y check-metro-transfers | PASS | |
| 6 · Regresiones: sin tocar | — | — | Cámara, zoom, HUD, safe-areas, pixel art y economía no se tocan | — | |
| Hablar con la tecla y cruzar caminando | Acercarse, pulsar la tecla y cruzar a pie | — | — | NO VERIFICADO | La QA usó `w.interact` |
| Línea del favor en la bolsa | Abrir la bolsa con un favor aceptado | «Subirle la compra a <Nombre> · hoy», deshabilitada | — | NO VERIFICADO | |
| Excepción del compañero de piso | Tener compañero de piso | No recibe paquetes ni favores | — | NO VERIFICADO | |
| Móvil y táctil | — | — | — | NO VERIFICADO | |
| Caducidad lost en el navegador | Dejar vencer el plazo | lost con −1 | — | NO VERIFICADO | La cubre check-vecinos (e) |
| Capturas del aviso y de las opciones del favor | — | — | — | NO VERIFICADO | |

- **Plataforma:** Chrome por CDP en escritorio. Sin emulación móvil y sin dispositivo físico.
- **Captura:** `C:\Users\glest\AppData\Local\Temp\claude\1cd68afec0b9951e\bd56eae1-9b20-4f82-9c8c-ddc89ecf6478\scratchpad\vid06-bolsa.png`. No se crea la carpeta `VID-06/` para no meter binarios en el repo.

## 7. Build y check

- `npm run build` termina con exit 0 («✓ built in 916ms»).
- La cadena completa, tras la corrección, da TOTAL=162 y FAILS=1: `node scripts/check-regression.ts` (exit 1), que ya fallaba en a5ecb3d.

## 8. Corrección 1/2

El assert de `SAVE_VERSION` en `scripts/check-metro-transfers.ts:93` pasa de 10 a 11; el comentario de esa línea se actualiza a VID-06. En ese archivo no había ningún caso «v11 → newer».

## 9. DeepSeek

NOT EVALUATED.

## 10. git diff --stat

```
 package.json                     |   2 +-
 scripts/check-metro-transfers.ts |   2 +-
 src/config/constants.ts          |   2 +-
 src/scenes/Menus.ts              |  88 +++++++++---
 src/scenes/WorldScene.ts         | 241 ++++++++++++++++++++++++++++---
 src/state/GameState.ts           | 297 ++++++++++++++++++++++++++++++++++++++-
 src/systems/SaveSystem.ts        |  30 ++++
 src/types/game.ts                |  11 ++
 8 files changed, 621 insertions(+), 52 deletions(-)
Sin trackear: src/systems/Neighborhood.ts, scripts/check-vecinos.ts, VID-06.md
```

El stat acumula también los cambios sin commitear de LOC-01 y VID-01…05 en esos archivos. Árbol completo: 49 files changed, 1209 insertions(+), 121 deletions(-). Los asserts de versión 10→11 también se cambiaron en check-consequences, check-fitting-stock, check-life-projects, check-luna, check-reputation, check-micro-stories, check-social-graph y check-quedadas.

## 11. Riesgos

- La oferta de favor no exige que el NPC sea conocido.
- Si pulsas Esc en la pregunta del favor no se guarda nada, así que el NPC puede volver a pedirlo ese día.
- Si llegas a casa por mudanza, teleport o carga, el paquete sigue pending hasta que cruces la puerta.
- El aviso del portal podría tapar otro diálogo.
- Con un paquete pendiente aparece una pregunta extra antes de la charla.
- El getter `neighborhood` clona en cada lectura (solo cuando ocurre algo, no por frame).
- Si `noteSocialMemory` recortara la memoria de una ref, en teoría se podría reaplicar un efecto; en la práctica no pasa, porque cada transición emite su efecto una sola vez.
- check-regression ya fallaba antes.

## 12. Rollback

- Borra `src/systems/Neighborhood.ts` y `scripts/check-vecinos.ts`.
- Revierte los hunks de VID-06 en:
  - `constants` (`SAVE_VERSION` 11→10);
  - `GameState` (`neighborhood`, `applyNeighborEffects`, `tickNeighbors` y `neighborCandidates`);
  - `SaveSystem` y `types/game.ts`;
  - `WorldScene` (`passThrough`, `arrivalNotice` y la rama de hablar);
  - `Menus.openBag` y `package.json`;
  - los asserts de versión de los 9 scripts.
- Los guardados v11 darían `newer` en v10; hay que documentar que se pierden.
