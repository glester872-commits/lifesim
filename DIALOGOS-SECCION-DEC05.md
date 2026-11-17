# DEC-05 · Diálogos contextuales por sección en Decathlon

Modo BALANCED. Rama `dec-01-atencion`, base `9add8b0` (DEC-01 a DEC-04 en commits). Sin commit.

## Fase 1 · Estado inicial

- `git status` y `git diff` iniciales: vacíos (árbol limpio en `9add8b0`).
- HUD móvil (ALPHA-09): sin constante de versión en `src`. DEC-05 sólo cambia textos dentro del menú ya verificado a 390×844 en DEC-03.

## Fase 1 · Auditoría

| Pieza | Dónde | Estado |
| --- | --- | --- |
| Sistema de preguntas (DEC-01) | `data/storeQueries.ts` `STORE_CATEGORIES`: 4 categorías, 14 preguntas (¿Dónde está…? ×6 departamentos, Ropa ×2, Probadores y cajas ×2, ¿Quién me asesora? ×4) + «Consejo de <sección>» + «Gracias, eso es todo» | EXISTE |
| Plantillas de respuesta | `STORE_REPLIES` (3 variantes por tipo de respuesta) | EXISTE, pero iguales para todas las secciones |
| Selección y anti-repetición | `StoreKnowledge.say`: hash (colaborador, pregunta, día) y, si coincide con la última frase de ese colaborador, la siguiente; `lastSaid` en memoria | EXISTE |
| Saludo | `offer.greeting` (una frase fija por sección) en `Menus.openStoreDesk` | PARCIAL: sin variantes, hora ni estado |
| Consejo de sección | `services.ts` offers `advice`: 2–3 preguntas con una sola respuesta fija | PARCIAL: sin variantes |
| Despedida | «Gracias, eso es todo» cierra en silencio | FALTA |
| Frase del NPC en la calle | `StaffRole.line` (una por rol) | — (no se toca) |
| Secciones con colaborador | montaña, running, ciclismo, fitness (vie–sáb), Reposición (general), cajas 1–6 | EXISTE |
| Secciones sin colaborador | colectivos, natación, probadores | sin voz propia |
| Estados del NPC | `Agent.state` (`WORK`, `ENTER`, `LEAVE`…), `moving`, `talking`; Reposición es una ronda; caja ocupada = `laneState` 'ocupada' (DEC-04) | EXISTE (derivable) |
| Catálogo (DEC-03) | 10 prendas en `STORES.decathlon` (Trazo, Ondra); sin bicis, balones ni material a la venta | EXISTE |
| Cajas (DEC-04) | cesta, «Pagar la cesta», autopago | EXISTE |

**Discrepancia con el ticket:** no hay «7 preguntas + Gracias»; DEC-01 tiene la estructura de arriba. DEC-05 trabaja sobre ella.

## Fase 1 · Definiciones previas

- **Secciones cubiertas** (ids de `SECTORS` o de rol): `running`, `ciclismo`, `fitness`, `montana` (sus colaboradores), `colectivos`,
  `natacion`, `probadores` (sin colaborador: sus frases salen cuando se pregunta por ellas o desde ellas) y `cajas` (los cajeros), más
  `general` (Reposición y respaldo).
- **Modelo del banco** (`data/sectionLines.ts`, TS de sólo datos, sin guardar):
  `{ id, section, kind, state?, hours?, variations: string[] }`. `kind`: `greeting` (saludo al abrir), `farewell` (al decir «Gracias,
  eso es todo»), `advice` (respuesta de cada pregunta de consejo, ahora con variantes; enlazada por id de pregunta), `tip` (coletilla
  de sección tras «¿Dónde está…?» cuando se pregunta por esa sección). `state` y `hours` opcionales: sin ellos, valen para todo.
- **Ejes:**
  - **Sección:** la del colaborador (su rol) o la sección de la que se pregunta (`tip`).
  - **Estado del NPC** (derivado, no guardado): `disponible` (por defecto), `reponiendo` (Reposición), `desplazandose` (iba andando
    cuando se le habló), `atendiendo` (cajero con alguien pagando en su caja: `laneState` 'ocupada'). Afecta al saludo.
  - **Tipo de consulta:** `greeting`, `farewell`, `advice` (por pregunta) y `tip` (por departamento). Las 14 preguntas de DEC-01 siguen
    con `STORE_REPLIES` (contenido de datos: dónde, cajas, stock), que ya varían; DEC-05 no las duplica.
  - **Hora:** franjas `manana` (9–14), `tarde` (14–19), `cierre` (19–21). Cambia el saludo («Buenos días» / «Buenas tardes» / «Cerramos
    a las nueve») y algún consejo.
