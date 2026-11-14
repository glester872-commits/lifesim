# BALANCE-LV10 — ¿es sostenible el bucle básico?

Fase 0 de LV-10. Antes de añadir micropréstamo o ahorro hay que saber si el juego de hoy se sostiene solo.
Fuente única: `scripts/simulate-budget.ts` (ya forma parte de `npm run check`). Precios sólo de `src/data` y `src/config`.

## Definición: «bucle básico sostenible»

Una rutina moderada de 4 semanas (trabajo del escenario, comida diaria, metro al trabajo si hay trayecto, curso
`foto-basica` la semana 1, una noche de ocio el sábado, una prenda barata de Segunda Vuelta la semana 2) cumple los tres umbrales:

| Indicador | Umbral |
|---|---|
| (a) Neto semanal | > 0 en las semanas 2, 3 y 4 (la 1 es parcial: se firma el lunes). El neto no cuenta el imprevisto, que mide (c). |
| (b) Ahorro | saldo final − saldo inicial > 0 |
| (c) Colchón | un imprevisto igual al alquiler semanal (`BILLS`, día 15) se paga y ninguna obligación de la casa llega a `late`. Se informa también del saldo mínimo desde la semana 2 expresado en semanas de gastos fijos. |

La simulación es determinista (sin `Math.random`; el script la ejecuta dos veces y compara). Los asserts del script sólo
cubren invariantes por construcción (saldo ≥ 0, conservación del dinero). Un indicador que falla se imprime como
`NO SOSTENIBLE`; no rompe el check.

## Tabla de los tres escenarios

Escenarios: Decathlon nivel 0, Atalaya nivel 0 (a pie, sin metro al trabajo) y Decathlon tras el ascenso.

Salida real de `node scripts/simulate-budget.ts` (2026-11-10, Node 24.19.0, exit 0; dos ejecuciones idénticas). La columna «compras» incluye la comida diaria, la prenda y el imprevisto.

#### Decathlon nivel 0

| semana | ingresos | vivienda | transporte | estudios | ocio | compras | saldo | notas |
|---|---|---|---|---|---|---|---|---|
| 1 | 120.00 | 55.00 | 12.00 | 30.00 | 27.00 | 63.00 | 40.50 | neto rutina -67.00; semana parcial (se firma el lunes) |
| 2 | 180.00 | 55.00 | 16.00 | 0.00 | 27.00 | 67.00 | 55.50 | neto rutina +15.00 |
| 3 | 180.00 | 55.00 | 16.00 | 0.00 | 27.00 | 108.00 | 29.50 | neto rutina +19.00; imprevisto −45.00 (incluido en compras) |
| 4 | 180.00 | 55.00 | 16.00 | 0.00 | 27.00 | 63.00 | 48.50 | neto rutina +19.00 |

- (a) neto semanal > 0 en semanas 2–4: OK (15.00 / 19.00 / 19.00)
- (b) ahorro = saldo final − inicial = 48.50 − 107.50 = -59.00: NO SOSTENIBLE
- (c) colchón: imprevisto de €45.00 el día 15 pagado, sin obligaciones en late: OK · saldo mínimo desde la semana 2 €29.50 = 0.54 semanas de gastos fijos (€55.00/semana) · pendiente de casa al final €0.00

NO SOSTENIBLE · Decathlon nivel 0: (b) ahorro -59.00 ≤ 0

#### Atalaya nivel 0

| semana | ingresos | vivienda | transporte | estudios | ocio | compras | saldo | notas |
|---|---|---|---|---|---|---|---|---|
| 1 | 144.00 | 55.00 | 4.00 | 30.00 | 27.00 | 63.00 | 72.50 | neto rutina -35.00; semana parcial (se firma el lunes) |
| 2 | 180.00 | 55.00 | 4.00 | 0.00 | 27.00 | 67.00 | 99.50 | neto rutina +27.00 |
| 3 | 180.00 | 55.00 | 4.00 | 0.00 | 27.00 | 108.00 | 85.50 | neto rutina +31.00; imprevisto −45.00 (incluido en compras) |
| 4 | 180.00 | 55.00 | 4.00 | 0.00 | 27.00 | 63.00 | 116.50 | neto rutina +31.00 |

- (a) neto semanal > 0 en semanas 2–4: OK (27.00 / 31.00 / 31.00)
- (b) ahorro = saldo final − inicial = 116.50 − 107.50 = 9.00: OK
- (c) colchón: imprevisto de €45.00 el día 15 pagado, sin obligaciones en late: OK · saldo mínimo desde la semana 2 €81.50 = 1.48 semanas de gastos fijos (€55.00/semana) · pendiente de casa al final €0.00

#### Decathlon tras el ascenso

