# Visual V3 · prototipo de la plazuela del metro

Estado: **prototipo para aprobar**. Sólo existe en la localización
`plazuela-v3` (`src/data/prototype.ts`), que se abre con `?proto` en la URL y no
guarda partida. Ningún otro sitio del mapa usa este arte.

## Qué cambia respecto al arte de siempre

| | Antes (pixel art 1×) | V3 |
|---|---|---|
| Resolución | texturas a 1 px de mundo, filtro NEAREST | texturas a 4× (`HdKit.HD`), dibujadas en coordenadas de mundo, filtro LINEAR, pintadas a `1/4` |
| Personas | celda pequeña, siluetas de pocos píxeles | celda 18 × 30 (`HdPeople`), contorno, peinado, capas de ropa, zapatos, complexión |
| Cámara | zoom entero, mucho mapa | `LocationDef.view = [336, 210]`: zoom continuo, ~21 × 13 tiles |
| Fachadas | piezas por tile | `HdArchitecture`: planta baja / principal / plantas / cornisa, huecos rehundidos, balcones con ménsulas y forja, persianas, portal, escaparates con toldo, bajantes, zócalo, manchas de edad |
| Suelo | tiles con variantes | un único lienzo (`HdGround`): granito en hiladas de largo mezclado, baldosa de 4 pastillas fuera de la rejilla de 16, asfalto con árido, rodadas, grietas selladas, parches, carril bici, cebra, bordillos con cara, alcorques con rejilla, sombras de contacto |
| Boca de metro | sprite de 3–5 tiles | pieza en tres capas (`HdBuilder`): hueco con peldaños que oscurecen al bajar y muro de azulejo con el pasillo encendido; pretiles laterales con barandilla por delante de la gente; arco de forja con rótulo METRO, rombo y farolillos |
| Árboles y mobiliario | sellos de 1 tile | `HdProps`: plátano de 64 × 96 con corteza a placas y copa en cinco verdes, farola fernandina, banco, aparcabicis con bicis, jardinera de acero corten, papelera, tótem, plano del barrio |
| Vehículos | 26–32 px | `HdVehicles`: mismo catálogo ×1,6 de largo y ×1,3 de alto, chapa con reflejo, cristales, llantas, juntas, pilotos, taxi de Madrid, EMT |
| Noche | brillos 1× encima de todo | brillos HD aditivos, recortados por la silueta de lo que tienen delante (`cutFronts`) |

## Reglas que se mantienen

- Todo sigue dibujado en código: ni un byte de arte binario.
- Sin condicionales por localización: el pincel lo elige el dato `LocationDef.art = 'hd'`.
- Los sólidos salen de `solidMask`, igual que en el resto del mundo; `npm run check` recorre el prototipo.
- Tráfico, gente, luz, lluvia y metro son los sistemas de siempre; V3 sólo cambia cómo se pintan.

## Rendimiento

- Cada textura HD se crea una vez por sesión y se reusa al volver (`makeHd` por clave).
- Personas en páginas de atlas de 2048² que se crean según hacen falta.
- Vehículos y piezas de luz del tráfico, del pozo de siempre (`TrafficView`).
- Memoria aproximada del prototipo: suelo 2176 × 1344 (~12 MB), árboles y props (~3 MB), una página de atlas de personas (~16 MB).

## Si se aprueba

El paso siguiente sería migrar barrio a barrio (fachadas por `materialOf`, props por `SIZES`), nunca mezclar 1× y 4× en la misma vista.
