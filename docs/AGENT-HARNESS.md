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
