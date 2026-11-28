# UXN-01 · Ajustes de confort

## Auditoría previa (sobre e3a2d88)

- **Menú de inicio real** (`src/title.ts`, vista `settings`): sólo «Sonido de ambiente» (`config/audio.ts`, clave `lifesim.audio`) y «Calidad gráfica» (`config/quality.ts`), con guardado inmediato al pulsar. No había nada de texto, contraste, duración, pistas ni parpadeos.
- **Pausa** (`ui/PauseMenu`): no tiene ajustes; volver al inicio es recargar la página. No se añaden ahí: el confort se elige en la pantalla de inicio, que es donde viven los demás ajustes del navegador, y duplicarlo en la pausa exigiría otro panel con su propio borrador (fuera de alcance).
- **Sacudidas de cámara**: no hay ninguna en el juego; no hace falta preferencia.
- **Parpadeos reales**:
  - Rótulos de neón (nightlife/Carmen) en `world/Lighting.ts` (tartamudeo): se apagan con «Reducidos».
  - Focos de la pista de baile (`Lighting.strobe`, saltan cada 500 ms): quietos con «Reducidos» (ya lo hacían con `prefers-reduced-motion`).
  - Rotativo de la autobomba (`world/EmergencyView.ts`): es sólo visual (la fase la dicen llamas, chorro y gente); con «Reducidos», fijo encendido con su color.
  - Farolas de la portada (`ui/TitleScene.ts`), dos parpadeos al encenderse: con «Reducidos», se encienden sin parpadeo. Lee el atributo del documento, así que respeta también la vista previa sin guardar.
  - **Excluidos**: `SignalView` (semáforos/señales) y `Train` (luces del tren), porque transmiten estado de juego.

## Diferencias con la referencia visual

Sin pestañas ni selectores anterior/siguiente: cada preferencia es un grupo de botones con `aria-pressed`, el patrón que ya usan sonido y calidad. El elegido lleva «✓ » delante (no sólo color).

## Alcance y valores

| Preferencia | Valores | Efecto |
|---|---|---|
| Tamaño de texto | Normal / Grande | +3–4 px en diálogo, menús (incluida la bolsa, que usa `ui/Menu`), aviso `#hint`, megafonía, aviso del móvil y pantalla de inicio; paneles con desplazamiento (70dvh) y sin cortes |
| Contraste de diálogos | Normal / Alto | Diálogo, menús y `#hint`: fondo opaco #0e0f16, borde 2px #efe9df; secundarios a #efe9df; opciones y seleccionada #8fd6cd; seleccionada con raya de 3px y «▸ » |
| Duración de mensajes | Normal / Larga | Megafonía 5 s → 10 s; aviso del móvil 6 s → 12 s. No toca plazos, reloj, metro ni diálogos |
| Pistas de interacción | Visibles / Ocultas | Oculta el icono de acción sobre el jugador/objetivo y las pistas de teclas de diálogo y menú (sólo llevan teclas). `#hint` (precio, sitio, estado) y el botón táctil no se tocan |
| Parpadeos | Normales / Reducidos | Ver auditoría; en OR con `prefers-reduced-motion` |

## Reglas de vista previa, cancelar, guardar, restaurar y Escape

- Pulsar un valor cambia el borrador y lo aplica al documento (vista previa); no escribe nada. Mientras difiera de lo guardado se ve «Cambios sin guardar».
- **Guardar** escribe y confirma («Ajustes guardados.»). Si el navegador no deja, lo dice y la vista previa sigue sin tocar lo confirmado.
- **Cancelar**, **Volver**, **Escape** y cualquier otra salida de Ajustes: el borrador vuelve a lo confirmado y se reaplica. Nunca guardan.
- **Restaurar predeterminados** pide confirmación (alertdialog); «Sí, restaurar» pone los predeterminados en el borrador (vista previa) y hace falta Guardar.
- Sonido y calidad siguen como antes: se guardan al momento.
- Foco: tras cada pulsación en Ajustes vuelve al mismo botón; al salir, a «Ajustes».

## Almacenamiento

Clave `lifesim.comfort`, JSON `{"v":1,"text":…,"contrast":…,"messages":…,"hints":…,"flashes":…}`. Se lee campo a campo contra listas cerradas: un valor desconocido vuelve a su predeterminado; JSON roto, otra forma o `v` ≠ 1, todos predeterminados. No está en la partida: guardados viejos y nuevos cargan igual. No toca `lifesim.audio`, `lifesim.quality` ni `lifesim.zoom`.

