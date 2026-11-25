# VID-02 — Grafo social mínimo NPC↔NPC

## 1. Estado del repo

- Repo: `/c/Users/glest/Documents/lifesim`, rama `main`, SHA base `a5ecb3d`. Phaser 3 + TypeScript + Vite.
- Cambios ajenos que se conservan sin tocar: LOC-01, VID-01 (`LifeProjects`, save v7) y `design/coches/` (reorganizado fuera de esta misión).

## 2. Definiciones previas e inventario auditado

| Elemento | Ruta | Estado |
|---|---|---|
| Relaciones estáticas NPC↔NPC | `src/data/namedPeople.ts` (`NAMED_RELATIONSHIPS`), tipo `RelationType` en `src/data/identity.ts` | Existe. El grafo se siembra desde ahí (`seedSocialGraph`, `coworkerPairs`) y no las duplica. |
| Memoria social | `src/systems/Social.ts` | Solo jugador↔NPC. |
| SIM-01 | `src/systems/Consequences.ts` | IMPLEMENTADO, pero sobre jugador y trabajo. VID-02 no lo usa. |
| SIM-02 | — | NO EXISTE como memoria ni conducta NPC↔NPC. VID-02 aporta una memoria mínima propia por NPC (`memory`). |
| RNG con semilla | `src/systems/MetroDaily.ts` (`seededRng`, `hashSeed`) | Existe; se reutiliza. |
| LV-09 | — | No hay ningún archivo LV-09. |

## 3. Decisión de alcance

- Ningún local tiene dos NPC con nombre en el mismo turno.
- Los candidatos sin puesto tienen emplazamiento fijo, rutina, historia u oficio y se descartan: `vera`, `olmo`, `sira`, `paula`, `kike`, `ines`, `dani`, `noa`, `yasmin`, `angel`, `jeff`, `kevin`.
- Par elegido: `marco|rocio`, seguridad del metro de Vallesco. Son `'coworkers'` en `NAMED_RELATIONSHIPS` y tienen emplazamiento fijo en `vallesco-station`.
- `iker` queda excluido por ser pareja de Yasmin y padre en `pregnancy.ts`.

## 4. Contrato de datos

Tipos en `src/systems/SocialGraph.ts`: `SocialEdge`, `SocialGraphEvent`, `SocialGraphState` (con `v: 1` y `lastTickDay`), `SocialTie`.

| Concepto | Valor |
|---|---|
| Id de arista (`edgeIdOf`) | `` `${min}\|${max}` `` |
| Id de evento | `` `sg:${día}:${edgeId}:${causa}` `` |
| Procedencia | `originEventIds`, FIFO de 4 |
| `MAX_EDGES` | 12 |
| `MAX_EDGES_PER_NPC` | 3 |
| `MAX_EVENTS` | 24 |
| `MAX_EVENTS_PER_TICK` | 2 |
| `MAX_CATCHUP_DAYS` | 3 |
| `EVENT_TTL_DAYS` | 30 |

- `EXCLUDED_NPCS` se deriva de los datos: `sara`, `ada`, `amaia`, `STORIES`, `PREGNANCIES`, `MATES` y las parejas `couple`/`married`/`dating`. Los pares `exes` quedan fuera.
- Save v8 (`SAVE_VERSION` en `src/config/constants.ts`) con migración `version < 8` idempotente (`parseSocialGraph` / `emptySocialGraph`). `SaveSlots` no cambia de formato.

## 5. Simulación

- `tickSocialGraph` corre desde `GameState.setClock` solo cuando cambia el día, nunca por frame. En el mismo día cuesta una comparación de enteros.
- Causas (`SOCIAL_CAUSES` en `src/data/socialCauses.ts`):

| Causa | Delta |
|---|---|
| `cubrir-turno` | +12 |
| `cafe-compartido` | +6 |
| `broma-pesada` | −10 |
| `discusion-cuadrante` | −18 |
| `disculpa` | +25 |

- Reglas tras la corrección 1:
  - `disculpa` es elegible si el tipo es `tension` o `rift` y han pasado ≥2 días (`REPAIR_AFTER_NEG_DAYS`) desde la última causa negativa (`lastNegativeDay`).
  - En conflicto, la disculpa tiene peso doble.
  - En `rift` no hay causas negativas.
  - Deriva hacia 0 en `tension` y en `rift`.
- El tipo de vínculo lo da `tieOf` a partir del peso (umbrales definidos en `SocialGraph.ts`).

## 6. Consecuencias observables

- `socialLineFor` se consulta en `WorldScene.interact`, rama `npc`: frase social una vez al día y después diálogo normal.
- Banco `SOCIAL_LINES` (`friend`, `tension`, `rift`, `reconciled`) más una frase por causa reciente (`RECENT_CAUSE_DAYS`).
- Distancia y agrupación: NO IMPLEMENTADO. Los emplazamientos son fijos y no hay mecanismo por datos; añadirlo sería un cambio de sistema.

## 7. Historia autónoma trazada (sin LLM)

Partida real nueva, días 2-40 sin jugador, observada en el navegador:

