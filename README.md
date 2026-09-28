# LIFE//SIM

Vertical slice 0.1 — base jugable de un simulador de vida 2D cenital.

## Concepto

El jugador controla físicamente a su personaje dentro de una ciudad. El mapa no
es decoración: es la interfaz del simulador. Si quieres estudiar, vas al centro
de estudios; si quieres descansar, vuelves a casa; si quieres cambiar de barrio,
bajas al metro y pagas el billete.

Dos distritos conectados por la Línea 2: **Vallesco**, el primer barrio completo, y
**Ribera Norte** (barrio viejo junto al canal, con plaza de mercado y un bar con
mesas fuera). En Vallesco se puede pasar un día entero: tu piso, el metro, un
gimnasio, la cafetería, una tienda de ropa, un súper, un restaurante y una planta
de oficinas, rodeados de comercios y bloques de vecinos. Al este, la **Calle del
Carmen**: ropa vintage, de archivo y de segunda mano, un estudio de tatuaje y un
café con terraza.

A largo plazo la idea es que tiempo, dinero, energía y atención sean recursos
limitados, de modo que cada decisión tenga coste de oportunidad y cada partida
derive en una trayectoria vital distinta. De esa economía sólo existe todavía un
punto: el billete de metro. Es deliberado — un único sitio donde el dinero y el
reloj significan algo, para probar la idea sin abrir la puerta al scope creep.

## Stack

| Pieza | Elección | Motivo |
|---|---|---|
| Motor | Phaser 3 (3.90) | Arcade physics y escenas, sin traer un editor completo. |
| Lenguaje | TypeScript (`erasableSyntaxOnly`) | Tipado estricto, sin sintaxis que sólo entienda `tsc`. |
| Build | Vite 8 | Arranque en frío rápido y HMR. |
| UI | HTML + CSS | HUD y diálogo nítidos a cualquier zoom, fuera del canvas. |
| Persistencia | `localStorage` | Detrás de una interfaz, sustituible sin tocar el juego. |

Sin React, sin backend, sin dependencias de arte: **todas las texturas se
dibujan por código**.

## Requisitos

- Node.js 20 o superior (probado con 24.19)
- Un navegador moderno

## Instalación

```bash
npm install
```

## Ejecutar

```bash
npm run dev      # servidor de desarrollo en http://localhost:5173
npm run build    # tsc + bundle de producción en dist/
npm run preview  # sirve dist/
```

## Controles

| Tecla | Acción |
|---|---|
| `W` `A` `S` `D` o flechas | Caminar |
| `E` | Interactuar (hablar, entrar, salir) y avanzar diálogo |
| `M` | Abrir y cerrar el mapa (también `Esc` para cerrar, o el botón **Mapa** arriba a la derecha) |
| `Espacio` / `Intro` | Avanzar diálogo |

Cuando algo es interactuable aparece un indicador `E` sobre la cabeza del
personaje.

## Arquitectura

Capas separadas a propósito:

```
Datos        data/locations.ts, data/npcs.ts     qué existe en el mundo
Estado       state/GameState.ts                  qué es cierto ahora
Lógica       systems/*                           cómo cambia
Render       scenes/*, entities/*, world/*       cómo se ve
Persistencia systems/SaveSystem.ts               cómo sobrevive
UI           ui/HUD.ts, ui/DialogueBox.ts        qué se le cuenta al jugador
```

Tres decisiones que conviene entender antes de tocar nada:

**1. Una sola `WorldScene` para todas las localizaciones.** No hay
`InteriorScene`. Calle, piso y cafetería son el mismo código alimentado por un
`LocationDef` distinto. Añadir un sitio nuevo es añadir una entrada en
`data/locations.ts`; no hay ni un `if (building === 'home')` en el proyecto.

**2. Puertas y personas son el mismo tipo de interacción.** Ambas son
`Interactable`, ambas responden a `E`, ambas usan el mismo indicador. Por eso
cobrar el billete de metro fueron cuatro líneas y dos campos opcionales en
`PortalDef`, no un sistema aparte. Cuando una puerta deba cerrarse por horario,
el sitio donde ponerlo ya existe y es único.

**3. El HUD vive en el DOM, no en el canvas.** Texto nítido a cualquier zoom,
responsive gratis, y las Scenes no acumulan responsabilidades de interfaz.

Los sistemas se inyectan por constructor (`src/services.ts`). No hay singletons
ni acceso global al estado.

## Sistemas implementados

- **Movimiento** — velocidad normalizada en diagonal, cuerpo de colisión
  reducido a los pies para poder pasar por detrás de árboles y farolas.
- **Cámara** — seguimiento suave con límites de mapa. El zoom se ajusta por
  localización: sube en enteros hasta cubrir la ventana (tope 5) y, si el mapa
  sigue sin llenarla, encuadra centrado en lugar de pegarse a una esquina.
- **Colisiones** — `solidMask` (en `LocationSystem`) decide qué tile es sólido:
  terreno, huella de edificio menos su puerta y fila base de cada prop. De ahí
  salen rectángulos agrupados (`solidRects`): 144 cuerpos en todo el barrio y
  menos juntas en las que engancharse. La misma máscara valida el mundo y la
  recorre `npm run check`.
