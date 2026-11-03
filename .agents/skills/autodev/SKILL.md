---
name: autodev
description: Coordina planificador, implementador y evaluador de LIFE//SIM para desarrollar una misión con prompts generados según resultados verificables.
argument-hint: [objetivo o referencia a una misión]
disable-model-invocation: true
---
# LIFE//SIM AutoDev
Objetivo del usuario: $ARGUMENTS

Este comando es el modo interactivo del sistema de agentes. Para un bucle con límites mecánicos y sesiones independientes existe scripts/agent-harness.mjs; no confundir ambos.

1. Lee AGENTS.md, la parte relevante del README.md y las reglas de .Codex/coord si hay trabajadores activos. Comprueba git status. Nunca toques main directamente ni sustituyas el trabajo de otros agentes.
2. Invoca al subagente lifesim-planner con el objetivo. Recibe sus criterios y el microobjetivo generado. Si está bloqueado, informa y detente.
3. Formula el siguiente prompt específicamente para lifesim-builder a partir de la respuesta del planificador, no de una plantilla estática. Invócalo una sola vez. No ejecutes varios implementadores en el mismo árbol simultáneamente.
4. Ejecuta tú las comprobaciones reales pertinentes (por ejemplo npm run build y el scripts/check-*.ts existente). No cambies tests para ocultar fallos; registra comandos, código de salida y evidencia. Respeta cualquier preflight o scheduler activo definido en .Codex/coord.
5. Invoca a lifesim-evaluator con el objetivo, criterios, resumen de cambios y salidas reales de pruebas. Si devuelve RETRY, usa SU nextPrompt como entrada del siguiente ciclo del implementador. Máximo 3 ciclos de implementación-evaluación.
6. Si hay PASS, entrega un resumen de cambios, evidencias y limitaciones. Si hay BLOCKED o se agotaron los ciclos, detente y explica qué queda pendiente. No hagas commit, push, merge, despliegues ni cambios de credenciales. La aprobación humana es obligatoria.

Para tareas de diseño visual, una compilación exitosa nunca sustituye a la inspección visual. Los intentos no deben quedarse en un bucle indefinido; no gastes más llamadas de las necesarias.
