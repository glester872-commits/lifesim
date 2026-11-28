# LIFE//SIM — agentes que generan sus siguientes instrucciones

## Qué se ha instalado

- Tres subagentes Claude Code: planner (inspección y plan), builder (código), evaluator (auditoría).
- Una skill interactiva `/autodev` en `.claude/skills/autodev/SKILL.md`.
- Un arnés persistente `scripts/agent-harness.mjs` con un máximo de tres ciclos automáticos. El evaluador decide si continuar y crea un `nextPrompt` NUEVO para el siguiente ciclo.

## Antes de empezar

Instalar Claude Code CLI, iniciar sesión y disponer del repositorio LIFE//SIM local con Node y npm. Trabajar siempre sobre una rama de trabajo independiente y con `git status` limpio. No compartir el árbol de trabajo con otros agentes. Si la coordinación existente en `.claude/coord` tiene un scheduler activo, suspender este arnés; no participa en ese sistema.

### Modo interactivo (recomendado para comenzar)

Abrir Claude Code en la raíz del proyecto (no en GitHub.com) y escribir:

```text
/autodev Corrige el bug de colisiones de NPC descrito en mi especificación
```

El texto de una misión en Notion se pega como argumento o se traslada a un archivo del repo. La skill no lee Notion automáticamente si no está conectado al entorno.

### Modo automático de varias sesiones independientes

```bash
node scripts/agent-harness.mjs "Corregir fallo concreto del sistema de asientos sin alterar otros sistemas"
```

La cadena es: planificador -> implementador -> pruebas -> evaluador -> nuevo encargo -> implementador, hasta PASS, bloqueo o 3 intentos. Cada agente es una invocación separada de Claude Code CLI con un perfil especializado.

El arnés ejecuta `npm run build`, `node scripts/check-seats.ts` y `npm run test:regression`. Es un conjunto de pruebas inicial deliberadamente limitado; no garantiza que otros sistemas funcionen. La misión podría necesitar más pruebas y revisión manual. No hay commit ni push automáticos. Los informes van a `.agent-runs/last-run.json` (ignorado por Git).

## Seguridad y limitaciones

- Nunca se ejecuta desde `main`, ni con cambios locales anteriores.
- Máximo tres ciclos; límite por sesión de Claude Code de 10, 24 y 12 turnos para planner, builder y evaluator, respectivamente. Cada proceso tiene un timeout de tres minutos. Estos límites reducen riesgo, pero no establecen un presupuesto monetario garantizado.
- Planner/evaluator solo pueden leer. Builder puede leer y editar, pero no tiene acceso a Bash en el arnés.
- Si hay fallos de base, se detiene antes de modificar código; una compilación satisfactoria no demuestra calidad visual.
- El paso de evaluación es generado por IA; no es una verificación independiente infalible. No aprobar cambios visuales o grandes sin revisión en navegador.
- El informe PASS indica que se cumplieron las comprobaciones configuradas, no una garantía de corrección total.
- El comportamiento de la invocación CLI depende de versión, límites de plan y permisos de la instalación de Claude Code. Aún es necesario probarlo en la máquina del usuario con Claude autenticado.

## AGENT-V2-01 — baseline y decisiones (2026-11-26)

Lo de arriba describe la instalación original y se conserva como histórico. Hoy el orquestador vivo es `/autodev` (`.claude/skills/autodev/SKILL.md`, «no hay arnés externo»). `scripts/agent-harness.mjs` sigue en el repo como modo heredado y lee las mismas definiciones de agente.

**Baseline.** Rama `vid-12-guia`, SHA `1b148e4`, árbol limpio, Claude Code 2.1.330. `npm run build`: exit 0, con el aviso preexistente de chunks de más de 500 kB.

**Fuentes efectivas por rol (una cada uno).**

| Rol | Definición | Herramientas (las que limitan de verdad) | Modelo · maxTurns |
|---|---|---|---|
| Orquestador | `.claude/skills/autodev/SKILL.md` (`disable-model-invocation: true`) | las de la sesión; no edita por contrato | el de la sesión |
| Planner | `.claude/agents/lifesim-planner.md` | Read, Grep, Glob | sonnet · 10 |
| Builder | `.claude/agents/lifesim-builder.md` | Read, Grep, Glob, Edit, Write (sin Bash) | claude-opus-5-5 (y `model: "opus"` en la llamada) · 24 |
| Evaluator | `.claude/agents/lifesim-evaluator.md` | Read, Grep, Glob | sonnet · 12 |

Precedencia oficial: managed > `--agents` > `.claude/agents/` > `~/.claude/agents/` > plugins. Ningún agente global ni de plugin se llama `lifesim-*`, así que no hay choques. Los planner/architect/builder genéricos (globales, `ecc:`, `model-router:`) no se tocan. No hay referencias circulares: ningún rol tiene la herramienta Agent; solo el orquestador invoca. No hay `settings.json` ni `settings.local.json` de proyecto, y la configuración global no define hooks de proyecto ni permisos (sólo se inventariaron las claves). Los hooks de plugins (GateGuard de ECC) sí actúan en la sesión.