- **Localizaciones** — registro validado en arranque: una rejilla mal escrita o
  un portal que apunte a un spawn inexistente falla ahí, no como un agujero
  invisible en el suelo.
- **Barrio Vallesco** — dirección A de `design/barrio/` (aprobada en
  `direction-approved.md`): Calle Mayor peatonal y comercial al norte, una
  avenida con tráfico que sólo se cruza por dos pasos de cebra, la parte
  residencial al sur y la plazuela del metro a diez pasos de casa; la plaza con
  fuente y el gimnasio detrás; un parque con pista junto a la vía. 110×56 tiles:
  cruzarlo a pie son unos 23 s reales (46 min de juego).
- **Calle del Carmen** — el tramo este del barrio (x 74–109). La Calle del Olmo,
  a diez pasos de tu portal, se estrecha y sigue como Calle del Carmen: un solo
  carril, para bicis (fila 47, hacia el oeste, sigue por el Olmo), entre dos
  aceras de granito de tres filas (escaparates y terraza · paso · bordillo con
  farolas, plátanos, aparcabicis y columnas de carteles) y un paso de peatones en
  medio. El Pasaje del Carmen baja de la avenida; la Mayor y la avenida siguen
  hasta el nuevo borde. Norte: **Tinta Carmen** (tatuajes), **Retales** (vintage
  escogido), **Café Molinillo** (con terraza y camarera), Discos Surco y un portal
  de vecinos. Sur: **Archivo** (streetwear y archivo), **Segunda Vuelta** (al
  peso), Serigrafía Chapa y otro portal. Cada fachada tiene su estilo y su icono
  (`BuildingArt`: vestido, gorra, etiqueta, corazón, vinilo); el grafiti es un
  mural encargado en los paños ciegos del estudio y de la tienda de discos, y los
  carteles pegados son de la serigrafía y del ropero (`Look.wallArt`). Discos y
  serigrafía no tienen interior: puerta dibujada y una línea al mirarla.
- **Tiendas de ropa** — un solo sistema para todas (`data/retail.ts` +
  `systems/Retail.ts`). Una prenda existe una vez en el mundo (hueco arriba o
  abajo, color, manga, pieza única); cada tienda dice qué tiene y a qué precio,
  así que la misma camiseta cuesta 6 € al peso y 30 € en Archivo. Se compra
  hablando con quien cobra: su puesto ofrece la tienda (`data/services.ts`, oferta
  `retail`), igual que la barbera ofrece cortes. Lo comprado entra en el armario
  (`GameStateData.wardrobe`) y sales con ello puesto; lo que ya es tuyo se pone
  gratis y una pieza única no se vuelve a vender. Hilo, la tienda de la Mayor, usa
  el mismo sistema: una tienda nueva es una entrada en `STORES` y un puesto.
- **Armario y ropa puesta** — lo que llevas es aspecto (`data/appearance.ts`:
  `top`, `bottom`), guardado con la partida y pintado por `world/HumanArt.ts`
  (color, sombra y largo de manga: larga, corta o tirantes). En casa, el armario
  cambia la ropa con lo comprado o vuelve a la de siempre en cada hueco.
- **Tatuajes** — `data/tattoos.ts`: siete zonas (antebrazos, mano, cuello,
  pecho, espalda, gemelo) y diseños con estilo (tradicional, línea fina,
  blackwork, letras), tinta, precio y duración. En el estudio se habla con Lía:
  primero la zona (libre u ocupada, y si se verá con lo que llevas), luego el
  diseño; `tattoo()` cobra, el reloj avanza lo que dura y la marca queda en el
  aspecto para siempre. Que se vea lo decide la ropa (`visibleTattoos`): la manga
  larga tapa el antebrazo, el cuello y la mano siempre se ven y pecho, espalda y
  gemelo van bajo la ropa. Lía y la otra tatuadora llevan su tinta de fábrica
  (`NpcLook.ink`).
- **Gente del Carmen** — cada tienda, el estudio y el café tienen personal con
  nombre o de uniforme y clientela por hora y día (`data/population.ts`): quien
  rebusca en los cajones, quien se prueba algo, quien mira el flash, quien se
  tatúa en la camilla y paga. En la calle (`data/streets.ts`): escaparates,
  gente esperando en la puerta, parejas de paseo, corrillos, el banco, la terraza
  del Molinillo con su camarera y las bicis del carril. Sara pasa algún miércoles
  y sábado por el Molinillo, Retales, Archivo y el flash de Tinta; Ada, algún
  sábado, por Segunda Vuelta, el café y el banco del Carmen.
- **Edificios** — los del barrio son `BuildingDef` (`data/vallesco.ts`), no
  caracteres de rejilla: estilo, huella, fachada norte o sur, una o dos plantas
  y puerta. Si tiene interior, `LocationSystem` genera su portal y el spawn de
  delante con el mismo id, así que salir de un interior siempre deja frente a su
  puerta. `world/BuildingArt.ts` hornea fachada, tejado, rótulo e instalaciones
  del tejado en la textura del suelo; cada local se reconoce por fachada e icono
  (mancuerna, taza, percha, cesta, cubiertos, cruz, tijeras…), no por un texto
  que a 16 px no se leería. Los locales sin interior tienen puerta dibujada y
  ningún portal: no hay afordancia vacía.
