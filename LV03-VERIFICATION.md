# LV-03 · Oficinas, segunda profesión y formación práctica

5 de noviembre de 2026 · rama `alpha-09-fachada` · sin commit. Entrega parcial en el orden del ticket:
**Fase 1** (auditoría y definiciones) y **Fase 2** (oficina y empleo). Fases 3 y 4 en sus secciones (ver al final); Fase 5 pendiente.

## Fase 1 — Auditoría

**Árbol al empezar:** limpio (`git status` vacío) en `86efead`. HUD móvil: ALPHA-09 en `HEAD`. Fuente externa (GitHub
#limitaciones-actuales): no consultada; se usó `README.md` § Limitaciones actuales («Las oficinas no ofrecen empleo»,
«el folleto de cursos sigue sin desbloquear una actividad»), que el código confirma.

| Sistema | Dónde | Estado |
| --- | --- | --- |
| Empleos (datos) | `src/data/jobs.ts` `JOBS`, `JobDef` | Lista con un solo empleo (Decathlon) |
| Empleos (reglas) | `src/systems/Jobs.ts`: `hire`, `hireBlocker`, `settle`, `clockInBlocker`, `work`, `promote`, `quit`, `parseJob` | Funciona; un contrato a la vez («Ya tienes otro contrato») |
| Empleo en el mapa | Interior con `workplace: <job>` y `spots: [{ job }]` (Decathlon: fichaje) → `WorldScene` → `Menus.openJob` | Funciona |
| Turno | `Menus.shiftDecision`: situación del día + `perks` abiertos por estudios → `work` → sueldo con `state.as` | Funciona |
| Agenda | `systems/Agenda.ts` (turnos, `workplace` para el viaje) y `Opportunities.ts` | Funciona |
| Estudios | `src/data/study.ts` `COURSES`/`GIGS`, `systems/Study.ts` (`enroll`, `attend`, `demo`, `deliver`, `unlocks`) | Funciona; un curso a la vez; muy ligado a fotografía (cámara prestada, prueba, encargo obligatorio) |
| Oficinas | `src/data/interiors.ts` `office` («Edificio Atalaya · planta 3»): recepción, mostrador, puestos, sala | Existe; sin empleo |
| Folleto | `src/data/metroEvents.ts` `int-folleto` → marca `folleto:cursos` | Existe (5 % en el metro); nada la lee |
| Guardado | `SaveSystem.ts` v3; `job?: JobProgress \| null` (uno), `study?: StudyState` | Funciona; LV-02 (ranuras) cerrado |

## Definiciones previas

