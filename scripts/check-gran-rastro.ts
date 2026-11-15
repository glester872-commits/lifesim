// CAS-02 · El Gran Rastro del Casco Antiguo (data/popups.ts 'gran-rastro', systems/PopUps): `npm run check`.
// Falla si no se monta todos los domingos y sólo los domingos, si el montaje y la recogida no son graduales, si algún
// puesto cae en una puerta, en un punto, en un tramo de la red, en la calzada o en la ruta de limpieza, si con lluvia
// fuerte se monta o el tablón no lo dice, si no es determinista o si el mercadillo del Carmen cambia.
import assert from 'node:assert/strict';
import { POPUPS } from '../src/data/popups.ts';
import { getLocation, ROADWAY } from '../src/systems/LocationSystem.ts';
import { activePopUp, piecesShown, popUpLitter, popUpProgress, popUpStalls, upcoming, visiblePopUp } from '../src/systems/PopUps.ts';
import { Litter, LITTER_CAP } from '../src/systems/Litter.ts';
import { forceWeather } from '../src/systems/Weather.ts';
import { weekIndex } from '../src/systems/Calendar.ts';
import { boardAt } from '../src/systems/Boards.ts';

const ID = 'casco-antiguo';
const SUNDAY = 6; // Calendar.weekIndex: 0 lunes … 6 domingo; el día 1 de la partida es lunes, así que el 7 es domingo.
/** Ancho de un puesto en tiles (PIECE_SIZE de las cuatro familias: 32 px), desde su ancla hacia la derecha. */
const STALL_TILES = 2;
const loc = getLocation(ID);
const def = POPUPS.find((p) => p.id === 'gran-rastro')!;
assert.ok(def && def.location === ID && def.days.length === 1 && def.days[0] === SUNDAY && def.chance === 1, 'el Gran Rastro no es fijo cada domingo');
const stalls = popUpStalls(def);
const total = stalls.length;
const at = (day: number, hh: number, mm = 0) => ({ day, hour: hh, minute: mm });
const shownAt = (day: number, hh: number, mm = 0): number => {
  const now = popUpProgress(ID, at(day, hh, mm));
  return now && now.def.id === def.id ? piecesShown(now.progress, total) : 0;
};

// ------------------------------------------------ cuántos y cuáles
assert.ok(total >= 30 && total <= 45, `${total} puestos`);
assert.equal(new Set(stalls.map((s) => s.id)).size, total, 'ids de puesto repetidos');
assert.ok(stalls.every((s) => !s.id.includes('.access.')), 'un puesto en un acceso');

// ------------------------------------------------ domingo: montaje, venta, recogida
forceWeather({ rain: 0, cloud: 0, celsius: 20, wet: 0 });
for (const day of [7, 14, 21, 70]) {
  assert.equal(weekIndex(day), SUNDAY);
  assert.equal(shownAt(day, 6, 59), 0, `día ${day} 06:59: ya hay puestos`);
  const early = shownAt(day, 7, 0);
  assert.ok(early > 0 && early < total, `día ${day} 07:00: montaje no parcial (${early}/${total})`);
  assert.ok(shownAt(day, 8, 0) > early, `día ${day}: el montaje no avanza`);
  assert.ok(shownAt(day, 8, 59) >= total * 0.9, `día ${day} 08:59: faltan puestos (${shownAt(day, 8, 59)})`);
  assert.equal(activePopUp(ID, at(day, 8, 59)), undefined, 'gente antes de abrir');
  for (const [h, m] of [[9, 0], [12, 0], [14, 59]] as const) {
    assert.equal(activePopUp(ID, at(day, h, m))?.id, def.id, `día ${day} ${h}:${m}: no está en marcha`);
    assert.equal(shownAt(day, h, m), total, `día ${day} ${h}:${m}: no están todos`);
  }
  assert.equal(activePopUp(ID, at(day, 15, 0)), undefined, 'a las 15:00 sigue la venta');
  assert.equal(visiblePopUp(ID, at(day, 15, 0))?.id, def.id, 'a las 15:00 ya no se ve nada');
  const late = shownAt(day, 16, 59);
  assert.ok(late > 0 && late <= total * 0.1, `día ${day} 16:59: quedan ${late}`);
  // CAS-06: de 17 a 20:30 está la Sobremesa del Rastro (sin piezas); lo que no puede seguir puesto es el Rastro.
  for (const [h, m] of [[17, 0], [18, 0], [23, 30]] as const) assert.notEqual(visiblePopUp(ID, at(day, h, m))?.id, def.id, `día ${day} ${h}:${m}: sin recoger`);
}

