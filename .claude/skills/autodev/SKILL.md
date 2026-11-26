---
name: autodev
description: Coordina planificador, implementador y evaluador de LIFE//SIM para desarrollar una misión con prompts generados según resultados verificables, con modos ECO/BALANCED/DEEP y los especialistas de solo lectura que exige CLAUDE.md § Agentes.
argument-hint: "[--mode=AUTO|ECO|BALANCED|DEEP] [--audit] [--dry-run] objetivo o referencia a una misión"
disable-model-invocation: true
---
# LIFE//SIM AutoDev
Objetivo del usuario: $ARGUMENTS

Este es el único orquestador del sistema de agentes. No hay arnés externo: el bucle y sus límites los aplicas tú, siguiendo este archivo. Obedeces `CLAUDE.md` § SAFETY & CHANGE CONTROL, § PRINCIPIOS OPERATIVOS y § Handoff; si algo de aquí choca con ellas, ganan ellas.

## Contrato del orquestador
- **Identidad:** coordinador del ciclo planner → builder → Gate → especialistas → evaluator. No eres ninguno de ellos.
- **Objetivo:** llevar el ticket a PASS, FAIL o BLOCKED con evidencia, usando los agentes y comprobaciones necesarios y ninguno más.
- **Responsabilidades:** clasificar tipo y riesgo con evidencia (`git status`, archivos del planner); elegir modo, especialistas y Gate; pasar a cada agente su handoff; ejecutar el Gate y los `checksToRun`/`requestedChecks`; registrar decisiones; hacer cumplir los límites.
- **Metodología:** pasos 0 a 8 de abajo, en orden.
- **Herramientas y permisos:** Agent para los 6 agentes; Bash solo para git de lectura, el Gate, el servidor QA y el respaldo de ranuras de prueba. Nunca Edit/Write, salvo para añadir entradas al Registro de hallazgos (§2). Nunca subes los permisos de un agente.
- **Restricciones:** las de `CLAUDE.md`; además, nunca dos builders ni especialistas en paralelo en el mismo árbol.
- **Entregable:** el paso 8 (ruta y modo, agentes invocados y omitidos con su motivo, evidencia del Gate, estado final por criterio).
- **Éxito:** cada criterio obligatorio con estado y evidencia; ninguna llamada ni prueba repetida sin motivo; ningún cambio hecho por ti.
- **Handoff:** cada prompt a un agente abre con «Obedece CLAUDE.md § SAFETY & CHANGE CONTROL y § PRINCIPIOS OPERATIVOS» y lleva solo los campos de § Handoff que ese agente necesita.

Reglas de decisión:
- SI falta información crítica (ticket ambiguo, archivo desconocido) → pide un diagnóstico al planner o pregunta al usuario; no adivines.
- SI el builder devuelve BLOCKED con `discrepancy` → vuelve al planner con la discrepancia. No amplías alcance ni permisos; si el alcance cambia de verdad, pide autorización.
- SI el árbol tiene cambios ajenos en archivos del plan → BLOCKED antes del builder.
- SI un fallo se repite tras una corrección → pasa la reproducción al especialista que corresponde antes de gastar otra corrección.
- SI una prueba ya se ejecutó sobre el mismo SHA sin cambios → reutiliza su resultado en vez de repetirla, salvo que el evaluator la pida en `requestedChecks`.
Ejemplo correcto: un NPC que vuelve a salirse de su zona tras la corrección 1 → `gameplay-qa` lo reproduce en el navegador y el siguiente nextPrompt lleva esa reproducción. Incorrecto: repetir el mismo `npm run check` sobre el mismo SHA, o invocar `visual-qa` en un cambio sin nada visible sin decir por qué se omite o se usa.

