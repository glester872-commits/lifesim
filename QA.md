# QA — registro de hallazgos

Bugs reproducidos, su estado y lo que queda pendiente. Gravedad: **S0** pérdida de datos / crash / bloqueo total;
**S1** recorrido principal roto o exploit económico grave; **S2** fallo funcional recuperable; **S3** visual / copia.
Lo que es una decisión de diseño y no un fallo se marca como tal y no se cambia sin decisión.

## CV-01 · diagnóstico y estabilización (2026-10-21)

**Entorno.** Commit base `5c16f6c` con el trabajo HD-03 sin confirmar en el árbol (23 archivos de `src/world`,
`entities`, `scenes`, que no se han tocado). Chrome 15x (chrome-devtools MCP), Windows 11, `vite --port 5288`.
Contextos de navegador aislados (`cv01`, `cv01-touch`, `cv01-reg`): la partida del usuario no se lee ni se escribe.
Partidas usadas: una nueva (día 1, 08:30, €120) y una **copia** de una partida antigua del usuario (día 665, esquema
de 17 campos sin `wallet`, `household`, `job`…; copia de una copia de seguridad en disco, el original no se toca).
Táctil: viewport emulado 390×844, `pointer: coarse`.

**Línea base, antes de tocar nada.** `tsc --noEmit` limpio; las 86 órdenes de `npm run check` pasan, lanzadas una a
una (`check-ambient-roles` sólo pasa al reintentar: ya se sabe que falla a ratos). Consola sin errores al arrancar.

**Recorrido hecho, con lo que se vio.**

| Área | Prueba | Resultado |
| --- | --- | --- |
| Movimiento | 120 tramos aleatorios con teclas y diagonales (~4 000 frames) contra 279 sólidos y los bordes del mapa | Nunca se solapa con un sólido ni sale del mapa |
| Puertas | 8 entradas y salidas de casa; `travel()` doble en el mismo frame; doble toque táctil al llegar | No se acumulan listeners (state, game, scale); el doble toque no rebota (bloqueo de llegada de 450 ms) |
| Metro | Sin tarjeta: opción apagada y explicada. Compra de tarjeta con triple clic; viaje con doble clic | Cobra €12,50 una vez; el viaje cobra €2 de tarjeta una vez y suma 15 min |
| Compras | Súper: compra, pan, agua ×5 | Inventario y dinero bien; céntimos redondeados |
| Actividades | Dormir con doble clic a las 00:12 | 8 h una sola vez; el reloj se retiene mientras se lee y se suelta al cerrar |
| Trabajo | Turno suelto en Decathlon (sin mapa) con doble clic; intentar encadenar | Paga €54 una vez; fuera de 08:00–16:00 se niega |
| Tiempo | Medianoche en tiempo real; salto de 2 días | Un aviso `midnight` por día; sin errores |
| Interfaz | P/M con un menú abierto; andar con el móvil abierto; foco del botón del mapa tras Esc | Nada se abre encima; no se anda; el botón pierde el foco |
| NPC | 3 000 frames en Vallesco | 0 atascados (`lifesim.npc.status()`) |
| Conversación | Sara: tema, despedida, presentación | Se cierra bien |
| Pestaña | `blur` con una tecla pulsada | El jugador se para y no sigue andando al volver |
| Táctil | Joystick y botón E en una puerta | Mueve y entra |
| Guardado | Recargar en la estación, sentado, fuera de mapa; copia de partida antigua tras metro | Todo vuelve igual; sentado aparece de pie en un tile libre |

### Bugs

| ID | Grav. | Estado |
| --- | --- | --- |
| BUG-002 | S1 | **Corregido** |
| BUG-001 | S2 | **Corregido** |
| BUG-003 | S3 | Pendiente (diseño documentado) |

**BUG-002 · Probarse una prenda y recargar la regala.** S1, exploit económico. Siempre (3/3).
- Pasos: Hilo (11:00) → perchero → una prenda que no tienes → PROBAR → cerrar o recargar la pestaña.
- Esperado: al volver llevas tu ropa de antes. Obtenido: llevas la prenda puesta, sin pagar (€120 intactos y el
  armario vacío, con el abrigo de €119 puesto).
- Causa (confirmada): la prueba vivía en el estado persistente (`appearance.player`) y sólo `WorldScene.persist()` la
  cambiaba por lo de antes; el guardado de `beforeunload` (`main.ts`) y los demás guardados de `main.ts` guardaban
  `state.snapshot` tal cual.