- **Puntos y grafo de peatones** — cada localización puede declarar `points`
  con nombre y tipo (`entrance`, `exit`, `edge`, `wait`, `seat`, `meet`,
  `interact`, `work`, `path`) y `links` rectos entre ellos, validados al
  arrancar. `systems/Navigation.ts` da `findPoint`, `pointsOfKind` y `route`:
  un NPC futuro pide un destino (`CAFE_TABLE_01`, cualquier `seat`) y camina el
  grafo, sin rutas escritas en el personaje. En desarrollo:
  `lifesim.route('HOME_ENTRANCE', 'GYM_ENTRANCE')`.
- **Señalización** — al llegar a un sitio, su nombre aparece bajo el HUD y se
  va solo; delante de una puerta, el aviso dice a dónde lleva y, si cuesta algo,
  cuánto.
- **Una sola forma de interactuar** — personas, puertas y cosas que se miran son
  el mismo `Interactable` de `WorldScene`: la E abre un diálogo, cruza un portal
  o muestra una línea. Un local sin interior lleva su texto en `inspect`; un
  cartel suelto va en `inspects` de la localización. No hay código por sitio.
- **Movimiento ambiental** — `world/Ambience.ts`, sacado de los datos: coches por
  los dos carriles de la avenida (`traffic`) que frenan ante cualquier peatón de
  su carril y guardan distancia; el chorro de la fuente (`PropDef.ambient`), quieto
  con movimiento reducido; y las puertas de cristal con interior, que se abren al
  acercarse (140 ms) y se cierran despacio (260 ms). El resto del barrio está
  quieto a propósito.
- **Lugares** — `data/places.ts` da un id estable a cada vivienda, negocio,
  transporte y espacio público, con tipo, etiquetas, aforo y horario.
  `systems/Places.ts` resuelve el resto desde edificios y puntos
  (`placeInfo('cafe')`: entradas, salidas, puntos de interacción, dónde
  aparecen y a dónde van los NPC). Ahí se atarán `npcId → residenceId`,
  `npcId → workplaceId` y `eventId → placeId`.
- **Rutas entre puertas** — `worldRoute(desde, hasta)` devuelve los tramos por
  localización: salir del interior, cruzar la calle por el grafo y entrar en el
  destino. En interiores recorre la cuadrícula esquivando muebles y NPC quietos.
  `npm run check` lo prueba con cinco rutinas de un día entero.
- **Sara y Ada, personajes con nombre que se mueven** — `data/characters.ts`
  da a cada una varias rutinas de un día entero (facultad, recados, gimnasio,
  noche en la discoteca, domingo sin salir de casa…) y `systems/Characters.ts`
  elige la de cada día por día de la semana y peso, con semilla: el mismo día es
  siempre igual, pero no todos los martes lo son, y si repite la de ayer cambia
  de planes una vez. Los planes compartidos (`OUTINGS`, p. ej. la noche del
  viernes) salen a la vez para todas las que los tienen: cenan en la misma mesa
  y bailan juntas. El día empieza a las 06:00 con todas en casa, así que la
  madrugada es de la noche anterior y las rutinas empalman sin saltos. Salen con
  el tiempo justo para llegar por `worldRoute()`, cruzan puertas y entran en los
  interiores; en casa, en la academia o en el metro no se ven. Su posición sale
  del reloj: no se simula fuera de cámara ni se guarda. Donde están paradas es
  suyo: la gente del local o de la calle no se sienta encima. `npm run check`
  recorre cada rutina y ocho semanas seguidas.
- **Gente en la calle** — `systems/StreetLife.ts` con `data/streets.ts`: cuánta
  gente hay según hora y día (la madrugada cuenta con la noche anterior) y qué
  viajes hace, siempre de un sitio con sentido a otro: de casa al metro por la
  mañana, recados a las tiendas abiertas, terraza, plaza y parque por la tarde,
  cena, y de noche cola y corrillo en la puerta de la discoteca y gente saliendo
  de madrugada. Un local cerrado no es origen ni destino; uno con perfil de
  afluencia atrae en proporción a lo lleno que está (`pull`). Caminan por el
  grafo de peatones, van solos o en grupos que se quedan charlando juntos, a
  veces se paran un momento y nunca se quedan quietos en la calzada. Los coches
  frenan por todos. Como en los locales, se reconstruye al entrar.
  `npm run simulate:streets`.
- **Sala Órbita, la discoteca** — el antiguo local en alquiler de la Calle
  Mayor. Abre jueves, viernes y sábado de 21:00 a 06:00 (`days` y horario que
  cruza la medianoche en `data/places.ts`); fuera de hora la puerta dice que está
  cerrado y cuándo abre, y eso vale ya para cualquier local con interior. Dentro:
  barra, cabina de DJ entre altavoces, pista y zona de estar. Se llena poco a
  poco (casi vacía a las 21:00, pico a las 02:00, vaciándose desde las 04:00) y
  el jueves es más flojo. La música se ve: focos que saltan a cada pulso y la
  gente bailando al mismo compás (no hay audio). De madrugada, por la avenida
  sólo pasan taxis (`traffic.hourly`).