## 0. Leer los argumentos
Sintaxis: `/autodev [--mode=AUTO|ECO|BALANCED|DEEP] [--audit] [--dry-run] <objetivo>`. También vale el prefijo `[AUTO]`, `[ECO]`, `[BALANCED]` o `[DEEP]` al inicio del objetivo. Mayúsculas o minúsculas, da igual. Las flags van antes del objetivo.
- Sin modo: **AUTO** (§0.1). Si hay dudas, AUTO elige BALANCED, que era el comportamiento anterior sin modo.
- Un modo explícito se respeta tal cual. Si la evidencia apunta a más riesgo del que admite ese modo, el informe lo dice; si además cambia el alcance (p. ej. un ECO que acaba tocando el guardado), detente y pide autorización. Nunca lo cambias en silencio.
- Si hay dos modos, o uno que no existe: detente y pregunta. No adivines.
- `--audit` (o un objetivo que pida solo auditar, diagnosticar o medir): tarea de **diagnóstico**. Sin builder ni cambios en archivos. Planner, comprobaciones, especialistas y evaluator.
- `--dry-run`: solo decide la ruta. No invoca agentes, no ejecuta el Gate ni edita nada, y solo puede usar Grep/Glob/Read para clasificar. Entrega el bloque de §0.3 y termina.
- Antes de nada, escribe una línea `autodev: modo=<ECO|BALANCED|DEEP> origen=<explícito|auto> tipo=<implementación|diagnóstico> especialistas=<…> correcciones_máx=<N>`. `modo=` lleva siempre el modo concreto, nunca `AUTO`: `scripts/autodev-run.mjs` lo lee con `modo=(\w+)`.
- Ejemplos válidos: `/autodev arregla X` (AUTO) · `/autodev --mode=ECO cambia el color del coche` · `/autodev [DEEP] migra el guardado` · `/autodev --audit diagnostica Y` · `/autodev --dry-run añade un trabajo de repartidor en bici` · `node scripts/autodev-run.mjs "--mode=ECO --audit …"` (lo mismo, instrumentado).

### 0.1 AUTO: clasificar con evidencia
Antes de elegir, haz una búsqueda dirigida (Grep/Glob sobre los términos del objetivo). Registra los cinco ejes con su evidencia:
- **alcance**: cuántos archivos y sistemas (`systems/`, `state/`, `data/`, `world/`) toca.
- **incertidumbre**: causa o ubicación conocida, o por localizar.
- **persistencia**: si toca `state/`, la serialización, las ranuras o la versión del guardado.
- **impacto**: si cambia algo jugable o visible, o un sistema compartido.
- **regresión**: si es un bug recurrente («otra vez», «vuelve a», el mismo fallo en una ejecución anterior) o tiene checks que lo cubren.

Regla:
- **DEEP** si se cumple cualquiera: persistencia sí (guardado o migración); arquitectura o 2 sistemas o más; bug recurrente; incertidumbre alta en un sistema compartido.
- **ECO** solo si se cumplen todas: cambio local en 1 archivo de datos, render o texto; reversible; sin persistencia; sin sistema compartido; ubicación conocida.
- **BALANCED** en el resto: una mecánica o interfaz con dependencias conocidas. También si hay duda entre dos modos.

### 0.2 Escalar, nunca rebajar, y siempre con final
- Solo con AUTO: si el planner o el Gate destapan un eje más alto (otros archivos, guardado, recurrencia), sube un nivel y registra `escalado: <de>→<a> porque <evidencia>`. Bajar de nivel, nunca. Tampoco se quitan comprobaciones que ya eran obligatorias.
- Como mucho dos escaladas por ejecución (ECO→BALANCED→DEEP). DEEP es el techo.
- Las correcciones gastadas se arrastran: escalar sube el máximo al del nuevo modo, pero el contador no vuelve a 0. El máximo absoluto es 3.
- **Fallo persistente**: si el evaluator repite el mismo hallazgo (mismo criterio y misma reproducción) dos ciclos seguidos, ese hallazgo no gasta otro RETRY igual. Con AUTO por debajo de DEEP, escala y pasa la reproducción al especialista. En DEEP, o con un modo explícito, detente con FAIL.

### 0.3 Salida de `--dry-run`
```
autodev: DRY-RUN · modo=<M> · origen=<explícito|auto> · correcciones=0/<N> · especialistas=<…>
routing: alcance=… · incertidumbre=… · persistencia=… · impacto=… · regresión=… → <M> porque <regla de §0.1>
roles: planner(<modelo>) → builder(<modelo>) → Gate <nivel> → <especialistas(modelo)> → evaluator(<modelo>)
peor caso: ciclo 1 RETRY h1 → … → <escala a X | stop FAIL> (correcciones máx. N, escaladas máx. 2)
```
En el peor caso se supone que el evaluator devuelve RETRY con el mismo hallazgo en todos los ciclos. Así se ve dónde para el bucle sin tocar nada.

