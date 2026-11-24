# HOSP-01 · Hospital General de Vallesco

Hospital de barrio funcional en Vallesco: edificio en la Ronda de la Vía, interior con vestíbulo, admisión, sala de
espera, dos consultas y urgencias, personal con uniforme propio y un circuito de turno real (pedir → esperar → aviso →
consulta) que se guarda con la partida. No cobra, no gasta energía y no cura: el juego no tiene salud (ver BLOQUEADO).

## Referencias (design/hospital/, 11 .webp)

| Referencia | Qué se tomó |
|---|---|
| OIP (vista aérea) | Volumen: bloque alto y alas bajas; el hospital como manzana propia, no un local de planta baja. |
| OIP (1) | Fachada blanca, cinta de cristal, letrero, marquesina y descenso o aparcamiento delante. |
| OIP (2) / OIP (3) | Urgencias: fila de camillas con barandilla, monitores y cortinas entre ellas; triaje y enfermería. |
| OIP (4) | Equipamiento de habitación: camilla, monitor en pie, carro, armario. |
| OIP (5) | Uniformes: bata blanca y pijama azul o celeste de dos piezas. |
| OIP (6) | Consulta: escritorio, silla del paciente, camilla de exploración con papel, lavabo, cortina. |
| OIP (7) | Recepción con mostrador, personal detrás y bancada metálica de espera. |
| OIP (8) | Plano por pabellones y señalización por servicios (Consultas, Urgencias, Admisión). |
| descargar | Vestíbulo de suelo claro y paredes cálidas (melocotón) con zócalo. |
| th | Quirófano: sólo como referencia; no se ha implementado. |

## Ubicación

`src/data/vallesco.ts` (coordenadas base; `widen()` las baja con el resto de la Ronda). La trasera sin puerta
`backdrop-ronda-s` [0, 69, 53, 5] se parte en cuatro:

- `backdrop-ronda-s` [0, 69, 18, 5], trasera.
- `hospital-door` [18, 69, 22, 5], frente 'n', puerta en x 28, `enter: hospital` y punto `HOSP_ENTRANCE` en (28, 68).
- `hospital-urgencias` [40, 69, 9, 5], frente 'n', puerta dibujada en x 44, sin interior: sólo `inspect`.
- `backdrop-ronda-s1` [49, 69, 4, 5], trasera hasta la comisaría (53).

Por qué aquí: era un fondo sin puerta, sin puntos ni calle. Da a la acera sur de la Ronda (fila 68), a la que se baja
desde el barrio por el pasaje y el paso de cebra (49–51). No se toca calzada, acera, portales ni edificios con función.
`HOSP_ENTRANCE` se encadena en la acera sur: `ronda-s0 → HOSP_ENTRANCE → ronda-s50`. La ambulancia (`ambulance`,
decorado) está aparcada en la calzada de servicio, en (41, 67), delante de urgencias.

Limitación: con el frente al norte, la cámara ve la fachada de canto (una fila, `facadeRows`). Puerta Central, el
«hospital del centro» de Yasmin, no tenía una manzana libre: la plaza es peatonal y las dos fachadas están llenas.

## Distribución (`src/data/hospitalVenues.ts`, 34 × 22)

- Puerta en (17, 20), entrada en (17, 19). Tabiques interiores `W`: la fila 10, con las puertas de las consultas en
  (4, 10) y (12, 10) y el paso a urgencias (19–21, 10), las columnas 8 y 16 entre consultas y la 24 que cierra admisión.
- Vestíbulo y espera: seis bancadas `hosp-seat` (dos plazas) en las filas 12 y 14, con los asientos `HOSP_WAIT_01..12`
  mirando al sur. Hay reloj, panel informativo (inspect), gel, papelera, plantas y los rótulos CONSULTAS y ADMISIÓN.
- Admisión: mostrador de 25 a 30 en la fila 14. El personal (`HOSP_ADMIN_01/02`) está detrás, en la fila 13, en un
  recinto cerrado por el tabique de x 24 con su paso en 31–32. El público (`HOSP_DESK_01/02`) va delante y hace cola en
  `HOSP_QUEUE_*`.