- **Gente en los locales** — `systems/Crowd.ts` decide quién hay en la
  cafetería, el gimnasio, la tienda, el súper, el restaurante y la oficina según
  hora, día y aforo (`data/population.ts`); `world/CrowdView.ts` lo pinta con los
  mismos `Character` que Sara y se puede hablar con todos. El personal con
  nombre (Nilo, Nerea, Iván, Carmen, Tomás, Julia) ocupa su puesto en su turno;
  el anónimo lleva uniforme (`look` → `UNIFORM_LOOKS`). Lo que se ve hacer sale
  del punto y del estado, sin IA: sentado en asientos y mesas de trabajo,
  corriendo en la cinta, con el móvil en colas y descansos, charlando en
  mostradores y reuniones. Al salir del local nadie se simula: al volver se
  reconstruye desde la hora.
- **Interiores con carácter** — props de pared (ventana, cuadro, reloj, pizarra,
  neón, balda) sobre la fila de muro, de barra (cafetera, vitrina) sobre el
  mostrador y del techo (`overhead`: colgantes y tubos, que ni colisionan ni
  hacen sombra). `ambient` en la localización tiñe la sala y sus lámparas se
  encienden siempre.
- **Mapa** — M o el botón **Mapa** (pensado también para el dedo) abren el mapa
  del barrio. No es una captura: `systems/WorldMap.ts` lo saca del mundo (el suelo
  de la localización clasificado en calzada, carril bici, pasos, aceras, plazas,
  zonas verdes, agua y vía; la huella de cada edificio; los lugares de
  `data/places.ts` en su puerta, con icono por categoría; y los nombres de calle
  que declara la localización en `areas`). Un exterior sin lugares todavía
  (Ribera) enseña sus puertas con el nombre del portal. La conversión mundo →
  mapa es una sola función (`worldToMap`: tiles con decimales, anclado a los pies
  como los sprites) y la de mapa → pantalla, la clase `MapViewport` (zoom con
  límites, arrastrar y pellizcar sin perder el mapa, centrar). «Estás aquí» sale
  de la posición real del jugador, con flecha hacia donde mira; dentro de un
  interior o un andén se pone en la puerta de su edificio y dice dónde estás.
  Ratón encima o toque en un icono: nombre, tipo y si está abierto ahora.
  Abierto, el mapa para el mundo como un menú (ni reloj, ni gente, ni teclas al
  jugador); no se recarga nada al cerrarlo. `ui/MapScreen.ts` hornea el suelo una
  vez por mapa y sólo lo reescala al moverse. `npm run check` lo comprueba
  (`scripts/check-map.ts`): cada lugar en su puerta, cada interior en su barrio y
  la vista dentro del mapa.
- **Diálogo** — conversación lineal que no sabe nada de cómo se pinta. Bloquea
  el movimiento y pausa el reloj mientras está abierto.
- **Cartelería** — las bocas de metro llevan el rótulo `METRO` dibujado con una
  fuente de 5x7 px hecha a mano; dentro, el muro del fondo lleva plano de línea
  y carteles. El resto de señalética es abstracta a propósito: a 16 px por tile
  una palabra larga no se lee, y fingir que sí es peor que no ponerla.
- **Compras** — `systems/Commerce.ts`: una cartera (dinero, bolsa y tarjetas)
  y funciones puras que compran, pagan un trayecto o consumen algo y devuelven
  la cartera nueva y qué pasó. Lo que se vende está en `data/catalogs.ts`
  (máquina expendedora de la Calle Mayor, barra del Pausa, máquina de billetes
  del metro) y se coloca en el mapa como `terminals` de la localización; un
  sitio nuevo que venda algo es un catálogo y un terminal, sin código. Se elige
  en un menú (`ui/Menu.ts`: W/S, E, 1–9, Esc) que apaga lo que no se puede
  comprar y dice por qué. Con I se abre la bolsa: comer o beber devuelve
  energía. Dinero con céntimos, bolsa y tarjetas se guardan con la partida.
- **Metro con tarjeta y destino** — no se empieza con acceso al metro: la
  tarjeta de transporte se compra (€12,50 con €10 de saldo) y se recarga en la
  máquina del vestíbulo. Al subir al tren se elige destino (`data/transit.ts`:
  paradas de la Línea 2 con su orden; los minutos salen de la distancia) y el
  viaje (€2) se descuenta de la tarjeta; sin tarjeta o sin saldo, el menú lo
  dice y no deja subir. Una parada puede ser una estación con mapa o un sitio
  que aún no lo tiene (`offMap`).
