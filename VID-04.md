# VID-04 · Atender a un cliente (Decathlon)

## 1. Resumen

Elegimos la atención al cliente en Decathlon como minijuego del turno. No es un menú con otro nombre:

- Se entrega llevando una tarjeta de la estantería a la zona del cliente, arrastrándola o con tap-tap (tocar la tarjeta y luego al cliente). Con teclado: ◀ ▶ y E.
- Son 3 rondas de 15 s cada una, con una barra de paciencia que baja en tiempo real. Si llega a cero, el cliente se cansa y la ronda se pierde.
- Tras cada entrega hay un bloqueo de 400 ms: no se puede encadenar entregas a ciegas.
- Cada entrega se puntúa con tolerancia: exacta (3), casi (1) o fallo (0). Una exacta con más del 40 % de paciencia suma +1 por rapidez. El máximo son 12 puntos.

## 2. Bucle

Inicio (el cliente y su frase) → 3 pasos (pista → entrega) → comprobación (`AttentionRun.deliver`) → feedback (● / ◐ / ✕ en la tarjeta, más color y la respuesta del cliente) → recompensa.

La recompensa es la nota del turno, que pasa por `work()` como cualquier otra elección:

| Nota | Puntos | Efecto |
|---|---|---|
| Excelente | ≥ 10/12 | +6 € de bonus y turno bueno |
| Correcta | 5–9 | turno normal, +5 min |
| Floja | 0–4 | score −1, +20 min |
| Abandono | — | nada: ni sueldo, ni tiempo, ni turno consumido |

## 3. Componente reutilizable

- `src/data/customerService.ts`: los casos, los tiempos, los puntos y las notas. Solo datos.
- `src/systems/CustomerService.ts`: `AttentionRun`, `pickCase`, `shelfOrder`, `gradeOf` y `choiceFor`. Lógica pura, sin DOM ni Phaser; la prueba `scripts/check-atencion-cliente.ts`.
- `src/ui/AttentionPanel.ts`: el panel DOM, sin framework. Arrastre, tap-tap y teclado; los callbacks `onDone`/`onCancel` se llaman una sola vez.
- `job.minigame` en `data/jobs.ts`: activar el minijuego en otro empleo es un dato. `Menus.shiftDecision` añade la opción, y la parte común del fichaje está en `clockIn`.

## 4. Tabla QA

| Caso | Pasos | Esperado | Observado | Resultado | Notas |
|---|---|---|---|---|---|
| 1 · Entrar desde el fichaje real y volver | Contratarse en Decathlon, «Fichar», «Atender a un cliente», terminar o dejarlo | Mundo y reloj parados; al cerrar, todo sigue | Reloj congelado en 10:01, jugador quieto; al cerrar, busy:false y el jugador anda | PASS | |
| 2a · Excelente | 3 entregas exactas y rápidas | Nota excelente, bonus y turno bueno | 12/12, dinero 180→246, reputación 3→6, score 2, diálogo «Atención al cliente excelente: 12/12.» | PASS | |
| 2b · Flojo | Fallos con tap-tap + arrastre + timeout | Nota floja, sin bonus y +20 min | 0/12, +60 € sin bonus, 6 h 20 min, score 0, diálogo distinto | PASS | |
| 3a · Esc y «Dejarlo» | Abrir y abandonar | Ni paga, ni tiempo, ni turno consumido | Igual; al reintentar, el mismo cliente | PASS | |
| 3b · Doble Enter | Enter dos veces al cerrar | Un solo resultado | Un solo movimiento en el ledger | PASS | |
| 3c · Pausa y pestaña oculta | Pausar u ocultar la pestaña con el panel abierto | La paciencia no corre | — | NO VERIFICADO | `tick` limita delta a 100 ms |
| 3d · M y P | Pulsar M y P con el panel abierto | No se abren ni el mapa ni el móvil | No se abren | PASS | |
| 4a · Teclado | Flechas y Enter/E | Seleccionar y entregar | Funciona | PASS | |
| 4b · Ratón, arrastre | Arrastrar la tarjeta a la zona del cliente | Entrega | Entrega | PASS | PointerEvent sintéticos |
| 4c · Tap-tap | Tocar la tarjeta y luego al cliente | Entrega | Entrega | PASS | |
| 4d · Táctil 390×844 | Taps CDP reales en emulación | Entrega sin desbordes | Entrega ◐, onDone una sola vez, sin scroll horizontal | PASS | |
| 5 · Recompensa real | Turno excelente | El sueldo con bonus queda en el ledger | «Sueldo» +66 € | PASS | |
| 6 · Sin regresiones | Opción normal del turno, consola, rendimiento, visual | Igual que antes | Paga 60 € y dura 6 h; consola limpia; 59-60 fps con el panel abierto; abrir y cerrar 10 veces deja 22 nodos estables; visual-qa PASS tras la corrección 2 (fondo opaco, z-index 7, ayuda sin cortar) | PASS | |

