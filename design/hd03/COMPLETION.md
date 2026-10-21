# HD-03 · cierre de integración · 21 de octubre de 2026

## Recuperación

Se parte de `5c16f6c` en la rama local `hd-03`, seis commits por delante de
`origin/main`. Se conservan los 24 archivos con cambios sin publicar, incluido
`world/LightDepth.ts`. La entrega se prepara en `codex/finish-hd03-2026-10-21`.
La copia local original no se modifica. La antigua rama remota de Claude es de
octubre de 2026 anterior a este trabajo; no se mezcla su dirección visual con HD-03.

## Decisiones cerradas

- Personas: celda de 16 × 24 y escala 1, incluida la ropa detallada. El contorno
  y los detalles de prendas se dibujan a esa resolución. Se mantienen las
  complexiones y alturas existentes, sin escalado fraccionario del sprite.
- Movimiento: pasos, carrera, reposo, conversación y posturas comparten la misma
  densidad. El atlas se divide en páginas de como máximo 4096 px por lado;
  el acabado se hornea progresivamente y se conserva la caché con retenciones.
- Peleas: diez poses por perfil, celda de 24 × 28 con margen alrededor de la
  persona de 16 × 24. La complexión sale del dibujo, sin estirar la textura.
  No se cambian apuestas, reglas, participantes, colisiones ni ciclo del evento.
- Luces: `LightDepth` compone por profundidad de atrás hacia delante. Las
  siluetas borran únicamente las luces que quedan detrás. Una luz intermedia
  puede verse sobre la persona del fondo y quedar tapada por la de delante.
  Los emisivos del propio objeto sobreviven cuando tienen el mismo pie.
- Recortes: se elimina la máscara estática de ventanas. El compositor usa la
  silueta visible actual, incluida su transparencia y la textura de las rachas
  de viento; no deja un hueco permanente recortado contra la fachada.
- Continuidad: Vallesco usa `finish: true` en todo el mapa, sin rectángulo piloto
  ni cambio de material en x=58. El acabado compartido también está activo en
  Ribera, Cuatro Ríos, Velaria, Puerta Central y Arena.
- Identidad: se reutilizan materiales, vegetación y mobiliario HD-03; permanecen
  las paletas de zona, geometría, edificios y contenidos propios de cada barrio.
  No se convierten todas las fachadas en la fachada piloto de Olmo 11.

## Verificación reproducible

```powershell
npm run build
npm run check
npm run dev
# En otra terminal, con Playwright disponible:
node scripts/hd03/verify.cjs
```

`verify.cjs` admite `PLAYWRIGHT_MODULE` (módulo Playwright ya instalado),
`HD03_BROWSER` (canal del navegador, por defecto `msedge`), `HD03_URL` y
`HD03_OUTPUT` (por defecto `work/hd03`). `HD03_FOCUS=1` omite las capturas de
los seis mapas y las vistas cercanas para repetir sólo las regresiones.
No necesita modificar una partida real: usa contextos con almacenamiento aislado.

La comprobación captura los seis exteriores a las 14:00 y 23:00, las vistas
cercanas de la costura, la cafetería y Olmo, el interior de casa y la pelea.
Comprueba escala 1 en personas y luchadores; prueba caminar con teclas, entrar
y salir con E y guardar/recargar conservando ubicación, dinero y energía.
La regresión GPU mide alfa en luz oculta, intermedia, a igual pie, tras un
objeto semitransparente y tras moverlo, y comprueba que componer no crea más
objetos. Incluye móvil emulado de 390 × 844 a 2×, día/noche y mapa táctil.

La preparación de hora y posición usa depuración; caminar, puertas y mapa se
accionan mediante teclado o toque. No equivale a una sesión larga de juego ni
a probar un teléfono físico. La comprobación completa del mundo cubre los
sistemas funcionales y sus simulaciones; este cambio no altera reglas ni guardado.

La compilación mantiene el aviso de Vite por el tamaño del bundle principal.
Las capturas son evidencias de pruebas y no nuevos assets binarios del juego.

## Resultado de esta entrega

- `npm run build`: OK, TypeScript y bundle de producción.
- `npm run check`: OK, dos ejecuciones completas, incluidas simulaciones del
  metro, guardado, economía, empleo, población, navegación y eventos.
- `node scripts/hd03/verify.cjs`: OK, 12 escenarios barrio/hora más interacción,
  pelea, regresión GPU y móvil; sin errores de consola o excepciones del navegador.
- Regresión GPU: alfa 0 con persona delante, 255 para luz intermedia visible,
  0 tras persona del fondo, 255 a igual pie, 128 con transparencia de 0,5 y 255
  tras apartar el objeto. Sin crecimiento de objetos por composición.
- Revisión visual: día y noche en los seis barrios; detalle de Olmo, cafetería,
  x=58, paredes de casa, pelea y móvil emulado. Se conserva la identidad de cada
  barrio y no aparece el límite rectangular del piloto.
- `git diff --check`: OK. Detector de diseño sobre los renderizadores: sin hallazgos.