- **Sitios sin mapa y actividades** — Polígono Norte · Decathlon es una parada
  sin mapa: se llega en tren y se ve en un menú con sus actividades
  (`data/activities.ts`: duración, requisitos, coste, efectos). Un turno de 6 h
  paga €54 y cansa; al acabar se vuelve en metro. Salir a las 10:00 es volver a
  las 17:00 a un barrio que va a las 17:00: personajes, locales, calle, metro,
  discoteca y luz salen del reloj, así que nada se queda congelado.
  `npm run check` recorre ese viaje. Cuando Decathlon tenga mapa, su parada pasa
  de `offMap` a `station` y el tren, el pago y las actividades siguen igual.
- **Personal de servicio** — `data/services.ts`: oficios reutilizables
  (camarero, barra, caja, seguridad, gimnasio, tienda, cocina, recepción, DJ)
  con uniforme, frase y forma de trabajar: en su puesto, de ronda o sirviendo
  mesas. El que sirve va junto al cliente sentado que lleva más rato sin que le
  atiendan (`systems/Service.ts`), dentro (Crowd) y en las terrazas del Pausa y
  de Casa Tomás (StreetLife), sólo mientras el local está abierto. Los clientes
  llegan solos, en pareja o en grupo, se sientan juntos y se van a la vez; en la
  mesa se ve el plato o el vaso.
- **Metro vivo** — las estaciones tienen vestíbulo, torniquetes, andén y vía, y
  un tren con máquina de estados real (`APPROACHING → ARRIVING → STOPPED →
  DOORS_OPENING → BOARDING → DOORS_CLOSING → DEPARTING → AWAY`). Frena con curva
  `v = √(2·a·d)` para detenerse justo en la marca. Las puertas se derivan del
  estado, así que no pueden abrirse en marcha. Sólo se puede subir en una puerta
  con el tren en el andén; si llegas en tren, el tren sigue ahí al bajar.
  Pasajeros anónimos (de 1 a 11 según la hora; un pool que se recicla, sin crear
  ni destruir) entran, esperan, reaccionan al tren, suben o bajan y se van, cada
  uno con su propio ritmo. Marco patrulla el andén de Vallesco (`IDLE / PATROL /
  OBSERVE / RETURN_TO_POSITION`) y se puede hablar con él mientras camina. Todo
  el ritmo está en `config/metro.ts`; con `debug` (activo sólo en desarrollo)
  aparece un panel con el estado del tren, la siguiente llegada, el evento y el
  estado de cada NPC. `npm run check` simula cuatro ciclos completos del tren.
- **Metro dinámico** — rutina + probabilidad + contexto, sin guion.
  `systems/MetroDaily.ts` (puro, sin Phaser) genera cada día un
  `MetroDailyState` con semilla del día: nivel base de afluencia, frecuencia,
  probabilidad de retraso, seguridad, perfil de pasajeros, ambiente y cuánto
  ocurre. El mismo día es siempre el mismo día; si sale casi calcado a los
  anteriores, se vuelve a tirar (de forma determinista). La hora del reloj
  mueve la afluencia por franjas (`HOUR_BANDS`: rampa, punta, mediodía, comida,
  tarde, noche; más suave en fin de semana) entre `VERY_LOW` y `RUSH_HOUR`, que
  deciden cuánta gente hay, cuánta baja y cuánta sube. Siete arquetipos
  (COMMUTER, STUDENT, TOURIST, DISTRACTED, RUSHED, CALM, ELDERLY) cambian
  velocidad, sitio preferido, móvil, prisa, prioridad al subir y reflejos; de
  ahí salen solos quien corre, quien pierde el tren o quien deja salir. Los que
  esperan miran el móvil, las vías o un cartel, dan unos pasos, se sientan o
  charlan. Vigilancia de 0 a 2 (Marco, Iker, Rocío), fija o de ronda. Retrasos
  pequeños y acotados. Microeventos ponderados por rareza, escalados por la
  afluencia y con calma obligatoria después; megafonía según el contexto.
  `npm run simulate [días]` recorre días completos con el mismo código.
- **Eventos de viaje** — `systems/MetroEventManager.ts` (puro, sin Phaser) decide
  al subir al tren si el trayecto trae algo, y la estación de llegada lo cuenta.
  Casi nunca pasa nada (~15 % de los viajes). Cada evento de
  `data/metroEvents.ts` declara rareza (`ambient`, `interactive`, `important`,
  `exceptional`), función (WORLD_BUILDING, CAREER…), probabilidad por viaje,
  cooldown en días, condiciones (hora, laborable, afluencia, destino, dinero,
  flags de decisiones previas, afinidad con un personaje), efectos y
  continuaciones. Encima, `METRO_EVENT_RULES`: al menos un viaje tranquilo
  tras cualquier evento y 20 h entre dos que no sean ambientales. Las
  decisiones se eligen con 1–3 y el texto nunca enseña cifras. Los efectos sólo
  tocan lo que existe: dinero, energía (el "estrés" de un mal viaje) y minutos
  de reloj; el resto queda en memoria (`eventsSeen`, `choicesMade`,
  `importantNPCsMet`, `eventFlags`, `eventCooldowns`, continuaciones
  programadas), que se guarda con la partida. Dos cadenas de ejemplo: devolver
  una cartera → Amparo te reconoce semanas después → una oportunidad en el
  mercado; y Olga, que puede acabar en un contacto profesional. En desarrollo,
  la consola tiene `lifesim.forceEvent(id)` (próximo viaje),
  `lifesim.listAvailableEvents(destino?)`, `lifesim.inspectEventHistory()` y
  `lifesim.resetMetroEvents()`. `npm run simulate:events [partidas] [días]`
  simula años de viajes y falla si se rompen frecuencias, condiciones,
  cooldowns, registro de decisiones o cadenas.
