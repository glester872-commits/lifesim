# LV-05 · Probar, comprar y revender ropa

## Definiciones

1. **Tienda con preview:** Segunda Vuelta (`vuelta`). Moda Central, Retales, Hilo y Decathlon se descartan: `vuelta` tiene probador, percheros y caja reales y es la de reventa. La mecánica de PROBAR es la de cualquier perchero.
2. **Segunda mano:** el interior VUELTA reutilizado, con el flag de datos `buysBack` en `data/retail.ts`. Sin arte nuevo.
3. **Preview:** `GameState._fitting`, en memoria; nunca llega al save (el snapshot escribe el outfit de antes). Se deshace con Esc, Volver, `Menu.close()` (`onClosed`), al abrir otro menú de ropa y al cambiar de escena.
4. **Fórmula:** `min(40, floor(0,4 · pagado), pagado − 0,01)`, en céntimos, sobre lo realmente pagado. Sin registro, 0. Se ve antes de confirmar.
5. **ID:** el id de catálogo de `data/retail.ts`; sobrevive a save, ranura y export. Un duplicado se deduplica y un desconocido se filtra al cargar.
6. **Pieza única:** una por id; la venta elimina la prenda del armario y no hay estado «vendida». Si se recompra, se registra el precio nuevo.
7. **Atomicidad:** funciones puras con validación previa (`buyGarment`, `sellGarment`), aplicadas en un bloque síncrono con `state.as`; mismos cartera, reloj y ledger. Rollback = no aplicar el resultado.
8. **Doble toque:** `PICK_LOCK_MS` en `Menu.confirm` y rechazo por estado en la segunda llamada.
9. **Direcciones:** las cuatro del avatar (izquierda es espejo de derecha), parado y andando.
10. **Saldo:** COMPRAR sale deshabilitado con «No te llega: cuesta X»; el dinero nunca queda negativo. Probar sigue permitido.
11. **Comercio previo:** compra en caja y en perchero, puestos y tiendas. Lo cubren `check-economy`, `check-garments`, `check-supermarket`, `check-department`, `check-street-vendors`, `check-menu` y `check-decathlon`.
12. **Save:** `SAVE_VERSION` sigue en 3; `paid` es un campo aditivo y opcional. Una partida sin la clave carga sin ella y vuelve idéntica; `state.paid` la expone como `{}` y su ropa no se revende.
13. **Dependencias:** LV-02 (ranuras) y ALPHA-09 (safe-areas) existen y se reutilizan. LV-01, LV-03, LV-06, DEC-03 y DEC-04: NO VERIFICADO; ningún sistema paralelo.

## Verificación

Los casos 1-12 se ejecutaron con `node scripts/check-resale.ts` (exit 0). Navegador: Chrome vía DevTools sobre `vite` en dev, contexto aislado, partida nueva. El teletransporte se usó sólo para preparar el escenario.

