# LV-02 · Partidas múltiples y recuperación de guardados

5 de noviembre de 2026 · rama `alpha-09-fachada` · sin commit. Entrega parcial según la política del ticket:
Fase 1, multi-ranura (Fase 2), migración (Fase 3) y export/import por ranura (Fase 4) hechos; QA parcial (Fase 5).

## Fase 1 — Auditoría

**Árbol al empezar:** 14 modificados + 4 nuevos, todos de entregas anteriores de esta sesión (ALPHA-09, QA-06, QA-07,
LV-01). Se conservan; LV-02 no los toca salvo lo indicado abajo. HUD móvil: ALPHA-09 aplicado en el árbol, sin commit
(`HEAD` 8e292cb tiene el anterior). Fuente externa (GitHub #limitaciones-actuales): no consultada; se usó `README.md`
local § Limitaciones actuales.

**Persistencia existente** (`src/systems/SaveSystem.ts`): `SaveStorage` (read/write/remove) con `LocalStorageAdapter`;
`SaveSystem.save()` serializa `{version, savedAt, state}`, lo relee con `inspectRaw()` y sólo escribe si cargaría;
`inspectRaw()` valida JSON, versión (≤ `SAVE_VERSION` = 3), `parseState` y `restore`; `migrate()` v1→v2 (identidad) y
v2→v3 (`metroJourney`); `load()` aparta lo ilegible a `.unreadable`; `startNew()` copia a `.backup`; `restoreBackup()`;
`adopt()` (importar, con copia). Pantalla de inicio `src/title.ts`: Continuar / Nueva partida (creador + confirmación con
copia) / Partidas (exportar, importar) / recuperar copia. Una sola ranura (`lifesim.save`).

## Definiciones previas

| Tema | Decisión |
| --- | --- |
| Backend | **localStorage**, el de siempre. Partidas de decenas de KB (tope 5 MB por archivo); escritura síncrona; misma compatibilidad móvil que ya tenía el juego. IndexedDB no aporta nada a este tamaño y obligaría a otro sistema de guardado. |
| Ranura | Una ranura = un `SaveSystem` de siempre sobre su espacio de claves (`systems/SaveSlots.ts`, adaptador `slotStorage`). Ranura 1 = `lifesim.save` (+ `.backup`, `.unreadable`); ranura n = `lifesim.save.slot<n>` (+ los mismos sufijos). |
| Esquema | Archivo (sin cambios, versión 3): `version` (número, obligatorio salvo legado = 1), `savedAt` (ms, opcional), `state` (obligatorio). Resumen por ranura `….meta`: `name`, `savedAt`, `day`, `hour`, `minute`, `locationId`, `money`, `version`, `checksum` (todos obligatorios). `id` = posición (1–3), no va en el archivo. `playtimeSeconds` **no existe**: se enseña el tiempo de juego (día y hora del mundo); contar tiempo real exigiría un campo nuevo y subir la versión. |
| Migración | vN→vN+1: `migrate()` existente. Versión futura: ilegible, se aparta a `.unreadable` y no se pisa. Legado sin versión: se lee como 1. **La partida que ya había es la ranura 1 sin copiarla ni reescribirla**: no hay paso de migración que pueda fallar ni nada que deshacer. |
| Partida sana | `inspectRaw(raw).status === 'ok'` (JSON, versión soportada, estado completo, `restore` sin fallo) y, si hay resumen, `checksum(raw)` igual al suyo. |
| Estado en la lista | «Vacía» (no hay texto), «Guardada» (resumen con la misma suma), «Guardada (sin verificar)» (sana pero el resumen no se pudo reescribir), «Dañada: no se puede cargar». «Migrando» no aplica (no hay migración que tarde). |
| Atomicidad | `localStorage.setItem` sustituye el valor entero o lanza (no deja medio valor). La partida se escribe antes que su resumen; si se corta entre las dos, la suma no coincide y la lista rehace el resumen desde la partida. `save()` sigue sin escribir nada que no cargaría. |
| Cuota | `QuotaExceededError` → `save()` devuelve false y la partida buena sigue; la pausa dice «No se ha podido guardar…»; «Nueva partida» e importar piden confirmar sin copia si la copia no cabe (flujo existente). `navigator.storage.estimate()` no se usa. |
| Sin almacenamiento | `gameStorage()` prueba a escribir; si no puede (incógnito estricto, bloqueado), usa memoria y la pantalla de inicio avisa: «Este navegador no deja guardar… al cerrar o recargar la página se pierde la partida». Se puede jugar. |
| Doble ejecución | Pantalla de inicio: candado `busy` en las acciones que escriben y `booting` en arrancar. Pausa: guardada una vez en esa pausa, «Guardar» no vuelve a escribir (la partida no cambia en pausa). |
| Compartido / por ranura | Compartido: sonido, calidad, zoom, ranura activa (`lifesim.activeSlot`). Por ranura: partida, copia, ilegible, resumen. |
| Continuar / Nueva | Continuar abre la última ranura activa. Nueva partida propone la primera vacía; elegir una ocupada enseña lo que se sustituye y guarda copia en esa ranura. |
| Export/import | Exporta el archivo tal cual (versión, fecha, estado), sin metadatos de ranura. Importar va a la ranura elegida («Importar aquí»), valida antes, y copia lo que hubiera a la copia de esa ranura. Sin `id` en el archivo: no hay duplicados. |
| Transacciones | El guardado es una foto síncrona del estado: una compra o nómina ya aplicada está entera en la foto, una no aplicada no está. No hay journal; nóminas y cuentas son idempotentes por su propio estado (`check-household`, `check-persistence`). |

## Archivos

| Archivo | Cambio |
| --- | --- |
| `src/systems/SaveSlots.ts` (nuevo) | Ranuras, resumen con suma, ranura activa, memoria si no hay almacenamiento |
| `src/main.ts` | La partida abre y guarda la ranura activa |
| `src/title.ts` | Lista de ranuras (estado, vista previa, usar, exportar, importar aquí), elegir ranura en Nueva partida, candado contra doble toque, aviso sin almacenamiento |
| `src/ui/PauseMenu.ts` | «Guardar» no escribe dos veces en la misma pausa |
| `src/style.css` | Lista de ranuras sin tarjetas |
| `scripts/check-save-slots.ts` (nuevo) + `package.json` | Comprobación, en `npm run check` |

## Pruebas

| Prueba | Resultado | Evidencia |
| --- | --- | --- |
| Alternar A/B/C, independencia | **PASS** | `check-save-slots` (2): guardar la 2 no cambia 1 ni 3; cada una carga lo suyo. Navegador: nueva en la 2, recargar, usar la 1 → carga día 11 Casco Antiguo; la 2 intacta |
| Partida heredada intacta | **PASS** | `check-save-slots` (1): la ranura 1 lee igual que sin ranuras (estado restaurado idéntico) y no reescribe. Navegador: `lifesim.save` byte a byte igual tras crear la ranura 2 |
| Recargar con partida en curso | **PASS** | Navegador: tras recargar, «Ranura 2» y su partida; sin claves duplicadas |
| Corrupción + recuperación | **PASS** | `check-save-slots` (3, 4): ranura dañada → «Dañada», las otras «Guardada»; copia de la 2 recuperada, la dañada apartada, la 1 sin tocar |
| Import dañado | **PASS** | `check-save-slots` (5): 5 archivos malos rechazados, almacenamiento idéntico |
| Cuota llena | **PASS** (simulada) | `check-save-slots` (6): `QuotaExceededError` → `save()` false, partida buena intacta |
| Sin almacenamiento | **PASS** (unidad) / **NO VERIFICADO** en navegador | `storageWorks()` detecta; incógnito real no probado |
| Doble toque | **PASS** (navegador, inicio) / código (pausa) | Doble clic en «Empezar»: un arranque. Pausa: guarda una vez por pausa |
| Transacciones idempotentes | **PASS** por tests existentes | `check-household`, `check-persistence`, `check-save-torture` en `npm run check` |
| Nueva partida en ranura ocupada | **PASS** | Navegador: enseña lo que se sustituye, «Descargar copia», «Empezar de cero» |
| Móvil 390×844 (emulado) | **PASS** | Partidas: botones ≥ 44 px, sin desbordamiento. Teléfono real: NO VERIFICADO |
| Regresión cámara/zoom/HUD/pixel art | **PASS** | Sin cambios en esos archivos por LV-02; `npm run build` y `npm run check` |
| Control positivo del check | **PASS** | Con `slotKey` devolviendo la misma clave, `check-save-slots` falla (exit 1); restaurado, pasa |

Navegador: Chrome (DevTools MCP), contexto aislado, 1440×900 y 390×844@3 emulado. Teléfono físico: NO VERIFICADO.

## Comandos

- `npm run build`: `tsc && vite build` → «✓ built» (exit 0; sólo el aviso de tamaño de paquete de siempre).
- `npm run check`: lanzado entero, se colgó en `cmd.exe` tras el primer script (`check-world` OK, sin proceso hijo
  durante 8 min), el cuelgue ya anotado en `.claude/coord/RULES_CORE.md`. Se paró y se ejecutó la misma cadena de
  `package.json` **comando a comando** desde bash: **116 de 116 con exit 0**, incluido
  `check-save-slots: OK — ranura 1 = partida de siempre (sin reescribir), 3 ranuras independientes, …`.

## Límites

- Sin `playtimeSeconds` real (ver esquema). Sin borrar ranura (no pedido; no se añade un botón sin uso probado).
- Una ranura activa a la vez; dos pestañas abiertas con ranuras distintas no están protegidas entre sí (como antes).
- Sin almacenamiento, la partida en memoria se pierde al recargar (se avisa).