## 5. Salida de build y check

- `npm run build`: exit 0 («✓ built in 1.31s» y el aviso preexistente de chunk >500 kB).
- Checks dirigidos, todos con exit 0: `check-atencion-cliente` ok, `check-jobs`, `check-decathlon`, `check-store-knowledge`, `check-decathlon-sport`, `check-interaction` y `check-life-projects`.
- Cadena completa: TOTAL=160, FAILS=1. El fallo es `check-regression`, que ya fallaba en la base a5ecb3d.

## 6. DeepSeek

NO EVALUADO.

## 7. git diff --stat

Nuevos (sin trackear):

- `src/data/customerService.ts`
- `src/systems/CustomerService.ts`
- `src/ui/AttentionPanel.ts`
- `scripts/check-atencion-cliente.ts`

Modificados:

- `src/data/jobs.ts`
- `src/scenes/Menus.ts`
- `src/scenes/WorldScene.ts`
- `src/main.ts`
- `src/services.ts`
- `index.html`
- `src/style.css`
- `package.json`

Aviso: el stat acumula también los cambios de LOC-01 y VID-01/02/03, que tampoco están commiteados. Varios de estos archivos llevan hunks de esas tareas.

## 8. Correcciones

- 1/2: TS6133 por un `id` sin usar en `AttentionPanel.renderRound`. Se cambió por `_`.
- 2/2: en el móvil el panel no era opaco y el texto de la guía se transparentaba en la cabecera. Ahora `.kick.attn` lleva `background: var(--ink)` y `z-index: 7`. Además, la ayuda se cortaba contra «Dejarlo»: ahora tiene `min-width: 0`, salta de línea con opacidad 0.85, y el botón lleva `flex-shrink: 0`.

## 9. Riesgos

- Si el turno deja de ser válido al terminar la atención (contrato cambiado o turno ya hecho), se pierde el resultado sin pagar y en silencio.
- El color de fallo `#e07a6a` está como literal: no existe una variable de rojo.
- La pausa y la pestaña oculta con el panel abierto quedan NO VERIFICADAS.
- Una vez se vio el sonido pasar de «bajo» a «apagado» y no se pudo reproducir.
- Los PointerEvent de escritorio fueron sintéticos.
- Vehicles 26/24 venía de antes.

## 10. Rollback

1. Borrar los 4 archivos nuevos (sección 7).
2. Revertir los hunks de VID-04:
   - `src/data/jobs.ts`: `minigame`.
   - `src/scenes/Menus.ts`: la opción y `clockIn`.
   - `src/scenes/WorldScene.ts`: el bloque `attention` y `attention.close()`.
   - `src/main.ts`: el import, `attention:` y `|| services.attention.isOpen`.
   - `src/services.ts`: el tipo.
   - `index.html`: `#attention-panel`.
   - `src/style.css`: el bloque `.attn`.
   - `package.json`: el check.

No hay migración de guardado: el save no cambia.
