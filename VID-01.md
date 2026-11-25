# VID-01 · Proyectos de vida

## 1. Estado del repo

- Ruta: `/c/Users/glest/Documents/lifesim`. Rama: `main`. SHA base: `a5ecb3d`.
- Stack: Phaser 3, TypeScript y Vite.
- Cambios ajenos que se conservan:
  - **LOC-01**, sin commitear: tiendas de barrio y `pantry-shelf`.
  - **`design/coches/`**, reorganizado hoy fuera de esta misión: 3 `.jpg` renombrados (aparecen como `D`) y 25 fotos nuevas con `README.md` y `fuentes.csv`. Ningún agente de VID-01 los tocó.

## 2. Definiciones previas e inventario auditado

| Tema | Ruta | Estado | Relación con VID-01 |
|---|---|---|---|
| Meta de ahorro | `Household.goal`; fila Meta de Cuentas en `src/ui/Phone.ts` | Existe | No se duplica. El progreso de los proyectos se deriva del dinero, el inventario y el nivel. |
| Crédito LV-10 | `src/systems/Credit.ts` | Existe | No se toca. |
| SIM-01, consecuencias | `src/systems/Consequences.ts` | IMPLEMENTADO | VID-01 no simula consecuencias propias. Abandonar solo explica que el dinero, la bici y el trabajo no cambian. |
| SIM-04, carrera | `src/systems/Jobs.ts` (`promotionReady`/`promote`) | IMPLEMENTADO | Por eso el segundo proyecto es «Conseguir un ascenso». |
| SIM-05, vivienda | `src/systems/Housing.ts` (`move`/`moveBlocker`) | Existe, sin auditar a fondo | «Independizarse» queda NO IMPLEMENTADO en VID-01. No aplica porque se eligió el ascenso. |
| Bici, LV-07 y MOV-01 | — | NO IMPLEMENTADO | El jugador no puede montar en bici. La bici se entrega como artículo («todavía no se puede montar»). Dependencia futura. |
| Diario | `PhoneState.notes` | Sin diario aparte | El recuerdo se guarda en las notas del móvil, que son persistentes. |
| LV-02 multi-ranura | `SaveSlots` | Existe | Trabaja sobre el JSON completo. No se modificó. |

## 3. Contrato de datos de LifeProject

Tipos en `src/systems/LifeProjects.ts`:

- `LifeProjectType = 'buy-bike' | 'promotion'`.
- `LifeProjectStatus = 'active' | 'paused' | 'completed' | 'cancelled'`.
- `Milestone { id, done, at }`.
- `LifeProjectRequirements { cost?, item?, shopCatalog?, fromLevel? }`.
- `LifeProject { id, type, status, requirements, milestones, progress, startedAt, completedAt, originEventIds }`.
- `LifeProjectsState { v: 1, items }`.
- Hitos por tipo (`MILESTONE_KEYS`): `buy-bike` → `saved`, `bought`, `done`; `promotion` → `promoted`, `done`.

Estado y persistencia:

- Estado canónico en `GameState._lifeProjects`, con el getter `lifeProjects` y `setLifeProjects`, que emite `'lifeProjects'`.
- Save v7 (`SAVE_VERSION = 7`). La migración `version < 7` añade `lifeProjects` vacío (`emptyLifeProjects()`) de forma idempotente. En `src/types/game.ts` el campo es opcional.
- `parseLifeProjects` sanea los datos cargados.
- El progreso se deriva (`deriveProgress`). El campo `progress` guardado es solo caché.
- `originEventIds`: el `movementId` del ledger para la bici y `promo-<día>-<empleo>-<nivel>` para el ascenso.
- Los ids de hito llevan el prefijo `${projectId}:` (`milestoneId`).

Reglas:

| Acción | Desde | Hacia | Notas |
|---|---|---|---|
| Empezar (`startProject`) | — | `active` | Se rechaza si ya hay uno vivo del mismo tipo (`canStart`, `startBlocker`). |
| Pausar (`pauseProject`) | `active` | `paused` | — |
| Reanudar (`resumeProject`) | `paused` | `active` | Se rechaza si ya hay otro vivo del mismo tipo. |
| Abandonar (`cancelProject`) | `active`, `paused` | `cancelled` | Guarda `completedAt`. No toca el dinero, la bici ni el trabajo. Luego se puede volver a empezar. |
| Completar (`completeIfMet`) | `active` | `completed` | Cuando se cumplen los hitos. |

Simultaneidad: un proyecto vivo por tipo. La bici y el ascenso pueden convivir sin compartir hitos.

## 4. Archivos modificados por VID-01

| Ruta | Cambio |
|---|---|
| `src/systems/LifeProjects.ts` | Nuevo. |
| `src/state/GameState.ts` | Estado `_lifeProjects`, getter y `setLifeProjects`. |
| `src/types/game.ts` | Campo `lifeProjects` en el save. |
| `src/systems/SaveSystem.ts` | Migración `version < 7`. |
| `src/config/constants.ts` | `SAVE_VERSION` 7. |
| `src/data/items.ts` | `'bike'`, tipo gear, con max 1. |
| `src/data/catalogs.ts` | Bici a €180 en `ca-taller-mostrador` (unos 3 turnos de €60). |
| `src/data/campoAltoVenues.ts` | Texto del taller y pizarra. |
| `src/systems/Commerce.ts` | `refusal` aplica el max explícito y `consume` rechaza gear. |
| `src/systems/Jobs.ts` | `promotionChecks`. |
| `src/ui/Phone.ts` | App Proyectos, `renderProjects`. |
| `src/style.css` | `phone__row--wrap` y `phone__progress`. |
| `scripts/check-life-projects.ts` | Nuevo, registrado en `package.json`. |
| `scripts/check-campo-alto-taller.ts` | Regla actualizada a 6 productos con la bici. |
| `scripts/check-consequences.ts`, `check-fitting-stock.ts`, `check-reputation.ts`, `check-luna.ts`, `check-metro-transfers.ts` | `SAVE_VERSION` 6→7. |

