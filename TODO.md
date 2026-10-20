# TODO

Lo pendiente antes y después de la fase de personajes. El README describe lo
que existe; esto, lo que falta y por qué.

## Antes de empezar personajes (decidir, no programar)

- **Escala de tiempo de los desplazamientos.** A la velocidad del jugador,
  cruzar el barrio son ~16 s reales = 32 min de juego. `npm run check` simula
  cinco rutinas y avisa: con horarios como «08:00 sale de casa, 08:10 en el
  café», los NPC llegan 9–21 min tarde. Opciones: escribir horarios con
  margen, que los NPC fuera de cámara avancen por el grafo a tiempo de juego
  comprimido, o ambas. Es una decisión de diseño, no un bug del mundo.
- **Qué pasa cuando un NPC entra en un edificio.** `worldRoute()` ya devuelve
  los tramos por localización; falta decidir si un NPC dentro de un interior
  que el jugador no visita se simula o sólo se da por "dentro" hasta su hora
  de salida.

## Fase de personajes (siguiente sistema)

- Peatones y personajes en la calle reutilizando `Walker` y `route()`; se
  suman a la lista de peatones de `Ambience` para que el tráfico y las puertas
  les respondan sin tocar ese código.
- Reserva de puntos: dos NPC no deben elegir la misma mesa (`seat`) a la vez.
  Hoy nada lo impide porque nadie los usa.
- Asociaciones persistentes `npcId → residenceId / workplaceId` sobre los ids
  de `data/places.ts`, guardadas con la partida.
- Los puestos de trabajo ocupados hoy por NPC estáticos (`GYM_STAFF`,
  `CLOTHING_STORE_STAFF`, `SUPERMARKET_CASHIER`, `RESTAURANT_STAFF`,
  `OFFICE_RECEPTIONIST`) pasarán a ser del personaje que trabaje ahí.

## Deuda conocida

- Los extremos de las calles son un muro invisible (límite del mapa).
- Ribera Norte sigue con el formato antiguo de rejilla, sin `BuildingDef`,
  puntos ni lugares.
- Los interiores no tienen grafo: `route()` usa la cuadrícula. Basta para
  salas pequeñas; en un interior grande habría que añadir `links`.
- La caja de la tienda de ropa tapa un poco los pies de Iván.
- Un solo mapa por barrio. Con varias veces el tamaño de Vallesco habría que
  trocear por zonas o descartar props fuera de cámara.
- La Ribera, Cuatro Ríos, Velaria y Puerta Central sólo se unen por metro: no hay
  calles que crucen de un mapa a otro. Cuando dos mapas se toquen, su borde será un
  portal de calle y `systems/World.travel()` lo dará como `walk`.
- Arena y Luna son estado lógico sin mapa: el partido del Arena sólo se oye en la
  megafonía del metro (y sale en `lifesim.world.now()`).
- El móvil a tamaño de teléfono no se ha probado en navegador en esta pasada (la
  ventana de pruebas no se deja redimensionar); `check-input` cubre la lógica táctil.
- Empleo (`systems/Jobs.ts`): un solo empleo. Las faltas se guardan al volver al
  Decathlon (el móvil las enseña ya repasadas, sin guardar). Los compañeros son
  líneas de diálogo; Marta no es un personaje con nombre del sistema social.
- Cuentas (`systems/Household.ts`): sólo pago manual y por obligación entera (sin
  pagos parciales ni domiciliación). Los viajes en metro se descuentan de la
  tarjeta, así que en Movimientos sólo aparecen sus recargas. Los cambios de dinero
  sin motivo (sucesos de calle, eventos del metro) salen como «Otros».
- Estudios (`systems/Study.ts`): un curso (fotografía), dos sitios de práctica y un
  encargo. El centro de estudios no tiene interior (todo se hace en su puerta) y
  Reme del horno no es un personaje: sólo su puerta. Sin cámara propia: la del
  centro se devuelve al entregar el encargo; después la fotografía sólo se usa en
  el plus del Decathlon. El folleto del metro (`folleto:cursos`) sigue sin efecto.

## Historias de Sara y Ada

- Jugar de principio a fin cada rama en navegador, incluidos los seguimientos del día
  siguiente, los plantones y el aplazamiento por lluvia. Los recorridos del motor están
  cubiertos por `check-arcs.ts`; se ha comprobado el flujo del móvil en navegador.
- Comprobar gestos en un dispositivo táctil real. Los botones se han probado con puntero
  en una ventana estrecha; eso no equivale a verificar un teléfono físico.