- Arreglo: el outfit de antes pasa a `GameState.fitting` (no se guarda) y `GameState.snapshot` guarda eso en vez de la
  prueba. Así vale para cualquier guardado. `Menus.fitting` delega en él; se quita el parche de `WorldScene.persist`.
- Evidencia: antes, tras recargar, `wearsTrial: true, money: 120, wardrobe: []`. Después, partida nueva y copia
  antigua: `wearsBefore: true`, dinero igual; comprada sí se guarda puesta.
- Partidas ya afectadas: una que se guardó con una prenda sin pagar la sigue llevando, porque la ropa inicial
  tampoco está en el armario y no se puede distinguir al cargar. No se migra.

**BUG-001 · Un reloj sin número corrompe la partida.** S2: sólo se llega desde la consola de desarrollo, pero se
pierde la partida. Siempre.
- Pasos: `lifesim.date.set()` sin argumentos o `services.state.setClock(undefined, h, m)` → recargar.
- Obtenido: el reloj queda en `NaN`, se guarda como `null`, la carga lo rechaza y la partida entera pasa a
  `lifesim.save.unreadable`. Empieza una nueva (se perdieron €107,50 y la tarjeta en la prueba).
- Causa: `TimeSystem.advanceMinutes(NaN)` no se para (`NaN <= 0` es falso) y `GameState.setClock` aceptaba cualquier
  valor.
- Arreglo: `GameState.setClock` ignora un día, hora o minuto que no sea un número finito. Todo cambio de reloj pasa
  por ahí.
- Evidencia: antes, `unreadable` con `"day":null` y partida nueva. Después, el reloj queda intacto y se guarda
  legible.

**BUG-003 · Recargar en un sitio sin mapa es una vuelta gratis.** S3. Siempre.
- En Polígono Norte (menú de Decathlon), recargar devuelve a la estación de salida sin pagar los €2 ni los 60 min de
  la vuelta. Es una decisión escrita en `GameState._offMap` («No se guarda: al recargar se vuelve a la estación»).
  Ahorra poco y no se puede repetir para ganar dinero. Arreglarlo exige guardar `offMap` y reabrir el menú al
  cargar. No se toca sin decisión de diseño.

### Regresiones

- `scripts/qa/cv01-regressions.js`: escenario de navegador para BUG-001 y BUG-002. Comprueba que el reloj sigue
  intacto y que el guardado es legible. Prueba, guarda con `beforeunload`, vuelve atrás y compra. No está en
  `npm run check` porque `GameState` importa Phaser y no carga en Node. Se ejecuta en un contexto aislado. Resultado
  del 2026-10-21: 6/6.

### Riesgos y pendientes

- Sin S0/S1 abiertos conocidos tras esta entrega. No se ha probado un teléfono físico ni una sesión larga sin
  depuración: las pruebas aceleran el reloj con `game.step` y saltan horas con `lifesim.date`.
- No probado: estadio y partido, gimnasio y entrenamientos, baloncesto, mudanza, estudios y historias completas de
  Sara y Ada. Tienen sus `check-*` en verde, pero no se han recorrido aquí a mano.
- Si una escena se cerrara con el probador abierto, `GameState.fitting` se quedaría puesto. Ningún camino del jugador
  lo hace (el menú del perchero para el mundo); sí lo haría un `teleport` de depuración.
- `check-ambient-roles` y, según notas anteriores, `check-population` y `check-arena` fallan a ratos.

**Punto de continuación.** Último cambio: `GameState.setClock` y `fitting`/`snapshot`, y `Menus.fitting` delegado.
Siguiente comprobación: ejecutar `scripts/qa/cv01-regressions.js` en un contexto aislado y repasar las áreas no
probadas de arriba.

## CV-02 · supermercado (2026-10-21)