- **Variaciones:** al menos 2 por combinación declarada (sección × tipo × estado × franja que exista). Selección: hash determinista
  (colaborador, consulta, día, franja) como `say`.
- **Anti-repetición:** la de `say`, ampliada a las **2 últimas** frases por colaborador (`Map` en memoria, no se guarda). Con 2 variantes,
  nunca la misma dos veces seguidas.
- **Anti-mezcla:** la selección sólo mira entradas de su `section` y su `kind`; un check recorre todas las combinaciones y comprueba que
  ninguna frase devuelta pertenece a otra sección, y que ningún texto aparece en dos secciones.
- **Fallback** (nunca mudo): exacta → sin estado → sin franja → `general` del mismo tipo → la frase fija de antes (`offer.greeting`,
  la respuesta de `advice`, cerrar sin despedida).
- **Tono:** cercano y profesional, español de España, tú. Running técnico (pisada, kilómetros); ciclismo de taller y ruta; fitness
  práctico y motivador sin gritar; montaña prudente (capas, peso, tiempo); colectivos de equipo y club; natación de piscina y
  cloro; probadores y cajas, de servicio. Nada robótico.
- **Marcas:** sólo Trazo y Ondra (DEC-03) y sólo para prendas que se venden; ningún precio fuera del catálogo; nada de tallas, bicis
  a la venta ni material deportivo comprable (no existe).
- **Formato:** `data/sectionLines.ts` (datos) + selección en `systems/StoreKnowledge.ts` (reglas), igual que DEC-01. Sin LLM ni red.
- **Cambios de sección:** (a) el jugador habla con colaboradores de secciones distintas → cada uno su banco; (b) el banco va por
  **rol** (sección del colaborador), no por tile: aunque ronde por otra sección, habla de la suya; (c) la tienda reorganizada:
  las frases se enlazan por id de sección, no por coordenadas, así que un cambio de plano no las rompe (el check lo valida contra
  `SECTORS`).
- **Bloqueos:** menú sin opción de salida, respuesta vacía o hueco `{…}` sin rellenar, o un colaborador sin saludo. El check lo recorre.
- **Formato de evidencia:** tabla al final de este archivo.

## Implementación

| Archivo | Cambio |
| --- | --- |
| `src/data/sectionLines.ts` (nuevo) | Banco: saludo, despedida, consejo y coletilla por sección, estado y franja; ≥2 variaciones. Frases: running 17, ciclismo 20, fitness 17, montaña 20, colectivos 2, natación 2, probadores 2, cajas 8, general 13 |
| `src/systems/StoreKnowledge.ts` | `sectionOfRole`, `hourBand`, `cashierBusy`, `staffState`, `line` (exacta → sin estado → sin franja → general → texto de antes), `tipFor` (dentro de un departamento, primero las secciones sin colaborador); anti-repetición con las 2 últimas frases por colaborador, compartida con `say` |
| `src/scenes/Menus.ts` | Saludo de sección (se fija al abrir), consejo con variantes, coletillas tras «¿Dónde está…?» y probadores, despedida por diálogo al decir «Gracias, eso es todo»; cajero de Decathlon con saludo por estado y despedida en «Sólo miraba» |
| `src/scenes/WorldScene.ts` | Estado del colaborador calculado antes de pararlo (`desplazandose` si andaba) y pasado a Menus |
| `src/data/services.ts` | Ids estables en las 10 preguntas de consejo (texto igual) |
| `scripts/check-section-lines.ts` (nuevo) + `package.json` | Banco, anti-mezcla, fallback, franjas, anti-repetición, coletillas alcanzables, sin tallas/precios/marcas ajenas |

Corrección 1/2: la coletilla de colectivos quedaba tapada por la de fitness (mismo departamento); `tipFor` prioriza las secciones sin
colaborador y se quitaron las coletillas de running, ciclismo, fitness y montaña (con la nueva prioridad no salían nunca y ya tienen
saludo, consejo y despedida propios). Sin marcas en las frases. Nada se guarda (`SAVE_VERSION` 5).

## Fase 4 · Evidencia

Navegador: Chrome vía DevTools, `localhost:5199`, escritorio 958×888 y móvil emulado 390×844 (DPR 3, táctil). Teléfono físico no
disponible. Ranura 3 respaldada y restaurada (día 26, 10:15, €107,50).