| Tema | Decisión |
| --- | --- |
| Oficina elegida | **Edificio Atalaya · planta 3** (`office`, Vallesco). Ya tiene interior con recepción, mostrador y puestos (sin arte nuevo), está en el barrio de casa a pie y ya se dibuja como oficina. Descartadas: oficinas de otros barrios sin interior (pedirían arte) y Decathlon como segundo puesto (no sería otra profesión). |
| Empleo | «Atalaya Gestión», auxiliar administrativo: lunes a viernes, 9:00, 4 h, €36, −16 de energía; ascenso a administrativo (5 h, €52, −18). Semana: €180 en 20 h (Decathlon: €180 en 18 h). |
| Esquema / versión | **Sin campos nuevos en el guardado**: el empleo de la oficina es otro `JobDef` y su progreso cabe en el `job` de siempre (`JobProgress`, versión 3). No hay migración ni nada que LV-02 tenga que absorber. |
| Conflicto de horarios | **Un contrato a la vez** (regla existente). Para firmar en la oficina con contrato en Decathlon hay que dejar antes el puesto en su fichaje; el aviso lo dice con el nombre del sitio. **Sin multiempleo** en esta versión: dos nóminas sólo podrían venir de un contrato más un turno suelto, y el turno suelto de Decathlon se bloquea si pisa un turno del contrato (con 30 min de margen). |
| Cobro doble vs multiempleo | Cobro doble = cobrar dos veces el mismo turno (bug): `work` marca el turno del día y `clockInBlocker` impide volver a fichar. Multiempleo = dos sueldos de dos trabajos compatibles: no existe (un contrato); un turno suelto en otro sitio sin solaparse sí paga aparte, y es legítimo. |
| Oficina vs Decathlon | (1) **Horario flexible**: hasta 30 min tarde cuenta como puntual (Decathlon: 10). (2) **Sin turno suelto**: sólo se trabaja con contrato. (3) Menos cansancio físico (−16 frente a −35) y a pie (sin billete de metro). |
| Decisiones del turno | Cuatro situaciones de oficina con tres respuestas cada una; cada una cambia asistencia (ascenso/faltas), energía y, en alguna, el sueldo. Más la que abra el curso (Fase 3). |
| Curso (Fase 3) | «Ofimática y gestión» en el centro de estudios: 4 clases de tarde, €30, prueba final; beneficio: requisito para el ascenso a administrativo (`requires` en el nivel de `data/jobs.ts`; sin el curso, el menú del fichaje muestra «Hablar con Lucía: el ascenso» deshabilitado y con su motivo) y una decisión más en el turno (plus). |
| Folleto (Fase 3) | El de `int-folleto` (metro): con la marca `folleto:cursos`, la matrícula de Ofimática baja a €20 (`feeFor`/`flyer` en `systems/Study`, `folleto` en `data/opportunities`) y la ventanilla ofrece «Vengo por el folleto» (`scenes/Menus`). |
| Bloqueos | «Ya trabajas aquí.» · «Ya tienes contrato en Decathlon Polígono Norte: déjalo antes en su fichaje.» · «Después del despido, no te vuelven a contratar hasta el …» · fichar: los de siempre (pronto, tarde, sin energía). |

## Fase 2 — Oficina y empleo

Ver «Archivos» y «Pruebas» (se completan al cerrar la fase).

## Fase 3 — Curso y ascenso

Archivos: `src/data/jobs.ts` (`JobLevel.requires`, nivel `administrativo`), `src/systems/Jobs.ts`
(`promotionReady(p, unlocks)`, `promotionBlocker`), `src/scenes/Menus.ts` (`jobEntries`, `shiftDecision`,
`jobPromotion`; la opción apagada lleva el detalle «falta un curso» a la vista), `scripts/check-jobs.ts`,
`scripts/check-study.ts`, `scripts/simulate-budget.ts` (segundo argumento). Sin campos nuevos en el guardado.

Pruebas (6 nov 2026):

| Prueba | Resultado |
| --- | --- |
| `npm run build` · `tsc --noEmit` | exit 0 · exit 0 (tsc sólo cubre `src/`) |
| `check-jobs`, `check-study`, `simulate-budget`, `check-decathlon`, `check-agenda`, `check-week` | exit 0 (controles positivos: good 5 y strikes 1 con el curso → sin ascenso) |
| `npm run check` | **exit 1** en `simulate-population`: «decathlon-tienda: falta personal a las 09:50». En `HEAD` pasa. No es de esta fase: lo provoca el cambio sin commit de Decathlon (cajas 2–3 y fitness con `days` de fin de semana), y el script cuenta como obligatorio todo el personal sin `minLevel` aunque ese día no trabaje. Las 20 órdenes de detrás, lanzadas una a una: todas exit 0. **Arreglado** (a petición del usuario) en el script: el personal exigido usa `staffOnShift` con el día de apertura (Decathlon: 6 entre semana, 8 el fin de semana; si faltara el refuerzo del sábado, 6 < 8 seguiría fallando). Tras el arreglo, `npm run check` completo: **exit 0** (llega a `check-city-life`). |
| Navegador (`localhost:5199`, contexto aislado, guardado editado: Atalaya, 6 turnos buenos) | Sin curso: «2. Hablar con Lucía: el ascenso · falta un curso», apagada; al elegirla sólo sale el motivo y el nivel sigue en 0. Con `ofimatica`: «te propone un ascenso», activa, abre la propuesta (Administrativo, €52). Consola sin errores. |

## Fase 4 — Oportunidades