## 5. Vertical slice

1. Pulsa P → Proyectos → «Comprar una bici» → Empezar.
2. Comprueba que aparece «€120 de €180 ahorrados», el próximo paso y los bloqueos.
3. Trabaja o reúne el dinero.
4. Ve al Taller Biciclo, en Campo Alto (lunes a sábado, de 10 a 20) → caja → «Bicicleta de ciudad €180».
5. El proyecto se completa.
6. En el historial aparece «Día N: bicicleta de ciudad por €180 en Taller Biciclo, Campo Alto.».

## 6. Pruebas

| # | Caso | Pasos | Esperado | Observado | Resultado | Notas |
|---|---|---|---|---|---|---|
| 1 | Compra única | Comprar la bici con fondos | Se cobra una vez, `bike:1`, un solo `originEventId` | €294→€114 (gameplay-qa) y €250→€70 (orquestador); `bike:1`; `originEventIds` con un solo elemento | PASS | — |
| 2 | Sin fondos / ya tienes bici | Abrir la caja con €50; empezar con la bici en la bolsa | Bici deshabilitada y sin hitos; aviso y no se crea nada | Deshabilitada, sin hitos; «Ya tienes una bicicleta.» y no se crea nada | PASS | — |
| 3 | Guardar y cargar | Completar, guardar y recargar | El estado se conserva | €114, `bike:1`, `completed` y una sola nota | PASS | `check-life-projects` cubre la ida y vuelta. |
| 4 | Abandonar | Abandonar desde la UI con confirmación | `cancelled`, el dinero no cambia | `cancelled`, el dinero sigue en €120; se puede volver a empezar | PASS | Abandonar no destruye objetivos anteriores. |
| 5 | Dos proyectos a la vez | Bici y ascenso activos | Conviven sin hitos compartidos | Sin hitos compartidos en check | PASS (check) / NO VERIFICADO (navegador) | Sección 9 de `check-life-projects`. En el navegador hace falta un trabajo con contrato. |
| 6 | Ascenso sin trabajo | Empezar el ascenso sin empleo | Mensaje de bloqueo | «Necesitas un trabajo para pedir un ascenso.» | PASS / NO VERIFICADO (ascenso completo en navegador) | El ascenso completo pasa en check, con `hire` y `promote` reales. |
| 7 | Panel | Abrir Proyectos | Progreso causal, próximo paso, bloqueos, barra, Empezar por proyecto, sin elipsis | Correcto tras la corrección 1 | PASS | visual-qa: FAIL en la primera ronda, PASS en la segunda. |
| 8 | Móvil | Ventana de unos 500×844 px con `resize_page` | El panel cabe y se lee | Correcto en la ventana estrecha | PASS (aproximado) / NO VERIFICADO (móvil real) | No es una emulación exacta de 390×844 con DPR 3: en el primer intento la emulación recargó la página y la captura salió del título. |
| 9 | Entrada | P, W/S, E o Intro, Esc; ratón; toque | Navegable con todas | Clic de ratón real por CDP correcto | PASS (ratón) / NO VERIFICADO (teclado y toque) | El teclado sigue el diseño, pero no se probó en esta ronda. Toque emulado sin probar. |
| 10 | Rendimiento | 200 cambios de dinero con el panel abierto | Sin caídas ni crecimiento | 60 fps, como mucho 2,7 ms por cambio, heap 315→329 MB transitorio, la lista no crece | PASS | Aviso preexistente: vehicles 26/24 en `'district'`, ya en LOC-01, no viene de VID-01. |
| 11 | Consola | Sesión completa | Sin errores | Sin errores | PASS | — |
| 12 | No regresión | Build, cadena de checks, diff | Sin fallos nuevos | Build exit 0; 157 comandos, solo falla `check-regression` | PASS / NO VERIFICADO (LV-01, 7 días) | `check-regression` ya fallaba en la base a5ecb3d (comprobado con stash). Cámara, zoom, HUD y safe-areas sin tocar (PASS por diff). |

## 7. Build y checks

- `npm run build`: exit 0.
- Cadena de `scripts.check`, ejecutada comando a comando en PowerShell: TOTAL=157, LINES=3095, FAILS=1 (`check-regression`, preexistente).

## 8. DeepSeek

NOT EVALUATED (no conectado).

## 9. git diff --stat

Ver la salida del orquestador. 36 archivos con seguimiento cambiados (+487/−62), incluidos LOC-01 y los `.jpg` ajenos de `design/coches`. Sin seguimiento: `LOC-01.md`, `VID-01.md`, `scripts/check-life-projects.ts`, `src/systems/LifeProjects.ts` y `design/coches/*`.

## 10. Riesgos

- El getter `lifeProjects` hace `structuredClone` en cada lectura, y el panel lo lee en cada repintado.
- El panel puede repintarse dos veces en una compra.
- La nota del recuerdo se puede borrar a mano y no se regenera.
- `Commerce.refusal` ahora aplica el max a todos los items con max explícito, por ejemplo los regalos.
- Los textos de `promotionChecks` dependen de `requires.label`.

## 11. Rollback

Revertir los archivos de la sección 4 y bajar `SAVE_VERSION` de 7 a 6. Una versión anterior rechazaría un save v7 por ser más nuevo, así que hay que avisar antes de revertir.
