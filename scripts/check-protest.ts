// Concentración vecinal (data/protests.ts, systems/Protest.ts): calendario, enfriamiento, presupuesto de
// participantes, progresión de fases, recarga a mitad, herramientas de desarrollo, pancartas y sitios.
// `node scripts/check-protest.ts`.
import assert from 'node:assert/strict';
import { PROTESTS, type ProtestDef } from '../src/data/protests.ts';
import { getLocation, isWalkable } from '../src/systems/LocationSystem.ts';
import { weekIndex } from '../src/systems/Calendar.ts';
import { MAX_POLICE, Protest, phaseAt, planDay, type ProtestDay, type ProtestPhase } from '../src/systems/Protest.ts';

const EIGHT_WEEKS = 56;
// Dos años: la media por cada ocho semanas no depende de una racha.
const YEARS = 728;
const ORDER: Readonly<Record<ProtestPhase, number>> = { none: 0, setup: 1, active: 2, dispersal: 3, cleanup: 4 };

const happening = (def: ProtestDef, from: number, to: number): ProtestDay[] => {
  const loc = getLocation(def.location);
  const out: ProtestDay[] = [];
  for (let d = from; d <= to; d++) {
    const p = planDay(def, loc, d);
    if (p.happens) out.push(p);
  }
  return out;
};

/** Nunca dos en menos de 6 días (con cooldownDays días de margen) ni más de maxPerWeek por semana. */
function assertSpacing(def: ProtestDef, days: readonly number[]): void {
  for (let i = 1; i < days.length; i++) {
    assert.ok(days[i] - days[i - 1] > Math.max(6, def.cooldownDays), `${def.id}: dos concentraciones con ${days[i] - days[i - 1]} días de diferencia (${days[i - 1]}, ${days[i]})`);
    if (Math.floor((days[i] - 1) / 7) === Math.floor((days[i - 1] - 1) / 7)) assert.fail(`${def.id}: dos en la misma semana (${days[i - 1]}, ${days[i]})`);
  }
}

const BANNED = /\b(pp|psoe|vox|podemos|sumar|ciudadanos|erc|junts|bildu|pnv|bng|cup|partido|vota|votad|votar|elecciones|candidat\w*|izquierda|derecha|fascis\w*|comunis\w*|socialis\w*|gobierno|dimisi[oó]n|presidente|alcalde\w*|ministr\w*)\b/i;