Archivos: `src/data/opportunities.ts` (condición `{ promotion: 'ready' }`, oportunidad `ascenso` con `via: 'place'`,
huecos `{jefe}`, `{nivel}`, `{sueldo}`), `src/systems/Opportunities.ts` (`holds` usa `promotionReady` de
`systems/Jobs.ts`; `fill` toma el empleo de la partida, `input.job?.job`, para la condición de ascenso),
`scripts/check-week.ts` (bloque «LV-03 fase 4»: Atalaya y su oferta, control positivo, negativos y Decathlon). Sin
cambios en `ui/Phone.ts` (sin entrada en `OPP_OPENS`), en el guardado ni en el estado.

Pruebas (6 nov 2026; evaluador: RETRY por las cabeceras sobre rechazar → corregido → PASS):

| Prueba | Resultado |
| --- | --- |
| `npm run build` | exit 0 |
| `check-week`, `check-agenda`, `check-jobs`, `check-study` | exit 0 |
| Mutación: rama `promotion` de `holds()` a `false` | `check-week` exit 1 («ascenso no aparece»); restaurado, exit 0 |
| Mutación: aserción de rechazo sin `decline` | `check-week` exit 1 («rechazar el ascenso lo quita»); restaurado, exit 0 |
| `npm run check` completo | exit 0 (llega a `check-city-life`); después sólo cambiaron comentarios y una aserción de `check-week`, que pasa |
| Navegador (contexto aislado; Atalaya, 6 buenos turnos, `ofimatica`) | Hoy › Puedes hacer: «Ascenso en Atalaya Gestión · Lucía quiere hablar contigo: pasas a Administrativo, €52 por turno…». Consola sin errores. Sin `ofimatica` (misma partida): no hay ascenso en Hoy; «Puedes hacer» empieza por Tarjeta de transporte. |

## Fase 5 — QA en navegador (6 nov 2026)

`localhost:5199` (dev, árbol actual), Chrome con contexto aislado `lv03f5` (la partida del usuario no se lee ni
se escribe). Teclas: `KeyboardEvent` mantenidos sobre `window`, a 51 fps con la pestaña al frente. Atajos de
preparación, dichos aquí para no confundirlos con recorrido: guardado editado (sitio y reloj) y, para el NPC y la
boca de metro, el jugador colocado junto al objetivo; la interacción, siempre con la tecla.

| Prueba (CLAUDE.md) | Resultado |
| --- | --- |
| Caminar | D 1,5 s: x 664 → 778; S: y 832 → 896 |
| Colisiones | W 5 s contra la fachada: se para en y = 824 y sigue en 824 tras 2 s más |
| Entrar y salir | E en el portal de Olmo 7 → `home`; S hasta la salida → `district` en el mismo spawn (664, 832) |
| Hablar con un NPC | E junto a un vecino: diálogo con 5 opciones; «¿Qué tal?» responde; Esc lo cierra |
| Metro | Máquina: tarjeta €12,50 una vez (€120 → €107,50, saldo €10). Andén: el tren abre puertas; destinos Ribera 15 min, Arena 60 min, €2. Vallesco → Ribera: saldo €10 → €8, llega a `ribera-station` |
| Reloj | Avanza solo (08:31 → 14:39 durante la sesión); el viaje suma sus 15 min |
| Recargar y recuperar | Antes: `ribera-station` (200, 112), €107,50, tarjeta €8, d1 14:39. Después de recargar y Continuar: igual (el reloj, 14:47: lo corrido antes del guardado) |
| Decathlon de principio a fin | Fichaje: cartel → oferta (Lun/Mié/Vie 10–16, €60, «empieza mañana») → firmar con Marta. Miércoles 09:50 (reloj editado): Fichar → situación → «Atender la cola»: 16:00, +€60 en Cuentas, energía 100 → 65, `good` 1, turno `done` |
| Partida antigua (copia de `Downloads/lifesim-alex-dia26-2026-10-27.json`, versión 1; el archivo no se toca) | La portada la lee (Alex, día 26, €986,50). Carga en Vallesco con €986,50, curso de Fotografía y 1 entrada; Hoy ofrece Decathlon **y** Atalaya; se reguarda como versión 3 con los mismos datos |
| Consola | Sin errores ni avisos en todo el recorrido |

## Pendiente

- Nada de LV-03. Sin commit.