| semana | ingresos | vivienda | transporte | estudios | ocio | compras | saldo | notas |
|---|---|---|---|---|---|---|---|---|
| 1 | 252.00 | 55.00 | 16.00 | 30.00 | 27.00 | 63.00 | 168.50 | neto rutina +61.00; semana parcial (se firma el lunes) |
| 2 | 252.00 | 55.00 | 16.00 | 0.00 | 27.00 | 67.00 | 255.50 | neto rutina +87.00 |
| 3 | 252.00 | 55.00 | 16.00 | 0.00 | 27.00 | 108.00 | 301.50 | neto rutina +91.00; imprevisto −45.00 (incluido en compras) |
| 4 | 252.00 | 55.00 | 16.00 | 0.00 | 27.00 | 63.00 | 392.50 | neto rutina +91.00 |

- (a) neto semanal > 0 en semanas 2–4: OK (87.00 / 91.00 / 91.00)
- (b) ahorro = saldo final − inicial = 392.50 − 107.50 = 285.00: OK
- (c) colchón: imprevisto de €45.00 el día 15 pagado, sin obligaciones en late: OK · saldo mínimo desde la semana 2 €155.50 = 2.83 semanas de gastos fijos (€55.00/semana) · pendiente de casa al final €0.00

## Veredicto

Regla: si algún indicador (a), (b) o (c) falla en Decathlon nivel 0 o en Atalaya nivel 0 → **BLOCKED parcial**: LV-10
no añade deuda (sin micropréstamo) hasta corregir, y se anota el parámetro que falla (ingreso `wage`/`days` en
`data/jobs.ts`, `BILLS` en `data/household.ts`, precio de comida en `data/catalogs.ts`, tarifa de metro…).
Si pasan los dos, el bucle es sostenible y se puede diseñar el producto financiero (Fase 2 en adelante).
Decathlon tras el ascenso es informativo: no bloquea.

Veredicto: **BLOCKED parcial.** El bucle de Decathlon nivel 0 no es sostenible según el criterio: en 4 semanas el
jugador pierde €59. LV-10 no introduce deuda; las fases 2–5 (ledger, micropréstamo, ahorro, QA) quedan paradas hasta que
se decida el balance.

| Escenario | (a) | (b) | (c) | Parámetro que falla |
|---|---|---|---|---|
| Decathlon nivel 0 | PASS (+15 / +19 / +19) | **FAIL** (−€59,00) | PASS, pero el saldo mínimo es €29,50 = 0,54 semanas de gastos fijos | Margen de rutina de €19/semana |
| Atalaya nivel 0 | PASS (+27 / +31 / +31) | PASS (+€9,00) | PASS (mínimo 1,48 semanas) | Ninguno; queda muy justo |
| Decathlon tras el ascenso | PASS | PASS (+€285,00) | PASS (mínimo 2,83 semanas) | (informativo) |

### Diagnóstico

- **Semana de rutina en Decathlon nivel 0:** ingresos €180 (3 turnos × €60, `data/jobs.ts`), menos casa €55 (`BILLS`),
  metro €16, comida €63 (€9 al día, `data/catalogs.ts`) y ocio €27. Margen: **€19**. La comida se lleva el 35 % del sueldo.
- **Por qué falla (b):** la semana 1 es parcial (€120) y lleva el curso de €30, así que el neto es −€67. Con el imprevisto
  de €45 de la semana 3, los márgenes de las semanas 2–4 (15 + 19 + 19 = €53) no recuperan esos €112.
- **Atalaya pasa por poco:** cobra lo mismo (5 × €36), pero va a pie (metro €4 frente a €16). Sólo ahorra €9 en 4 semanas.
- **El ascenso lo arregla:** a €84 por turno, el margen sube a €91 por semana.
- **Conclusión:** un préstamo en este punto taparía el problema que el contrato prohíbe tapar. Un jugador nuevo de Decathlon
  que hace un curso y sufre un imprevisto acaba el mes con menos dinero del que empezó. Ofrecerle crédito ahí sería deuda
  para sostener el bucle básico.
- **Palancas posibles (decisión de diseño, no aplicada):**
  - subir el sueldo de nivel 0 (p. ej. €60 → €70 da +€30 por semana);
  - abaratar la comida diaria;
  - que el curso no caiga en la semana parcial;
  - aceptar que el nivel 0 es de supervivencia y abrir el crédito sólo tras el ascenso. Esta última opción es un requisito
    de disponibilidad del préstamo, no un cambio de balance, pero no cambia que el nivel 0 no ahorre.

## Decisión del usuario (2026-11-10)

Respuesta del usuario: «solo tras ascenso». El crédito se abre sólo con un trabajo en el nivel ascendido (Decathlon
«Responsable de montaña» o el equivalente de Atalaya). En ese escenario el bucle es sostenible: ahorro de +€285 en
4 semanas y colchón mínimo de 2,83 semanas de gastos fijos. Así el préstamo no tapa el bucle del nivel 0.

Este requisito de disponibilidad no cambia el balance del nivel 0: Decathlon nivel 0 sigue en −€59 en 4 semanas. Eso
queda documentado aquí como deuda de diseño abierta, fuera de LV-10.
