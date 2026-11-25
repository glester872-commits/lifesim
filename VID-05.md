# VID-05 · Quedadas en casa

## 1. Inventario auditado

Base: rama `main`, SHA `a5ecb3d`. Hay cambios sin commitear de LOC-01 y de VID-01 a VID-04, que se conservan.

Lo que ya existía:

- Visita a casa como plan de historia: `data/visits.ts`, `Story.acceptPlan`, `watchPlan`, `missPlan`, `planMemory` y `cancelStoryPlan`.
- SIM-05, vivienda: `systems/Housing.ts` y `HOMES`.
- Compromiso de Agenda `'visit'`.
- Contactos: `contactExchanged`.
- Relación: `systems/Social.ts`.
- LV-09 cerrado (`ARCOS-LV09.md`).

Lo que faltaba:

- Que el jugador pudiera iniciar la visita.
- Un segundo asiento.
- Un registro grupal con su resultado.

## 2. Definiciones y alcance

- **Venue:** la casa actual del jugador (`HOMES`, `HomeDef.location`).
- **Host:** el jugador.
- **Invitadas:** Sara y Ada. Amaia no tiene plan de visita y queda pendiente.
- **Franja:** de 19:30 a 21:00, en el siguiente día futuro en que el jugador está libre (`Story.planDayFrom` con `StoryNow.free`, que usa `Agenda.freeBetween`). Si ya hay una quedada abierta en esa casa con sitio, se reutiliza su día.
- **Regla `decideInvite`:** determinista, con un motivo distinto por causa. El orden es:
  1. sin historia;
  2. sin contacto;
  3. relación;
  4. ya invitada ese día;
  5. plan pendiente;
  6. sin día;
  7. trabaja;
  8. duerme;
  9. conflicto;
  10. ánimo por debajo de `MOOD_MIN` (35).

  El umbral de relación es único: `HomeGathering.relationOk`, de FRIEND para arriba. Lo usan la opción del móvil y `decideInvite`.
- **Presencia:** el plan de historia por asiento (`seatPlanId`, `seatsFor`). Olmo 7 tiene dos asientos, `HOME_SOFA_02` y `HOME_TABLE_02`. Ronda 8 admite una sola invitada.
- **Asistencia:** `inSlot` (estar en el venue y dentro de `[start, end)`) es la única fuente de verdad. La usan `gatheringFacts` y `playerInGathering`, que a su vez usa `WorldScene.watchStoryPlan`. Se mantiene la regla de ≤3 tiles para las visitas en solitario.
- **Recuerdo:** un `SHARED_EVENT` agrupado por invitada, idempotente mediante `memoryEventIds`.
- **Llegar tarde:** −1 de confianza, una sola vez.
- **Faltar:** lo resuelve `missPlan`, con el recuerdo de su historia.
- **Cancelar:** avisa en el hilo de cada invitada y suelta su rutina (`cancelStoryPlan`). Mudarse cancela las quedadas abiertas de la casa que se deja (`cancelGatheringsAt`).
- **SIM-02:** NO VERIFICADO como sistema aparte; se usa `SocialProfile.memories`.
- **Expansión pendiente:** cumpleaños, invitación recibida y NPC como host. Los NPC no tienen fecha de nacimiento.

## 3. Contrato de datos

Copiado de `src/systems/SocialEvents.ts`:

```ts
export type InviteeStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';
export type Attendance = 'on-time' | 'late' | 'absent' | 'pending';
export type EventStatus = 'open' | 'running' | 'closed' | 'cancelled';
export type EventOutcome = '' | 'bien' | 'flojo' | 'plantón' | 'cancelada';
export type PlanOutcome = 'kept' | 'missed' | 'cancelled' | 'pending';

export interface SocialEventInvitee { npc: string; status: InviteeStatus; reason: string; respondedAt: number; attendance: Attendance }
export interface SocialEvent {
  id: string;
  kind: 'home-gathering';
  host: 'player';
  venueId: string;
  invited: SocialEventInvitee[];
  start: number;
  end: number;
  created: number;
  status: EventStatus;
  playerPresence: Attendance;
  outcome: EventOutcome;
  memoryEventIds: string[];
}
export interface SocialEventsState { v: 1; events: SocialEvent[] }
```

