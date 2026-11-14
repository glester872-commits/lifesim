---
name: lifesim-mision
description: Ejecutar una misión de LIFE//SIM desde un prompt de Notion con criterios de aceptación, implementación acotada, pruebas y revisión humana.
argument-hint: "[pega el prompt de Notion o indica un archivo del repositorio]"
---

# LIFE//SIM — ejecución y verificación de misiones

**Misión solicitada por el usuario:**

$ARGUMENTS

## Contrato de trabajo

1. Antes de editar, lee `CLAUDE.md`, las partes pertinentes de `README.md`, el estado actual de Git y los archivos relacionados. Conserva cambios locales ajenos.
2. Interpreta la misión original sin perder requisitos. Define criterios de aceptación observables y separa requisitos verificables por pruebas de los que requieren inspección humana/visual. Si el alcance es demasiado grande para verificarlo con seguridad, propón hitos y trabaja únicamente en el hito autorizado.
3. Reutiliza la arquitectura existente (Phaser 3 + TypeScript + Vite) y sus sistemas. No construyas prototipos paralelos, funcionalidades falsas ni refactorizaciones no relacionadas. No alteres tests para ocultar fallos ni desactives verificaciones.
4. Implementa cambios mínimos. En cada ciclo ejecuta primero los tests específicos relevantes (por ejemplo `node scripts/check-seats.ts`, `node scripts/check-police.ts` o la prueba apropiada identificada al inspeccionar el repositorio) y `npm run build`. Diagnostica fallos antes de editar de nuevo.
5. Haz **como máximo tres ciclos** de diagnóstico → corrección → verificación para esta misión. Si el objetivo se cumple antes, detente; si una prueba ya pasa y no hay fallo reproducible, no fabriques cambios. Si tras tres ciclos continúa fallando, detente e informa del bloqueo. Esta regla es una instrucción de trabajo, no un límite de ejecución impuesto técnicamente por Claude Code.
6. Al final ejecuta `npm run check` si es viable en el entorno, sin sustituirlo por una afirmación no comprobada. Si es demasiado costoso o falla por un problema previo, indica exactamente qué comprobaciones sí se ejecutaron y cuáles quedaron pendientes.
7. Para cambios visuales, ejecuta `npm run dev` y comprueba el resultado en navegador **solo si el entorno permite verlo**. Si no puedes verificarlo visualmente, señálalo como «pendiente de revisión humana»; una compilación correcta no demuestra calidad visual.
8. No hagas `git commit`, `push`, `merge`, despliegues ni cambios destructivos. No modifiques configuraciones de seguridad, secretos o dependencias sin aprobación explícita. Detente si aparecen cambios inesperados o conflictos con trabajo de otras personas.
9. Entrega: criterios de aceptación cumplidos/no cumplidos; archivos modificados; tests ejecutados con resultado real; limitaciones; pasos manuales de revisión. Nunca digas «completado» cuando faltan criterios fundamentales.

No ejecutes otra misión distinta de la solicitada.
