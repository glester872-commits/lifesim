# LIFE//SIM — 25 referencias fotográficas de vehículos

Fecha de revisión: 24 de noviembre de 2026.

## Uso previsto

Estas fotografías son referencias visuales para diseñar vehículos originales en pixel art para LIFE//SIM. No son recursos destinados a incorporarse directamente al videojuego. Utiliza las proporciones, siluetas, volúmenes, luces y materiales como material de estudio; crea tus propios sprites y diseños.

## Contenido y verificación

- Exactamente 25 fotografías JPG: una por cada modelo solicitado, numeradas del 01 al 25.
- Fotografías reales procedentes de Wikimedia Commons, con autor y licencia individual identificados en `fuentes.csv`. No se han generado imágenes mediante IA.
- 24 fotografías de 1.920 píxeles de ancho y una de 1.280 píxeles (Sandero). No se han ampliado artificialmente.
- Revisión visual de cada imagen: modelo y generación, color del nombre, vista de tres cuartos frontal, vehículo completo y ausencia de marcas de agua digitales visibles.
- Apertura y decodificación completa comprobadas; formato JPEG real y firmas SHA-256 diferentes para las 25 fotografías.
- Los ficheros conservan los píxeles de las versiones descargadas. Solo se han renombrado; las versiones reducidas del repositorio conservan la composición completa.

## Limitaciones frente a la solicitud

El paquete no cumple el requisito de fondo liso o neutro uniforme: se han conservado fondos reales de calles, aparcamientos, concesionarios y una exposición. No se han recortado los coches ni sustituido los fondos. El CSV marca expresamente esta excepción para cada fotografía.

Las imágenes 01 (Sandero), 17 (Yaris Cross) y 20 (Sportage) muestran rotulación física comercial sobre la carrocería. No son marcas de agua superpuestas por un fotógrafo. La referencia 06 (Corolla) tiene carrocería gris y pequeños detalles rojos.

La referencia 12 es un Peugeot e-208, variante eléctrica del Peugeot 208 de segunda generación; la 16 es un Citroën ë-C4, variante eléctrica del C4 de tercera generación. Ambas variantes se identifican en el CSV. Los ángulos fotográficos son aproximados, no una plantilla idéntica de estudio.

## Fuentes, autores y licencias

`fuentes.csv` contiene número, marca, modelo, generación representada, color, nombre, resolución real, enlace al archivo original de máxima resolución, licencia, estado de verificación, autor, página de descripción, versión descargada, enlace a la licencia, observaciones y SHA-256.

La licencia de cada fotografía pertenece a su autor. Se conservan los créditos en el CSV: CC BY 4.0, CC BY-SA 4.0, CC BY-SA 3.0 DE o CC0 1.0, según cada fila. Si compartes estas fotografías, conserva el crédito, el enlace a la fuente y el enlace a la licencia correspondiente. Si transformas una fotografía con licencia ShareAlike y distribuyes esa adaptación, respeta también sus condiciones de compartir igual. Las marcas y emblemas visibles pertenecen a sus respectivos titulares.

## Descompresión

El ZIP ya contiene la carpeta `coches/` con las 25 imágenes, este README y el CSV.

Para obtener `C:\Users\glest\Documents\lifesim\design\coches`, extrae el ZIP en `C:\Users\glest\Documents\lifesim\design`. Si lo extraes dentro de una carpeta `coches` existente, se creará una carpeta `coches\coches` adicional.

No falta ningún modelo solicitado.
