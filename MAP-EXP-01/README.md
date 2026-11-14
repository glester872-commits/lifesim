# MAP-EXP-01 — capturas y evidencias

- `00-luna-antes.png`: Luna antes de la ampliación (34×24, 816 tiles), Luna (28,12), vie 10:48, calidad high.
- `01-luna-plazuela.png`: Plazuela de Luna tras la ampliación.
- `02-luna-union-antigua-nueva.png`: unión entre el tramo antiguo y el nuevo.
- `03-luna-movil-390x844.png`: móvil emulado 390×844, DPR 3.
- `04-luna-noche-sabado.png`: peor caso nocturno, sábado 23:15, plazuela (46,12), 958×888, calidad high.
- `05-luna-extremo-este.png`: cámara en el extremo este (60,12), pegada al borde sin salirse.
- `06-mapa-m-luna.png`: mapa 'M' con la calle entera de 64 de ancho.

Documento completo (inventario, fórmula, modelo, fases, criterios, rendimiento, casos y riesgos): `../MAP-EXP-01.md`.

Cifras obtenidas con `scripts/check-map-scale.ts`: Luna 64×24 = 1536 tiles, escala 0.177 frente a Vallesco (8690), 27 edificios (3 con enter), 31 props, 45 points, 17.6 edificios/1000 tiles.

Rendimiento (14/11/2026, Chrome DevTools, calidad high): antes fps 57–60, agentes 3–6, objects 227, over []; después fps 56–60, agentes 5–6, objects 273–280, over [] (+23 % de objetos con +88 % de área). Umbral: fps ≥ 50, `over` vacío, objects ≤ 363, agentes ≤ BUDGETS: **PASS**. Móvil emulado: fps 55, objects 255, over [].

Peor caso nocturno (sáb 23:15 vía `state.setClock(27, 23, 15)`, sin guardar; plazuela (46,12), 958×888, high): fps 56–59 sostenido, agentes 13–23, objects 263–306, over [], p50/p95 16.7/16.8 ms: **PASS**. Encuadre de cámara (límites 1024 px = 64×16, sin salirse en el extremo este) y mapa 'M' a 64 de ancho: **PASS**.

NO VERIFICADO: teléfono físico, casos de LV-08, mediciones en calidad low.
