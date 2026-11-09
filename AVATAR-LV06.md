# LV-06 · Avatar: accesorios y barbería

Accesorios, barbería, trabajos de tatuaje (retocar, cubrir, eliminar) y preview antes/después con confirmación previa al cobro.

- **D1 Familia.** Gafas (3 variantes) y gorras (2), ya existentes; gafas primero porque varían en cristal y montura. Sin familia nueva.
- **D2 Modelo mapeado a lo existente, sin tipo nuevo.** id = `GarmentDef.id`; family = `GarmentDef.slot`; variant = `lens` y `color`; layer = orden de llamadas en `HumanArt`; occlusion = ese orden más `visibleTattoos`; spriteByDirection = ramas de `face`, `hat` y perfil (izquierda es espejo; up no pinta gafas); obtainableFrom = `STORES[].stock`; equipable = slot no nulo.
- **D3 Capas de abajo arriba.** Piel, tatuaje, ropa, cara y gafas, pelo, gorra, capucha, bufanda. Pelo largo + gorra: la gorra tapa la coronilla y el largo sigue debajo. Gafas + pelo: el pelo no invade x 5-10 de la cara. Tatuaje + manga: lo decide `hiddenBy`; la bufanda tapa el cuello. Con uniforme: sin gorra ni bufanda, con gafas (la apariencia guardada no cambia).
- **D4 Obtención.** Puestos callejeros con `buyGarment`; equipar y quitar en el armario de casa, gratis, 2 min.
- **D5 Barbería.** Existe. Corte a igual o menor longitud a precio base; alargar es «Extensiones» y rizar es «Permanente», al doble de precio y minutos, porque el pelo no crece en el juego y prohibirlo dejaría un callejón sin salida. Tinte: cualquier color de pelo de los datos. No cambia ojos ni tono de piel: no hay servicio coherente; siguen en Nueva partida.
- **D6 Tatuaje mapeado.** id = zona + diseño; zone = `TattooZone`; style, price y duration (minutes) = `TattooDesign`; visibilityUnderClothing = `ZoneDef.hiddenBy` más bufanda; isRemovable = sí. Zonas: brazo = forearm-r, forearm-l y hand-r; pierna = calf; espalda = back; cuello = neck; pecho = chest (por saves). Cara: NO se añade: la cara útil son 6x4 píxeles que ya ocupan ojos, gafas y piercing, y un píxel de tinta se leería como defecto.
- **D7 Estudio.** Con confirmación de precio, duración y efecto antes de cobrar: retoque = otro diseño del mismo estilo en esa zona, 50 % del precio y minutos destino; cobertura = diseño de tinta más oscura admitido en la zona, 120 % del precio destino y sus minutos; eliminación = 150 % del precio del original y doble de minutos, irreversible, una sesión. Heredados: el precio sale del catálogo por design; duplicados en una zona se eliminan todos.
- **D8 Preview.** 4 direcciones, factor entero 4 (3 en pantallas de menos de 360 px de ancho o de 480 de alto, porque a 4 el panel no cabe), `imageSmoothingEnabled` false, sobre suelo claro `#b8b0a2` y `PALETTE.night`, dentro del panel de menú; sin cámara ni zoom. Con ancho para ello, cada dirección sobre los dos suelos; en estrecho, dos direcciones sobre cada suelo. Legibilidad: antes y después lado a lado y al menos 2 píxeles con distancia RGB >= 48 en cada dirección en que el accesorio se ve, medido siempre sobre los dos suelos; si no, se declara no legible. Sale en barbería, tinte, estudio y accesorios de puesto; en los percheros sigue el probador (PROBAR).
- **D9 Escala y 16x24.** El sprite real es 16x24 a escala 1 (`PLAYER_W`, `PLAYER_H`; `drawPersonFine`); no 28x42. Hitbox 10x8. No se prometen formas de ojos nuevas: no hay píxeles para distinguirlas.
- **D10 Sin doble cobro.** Validación pura previa, `PICK_LOCK_MS` y rechazo por estado.
- **D11 Save.** Sin subida de versión; `SAVE_VERSION` sigue en 3; compatibilidad LV-02 por `slotSave`.
- **D12 Dependencias.** LV-05 sin commit, base; LV-02 y ALPHA-09 reales; DEC-01, DEC-03 y DEC-05 sin referencia en el repo, NO VERIFICADO.
- **D13 Rollback.** Se revierte el cambio si rompe pixel art, save, hitbox o HUD.

| caso | escala | nitidez | hitbox | clipping | PASS/FAIL/NO VERIFICADO | notas |
| --- | --- | --- | --- | --- | --- | --- |
| caminata | 16×24, escala 1 | correcta en captura | 10×8 | ninguno visible | PASS | Navegador, con gafas, gorra y bufanda: teclado real, 76 px/s, poses de andar; se para contra la fachada. |
| gimnasio | 16×24, escala 1 | correcta en captura | 10×8 | ninguno visible | PASS | Navegador; se llegó con teleport de prueba, no a pie. Sin NPC interactivo ni entreno ejecutado. |
| interiores | 16×24, escala 1 | correcta en captura | 10×8 | ninguno visible | PASS | Navegador: entrar en casa y salir a la calle por el portal con E; estación de metro y viaje a Ribera. |
| catálogo | factor 4 (3 en pantalla pequeña) | entera, sin suavizado | no aplica | ninguno | PASS | Navegador: preview en 1 viewport de escritorio y 3 de móvil. En 640×360 el fondo del panel se sale 11 px por arriba y por abajo; el contenido se lee. |
| cargas |  |  | sin cambios (10×8, check-avatar) |  | PASS | Navegador: aspecto, armario y precio pagado tras recargar y Continuar. Tatuaje eliminado: check-avatar. |
| conversiones |  |  |  |  | PASS | check-avatar: versiones 1 y 2 conservan accesorios; ranuras separadas. |
