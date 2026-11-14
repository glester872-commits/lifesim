---
name: autodev
description: Coordina planificador, implementador y evaluador de LIFE//SIM para desarrollar una misión con prompts generados según resultados verificables, con modos ECO/BALANCED/DEEP y especialistas por tipo de tarea.
argument-hint: "[--mode=ECO|BALANCED|DEEP] [--audit] objetivo o referencia a una misión"
disable-model-invocation: true
---
# LIFE//SIM AutoDev
Objetivo del usuario: $ARGUMENTS

Este es el único orquestador del sistema de agentes. No hay arnés externo: el bucle y sus límites los aplicas tú, siguiendo este archivo.

## 0. Leer los argumentos
Sintaxis: `/autodev [--mode=ECO|BALANCED|DEEP] [--audit] <objetivo>`. También vale el prefijo `[ECO]`, `[BALANCED]` o `[DEEP]` al inicio del objetivo. Mayúsculas o minúsculas, da igual.
- Sin modo: **BALANCED**, que equivale al /autodev original (3 ciclos de implementación y evaluación).
- Si hay dos modos, o uno que no existe: detente y pregunta. No adivines.
- `--audit` (o un objetivo que pida solo auditar, diagnosticar o medir): tarea de **diagnóstico**. Sin builder ni cambios en archivos. Solo planner (opcional en ECO), comprobaciones, especialista si corresponde y evaluator.
- Antes de nada, escribe una línea `autodev: modo=<M> tipo=<implementación|diagnóstico> especialistas=<…> correcciones_máx=<N>`.

| Modo | Correcciones (RETRY tras el 1.º intento) | Especialistas | Quality Gate |
|---|---|---|---|
| ECO | 1 | Solo si sin él el criterio queda sin verificar | Básico |
| BALANCED | 2 | El principal, bajo demanda | Estándar |
| DEEP | 3 | Principal y, si aplica, secundario, en serie | Ampliado |

El límite cuenta ciclos de corrección, no tokens ni cuota: la plataforma no expone la cuota de la suscripción y aquí no se controla.

## 1. Preparar
Lee CLAUDE.md, la parte pertinente del README.md y, si `.claude/coord/lanes/lanes.json` tiene carriles, las reglas de .claude/coord. Comprueba `git status`. Nunca toques main directamente ni sustituyas el trabajo de otros agentes.

## 2. Elegir especialistas (por tipo de tarea, nunca todos por defecto)
Clasifica el objetivo y los archivos que te dé el planner:
- `gameplay-qa`: mecánicas (NPC, colisiones, economía, tiendas, metro, navegación, inventario, guardado).
- `visual-qa`: lo que se ve (pixel art, sprites, cámara, zoom, HUD, responsive, controles móviles).
- `optimizer`: solo rendimiento o complejidad (FPS, memoria, render, número de NPC, duplicación).
- Nada de eso (tooling, docs, una función pura cubierta por un check): ninguno.
- Mixta: declara principal y secundario. ECO usa el principal solo si es imprescindible; BALANCED usa el principal; DEEP usa los dos.
- Los especialistas van siempre de uno en uno, nunca en paralelo, y nunca mientras el builder edita. Necesitan la URL de `npm run dev` para el navegador; si no hay servidor, arráncalo tú y detenlo al terminar. Si no puede arrancar, su parte es BLOCKED.

## 3. Planificar
Invoca a `lifesim-planner` con el objetivo, el modo y el tipo. Si está bloqueado, informa y detente. En ECO, con un diagnóstico de una sola función, puedes saltarlo y decir por qué.

## 4. Implementar (solo tipo implementación)
Tú no editas archivos nunca, por pequeño que sea el cambio: ni con Edit/Write ni con Bash, PowerShell o scripts. Todo cambio lo hace `lifesim-builder`. Si no puedes invocarlo, o no puede editar, el resultado es BLOCKED, sin cambio hecho a mano.
Formula el prompt para `lifesim-builder` a partir de la respuesta del planner, no de una plantilla. Invócalo una vez por ciclo. Nunca dos builders a la vez en el mismo árbol.
Llámalo siempre con `model: "opus"` en la herramienta Agent: el plugin model-router no hace caso del frontmatter y solo respeta el modelo que nombra la llamada. Los demás agentes van sin `model`. Opus gasta más que Sonnet, así que no pases del límite de correcciones del modo. Rollback a Sonnet: `node scripts/rollback-builder-model.mjs`.

## 5. Quality Gate (lo ejecutas tú y registras comando, exit code y evidencia)
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
- RETRY con correcciones disponibles: su nextPrompt es la entrada del siguiente ciclo del builder (paso 4).
- RETRY con el límite del modo agotado: detente. Resultado **FAIL** si quedan fallos conocidos, **BLOCKED** si lo que falta es no poder comprobarlo.
- En un diagnóstico no hay correcciones: el resultado es el veredicto del Gate y del evaluator.

## 8. Entregar
Primera línea: `autodev: <PASS|FAIL|BLOCKED> · modo=<M> · correcciones=<usadas>/<máx> · especialistas=<…>`. Después: cambios, evidencia y límites.

No hagas commit, push, merge, despliegues ni cambios de credenciales. La aprobación humana es obligatoria. No gastes más llamadas de las necesarias.
