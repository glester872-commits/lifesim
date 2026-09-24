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
- El horario de `data/places.ts` no cierra nada en el juego: lo usan las
  rutinas futuras y `check-world`.
- La caja de la tienda de ropa tapa un poco los pies de Iván.
- Un solo mapa por barrio. Con varias veces el tamaño de Vallesco habría que
  trocear por zonas o descartar props fuera de cámara.
