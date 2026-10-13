// La basura de la calle (systems/Litter) con el mismo StreetLife del juego: tres días en Vallesco y en la Ribera.
// Falla si se llena el suelo, cae en la calzada, se apila, no se recoge o se acumula sin freno.
import assert from 'node:assert/strict';
import { getLocation, isStandable } from '../src/systems/LocationSystem.ts';
import { StreetLife, streetProfileFor } from '../src/systems/StreetLife.ts';
import { LITTER_CAP } from '../src/systems/Litter.ts';
import type { Clock } from '../src/systems/Crowd.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { zoneAt } from '../src/systems/Zones.ts';
import type { TilePoint } from '../src/types/game.ts';

const STEP_MS = 100;
const MS_PER_MIN = 500;
const ROADWAY = new Set(['.', '=', ':']);
const DAYS = 3;

for (const location of ['district', 'ribera'] as const) {
  const loc = getLocation(location);
  const player: TilePoint = location === 'district' ? { tx: 72, ty: 53 } : { tx: 2, ty: 2 };
  let clock: Clock = { day: 2, hour: 5, minute: 0 };
  const street = new StreetLife(loc, streetProfileFor(location)!, seededRng(7));
  street.populate(clock, player);
  assert.ok(street.litter.size <= 7, `${location}: ${street.litter.size} piezas nada más entrar`);
  // Quién las recoge: lo que quita la gente de limpieza, aparte de lo que se va solo.
  let byCleaner = 0;
  const remove = street.litter.remove.bind(street.litter);
  street.litter.remove = (id: number): void => {
    byCleaner++;
    remove(id);
  };
  const seen = new Map<number, { kind: string; zone: string; type: string; hour: number }>();
  let peak = 0;
  let hourly = Array(24).fill(0);
  for (let min = 0; min < DAYS * 24 * 60; min++) {
    for (let ms = 0; ms < MS_PER_MIN; ms += STEP_MS) street.update(STEP_MS, clock, player);
    peak = Math.max(peak, street.litter.size);
    assert.ok(street.litter.size <= LITTER_CAP, `${location}: ${street.litter.size} piezas, tope ${LITTER_CAP}`);
    const tiles = new Set<string>();
    for (const it of street.litter.items) {
      const tile = `${it.tx},${it.ty}`;
      assert.ok(!tiles.has(tile), `${location}: dos piezas en ${tile}`);
      tiles.add(tile);
      assert.ok(isStandable(loc, it.tx, it.ty), `${location}: basura dentro de algo en ${tile}`);
      assert.ok(!ROADWAY.has(loc.ground[it.ty][it.tx]), `${location}: basura en la calzada en ${tile}`);
      if (!seen.has(it.id)) {
        const z = zoneAt(location, it.tx, it.ty);
        seen.set(it.id, { kind: it.kind, zone: z?.id ?? '-', type: z?.type ?? '-', hour: clock.hour });
        hourly[clock.hour]++;
      }
    }
    const t = clock.hour * 60 + clock.minute + 1;
    clock = { day: clock.day + Math.floor(t / 1440), hour: Math.floor((t % 1440) / 60), minute: t % 60 };
  }
  const byType = new Map<string, number>();
  for (const s of seen.values()) byType.set(s.type, (byType.get(s.type) ?? 0) + 1);
  const kinds = new Set([...seen.values()].map((s) => s.kind));
  console.log(location, 'caídas', street.litter.spawned, 'máx a la vez', peak, '/', LITTER_CAP, 'recogidas por limpieza', byCleaner, 'al final', street.litter.size);
  console.log('   por zona', [...byType].sort().map(([k, n]) => `${k}:${n}`).join(' '), '| tipos', [...kinds].sort().join(','));
  console.log('   por hora ', hourly.map((n) => n || '.').join(' '));
  assert.ok(seen.size > 0, `${location}: nunca cae nada`);
  assert.ok(byCleaner > 0, `${location}: la limpieza no recogió nada en ${DAYS} días`);
  // La calle tranquila queda casi limpia: lo residencial, una fracción de lo que cae donde se come, se sale o se compra.
  const quiet = (byType.get('residential') ?? 0) + (byType.get('park') ?? 0);
  assert.ok(quiet <= seen.size * 0.25, `${location}: ${quiet} de ${seen.size} piezas en zonas tranquilas`);
  // Sin acumulación: lo que cae en tres días no pasa de lo que cabría si el cupo se llenase y vaciase cada pocas horas.
  assert.ok(street.litter.spawned < DAYS * 24 * 4, `${location}: ${street.litter.spawned} piezas en ${DAYS} días`);
  // Al rehacer la escena (cambio de sitio), nada de lo anterior sigue: basura nueva, la de siempre al entrar.
  const again = new StreetLife(loc, streetProfileFor(location)!, seededRng(8));
  again.populate({ day: 2, hour: 10, minute: 0 }, player);
  assert.notEqual(again.litter, street.litter);
  assert.ok(again.litter.size <= 7);
}
console.log('basura OK');