for (const def of PROTESTS) {
  const loc = getLocation(def.location);
  const fresh = (): Protest => new Protest({ ...def }, loc);

  // --- (g) los sitios: losa de la plaza, transitables, sin props ni puntos, fuera de la calzada
  const props = new Set(loc.props.map((p) => `${p.tx},${p.ty}`));
  const points = new Set(Object.values(loc.points ?? {}).map((p) => `${p.tx},${p.ty}`));
  const all = [...def.slots, ...def.policeSlots];
  assert.equal(new Set(all.map((s) => `${s.tx},${s.ty}`)).size, all.length, `${def.id}: dos sitios en el mismo tile`);
  // La única excepción a «losa de la plaza»: el agente pegado al corte de calzada, en la acera de al lado.
  const c = def.closure;
  const atCut = (s: { tx: number; ty: number }): boolean =>
    !!c && def.policeSlots.includes(s) && s.tx >= c.tx - 1 && s.tx <= c.tx + c.w && (s.ty === c.ty - 1 || s.ty === c.ty + c.h);
  for (const s of all) {
    const k = `${s.tx},${s.ty}`;
    const ch = loc.ground[s.ty]?.[s.tx];
    if (atCut(s)) {
      assert.ok(isWalkable(loc, s.tx, s.ty) && ch !== undefined && !['.', 'l', 'z'].includes(ch), `${def.id}: ${k}, el agente del corte, no está en la acera`);
      assert.ok(!props.has(k) && !points.has(k), `${def.id}: ${k}, el agente del corte, encima de un prop o un punto`);
      continue;
    }
    assert.equal(ch, 'P', `${def.id}: ${k} no es losa de la plaza (${ch})`);
    assert.ok(s.ty >= 16 && s.ty <= 23, `${def.id}: ${k} fuera de las filas de la plaza`);
    assert.ok(!['.', 'l', 'z'].includes(ch), `${def.id}: ${k} en la calzada`);
    assert.ok(isWalkable(loc, s.tx, s.ty), `${def.id}: ${k} no se pisa`);
    assert.ok(!props.has(k), `${def.id}: ${k} encima de un prop`);
    assert.ok(!points.has(k), `${def.id}: ${k} encima de un punto`);
  }
  assert.ok(def.slots.length >= def.crowd[1], `${def.id}: menos sitios que manifestantes`);
  assert.ok(def.entries.length > 0 && def.entries.every((e) => loc.points?.[e]), `${def.id}: entrada inexistente`);

  // --- (f) pancartas
  assert.ok(def.banners.length >= 5 && def.banners.length <= 8, `${def.id}: ${def.banners.length} pancartas`);
  assert.equal(new Set(def.banners.map((b) => b.toLowerCase())).size, def.banners.length, `${def.id}: pancarta repetida`);
  for (const b of def.banners) assert.ok(!BANNED.test(b), `${def.id}: pancarta con término vetado: «${b}»`);
  assert.ok(BANNED.test('Vota al partido'), 'control: la lista de vetadas no detecta nada');

  // --- (a) calendario: franja, día, separación y cuántas
  const year = happening(def, 1, YEARS);
  const days = year.map((p) => p.day);
  assertSpacing(def, days);
  for (const p of year) {
    assert.ok(def.days.includes(weekIndex(p.day)), `${def.id}: día ${p.day} no permitido`);
    assert.ok(p.start >= p.day * 1440 + def.window[0] * 60, `${def.id}: día ${p.day} empieza antes de la franja`);
    assert.ok(p.cleanupAt <= p.day * 1440 + def.window[1] * 60, `${def.id}: día ${p.day} se dispersa después de la franja`);
  }
  for (let w = 1; w + EIGHT_WEEKS - 1 <= YEARS; w++) {
    const n = days.filter((d) => d >= w && d < w + EIGHT_WEEKS).length;
    assert.ok(n <= 4, `${def.id}: ${n} concentraciones en las ocho semanas desde el día ${w}`);
  }
  const perEight = (year.length * EIGHT_WEEKS) / YEARS;
  assert.ok(perEight >= 1 && perEight <= 4, `${def.id}: ${perEight.toFixed(2)} cada ocho semanas`);
  console.log(`${def.id}: ${year.length} en ${YEARS} días (${perEight.toFixed(2)} cada ocho semanas); primeras ocho semanas: ${days.filter((d) => d <= EIGHT_WEEKS).length}`);
  // Los motivos de bloqueo existen todos menos, quizá, la lluvia.
  const whys = new Set(Array.from({ length: YEARS }, (_, i) => planDay(def, loc, i + 1).why));
  for (const w of ['ok', 'weekday', 'chance', 'cooldown'] as const) assert.ok(whys.has(w), `${def.id}: nunca sale '${w}'`);

  // Control positivo: sin enfriamiento, la comprobación de separación tiene que fallar.
  const control: ProtestDef = { ...def, id: `${def.id}-control`, chance: 2, cooldownDays: 0, maxPerWeek: 7 };
  assert.throws(() => assertSpacing(control, happening(control, 1, EIGHT_WEEKS).map((p) => p.day)), 'control: sin enfriamiento la separación no falla');

  // --- (b) presupuesto
  for (const p of year) {
    const police = p.members.filter((m) => m.role === 'policia').length;
    const crowd = p.members.filter((m) => m.role === 'manifestante').length;
    assert.ok(police <= MAX_POLICE && police >= Math.min(def.police[0], MAX_POLICE), `${def.id}: día ${p.day}, ${police} policías`);
    assert.ok(crowd >= def.crowd[0] && crowd <= def.crowd[1], `${def.id}: día ${p.day}, ${crowd} manifestantes`);
    assert.equal(new Set(p.members.map((m) => m.id)).size, p.members.length, `${def.id}: día ${p.day}, ids repetidos`);
    assert.equal(new Set(p.members.map((m) => `${m.slot.tx},${m.slot.ty}`)).size, p.members.length, `${def.id}: día ${p.day}, dos en el mismo tile`);
    const banners = p.members.flatMap((m) => (m.banner ? [m.banner] : []));
    assert.equal(new Set(banners).size, banners.length, `${def.id}: día ${p.day}, pancarta repetida`);
  }

  // --- (c) progresión: fases hacia delante y presencia que sube, se mantiene, baja y se vacía
  const ev = fresh();
  for (const p of year) {
    let lastOrder = 0;
    let lastCount = 0;
    let after = false;
    for (let t = p.start - 2; t <= p.end + 2; t += 0.5) {
      const phase = ev.phase(t);
      const count = ev.presentAt(t).length;
      const order = phase === 'none' && t >= p.end ? 5 : ORDER[phase];
      assert.ok(order >= lastOrder, `${def.id}: día ${p.day}, la fase vuelve atrás a ${phase}`);
      if (phase === 'setup') assert.ok(count >= lastCount, `${def.id}: día ${p.day}, se va gente en el montaje`);
      if (phase === 'active') assert.equal(count, p.members.length, `${def.id}: día ${p.day}, falta gente en el acto`);
      if (phase === 'dispersal') assert.ok(count <= lastCount, `${def.id}: día ${p.day}, llega gente en la dispersión`);
      if (phase === 'cleanup' || phase === 'none') assert.equal(count, 0, `${def.id}: día ${p.day}, gente en ${phase}`);
      after ||= phase === 'cleanup';
      lastOrder = order;
      lastCount = count;
    }
    assert.ok(after, `${def.id}: día ${p.day} sin limpieza`);
    assert.equal(phaseAt(p, p.start - 1), 'none');
  }

  // --- (d) guardado a mitad: una instancia nueva (y una definición sin memoria) da lo mismo en cada fase
  const p0 = year[0];
  const mids: Record<Exclude<ProtestPhase, 'none'>, number> = {
    setup: (p0.start + p0.activeAt) / 2,
    active: (p0.activeAt + p0.dispersalAt) / 2,
    dispersal: (p0.dispersalAt + p0.cleanupAt) / 2,
    cleanup: (p0.cleanupAt + p0.end) / 2,
  };
  const LIFE = { setup: 'SPAWNING', active: 'ACTIVE', dispersal: 'RESOLUTION', cleanup: 'CLEANUP' } as const;
  for (const [phase, t] of Object.entries(mids) as [keyof typeof mids, number][]) {
    const before = ev.lifecycle(t);
    const reloaded = fresh().lifecycle(t);
    assert.deepEqual(reloaded, before, `${def.id}: tras recargar en ${phase} cambia el suceso`);
    assert.equal(before.lifecycle, LIFE[phase], `${def.id}: ${phase} no es ${LIFE[phase]}`);
    assert.equal(new Set(before.participants.map((x) => x.id)).size, before.participants.length, `${def.id}: participantes duplicados en ${phase}`);
    assert.deepEqual(fresh().presentAt(t), ev.presentAt(t), `${def.id}: tras recargar en ${phase} cambia la gente`);
  }
  // Enfriamiento: acabada, COOLDOWN hasta el día siguiente al último de enfriamiento; luego ELIGIBLE.
  assert.equal(ev.lifecycle(p0.end + 1).lifecycle, 'COOLDOWN', `${def.id}: sin enfriamiento tras acabar`);
  const free = (p0.day + def.cooldownDays + 1) * 1440;
  assert.equal(ev.lifecycle(free - 1).lifecycle, 'COOLDOWN');
  assert.equal(ev.lifecycle(free + 60).lifecycle, 'ELIGIBLE', `${def.id}: el enfriamiento no acaba`);

  // --- (e) herramientas de desarrollo: forzar, resolver, cancelar y volver al calendario sin duplicar
  const quiet = planDay(def, loc, free / 1440 + 1).happens ? free / 1440 + 2 : free / 1440 + 1;
  const tq = quiet * 1440 + 12 * 60;
  const dev = fresh();
  dev.devForce(tq);
  const forced = dev.lifecycle(tq + 10);
  assert.equal(forced.lifecycle, 'ACTIVE');
  assert.ok(forced.forced);
  assert.equal(new Set(forced.participants.map((x) => x.id)).size, forced.participants.length, `${def.id}: forzada con duplicados`);
  assert.ok(forced.participants.filter((x) => x.role === 'policia').length <= MAX_POLICE);
  assert.match(dev.devResolve(tq + 20), /disuelve/);
  assert.equal(dev.lifecycle(tq + 21).lifecycle, 'RESOLUTION');
  let prev = Infinity;
  for (let t = tq + 20; t < tq + 20 + 60; t++) {
    const n = dev.presentAt(t).length;
    assert.ok(n <= prev, `${def.id}: tras resolver vuelve gente`);
    prev = n;
  }
  assert.equal(prev, 0);
  dev.devReset();
  assert.deepEqual(dev.lifecycle(tq + 10), fresh().lifecycle(tq + 10), `${def.id}: tras reset no vuelve al calendario`);
  assert.ok(!dev.lifecycle(tq + 10).forced);
  // Forzada encima de una del calendario: una sola gente, y acabada la forzada la del calendario no reaparece.
  const tn = p0.activeAt + 5;
  dev.devForce(tn);
  const both = dev.lifecycle(tn + 1);
  assert.ok(both.participants.length <= def.crowd[1] + MAX_POLICE, `${def.id}: forzada y calendario a la vez`);
  dev.devCancel(tn + 2);
  assert.equal(dev.presentAt(tn + 3).length, 0, `${def.id}: cancelada y con gente`);
  dev.devReset();
  assert.deepEqual(happening(def, 1, YEARS).map((p) => p.day), days, `${def.id}: forzar y resetear cambia el calendario`);
  assert.deepEqual(dev.lifecycle(tn + 3), fresh().lifecycle(tn + 3));
}

console.log('check-protest: ok');
