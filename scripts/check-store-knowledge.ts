// DEC-01 · Atención al cliente en Decathlon: `npm run check`. Las respuestas salen del plano, los turnos y el género:
// cada sección se encuentra por su centro, la dirección es coherente con dónde está quien contesta, toda sección tiene
// su «dónde», las cajas abiertas son las de su `open` (nunca el autopago), no se habla de prendas que no se venden ni
// de tallas, la misma pregunta seguida no repite frase y ninguna categoría pasa de seis opciones.
import assert from 'node:assert/strict';
import { DECATHLON_PROFILE, DECATHLON_STORE, SECTORS, sectorAt } from '../src/data/decathlon.ts';
import { DECATHLON_LAYOUT } from '../src/data/decathlonLayout.ts';
import { STORE_CATEGORIES, type StoreQuery } from '../src/data/storeQueries.ts';
import { STORES, getGarment, getStore } from '../src/data/retail.ts';
import { getOffer } from '../src/data/services.ts';
import { LEVELS, type Level } from '../src/config/population.ts';
import { answer, centerOf, departmentOf, heading, labelOf, openCheckouts, pathTo, whereIs, type Asker } from '../src/systems/StoreKnowledge.ts';
import type { TilePoint } from '../src/types/game.ts';

// 1 · sectorAt en el centro (redondeado) de cada sección; cada sección, en un departamento.
assert.equal(SECTORS.length, 34, 'secciones');
for (const s of SECTORS) {
  const c = centerOf(s.rect);
  assert.equal(sectorAt(Math.floor(c.x), Math.floor(c.y))?.id, s.id, `${s.id}: sectorAt en su centro`);
  assert.ok(departmentOf(s.id), `${s.id}: sin departamento`);
  assert.ok(whereIs(s.rect).trim(), `${s.id}: sin «dónde»`);
}

// 2 · Dirección no vacía y coherente desde varios sitios (la entrada, los puestos del personal, una esquina del fondo).
const froms: TilePoint[] = [DECATHLON_STORE.spawns.entry, { tx: 2, ty: 3 }, { tx: 40, ty: 22 }];
for (const role of DECATHLON_PROFILE.staff) for (const id of role.points) {
  const pt = DECATHLON_STORE.points?.[id];
  if (pt) froms.push(pt);
}
for (const from of froms) for (const s of SECTORS) {
  const to = centerOf(s.rect);
  const text = pathTo(from, to);
  assert.ok(text.trim(), `${s.id}: dirección vacía`);
  const { h, v } = heading(from, to);
  assert.equal(text.includes('izquierda'), h === 'izquierda', `${s.id} desde ${from.tx},${from.ty}: izquierda («${text}»)`);
  assert.equal(text.includes('derecha'), h === 'derecha', `${s.id} desde ${from.tx},${from.ty}: derecha («${text}»)`);
  assert.equal(text.includes('fondo'), v === 'fondo', `${s.id} desde ${from.tx},${from.ty}: fondo («${text}»)`);
  assert.equal(text.includes('entrada'), v === 'entrada', `${s.id} desde ${from.tx},${from.ty}: entrada («${text}»)`);
  if (h === 'izquierda') assert.ok(to.x < from.tx);
  if (h === 'derecha') assert.ok(to.x > from.tx);
  if (v === 'fondo') assert.ok(to.y < from.ty);
  if (v === 'entrada') assert.ok(to.y > from.ty);
}

// 3 · Ninguna categoría con más de seis opciones, y no más de cinco categorías (más el consejo propio).
assert.ok(STORE_CATEGORIES.length <= 4, 'demasiadas categorías: con el consejo propio pasarían de cinco');
for (const c of STORE_CATEGORIES) assert.ok(c.queries.length >= 1 && c.queries.length <= 6, `${c.label}: ${c.queries.length} opciones`);