**Hecho.** Súper Rosales (Vallesco, marca ficticia de barrio que ya existía, 09:00–22:00, domingo 10:00–15:00) tiene
catálogo propio `super-rosales`: 12 artículos de comida, bebida e higiene, todos con uso. La caja abre una ficha con
cantidad (Menos/Más, hasta lo que llega y lo que cabe), total, saldo que queda y los 2 min de caja. Se paga con
`Commerce.checkout`: valida el producto contra la lista, la cantidad entera ≥ 1, el dinero y la bolsa, y cobra y
entrega a la vez o nada. Elegir no corre el reloj (el menú para el mundo) y pagar lleva 2 min. Al pagar se vuelve a
mirar el horario, así que pasadas las 22:00 no se cobra. La comida y la bebida dan energía desde la bolsa (tecla I o
el botón nuevo «Bolsa», que en el móvil es la única forma de abrirla). La compra para cocinar va a la cocina de casa y
el gel (8 duchas por bote) a la ducha de casa: «Ducharse con gel», 20 min, +10 ⚡ frente a +6. El Colmado Ribera sigue
con el catálogo de antes (`supermarket-till`).

**Bugs hallados y corregidos durante la entrega.**

| ID | Grav. | Qué | Causa y arreglo |
| --- | --- | --- | --- |
| BUG-004 | S1 | En hora punta no se podía abrir la caja: la E hablaba con un cliente (6/6 intentos con 8–12 clientes) | Los clientes pagaban en `SUPERMARKET_TILL`, el punto desde el que paga el jugador. Ahora pagan en `SUPERMARKET_CHECKOUT` (9, 11) y hacen cola detrás. Después: 8/8 «COMPRAR». Regresión en `check-supermarket` (falla con los datos viejos) |
| BUG-005 | S2 | En pantallas táctiles no había forma de abrir la bolsa: lo comprado no se podía comer | Sólo existía la tecla I. Botón «I · Bolsa» bajo «Sonido», que pulsa la misma acción de `PlayerInput` |
| BUG-006 | S3 | La ducha con gel decía «gasta la compra» | Texto fijo en `Menus.openSpot`. Ahora dice qué gasta y cuántas quedan |

**Comprobado.** `check-supermarket` cubre saldo exacto (3 × €0,90 con €2,70), un céntimo de menos, cantidades 0,
−1, 1,5, NaN e ∞, un producto que no se vende ahí, bolsa llena, céntimos (3 × €1,45), que no muta la cartera, comer,
el gel que no se come, la ducha con gel, guardar y cargar, la caja libre y la cesta semanal (€65,60 frente a €180 del
primer empleo menos €55 de casa y €12 de metro: quedan €47,40). En el navegador, con teclado y una partida nueva:
puerta del súper, caja, ficha, doble E y doble clic en Pagar (un solo cobro), bolsa llena, insuficiente (€6 y
compra de €9), exacto (€6 en agua → €0), Esc y Volver sin cobro, ficha abierta a las 21:59 pagada a las 22:00
(negada), comer, salir andando, casa, ducha con gel, recargar. En táctil (390×844 emulado): botón de acción, toques,
botón Bolsa. Con la copia de la partida antigua: comprar gel ×2 y recargar.

**Supuestos.** La energía es la única necesidad: la comida y la bebida van a ella y el gel da más energía en la
ducha, sin crear una necesidad de higiene. La bolsa admite 12 unidades de cada cosa (16 duchas de gel). La compra
para cocinar sigue a €9 porque el presupuesto (`simulate-budget`) cuenta con ella. No hay stock.

**Pendiente.** En el móvil, el aviso «PARTIDA GUARDADA» del HUD se monta sobre el botón Mapa (S3, anterior a CV-02).
Comer o beber con la energía al tope gasta el objeto sin efecto (regla anterior, sin aviso). La ficha deja el
cursor en «Pagar». Con un doble toque real, el segundo cae sobre la lista nueva y abre otra ficha (nunca cobra dos
veces). No probado en un teléfono físico.

**Punto de continuación.** Último cambio: puntos de cola del súper y botón Bolsa. Siguiente comprobación: `npm run
check` completo y, si se quiere el mismo flujo en el Colmado Ribera, ponerle `checkout: true` a su catálogo.

## CV-03 · moda económica y grandes almacenes (2026-10-21)

**Dependencia.** La base ya existía: `Commerce.checkout` (CV-02) para pagar en caja y `Retail` para la ropa (comprar
una vez, armario, probar con restauración por `GameState.fitting`, de CV-01). No se duplica ninguna.

**Hecho.**
- **Montón · moda** (Puerta Central, Calle de la Puerta 9, fachada nueva `budget`: azul con toldo amarillo y la
  percha). Siete prendas nuevas que dibuja el render actual (2 camisetas, sudadera, plumífero, vaquero, jogger y
  zapatillas de lona), de €3,50 a €19. Es la tienda de ropa nueva más barata (`check-department`). Interior
  abarrotado con luz blanca, cuatro percheros por categoría y una mesa. La ficha de cada prenda dice ahora qué hueco
  ocupa y qué sustituye; probar y cancelar restaura lo de antes.