- **Identificador:** `evt:<venue>:<día>:<hhmm>`. `createEvent` es idempotente por id.
- **Minutos:** son absolutos, `(día − 1) · 1440 + minuto`.
- **Límites:** `MAX_INVITEES = 2`, `MAX_EVENTS = 12`, `EVENT_TTL_DAYS = 30` y `LATE_MINUTES = 20`.
- **Validación (`parseSocialEvents`):**
  - Si no es un objeto o `events` no es un array, devuelve el estado vacío.
  - Se descarta un evento si:
    - le falta id, venue o `kind`/`host` válidos;
    - `start`, `end` o `created` no son finitos, o `start >= end`;
    - algún estado, presencia o outcome está fuera de su lista;
    - `invited` está vacío o pasa de `MAX_INVITEES`;
    - tiene una invitada que no está en `STORIES`, repetida o con campos inválidos.
  - `memoryEventIds` se filtra y se deduplica.
  - Con ids repetidos gana el primero.
  - Al final se aplican la poda por TTL y `MAX_EVENTS`.
- **`addInvitee(state, id, npc, decision, now, capacity)`:** rechaza si:
  - la quedada no está `open`;
  - la NPC no está en `STORIES` o ya está invitada;
  - `invited.length >= min(MAX_INVITEES, capacity)`;
  - la decisión no es aceptar.

  La capacidad (asientos de la casa) llega como parámetro.
- **Guardado:** `SAVE_VERSION` 10. La migración v9→v10 añade `socialEvents` vacío y es idempotente: migrar y volver a cargar no cambia nada. Un save v11 se marca como `'newer'`.

## 4. Archivos modificados

Partes 1 y 2 (modelo, guardado, asientos, puente):

- `src/systems/SocialEvents.ts` (nuevo)
- `src/systems/HomeGathering.ts` (nuevo)
- `scripts/check-quedadas.ts` (nuevo)
- `src/config/constants.ts`
- `src/state/GameState.ts`
- `src/systems/SaveSystem.ts`
- `src/types/game.ts`
- `src/data/housing.ts`
- `src/data/visits.ts`
- `src/data/characters.ts`
- `src/data/saraStory.ts`
- `src/data/adaStory.ts`
- `src/scenes/WorldScene.ts`
- `package.json`
- Los asserts de versión de 8 scripts de check.

Parte 3 (invitar y anular desde el móvil, mudanza):

- `src/systems/SocialEvents.ts`: `addInvitee`.
- `src/systems/HomeGathering.ts`:
  - `relationOk`, `homeOffer`, `openGatheringOf`, `inviteHome` y `cancelGatheringsAt`;
  - `bridgeGathering` respeta los asientos ya ocupados.
- `src/systems/Phone.ts`:
  - acciones `'invite-home'` y `'cancel-gathering'`;
  - tipo `StoryPhoneOffer`;
  - puerta en `phoneOptions`.
- `src/ui/Phone.ts`: tipo de `offer`.
- `src/scenes/WorldScene.ts`: `offer` con `homeOffer`, rama en `sendPhone` y `phoneGathering`.
- `src/scenes/Menus.ts`: la mudanza anula las quedadas abiertas de la casa vieja y lo dice en el diálogo.
- `scripts/check-quedadas.ts`: bloques m a p.

Corrección extra:

- `src/systems/HomeGathering.ts`: `inSlot` y `playerInGathering`.
- `src/scenes/WorldScene.ts`: `watchStoryPlan`.
- `src/main.ts`: «Próximo».
- `scripts/check-quedadas.ts`: bloques q y r.

## 5. Pasos para reproducir la vertical slice

