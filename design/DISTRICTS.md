# LIFE//SIM — Identidad de barrio

Un solo juego, muchas calles. La dirección de arte es **una** (`PALETTE`,
`ART_BIBLE.md`); cada zona sólo **mezcla distinto** lo que ya existe. Si al
cruzar de una zona a otra parece que has cambiado de juego, el perfil está mal.

- Datos: `src/data/districts.ts` (perfiles y guion de color)
- Lógica: `src/systems/Districts.ts` (qué zona hay en un tile, tinte de la hora, tráfico por carril)
- Reglas que se comprueban: `scripts/check-districts.ts` (va en `npm run check`)

## 1. Qué es fijo y qué varía

| Fijo en todo el mundo (dirección maestra) | Lo que cada perfil puede mover |
|---|---|
| `PALETTE`, materiales, escala, perspectiva, sombras (ART_BIBLE §1–5) | **velo del suelo** (`wash`): un color a α ≤ 0,08 |
| El cielo por hora (`world/Lighting.ts`) | **guion de color** (`grade`): tinte sobre el cielo por fase |
| Tejados: siempre con el cielo limpio | **farola y escaparate** (`lamp`): temperatura y fuerza |
| Arte de cada prop, edificio y persona | **kit de calle** (`kit`): qué piezas existentes y cuántas |
| Neones y tubos: la única luz fría | **gente** (`crowd`): qué estilos de ropa atrae |
| | **tráfico** (`vehicles`): multiplicadores por franja del que cruza |
| | **fachadas** (`facades`): qué estilos de edificio caben |
| | **ambiente** (`ambience`): cuánto se notan hojas, papeles y vaho (`world/Atmosphere.ts`) |

Una zona **nunca** trae paleta, textura ni sprite propio. Si necesita algo que
no existe, se dibuja como pieza nueva del catálogo común (ART_BIBLE §12) y queda
disponible para todas.

## 2. Los perfiles

| Perfil | Suelo | Luz de noche | Kit | Gente | Tráfico |
|---|---|---|---|---|---|
| `residential` | gris cálido apagado | ámbar suave, 85 % | maceta, bici; poca cosa | cotidiana | furgonetas, menos bus |
| `commercial` | granito de siempre | ámbar pleno | papelera, maceta | cotidiana + oficina | reparto; taxi de noche |
| `vintage` | ladrillo cálido | ámbar intenso | **carteles**, bicis, aparcabicis | **street** | bici de paseo y de alquiler |
| `nightlife` | frío oscuro | **coral**, 115 %; base más oscura y violeta | **mupi emisivo**, bolardos | street + arreglada | **taxis** de noche y madrugada |
| `park` | verde orgánico | cálida tenue, 80 % | arbusto y hoja en la hierba | **deportiva** | bici de paseo |
| `transit` | acero | neutra y fuerte | (lo pone la regla del metro) | de paso | — |

Lo que ya hacía el mundo sigue igual y encaja con los perfiles: la cola y la
basura de la discoteca, los perros y corredores del parque (`data/streets.ts`),
los patinetes del metro y los contenedores de los portales (`systems/Dressing.ts`).

El tráfico de una zona sólo se nota donde un carril la cruza, en proporción a
cuánto la cruza: el carril bici del Olmo pasa un tercio por el Carmen y se lleva
un tercio de sus bicis de paseo. Una zona sin carriles (la puerta de la Órbita,
peatonal) no cambia coches.

## 3. Guion de color

Cuatro fases compartidas por todos (`COLOR_SCRIPT`); entre anclas se interpola:

| Hora | 0–5:30 | 7:30 | 10–17:30 | 20:00 | 22–24 |
|---|---|---|---|---|---|
| Fase | noche | mañana | día | atardecer | noche |

El tinte de la zona **multiplica** la luz del cielo. Límites (canal mínimo, lo
comprueba el check): día ≥ `f0` (≤ 6 %), mañana ≥ `e4`, atardecer ≥ `d0`,
noche ≥ `c8`. Así la identidad se nota a todas horas, y de día casi nada:
de día manda el material; de noche, la luz.

- **Mañana:** todo algo cálido; el parque, verdoso y fresco.
- **Día:** casi blanco en todas; el Carmen apenas más cálido.
- **Atardecer:** el Carmen, lo más naranja; la zona de ocio empieza a rosar.
- **Noche:** la zona de ocio, la más oscura y violeta con la luz más coral; el
  parque, frío; las calles de vecinos, azul tranquilo con ámbar suave.

Las farolas siguen siendo cálidas en todas partes (ART_BIBLE §6); lo que cambia
es cuánto y hacia qué ámbar.

## 4. Bordes

Nada de rayas. El velo del suelo y el tinte de la luz se funden en **tres
tiles** desde el borde de la zona. Las zonas se pintan en orden y **la última
manda**: primero `district` (todo el sitio), luego cada entrada de `zones`.
Los bolsillos (la puerta de un club, un bar junto al parque) van al final.

## 5. Añadir un barrio de Madrid

1. **Elige perfiles existentes.** Malasaña es `vintage` + `nightlife`; Retiro,
   `park`; Chamberí, `residential` + `commercial`. Crea uno nuevo sólo si
   ninguna mezcla sirve.
2. En su `LocationDef`: `district` para el fondo y `zones` como rectángulos en
   tiles, de lo general a lo particular. Coméntalas con el nombre de la calle.
3. Pon los edificios con estilos que el perfil acepta (`facades`); si el check
   se queja, o el edificio o la zona están mal puestos.
4. Perfil nuevo: copia el más parecido y mueve **poco**:
   - `wash` α entre 0,04 y 0,08, con un color de la familia de `PALETTE`.
   - `grade` dentro de los límites de §3; día casi blanco.
   - `lamp` cálida (R ≥ G ≥ B), fuerza 0,7–1,2.
   - `kit` sólo con props del catálogo. `every` es una pieza por tantos sitios
     libres junto a fachada (u hierba, con `on: 'open'`): 2 para calles con
     carácter, 14+ para calles tranquilas. `max` pone el techo. Lo alto (un
     cartel) sólo va con pared detrás.
   - `crowd`: el estilo favorito tiene que llevarlo algún look (`NpcLook.style`
     en `PASSENGER_LOOKS`); si no, añade looks antes que otro estilo.
5. `npm run check` y míralo en el navegador **a cuatro horas**: 8:00, 13:00,
   20:00 y 23:30, con gente. Si una zona se lee como otro juego, baja el `wash`
   y acerca el `grade` a blanco antes de tocar nada más.

## 6. Lo que no se hace

- Otra paleta, otro contorno u otra escala para un barrio.
- Postproceso de pantalla completa por zona (ART_BIBLE §7, §11).
- Luz fría de farola para "dar ambiente": lo frío son neones y tubos.
- Decoración sin función: cada pieza del kit es algo que estaría en esa calle.
- Condicionales por zona en el código (`if (zone === 'vintage')`): todo sale del perfil.