- **Almacenes Velarde** (Plaza de la Puerta 8, fachada nueva `department`: sillería, arcos, banda de cristal y toldo
  verde y crema). Dos departamentos. *Hogar* es un mostrador que vende la monstera (nueva, €39) y la lámpara de pie (la
  misma del catálogo de casa: se tiene una sola). *Regalos* es una caja con cantidad que vende bombones (€14) y
  colonia (€32).
- **Colocar un mueble.** Una mejora puede tener varias ranuras por casa y se elige dónde va al comprarla; las ocupadas
  aparecen apagadas diciendo qué hay. En el catálogo de casa, «Cambiar de sitio» la mueve gratis y sin copias.
  `HousingState.slots` es opcional: una partida anterior carga igual y todo sigue donde estaba (`Housing.layout`
  decide en un solo sitio qué hay en cada ranura).
- **Regalos.** `systems/Gifts.ts`. En una charla con alguien con nombre, si llevas un regalo, aparece «Dar un regalo».
  Sube amistad, confianza y ánimo, queda en su memoria («regalo: …») y sale de la bolsa. Un regalo al día por persona;
  a un desconocido, no. La charla se anota antes de darlo, para que la copia del perfil que llevaba la conversación no
  lo pise.
- **Reglas de repetición.** Ropa: una de cada (`Retail`); la pieza única, sólo una vez en el mundo. Muebles: uno de
  cada. Regalos: se acumulan hasta 3 bombones y 2 colonias en la bolsa.

**Bugs hallados y corregidos.**

| ID | Grav. | Qué | Causa y arreglo |
| --- | --- | --- | --- |
| BUG-007 | S1 | La misma clase de BUG-004 en 23 locales (cafés, mostradores de comida, cajas de tiendas pequeñas, Colmado, Velarde): con clientes en la cola, la E hablaba con ellos | Los clientes esperan sobre el tile desde el que se usa el mostrador. Arreglo general en `Interaction.pickTarget`: la caja o barra que el jugador tiene justo delante (`tileAhead`) gana. Regresión en `check-interaction` (reproduce el bloqueo sin `ahead`) |
| BUG-008 | S3 | «la esquina del salón ya la ocupa…» en minúscula | `cap()` en los avisos de `Housing` |
| BUG-009 | S2 | La víctima de un robo en la calle podía irse antes de que llegara la policía: el recorte de gente (más paseantes que el objetivo) le cortaba el rato a 1,5 s y el aviso se cancelaba | `StreetLife`: al recibir el aviso, la víctima parada espera lo que dura la respuesta, y el recorte no echa a quien espera a la policía. Lo destapó `check-police` al cambiar la gente de Puerta Central |

**Comprobado.** `check-department` cubre surtido y precios, prendas dibujables, comprar una vez, pieza única,
insuficiente, ranura ocupada, «no queda sitio», recolocar sin copias, rutas a lo esencial con cada colocación de la
planta en las dos casas, partidas antiguas, ranuras basura al cargar, regalos (desconocido, dos el mismo día, al día
siguiente, sin llevarlo) y que el regalo no se come. En el navegador, con una partida nueva y teclado:
1. Andar de la boca de metro a Montón, probar el plumífero y cancelar (se restaura).
2. Comprarlo desde la prueba (€19, una vez) y andar en las cuatro direcciones: tres frames por dirección y ninguna
   textura creada (2483 claves antes y después).
3. Salir a la calle (se ve puesto) y recargar (sigue puesto).
4. Andar a Velarde y comprar la monstera en el rincón con doble clic (un cobro) y la lámpara (repetirla se niega).
5. Comprar bombones; la colonia con €3 se niega («faltan €29»).
6. En casa, ver los dos muebles. «Cambiar de sitio» tiene la esquina apagada por la lámpara.
7. Entrar en Hilo, hablar con Sara, «Dar un regalo»: amistad 0 → 6, ánimo 50 → 60, la memoria anotada y la bolsa sin
   la caja. Recargar: todo igual.
8. Con la copia de la partida antigua: comprar la planta en Velarde y recargar.

