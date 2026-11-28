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
- `src/title.ts`: vista Ajustes (cinco grupos, muestra, borrador, Guardar/Cancelar/Restaurar, Escape, foco); aplica lo confirmado al arrancar.
- `src/style.css`: reglas `data-comfort-*`, desplazamiento de Ajustes, botones de 44 px, muestra no clicable.
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

PENDIENTE (lo rellena el coordinador)

## Capturas

PENDIENTE (lo rellena el coordinador)

## Build, check y tests

PENDIENTE (lo rellena el coordinador)

## Rendimiento

PENDIENTE (lo rellena el coordinador)

## Revisión DeepSeek

PENDIENTE (lo rellena el coordinador) · NOT EVALUATED: no conectado.

## git diff --stat

PENDIENTE (lo rellena el coordinador)

## Riesgos

PENDIENTE (lo rellena el coordinador)
