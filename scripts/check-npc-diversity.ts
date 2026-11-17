// Variedad de la gente vestida con ropa de verdad (los 36 vecinos de systems/Population, data/outfits.FASHION_OUTFITS): `npm run check`.
// El catálogo llega a lo mínimo (4 siluetas, 6 peinados, 6 conjuntos), el aspecto es estable (la misma persona siempre igual),
// los conjuntos casan con la moda de cada cual y nadie de la pelea ni con nombre cambia de ropa.
import assert from 'node:assert/strict';
import { FASHION_OUTFITS } from '../src/data/outfits.ts';
import { NPC_DEFS, PASSENGER_LOOKS, staffLook, UNIFORM_LOOKS } from '../src/data/npcs.ts';
import { FIGHTER_PROFILES } from '../src/data/streetEvents.ts';
import { GENERATED_COUNT, GENERATED_PEOPLE, outfitSignature } from '../src/systems/Population.ts';
import { outfitOf } from '../src/systems/People.ts';
import { POPULATION_PROFILES } from '../src/data/population.ts';

// Los 36, todos vestidos (world/HdCache hornea su ropa al aparecer, no al arrancar).
const dressed = GENERATED_PEOPLE;
assert.equal(dressed.length, GENERATED_COUNT);
assert.equal(GENERATED_COUNT, 36);
for (const g of dressed) assert.ok(g.look.outfit, `${g.look.id} sin ropa`);

const kinds = <T>(xs: T[]): number => new Set(xs).size;
const silhouettes = kinds(dressed.map((g) => `${g.look.build}/${g.look.height}`));
const builds = kinds(dressed.map((g) => g.look.build));
const hair = kinds(dressed.map((g) => g.look.hairStyle));
const sets = kinds(dressed.map((g) => `${g.look.outfit!.top}/${g.look.outfit!.bottom}/${g.look.outfit!.shoes}`));
const catalog = kinds(Object.values(FASHION_OUTFITS).flat().map((o) => `${o.top}/${o.bottom}/${o.shoes}`));
assert.ok(builds >= 4 && silhouettes >= 4, `pocas siluetas: ${builds} complexiones, ${silhouettes} cuerpos`);
assert.ok(hair >= 6, `pocos peinados: ${hair}`);
assert.ok(sets >= 6, `pocos conjuntos entre los vestidos: ${sets}`);
assert.ok(catalog >= 6, `catálogo corto: ${catalog}`);

// Coherente con su moda: el conjunto de cada vestido es uno de los de su moda.
for (const g of dressed) {
  const o = g.look.outfit!;
  assert.ok(FASHION_OUTFITS[g.person.fashion].some((s) => s.top === o.top && s.bottom === o.bottom && s.shoes === o.shoes), `${g.look.id}: la ropa no es de su moda (${g.person.fashion})`);
}
// Coherencia del catálogo: el traje no va con chándal, ni la ropa de deporte con zapatos de vestir.
for (const o of Object.values(FASHION_OUTFITS).flat()) {
  if (o.top === 'blazer' || o.top === 'coat') assert.ok(!['track', 'shorts', 'joggers'].includes(o.bottom) && o.shoes !== 'runner', `conjunto sin sentido: ${JSON.stringify(o)}`);
  if (o.top === 'sport') assert.ok(o.bottom === 'track' && o.shoes === 'runner', `deporte mezclado: ${JSON.stringify(o)}`);
}
// Las identidades diseñadas no cambian: quien pelea y los personajes con nombre siguen sin ropa nueva.
// Quien pelea no es de los vecinos: su dibujo de pelea (world/StreetEventView) no cambia.
for (const f of FIGHTER_PROFILES) assert.ok(!dressed.some((g) => g.look.id === f.look), `${f.look} (pelea) es un vecino`);
assert.ok(UNIFORM_LOOKS.every((u) => !u.outfit), 'un uniforme ha cambiado de ropa');
// Estable: la misma semilla da la misma ropa. Y nadie igual a otro (anti-clones de systems/Population).
assert.equal(new Set(dressed.map((g) => outfitSignature(g.look))).size, dressed.length, 'dos vecinos con la misma ropa');
assert.ok(NPC_DEFS.every((n) => !n.outfit), 'un personaje con nombre ha cambiado de ropa');
// Anti-clones: la firma de ropa ve el corte de quien va vestido.
const idx = (id: string): number => PASSENGER_LOOKS.findIndex((l) => l.id === id);
assert.ok(dressed.every((g) => outfitOf(idx(g.look.id)).startsWith(`${g.look.outfit!.top}:`)), 'la firma de ropa no ve el corte');

// Las cajas de las tiendas: cada una con su dependiente (data/npcs CLERKS), que exista y que no lo comparta otra tienda.
const tills = POPULATION_PROFILES.flatMap((pr) => pr.staff.filter((r) => r.service === 'cashier' && r.look?.startsWith('dependiente-')).map((r) => ({ place: pr.place, look: r.look! })));
for (const t of tills) assert.ok(UNIFORM_LOOKS.some((u) => u.id === t.look), `${t.place}: ${t.look} no existe`);
assert.equal(new Set(tills.map((t) => t.look)).size, tills.length, 'dos tiendas con el mismo dependiente');
assert.ok(tills.length >= 20, `sólo ${tills.length} cajas con dependiente propio`);
assert.ok(!POPULATION_PROFILES.some((pr) => pr.staff.some((r) => r.service === 'cashier' && r.look === 'uniforme-tienda')), 'queda una caja con el dependiente genérico');
const faces = new Set(tills.map((t) => { const u = UNIFORM_LOOKS.find((l) => l.id === t.look)!; return `${u.skin}/${u.hair}/${u.hairStyle}`; }));
assert.equal(faces.size, tills.length, 'dos dependientes con la misma cara');

// El personal anónimo con uniforme compartido: siete caras por uniforme, todas existen, y el de un solo dueño no cambia.
const waiters = new Set(Array.from({ length: 14 }, (_, i) => staffLook('uniforme-sala', i)));
assert.equal(waiters.size, 7, `uniforme de sala con ${waiters.size} caras`);
for (const id of waiters) assert.ok(UNIFORM_LOOKS.some((u) => u.id === id), `${id} no existe`);
assert.equal(new Set([...waiters].map((id) => UNIFORM_LOOKS.find((u) => u.id === id)!.skin ?? '-')).size, 7, 'dos caras de sala con la misma piel');
assert.equal(staffLook('dobok-negro', 3), 'dobok-negro');
assert.equal(staffLook('dependiente-capan', 3), 'dependiente-capan');
assert.ok(UNIFORM_LOOKS.filter((u) => u.id.startsWith('uniforme-sala#')).every((u) => u.cloth === UNIFORM_LOOKS.find((b) => b.id === 'uniforme-sala')!.cloth), 'una cara de sala cambió de ropa');

console.log(`vestidos ${dressed.length}: ${builds} complexiones, ${silhouettes} cuerpos (complexión/altura), ${hair} peinados, ${sets} conjuntos; catálogo ${catalog} conjuntos para ${Object.keys(FASHION_OUTFITS).length} modas`);
console.log(`dependientes: ${tills.length} cajas, ${faces.size} caras distintas`);
console.log('OK: variedad mínima, ropa coherente con la moda, sin tocar a quien pelea ni a los personajes con nombre.');