**Decisiones.**
- El contrato común vive en un único sitio: `CLAUDE.md` § SAFETY & CHANGE CONTROL, § PRINCIPIOS OPERATIVOS y § Handoff. Los agentes y `/autodev` lo referencian y no lo copian. Según la documentación oficial, los subagentes personalizados cargan `CLAUDE.md` salvo con `omitClaudeMd: true` (no usado aquí); por si acaso, el orquestador lo nombra al abrir cada handoff. Ese texto no bloquea herramientas; lo que las limita es `tools:`. Los mecanismos ejecutables llegan en V2-04.
- Handoff JSON aditivo: no se renombra ninguna clave que lean `agent-harness.mjs` (`blocked`, `nextPrompt`, `acceptance`, `requiresVisualReview`, `status`, `summary`, `verdict`) ni `autodev-run.mjs` (regex `verdict` y primera línea `autodev:`). El evaluator gana `FAIL`, que esa regex ya admitía.
- No se suben permisos: builder y evaluator siguen sin Bash. El builder declara `checksToRun`, el evaluator pide `requestedChecks` y el orquestador los ejecuta en el Quality Gate. Así la verificación es independiente sin dar shell a quien edita.
- Especialistas: el usuario confirmó «por defecto los 6» (CLAUDE.md). `SKILL.md` §2 y `AGENTS.md`, que decían «nunca todos», se alinean con esa regla.
- Rollback: `scripts/rollback-builder-model.mjs` sigue funcionando; se conservan las dos cadenas que busca.

## AGENT-V2-02 — routing adaptativo y modelos (2026-11-26)

Se amplía el mismo `/autodev`; no hay una segunda definición. Las reglas están en `SKILL.md` §0.1 a §0.3. Aquí van las decisiones y la evidencia.

- **AUTO por defecto.** Clasifica por alcance, incertidumbre, persistencia, impacto y regresión. Si hay duda, elige BALANCED, que era el comportamiento anterior sin modo; así el cambio sólo rebaja a ECO cuando la evidencia es clara. La primera línea lleva el modo concreto, así que `autodev-run.mjs` sigue leyéndolo. Su `newRun()` sigue apuntando BALANCED hasta que llega esa línea: una ejecución AUTO interrumpida quedaría registrada como BALANCED. No se ha tocado porque eso obligaría a cambiar una expectativa de su selftest.
- **Escalada finita.** Sólo sube, como mucho dos veces, DEEP es el techo y el contador de correcciones se arrastra, con un máximo absoluto de 3. Un hallazgo repetido dos ciclos seguidos escala o para con FAIL.
- **Roles.** El usuario confirmó que manda `CLAUDE.md`: planner, builder y evaluator en todos los modos, y especialistas salvo los que claramente no apliquen. Se quitó el «puedes saltar el planner en ECO».
- **Modelos, medido.** Con `claude -p` y `--output-format stream-json`, tres llamadas a Agent: evaluator sin `model`, evaluator con `model:"haiku"` y planner con `model:"opus"`. `modelUsage` sólo registró `claude-haiku-5-5` y `claude-opus-5-5`. Es decir, el `model:` del frontmatter (sonnet) no se aplicó, y el parámetro `model` de la llamada sí. Hasta ahora planner y evaluator corrían en el modelo de la sesión, Opus, sin que nadie lo hubiera decidido. Desde V2-02 cada llamada lleva su modelo: sonnet en ECO/BALANCED, opus para planner y evaluator en DEEP, y opus para el builder en todos los modos, que se conserva hasta comprobar sonnet. Haiku no se usa.
- **`--dry-run`.** Decide la ruta y muestra el peor caso sin agentes, sin Gate y sin editar. Sirve para probar el routing y el fallo persistente sin tocar producción.

## AGENT-V2-03 — especialistas y memoria verificable (2026-11-26)