- Consulta 1 (x 1–7), funcional: armario, escritorio, silla del paciente (`HOSP_PATIENT_01`), lavabo, camilla de
  exploración con hueco lateral, cortina y carro. La médica está en `HOSP_DOC_01` y atiende el turno llamado.
- Consulta 2 (x 9–15), de ambiente: el mismo mobiliario y un médico en `HOSP_DOC_02`, sin interacción. Los pacientes del
  perfil se sientan en `HOSP_PATIENT_02`.
- Urgencias (x 17–32), de ambiente: rótulo URGENCIAS rojo y cuatro `er-bed` con `monitor-stand` y `curtain` entre ellas.
  Enfermería hace rondas (`HOSP_NURSE_01..04`). El triaje tiene mostrador en 29–31 de la fila 7, personal en
  `HOSP_TRIAGE_STAFF` y público en `HOSP_TRIAGE_DESK`; hay dos asientos `HOSP_ER_WAIT_*`, un carro y gel. No hay quirófano.

## Sistemas reutilizados

- `BuildingDef` y `LocationDef` (portal y spawn generados por el edificio), `room()`/`at`/`many`/`p`/`TWO` de
  data/interiors.ts.
- `PopulationProfile` (data/population.ts), `PlaceDef` (data/places.ts) y `SEATS` (data/seating.ts) para las bancadas.
- La oferta del personal (data/services.ts, `ServiceOffer` `{ kind: 'hospital'; desk }`) y su rama en
  `Menus.openOffer`, copiada de `openPoliceDesk`. Sin personal en su sitio, no hay menú.
- Reloj: `clock.advanceMinutes` y `host.persist()`, igual que la denuncia en la comisaría. Avisos: `phone.notice`
  desde main.ts, como embarazos y agenda.
- Guardado opcional, como `roommate`: GameState `get/setHospital` y `SaveSystem.parseHospital`, sin subir de versión.

## Recursos gráficos (todo procedural, paint.ts + PALETTE)

- `world/HospitalArt.ts`: `hosp-bed`, `er-bed`, `hosp-seat`, `curtain`, `med-cart`, `med-cabinet`, `sanitizer`,
  `monitor-stand`, `hosp-sign` (0 URGENCIAS rojo, 1 CONSULTAS, 2 ADMISIÓN, 3 CONSULTA 1 y 4 CONSULTA 2, con
  `drawWord`) y `ambulance`. También la pieza del edificio y su textura de luz.
- Se reutilizan `desk`, `counter`, `sink`, `clock`, `info-board`, `plant`, `bin` y `chair-up`. La cama doméstica no se
  usa.
- Edificio: `LOOKS.hospital` en world/BuildingArt.ts (fachada blanca, cristal, marquesina roja y blanca, cruz). Sin
  tendedero (`NO_LAUNDRY`).

## Archivos

- Nuevos: `src/data/hospital.ts`, `src/data/hospitalVenues.ts`, `src/systems/Hospital.ts`, `src/world/HospitalArt.ts`,
  `scripts/check-hospital.ts` y `design/HOSP-01.md`.
- Tocados: `src/types/game.ts`, `src/data/vallesco.ts`, `locations.ts`, `population.ts`, `places.ts`, `npcs.ts`,
  `districts.ts`, `seating.ts` y `services.ts`; `src/world/BuildingArt.ts`, `tiles.ts` y `PropArt.ts`;
  `src/scenes/Menus.ts`, `src/state/GameState.ts`, `src/systems/SaveSystem.ts`, `src/main.ts` y `package.json`.

## Personal y horarios

- Lugar `hospital`, de 8:00 a 21:00 todos los días. Fuera de ese horario la puerta está cerrada, como en cualquier
  interior de data/places.ts. Urgencias 24 h es la puerta lateral dibujada, con su inspect.
- Admisión: dos personas con `uniforme-admin` (la segunda sólo con afluencia media o alta), las dos con la oferta
  `hospital-desk`. Médica de la Consulta 1 (`uniforme-medico`, `hospital-doctor`) y médico de la Consulta 2. En
  urgencias, enfermería y triaje con `uniforme-enfermeria`. Los tres uniformes son compartidos: cada persona lleva su
  propia cara.