- **Tiempo** — día/hora/minuto con acumulador independiente del framerate.
  `GAME_MINUTES_PER_REAL_SECOND = 2` (una hora de juego cada 30 s reales). El
  delta por frame está acotado para que volver de otra pestaña no salte horas.
- **Estado** — `GameState` emite `change` sólo cuando cambia algo que el HUD
  muestra; posición y orientación se escriben cada frame sin emitir.
- **Arte procedural** — `world/TextureFactory.ts` dibuja cada tile, prop y
  personaje a partir de la paleta de `config/constants.ts`. Cambiar la dirección
  cromática del juego es cambiar ese objeto. La paleta es de día (granito,
  revoco ocre, ladrillo visto, teja árabe); la noche no está en ella.
- **Luz y hora** — `world/Lighting.ts`. Fuera, un mapa de luz a media resolución
  multiplica la escena: el color del cielo de la hora (amanecer, día, hora
  dorada, anochecer, noche); las sombras del sol (`sunAt`), que salen de la huella
  de cada edificio y de todo lo alto y cambian de lado y de largo con la hora
  (largas al oeste al amanecer, cortas a mediodía, largas al este al atardecer,
  ninguna de noche); y encima, de noche, las luces. Los tejados se quedan con el
  cielo: ni el sol les pone la sombra del vecino ni una farola los alumbra. Quien
  pasa por una sombra o bajo una farola se oscurece o se ilumina con ella. La
  sombra de contacto (el pie de cada edificio y de cada prop, la de las
  personas) no depende del sol y va horneada.
  La luz cuenta **el estado de cada sitio**: el escaparate de un local se enciende
  sólo si su lugar (`data/places.ts`) está abierto, en el color de su fachada
  (`Look.lit`: ámbar de café, blanco de oficina y farmacia, rosa de la Órbita), con
  su charco en la acera y en la puerta; su rótulo brilla sólo abierto. Las
  ventanas de casa siguen la hora (`homeLightsAt`): cada una tiene su número fijo
  y el barrio se va apagando de madrugada. Dentro, la luz es la del local (el
  andén y la oficina, fluorescente fría) y un local cerrado se queda a oscuras,
  lámparas apagadas. Coches y bicis llevan faros, pilotos y freno de noche.
  Se repinta sólo cuando cambia algo que se ve (cielo, sol a pasos de diez
  minutos, locales abiertos, casas con luz): menos de un milisegundo de CPU cada
  varios segundos, y nada por frame. Sin bloom sobre los sprites.
- **Visual V2: la plazuela del metro como referencia** — `design/ART_BIBLE.md` fija
  la resolución, la escala (1 px ≈ 7 cm), la perspectiva, el orden de dibujo, las
  sombras, la paleta y la luz. La plazuela es la primera zona hecha con ese
  estándar (`world/UrbanArt.ts`): adoquín de granito con cenefa, franja
  podotáctil, boca de metro con marquesina de cristal, rótulo y escalera,
  plátanos con alcorque, bancos con respaldo, farolas altas, aparcabicis,
  jardinera, tótem y plano del barrio, alcantarilla, rejilla y hojas. Las piezas
  nuevas declaran en su `PropDef` sombra proyectada hacia el sureste (`cast`),
  charco de luz en el suelo (`light.pool`), partes que brillan de noche
  (`emissive`) o que son suelo (`flat`, horneadas); todo lo quieto se hornea. El
  resto del barrio conserva sus piezas hasta que se mejore con las mismas.
- **Volumen horneado** — `LocationBuilder` pinta con el suelo el bordillo de
  granito entre acera y calzada (rebajado en los pasos de cebra), la sombra de
  los edificios hacia el sureste, una sombra al pie de cada prop (`shadow` en
  su `PropDef`) y la cara clara y alicatada de la última fila de muro interior.
- **Personas** — `world/HumanArt.ts` dibuja a todos con las mismas reglas:
  contorno de un píxel, luz del noroeste, perfil izquierdo en espejo del
  derecho, cuatro poses (quieto, dos pasos, respiración) y peinado, piel y
  pantalón que salen del id cuando el aspecto no los fija. Paso a 8 fps en
  cuatro tiempos; quieto, respira.
- **Escala única** — el zoom sale de la ventana, no del sitio: un píxel mide lo
  mismo en la calle, en el metro y en casa.

## Guardado

Autoguardado cada 10 segundos, al cambiar de localización y al cerrar la
pestaña. El HUD muestra un `PARTIDA GUARDADA` discreto al escribir.

