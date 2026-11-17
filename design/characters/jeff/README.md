# Jeff

Plantilla: `jeff.jpeg`. Es sólo una referencia de diseño y el juego no la carga.

## Lo que ya está en el juego

**Aspecto** (`src/data/npcs.ts`, id `jeff`). Se dibuja por código con NpcLook, como los demás personajes con nombre. Los colores salen de la imagen (retrato, sprite y paleta):

| Campo | Color | De dónde sale |
|---|---|---|
| cloth / clothDark | `#1c1b20` / `#121116` | Camiseta de tirantes negra. |
| skin / sleeves | `#c98a5e` | Piel cálida de los naranjas de la paleta; los brazos van al aire (tirantes). |
| hair / hairStyle | `#2e2018` / `curly` | Pelo rizado castaño muy oscuro. |
| trousers | `#c8b48e` | Pantalón claro del outfit casual. |
| glasses | `clear` | Gafas de montura oscura. |
| earrings | `#d9d6cc` | Pendientes de aro plateados. |
| ink | `arm-l`, `#3a2a22` | El tatuaje del brazo izquierdo. |

**Identidad** (`src/data/namedPeople.ts`). Datos fijados por el usuario:

- 26 años, hombre, masculino, gay.
- Temperamento tranquilo.
- Intereses: fitness y moda.
- Estilo sportswear.
- Trabajo: «por definir».
- Vive en Velaria (`from: 'velaria'`, valor nuevo del tipo).

**Casa.** `VL_MQ_8_ENTRANCE`, el portal de Calle Marqués 8 (vivienda moderna de Velaria, sin interior).

**Rutina** (`src/data/characters.ts`). Todo el día en Velaria, con locales abiertos a su hora (`src/data/places.ts`):

| Plantilla | Punto |
|---|---|
| 09:00 casa | en casa hasta salir hacia el café |
| 10:00 cafetería | Café Aurelia, `VLCAFE_TABLE_01` (alt. `_02`) |
| 12:00 centro / paseo | Plaza Aurelia, `VL_PLAZA_BENCH_01` / `_03` / `_02` según la rutina |
| 14:00 comida | Alma, `ALMA_TABLE_03` / `_05`; el día del hotel, en el Café Aurelia (`VLCAFE_TABLE_03`) |
| 18:00 gym | Velaria Club, `VLGYM_TREADMILL_01` (alt. `_02`) |
| 20:00 paseo / amigos | `VL_PLAZA_MEET_01`, en la plaza |
| 22:30 salida / copas | Vinoteca Marqués (`VLWINE_TABLE_01` o `VLWINE_STOOL_01`); el día del hotel, `HOTEL_BAR_01` |
| 01:30 casa | `VL_MQ_8_ENTRANCE` |

La Vinoteca cierra a la 01:00, así que los días de vinoteca a las 00:30 pasa al bar del Gran Hotel (abierto 24 h, `HOTEL_BAR_01`, alt. `_02`) y desde ahí vuelve a casa a las 01:30. Velaria no tiene discoteca.

Tiene tres rutinas: `jeff-semana` (martes a viernes), `jeff-finde` (sábado y domingo) y `jeff-hotel` (cualquier día). Alma y la Vinoteca cierran los lunes, así que el lunes siempre toca `jeff-hotel`.

**Frases.** Todas salen de la plantilla. «¿Qué plan hay hoy?» es su frase al hablar con él.

**Reconocimiento y móvil.** Usa el mecanismo común de los personajes con nombre: el perfil social que se guarda y `contactsOf`. Sale en la agenda en cuanto le conoces, pero su número sólo se consigue hablando con él.

## Pendiente

- Cadena, pulsera, móvil y mochila como objetos visibles. NpcLook no tiene campo para ellos.
- Outfits alternativos: gym, salida, invierno y verano.
- Retrato y expresiones de diálogo.
- Ocupación concreta. La plantilla dice «por definir».
- Voz propia en el chat (`NAMED_VOICES`). Haría falta texto que la plantilla no da.
- Metro y discoteca, que salen en la hoja como lugares habituales: su rutina no sale de Velaria.