## Ratios de contraste (WCAG 2.x, sobre #0e0f16, L = 0,0049)

| Color | Uso | Ratio |
|---|---|---|
| #efe9df | texto, secundarios, borde | 15,8:1 |
| #8fd6cd | opciones, seleccionada | 11,5:1 |
| #f0b46a | nombre / título (ámbar) | 10,4:1 |
| rgba(239,233,223,.75) → #b7b3ad | apagada | 9,1:1 |

Recalculados con la fórmula de luminancia relativa; coinciden con los del plan.

## Archivos modificados y motivo

- `src/config/comfort.ts` (nuevo): tipo, validación, carga/guardado, aplicación al documento, confirmado en memoria, `messageMs`.
- `src/title.ts`: vista Ajustes (cinco grupos, muestra, borrador, Guardar/Cancelar/Restaurar, Escape, foco); aplica lo confirmado al arrancar. Corrección (ronda 2): «✓» y `aria-label` en Sonido y Calidad; clase `title__reset`.
- `src/style.css`: reglas `data-comfort-*`, desplazamiento de Ajustes, botones de 44 px, muestra no clicable. Corrección (ronda 2): quitado `min-width:44px` de los botones de Ajustes y añadida la regla `.title__reset`.
- `src/ui/Announcer.ts`, `src/ui/Phone.ts`: duración vía `messageMs`.
- `src/scenes/WorldScene.ts`: icono de acción según «Pistas».
- `src/world/Lighting.ts`, `src/world/EmergencyView.ts`, `src/ui/TitleScene.ts`: parpadeos.
- `src/ui/Menu.ts`: `aria-current` en la opción marcada.
- `scripts/check-comfort.ts` (nuevo): prueba de `comfort.ts` con almacenamiento falso.

## Pasos reproducibles

1. `npm run dev`, inicio → Ajustes.
2. Grande + Alto: la muestra de diálogo cambia; aparece «Cambios sin guardar». Escape: vuelve a Normal, sin escribir (`localStorage['lifesim.comfort']` ausente o igual).
3. Repetir y pulsar Guardar: «Ajustes guardados.»; recargar: siguen.
4. Restaurar predeterminados → Sí: vista previa normal; Cancelar: vuelve lo guardado.
5. Continuar partida: diálogo y menú con letra grande y alto contraste; con Pistas Ocultas no hay icono de acción; megafonía 10 s con Larga; Carmen de noche sin tartamudeo con Reducidos.

## Tabla de aceptación

| Id | Pasos | Esperado | Observado | Estado | Evidencia |
|---|---|---|---|---|---|
| A1 | Grande + Alto en Ajustes | Texto y contraste aplicados | Aplicados | PASS | `comfort.ts:applyComfort`, `style.css`; captura r2-1280-grande-alto; check-comfort |
| A2 | Vista previa sin Guardar | Cambia el documento, no el almacenamiento | dataset cambia, storage idéntico; a 390, `stored` null tras vista previa | PASS | gameplay-qa; medición a 390 |
| A3 | Cancelar / Escape | Restaura lo confirmado | Restauran; foco a Ajustes | PASS | gameplay-qa |
| A4 | Guardar y recargar | Persisten | JSON v1 y recarga coinciden | PASS | e2e save PASS |
| A5 | Guardar | Sólo `lifesim.comfort` | Sólo esa clave; otras idénticas | PASS | check-title-save → 0 |
| A6 | — | — | Conforme | PASS | gameplay-qa |
| A7 | — | — | Conforme | PASS | gameplay-qa |
| A8 | Ajustes a 1280 y 390 | Ningún texto fuera de botón ni panel | Ninguno | PASS | r2-1280-normal, r2-1280-grande-alto, r2-1280-reset, r2-390-grande-alto |
| A9 | Contraste alto | Ratios AA y señal no sólo cromática | #efe9df 15,8:1; #8fd6cd 11,5:1; disabled .75 ≈ 9,1:1 sobre #0e0f16; ✓ y ▸ además del color | PASS | tabla de ratios |
| A10 | Duración Larga | Sólo megafonía y aviso del móvil | `messageMs` sólo en `Announcer.ts:23` y `Phone.ts:405` | PASS | check-comfort |
| A11 | Pistas Ocultas en táctil; E con Ocultas | Sin pistas; E sigue funcionando | Sin ejecución: los eventos sintéticos del especialista no movían al jugador. Por código ningún camino lee `prompt.visible` (`WorldScene:2375/3739`) | NO VERIFICADO | lectura de código |
| A12 | Parpadeos Reducidos | Neón, focos, rotativo y farolas sin parpadeo; señales intactas | Lighting neón y focos, EmergencyView rotativo fijo, farolas de portada; SignalView y Train excluidos | PASS | gameplay-qa |
| A13 | 390×844, Grande + Alto | Objetivos ≥ 44 px, teclado operable | 20 botones, mínimo 94,3×44 px (`getBoundingClientRect`); teclado por gameplay-qa; e2e mobile PASS. El toque sobre Ajustes no se ejecutó | PASS | medición; e2e mobile |
| A14 | Foco | Vuelve al botón pulsado y a Ajustes | Así; tras Continuar el jugador se mueve | PASS | e2e boot-move, save |
| A15 | Datos corruptos / fallo de escritura | Predeterminados; mensaje de error sin falso éxito | check-comfort casos corruptos OK; en navegador, fallo de `setItem` → mensaje correcto, sin «Ajustes guardados.», reintento OK. Corruptos en navegador no ejecutados (bloqueados por el hook de pruebas) | PASS | check-comfort; navegador |
| A16 | build/check/e2e | Sin regresión | Sin regresión salvo metro: primera E falla 4/7 con UXN-01 frente a 1/6 en la base e3a2d88; caso FAIL 2/7 frente a 4/6 (H-005, 16 min). No concluyente | NO VERIFICADO | H-004, H-005 |