**Pruebas recalibradas (no son regresiones).** `check-rides` buscaba dos recogidas a la vez en las semillas 1–6. Con
dos portales convertidos en tiendas, el azar cambia (medido: 24 semillas de 3 h, recogidas 79 → 74, semillas con dos a
la vez 6 → 2) y ahora busca hasta la 30; sigue comprobando coche y parada distintos. `check-police` elegía como víctima
a cualquiera parado: ahora alguien de pie en la plaza, no un cliente de terraza (a ese lo suelta la terraza al acabar).
`simulate-budget` compraba la siguiente mejora sólo con `fits`; ahora pregunta a `buyBlocker` (ranuras ocupadas).

**Supuestos.** El centro de la ciudad (Puerta Central) es donde están las dos tiendas, en dos portales que eran
residenciales (sus sitios pasan de vivienda a comercio). La «monstera» usa el prop de planta que ya existía (más
pequeño de lo que sugiere el nombre). La lámpara cuesta lo mismo en casa y en Velarde.

**Pendiente.** En Hilo, Sara dice «Estoy un poco harto» (texto de la charla anterior, en masculino; S3). El recorrido
táctil de CV-03 no se repitió: menús y diálogos usan los mismos toques que en CV-02. Recolocar con éxito sólo se
comprobó en el dominio (en la partida probada, las dos ranuras de la planta estaban ocupadas o eran la suya).

**Punto de continuación.** Último cambio: textos de regalo por artículo y `cap()` en `Housing`. Siguiente
comprobación: `npm run check` completo y recolocar con éxito en el navegador (vender la lámpara no existe:
probarlo en una partida sin lámpara).

## CV-04 · coches variados y tráfico creíble (2026-10-22)

**Qué hay de verdad.** Sólo tráfico ambiental (`systems/Traffic.ts` + `world/TrafficView.ts`): no existe conducción,
propiedad ni ningún campo de vehículo en la partida, así que no hay plazas, aceleración ni coste que diferenciar ni
tipos guardados que migrar. Los carriles son rectos (fila + sentido): no hay giros, así que «curvas» no aplica. Ya había
12 carrocerías, color ponderado, anti-clones y semilla por lugar/día/media hora.

**Hecho.** Cinco familias por datos (`ARCHETYPE_OF` en `data/vehicles.ts`): urbano (city), compacto/familiar
(hatch, wagon), SUV (suv-compact, suv), furgoneta (van), berlina/deportivo (sedan + cupé nuevo `coupe`, 44×18, techo
bajo, capó largo, sin montante B; perfil en `VehicleArt.PROFILES`, texturas cacheadas en el arranque como las demás).
Tráfico: hueco de cola según el largo (`queueGap`: 5 px por cada 40 px; autobús ≈ 12,5), `populate` no saca a nadie
encima de un peatón ni del jugador (entrada en la escena, retorno y carga), y recuperación de atascos: parado
>60 s reales sin recogida y fuera de cámara, se retira; a la vista espera siempre (nunca desaparece delante).

**Pruebas.** `check-traffic` (40 semillas sin coches sobre peatones; bloqueo de 96 s en todos los carriles: cola
esperando a la vista, retirados sólo fuera de cámara, ningún salto >3 px por frame, hueco de cola ≥ el de su largo,
nadie atascado al despejar) y `check-vehicle-variety` (las 5 familias en la jornada, ninguna >45 %; huellas:
urbano el más corto, SUV más alto que un turismo, furgoneta la más grande, cupé el más bajo). Suite completa con el
runner por comando: 88/88, sin reintentos. `npm run build` OK.

**Rendimiento** (mismo escenario: partida nueva aislada, district, día 3 08:00, junto al primer semáforo, zoom 3,
vista 319×296, 1 500 `game.step` de 16 ms; 12 núcleos, 16 GB, textura máx. 16384). Antes (HEAD 94f4e56):
2,34 ms/step media, p95 3,8, máx 6,0, 13,1 vehículos. Después: 2,34 media, p95 3,7, máx 7,5, 16,2 vehículos (otra
tirada por el catálogo nuevo). Sólo tráfico (`node scripts/bench-traffic.ts`, 20 000 frames): 8,7 → 9,9 µs/frame.
Sin regresión material.

**Recorrido** (navegador, contexto aislado). Jugador plantado en el carril 32: el compacto para a 60 px y espera 72 s
con su cola; 0 desapariciones a la vista; al apartarse, nadie queda atascado. `home` → `district` con el jugador en el
carril: ningún coche encima. Guardar, recargar: misma posición, 12 vehículos, ninguno encima, consola limpia. Paseo
con teclado (↑ 38 px, ← 73 px). Evidencia: `design/cv04/familias-x3.png` (las cinco familias junto al jugador a ×3) y
`design/cv04/calle-0824.png`.

