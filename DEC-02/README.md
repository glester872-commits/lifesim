# DEC-02 · evidencias

Evidencias del rediseño espacial de Decathlon (ver `../DEC-02.md`). Ejecutadas por el orquestador el 14/11/2026; el
implementador no ejecutó nada. Las salidas completas de los checks están fuera del repo (scratchpad del orquestador).

## Capturas (Chrome vía DevTools, viewport 958×888, `npm run dev` en localhost:5199, ranura 3, viernes 7 may)

- `01-explanada.png`: fachada de Polígono Norte, llegada a la puerta (38,13).
- `02-entrada-cajas.png`: entrada en (67,50) con «Salir al aparcamiento»; banco de cajas y colas.
- `03-noroeste-running.png`: departamento NW, carteles por sección.
- `04-suroeste-futbol.png`: departamento SW, fútbol con jaulas de balones y canasta.
- `05-cajas-autopago.png`: cajas con cajeros (viernes 13:46, 5 de 6) y autopago; cartel de natación (SE) sobre el banco
  de cajas.
- `06-centro-norte-ciclismo.png`: N (tiendas de campaña y cartel de montaña), C (muros de mochilas de colores y
  góndolas), NE (bicicletas a la derecha).
- `07-movil-390x844.png`: emulación Chrome 390×844 (DPR 3, mobile + touch) dentro de la tienda: HUD superior completo,
  joystick y botón E, sin scroll horizontal (`scrollWidth` 390). Safe areas de un notch real: NO VERIFICADO en
  dispositivo físico.

Nota de entorno: con la pestaña en segundo plano Chrome baja el juego a 1 fps; hay que traerla al frente. La ranura 3 se
devolvió al estado del inicio (Día 26 · Vie 7 May · 10:15 · €107,50).

Revisión humana de las capturas: pendiente.

## Comandos

| comando | exit | nota |
| --- | --- | --- |
| `npx tsc --noEmit` | 0 | |
| `npx tsx scripts/check-decathlon.ts` | 0 | «check-decathlon: OK · calle 15 tiles del metro a la puerta · 34 secciones · 11 pasillos · 10 circuitos · 331 muebles de 32 tipos · 2936 tiles alcanzables» |
| check-uniform, check-agenda, check-population, check-places, check-navigation, check-prop-bodies, check-world, check-art, check-layers, check-persistence, check-recovery, check-save-torture, check-save-slots, check-resale, check-regression | 0 | |
| `npm run build` | 0 | aviso habitual de chunks > 500 kB |
| `npm run check` | 0 | 235 s, 2376 líneas, «fail 0» |
