# HD-01 — resultado de la vista previa local

Base conservada: `4232cda`. Sin commit, staging, push ni despliegue.
Dirección e invariantes fijados antes de tocar render: `DIRECTION.md`.

## Qué cambió

`MaterialFinish.ts` añade relieve en uniones de materiales ya dibujadas: sólo
fronteras interiores continuas, con color acotado a ±5/7/10 por canal según piedra,
madera o metal. No crea líneas fuera de las formas, grano, halos, texturas mayores
ni un motor de calidad alternativo. Los contornos oscuros y el alfa se conservan.

`paint.make` permite optar expresamente por ese acabado al hornear. Las fábricas
compartidas lo activan en fachadas/puertas, mobiliario seleccionado, coches/buses,
vagones/hojas del metro, asientos de estadio y algunos elementos metálicos. No se
hace trabajo adicional por frame. Luz y sombras: el mapa nativo high usa NEAREST;
los mapas reducidos low/medium y los halos suaves conservan su tratamiento.

El resultado es un acabado deliberadamente discreto, visible sobre todo en marcos,
carpintería y separación de planos. No se presenta como un rediseño ni una subida
global de resolución. La UI y el encuadre no cambian.

## Cobertura final

| Familia existente | Resultado / motivo de conservación |
| --- | --- |
| Jugador | Se conservan sus 112 texturas de pose/dirección píxel a píxel; mismo cuerpo físico 10×8 |
| NPC y ropa | HumanArtHD/Garments/HdCache conservados; prendas, piel, memoria y fallback existentes |
| Edificios | Relieve interior de marcos, puertas y uniones; ninguna ventana ni forma añadida |
| Interiores | Relieve de carpintería y mobiliario; misma distribución y colisiones |
| Pavimentos/carreteras | Conservados: ya tienen materiales horneados y juntas continuas; sin más ruido |
| Vegetación | Conservada: copas/racimos y troncos ya definidos; no cambiar su silueta |
| Props | Acabado en madera/metal seleccionados; iconos y objetos delicados excluidos |
| Coches/buses | Relieve de carrocería y cristales existentes; mismas ruedas y siluetas |
| Bicis/otros transportes | Conservados: escala y animaciones existentes, sin tipos nuevos |
| Metro | Acabado de vagones y hojas; embarque y cobro comprobados |
| Estadio/campo/público | Acabado de asientos/metal; campo, balón, futbolistas y público conservados y visibles |
| Señalética/textos | Conservados; no aplicar relieve a glifos ni luces emisivas |
| Luz/sombras | Muestreo nativo nítido en high; mismo color/intensidad y fuentes |
| Clima/reflejos | Conservados; comparación de noche y lluvia |
| Partículas | Conservadas: mismo presupuesto, tamaño y animaciones |
| HUD/menús | Conservados; lectura y controles revisados en 390×844 |

No fue necesario crear una familia ausente para completar la matriz.

## Referencias y comparación

Se capturaron antes y después calle residencial, zona comercial, interior, metro,
estadio, noche y lluvia. Semilla 103, calidad high, viewport 1100×680, DPR nativo 1,
misma posición/cámara, hora y clima. El campo tiene además una captura suplementaria.
`compare.html` superpone las capturas con un deslizador a la misma escala.

El comparador de inventarios verifica entre 2.043 y 2.100 texturas por escenario:
ninguna deriva de dimensiones o máscara alfa; las 112 del jugador conservan también
RGB. Cambian 1.584 recursos de material del inventario global (no todos están visibles
a la vez). Esos hashes no sustituyen la inspección visual, que también se realizó.
Las fases de animación de NPC, vehículos o partículas pueden diferir entre capturas.

Evidencias externas, no assets binarios añadidos al juego:
`C:\Users\glest\.codex\visualizations\2026\10\20\01a1592e-ca76-7530-bf16-240a1fb089c6\hd01`

## Mediciones comparables

Motor de navegador integrado, escritorio Windows, DPR nativo observado 1.
115 muestras después de calentamiento, pasos deterministas de 16 ms.
Se mide trabajo CPU de actualización + envío de render, no latencia GPU ni FPS
presentados. La pestaña integrada limita la medición fiable de presentación, por
lo que no se inventa una cifra de FPS. Valores mediana / p95 / p99, en ms:

