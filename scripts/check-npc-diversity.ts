// Variedad de la gente vestida con ropa de verdad (systems/Population.DRESSED, data/outfits.FASHION_OUTFITS): `npm run check`.
// El catálogo llega a lo mínimo (4 siluetas, 6 peinados, 6 conjuntos), el aspecto es estable (la misma persona siempre igual),
// los conjuntos casan con la moda de cada cual y nadie de la pelea ni con nombre cambia de ropa.
import assert from 'node:assert/strict';
import { FASHION_OUTFITS } from '../src/data/outfits.ts';
import { NPC_DEFS, PASSENGER_LOOKS } from '../src/data/npcs.ts';
import { FIGHTER_PROFILES } from '../src/data/streetEvents.ts';
import { DRESSED, GENERATED_PEOPLE } from '../src/systems/Population.ts';
import { outfitOf } from '../src/systems/People.ts';

const dressed = GENERATED_PEOPLE.filter((g) => DRESSED.has(g.look.id));
assert.equal(dressed.length, DRESSED.size, 'DRESSED nombra a alguien que no existe');
for (const g of dressed) assert.ok(g.look.outfit, `${g.look.id} sin ropa`);
for (const g of GENERATED_PEOPLE) if (!DRESSED.has(g.look.id)) assert.equal(g.look.outfit, undefined, `${g.look.id} vestido sin estar en DRESSED`);

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
for (const f of FIGHTER_PROFILES) assert.ok(!DRESSED.has(f.look), `${f.look} (pelea) vestido`);
assert.ok(NPC_DEFS.every((n) => !n.outfit), 'un personaje con nombre ha cambiado de ropa');
// Anti-clones: la firma de ropa ve el corte de quien va vestido.
const idx = (id: string): number => PASSENGER_LOOKS.findIndex((l) => l.id === id);
assert.ok(dressed.every((g) => outfitOf(idx(g.look.id)).startsWith(`${g.look.outfit!.top}:`)), 'la firma de ropa no ve el corte');

console.log(`vestidos ${dressed.length}: ${builds} complexiones, ${silhouettes} cuerpos (complexión/altura), ${hair} peinados, ${sets} conjuntos; catálogo ${catalog} conjuntos para ${Object.keys(FASHION_OUTFITS).length} modas`);
console.log('OK: variedad mínima, ropa coherente con la moda, sin tocar a quien pelea ni a los personajes con nombre.');