// 4 · Todas las respuestas, desde cada colaborador de sala y a varias horas.
const floor = DECATHLON_PROFILE.staff.filter((r) => r.offers && getOffer(r.offers).kind === 'advice');
assert.ok(floor.length >= 5, 'personal de sala con atención');
for (const r of floor) {
  const o = getOffer(r.offers!);
  assert.ok(o.kind === 'advice' && o.store === 'decathlon', `${r.label}: sin atención de tienda`);
}
const sold = new Set(getStore('decathlon').stock.map((l) => getGarment(l.garment).name.toLowerCase()));
const unsold = [...new Set(STORES.flatMap((s) => s.stock.map((l) => getGarment(l.garment).name.toLowerCase())))].filter((n) => !sold.has(n));
const queries: StoreQuery[] = STORE_CATEGORIES.flatMap((c) => [...c.queries]);
const labels = [...new Set(SECTORS.map(labelOf))];
// Nombres propios que ya llevan «y» dentro («Salud y accesorios»): no cuentan como lista encadenada. Los largos, antes.
const names = [...new Set([...SECTORS.map((s) => s.name), ...labels, ...sold, ...unsold])].sort((x, y) => y.length - x.length);
const asker = (r: (typeof floor)[number], i: number): Asker => {
  const pt = DECATHLON_STORE.points![r.points[i % r.points.length]];
  return { key: r.label ?? 'sala', tile: { tx: pt.tx, ty: pt.ty }, role: r };
};
for (const [day, hour] of [[1, 10], [3, 18], [6, 12], [7, 19]]) {
  const clock = { day, hour, minute: 0 };
  for (const [k, r] of floor.entries()) for (const q of queries) {
    const who = asker(r, k + day);
    const a = answer(q, who, clock);
    const b = answer(q, who, clock);
    assert.ok(a.text.trim() && !a.text.includes('{'), `${r.label} · ${q.id}: respuesta vacía o con hueco («${a.text}»)`);
    assert.notEqual(a.text, b.text, `${r.label} · ${q.id}: repite la misma frase seguida`);
    for (const t of [a.text, b.text]) {
      assert.ok(!/talla/i.test(t), `${q.id}: habla de tallas («${t}»)`);
      // Redacción: mayúscula al empezar, sin «aquí, aquí», cada etiqueta una vez y listas con comas, no «a y b y c».
      assert.ok(!/^[a-záéíóúüñ]/.test(t), `${q.id}: empieza en minúscula («${t}»)`);
      assert.ok(!/aquí, aquí/i.test(t), `${q.id}: dirección redundante («${t}»)`);
      for (const l of labels) assert.ok(t.split(l).length <= 2, `${r.label} · ${q.id}: «${l}» dos veces («${t}»)`);
      const plain = names.reduce((acc, n) => acc.split(n).join('#'), t);
      assert.ok(!/ y [^,.;:]+ y /.test(plain), `${r.label} · ${q.id}: lista encadenada con «y» («${t}»)`);
      for (const n of unsold) assert.ok(!t.toLowerCase().includes(n), `${q.id}: menciona «${n}», que aquí no se vende`);
    }
    if (q.kind === 'stock') for (const n of sold) assert.ok(a.text.toLowerCase().includes(n), `stock: falta «${n}»`);
  }
}

// 5 · Para cada sección hay respuesta de dónde: su departamento está en «¿Dónde está…?» y la respuesta la nombra (por su
// etiqueta: dos secciones con la misma, «Raqueta» y «Raqueta · pista de pádel», se nombran una vez).
const where = STORE_CATEGORIES.flatMap((c) => c.queries).filter((q) => q.kind === 'department');
const mate = asker(floor[0], 0);
for (const s of SECTORS) {
  const q = where.find((w) => w.ref === departmentOf(s.id)!.id);
  assert.ok(q, `${s.id}: su departamento no se puede preguntar`);
  assert.ok(answer(q, mate, { day: 1, hour: 12, minute: 0 }).text.includes(labelOf(s)), `${s.id}: la respuesta no la nombra`);
}

// 6 · Cajas abiertas = su `open` (días y nivel), comprobado a mano para todos los días y niveles; nunca el autopago.
for (let weekday = 0; weekday < 7; weekday++) for (const level of [null, ...LEVELS] as (Level | null)[]) {
  const got = openCheckouts({ level, weekday }).map((c) => c.id).sort();
  const want = DECATHLON_LAYOUT.checkouts.filter((c) => c.kind === 'staffed' && level !== null
    && (!c.open?.days || c.open.days.includes(weekday))
    && (!c.open?.minLevel || LEVELS.indexOf(level) >= LEVELS.indexOf(c.open.minLevel))).map((c) => c.id).sort();
  assert.deepEqual(got, want, `cajas día ${weekday} nivel ${level}`);
  assert.ok(!got.some((id) => id.startsWith('auto-')), 'se ofrece el autopago');
}

// 7 · Los cajeros siguen vendiendo: su offer es la tienda, no la atención.
for (const r of DECATHLON_PROFILE.staff.filter((s) => s.label?.startsWith('Caja'))) {
  const o = getOffer(r.offers!);
  assert.ok(o.kind === 'retail' && o.store === 'decathlon', `${r.label}: ya no cobra`);
}

console.log(`OK · atención Decathlon: ${SECTORS.length} secciones con «dónde», ${STORE_CATEGORIES.length} categorías, ${queries.length} preguntas, ${floor.length} colaboradores de sala, sin tallas ni prendas fuera de stock.`);