- Visitantes: paciente (admisión → espera → a veces Consulta 2), acompañante (en pareja) y alguien en urgencias (triaje →
  espera).

## Circuito

1. Admisión: **Pedir atención** da el turno N, en espera, sin coste. **Estado del turno** dice cómo va y cuánto falta.
   **¿Dónde está la consulta?** contesta «Consulta 1, al fondo a la izquierda». **Cancelar turno** lo libera. Lo que no
   aplica se ve deshabilitado con su motivo.
2. A los 45 min (`HOSPITAL_CALL_MINUTES`) el turno pasa a llamado y llega UN aviso al móvil (Hospital). Se guarda antes
   de avisar.
3. La médica de la Consulta 1 atiende sólo un turno llamado: avanza 20 min (`HOSPITAL_VISIT_MINUTES`), dice «Todo en
   orden; si algo cambia, vuelva», marca el turno como atendido y apunta el día. Sin turno, o en espera, se niega con
   claridad. Una consulta al día.
4. Si cierran las consultas con el turno pendiente, se cancela y se avisa. La salida está siempre disponible.

## Guardado

`hospital?: { ticket: { id, day, issuedAt, status } | null, lastVisitDay? }` en GameStateData. Una partida anterior
carga sin la clave. Un registro dañado se lee como «sin turno». No hay migración ni cambio de `SAVE_VERSION`.

## BLOQUEADO: efecto de salud

GameStateData no tiene salud. La consulta no cura, no cobra y no usa energía: es una revisión que queda registrada y el
médico lo dice así. Darle efecto requiere antes un sistema de salud, que está fuera del alcance de esta tarea.

## Yasmin

Yasmin (data/characters.ts) es enfermera «en el hospital del centro» y su rutina pasa por METRO_ENTRANCE. No se ha
cambiado: el personal de este hospital es genérico. La Clínica Nácar de Velaria (medicina estética) no se ha tocado.

## Limitaciones

- La fachada al norte se ve de canto. El edificio es una pieza única, como la iglesia (`drawHospital` y
  `drawEmergencyWing` en world/HospitalArt.ts, desde `bakeBuildings`). La fila de la acera lleva la cinta de cristal, la
  entrada acristalada bajo la marquesina gris y el letrero HOSPITAL GENERAL en placa azul con cruz roja. En la azotea,
  el bloque alto, más oscuro y con sombra sobre el ala, tiene helipuerto y máquinas. En la espalda, que es la que ve la
  cámara, el bloque alto lleva dos cintas de ventanal con montantes a paso irregular y las alas una más baja. El ala de
  urgencias lleva franja y letrero rojos, la puerta ancha y una cruz en la azotea, con la luz siempre encendida. El
  ruido es determinista; no hay rejillas de 2 tiles.
- Las consultas van numeradas con `hosp-sign` 3 y 4 (CONSULTA 1 y CONSULTA 2). En paint.ts se ha añadido el glifo «1»;
  el «2» ya existía.
- Los tabiques interiores `W` dentro de un interior son nuevos en el proyecto: hay que revisarlos en pantalla.
- Urgencias y la Consulta 2 son de ambiente, sin interacción. No hay quirófano.

## Correcciones (ciclo 2)

- Banda negra en la espalda: en las alas bajas y en el ala de urgencias, las filas entre la azotea y la fachada quedaban
  sin pintar. Ahora llevan azotea hasta la cornisa, la cornisa (`PALETTE.stoneLit`) y una sombra suave sobre la pared
  (`lowBack`). Las cintas de ventanal son algo más claras.
- Entradas: la principal está centrada en la columna de la puerta (x 28 del barrio), con marquesina azul y placa blanca
  con cruz roja, pilares, cristal fijo, puertas dobles de marco claro, felpudo y rampa. La de urgencias es igual, más
  corta, con la marquesina roja.