1. Ser amiga de Sara o de Ada (FRIEND: friendship ≥ 35 y trust ≥ 20) y tener su número.
2. Móvil → Mensajes → hilo de Sara o de Ada → «Invitar a casa» (justo antes de «Despedirse»).
3. En el hilo aparecen al momento:
   - mi mensaje: «¿Te vienes a casa …? A las 19:30.»;
   - su respuesta: «Vale, <día> a las 19:30 en tu casa.», o el motivo si rechaza.
4. Para la segunda invitada, repetir con la otra NPC: se suma a la misma quedada si hay asiento (Olmo 7).
5. El día indicado, estar en casa entre las 19:30 y las 21:00.
6. Para anular: en el mismo hilo, «Anular la quedada», que sustituye a «Invitar a casa» mientras la quedada está abierta.

## 6. Tabla QA

| caso | pasos | esperado | observado | estado | notas |
|---|---|---|---|---|---|
| 1a · relación baja | Invitar con relación baja | Rechazo con motivo, sin evento | «Aún no nos conocemos tanto», sin evento | PASS | |
| 1b · relación de amiga | Invitar siendo amiga | Acepta con día y hora, crea evento | «Vale, mañana a las 19:30 en tu casa», `evt:home:2:1930` con las dos en accepted | PASS | |
| 1c · rechazo por agenda o ánimo | Invitar con agenda ocupada o ánimo bajo | Rechazo con su motivo | — | NO VERIFICADO | Lo cubre check-quedadas a |
| 2 · dos NPC llegan | Quedada con Sara y Ada, jugador en casa | Asientos distintos, sin atascos; kept/kept; «bien» | Asientos distintos, sin solaparse ni quedarse en el portal. Tras la corrección extra, con el jugador quieto en la puerta: kept/kept a las 20:31; a las 21:05 closed y «bien», on-time/on-time, dos memoryEventIds, confianza de 30 a 33 | PASS | Antes de la corrección había FAIL por plantón falso (sección 8) |
| 3 · cancelar | «Anular la quedada» | Aviso en el hilo, plan cancelado, rutina liberada | Aviso «Tengo que anular la quedada en casa…», plan cancelled, la rutina vuelve a clase-online | PASS | El toast queda NO VERIFICADO |
| 4 · llegar tarde o no ir | Llegar después de las 19:50 o no ir | Tarde: flojo y −1 una vez. No ir: plantón | — | NO VERIFICADO | Lo cubren check-quedadas k (tarde) y r (fuera de casa) |
| 5 · persistencia | Guardar y recargar | No se repite ni duplica recuerdos | No se repite, sin recuerdos duplicados | PASS | |
| 6a · consola | Partida completa | Sin errores | Sin errores | PASS | |
| 6b · rendimiento | En casa, con y sin quedada | Sin caída | 54-60 fps en casa, over []; tick de 0,048 ms por minuto de juego con una quedada abierta y 0,0045 ms sin ninguna | PASS | |
| 6c · visual-qa | Revisión visual | Sin regresión | Sin regresión | PASS | |
| 6d · checks dirigidos | check-quedadas, check-story, check-housing, check-phone, check-agenda, check-interaction, check-week, check-persistence, check-save-torture, check-contact, check-micro-stories, check-social-graph | exit 0 | exit 0 | PASS | |
| 6e · resto | Cámara, zoom, HUD, safe-areas, pixel art y economía | Sin cambios | No se tocan | PASS | |
| 6f · UI del hilo | Clics reales, táctil y móvil | Las opciones funcionan | — | NO VERIFICADO | Se usó `w.sendPhone` |
| Plataformas | Chrome con CDP, escritorio | — | Escritorio | PASS | Móvil no emulado en este ticket: NO VERIFICADO. No hay dispositivo físico |

## 7. Build y check

- `npm run build`: exit 0 («✓ built in 1.10s»).
- Cadena completa: TOTAL=161, FAILS=1. El fallo es check-regression, que ya fallaba en `a5ecb3d`.
- Cadena completa tras la corrección extra: TOTAL=161, FAILS=1. El único fallo es `node scripts/check-regression.ts` (exit 1), que ya fallaba en a5ecb3d y no es de VID-05.

## 8. Correcciones