// ------------------------------------------------ de lunes a sábado, nada
for (let day = 1; day <= 8 * 7; day++) {
  if (weekIndex(day) === SUNDAY) continue;
  for (let h = 0; h < 24; h += 0.5) {
    const c = at(day, Math.floor(h), (h % 1) * 60);
    assert.equal(visiblePopUp(ID, c), undefined, `día ${day} ${h}: puestos fuera del domingo`);
    assert.equal(activePopUp(ID, c), undefined, `día ${day} ${h}: rastro fuera del domingo`);
  }
}
// CAS-06: el domingo también sale la Sobremesa del Rastro; el Rastro sigue siendo uno por semana.
assert.ok(upcoming(ID, 1, 28).every((e) => weekIndex(e.day) === SUNDAY) && upcoming(ID, 1, 28).filter((e) => e.id === def.id).length === 4, 'el calendario no es un domingo por semana');

// ------------------------------------------------ dónde: ni puertas, ni puntos, ni red, ni calzada, ni limpieza
const doors = new Set<string>();
for (const b of loc.buildings ?? []) {
  assert.ok(b.front === 's' || b.front === 'n', `${b.id}: fachada ${b.front} sin comprobar`);
  const y = b.front === 's' ? b.ty + b.h - 1 : b.ty;
  const out = b.front === 's' ? y + 1 : y - 1;
  doors.add(`${b.doorX},${y}`).add(`${b.doorX},${out}`);
}
const points = loc.points ?? {};
const pointAt = new Set(Object.values(points).map((p) => `${p.tx},${p.ty}`));
/** Los tiles que pisa un tramo, con el mismo muestreo que LocationSystem.lineClear y check-boards. */
const traced = (a: string, b: string): Set<string> => {
  const A = points[a];
  const B = points[b];
  const out = new Set<string>();
  const steps = Math.max(1, Math.ceil(Math.hypot(B.tx - A.tx, B.ty - A.ty) * 4));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    out.add(`${Math.floor(A.tx + 0.5 + (B.tx - A.tx) * t)},${Math.floor(A.ty + 0.5 + (B.ty - A.ty) * t)}`);
  }
  return out;
};
// Tolerancia de una tile: un puesto puede quedar pegado a un tramo (en la tile de al lado), nunca en una que pise.
const network = new Set<string>();
for (const [a, b] of loc.links ?? []) for (const k of traced(a, b)) network.add(k);
const cleaning = new Set<string>();
for (const [a, b] of [['cas-n21', 'cas-m21'], ['cas-m21', 'cas-plaza'], ['cas-plaza', 'cas-s21']]) for (const k of traced(a, b)) cleaning.add(k);
for (const s of stalls) {
  for (let dx = 0; dx < STALL_TILES; dx++) {
    const k = `${s.tx + dx},${s.ty}`;
    const ch = loc.ground[s.ty]?.[s.tx + dx];
    assert.ok(ch !== undefined, `${s.id} se sale del mapa`);
    assert.ok(!ROADWAY.has(ch), `${s.id} en la calzada (${k})`);
    assert.ok(!doors.has(k), `${s.id} en una puerta (${k})`);
    assert.ok(!pointAt.has(k), `${s.id} encima de un punto (${k})`);
    assert.ok(!network.has(k), `${s.id} en un tramo de la red (${k})`);
    assert.ok(!cleaning.has(k), `${s.id} en la ruta de limpieza (${k})`);
  }
}

// ------------------------------------------------ familias y zonas
const byFamily = new Map<string, number>();
const byZone = new Map<string, Set<string>>();
const zoneCount = new Map<string, number>();
for (const s of stalls) {
  byFamily.set(s.piece, (byFamily.get(s.piece) ?? 0) + 1);
  byZone.set(s.zone, (byZone.get(s.zone) ?? new Set<string>()).add(s.piece));
  zoneCount.set(s.zone, (zoneCount.get(s.zone) ?? 0) + 1);
}
assert.ok(byFamily.size >= 4, `sólo ${byFamily.size} familias`);
for (const zone of ['plaza', 'calleMayor', 'calleSecundaria']) {
  for (const f of byFamily.keys()) assert.ok(byZone.get(zone)?.has(f), `${zone} sin ${f}`);
}