| Modo | Correcciones (RETRY tras el 1.º intento) | Especialistas | Quality Gate |
|---|---|---|---|
| ECO | 1 | Los 3, salvo los que claramente no apliquen (§2) | Básico |
| BALANCED | 2 | Los 3, salvo los que claramente no apliquen (§2) | Estándar |
| DEEP | 3 | Los 3, salvo los que claramente no apliquen (§2) | Ampliado |

El límite cuenta ciclos de corrección, no tokens ni cuota: la plataforma no expone la cuota de la suscripción y aquí no se controla.

**Roles en todos los modos** (CLAUDE.md § Agentes): planner, builder (solo en implementación) y evaluator, siempre. Los especialistas, salvo los que claramente no apliquen. Lo que cambia con el modo es la profundidad: correcciones, Gate y modelo.

**Modelo por llamada.** El frontmatter `model:` no se aplica; lo medido en V2-02 está en `docs/AGENT-HARNESS.md`. Por eso cada llamada Agent lleva su `model` explícito:

| Agente | ECO | BALANCED | DEEP |
|---|---|---|---|
| lifesim-planner | `sonnet` | `sonnet` | `opus` |
| lifesim-builder | `opus` | `opus` | `opus` |
| lifesim-evaluator | `sonnet` | `sonnet` | `opus` |
| gameplay-qa · visual-qa · optimizer | `sonnet` | `sonnet` | `sonnet` |

`sonnet` es candidato para el builder en ECO/BALANCED, pero no se activa hasta comprobarlo (rollback: `node scripts/rollback-builder-model.mjs`). `haiku` no se usa: en el bucle no hay ninguna búsqueda tan simple que justifique un agente aparte. El modelo de la sesión, y el global, no los cambias nunca.

## 1. Preparar
Lee CLAUDE.md, la parte pertinente del README.md y, si `.claude/coord/lanes/lanes.json` tiene carriles, las reglas de .claude/coord. Comprueba `git status`. Nunca toques main directamente ni sustituyas el trabajo de otros agentes.

## 2. Especialistas (por defecto los 3; CLAUDE.md § Agentes)
Se invocan `gameplay-qa`, `visual-qa` y `optimizer`. Uno se omite solo si claramente no aplica, y el informe dice cuál y por qué. Para decidirlo, clasifica el objetivo y los archivos del planner:
- `gameplay-qa`: mecánicas (NPC, colisiones, economía, tiendas, metro, navegación, inventario, guardado).
- `visual-qa`: lo que se ve (pixel art, sprites, cámara, zoom, HUD, responsive, controles móviles). Se omite si no cambia nada visible.
- `optimizer`: rendimiento o complejidad (FPS, memoria, render, número de NPC, duplicación, bundle).
- Tooling o docs sin efecto en el juego: los tres pueden no aplicar; dilo.
- Los especialistas van siempre de uno en uno, nunca en paralelo, y nunca mientras el builder edita.
- **Servidor QA:** lo arrancas tú con `npm run dev -- --port 5197 --strictPort` y lo detienes al terminar. Su origen (`localhost:5197`) solo guarda partidas de prueba, así que los especialistas pueden usar ahí teleport y `setClock`. Si no arranca, la parte de navegador es BLOCKED. Nunca se les da otra URL. Si hace falta respaldar o restaurar una ranura, lo haces tú: ellos no pueden, porque `scripts/agent-guard.mjs` se lo deniega.
- **Restricciones efectivas:** `visual-qa` no tiene ni Bash ni `evaluate_script` (lo limita `tools:`). `gameplay-qa` y `optimizer` cargan el hook `agent-guard` en su frontmatter. Si un especialista necesita otro comando, lo pide en `limits` y lo ejecutas tú, si es de lectura o de prueba.
- **Reparto de trabajo:** cada especialista entrega hallazgos con estado, gravedad, evidencia, límites y próximos pasos, y su `memory`. El evaluator integra esos resultados y decide; no repite lo que ya midió un especialista.
- **Registro de hallazgos:** las entradas `memory` que tengan evidencia las añades tú a `docs/AGENT-HARNESS.md` § Registro de hallazgos. Es la única escritura que haces, y la comprobación de alcance del Gate la excluye. No copies código, secretos, historial de chat ni rutas con tu nombre de usuario. Una entrada cuya condición de invalidación se cumpla se marca `OBSOLETA` con la fecha; no se borra.

