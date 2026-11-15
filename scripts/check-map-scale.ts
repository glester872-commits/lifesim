// MAP-EXP-01: la escala de los barrios frente a Vallesco. escala = área / área(district); densidad = edificios por 1000 tiles.
import assert from 'node:assert/strict';
import { LOCATIONS } from '../src/data/locations.ts';

const rows = LOCATIONS.filter((l) => l.kind === 'exterior').map((l) => {
  const w = l.ground[0]?.length ?? 0;
  const h = l.ground.length;
  const buildings = l.buildings ?? [];
  return {
    id: l.id,
    size: `${w}x${h}`,
    area: w * h,
    buildings: buildings.length,
    enter: buildings.filter((b) => b.enter).length,
    props: l.props.length,
    points: Object.keys(l.points ?? {}).length,
  };
});

const base = rows.find((r) => r.id === 'district');
assert.ok(base, 'sin Vallesco (district) no hay escala');
const table = rows.map((r) => ({ ...r, scale: +(r.area / base.area).toFixed(3), per1000: +((r.buildings * 1000) / r.area).toFixed(1) }));
console.table(table);

const luna = table.find((r) => r.id === 'luna');
assert.ok(luna, 'falta Luna');
assert.ok(luna.area >= 1500, `Luna mide ${luna.area} tiles, menos de 1500`);
// Polígono Norte (DEC-02) queda fuera de los umbrales de densidad hasta que se cierre su rediseño.
const dense = table.filter((r) => r.id !== 'poligono-norte');
assert.ok(dense.includes(luna) && luna.per1000 >= 12, `Luna con ${luna.per1000} edificios/1000 tiles, menos de 12`);

console.log('check-map-scale: ok');
