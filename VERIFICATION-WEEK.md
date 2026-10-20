# Verificación de la primera semana — entregas 06 y 07

Revisión y cierre: 20 de octubre de 2026. Implementación: Phaser + TypeScript + Vite,
UI HTML/CSS, contenido procedural y estado único. Sin publicación del juego.

## Qué puede hacer el jugador

- Leer o saltar la guía inicial y recuperarla en Móvil → Hoy.
- Encontrar oportunidades de empleo, formación, contactos y mejoras sin un orden obligatorio.
- Rechazar la oferta laboral, hacer un turno suelto y contratarse más adelante.
- Consultar compromisos con lugar, hora, viaje estimado y aviso de saldo de transporte.
- Matricularse, practicar fotografía y acudir a las clases.
- Cobrar, elegir una meta, pagar cuentas y comprar una mejora real de la vivienda.
- Concertar planes con Sara o Ada que usen sus rutinas; cumplir o faltar deja un recuerdo.
- Reparar un plantón: pedir perdón y acudir al plan de arreglo.

Las oportunidades se calculan desde el estado existente, no se guardan como misiones.
Los avisos se identifican en la agenda; las historias conservan la resolución del plan.
No se cambia la velocidad global: sigue siendo 2 minutos de juego por segundo real.
La lectura tras un salto de actividad y la guía no consumen el margen del siguiente compromiso.

## Semana registrada en el navegador

Recorrido recuperado de la sesión de implementación interrumpida de Claude. Se usó
una partida de prueba independiente, acciones del juego y un piloto de teclado en
el navegador. Hubo recargas y preparación de escenarios; los segundos del piloto
se reinician al recargar y no sirven para afirmar una duración total de sesión.
Se muestran puntos observados, no valores inventados al terminar cada día.

| Día | Punto observado y acciones | Saldo | Energía | Progreso / siguiente oportunidad |
| --- | --- | ---: | ---: | --- |
| 1, lunes, 20:30 | Guía, tarjeta, metro, turno suelto, contrato, matrícula, compra, cocina y charla con Sara | €122,50 | 95 | Contrato activo; curso matriculado; Sara conocida |
| 2, martes, 21:47 | Práctica en la fuente, clase y pedir contacto | €122,50 | 90 | Fotografía 21; clase 1/4; número de Sara |
| 3, miércoles, 17:25 | Primer turno del contrato, propuesta por móvil y cuadro del Carmen | €147,50 | 65 | 1 turno bueno; mejora instalada; plan el viernes |
| 4, jueves, 20:00 | Descanso y segunda clase | €147,50 | 90 | Fotografía 33; clase 2/4 |
| 5, viernes, 20:01 | Recarga de tarjeta, segundo turno, regreso y quedada en el Pausa | €197,50 | 85 | 2 turnos buenos; plan cumplido |
| 6, sábado, 13:47 | Mensaje de seguimiento, alquiler y suministros, compra y comida | €133,50 | 100 | Debe €0; meta del abrigo alcanzada |
| 7, domingo, 06:02 | Despertar en casa tras dormir | €133,50 | 100 | Próximo turno lunes; tercera clase martes |

El registro llega al despertar del séptimo día; no se atribuye a ese registro una
tarde dominical jugada ni una semana sin ayudas. El plan cumplido se volvió a
cubrir después con la regresión de recuerdo persistente.

## Cierre de la ruta alternativa

La sesión anterior ya había comprobado con toques: saltar la guía, rechazar la oferta,
hacer el turno suelto (+€54), retomar el contrato, matricularse, consultar cuentas y
comprar una mejora. Se había detenido durante la conversación tras el plantón.

Se completó la recuperación en un servidor y origen de prueba separados:

1. Escenario: Sara con contacto y un plan pendiente en la terraza del Pausa el día 3.
2. Dejar pasar el plan y cruzar medianoche: estado `missed`, conflicto y un recuerdo negativo.
3. Acercarse a Sara, terminar la charla y elegir en la interfaz «Pedirle perdón y proponer compensarlo».
4. El juego ofrece sábado a las 11:30 en el Molinillo y lo muestra en el HUD.
5. Preparar la llegada al punto y hora acordados: Sara reconoce la asistencia;
   plan `kept`, `sara_reconciled` y eliminación de conflicto/disculpa pendiente.
6. Guardar y recargar: confianza 35, amistad 44, un evento de reconciliación y un
   recuerdo positivo del Molinillo; no se reaplica la recompensa.

Posiciones y saltos de reloj se prepararon por depuración; elección, conversación y
resolución se ejecutaron en el juego. No se afirma haber caminado manualmente todo
el trayecto de esa prueba adicional.

## Compatibilidad y comprobaciones

- `npm run check`: pasó la cadena completa de 83 comandos, incluidos agenda, semana,
  empleo, economía, guardados, historias, navegación, estadio y metro.
- Tras el último cambio: `node scripts/check-week.ts`, `node scripts/check-arcs.ts`
  y `npm run build`, correctos.
- Regresión añadida: guardar/cargar un plan cumplido conserva el recuerdo y la
  relación; volver a revisarlo no da otra recompensa. Sin huecos, no se promete plan.
- En navegador: copia sintética sin el nuevo campo `agenda`, comparada tras recargar.
  Dinero, energía, inventario, tarjetas, vivienda, fitness, relaciones/contactos,
  armario, estudios y empleo se conservaron; la guía antigua se marca `done`.
  No se leyó ni modificó una partida personal del usuario para esta prueba.
- Compilación de producción correcta. Permanece el aviso de tamaño del paquete;
  no es un fallo de compilación.

## Balance y ritmo

Las siguientes cifras son simulaciones reproducibles de los scripts, no mediciones
nuevas del tiempo de lectura de un jugador:

| Jornada | Tiempo de juego | Viaje | Esperas | Perdidos | Energía final | Fin |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Trabajo y recados | 11,9 h | 167 min | 82 min | 0 | 88 | 19:24 |
| Estudio y práctica | 13,8 h | 67 min | 387 min | 0 | 100 | 21:49 |
| Descanso y plan social | 13,2 h | 70 min | 424 min | 0 | 100 | 22:14 |

Presupuesto sin ascenso: primera semana neta −€37; semanas 2–4 +€19 por semana,
con comida diaria, vivienda, transporte y salida semanal. Saldo mínimo €70,50;
final €127,50, desde €107,50 después de comprar la tarjeta.

Simulación con decisiones de progreso: matrícula €30, ascenso día 10, cuadro día 5,
lámpara día 11 y sofá día 18; mínimo €36,50 y saldo final €216,50. Son escenarios
concretos, no una garantía para cualquier elección del jugador.

## Repetir y límites

`npm run dev`; usar una partida de prueba separada. Seguir las oportunidades de Hoy:
metro a Polígono Norte, cartel de Decathlon; centro de estudios en Calle Mayor;
Cuentas en el móvil; Sara según su localización en Hoy; ordenador y cama en casa.
P abre el móvil, M el mapa, E interactúa y avanza; las opciones aceptan número o toque.

No se acredita aceptación manual completa sin ayudas: el séptimo día registrado
llega a su despertar, la migración adicional es sintética y las pruebas táctiles
son emuladas. Quedan como validación externa una semana continua sin depuración,
un teléfono físico y todas las ramas de lluvia de ambos arcos. La implementación,
las regresiones automáticas y el cierre del plantón están comprobados con el alcance
especificado, sin presentar esos límites como pruebas realizadas.