// ------------------------------------------------ lluvia fuerte: ni se monta ni se anuncia como en marcha
forceWeather({ rain: 0.9, cloud: 1, celsius: 12, wet: 0.9 });
for (const [h, m] of [[7, 30], [11, 0], [16, 0]] as const) {
  assert.equal(activePopUp(ID, at(7, h, m)), undefined, `con lluvia a las ${h}:${m} hay rastro`);
  assert.equal(visiblePopUp(ID, at(7, h, m)), undefined, `con lluvia a las ${h}:${m} hay puestos`);
}
const board = loc.props.find((p) => p.kind === 'notice-board')!;
const wet = boardAt(ID, board.tx, board.ty, at(7, 11)).sections.flatMap((s) => s.entries).find((e) => e.label === def.name);
assert.ok(wet && wet.state === 'cancelled' && wet.detail === 'suspendido por la lluvia', `tablón con lluvia: ${wet?.state} ${wet?.detail}`);
forceWeather({ rain: 0, cloud: 0, celsius: 20, wet: 0 });
const dry = boardAt(ID, board.tx, board.ty, at(7, 11)).sections.flatMap((s) => s.entries).find((e) => e.label === def.name);
assert.equal(dry?.state, 'active', 'el tablón no dice que está en marcha');

// ------------------------------------------------ basura de después: surge 2 de 15:00 a 18:00 (systems/Litter)
for (const [h, m] of [[15, 30], [17, 30]] as const) assert.equal(popUpLitter(ID, at(7, h, m)), 2, `domingo ${h}:${m}: sin basura de más`);
for (const [h, m] of [[8, 0], [18, 30]] as const) assert.equal(popUpLitter(ID, at(7, h, m)), 1, `domingo ${h}:${m}: basura de más`);
for (let day = 1; day <= 4 * 7; day++) if (weekIndex(day) !== SUNDAY) assert.equal(popUpLitter(ID, at(day, 16)), 1, `día ${day} 16:00: basura de más`);
assert.equal(popUpLitter('district', at(7, 16)), 1, 'basura de más en el distrito');
forceWeather({ rain: 0.9, cloud: 1, celsius: 12, wet: 0.9 });
assert.equal(popUpLitter(ID, at(7, 16)), 1, 'con lluvia, basura de mercadillo');
forceWeather({ rain: 0, cloud: 0, celsius: 20, wet: 0 });
// La calle de verdad: el pico entre 15:00 y 18:00 de cuatro domingos contra los jueves de esas semanas, a la misma hora.
const litterPeak = (day: number): number => {
  const litter = new Litter(loc);
  let peak = 0;
  for (let min = 15 * 60; min < 18 * 60; min++) {
    litter.update(at(day, Math.floor(min / 60), min % 60), () => 2);
    assert.ok(litter.size <= Math.round(LITTER_CAP * 2), `día ${day}: ${litter.size} piezas, por encima del tope`);
    peak = Math.max(peak, litter.size);
  }
  return peak;
};
const sundayPeak = [7, 14, 21, 28].reduce((n, d) => n + litterPeak(d), 0);
const weekdayPeak = [4, 11, 18, 25].reduce((n, d) => n + litterPeak(d), 0);
assert.ok(sundayPeak > weekdayPeak, `tras el rastro ${sundayPeak} piezas de pico, un jueves ${weekdayPeak}`);

// ------------------------------------------------ determinismo
const snapshot = (): string =>
  JSON.stringify([7, 14].flatMap((d) => [6.9, 7, 8, 9, 12, 15, 16, 17].map((h) => [d, h, shownAt(d, Math.floor(h), Math.round((h % 1) * 60)), activePopUp(ID, at(d, Math.floor(h)))?.id ?? '-'])));
assert.equal(snapshot(), snapshot(), 'misma hora, distinto rastro');

// ------------------------------------------------ el mercadillo del Carmen, igual que antes
const market = upcoming('district', 1, 364).find((e) => e.id === 'vintage-market')!;
assert.ok(market, 'el mercadillo vintage ya no sale en un año');
// Abre a las 11:00 con hora y media de montaje (9:30) y media hora de recogida por defecto (19:00).
assert.equal(visiblePopUp('district', at(market.day, 9, 29)), undefined, 'el mercadillo se monta antes de tiempo');
assert.equal(visiblePopUp('district', at(market.day, 9, 30))?.id, 'vintage-market', 'el mercadillo no se monta hora y media antes');
assert.equal(activePopUp('district', at(market.day, 18, 29))?.id, 'vintage-market');
assert.equal(visiblePopUp('district', at(market.day, 18, 59))?.id, 'vintage-market', 'el mercadillo no se recoge en media hora');
assert.equal(visiblePopUp('district', at(market.day, 19, 0)), undefined, 'el mercadillo se recoge más de media hora');
forceWeather(null);

console.log(
  `check-gran-rastro: ${total} puestos · familias ${[...byFamily].map(([f, n]) => `${f} ${n}`).join(', ')} · ` +
    `zonas ${[...zoneCount].map(([z, n]) => `${z} ${n}`).join(', ')} · 07:00 ${shownAt(7, 7)} · 08:59 ${shownAt(7, 8, 59)} · 16:59 ${shownAt(7, 16, 59)}`,
);