| caso | pasos | esperado | obtenido | PASS/FAIL/NO VERIFICADO | notas |
| --- | --- | --- | --- | --- | --- |
| 1. Probar no cambia dinero ni save | check-resale (1) y navegador | snapshot con el outfit de antes; dinero igual | Durante la prueba: top en memoria `camiseta-basica`; snapshot y disco con top null, €120, armario y `paid` vacíos | PASS | el check lo mira en el fuente (GameState importa Phaser); la medida real es la del navegador |
| 2. La prueba no persiste al recargar | check-resale (2); navegador: probar, guardar, recargar, Continuar | sin la prenda al recargar | €112,80, armario `[]`, `paid` `{}`, top null, sin prueba, menú cerrado | PASS | |
| 3. Compra cobra una vez | check-resale (3); navegador: doble clic + tercer clic desde preview | una entrada, `paid` registrado | €120→€116, ledger +1, reloj +5 min, `paid` 4, disco igual; reentrada «Ya tienes una igual.», €116 | PASS | |
| 4. Reventa cobra una vez | check-resale (4); navegador: doble clic + tercer clic | segunda llamada rechazada | €108→€109,60, ledger +1 «Venta: Camiseta lisa», armario y `paid` sin ella, disco igual | PASS | |
| 5. Revender no poseída | check-resale (5) | «Eso no es tuyo.» | rechazada | PASS | sólo en el check: la UI no la ofrece |
| 6. Revender ya vendida | check-resale (6) | «Eso no es tuyo.»; recompra admitida | rechazada; recompra admitida | PASS | |
| 7. Arbitraje imposible | check-resale (7) | valor < precio en todo el catálogo; comprar y vender nunca deja más dinero; sin registro, 0 y rechazo | se cumple en todas las prendas de las 20 tiendas | PASS | incluye 3,5 y 7,99 |
| 8. Equipar, retirar, vender puesta | check-resale (8); navegador | la venta vacía el hueco | Camisa puesta vendida: €109,60→€112,80, top null, armario `[]` | PASS | |
| 9. Cartera insuficiente | check-resale (9); navegador con €3 | deshabilitado, sin cambios | COMPRAR `is-disabled`, «No te llega: cuesta €4.», €3, armario y `paid` iguales; Probar no cobra | PASS | el saldo de €3 se fijó a mano como preparación |
| 10. Export/import | check-resale (10) | ids y `paid` idénticos; inválidos filtrados; sin `paid` no adquiere la clave ni revende | se cumple | PASS | por `inspectRaw`; el botón de exportar del título no se pulsó |
| 11. Guardar y cargar | check-resale (11) | SaveSystem y ranura independientes | se cumple | PASS | |
| 12. Control positivo | 4 mutaciones sobre una copia: sin validar posesión, reventa > pagado, sin exigir tique, `paid` siempre | la base pasa; cada mutación falla | base exit 0; «vendió lo que no es suyo», «arbitraje», «vendió sin registro», «un save sin `paid` adquiere la clave» (exit 1) | PASS | |
| Preview en 4 direcciones | navegador: andar con la prenda y componer capturas | la prenda se ve en las 4 | se ve abajo, derecha, arriba e izquierda, parado y andando; `pixelArt: true`, `image-rendering: pixelated` | PASS | capturado con prenda comprada; el preview usa el mismo `setAppearance` |
| Restaurar outfit | navegador: PROBAR y Esc, `Menu.close()`, Volver, abrir armario, cambiar de localización | vuelve el outfit de antes | top null y sin prueba en las cinco vías | PASS | |
| Móvil emulado | Chrome 390×844 DPR 3 táctil: comprar, vender, probar con toques | opciones visibles y tocables | sin scroll horizontal; confirmación sin solapar el HUD; opciones de 36 px | PASS | en el preview el panel bajado cubre el botón táctil de acción, que se transparenta: flujo `menu.peek` previo |
| Teléfono real | | | | NO VERIFICADO | no hay dispositivo en esta sesión |
| Venta con confirmación | navegador: caja, Vender ropa | importe visible antes de VENDER | «CAMISETA LISA · TE DAN €1,60» y «VENDER · te dan €1,60» | PASS | sólo `vuelta` tiene `buysBack`, de 20 tiendas |
| Comercio previo | `npm run check` y compra en caja | sin cambios | 116/116; Camisa €8 en caja: €116→€108, equipada, ledger +1 | PASS | |
| No regresión global | `npm run build` y `npm run check` | sin errores | build exit 0; 116/116 pasos, 0 fallos; consola sin errores | PASS | cámara, zoom e iluminación no se han tocado; sin revisión manual específica de metro |

## Comandos

- `npm run build`: exit 0 (`✓ built in 1.10s`; el aviso de chunks > 500 kB ya existía).
- `npm run check`, comando a comando: `CHECK_TOTAL=116 RAN=116 FAILS=0`. El primer pase dio 1 fallo (`check-regression.ts:147`, `+ paid: {}`), corregido en `parseState` sin tocar ese check.

## Limitaciones

- Una vez, durante la QA y con un menú abierto, el jugador apareció fuera de la tienda sin causa identificada. Con `travel`, `teleport` y `scene.restart` instrumentados y 45 s de espera no se repitió. Sin reproducir.
- La cajera se abrió con E en escritorio. En móvil, el toque de acción llegó a un cliente que se cruzó y la tienda se abrió por código para validar el diseño; los toques sobre las opciones del menú sí fueron reales.
- Sólo se ha probado Segunda Vuelta en navegador; los demás percheros comparten código.
