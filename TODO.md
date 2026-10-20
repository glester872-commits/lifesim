# TODO

Lo pendiente antes y después de la fase de personajes. El README describe lo
que existe; esto, lo que falta y por qué.

## Estado de la integración

Trabajo, cuentas, estudios, historias de Sara y Ada, vivienda, guía y oportunidades
de la primera semana están conectados. Ver `VERIFICATION-WEEK.md` para el recorrido.

Pendiente: teléfono físico y una sesión larga sin preparar posiciones ni tiempos
por depuración. Las pruebas automáticas no sustituyen esa comprobación.

## Deuda conocida

- Los extremos de las calles son un muro invisible (límite del mapa).
- Los interiores no tienen grafo: `route()` usa la cuadrícula. Basta para
  salas pequeñas; en un interior grande habría que añadir `links`.
- La caja de la tienda de ropa tapa un poco los pies de Iván.
- Un solo mapa por barrio. Con varias veces el tamaño de Vallesco habría que
  trocear por zonas o descartar props fuera de cámara.
- La Ribera, Cuatro Ríos, Velaria y Puerta Central sólo se unen por metro: no hay
  calles que crucen de un mapa a otro. Cuando dos mapas se toquen, su borde será un
  portal de calle y `systems/World.travel()` lo dará como `walk`.
- Luna sigue como estado lógico sin mapa. Arena sí tiene barrio, estadio y partido jugable.
- El móvil a tamaño de teléfono se ha probado emulado (390 × 844, táctil): guía, HUD, avisos y app Hoy. No en un
  teléfono físico; `check-input` cubre la lógica táctil.
- Agenda (`systems/Agenda.ts`): el viaje es una estimación por tiles en línea recta (+30 % de rodeo) y la espera del
  primer tren; no cuenta colas, semáforos ni a la gente que se cruza en una puerta. Entre barrios se estima en metro
  sólo entre estaciones con puerta de calle conocida; si no, dice «sin estimación». Lo perdido en un salto se avisa
  para turnos y clases; un plan del móvil o una quedada que pasa de largo la resuelven sus sistemas, sin aviso de la
  agenda. Varios avisos a la vez se juntan en un toast de cuatro líneas como mucho; el resto está en Hoy.
- Ritmo (prompt 06): con las jornadas medidas no hizo falta cambiar la velocidad global (2 min/s) ni ventanas de
  horario; lo que se comía el margen era leer lo que pasa tras un salto (≈ 10–20 min de juego por lectura) y la guía,
  y ahora no corre el reloj. Si los barrios crecen y un trayecto a pie pasa de ~30 min de juego, revisar antes la
  velocidad del jugador que el reloj.
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
- Vivienda (`systems/Housing.ts`): tres mejoras y dos casas; el catálogo está en el ordenador de cada casa y no hay
  encargos con entrega ni muebles que se muevan. Cancelar el plan de una visita el mismo día no la saca de su
  rutina (ya está en marcha: aparece y no encuentra al jugador). El alquiler nuevo se anuncia en los periodos nuevos;
  los ya anunciados no cambian. Sólo Sara y Ada visitan: son las únicas con historia.

## Historias de Sara y Ada

- Completar todas las ramas de ambos arcos en navegador, en particular los
  aplazamientos por lluvia. Se recorrieron la primera semana y la reparación
  de un plantón con Sara; eso no acredita todas las ramas. Los recorridos del motor están
  cubiertos por `check-arcs.ts`; se ha comprobado el flujo del móvil en navegador.
- Comprobar gestos en un dispositivo táctil real. Los botones se han probado con puntero
  en una ventana estrecha; eso no equivale a verificar un teléfono físico.
