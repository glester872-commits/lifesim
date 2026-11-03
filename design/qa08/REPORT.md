# LIFE//SIM — QA-08

Fecha: 2026-11-02. Repositorio: C:/Users/glest/Documents/lifesim. Rama: alpha-09-fachada. Base: 736cf0a. Sin commit, push ni merge. Se conservan los cambios de academias/taekwondo que ya estaban sin confirmar.

## Correcciones y causas

- Reservas: el margen de admisión de cinco minutos se estaba utilizando como límite para volver a una clase pagada. Academy.currentClass/holdsClass separa ambos conceptos; Fitness.quote y charge reconocen la reserva hasta la siguiente clase o el cierre. Conserva la ficha y el bono existentes y los bloqueos por energía. No hay una segunda cartera.
- Cinturones: el dobok usa el grado persistente. El acabado de prendas confundía el rojo del cinturón con el color testigo de camiseta; Garments.markerColors protege ahora el cinturón. El dobok tampoco hereda el corte de sudadera. Se comprobaron los seis colores en las texturas reales.
- Combates: se conectó el núcleo pendiente a las academias mediante datos de zona, WorldScene, SparringView y SparPanel. Taekwondo ofrece frontal/circular/lateral con ambas piernas; boxeo jab/directo/gancho con ambas manos. Hay rival con IA, alcance, preparación/contacto/recogida, guardia, puntuación, dos asaltos, desempate y resultado. Cada golpe puntúa una vez. La energía disponible limita los ataques.
- Torneos: semifinal y final por disciplina, mínimo de técnica, día/horario, inscripción única, historial y premio único. El guardado previo al combate registra la eliminación provisional: abandonar o recargar un torneo pierde esa ronda, como indica el menú. Al ganar se guarda la siguiente fase. No hay premios repetibles por recargar.
- Animaciones: se conserva la escala de personajes y mundo. Patadas con extremidades más gruesas, siluetas diferenciadas y apoyo estable entre fases. El encuadre específico deja cuerpos y blancos entre el HUD y el panel tanto en escritorio como en móvil; vuelve a la cámara normal al terminar.
- Pausa: antes sólo se guardaba al ocultarse. SimulationPause coordina menú/visibilidad/pagehide, pausa la escena y limpia entradas. Volver a la pestaña no cancela una pausa manual. Una sala que termina de cargar oculta nace pausada. Los relojes de órdenes/combate limitan su primer paso a 50 ms, sin recuperar acciones omitidas.
- Teléfono: la auditoría encontró funciones reales existentes, no un teléfono ficticio. Se mantuvieron mensajes, agenda, cuentas y notas sobre el estado único; se verificó crear y guardar una nota desde su UI. Cámara y música continúan identificadas como Próximamente según las excepciones del contrato del repositorio; no se presentan como implementadas.

## QA

| Comportamiento | Resultado | Evidencia |
|---|---|---|
| Código y simulaciones existentes | PASS | npm run check: 108 comandos, salida 0; incluye población, metro, colisiones, economía, guardado, teléfono y academias |
| Tipos y producción | PASS | npm run build: tsc + Vite, salida 0; aviso de paquetes mayores de 500 kB |
| Combate y reglas | PASS | node scripts/check-sparring.ts: 40 combates completos; ataques de ambos lados, defensa, alcance, límites, resultados, torneos y persistencia |
| Clases TKD y boxeo | PASS | Navegador: saldo insuficiente sin cambios, admisión, ejercicio, resultado, salida y reserva sin nuevo cobro |
| Recarga completa TKD | PASS | Saldo 94; reserva 8280; coste de retorno 0; espera 0; sin combate temporal restaurado |
| Recarga completa boxeo | PASS | Saldo 94; reserva 9720; coste de retorno 0; espera 0; sin entrenamiento temporal restaurado |
| Torneos en navegador | PASS | Dos semifinales y dos finales resueltas contra la IA mediante PlayerInput; cuota 100 → 90, campeón 90 → 130 en cada disciplina |
| Seis cinturones | PASS | Lectura de píxeles de las texturas reales y regresión de máscara de prendas |
| Teclado y táctil | PASS | J/K mediante eventos de teclado de Chrome; dos contactos táctiles CDP en viewport 390×844, botones 166×64; lado L/R correcto |
| Pausa y visibilidad controlada | PASS | Evento de visibilidad inducido en navegador con pausa manual: reloj del combate permanece en 19100 ms; volver no lo reanuda |
| Teléfono | PASS | UI de notas → estado → guardado; check-phone y check-phone-text |
| Limpieza | PASS | Las texturas del rival desaparecen tras cada combate; git diff --check sin errores; navegador y servidor de QA propios cerrados |
| Teléfono físico, FPS móviles y suspensión prolongada del SO | NOT VERIFIED | No hay dispositivo físico; no se atribuyen FPS reales a pasos acelerados |