- **Sin roles duplicados.** Los tres especialistas ya existían (`gameplay-qa`, `visual-qa`, `optimizer`); se completan, no se crean otros. Los especialistas aportan evidencia y el evaluator integra y decide el Gate. Ningún agente global ni de plugin se llama igual.
- **Restricciones efectivas, no sólo texto.** `visual-qa`: sin Bash ni `evaluate_script` en `tools:`. `gameplay-qa` y `optimizer`: hook `PreToolUse` en su frontmatter → `scripts/agent-guard.mjs`. Ese hook permite `node scripts/(check|simulate|bench)-*.ts`, `npm run build|check` y git de lectura, y deniega metacaracteres de shell, `--output`, escrituras de `localStorage`/`sessionStorage`/`indexedDB` y `lifesim.quality|audio(…)`. Falla cerrado. `node scripts/agent-guard.mjs --selftest` prueba 8 casos permitidos y 13 denegados. Probado también en vivo, con subagentes lanzados desde un `claude -p` nuevo. Nadie tiene `bypassPermissions`.
- **Aislamiento de partidas.** El navegador de QA sólo usa `localhost:5197`, un origen propio con su `localStorage`. El orquestador lo arranca y es el único que respalda o restaura ranuras.
- **Memoria: no se activa `memory:`.** La opción existe (`.claude/agent-memory/<agente>/MEMORY.md`), pero según la documentación habilita Read, Write y Edit al subagente, y eso rompería el solo lectura de los especialistas. En su lugar se reutiliza este documento: el registro de abajo es la memoria **compartida** (versionada y auditable en el diff). La memoria **privada** de cada usuario (`~/.claude/projects/…/memory/`) no se usa para hallazgos del proyecto. Los especialistas proponen entradas en el campo `memory` y el orquestador las añade.

## AGENT-V2-04 — hooks, permisos y controles ejecutables (2026-11-26)

**Inventario previo.** No había ni `.claude/settings.json`, ni `settings.local.json`, ni managed settings (`C:/ProgramData/ClaudeCode` no existe). `~/.claude/settings.json` no define hooks ni permisos. Sí había hooks de plugins (ECC GateGuard «Fact-Forcing Gate», StrategicCompact, avisos de coste), que siguen activos y se suman a los nuestros: entre hooks gana el más restrictivo (deny > defer > ask > allow). Precedencia de settings: managed > CLI > `.claude/settings.local.json` > `.claude/settings.json` > `~/.claude/settings.json`. Las listas de permisos se combinan y `deny` gana siempre. Los settings se recargan en caliente.