## Capturas

- `.autodev/uxn-01/01`..`05`: ronda 1, con defectos de desborde.
- `.autodev/uxn-01/r2-1280-normal`, `r2-1280-grande-alto`, `r2-1280-reset`, `r2-390-grande-alto`: ronda 2, PASS.
- Viewports: 1280×720 DPR 1 y 390×844 DPR 2 móvil táctil emulado (no dispositivo físico). Sin datos personales.

## Build, check y tests

Sobre d25a122:
- `npm run build` → 0
- `npm run check` → 0 (290 s, 2824 líneas)
- `node scripts/check-comfort.ts` → 0 (28 comprobaciones)
- `check-menu`, `check-title-save`, `check-resale` → 0
- `npm run test:e2e` → exit 1: boot-move, collision, npc-tracks, save, mobile, visual PASS; metro FAIL; bike/shift NO VERIFICADO (no obligatorios).

Tras la corrección: build → 0, check-comfort → 0, check-menu → 0, check-title-save → 0, e2e mobile PASS, e2e save PASS.

## Rendimiento

Calle, calidad alta, 10 s quieto: rAF 58–60/s, `perf().over` vacío, heap estable ~270 MB; sin E/S de almacenamiento por frame (`comfortNow` es memoria). NO VERIFICADO: comparación con la base y tamaño del bundle sin medir; no se afirma «sin pérdida de FPS».

## Revisión DeepSeek

NOT EVALUATED: no conectado al flujo.

## git diff --stat

UXN-01, e3a2d88 → árbol, sin contar `docs/AGENT-HARNESS.md` (ajeno):

```
UXN-01.md                    98+
scripts/check-comfort.ts     98+
src/config/comfort.ts       105+
src/scenes/WorldScene.ts      5
src/style.css               110  (+7/-1 de la corrección)
src/title.ts                100  (+6/-3 de la corrección)
src/ui/Announcer.ts           4
src/ui/Menu.ts                2+
src/ui/Phone.ts               3
src/ui/TitleScene.ts          4
src/world/EmergencyView.ts    4
src/world/Lighting.ts         5
```

Total del commit d25a122: 13 archivos, 550+/16-. El commit d25a122 lo pidió el usuario e incluye `docs/AGENT-HARNESS.md`, ajeno al ticket.

## Riesgos

- H-004: falla la primera E del metro; no atribuida al diff.
- A 390 la barra de desplazamiento tapa el borde derecho de MEDIO / ALTO / ✓ ALTA.
- «✓ BAJO» se parte en 2 líneas.
- A 1280×720 con Grande + Alto y el aviso abierto, el panel se desplaza entero.
- La muestra `.title__preview` no se ve sin desplazamiento a 1280×720.
- Sin acceso a Ajustes desde la pausa.
- A11 en táctil, por verificar.