| Escena | Antes CPU | Después CPU | MiB de texturas estimados, iguales antes/después |
| --- | --- | --- | --- |
| residential | 0.8 / 1.2 / 1.6 | 0.9 / 1.2 / 1.7 | 80.86 |
| commercial | 0.7 / 1 / 1.4 | 0.8 / 1.2 / 1.5 | 82.37 |
| interior | 0.2 / 0.3 / 0.5 | 0.1 / 0.3 / 0.3 | 75.74 |
| metro | 0.2 / 0.3 / 0.4 | 0.2 / 0.3 / 0.4 | 80.77 |
| stadium | 0.8 / 1.1 / 1.3 | 0.9 / 1.1 / 1.2 | 82.34 |
| night | 1 / 1.5 / 1.7 | 1 / 1.5 / 1.7 | 81.26 |
| rain | 0.8 / 1.2 / 1.5 | 0.9 / 1.3 / 1.4 | 81.21 |

No se afirma una optimización de FPS. Las variaciones son pequeñas y esta muestra
no acredita rendimiento de un teléfono real. La memoria se estima como ancho×alto×4
por fuente; no es memoria GPU medida y no incluye todos los buffers del controlador.

Diez vueltas por casa → estación → calle: caché HD estabilizada en 24.761.856 bytes
(23,62 MiB), bajo su presupuesto de 24 MiB; las últimas cuatro vueltas mantienen el
mismo tamaño y cero horneados pendientes. El número de objetos por sitio se mantiene
172 / 185 / 1.096. Las texturas de escena suben/bajan al crear/destruir las de cada
sitio; el conjunto retenido se estabiliza.

Las transiciones con 130 frames de calentamiento incluidos tardaron aproximadamente
30–80 ms en casa, 29–697 ms en estación y 670–802 ms en calle. No son una medida
pura de carga ni una comparación de mejora respecto al original: incluyen la
simulación y el horneado de los NPC encontrados. No se baja población para mejorar
las cifras. Los tiempos de primera apertura del visor no se usan como benchmark.

## Pruebas y resultados

- `npm run check`: los 84 comandos pasan; salida `checks.log`, unos 200 s según las
  marcas de creación/cierre del log. Incluye mundo, guardados, ropa, escala, caché,
  navegación, metro y estadio.
- `npm run build`: pasa; salida `build.log`. Se mantiene el aviso previo de bundle grande.
- Focalizadas: material-finish, shading, hd-cache, garments y scale, correctas.
- El test nuevo protege alfa, transparencia parcial, tinta, superficies lisas,
  color acotado, dirección de luz y ausencia de ruido/seams añadidos.
- Caminar con teclado en cuatro direcciones: desplazamiento y textura correctos;
  cuerpo físico 10×8 intacto. E entra en casa y vuelve a la calle.
- Metro: esperar tren, subir, elegir Ribera Norte, llegar a ribera-station; tarjeta
  de prueba €20 → €18, sin menú o diálogo atascado.
- Low → medium → high, tres veces en la misma partida: texturas válidas y cero
  pendientes; el último ciclo queda estable en 2.256 texturas.
- Pantalla estrecha 390×844: HUD, acción/joystick táctiles y botones legibles.
- DPR 1 real observado; 1,25 y 2 EMULADOS en el punto de entrada de pruebas, sin
  cambiar el juego normal. Canvas resultantes 390×844, 488×1.055 y 780×1.688.
- Copia sintética de guardado anterior sin agenda: recarga con cero diferencias
  en dinero, energía, inventario, tarjetas, vivienda, fitness, relaciones, ropa,
  estudios, empleo e historias. No se toca una partida personal.
- Las capturas y las pruebas de juego se hicieron tras compilar el acabado; la
  revisión final vuelve a abrir el juego después del build final.

## Límites explícitos

No se probaron teléfono físico, cambio real entre monitores de distinto DPR, cada
prenda y pose manualmente ni todas las variaciones de clima. La ropa/poses se cubren
además mediante inventarios y tests. No se mide memoria GPU real ni frametime de
presentación; no se afirma ausencia de cualquier frame vacío fuera de los recorridos
observados. Las comparaciones suplementarias de DPR son emulación, no hardware.

## Ver y continuar

Visor local: `http://127.0.0.1:5197/scripts/hd01/compare.html`.
Juego normal de prueba: `http://127.0.0.1:5197/?quality=high`.
La herramienta completa está en `scripts/hd01/preview.html`; no aparece en el juego.

Para reiniciar en PowerShell, desde el repositorio:

```powershell
$env:HD01_EVIDENCE = 'C:\Users\glest\.codex\visualizations\2026\10\20\01a1592e-ca76-7530-bf16-240a1fb089c6\hd01'
node scripts/hd01/preview.mjs
```

Comparación reproducible:
`node scripts/hd01/compare-metrics.mjs <directorio-de-evidencias>`.
No volver a capturar con etiqueta before sobre la versión modificada: esas referencias
pertenecen al original 4232cda y deben conservarse. Si se interrumpe el trabajo, la
implementación está aplicada, los tests pasan y sólo quedan las validaciones físicas
indicadas, sin commit. Revisar este informe y las evidencias antes de repetir cambios.