- `hosp-bed`: tapizado vinílico verde clínico, cabecero inclinado sin almohada, papel del rollo a lo largo, patas de
  acero a la vista y escalón. Es distinta de `er-bed`, que es gris y azul y lleva barandillas.
- Ambulancia: vista desde arriba en una sola fila (`tilesHigh: 1`). Ya no asoma al carril bici, así que nadie se dibuja
  sobre su techo. Debajo hay una dársena pintada (`ambulance-bay`, plana) con el rayado y AMBULANCIAS.
- Urgencias: `monitor-stand` ya no tiene luz (eran los halos detrás de los boxes). La luz interior son tres
  `tube-light` en el vestíbulo y la espera.
- Textos: el título de Admisión sale una vez. El saludo depende de la hora (Buenos días, Buenas tardes o Buenas
  noches) y la línea del personal es neutra. «Hoy ya ha pasado consulta. Si algo cambia, vuelva mañana.» La médica
  termina en «Todo en orden; si algo cambia, vuelva», sin la línea suelta de la hora.
- Tildes: `paint.drawWord` normaliza a NFC y, con `raised`, pinta la tilde por encima de la letra entera (ADMISIÓN).
  Las placas del metro no cambian.

## Pruebas y capturas

### Quality gate (ciclo 2)

- `tsc` y `npm run build`: EXIT 0.
- Cadena `check` (156 comandos, ejecutados uno a uno): 155 en EXIT 0. `check-regression` falla igual en HEAD `81d9cd8`.
  El fallo es previo y no se debe a HOSP-01.
- OK: `check-hospital`, `check-building-volume`, `check-seats`, `check-prop-bodies`, `check-places`, `check-art`,
  `check-station-signage`, `check-station-variety`, `check-sidewalks`, `check-districts` y `check-world`.

### Capturas (`design/hospital-evidence/`)

| Archivo | Qué muestra |
|---|---|
| `01-hospital-desde-calle.png` | Ciclo 1: el hospital desde la Ronda, todavía con la banda negra en la espalda (corregida en el ciclo 2). |
| `02-entrada-noche.png` | 22:13. Ya sin banda. Urgencias iluminado y el bloque principal apagado tras el cierre de las consultas. |
| `03-fachada-completa.png` | Marquesina azul con cruz, puertas dobles de cristal y la dársena de la ambulancia con su rayado amarillo. |
| `04-vestibulo-interior.png` | La espera con pacientes, las consultas 1 y 2 con la camilla verde, urgencias, el rótulo ADMISIÓN con tilde y el personal tras el mostrador. |
| `12-consulta-atencion.png` | Ciclo 1: la médica atendiendo («Tensión bien…»). |
| `13-movil.png` | 390 × 844: el hospital en el borde inferior, bajo el joystick y el botón E. |

### Juego en el navegador (verificado por el orquestador)

PASS en:

- Entrar y salir del hospital.
- El menú de Admisión.
- Turno en espera que pasa a llamado a los 45 min, con UN solo aviso: «Turno 2: le llaman a la Consulta 1…».
- La consulta: +20 min de reloj, sin cambios de dinero ni de energía.
- La negativa de la médica sin turno.
- El rechazo de un segundo turno el mismo día.
- La cancelación.
- Recargar la partida en 'called' sin que se repita el aviso.
- Consola sin errores.

Los textos nuevos del ciclo 2 se verificaron en el diff.

### visual-qa

PASS 7/7. Apunte menor: una `tube-light` cae sobre la fila de sillas de la espera.

### Rendimiento (con la ventana visible)

- Calle: 60 fps (agents 40, vehicles 20, objects 1387).
- Interior: 59–60 fps (agents 15, objects 333).
- Control: 57–60 fps. Over vacío. Heap 320 MB.
- Bundle: +3,26 kB en TextureFactory.

### No verificado

- Llegar andando desde lejos: se usó teleport a pocos tiles de la puerta.
- El cierre de las 21:00 en vivo. Sí está cubierto en `check-hospital`.
- El control táctil real.

### BLOQUEADO por diseño

GameStateData no tiene condición de salud, así que la consulta no cura: es una revisión registrada (ver «BLOQUEADO:
efecto de salud»).