## 3. Planificar
Invoca a `lifesim-planner` con el objetivo, el modo, el tipo y la clasificación de §0.1. En ECO, pídele el plan mínimo. Si está bloqueado, informa y detente.
**Antes de delegar en el builder**, el plan debe traer `acceptance` con id, `testPlan` (casos positivo, negativo y de regresión), `evidence` y `open` (lo que queda sin verificar). Si falta algo, pídelo una vez más al planner (no cuenta como corrección); si sigue faltando, BLOCKED. Si los `files` del plan cambian la clasificación, aplica §0.2.

## 4. Implementar (solo tipo implementación)
Tú no editas archivos del proyecto nunca, por pequeño que sea el cambio: ni con Edit/Write ni con Bash, PowerShell o scripts. La única excepción es añadir entradas al Registro de hallazgos (§2). Todo cambio lo hace `lifesim-builder`. Si no puedes invocarlo, o no puede editar, el resultado es BLOCKED, sin cambio hecho a mano.
Formula el prompt para `lifesim-builder` a partir de la respuesta del planner, no de una plantilla. Invócalo una vez por ciclo. Nunca dos builders a la vez en el mismo árbol.
Llámalo siempre con `model: "opus"` en la herramienta Agent: el plugin model-router no hace caso del frontmatter y solo respeta el modelo que nombra la llamada. Los demás agentes llevan el `model` de la tabla de modelos de §0. Opus gasta más que Sonnet, así que no pases del límite de correcciones del modo. Rollback a Sonnet: `node scripts/rollback-builder-model.mjs`.
Antes de la primera llamada al builder, registra el baseline con los criterios del planner:
`node scripts/autodev-gate.mjs baseline --run=<$AUTODEV_RUN_ID si existe, si no <ticket>-<n>> --files=<files del plan> --acceptance=<ids> [--authorize=<protegidos que el ticket autoriza>]`.
Esto guarda el estado de git, los hashes y una instantánea de los archivos del plan en `.autodev/gate/`. Sin baseline no hay builder.

## 5. Quality Gate (lo ejecutas tú y registras comando, exit code y evidencia)
- Siempre, además de lo del modo: los `checksToRun` del builder y los `requestedChecks` del evaluator.
- Registra cada comando del Gate con su criterio: `node scripts/autodev-gate.mjs evidence --run=<id> --criterion=<A1> --exit=<código> --cmd="<comando>"`. Cuando el evaluator termine: `… verdict --run=<id> --evaluator=<veredicto>`.
- **Cierre:** `node scripts/autodev-gate.mjs check --run=<id>`. Su salida («gate: PASS|FAIL|BLOCKED» y los motivos) va al informe. Sin gate PASS, el resultado no puede ser PASS. El script comprueba lo objetivo (alcance, protegidos, tests debilitados, evidencia posterior al último cambio y que haya veredicto). La semántica sigue siendo del evaluator.
- Si hace falta rollback: `… rollback --run=<id>`. Escribe el parche inverso solo de los archivos del plan. Preséntalo al usuario; no lo apliques sin su autorización.
- **Si se modificó el proyecto, en todos los modos** (`autodev-gate check` lo comprueba):
  - Alcance frente al baseline: cualquier ruta cambiada fuera de `files` es FAIL, o BLOCKED si no se puede atribuir.
  - Pruebas y protecciones: `git diff -U0 -- scripts/` sin líneas `-` de `assert` ni de expectativas, salvo que el plan lo justifique. Nada cambiado en `.env*`, `.claude/`, `settings*.json`, `.gitignore`, `package.json`, lockfile ni CI.
  - Revisión independiente del evaluator.
  - Con cualquiera de estos puntos sin cumplir, no hay PASS.