| Sección | Estado | Consulta | Hora | Frase obtenida | Estado | Notas |
| --- | --- | --- | --- | --- | --- | --- |
| running | disponible | saludo | 10:03 (mañana) | «Buenos días. Cuéntame cuántos kilómetros haces a la semana y lo vemos.» | PASS | navegador, E real · `DIALOGOS-SECCION-DEC05/01-running-saludo.png` |
| running | disponible | consejo «¿Cómo sé si me queda bien la zapatilla?» | mañana | «Llévate los calcetines de correr y pruébatela con ellos. Tiene que quedar un dedo de hueco delante y el talón no debe bailar.» (variante nueva) | PASS | `02-running-consejo.png` |
| running | disponible | despedida (Gracias, eso es todo) | mañana | «Suerte con los entrenos. Si algo te roza, vuelve y lo miramos.» | PASS | diálogo, se cierra con E · `03-running-despedida.png` |
| running | desplazándose | saludo | mañana | «Iba a colocar el expositor, pero dime. ¿Es para correr?» | PASS | check-section-lines |
| ciclismo | disponible | saludo | 15:03 (tarde) | «Buenas tardes. Cuéntame qué trayecto haces y te oriento.» | PASS | móvil 390×844 · `06-movil-ciclismo.png` |
| ciclismo | desplazándose | saludo | mañana | «Venía del taller, pero dime. ¿Qué le pasa a la bici?» | PASS | check |
| fitness | disponible | saludo | mañana | «Buenos días. Para empezar a moverte no hace falta mucho, ya verás.» | PASS | check |
| montaña | disponible | saludo | mañana | «Buenos días. Antes de nada, ¿adónde vas y cuánto tiempo?» | PASS | check |
| general (Reposición) | reponiendo | saludo | mañana | «Te atiendo mientras coloco esto. ¿Qué necesitas?» | PASS | check; navegador NO VERIFICADO |
| cajas | disponible | saludo | 19:38 (cierre) | «Última vuelta antes de cerrar. ¿Te cobro?» | PASS | navegador · `04-caja-cierre.png` |
| cajas | atendiendo | saludo | mañana | «Enseguida te atiendo; acabo de cobrar aquí y voy.» | PASS | check; navegador NO VERIFICADO |
| cajas | disponible | despedida (Sólo miraba) | cierre | «Vale, mira con calma. Aquí te espero.» | PASS | `05-caja-despedida.png` |
| probadores | — | coletilla | mañana | «Si están todos ocupados, espera un momento, que van rápido.» | PASS | check |
| colectivos, natación | — | coletilla en «¿Dónde está…?» | — | alcanzables tras la corrección | PASS | check |
| todas | — | variaciones ≥2 | — | todas las entradas | PASS | check |
| todas | — | anti-repetición | — | 6 llamadas seguidas sin repetir la anterior | PASS | check |
| todas | — | anti-mezcla | — | ninguna frase en dos secciones; cada selección de su sección o del general | PASS | check |
| todas | — | fallback | — | nunca vacío: general o el texto de antes | PASS | check |
| — | — | cambios de sección | — | el banco va por rol (cada colaborador habla de lo suyo aunque ronde) y por id de sección, no por coordenadas | PASS | check (rol → sección) |
| — | — | bloqueos | — | toda conversación termina (despedida con «E para cerrar»; sin huecos `{…}`) | PASS | navegador + check |
| — | — | teléfono físico | — | — | NO VERIFICADO | |

Comandos: `npx tsc --noEmit` exit 0; `npm run build` OK. Checks dirigidos exit 0: check-section-lines, check-store-knowledge,
check-decathlon, check-interaction, check-menu, check-checkout-basket, check-decathlon-sport, check-regression, check-chat. Cadena
completa de `npm run check` (146 comandos uno a uno en PowerShell; `npm run check` da EPERM en esta máquina): **146 de 146 OK**,
267 s, 2565 líneas.

**Discrepancia con el ticket:** no hay «7 preguntas + Gracias»: DEC-01 tiene 4 categorías y 14 preguntas, más el consejo y «Gracias,
eso es todo»; DEC-05 cubre esa estructura.

**Riesgo observado (de DEC-04, no de DEC-05):** en la lista de la caja la primera prenda viene marcada y una E deliberada la compra.

**Corrección 2/2 (evaluador):** frases que prometían servicios inexistentes (taller, pinchazos, revisión posterior, montaje, rutinas a
medida) reescritas: 11 frases en `sectionLines.ts`. `check-section-lines` falla ahora si una variación contiene taller, repar,
pinchaz, talla, €, precio, rutina, encarg o reserv. Tras la corrección: `tsc` 0, build OK, check-section-lines, check-store-knowledge y
check-menu OK, cadena completa **146 de 146 OK** (276 s, 2565 líneas). Veredicto del evaluador: **PASS**.