## Cómo se probó

Ejecutar npm run check, npm run build y node scripts/qa/run-qa08.mjs desde el repositorio. El último comando usa Chrome instalado, Vite temporal en 5198 y CDP 9335, perfil nuevo y partida independiente, y cierra ambos al acabar. No instala dependencias.

La prueba del navegador configura posiciones, fechas, saldo y técnica mediante herramientas de desarrollo; avanza Phaser con un reloj controlado. Los torneos conservan la IA y reglas reales. Se repone energía como fixture entre rondas: esto no acredita una acción de recuperación jugable. Para aislar los botones J/K/táctiles se aparta al rival y se inhibe su ataque. La comprobación de visibilidad usa un evento controlado, no una suspensión física del sistema operativo. Los seis grados se asignan como fixture visual; los requisitos de ascenso se prueban en check-taekwondo.

Recorrido manual: entrar en el dojang de Vallesco o en el club de boxeo, hablar con el instructor, abrir Combates y torneo, elegir práctica o inscribirse el día indicado. Ajustar distancia con A/D, elegir ataque con 1/2/3, atacar con J/K y mantener L para defender. En móvil usar los botones equivalentes. Al volver de un combate la ruta y la cámara se restauran.

Para comprobar una reserva: pagar al inicio de una clase, guardar/recargar, volver antes del siguiente bloque de media hora y abrir el mismo ejercicio; debe mostrar coste cero, incluso pasado el margen inicial de cinco minutos. Llegado el siguiente bloque la reserva anterior deja de cubrirlo.

## Evidencias y presupuesto

- runtime.json: resultados estructurados de la última ejecución, sin excepciones de navegador.
- combate-escritorio.png y combate-movil-emulado.png: capturas revisadas; participantes visibles por encima de los controles.
- Renderer observado: WebGL con SwiftShader en Chrome headless. La última escena de prueba tenía 152 objetos de escena, no 152 NPC.
- Se añade un único rival temporal y diez texturas de 16×24 por combate; se destruyen al terminar. No se amplía el atlas común con todas las poses nuevas de todos los NPC.
- Durante el combate supervisado la sala espera; se liquidan dos minutos del reloj al entrar. El cronómetro de asaltos se detiene con la escena. Es una decisión explícita de esta versión para reservar la zona sin introducir navegación paralela.
- Los pasos acelerados y las pruebas puras no constituyen mediciones de FPS ni memoria en un móvil físico.

## Archivos de QA-08

Reservas/estado: src/systems/Academy.ts, src/systems/Fitness.ts. Pausa: src/systems/SimulationPause.ts y src/main.ts. Combates/torneos: src/systems/Sparring.ts, src/systems/Tournaments.ts, src/world/SparringView.ts, src/ui/SparPanel.ts, src/data/academies.ts, src/data/boxing.ts. Integración: src/scenes/WorldScene.ts, src/scenes/Menus.ts, src/services.ts, index.html y src/style.css. Representación: src/world/HumanArt.ts, src/world/TextureFactory.ts, src/world/Garments.ts, src/data/npcs.ts, src/types/game.ts. UI de clase: src/ui/KickDrill.ts. Pruebas: scripts/check-academies.ts, scripts/check-sparring.ts, scripts/check-garments.ts, scripts/qa/qa08-gameplay.js, scripts/qa/run-qa08.mjs y package.json.

El resto del diff corresponde también al trabajo de academias anterior, conservado; no se ha confirmado globalmente ni atribuido todo a esta corrección.

## Pendientes

1. Validar en un teléfono físico y medir FPS/frame-time/memoria y pérdida de visibilidad prolongada.
2. Revisar el tamaño de los paquetes señalado por Vite con una tarea específica de carga, antes de optimizar sin medición.
3. Cámara y música del teléfono siguen pendientes y deshabilitadas de forma explícita.