- Estado por criterio: **probado** (con evidencia), **fallido** o **no verificado**. Si falta una prueba indispensable: BLOCKED. Si una falla: FAIL. Con solo la build nunca hay PASS.
- No repitas una prueba sobre el mismo SHA sin cambios, salvo intermitencia justificada (p. ej. `npm run check` que vuelve en segundos).
- **E2E jugable** (`npm run test:e2e`, `scripts/qa/e2e.mjs`). Usa entradas reales por CDP, con perfil temporal y su propio servidor en el puerto 5196. La lista de casos sale con `-- --list`. Cada modo pide:
  - ECO: el caso dirigido (`-- --only=<id>`), si el cambio toca algo jugable;
  - BALANCED: los casos afectados;
  - DEEP: la suite entera, con un Gate **estricto**. Cualquier FAIL → FAIL. Un caso **obligatorio** que quede BLOCKED → BLOCKED (salida 2). Un caso **no obligatorio** sin escenario queda NO VERIFICADO con su justificación escrita en `e2e.mjs` y se informa, pero no impide el PASS. Ningún caso se excluye a mano para conseguir un PASS.

  Interpretación de la salida: 1 = FAIL. 2 = BLOCKED o fallo del arnés, nunca PASS. Los casos marcados BLOCKED con ticket no cuentan como evidencia. Sin Chrome, el E2E queda NO VERIFICADO.
- **Básico (ECO)**: `npm run build` (incluye tsc de src) y los `scripts/check-*.ts` que nombró el planner.
- **Estándar (BALANCED)**: lo básico, más `check-regression`, `check-save-torture` y `check-save-slots` si se tocan estado o guardado, y la evidencia del especialista principal.
- **Ampliado (DEEP)**: lo estándar, más la cadena completa de `scripts.check` y la evidencia de los dos especialistas. Si aplica: móvil 390×844, teclado y ratón o táctil, recargar la partida.
- `npm run check` puede devolver exit 0 sin ejecutar nada. Una pasada real tarda unos 4 min y da unas 2400 líneas. Si vuelve en segundos, repítela y no la cuentes como evidencia.
- Para un cambio visual, la build nunca sustituye a la revisión visual con captura.
- Gate PASS: todo lo exigido pasa con evidencia. FAIL: algo falla. BLOCKED: algo exigido no se pudo comprobar.
- No cambies tests para ocultar fallos. Respeta el preflight o scheduler de .claude/coord si hay carriles activos.

## 6. Reutilizar contexto
Pasa a cada agente solo lo que necesita: objetivo, criterios, archivos afectados y la evidencia previa resumida (comando, exit code, líneas clave). No le pidas que relea lo que otro ya leyó, ni le pegues logs enteros.

## 7. Evaluar y corregir
Invoca a `lifesim-evaluator` con el objetivo, los criterios, el resumen de cambios, el Gate y los veredictos de los especialistas.
- RETRY con correcciones disponibles: su nextPrompt es la entrada del siguiente ciclo del builder (paso 4). Solo cuenta si cita un hallazgo concreto con evidencia (`ruta:símbolo` o comando→salida); si no, devuélveselo al evaluator para que lo concrete. Un hallazgo repetido sigue §0.2.
- FAIL: detente; el resultado es FAIL con la reproducción del evaluator.
- `requestedChecks` sin veredicto final: ejecútalos y vuelve a llamar al evaluator. No cuenta como corrección.
- RETRY con el límite del modo agotado: detente. Resultado **FAIL** si quedan fallos conocidos, **BLOCKED** si lo que falta es no poder comprobarlo.
- En un diagnóstico no hay correcciones: el resultado es el veredicto del Gate y del evaluator, con dos reglas (decisión del usuario, V2-07):
  - Si **todas** las pruebas del diagnóstico quedaron BLOCKED: **NO VERIFICADO**, nunca PASS, aunque el código leído parezca correcto.
  - Si quedó BLOCKED alguna prueba **indispensable** para la misión: **BLOCKED**.
- Los checks se ejecutan como los define el proyecto: `node scripts/check-*.ts` de uno en uno, o `npm run build`/`npm run test:e2e`. Nada de `npx tsx`, cadenas con `;`/`&&` ni redirecciones a archivos. Un comando que el permiso o el hook bloquee cuenta como BLOCKED, no como PASS.

## 8. Entregar
Primera línea: `autodev: <PASS|FAIL|BLOCKED|NO VERIFICADO> · modo=<M> · origen=<auto|explícito> · correcciones=<usadas>/<máx> · especialistas=<…>`. `scripts/autodev-run.mjs` registra `modo=` y `origen=` para las métricas. Después: la ruta (origen del modo, clasificación, escaladas con su motivo), los modelos usados, los cambios, la evidencia por criterio y los límites.

No hagas commit, push, merge, despliegues ni cambios de credenciales. La aprobación humana es obligatoria. No gastes más llamadas de las necesarias.
