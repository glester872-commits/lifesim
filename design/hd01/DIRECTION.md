# HD-01 — contrato de conservación

Base: 4232cda. Vista previa local, sin commit, push ni despliegue.
Referencia principal: el propio juego en residential/commercial, interior, metro,
estadio, noche y lluvia; capturas before-* en el directorio de evidencias externo.
La biblia visual es contexto histórico: donde discrepa del runtime (zoom 2,5,
fachadas de 32 px) manda el runtime observado y no se corrige cambiando el diseño.

## Invariantes

- Mismos tamaños de textura, máscaras alfa, siluetas, pivotes, cámara y posiciones.
- Mismos colores principales, formas y contenido; sólo tonos derivados de materiales.
- Caras, pelo, cuerpos, ropa y poses actuales como referencia: no se reconstruyen.
- Contornos y luces emisivas no reciben un filtro de detalle. Sin ruido añadido.
- Ningún cambio de mapa, navegación, colisión, estado, reloj ni partida.
- Las siete comparaciones usan semilla 103, hora/clima fijos y viewport 1100×680.

## Decisiones antes de implementar

| Decisión | Fuente y regla | Aplicación |
| --- | --- | --- |
| Conservar la presentación | Captura residencial; encuadre y área visible exigidos | No redondear el zoom actual a costa de cambiar la vista |
| Separar materiales por sus uniones | Ventanas, mobiliario y metro actuales; luz NW de ART_BIBLE | Relieve interior discreto en bandas contiguas, sin cambiar alfa |
| No añadir grano | Cubiertas y pavimentos ya tienen detalle procedural | Conservar su trazado; no introducir más ruido |
| Conservar humanos y vegetación bien resueltos | HumanArtHD, Garments y copas existentes | Comprobar máscaras/animaciones, evitar rediseñar caras o copas |
| Mantener las luces suaves donde corresponden | Halos y reflejos actuales | Afinar sólo el muestreo del mapa de sombras de alta calidad |
| No rediseñar HUD | Brief y guía Refero: preservar el target existente | Sólo corregir recorte si aparece en pantalla estrecha |

## Cobertura prevista

| Familia | Entrada real | Tratamiento |
| --- | --- | --- |
| Jugador / NPC / ropa | HumanArtHD, HumanArt, Garments, TextureFactory, HdCache | Conservar y verificar |
| Fachadas y puertas | BuildingArt | Relieve de uniones y marcos dentro del diseño |
| Interiores / mobiliario | TextureFactory, PropArt, UrbanArt | Separación de material en muebles y metal |
| Pavimentos / carreteras | Surfaces, StreetArt | Conservar el material horneado y las juntas continuas |
| Vegetación | Vegetation | Conservar copas y troncos; no añadir racimos |
| Coches / buses / bicis | VehicleArt, CyclistArt | Acabado de carrocería existente; ciclistas conservados |
| Metro | TextureFactory, MetroView | Acabado de vagones y hojas; mismas puertas y luces |
| Estadio / campo / público | ArenaArt, MatchView, CrowdView | Acabado de asientos/metal; campo, balón y personas conservados |
| Señalética / texto | BuildingArt, UrbanArt, UI | Proteger iconos, textos y luces emisivas |
| Iluminación / sombras | Lighting, LampShadows | Muestreo nítido en high; low/medium compatibles |
| Clima / reflejos | WeatherView, Lighting | Conservar; verificar noche y lluvia |
| Partículas | Atmosphere, AmbientArt | Conservar tamaño, presupuesto y animación |
| HUD / menús | style.css, ui/* | Verificar escritorio y móvil; sin redistribuir |

El visor scripts/hd01 es una herramienta local separada; nunca forma parte de la UI normal.
Las mediciones CPU controladas se distinguen de FPS presentados y de memoria GPU real.
