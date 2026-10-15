// La basura de la calle (systems/Litter) con el mismo StreetLife del juego: tres días en cada distrito exterior con
// calle viva, y las papeleras (PropDef.waste) que pone systems/Dressing en cada uno.
// Falla si se llena el suelo o un rincón, cae en la calzada, se apila, no se recoge, no caduca, se acumula sin freno,
// la calle está sucia de media, una papelera no se alcanza o pisa otra cosa, o al volver a entrar algo se duplica.
import assert from 'node:assert/strict';
import { getLocation, isStandable } from '../src/systems/LocationSystem.ts';
import { StreetLife, streetProfileFor } from '../src/systems/StreetLife.ts';
import { Litter, LITTER_CAP, LOCAL_CAP } from '../src/systems/Litter.ts';
import { matchLitter } from '../src/systems/Match.ts';
import { LOCATION_DISTRICT } from '../src/data/districtIdentity.ts';
import { STREET_PROFILES } from '../src/data/streets.ts';
import { PROPS } from '../src/world/tiles.ts';
import type { Clock } from '../src/systems/Crowd.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { absMinute } from '../src/systems/Handoff.ts';
import { zoneAt } from '../src/systems/Zones.ts';
import type { TilePoint } from '../src/types/game.ts';

const STEP_MS = 100;
const MS_PER_MIN = 500;
const ROADWAY = new Set(['.', '=', ':']);
const WALK = new Set([',', 'P', 'c', '~', 'T', 'g']);
const DAYS = 3;
const next = (c: Clock): Clock => {
  const t = c.hour * 60 + c.minute + 1;
  return { day: c.day + Math.floor(t / 1440), hour: Math.floor((t % 1440) / 60), minute: t % 60 };
};

// Las papeleras: cada variante en algún sitio, ninguna en la calzada ni encima de otra cosa (salvo la colgada, en su farola).
const variants = new Set<string>();
for (const { location } of STREET_PROFILES) {
  const loc = getLocation(location);
  const placements = loc.props.map((p) => `${p.kind}@${p.tx},${p.ty}`);
  assert.equal(new Set(placements).size, placements.length, `${location}: props duplicados`);
  const bins = loc.props.filter((p) => PROPS[p.kind].waste);
  assert.ok(bins.length > 0, `${location}: ninguna papelera`);
  for (const b of bins) {
    variants.add(b.kind);
    const wide = PROPS[b.kind].tilesWide ?? 1;
    const others = loc.props.filter((p) => p !== b && p.ty === b.ty && p.tx < b.tx + wide && p.tx + (PROPS[p.kind].tilesWide ?? 1) > b.tx && !PROPS[p.kind].flat);
    if (PROPS[b.kind].waste!.attach === 'post') {
      assert.ok(others.length === 1 && PROPS[others[0].kind].post && PROPS[others[0].kind].light, `${location}: ${b.kind} en ${b.tx},${b.ty} sin farola`);
    } else assert.equal(others.length, 0, `${location}: ${b.kind} en ${b.tx},${b.ty} pisa ${others.map((o) => o.kind)}`);
    for (let x = b.tx; x < b.tx + wide; x++) assert.ok(WALK.has(loc.ground[b.ty][x]), `${location}: ${b.kind} fuera de la acera en ${x},${b.ty}`);
    // Se llega: algún vecino pisable (para mirarla, para que la barran).
    const around = [[0, 1], [0, -1], [-1, 0], [wide, 0]].some(([dx, dy]) => isStandable(loc, b.tx + dx, b.ty + dy));
    assert.ok(around, `${location}: ${b.kind} en ${b.tx},${b.ty} encerrada`);
  }
  console.log(location, 'papeleras', [...new Set(bins.map((b) => b.kind))].map((k) => `${k}:${bins.filter((b) => b.kind === k).length}`).join(' '));
}
for (const k of Object.keys(PROPS).filter((k) => PROPS[k as keyof typeof PROPS].waste)) assert.ok(variants.has(k), `la papelera ${k} no está en ningún distrito`);