**Capas (de fuera a dentro):**
1. **Permisos nativos** en `.claude/settings.json`. `deny` para lo destructivo (`git clean`, `reset --hard`, `checkout .`/`--`, `restore .`/`-p`, `stash`, `push --force`) y para `.env*`/`settings.local.json`. `ask` para lo que cambia el repositorio o publica (commit, push, pull, merge, rebase, reset, restore, checkout, add, rm) y para lo protegido (`.github/`, `.gitignore`, `.claude/`, `CLAUDE.md`, `AGENTS.md`, `package.json` y las dos barreras). Claude Code ya analiza `&&`, `;`, `|` y las subshells, pero no `sh -c`.
2. **Hook `PreToolUse`** → `node "$CLAUDE_PROJECT_DIR/scripts/agent-guard.mjs" --policy=project` sobre Bash, PowerShell, Edit, Write y NotebookEdit, con `timeout: 10` y `onFailure: "block"`. Tiene en cuenta los comandos compuestos, `bash/sh -c`, `powershell -Command`, `cmd /c`, `eval`, `git -C/-c`, las rutas relativas y absolutas, `..`, los separadores `\`, `/c/…` de Git Bash, `~`, las variables asignadas en el propio comando, los intérpretes (`node -e`/`python -c` que borran o escriben) y las redirecciones `>`, `tee`, `sed -i`, `Out-File`, `cp`/`mv`. Qué deniega: lo destructivo, el borrado recursivo fuera de temporales, `find -delete`/`xargs rm`, los secretos, `.git/`, y que **un subagente** (`agent_type`/`agent_id` en la entrada) toque `agent-guard.mjs`, `autodev-gate.mjs` o `.claude/settings.json`. Qué pide autorización (ask): lo protegido, las escrituras fuera del proyecto (salvo temporales, la memoria privada y `~/.claude/plans`), escribir en el proyecto por shell en vez de con Edit/Write, borrar un archivo suelto, los despliegues y `git` que cambia el repo.
3. **Protección de tests** (en el mismo hook): en `scripts/check-*.ts` y `simulate-*.ts`, añadir `.skip`/`.only`/`process.exit(0)`/`if (false)` o comentar un `assert` → deny. Quitar asserts → ask (revisión independiente). Sacar un check de la cadena de `package.json` → ask. Crear un test nuevo o reparar uno sin quitar asserts pasa sin preguntar.
4. **Gate de cierre** `scripts/autodev-gate.mjs`. Lo usa el orquestador (`SKILL.md` §4/§5) para registrar el baseline con los criterios antes del builder, la evidencia por criterio y el veredicto del evaluator. Hace `check` (PASS/FAIL/BLOCKED) y genera el parche inverso de rollback. **No se usa Stop hook**: no sabría qué ejecución cerrar, y un Stop que bloquea puede entrar en bucle. El gate se llama de forma explícita y la falta de evidencia da BLOCKED, nunca PASS.

**Pruebas realizadas (ninguna contra LIFE//SIM):**
- `node scripts/agent-guard.mjs --selftest`: 21 casos de la política de especialista y 67 de la de proyecto.
- `node scripts/autodev-gate.mjs --selftest`: un repositorio git sintético en un temporal, con 14 aserciones. Incluye un rollback que conserva el trabajo ajeno staged, unstaged y untracked, y el índice.
- **En vivo** (`claude -p` en un repositorio sintético fuera de temporales, con la misma configuración y `ECC_GATEGUARD=off` solo en ese proceso, para ver nuestras barreras sin que GateGuard las tape):
  - Pasaron: `git status`, `node scripts/check-z.ts`, una edición normal de `src/a.ts` y escribir en un temporal.
  - Deny de agent-guard: `git clean -fd`, `git checkout .`, `git reset --hard`, `git status && git clean -fd`, `bash -c "git checkout ."` y `rm -rf src`.
  - Ask (en `-p` equivale a no aprobado): escribir en `../fuera`, quitar un assert y editar `agent-guard.mjs`. `ci.yml` y `.gitignore` los paró la regla nativa `ask`.
  - `.env` lo denegó la regla nativa. `git restore .` lo denegó el hook, y `git restore src/a.ts` pidió autorización.
  - El cambio ajeno unstaged y el archivo untracked quedaron intactos.
  - Hook roto (el script no existe) → bloquea. Hook que no termina con `timeout: 3` → bloquea con «timed out; blocking because onFailure is "block"». En un proceso nuevo, la configuración buena se carga y deniega.

**Activación:** el archivo `.claude/settings.json` está versionado. Se aplica a toda sesión que se abra en el proyecto y se recarga en caliente. **Diagnóstico:** `/hooks` y `/permissions` en Claude Code, o probar la regla a mano: `echo '{"tool_name":"Bash","tool_input":{"command":"git clean -fd"},"cwd":"."}' | node scripts/agent-guard.mjs --policy=project`. **Deshabilitación controlada:** la debe hacer el usuario a mano. En `.claude/settings.local.json`, que es personal y que el hook no deja tocar a Claude, se puede poner `"disableAllHooks": true`, o quitar la entrada `hooks` de `.claude/settings.json`. Los permisos `deny` del proyecto no se pueden anular desde ahí. **Rollback:** borrar `.claude/settings.json` (archivo nuevo de V2-04) y deshacer a mano los hunks de V2-04 en `SKILL.md`, `CLAUDE.md`, `gameplay-qa.md` y `optimizer.md`. `scripts/autodev-gate.mjs` también es nuevo de V2-04.

**Límites (no es un sandbox):**
- Un programa que lanza otro programa sin texto visible en la orden (un script `.mjs` del repo que borra cosas, `npm run <x>` con un script destructivo, un binario cualquiera) no se analiza.
- Los intérpretes solo se miran por patrones (`rmSync`, `writeFileSync`…).
- Las herramientas MCP que escriben archivos no pasan por este hook.
- Lo que haga el usuario en su propia terminal no pasa por Claude Code.
- `git clean -n` también se deniega, porque el contrato prohíbe `git clean` sin excepciones.
- **Modo automático interactivo (V2-07, observado).** Un `ask` del hook o de los permisos solo frena de verdad cuando decide una persona o cuando no hay quien decida: en `claude -p` cuenta como denegado. En una sesión interactiva en modo automático lo resuelve el clasificador. En V2-07, `node scripts/autodev-run.mjs --selftest; echo exit=$?` se ejecutó sin preguntar, aunque el hook ya devolvía `ask` por check encadenado. Allí, todo lo que es `ask` (check encadenado, techo de builders, rutas protegidas, git que cambia el repo) es un aviso, no una barrera. Solo `deny` se mantiene en todos los modos. Para que una regla sea firme en ese modo tiene que ser `deny`; si no, hay que usar el modo por defecto, o `claude -p` vía `scripts/autodev-run.mjs`.
- **Cierre (V2-07).** Un PASS que no cumple `closure()` (`scripts/autodev-run.mjs`) se registra como BLOCKED. Esto solo actúa en las ejecuciones lanzadas con `scripts/autodev-run.mjs`. En un `/autodev` interactivo, el cierre sigue dependiendo del texto de `SKILL.md` y del Gate.

## AGENT-V2-05 — QA jugable determinista (2026-11-26)

**Decisión del usuario: no se instala Playwright.** El repo ya tenía su propio arnés E2E sin dependencias (`scripts/qa`: Chrome por CDP con perfil temporal, entradas reales en `pilot.mjs` y escenarios `run-qa03`/`run-qa08`). `scripts/qa/e2e.mjs` lo unifica con `npm run test:e2e`, sin tocar dependencias ni el lockfile. `test:regression` (ticket 87) sigue igual: comprueba tipos, checks y build. `test:e2e` cubre lo que solo se ve jugando, lo que antes era el «humo manual» que imprimía `scripts/regression.ts`.

**Cómo funciona:**
- Vite propio (puerto `--port` o `E2E_PORT`, 5196 por defecto) y Chrome headless con un perfil temporal nuevo en cada caso. La partida real nunca se toca.
- Entradas reales: teclas y toques mantenidos y clics con CDP.
- `window.lifesim`, que solo existe en desarrollo (`src/main.ts`, `import.meta.env.DEV`), se usa únicamente para el fixture (sitio, tile y hora) y para leer el estado. No hay ningún puente nuevo y nada llega a producción.
- Esperas por condición, nunca fijas: el bloqueo de elección del menú (`PICK_LOCK_MS`), el tren en `BOARDING`, los cambios de sitio.
- Si un caso falla deja captura, `console.json` y `trace.json` en `.autodev/e2e/`, que ya estaba en `.gitignore`, así que no hubo que cambiarlo.
- Salida: 0 todo PASS, 1 FAIL, 2 BLOCKED o fallo del arnés.

**Cobertura real:** se lista con `npm run test:e2e -- --list`.
- **PASS con evidencia:**
  - `boot-move`: sin entrada Δ=0; con D, Δx≈46 px.
  - `collision`: avanza 72 px, y en los 800 ms finales Δx=0.
  - `save`: tras F5 y Continuar, mismo sitio, día, hora (±1), dinero y posición.
  - `mobile`: 390×844 táctil; joystick y E alcanzables y sin HUD encima; sin dedo Δ=0; con dedo Δx=18.
  - `visual`: `pixelArt: true`, `antialias: false`, `image-rendering: pixelated`, y capturas con zoom cercano y lejano.
  - `metro`: calle → estación con E. Sin tarjeta, no sube. Tarjeta €12,50 con €10. Viaje: **−€2 exactos y +15 min exactos** en el salto de Vallesco a Ribera. Salida a la calle de Ribera. Estable 3 de 3.
- **FAIL intermitente (defecto real del juego, no del test):** `npc-tracks` (reutiliza `qa03-metro-tracks.js` con 3 ciclos). De 2 ejecuciones, 1 PASS y 1 FAIL; en el FAIL, un pasajero pisa la vía en BOARDING. Ver R-01 en el registro. La suite sale con 1, como debe.
- **Estabilidad de `metro`:** a veces hace falta un segundo intento para entrar desde la calle o para coger el tren (el tren se va). Pasa siempre en el segundo, y los dos intentos quedan anotados como evidencia.
- **BLOCKED, falta escribir el escenario (la mecánica existe):** `bike` (V2-05-BIKE) y `shift` (V2-05-SHIFT). No se inventa ningún resultado.
- **Control negativo:** `npm run test:e2e -- --negative` → FAIL y exit 1, con captura.

**Hallazgos del proceso:** ninguno es un defecto del juego.
- El reloj marcó 17 min en vez de 15 porque el reloj de juego corre mientras llega el tren. Medido en el salto de sitio, son 15 exactos.
- Un clic en un menú recién abierto se ignora durante 300 ms (`PICK_LOCK_MS`), y es a propósito.
- Los portales de la boca del metro y de la salida se activan con E, no andando.
- En headless (swiftshader), una pulsación de 90 ms puede caer entre dos fotogramas; el arnés usa 180 ms.

**Límites:**
- La revisión estética de las capturas es MANUAL: no hay ninguna baseline aprobada y ninguna se aprueba automáticamente.
- Swiftshader no mide el rendimiento real.
- El fixture usa teletransporte de desarrollo para colocar al jugador (no prueba el trayecto entre portales).
- Sin Chrome, todo queda NO VERIFICADO.

## AGENT-V2-06 — observabilidad y comparación (2026-11-26)

**Reutiliza OBS-01 sin crear un segundo logger ni un segundo dashboard.** El logger sigue siendo `scripts/autodev-run.mjs`, que escribe `.autodev/runs.jsonl`, y el dashboard sigue siendo `scripts/autodev-dashboard.mjs`, que escribe `.autodev/dashboard.html` o un resumen en la terminal. Todo es local y lo ignora la regla `.autodev/` de `.gitignore`, que ya existía (comprobado con `git check-ignore`; no hubo que tocar `.gitignore`). No hay telemetría externa.

**Origen de los datos.** Lo **medido** sale del `stream-json` de Claude Code: duración, fases, agentes, `modelUsage` (modelos usados), tokens, `total_cost_usd` (coste API estimado, que no es lo que cuesta la suscripción), denegaciones de permisos y comandos de prueba. Lo **declarado** sale de la línea `autodev:` (resultado, modo, `origen=`, correcciones) y del frontmatter (modelo declarado). La **evidencia** sale de `.autodev/gate/<run_id>.json` (criterios, evidencias, `lastCheck`), enlazada porque el runner pasa `AUTODEV_RUN_ID` al orquestador. Las **regresiones** son manuales y se etiquetan (`source: 'manual'`, `confirmed`). Lo que no está disponible queda `null`: el coste real de la suscripción, los límites del plan y la complejidad más allá del modo y el origen. No se guardan prompts, respuestas, secretos, rutas personales ni partidas; `sanitize()` lo cubre y el selftest lo comprueba.

**Schema 2:** se añaden `kind` (`real` o `dry-run`), `ticket` (p. ej. `QA-09`, sacado del objetivo), `origin` (`auto` o `explícito`) y `regressions[]`. Los registros con schema 1 se completan al leerlos (`normalize`), sin reescribirlos. Los fixtures sintéticos del selftest van a `.autodev/selftest-<pid>.jsonl`, que se borra al acabar, y nunca entran en `runs.jsonl`.

**Fórmulas** (`metrics()`; el HTML y `--summary` usan las mismas):
- **A la primera** = PASS con 0 correcciones / (PASS + FAIL). Quedan fuera los BLOCKED, las interrumpidas, las que siguen sin terminar y los dry-run; las exclusiones se muestran.
- **Duración**: la mediana. **Correcciones**: la media.
- **Regresiones** = PASS con una regresión **confirmada** vinculada / PASS cuya ventana de 7 días ya ha pasado. Las PASS más recientes se cuentan aparte, para que se vea la madurez de la ventana.
- **Tokens**: solo los medidos, con su cobertura (medidas / terminadas).
- **Gate**: criterios con evidencia de salida 0 / criterios definidos, y número de ejecuciones con cambios fuera de alcance.
- Se agrupa por modo, por modo · origen y por los modelos medidos. Con N < 5 aparece «muestra pequeña: no comparar».
- No se usa el número de llamadas a herramientas, ni los tokens, como medida de calidad.

**Comandos:**
- Consultar: `node scripts/autodev-dashboard.mjs --summary`, o sin `--summary` para generar el HTML.
- Ejecutar instrumentado: `node scripts/autodev-run.mjs "<args de /autodev>" -- <flags de claude>`.
- Mantenimiento: `node scripts/autodev-run.mjs --recover` marca como interrumpidas las ejecuciones que siguen en `running` tras 6 h. `--link-regression <run_id> "<qué se rompió>" [--confirmed]` vincula una regresión.
- Pruebas del propio sistema: `node scripts/autodev-run.mjs --selftest` (saneamiento, upsert sin duplicados, línea corrupta, clasificación, exclusiones, ventana, Gate, recuperación).

**Cómo detectar que un cambio empeora la calidad.** Compara el `--summary` antes y después, a igual modo y origen y con N ≥ 5 por grupo. Son señales de empeoramiento:
- baja «a la primera»;
- sube la media de correcciones;
- aparecen regresiones confirmadas en PASS ya maduras;
- baja el porcentaje de criterios con evidencia;
- aparecen ejecuciones con cambios fuera de alcance.

Con N < 5, no se concluye nada.

**Protocolo para comparar modelos** (no se ha ejecutado de forma masiva; los datos actuales no bastan):
1. Baseline con la configuración actual (`SKILL.md` § modelos).
2. Al menos 5 tareas **equivalentes** por configuración: mismo modo, mismo origen y tipo de cambio parecido. Se recogen en el trabajo normal, sin lanzar tandas a propósito.
3. Antes de cada ejecución se apunta la configuración en el objetivo (p. ej. `[cfg=builder-sonnet]`), para poder agrupar después.
4. Se comparan con las mismas fórmulas. Solo se cambia el modelo si la diferencia se mantiene con N ≥ 5 en cada lado y sin peor tasa de regresiones.

Hoy hay 1 ejecución real evaluable más la de V2-06: insuficiente.

**Ejecución real de verificación:** `v206-diag`, con `node scripts/autodev-run.mjs --run-id=v206-diag "--mode=ECO --audit V2-06-OBS: …"` y Bash limitado a `node scripts/*` y `git status|diff`. Resultado:
- Queda registrada como PASS, ECO, `origen: explícito`, `kind: real` y `ticket: V2-06-OBS`. Modelos medidos: Opus, Sonnet y Haiku. Tokens medidos. 4,6 min. Sale en `--summary`.
- **Hallazgo 1:** sus 4 comandos de prueba quedaron **BLOCKED** y así se registraron. El orquestador usó `npx tsx …`, comandos compuestos y redirecciones a `.autodev/`, cuando el proyecto ejecuta `node scripts/check-*.ts` directamente. Esos comandos no estaban permitidos en esa ejecución, o el hook pidió autorización. El PASS de ese diagnóstico se apoyó en la lectura del código, no en ejecutar checks.
- **Hallazgo 2:** al ser un diagnóstico no hay builder, así que tampoco hay baseline del Gate, y la columna Gate sale «sin registro». Es lo esperado: el Gate se aplica a las implementaciones.

**Agent Teams:** fuera de alcance y no se activa. Solo tendría sentido como piloto futuro si hubiera tareas paralelizables sin escrituras compartidas (p. ej. especialistas de solo lectura en zonas distintas). Hoy `SKILL.md` exige especialistas en serie y un solo builder.

## Registro de hallazgos

Formato: hallazgo · dónde (`ruta:símbolo`) · prueba (comando→resultado) · SHA y fecha · alcance · invalida si. Una entrada caducada se marca `OBSOLETA (fecha)`; no se borra. Sin código, secretos, historial de chat ni rutas privadas.

**H-001 · Persistencia de bicis: la integración con el guardado no tiene check** (gameplay-qa, persistencia)
- Hallazgo: `parseBikes` se prueba solo, con ida y vuelta por JSON (`scripts/check-bici.ts:196`, `:280`). Ningún check de guardado menciona `bikes`: ni `check-save-torture`, ni `check-persistence`, ni `check-save-slots`, ni `check-title-save` (grep, 0 coincidencias). La ruta real `src/systems/SaveSystem.ts:432` (`bikes: parseBikes(s.bikes)`) no tiene ninguna prueba de partida completa.
- Prueba: `node scripts/check-bici.ts` → exit 0, «check-bici: OK».
- SHA `1b148e4` · 2026-11-26 · alcance: `src/systems/SaveSystem.ts`, `src/systems/Cycling.ts:parseBikes` y los cuatro checks de guardado.
- Invalida si: cambian `SaveSystem.ts:parseState`/`bikes` o `Cycling.ts:parseBikes`, o algún check de guardado empieza a mencionar `bikes`.
- Estado: **observado**. Lo que se infiere, no verificado: una rotura del cableado de `bikes` en `SaveSystem` no la detectaría ningún check. Pendiente: probarlo en el navegador (montar o aparcar una bici, recargar y recuperar la partida).

**H-002 · `check-sidewalks` falla en la base y corta `npm run check`** (V2-07 prueba C; reproducido en `vid-12-guia`)
- Hallazgo: un poste cierra un pasillo de un tile en `decathlon-tienda`. `npm run check` se para ahí y no ejecuta los comandos que vienen detrás, así que el Gate DEEP, que pide la cadena completa, no puede dar PASS.
- Dónde: `scripts/check-sidewalks.ts:26`. Datos: `src/data/locations.ts` (props de `decathlon-tienda`).
- Prueba: `node scripts/check-sidewalks.ts` → exit 1, «decathlon-tienda: stanchion en 26,6» (en `b7e694d` y en `1b148e4` con el árbol de trabajo). Los comandos posteriores de la cadena, ejecutados uno a uno en la prueba C, salen con exit 0.
- 2026-11-26 · alcance: solo datos (gameplay): necesita su propio ticket, no se corrige aquí.
- Invalida si: cambian los props de `decathlon-tienda`, `solidMask` o `PropDef.post`.
- Estado: **corregido (2026-11-26)** en `vid-12-guia`: `src/data/decathlon.ts`, poste de (26,6) a (20,6), sin tocar el check. Verificado: `check-sidewalks` exit 0; `npm run check` entero exit 0 (2826 líneas, run v207-C3); en el navegador, las 11 cabinas alcanzables (run qa10-a3). Ticket: **`QA-10.md`**.

**L-01 · Perfil de Chrome del MCP de DevTools bloqueado: los especialistas no pueden usar el navegador** (V2-07 prueba C)
- Hallazgo: `gameplay-qa`/`visual-qa` devuelven BLOCKED porque el MCP no puede abrir su Chrome. Su perfil está en uso.
- Prueba: `~/.cache/chrome-devtools-mcp/chrome-profile/lockfile` existe y hay 8 procesos `chrome.exe` con `chrome-devtools-mcp` en la línea de órdenes (2026-11-26, una única comprobación).
- No se cerraron esos procesos: pueden ser de otra sesión del usuario, y matarlos no estaba autorizado. Tampoco se abrió otro ciclo de investigación.
- Cómo verificarlo: cierra las sesiones de Claude Code o los Chrome que usan ese perfil y repite gameplay-qa de QA-09 (tirón de 300 ms, y ≥ 80 en cada `worldstep`). El E2E (`npm run test:e2e`) no se ve afectado: usa su propio perfil temporal.
- Estado: **OBSOLETA (2026-11-26)**. La causa era el propio MCP de la sesión interactiva; al cerrarlo (con autorización), los especialistas de la run v207-C3 usaron Chrome. Si vuelve: cerrar el MCP de chrome-devtools de la sesión principal antes de lanzar `claude -p`.

**H-003 · Parche de QA-09 en `Walker.step`: arregla la vía pero rompe la entrada al metro. NO INTEGRAR** (V2-07 prueba C, run v207-C3)
- Hallazgo: el parche (`.autodev/v207-evidence/C3/walker-qa09-c3.patch`) cumple A1–A5 de QA-09 (0 pasajeros en la vía en 20 ciclos; ≥ 92 en cada `worldstep` con tirones de 300 ms), pero provoca H-004.
- SHA base `3257f41` · 2026-11-26 · alcance: `src/entities/Walker.ts`.
- Estado: **rechazado**. QA-09 sigue abierto; hay que rehacer el arreglo sin regresión en `metro`.

**H-004 · La primera E delante de la boca del metro no entra (regresión del parche H-003)**
- Prueba: `node scripts/qa/e2e.mjs --only=metro`, 6 ejecuciones por lado. Sin parche (`1b148e4`, `src/` idéntico a `3257f41`): la primera E falla 1/6. Con parche: 6/6, y en 1 tampoco entra la segunda (caso FAIL). Probabilidad por azar < 1 %.
- Artefactos: `.autodev/v207-evidence/C3/base-metro-*.log`, `C3/base-e2e/` (sin parche) y `C3/e2e/` (con parche).
- Causa: **no investigada** (fuera del alcance de V2-07). En la calle no se ejecuta `Walker.step`, así que el mecanismo no es directo.
- Invalida si: cambian `Walker.ts`, el portal de la boca en los datos de la calle o el caso `metro` de `e2e.mjs`.
- Estado: **reproducido**. Necesita ticket propio junto con QA-09.

**H-005 · El caso `metro` del E2E mide a veces 16 min en vez de 15 en Vallesco→Ribera** (previo, no del parche)
- Prueba: sin parche, 2 de 6 ejecuciones de `--only=metro` fallan con «el viaje Vallesco→Ribera no suma 15 min de juego (16)»; con el parche, 1 de 4.
- Dónde: probablemente el muestreo del reloj en `scripts/qa/e2e.mjs:391` (inferencia, no verificada). No se sabe si es del test o del juego.
- Invalida si: cambian ese muestreo, `MetroSystem.ts` o la tarifa (`minutes`) del portal.
- Estado: **reproducido, intermitente**. Necesita ticket propio.

**H-006 · El orquestador deja el servidor de QA en 5197 tras decir que lo detuvo** (V2-07, 3 veces)
- Prueba: tras las runs de C, C2 y C3, `vite --port 5197` seguía escuchando (en C3, PID 23944), y el informe decía «detenido». También en C3 un especialista dejó capturas `tmp-qa09-*.png` en la raíz, y por eso el Gate dio FAIL.
- Estado: **reproducido**. Pendiente de corregir en `SKILL.md` §2 o con una comprobación del Gate.

**V2-07 · cierre (2026-11-26): NOT READY.** B2 PASS; C (DEEP) BLOCKED (Gate `QA-09-2` FAIL, evaluator BLOCKED, optimizer sin salir del menú de título, visual-qa sin verificar el andén en el embarque); **prueba A (ECO) NO VERIFICADA, pendiente**. QA-10 corregido (H-002). Evidencias: `.autodev/v207-evidence/`.

**Regresiones conocidas: pendientes de verificar, no son arreglos confirmados**
- **R-01 · NPC que camina sobre el fondo negro o las vías del metro. REPRODUCIDO, INTERMITENTE.** `npm run test:e2e -- --only=npc-tracks` en el andén de Vallesco, 3 ciclos de tren por ejecución. De 2 ejecuciones, 1 PASS y 1 **FAIL**. En el FAIL, un pasajero quedó en la vía en la fase BOARDING/BOARDING (`y=78`, borde `80`), con `onTrackAfterPhysics: 1` y `diag: invasion 1, guard 1`. Es decir, la guarda lo devolvió, pero llegó a pisar la vía tras un paso de física. Artefactos en `.autodev/e2e/2026-11-26T01-25-08-489Z/npc-tracks/`. SHA `1b148e4`, 2026-11-26. No se ha corregido: es gameplay fuera de esta misión. Ticket: **`QA-09.md`**. Alcance: solo vallesco-station. Invalida si cambian `PassengerAI.ts`, `MetroSystem.ts` o `data/zones.ts`.
- **R-02 · Sprites y ojos al caminar con el zoom lejano.** `npm run test:e2e -- --only=visual` deja capturas `zoom-near.png` y `zoom-far.png` en `.autodev/e2e/<ejecución>/visual/` y confirma nearest-neighbor. La comparación con una referencia sigue **NO VERIFICADA**: no hay baseline aprobada, la tiene que revisar una persona. `check-eye-frame.ts` solo cubre un frame quieto.
- **R-03 · Persistencia de bicis.** Ver H-001. Hoy: el check unitario da OK; la partida completa está NO VERIFICADA.
