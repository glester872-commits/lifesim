// Patinetes eléctricos por barrio (data/bikes.ts 'scooter', data/districtIdentity.ts scooters, systems/Districts.withDistrictLanes,
// systems/Traffic.forceSpawn): ninguno en Vallesco, ocasionales en la Ribera, por su carril bici y más cortos que una bici. La misma
// lógica que el juego, sin Phaser. Llamado desde la cadena `check` de package.json. `node scripts/check-scooters.ts`.
import assert from 'node:assert/strict';
import { BIKES } from '../src/data/bikes.ts';
import { DISTRICT_IDENTITIES } from '../src/data/districtIdentity.ts';
import { VEHICLES } from '../src/data/vehicles.ts';
import { withDistrictLanes } from '../src/systems/Districts.ts';
import { getLocation } from '../src/systems/LocationSystem.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { Traffic } from '../src/systems/Traffic.ts';

const scooter = BIKES.find((b) => b.id === 'scooter')!;
const bike = BIKES.find((b) => b.id === 'casual')!;

// --------------------------------------------------- 1. el patinete: distinto de una bici y de una tabla, y más pequeño
assert.ok(scooter && scooter.frame === 'scooter' && scooter.gated, 'el patinete no existe o no pide permiso');
assert.ok(scooter.length < bike.length && scooter.length < Math.min(...VEHICLES.filter((v) => !v.id.startsWith('taxi')).map((v) => v.length)), `huella del patinete: ${scooter.length}`);
assert.ok(!BIKES.some((b) => b !== scooter && b.frame === 'scooter'));
assert.notEqual(scooter.frame, BIKES.find((b) => b.id === 'skater')!.frame);
// Sólo lo permiten los barrios con `scooters` > 0: Vallesco (y la calle vintage, que es su mapa) no.
assert.equal(DISTRICT_IDENTITIES.vallesco.scooters, 0);
assert.equal(DISTRICT_IDENTITIES.vintage.scooters, 0);
assert.ok(DISTRICT_IDENTITIES.ribera.scooters > 0);
for (const id of ['velaria', 'puerta-central', 'cuatro-rios', 'arena', 'luna']) assert.ok(DISTRICT_IDENTITIES[id].scooters > 0, `${id}: los futuros barrios densos admiten patinetes`);

// --------------------------------------------------- 2. el tráfico: Vallesco, cero; la Ribera, ocasionales
interface Run { scooters: number; bikes: number; rows: Set<number>; cleaned: boolean }
function run(locationId: string, days: number, seed: number): Run {
  const loc = getLocation(locationId);
  const width = loc.ground[0].length * 16;
  const t = new Traffic(withDistrictLanes(loc, loc.traffic!.bikes!), BIKES, [], width, seededRng(seed));
  const seen = new Set<number>();
  const out: Run = { scooters: 0, bikes: 0, rows: new Set(), cleaned: true };
  for (let day = 2; day < 2 + days; day++) {
    for (let min = 0; min < 24 * 60; min++) {
      t.update(1_000, { day, minuteOfDay: min }, []);
      for (const v of t.vehicles) {
        if (seen.has(v.id)) continue;
        seen.add(v.id);
        out.bikes++;
        if (v.type.id === 'scooter') {
          out.scooters++;
          out.rows.add(v.row);
        }
      }
      // Limpieza: nada se queda fuera del carril.
      if (t.vehicles.some((v) => v.x < -80 || v.x > width + 80)) out.cleaned = false;
    }
  }
  return out;
}
{
  const vallesco = run('district', 8, 3);
  assert.equal(vallesco.scooters, 0, `${vallesco.scooters} patinetes en Vallesco entre ${vallesco.bikes} bicis`);
  assert.ok(vallesco.bikes > 50, `Vallesco sin bicis (${vallesco.bikes}): la prueba no mide nada`);
  const ribera = run('ribera', 8, 3);
  assert.ok(ribera.bikes > 30, `Ribera sin bicis (${ribera.bikes})`);
  assert.ok(ribera.scooters >= 3, `pocos patinetes en la Ribera (${ribera.scooters} de ${ribera.bikes})`);
  // Ocasionales: entre el 2 y el 15 % de lo que ruedan por el carril, nunca el grueso.
  const share = ribera.scooters / ribera.bikes;
  assert.ok(share > 0.02 && share < 0.15, `patinetes en la Ribera: ${(share * 100).toFixed(1)} %`);
  // Por su carril bici: las filas de los carriles de la Ribera.
  const rl = getLocation('ribera').traffic!.bikes!.lanes.map((l) => l.row);
  for (const row of ribera.rows) assert.ok(rl.includes(row), `patinete fuera del carril bici (fila ${row})`);
  assert.ok(ribera.cleaned && vallesco.cleaned, 'vehículos que se quedan fuera del mapa');
  console.log(`  Vallesco: ${vallesco.scooters} patinetes de ${vallesco.bikes} bicis en 8 días · Ribera: ${ribera.scooters} de ${ribera.bikes} (${(share * 100).toFixed(1)} %), por los carriles ${[...ribera.rows].join(', ')}`);
}

// --------------------------------------------------- 3. forzado (lifesim.scooter): en la Ribera sale; en Vallesco, no
{
  const clock = { day: 3, minuteOfDay: 19 * 60 };
  const ribera = getLocation('ribera');
  const rw = ribera.ground[0].length * 16;
  const rt = new Traffic(withDistrictLanes(ribera, ribera.traffic!.bikes!), BIKES, [], rw, seededRng(1));
  assert.equal(rt.forceSpawn('scooter', clock), true, 'no sale un patinete forzado en la Ribera');
  const s = rt.vehicles.find((v) => v.type.id === 'scooter')!;
  assert.ok(s && (s.x < 0 || s.x > rw) && s.speed > 0, 'el patinete forzado no entra por el borde en marcha');
  // Se va por el otro borde y desaparece (limpieza): tras cruzar el mapa entero ya no está.
  for (let ms = 0; ms < 8 * 60_000 && rt.vehicles.includes(s); ms += 1_000) rt.update(1_000, { day: 3, minuteOfDay: 19 * 60 + Math.floor(ms / 60_000) }, []);
  assert.ok(!rt.vehicles.includes(s), 'el patinete no desaparece al salir');
  const district = getLocation('district');
  const dt = new Traffic(withDistrictLanes(district, district.traffic!.bikes!), BIKES, [], district.ground[0].length * 16, seededRng(1));
  assert.equal(dt.forceSpawn('scooter', clock), false, 'sale un patinete forzado en Vallesco');
  assert.equal(dt.vehicles.filter((v) => v.type.id === 'scooter').length, 0);
  // Sin permiso explícito del barrio (un flujo sin pasar por los barrios), nunca: un tipo nuevo no sale por descuido.
  const raw = new Traffic(district.traffic!.bikes!, BIKES, [], district.ground[0].length * 16, seededRng(2));
  assert.equal(raw.forceSpawn('scooter', clock), false);
  for (let m = 0; m < 3 * 24 * 60; m++) raw.update(1_000, { day: 2 + Math.floor(m / 1440), minuteOfDay: m % 1440 }, []);
  assert.equal(raw.vehicles.filter((v) => v.type.id === 'scooter').length, 0, 'patinetes sin permiso de barrio');
}

console.log('check-scooters: ninguno en Vallesco (ni forzado), ocasionales en la Ribera por su carril bici, más cortos que una bici, sin permiso no sale ninguno, OK');