for (const { location } of STREET_PROFILES) {
  const loc = getLocation(location);
  const player: TilePoint = Object.values(loc.spawns)[0];
  let clock: Clock = { day: 2, hour: 5, minute: 0 };
  const street = new StreetLife(loc, streetProfileFor(location)!, seededRng(7));
  street.populate(clock, player);
  assert.ok(street.litter.size <= 4, `${location}: ${street.litter.size} piezas nada más entrar`);
  // Quién las recoge: lo que quita la gente de limpieza, aparte de lo que se va solo.
  let byCleaner = 0;
  const remove = street.litter.remove.bind(street.litter);
  street.litter.remove = (id: number): void => {
    byCleaner++;
    remove(id);
  };
  const seen = new Map<number, { kind: string; zone: string; type: string; hour: number }>();
  let peak = 0;
  let sum = 0;
  let focus = 0;
  const hourly = Array(24).fill(0);
  for (let min = 0; min < DAYS * 24 * 60; min++) {
    for (let ms = 0; ms < MS_PER_MIN; ms += STEP_MS) street.update(STEP_MS, clock, player);
    const surge = matchLitter(LOCATION_DISTRICT[location], clock);
    peak = Math.max(peak, street.litter.size);
    sum += street.litter.size;
    assert.ok(street.litter.size <= Math.round(LITTER_CAP * Math.min(2.5, surge)), `${location}: ${street.litter.size} piezas, tope ${LITTER_CAP}`);
    const tiles = new Set<string>();
    for (const it of street.litter.items) {
      const tile = `${it.tx},${it.ty}`;
      assert.ok(!tiles.has(tile), `${location}: dos piezas en ${tile}`);
      tiles.add(tile);
      assert.ok(isStandable(loc, it.tx, it.ty), `${location}: basura dentro de algo en ${tile}`);
      assert.ok(!ROADWAY.has(loc.ground[it.ty][it.tx]), `${location}: basura en la calzada en ${tile}`);
      // Un rincón (dos fuentes vecinas como mucho) no pasa de su tope local.
      const near = street.litter.items.filter((o) => Math.abs(o.tx - it.tx) <= 3 && Math.abs(o.ty - it.ty) <= 3).length;
      focus = Math.max(focus, near);
      assert.ok(near <= 2 * Math.round(LOCAL_CAP * Math.min(2, surge)), `${location}: ${near} piezas juntas en ${tile}`);
      if (!seen.has(it.id)) {
        const z = zoneAt(location, it.tx, it.ty);
        seen.set(it.id, { kind: it.kind, zone: z?.id ?? '-', type: z?.type ?? '-', hour: clock.hour });
        hourly[clock.hour]++;
      }
    }
    clock = next(clock);
  }
  const mean = sum / (DAYS * 24 * 60);
  const byType = new Map<string, number>();
  for (const s of seen.values()) byType.set(s.type, (byType.get(s.type) ?? 0) + 1);
  const kinds = new Set([...seen.values()].map((s) => s.kind));
  console.log(location, 'caídas', street.litter.spawned, 'media', mean.toFixed(1), 'máx a la vez', peak, '/', LITTER_CAP, 'foco', focus, 'recogidas por limpieza', byCleaner, 'al final', street.litter.size);
  console.log('   por zona', [...byType].sort().map(([k, n]) => `${k}:${n}`).join(' '), '| tipos', [...kinds].sort().join(','));
  console.log('   por hora ', hourly.map((n) => n || '.').join(' '));
  assert.ok(seen.size > 0, `${location}: nunca cae nada`);
  assert.ok(kinds.size >= 3, `${location}: sólo ${[...kinds]}: poca variedad`);
  assert.ok(byCleaner > 0, `${location}: la limpieza no recogió nada en ${DAYS} días`);
  // Calle mayoritariamente limpia: de media, menos de cuatro piezas a la vista en todo el distrito.
  assert.ok(mean < 4, `${location}: ${mean.toFixed(1)} piezas de media`);
  // La calle tranquila queda casi limpia: lo residencial, una fracción de lo que cae donde se come, se sale o se compra.
  const quiet = (byType.get('residential') ?? 0) + (byType.get('park') ?? 0);
  assert.ok(quiet <= seen.size * 0.25, `${location}: ${quiet} de ${seen.size} piezas en zonas tranquilas`);
  // Sin acumulación: poco más de una pieza por hora en todo el distrito.
  assert.ok(street.litter.spawned < DAYS * 24 * 1.5, `${location}: ${street.litter.spawned} piezas en ${DAYS} días`);

  // Sin nadie que limpie, todo se va solo: nada dura más que su TTL (cinco horas como mucho, más un tick).
  const alone = new Litter(loc);
  let c: Clock = { day: 3, hour: 14, minute: 0 };
  alone.seed(c, () => 2);
  let oldest = 0;
  for (let min = 0; min < 24 * 60; min++) {
    alone.update(c, () => 2);
    const now = absMinute(c.day, c.hour, c.minute);
    for (const it of alone.items) oldest = Math.max(oldest, now - it.born);
    c = next(c);
  }
  assert.ok(alone.spawned > 0 && oldest <= 300 + 5, `${location}: sin limpieza, una pieza dura ${oldest} min`);

  // Entrar y salir tres veces: cada vez una calle nueva, con su basura de entrada y nada heredado ni repetido.
  let prev = street.litter;
  for (let k = 0; k < 3; k++) {
    const again = new StreetLife(loc, streetProfileFor(location)!, seededRng(8 + k));
    again.populate({ day: 2, hour: 10 + k * 5, minute: 0 }, player);
    assert.notEqual(again.litter, prev);
    assert.ok(again.litter.size <= 4, `${location}: ${again.litter.size} piezas al volver`);
    assert.equal(new Set(again.litter.items.map((i) => i.id)).size, again.litter.size);
    assert.ok(again.litter.items.every((i) => i.claimedBy === undefined), `${location}: basura ya reclamada al entrar`);
    prev = again.litter;
  }
}
console.log('basura OK');
