# Vallesco — prueba jugable 2.5D

La prueba está activada en Olmo 3, tu portal (Olmo 7) y Olmo 11, junto a la plazuela del metro. Se juega desde la partida normal, con WASD/flechas y E.

Las cubiertas se proyectan en oblicuo y las plantas superiores ganan altura. Los laterales expuestos comparten material con su fachada y reciben sombra. Cada edificio es ahora una pieza ordenada por la posición de su base: oculta a los personajes que pasan detrás, y se vuelve transparente cuando tapa al jugador. El contorno real del dibujo evita fundidos en las esquinas vacías.

Las puertas y la planta baja permanecen en sus píxeles originales. La huella de colisión, los portales, los caminos, los controles, la cámara y los datos de guardado conservan su funcionamiento. Las ventanas y rótulos nocturnos respetan la nueva profundidad.

## Implementación

- `BuildingDef.volume`: elevación, desplazamiento oblicuo y lateral visible; activación en los datos de Vallesco.
- `world/BuildingProjection.ts`: transformación en píxeles enteros con planta baja fija.
- `world/BuildingVolume.ts`: reutiliza el pintor procedural existente y genera las piezas una vez por visita; sin importar imágenes nuevas.
- `LocationBuilder`, `Occlusion` y `Lighting`: integran las piezas en las capas existentes.

El piloto admite fachadas al sur con cubierta y al menos dos plantas. Para retirarlo basta quitar las tres entradas de `VOLUMES` en `data/vallesco.ts`; las partidas no necesitan migración.

## Verificación

```sh
npm run build
npm run check:volume
npm run qa:volume
```

`qa:volume` inicia Vite en el puerto 5189 y Chrome en un perfil temporal, sin tocar la partida del navegador habitual. Produce capturas de día, noche, comparación con el dibujo anterior y oclusión en `design/volume-evidence/`, más `results.json`. Usa pasos de simulación fijos para que el movimiento y los fundidos se puedan comprobar incluso con renderizado lento por software.

La batería general del proyecto sigue siendo `npm run check`. Las capturas documentan la apariencia; `results.json` registra el recorrido específico del piloto.

### Resultado registrado

- Compilación y `check:volume`: PASS.
- Chrome/WebGL, ocho comprobaciones del piloto: PASS. Movimiento de 35,47 px, colisión respetada, entrada/salida de casa, alfa 0,45 detrás de la cubierta y 1 delante, partida recuperada y cero excepciones.
- Revisión visual: capturas diurna, nocturna, anterior y jugador detrás del tejado inspeccionadas.
- `npm run check` se interrumpió en `check-online` por EACCES en la red local del entorno restringido. La prueba online ejecutada por separado pasó; las 80 comprobaciones posteriores también pasaron (`checks.log`). La repetición de la cadena completa se canceló al no avanzar; no se registra como un PASS global.
- Durante la revisión hubo cambios paralelos de señalización del metro. Se conservaron; no forman parte del piloto.

No se hizo commit, push ni deploy.
