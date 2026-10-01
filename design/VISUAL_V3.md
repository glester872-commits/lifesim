# Corte vertical · plazuela del metro (pixel art)

Estado: **para revisar**. Vive en la localización `plazuela-v3`
(`src/data/prototype.ts`), que se abre con `?proto` en la URL y no guarda
partida.

## Objetivo

Acercar el juego a `design/visual-reference.png.jpeg` **sin dejar de ser pixel
art**: texturas a 1 px de mundo, filtro NEAREST, zoom de cámara siempre entero.
La escena calca la composición de la referencia (seto arriba, café a la
izquierda, dos árboles en parterre, boca de metro al centro, banco, buzón y mupi
a la derecha, aparcabicis entre bolardos, cuatro farolas) con las piezas de
pixel art del juego.

## Qué es común a todo el juego (no sólo al corte)

- **Cámara**: encuadre mínimo de 18 × 13,5 tiles (`VIEW_WIDTH`/`VIEW_HEIGHT`) y
  zoom entero (`WorldScene.fitCamera`).
- **Farola alta**: charco algo mayor (`pool: [66, 30]`) y halo del farolillo más
  visible.
- **Copas iluminadas**: un árbol con farola a menos de 5 tiles recibe su luz en
  la copa (`Lighting.lightCanopies`).
- **Zona de transporte**: luz ámbar de sodio (`#ffa654`, `data/districts.ts`).

## Descartado

El primer prototipo de este corte se pintó en alta definición (texturas 4×
filtradas, `LocationDef.art = 'hd'`). Dejaba de ser pixel art: queda descartado.
El código de ese modo (`world/Hd*.ts`) sigue en el repositorio pero ninguna
localización lo usa.