- **1/2:** TS7022 en `prev` (`cancelGatheringsAt`): faltaba el tipo explícito.
- **2/2:** never-narrowing en `cancelGatheringsAt`. Se resolvió con un acumulador no nulo y un indicador `changed`; la firma y el comportamiento no cambian.
- **Extra 3/2 (autorizada por el usuario):** asistencia de grupo.
  - Bug: con el jugador en el piso durante la franja pero a más de 3 tiles de las invitadas, `watchStoryPlan` no marcaba el plan como kept. A las 21:00 se llamaba a `missPlan` (plantón falso y trust −10), mientras `gatheringFacts` daba al jugador por presente.
  - Arreglo: estar en el piso dentro de la franja cuenta como asistir (`playerInGathering`, con la misma regla `inSlot` que `gatheringFacts`).
  - Además, «Próximo» une a las invitadas: «Quedada en casa con Sara y Ada».

## 9. DeepSeek

NOT EVALUATED.

## 10. git diff --stat

```
 package.json              |   2 +-
 src/config/constants.ts   |   2 +-
 src/data/adaStory.ts      |   6 ++
 src/data/characters.ts    |   6 +-
 src/data/housing.ts       |  12 +++
 src/data/saraStory.ts     |   6 ++
 src/data/visits.ts        |  25 ++++-
 src/main.ts               |  14 ++-
 src/scenes/Menus.ts       |  82 +++++++++++-----
 src/scenes/WorldScene.ts  | 156 +++++++++++++++++++++++++----
 src/state/GameState.ts    | 246 ++++++++++++++++++++++++++++++++++++++++++++--
 src/systems/Phone.ts      |  12 ++-
 src/systems/SaveSystem.ts |  24 +++++
 src/types/game.ts         |   9 ++
 src/ui/Phone.ts           | 124 ++++++++++++++++++++++-
 15 files changed, 662 insertions(+), 64 deletions(-)
Sin trackear: src/systems/SocialEvents.ts, src/systems/HomeGathering.ts, scripts/check-quedadas.ts, VID-05.md
```

El stat acumula también los cambios sin commitear de LOC-01 y VID-01…04 en esos mismos archivos (por ejemplo GameState, WorldScene, Menus, ui/Phone). Árbol completo: 48 files changed, 1053 insertions(+), 118 deletions(-).

## 11. Riesgos

- `structuredClone` del getter `socialEvents` en `watchStoryPlan`. Sólo se llama si hay un plan pendiente y el jugador está a más de 3 tiles.
- El título de «Próximo» se obtiene pelando el prefijo «Quedada con » del título de Agenda.
- «19:30» va como texto fijo en el mensaje del jugador. La respuesta de la NPC usa `plan.from`.
- Una invitada que cancela sigue ocupando hueco en `invited` (`MAX_INVITEES`).
- En el hilo de una invitada conviven «Cancelar el plan» (sólo ella) y «Anular la quedada» (toda la quedada).
- Frase de primera visita de Sara al salir tras la quedada: menor, señalada por visual-qa y sin confirmar.
- check-regression ya fallaba antes de VID-05.

## 12. Rollback

1. Borrar `src/systems/SocialEvents.ts`, `src/systems/HomeGathering.ts` y `scripts/check-quedadas.ts`.
2. Revertir los hunks de VID-05 en:
   - `src/config/constants.ts` (`SAVE_VERSION` 10→9);
   - `src/state/GameState.ts`, `src/systems/SaveSystem.ts` y `src/types/game.ts`;
   - `src/data/housing.ts`, `src/data/visits.ts`, `src/data/characters.ts`, `src/data/saraStory.ts` y `src/data/adaStory.ts`;
   - `src/systems/Phone.ts` y `src/ui/Phone.ts`;
   - `src/scenes/WorldScene.ts`, `src/scenes/Menus.ts` y `src/main.ts`;
   - `package.json`;
   - los asserts de versión de los 8 scripts.
3. Los saves v10 tendrían que poder cargar en v9, pero hoy darían `'newer'`: conviene documentar que se pierden.