Persiste día, hora, minuto, dinero, energía, localización, posición,
orientación, la memoria de eventos de viaje (una partida anterior sin ella
carga con la memoria vacía), el aspecto (peinado, ropa puesta y tatuajes) y el
armario. Una prenda, un tatuaje o un peinado que ya no existe se olvida al cargar
sin romper la partida. Si un mapa cambió y la posición guardada cae
dentro de algo, se aparece en la entrada de esa localización. Al cargar, el archivo se valida campo a campo: si la versión no
coincide o la forma es incorrecta, se descarta y empieza partida nueva en lugar
de arrancar con datos corruptos.

`localStorage` está detrás de la interfaz `SaveStorage`. Migrar a IndexedDB o a
un backend es implementar esa interfaz y pasarla al constructor de `SaveSystem`.

Para empezar de cero: borra la clave `lifesim.save` en `localStorage`.

## Estructura del proyecto

```
src/
  main.ts                 arranque, inyección de sistemas, ciclo de vida
  services.ts             contrato de sistemas compartidos
  config/constants.ts     ritmo, velocidades, claves y PALETA
  config/metro.ts         tiempos del tren, pasajeros, vigilancia y DEBUG
  types/game.ts           tipos del dominio
  state/GameState.ts      estado central + partida nueva
  systems/
    TimeSystem.ts         reloj del mundo
    SaveSystem.ts         persistencia + adaptador de almacenamiento
    DialogueSystem.ts     conversación con elección opcional (sin render)
    LocationSystem.ts     registro, validación, edificios -> portales, máscara de colisión
    Navigation.ts         destinos con nombre, rutas por el grafo y entre puertas (puro)
    Places.ts             lugares resueltos: entradas, salidas, destinos, horario (puro)
    WorldMap.ts           el mapa sacado del mundo: suelo, edificios, lugares, dónde estás, vista (puro)
    Retail.ts             tiendas de ropa: comprar, ponerse, quitarse, escaparate (puro)
    Appearance.ts         aspecto de hoy: peinado, ropa, tatuajes que se ven; corte y tatuaje (puro)
    TrainSystem.ts        tren: estados, horario y puertas (sin Phaser)
    MetroSystem.ts        estación viva: coordina tren, pasajeros, vigilancia y microeventos
    MetroDaily.ts         estado diario con semilla, franjas, arquetipos, retrasos (puro)
    PassengerAI.ts        máquina de estados de un pasajero
    SecurityAI.ts         máquina de estados del vigilante
    MetroEventManager.ts  eventos de viaje: condiciones, cooldowns, memoria, cadenas (puro)
  entities/
    Player.ts             movimiento, orientación, animación
    NPC.ts                personaje estático interactuable
    Walker.ts             NPC que camina por puntos (pool)
    Train.ts              render del tren y sus puertas
  scenes/
    BootScene.ts          genera texturas y animaciones
    WorldScene.ts         coordina una localización cualquiera
  world/
    TextureFactory.ts     terreno, personajes, tren y props originales
    BuildingArt.ts        fachadas, tejados y rótulos por estilo de edificio
    PropArt.ts            props de calle e interiores del barrio
    UrbanArt.ts           piezas Visual V2 (design/ART_BIBLE.md): plazuela del metro
    Ambience.ts           tráfico, fuente y puertas automáticas
    Lighting.ts           color del cielo por hora, farolas y ventanas de noche; luz de cada interior
    CrowdView.ts          pinta la gente de los locales (systems/Crowd.ts)
    HumanArt.ts           personas: proporciones, peinados, poses y contorno
    paint.ts              primitivas de dibujo y fuentes de píxel
    LocationBuilder.ts    suelo y edificios horneados, props, colisiones agrupadas
    tiles.ts              leyenda de terreno y props
  ui/
    HUD.ts                reloj, dinero, energía
    DialogueBox.ts        panel de diálogo
    TargetHint.ts         coste del paso, visible antes de pagarlo
    MetroDebug.ts         panel de depuración de la estación
    Announcer.ts          megafonía
    PlaceBanner.ts        nombre del sitio al llegar
    MapScreen.ts          el mapa (M): lo dibuja, lo encuadra y responde a ratón y dedos
  data/
    locations.ts          registro: 2 distritos, 2 andenes y los interiores
    vallesco.ts           el barrio (con la Calle del Carmen): suelo, edificios, mobiliario, puntos y grafo
    interiors.ts          gimnasio, tiendas, súper, restaurante, oficinas, discoteca, barbería, estudio, cafés
    retail.ts             prendas y tiendas de ropa: qué tiene cada una y a qué precio
    tattoos.ts            zonas, diseños y estilos de tatuaje; qué ropa tapa qué zona
    appearance.ts         peinados y huecos del aspecto
    places.ts             lugares con id estable: viviendas, negocios, transporte, plaza y parque
    npcs.ts               dieciocho personajes (Marco, Iker y Rocío vigilan) + 12 aspectos de pasajero
    announcements.ts      textos de megafonía por contexto
    metroEvents.ts        16 eventos de viaje en la Línea 2
scripts/check-world.ts    recorre el mundo: todo alcanzable, grafo, lugares y cinco rutinas de NPC
scripts/check-metro.ts    varios ciclos completos del tren
scripts/simulate-metro-days.ts  npm run simulate: días completos, con checks de variedad
scripts/simulate-metro-events.ts  npm run simulate:events: años de viajes, con checks del sistema de eventos
```