| Día | Evento | Vínculo resultante |
|---|---|---|
| 2 | cubrir-turno | acquaintance 12 |
| 4 | broma-pesada | tension −16 |
| 5 | — | acquaintance |
| 6 | discusion-cuadrante | tension −22 |
| 11 | — | acquaintance |
| 16 | — | tension |
| 18 | cafe-compartido | acquaintance |
| 21 | — | tension |
| 23 | disculpa | acquaintance 12 |
| 25 | — | tension |
| 26 | — | acquaintance |
| 27 | — | tension |
| 29 | broma-pesada | rift −42 |
| 31 | disculpa | tension −16 |
| 32 | disculpa | acquaintance 9 |

Frases reales en el metro:

- Rift forzado, Marco: «Con Rocío ya ni me hablo. Cada uno su ronda y punto.»
- Rift forzado, Rocío: «Si buscas a Marco, no soy la persona a quien preguntar.»
- Día 32, Marco: «Rocío vino a pedirme perdón. Bueno, se agradece.»
- Día 32, Rocío: «Lo de Marco ya está hablado. Pelillos a la mar.»
- Segunda vez, diálogo normal: «Seguridad. Tú pasa, que no va contigo.» / «Hoy me toca vestíbulo. Mañana, quién sabe.»

`explainEdge` devuelve la cadena de procedencia. `scripts/check-social-graph.ts` imprime la tira de 60 días y «reconciliación de marco|rocio el día 6 (desde el día 3)».

## 8. Pruebas

| # | Caso | Pasos | Esperado | Observado | Resultado | Notas |
|---|---|---|---|---|---|---|
| 1 | Cambio sin jugador | Avanzar días sin interactuar | La arista cambia sola | Cambia (sección 7) | PASS | Navegador y check |
| 2 | Evento único al cambiar de zona o recargar | Cambiar de zona, guardar, recargar, repetir día, retroceder reloj | Sin duplicados | Mismo día sin eventos nuevos; mismos ids y `weight` tras recargar; retroceder no añade nada | PASS | |
| 3 | Rutinas y turnos | Revisar posición el día 40 | Sin cambios | Marco y Rocío en `vallesco-station` | PASS | No se toca `population.ts` ni emplazamientos |
| 4 | Sara y arcos | Comparar estado de Sara | Intacto | Sara no está en el grafo; su story solo cambia por su rutina diaria (`routines`/`dayDone`); flags, mood, events y decisions iguales | PASS | |
| 5 | Carga | 40 pares, salto de 200 días | Topes respetados | ≤12 aristas, ≤3 por NPC, ≤24 eventos, ≤2 por tick, <5 ms por tick; salto acotado a 3 días | PASS | |
| 6 | Rendimiento en navegador | Medir fps, `setClock`, heap | Sin regresión | Calle 53-59 fps (`vehicles 26/24`, aviso preexistente); metro 47-56 fps sin over; `setClock` mismo día media 15,6 ms (coste propio de `setClock` y oyentes, `tickSocial` solo compara); con cambio de día media 21,5 ms (todos los sistemas diarios); 22 eventos, 1 arista; heap 326→318 MB | PASS | |
| 7 | Consola | Partida completa | Sin errores | Sin errores | PASS | |
| 8 | Visual / entrada | — | — | Sin UI ni arte nuevos (texto en el diálogo existente) | NO VERIFICADO | `visual-qa` omitido. Teclado y táctil del diálogo no verificados: la E sintética no llegó a la pestaña y se cerró por la API del diálogo, que VID-02 no toca. Móvil no verificado |
| 9 | No regresión | Build y cadena completa | Sin fallos nuevos | Build exit 0; 158 comandos, 1 fallo (`check-regression`), preexistente en `a5ecb3d` (comprobado con stash). Cámara, zoom, HUD y safe-areas sin tocar | PASS | Por diff. LV-01: NO VERIFICADO |

## 9. Build y cadena

- `npm run build`: exit 0.
- Cadena: TOTAL=158, LINES=3099, FAILS=1 (`check-regression`, preexistente).

## 10. DeepSeek

NOT EVALUATED.

## 11. git diff --stat

- 37 archivos con seguimiento, +533/−63, incluidos LOC-01, VID-01 y los `.jpg` ajenos.
- Sin seguimiento de VID-02: `VID-02.md`, `scripts/check-social-graph.ts`, `src/data/socialCauses.ts`, `src/systems/SocialGraph.ts`.
- Con seguimiento tocados por VID-02: `src/state/GameState.ts`, `src/systems/SaveSystem.ts`, `src/types/game.ts`, `src/config/constants.ts` (`SAVE_VERSION` 8), `src/scenes/WorldScene.ts`, `package.json`, y los asserts de versión 7→8 en `check-life-projects`, `check-consequences`, `check-fitting-stock`, `check-luna`, `check-metro-transfers` y `check-reputation`.

## 12. Riesgos

- Solo hay 1 par simulado.
- La arista oscila entre `acquaintance` y `tension`.
- `SocialGraph.ts` importa varios módulos de datos.
- La frase social sustituye a la charla de Chat una vez al día.
- `memory` crea entradas con `cause ''`.

## 13. Rollback

Revertir los archivos de VID-02 y bajar `SAVE_VERSION` a 7. Un save v8 se rechazaría por ser más nuevo: hay que avisar antes.