**Supuestos.** Cupé de 18 px de alto (1,30 m frente a 1,75 m de persona); `check-traffic` le permite 18 en vez de 19.
Peso 2 (raro), más fin de semana y noche.

**Pendiente.** Táctil no repetido (el cambio no toca controles). Las familias se juzgaron a ojo en una captura, no
con un panel de personas. Con el jugador quieto en la calzada a la vista, la cola espera indefinidamente (decisión:
nada desaparece delante del jugador); no hay claxon ni rodeo porque los carriles no cambian.

**Punto de continuación.** Último cambio: registro en QA.md. Siguiente comprobación: mirar el cupé de noche (faros
del perfil bajo) y en lluvia.

## CV-06 · vecinas embarazadas y continuidad familiar (2026-10-22)

**Qué hay.** Tres vecinas adultas nuevas con rutina (Noa 32, maestra; Amaia 37, programadora en remoto; Yasmin 29,
enfermera con turnos, pareja de Iker). `data/pregnancy.ts` fija fases ficticias (decisión de diseño, no médica):
early 0–9 · mid 10–19 · late 20–27 · nacimiento el día 28 · postparto 28–48 · done. El inicio se ancla el primer
día que la partida conoce el sistema (`offset` por datos, sin tiradas): Noa ya a mitad, Amaia al principio y Yasmin
empieza 21 días después. Lo guardado (`state.pregnancy`): inicio, última fase resuelta y nacimiento con el bebé
(`bebe-<madre>`, nombre). `systems/Pregnancy.resolve` avanza fase a fase; main.ts lo llama al arrancar y en cada
medianoche y guarda antes del aviso «Barrio». Aspecto: `bump` 1–3 en `world/HumanArt` (vientre de perfil; cintura de
frente en 2–3 y de espaldas en 3), con versiones `~p1…~p3` horneadas y sus capas de tiempo. Rutinas con `stage`
(clase de preparación semanal en Forja con farmacia, días de calma al final con `pace` 0,8–0,85, postparto con un
paseo corto o en casa) y una frase contextual por fase al hablar. Sin crianza: el bebé es un hito y una referencia.

**Comprobado.** `tsc` limpio; `scripts/check-pregnancy.ts` (adultez, fases, salto de 120 días = día a día, un
nacimiento por vecina con su día, guardar y cargar antes y después sin duplicar, partida antigua sin campo, rutina
por fase). Navegador (contexto aislado `cv06`, partida nueva): registros guardados al arrancar; Noa en su banco con
`noa~p2~light`; hoja de las tres fases × 4 direcciones × de pie/andando/sentada, también con abrigo; salto de 45 días
por `clock.advanceMinutes` → 45 medianoches, un único aviso con los tres nacimientos (días 15, 26, 50) y guardado;
recarga → mismo estado y ningún aviso. Con la fase final preparada por fixture: Yasmin en su banco con `~p3`, al
hablar dice su frase de parada y la de su fase; vuelve a casa más despacio; dentro de la farmacia sigue su rutina
fuera de pantalla. Tras el ciclo, Noa sin vientre y hablando de Alba.

**Hallazgos durante el trabajo.** `check-characters` detectó semanas calcadas (Noa con una sola rutina por tipo de
día): se añadieron claustro, fin de semana en casa y postparto en casa. `check-signals` detectó cruces en rojo al
volver a casa: el semáforo de la avenida tiene un ciclo de 48 min de juego y `scheduleCrossings` sólo puede salir
antes tanto como margen tenga la parada anterior; se dio ese margen a cuatro tramos.

**Sin verificar / pendiente.** `setClock` de depuración no emite medianoches: no resuelve fases hasta la siguiente
medianoche real. Controles táctiles: no hay UI nueva y la charla usa la misma interacción; no se repasó en viewport
táctil. No hay carrito ni bebé dibujado en el postparto. Las versiones diarias (`dailyRoutine`, ±10 min) no se
comprueban contra semáforos, igual que antes para Sara y Ada.

**Punto de continuación.** Último cambio: registro en QA.md. Siguiente comprobación: verlas andar de perfil en la
calle a zoom de juego, de día y de noche.