## Limitaciones actuales

Conocidas y deliberadas:

- **El gráfico es provisional.** Original y coherente, pero placeholder; la
  lógica no depende de ningún sprite concreto.
- **Algunos interiores sólo se recorren.** Gimnasio y oficinas tienen mobiliario,
  personal y sus puntos, pero no hay entrenar ni trabajar, y por eso ningún botón
  lo finge. El centro de estudios, los discos y la serigrafía sólo tienen fachada.
- **La ropa no se prueba antes de comprarla.** El probador es un sitio de los
  clientes; comprar te la pone y en casa te cambias. No hay tallas, existencias
  por tienda (salvo las piezas únicas), rebajas, vender ropa usada ni ropa para
  los personajes con nombre: `Appearance` ya lo admite (`setAppearance('sara', …)`),
  falta quién lo decida.
- **Los tatuajes son un píxel de tinta.** A 16 px por persona, el diseño se lee
  por el color y el sitio, no por el dibujo. Pecho, espalda y gemelo nunca se ven
  porque no existe ropa que los deje al aire (ni pantalón corto ni ir sin
  camiseta); la regla ya lo contempla. No se borran ni se retocan.
- **La calle sólo tiene gente en Vallesco.** Ribera Norte no tiene perfil en
  `data/streets.ts` todavía. El metro circula las 24 horas; cerrarlo de
  madrugada cambiaría cómo vuelve el jugador a casa, y no está decidido.
- **Las rutinas no dependen aún de la relación con el jugador.** No existen
  relaciones ni memoria de los personajes; cuando existan, `routineFor()` es el
  único sitio donde entran. Pendientes y decisiones previas, en `TODO.md`.
- **Los bordes del barrio son invisibles en las calles.** Las calles siguen fuera
  del mapa como resto de la ciudad; el jugador se detiene en el límite.
- **La Línea 2 tiene dos paradas.** No hay red. El horario va en tiempo real
  (un tren cada 14–34 s según día y hora) y no se atiene al reloj del juego: esperar un tren son
  30–70 minutos de juego. Al entrar en una estación el primer tren tarda 2–8 s.
  El estado del tren no se guarda: cada visita empieza con la vía libre.
- **Los NPC de la estación caminan sin pathfinding.** Van en línea recta entre
  puntos definidos en `data/locations.ts` (validados en arranque) y no chocan
  entre sí; empujan al jugador pero nada los bloquea. Mientras hay un diálogo
  abierto, la estación se congela con el resto del mundo.
- **La economía es mínima.** Se gana con el turno de Decathlon y se gasta en
  tarjeta, viajes, máquina y barra del Pausa. La energía la gasta trabajar y la
  devuelve comer o beber; todavía no se duerme. Restaurante, tiendas y súper no
  venden aún: tendrán su catálogo cuando haga falta. No hay tiempo atmosférico,
  así que las terrazas dependen sólo de la hora.
- **Si se recarga la página en un sitio sin mapa**, se aparece en la estación de
  la que se salió, con el reloj ya avanzado y lo cobrado cobrado.
- **Los eventos no tienen todavía a dónde llevar.** Rumores, folletos y
  contactos (`contacto:olga-estudio`, `contacto:amparo-mercado`) quedan como
  flags para cuando existan trabajo y estudios; hoy no abren nada. No hay
  estaciones del año, reputación ni relaciones fuera de la memoria de eventos,
  así que ninguna condición depende de ellas.
- **Los NPC con nombre no tienen memoria.** Cada conversación empieza de cero.
  Los habituales del andén (Paula, Kike, Inés, Dani) siguen quietos; los que se
  mueven son los pasajeros anónimos y Marco.
- **Un mapa por barrio, sin trocear.** Vallesco (110×56, con la Calle del Carmen)
  va a 55–59 fps en la calle y a 60 dentro (Chrome de escritorio, sábado a las
  18:00), con ~220 cuerpos estáticos y ~630 objetos. Con varias veces ese tamaño tocaría trocear en zonas o
  descartar props fuera de cámara.
- **Sin audio, sin controles táctiles, sin menús.**
- El objetivo es escritorio; el canvas se adapta a la ventana, pero no hay
  interfaz pensada para móvil.

## Roadmap conceptual

No implementado. Aquí sólo para que las decisiones de hoy no lo bloqueen.

**0.2** — dar peso al tiempo: dormir en casa para pasar al día siguiente,
consumir energía por acción y recuperarla al descansar. Es el primer bucle que
convierte el reloj en una restricción real.

**Después** — trabajo y salario, estudios y habilidades, finanzas, proyectos
personales con riesgo y retorno, relaciones persistentes, eventos.

El principio que ordena todo eso: **LIFE//SIM no debe convertirse en hacer clic
en botones para subir estadísticas.** Si el jugador quiere trabajar, se desplaza
al trabajo.
