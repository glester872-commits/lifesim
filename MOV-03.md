# MOV-03 — sentidos equilibrados en la demanda del metro y prioridad de bajada

Rama `alpha-09-fachada`, encima de los cambios sin commit de MOV-02. Sin commit.

## Diagnóstico

- `tripsFor` con `perStop` elige el destino uniforme entre todas las paradas. Desde `decathlon` (order 2) hay
  ~7 destinos hacia -1 y 2 hacia +1: casi toda la demanda sale hacia -1.
- `tripFor` elegía el relleno (`ends`) sin mirar el sentido, y el trip base rotando sobre `tripsAt` sin orden.
- `assignTrip` consume `tripsAt` en orden: el tren +1 encontraba pocos o ningún pasajero que quisiera subir.
- Resultado: `check-metro-demand` falla con «decathlon día 1 8h: nadie quiere 1» (bloque 7).
- Además, `assignTrip` soltaba el viaje en cuanto el walker dejaba de ser visible, también dentro del tren
  (`RIDING`) y esperando a bajar de él (`waitingForTrain`: `OFFSTAGE` con timer `Infinity`).

## Diseño

Todo en `src/systems/MetroDemand.ts`, funciones puras sin Phaser:

- `balancedDepartures(trips, stopId)`: separa las salidas en tren desde el andén por sentido
  (`Math.sign(order(next) - order(stop))`), las intercala +1/-1 (el sobrante al final de ellas) y deja el resto
  detrás en su orden. Es una permutación.
- `orderAlighting(list, stopId, shuffle)`: tres grupos, barajados por dentro: esperan tren y su viaje encaja con
  `'arrive'` aquí; el resto de los que esperan tren; los demás. Es una permutación.
- `tripFor(..., 'depart')`: el sentido sale de la paridad de `seq` (par +1, impar -1) cuando hay destinos en ese
  sentido; se aplica al trip base (rotando con `seq` sobre la lista balanceada) y al relleno. En una cabecera no
  hay destinos en uno de los sentidos y no se fija ninguno. Determinista, ids `…:f<seq>` únicos como en MOV-02.

`src/systems/MetroSystem.ts`:

- La demanda de la hora se guarda como `balancedDepartures(tripsAt(...))`.
- `releaseAlighting` usa `orderAlighting(offstage, andén, Phaser.Utils.Array.Shuffle)`; el tope (min/max+extra),
  el reparto de puertas y `alight` no cambian.
- `assignTrip`: fuera de escena sólo suelta el viaje si no está en `RIDING` ni `waitingForTrain`. Sin estados ni
  flags nuevos.

Sin `if` por estación. No se tocan tarifas, rutas, UI de LV-07, MET, cámara, noche, HUD ni `SAVE_VERSION`.

## Limitación

Cada MetroSystem es de una sola estación y su pool de bajada son pasajeros que subieron en ese mismo andén, así
que la prioridad 'arrive' puede afectar a pocos. Un pasajero que sube en un andén con un viaje 'depart' casi
nunca tiene un viaje que acabe o transborde en ese mismo andén; el grupo prioritario de `orderAlighting` sólo se
llena cuando el viaje que conserva encaja también con 'arrive' allí. El efecto real en el juego es pequeño hasta
que los pasajeros viajen entre estaciones.

## Casos

| Caso | Dónde | Resultado |
|---|---|---|
| Bloque 7: decathlon y puerta-central quieren +1 y -1 a las 8h (días 1 y 26) | `npm run check` (check-metro-demand) | pendiente de ejecución |
| (8) balancedDepartures: permutación, misma longitud y tripId | check-metro-demand | pendiente de ejecución |
| (8) decathlon y puerta-central, días 1/7/26, 8h y 18h: 'depart' balanceadas con +1 y -1 si existen ambos | check-metro-demand | pendiente de ejecución |
| (8) los dos primeros de balancedDepartures con sentidos distintos | check-metro-demand | pendiente de ejecución |
| (8) tripFor 'depart' seq 0..19, día 1 8h: aparecen los dos sentidos | check-metro-demand | pendiente de ejecución |
| (9) orderAlighting con shuffle identidad: grupos en orden, sin perder ni duplicar | check-metro-demand | pendiente de ejecución |
| Bloques 1–6 de MOV-01/MOV-02 sin relajar | check-metro-demand | pendiente de ejecución |
| Compilación | `npm run build` | pendiente de ejecución |

## Pendiente

- Viaje del jugador en el navegador: suben pasajeros en los dos sentidos, bajan con viaje coherente.
- Rendimiento: `tripFor` ahora calcula `ends` y `balancedDepartures` en cada llamada (memo de rutas, listas
  cortas); medir en hora punta.
