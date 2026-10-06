// Gente del barrio (data/identity.ts, systems/Population.ts, systems/People.ts): `npm run check`.
// Falla si la población no es la misma en cada arranque, si no se ve variada, si
// el aspecto se cuela en lo que la gente hace, si una relación no tiene sentido,
// si los grupos de la calle no son gente que se conoce o se separan, o si los
// personajes con nombre cambian.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BOND_RELATIONS, SKIN_TONES, type RelationType } from '../src/data/identity.ts';
import { AUTHORED_PASSENGERS, NPC_DEFS, PASSENGER_LOOKS } from '../src/data/npcs.ts';
import { CHARACTERS } from '../src/data/characters.ts';
import { FIGHTER_PROFILES } from '../src/data/streetEvents.ts';
import { GENERATED_LOOKS } from '../src/systems/Population.ts';
import { attractedTo, compatible, IDENTITIES, relation, RELATIONSHIPS, roleAffinity } from '../src/systems/People.ts';
import { getLocation } from '../src/systems/LocationSystem.ts';
import { StreetLife, streetProfileFor, type Walker } from '../src/systems/StreetLife.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { NAMED_PEOPLE, NAMED_RELATIONSHIPS } from '../src/data/namedPeople.ts';
import { namedRelation, tiesOf } from '../src/systems/People.ts';
import { Conversation, ChatLog } from '../src/systems/Chat.ts';
// world/HumanArt no se carga en node (imports sin extensión): lo que no fija un aspecto sale del id igual que en colorsOf().
const FALLBACK_SKINS = ['#e3b692', '#d3a17c', '#b98462', '#96654a', '#f0caa8'];
function fnv(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}
const skinOf = (l: { id: string; skin?: string }): string => l.skin ?? FALLBACK_SKINS[fnv(l.id) % FALLBACK_SKINS.length];

// ------------------------------------------------ siempre la misma gente
const again = (await import('../src/systems/Population.ts?otra-vez')) as typeof import('../src/systems/Population.ts');
assert.equal(JSON.stringify(again.GENERATED_LOOKS), JSON.stringify(GENERATED_LOOKS), 'la población cambia entre arranques');
assert.equal(IDENTITIES.length, PASSENGER_LOOKS.length);

// ------------------------------------------------ variedad que se ve
const tone = (hex: string | undefined): number => SKIN_TONES.indexOf(hex as (typeof SKIN_TONES)[number]);
const tones = new Set(GENERATED_LOOKS.map((l) => tone(l.skin)));
assert.ok(tones.size >= 8, `sólo ${tones.size} tonos de piel`);
assert.ok([...tones].filter((t) => t >= 8).length >= 2 && [...tones].filter((t) => t <= 2).length >= 2, 'faltan tonos muy claros o muy oscuros');
const hair = new Set(GENERATED_LOOKS.map((l) => l.hairStyle));
assert.ok(hair.size >= 9, `sólo ${hair.size} peinados`);
assert.ok(['afro', 'braids', 'locs'].some((h) => hair.has(h as never)), 'ningún pelo afro, trenzas ni rastas');
for (const b of ['thin', 'average', 'athletic', 'muscular', 'stocky', 'curvy', 'heavy']) assert.ok(IDENTITIES.some((p) => p.build === b), `nadie ${b}`);
for (const h of ['short', 'average', 'tall']) assert.ok(PASSENGER_LOOKS.some((l) => (l.height ?? 'average') === h), `nadie de altura ${h}`);
for (const k of ['facialHair', 'glasses', 'piercing', 'earrings', 'ink', 'cap', 'bag'] as const) assert.ok(PASSENGER_LOOKS.some((l) => l[k]), `nadie con ${k}`);
assert.ok(IDENTITIES.some((p) => p.cane), 'nadie con bastón');
assert.ok(IDENTITIES.some((p) => p.gender === 'nonbinary') && IDENTITIES.some((p) => p.trans), 'faltan personas no binarias o trans');
for (const o of ['heterosexual', 'gay', 'lesbian', 'bisexual', 'asexual']) assert.ok(IDENTITIES.some((p) => p.orientation === o), `nadie ${o}`);
assert.ok(new Set(IDENTITIES.map((p) => p.fashion)).size >= 8, 'poca variedad de estilos');
const ages = IDENTITIES.map((p) => p.age);
assert.ok(Math.min(...ages) < 22 && Math.max(...ages) > 70, 'sin gente joven o mayor');
// La identidad de género no fija el aspecto: hay presentaciones que no son «la de su género».
assert.ok(IDENTITIES.some((p) => (p.gender === 'woman' && p.presentation !== 'feminine') || (p.gender === 'man' && p.presentation !== 'masculine')));

// ------------------------------------------------ aspecto y comportamiento, separados
// La identidad no lleva nada de aspecto…
for (const p of IDENTITIES) for (const k of ['skin', 'hair', 'hairStyle', 'origin', 'texture']) assert.ok(!(k in p), `${p.id} lleva ${k} en su identidad`);
// …y lo que decide comportamiento no importa nada de aspecto.
for (const file of ['src/systems/People.ts', 'src/systems/StreetLife.ts', 'src/systems/StreetEvents.ts']) {
  const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  for (const name of ['SKIN_TONES', 'ORIGINS', 'HAIR_COLORS', 'OriginPalette']) assert.ok(!src.includes(name), `${file} lee ${name}`);
}
// Estadístico: la afinidad con la noche y con la calle a deshoras no depende del tono de piel.
const dark = IDENTITIES.filter((p) => tone(PASSENGER_LOOKS[p.index].skin) >= 7);
const light = IDENTITIES.filter((p) => {
  const t = tone(PASSENGER_LOOKS[p.index].skin);
  return t >= 0 && t <= 3;
});
for (const role of ['club-queue', 'club-smoke', 'night-walker', 'passer']) {
  const mean = (g: typeof IDENTITIES): number => g.reduce((s, p) => s + roleAffinity(p, role), 0) / g.length;
  const [d, l] = [mean(dark), mean(light)];
  assert.ok(Math.max(d, l) / Math.min(d, l) < 3, `${role}: afinidad ${d.toFixed(2)} vs ${l.toFixed(2)} según la piel`);
}
// Quien pelea en la noche clandestina sale de fichas escritas, de varios tonos y sin cambiar su dibujo.
const fighterTones = new Set(FIGHTER_PROFILES.map((f) => skinOf(PASSENGER_LOOKS.find((l) => l.id === f.look)!)));
assert.ok(fighterTones.size >= 3, 'quien pelea es todo del mismo tono de piel');
for (const f of FIGHTER_PROFILES) assert.equal(PASSENGER_LOOKS.find((l) => l.id === f.look)!.build, undefined, `${f.look}: el dibujo de la pelea cambió`);

// ------------------------------------------------ relaciones
const count = (t: RelationType): number => RELATIONSHIPS.filter((r) => r.type === t).length;
for (const t of ['acquaintances', 'friends', 'best-friends', 'couple', 'married', 'dating', 'exes', 'siblings', 'relatives', 'coworkers', 'roommates', 'crush'] as RelationType[]) {
  assert.ok(count(t) > 0, `ninguna relación ${t}`);
}
const romantic = count('couple') + count('married') + count('dating');
assert.ok(count('friends') + count('best-friends') >= romantic * 2, 'más parejas que amistades');
const partners = new Map<number, number>();
for (const r of RELATIONSHIPS) {
  assert.notEqual(r.a, r.b, 'relación con uno mismo');
  const [a, b] = [IDENTITIES[r.a], IDENTITIES[r.b]];
  if (r.type === 'couple' || r.type === 'married' || r.type === 'dating') {
    assert.ok(compatible(a, b), `${a.name} (${a.gender}, ${a.orientation}) y ${b.name} (${b.gender}, ${b.orientation}): pareja sin atracción mutua`);
    for (const x of [r.a, r.b]) partners.set(x, (partners.get(x) ?? 0) + 1);
  }
  if (r.type === 'crush') {
    assert.ok(attractedTo(a, b), `${a.name}: flechazo sin atracción`);
    assert.equal(relation(r.b, r.a), 'strangers', 'el flechazo no es de ida y vuelta');
  } else assert.equal(relation(r.a, r.b), relation(r.b, r.a));
}
assert.ok([...partners.values()].every((n) => n === 1), 'alguien con dos parejas a la vez');
// Parejas de mismo género y de géneros distintos: el sistema no da por hecho ninguna.
const couples = RELATIONSHIPS.filter((r) => r.type === 'couple' || r.type === 'married' || r.type === 'dating');
assert.ok(couples.some((r) => IDENTITIES[r.a].gender !== IDENTITIES[r.b].gender), 'ninguna pareja de géneros distintos');
const sameGender = couples.filter((r) => IDENTITIES[r.a].gender === IDENTITIES[r.b].gender).length;

// ------------------------------------------------ grupos en la calle
const loc = getLocation('district');
const street = new StreetLife(loc, streetProfileFor('district')!, seededRng(7));
const player = { tx: 72, ty: 58 };
let clock = { day: 6, hour: 11, minute: 0 };
street.populate(clock, player);
// Quien acompaña y a quién acompañaba al verlo (si luego se despide y sigue solo, deja de tener grupo).
const seen = new Map<number, { c: Walker; lead: number }>();
let gaps = 0;
let gapSum = 0;
for (let ms = 0; ms < 14 * 60 * 500; ms += 100) {
  street.update(100, clock, player);
  if (ms % 500 === 0) {
    const t = clock.hour * 60 + clock.minute + 1;
    clock = { day: clock.day + Math.floor(t / 1440), hour: Math.floor((t % 1440) / 60), minute: t % 60 };
  }
  for (const a of street.agents) {
    if (a.leader && !seen.has(a.id)) seen.set(a.id, { c: a, lead: a.leader.look });
    // Juntos por el camino: quien acompaña no se aleja de quien lleva el grupo.
    if (a.leader && a.moving && a.leader.moving && a.delay <= 0 && !a.vanish && street.agents.includes(a.leader)) {
      gaps++;
      gapSum += Math.hypot(a.x - a.leader.x, a.y - a.leader.y);
    }
  }
}
const companions = [...seen.values()];
const tied = companions.filter(({ c }) => c.tie);
assert.ok(companions.length >= 20, `pocos grupos en un sábado entero: ${companions.length}`);
assert.ok(tied.length / companions.length > 0.6, `sólo ${tied.length}/${companions.length} acompañantes se conocen`);
for (const { c, lead } of tied) {
  assert.equal(relation(c.look, lead), c.tie, 'quien acompaña no es lo que dice ser');
  assert.ok(BOND_RELATIONS[c.bond!].includes(c.tie!), `${c.tie} en un grupo de ${c.bond}`);
}
const bonds = new Set(tied.map(({ c }) => c.bond));
for (const b of ['couple', 'friends']) assert.ok(bonds.has(b as never), `ningún grupo de ${b}`);
const gap = gapSum / gaps;
assert.ok(gap < 3, `los grupos se separan al andar: ${gap.toFixed(2)} tiles de media`);
assert.equal(street.pathFailures, 0);

// ------------------------------------------------ personajes con nombre, intactos
for (const c of CHARACTERS) {
  const def = NPC_DEFS.find((n) => n.id === c.npc)!;
  assert.ok(def && def.build === undefined && def.height === undefined, `${c.npc}: su aspecto cambió`);
}
assert.equal(PASSENGER_LOOKS.slice(0, AUTHORED_PASSENGERS.length).map((l) => l.id).join(), AUTHORED_PASSENGERS.map((l) => l.id).join());

console.log(
  `población OK: ${IDENTITIES.length} personas · ${tones.size} tonos de piel nuevos · ${hair.size} peinados · ${RELATIONSHIPS.length} relaciones ` +
  `(${count('friends') + count('best-friends')} amistades, ${romantic} parejas, ${sameGender} del mismo género) · ` +
  `${companions.length} acompañantes en un sábado, ${tied.length} con relación · grupos: ${[...bonds].join(', ')} · separación media ${gap.toFixed(2)} tiles`,
);

// ------------------------------------------------ personajes con nombre: identidad y relaciones escritas
for (const npc of NPC_DEFS) assert.ok(NAMED_PEOPLE[npc.id], `${npc.id}: personaje con nombre sin identidad`);
for (const id of Object.keys(NAMED_PEOPLE)) assert.ok(NPC_DEFS.some((n) => n.id === id), `${id}: identidad de nadie`);
// Sus edades encajan con lo que ya se dice de ellos (data/characters.ts: Sara, 24; Ada, 21).
assert.equal(NAMED_PEOPLE.sara.age, 24);
assert.equal(NAMED_PEOPLE.ada.age, 21);
for (const p of Object.values(NAMED_PEOPLE)) for (const k of ['skin', 'hair', 'origin']) assert.ok(!(k in p), `identidad con nombre con ${k}`);
const namedPartners = new Map<string, number>();
for (const r of NAMED_RELATIONSHIPS) {
  const a = NAMED_PEOPLE[r.a];
  const b = NAMED_PEOPLE[r.b];
  if (r.type === 'couple' || r.type === 'married' || r.type === 'dating') {
    assert.ok(attractedTo(a, b) && attractedTo(b, a), `${r.a} y ${r.b}: pareja sin atracción mutua`);
    for (const id of [r.a, r.b]) namedPartners.set(id, (namedPartners.get(id) ?? 0) + 1);
  } else if (r.type === 'exes') assert.ok(attractedTo(a, b) && attractedTo(b, a), `${r.a} y ${r.b}: ex sin atracción mutua`);
  else if (r.type === 'crush') {
    assert.ok(attractedTo(a, b), `${r.a}: flechazo sin atracción`);
    assert.equal(namedRelation(r.b, r.a), 'strangers', 'el flechazo con nombre no es de ida y vuelta');
  } else assert.equal(namedRelation(r.a, r.b), namedRelation(r.b, r.a));
}
assert.ok([...namedPartners.values()].every((n) => n === 1), 'un personaje con nombre con dos parejas');
const namedFriends = NAMED_RELATIONSHIPS.filter((r) => r.type === 'friends' || r.type === 'best-friends' || r.type === 'coworkers').length;
assert.ok(namedFriends > namedPartners.size, 'más parejas que amistades entre los personajes con nombre');
// Sara y Ada salen juntas el viernes (OUTINGS): son amigas.
assert.equal(namedRelation('sara', 'ada'), 'best-friends');

// ------------------------------------------------ su gente: se descubre hablando, nunca un flechazo
const withPartner = RELATIONSHIPS.find((r) => r.type === 'couple' || r.type === 'married' || r.type === 'dating')!;
const partnerTies = tiesOf({ identity: withPartner.a });
assert.equal(partnerTies[0].name, IDENTITIES[withPartner.b].name, 'lo primero de lo que habla no es su pareja');
for (const r of RELATIONSHIPS.filter((x) => x.type === 'crush')) {
  assert.ok(!tiesOf({ identity: r.a }).some((t) => t.type === 'crush'), 'alguien cuenta su flechazo');
}
assert.ok(!tiesOf({ named: 'paula' }).some((t) => t.type === 'crush'), 'Paula cuenta su flechazo');
assert.equal(tiesOf({ named: 'bruno' })[0].name, 'Kike');
const lonely = IDENTITIES.find((p) => tiesOf({ identity: p.index }).length === 0);
// Hablando: «Preguntar por su gente» sólo sale si hay de quién hablar, y la respuesta lo nombra.
const ask = (input: { identity?: number; named?: string }, seed: number): string[] => {
  const talk = new Conversation({ who: `prueba:${seed}`, ...input, place: 'street', day: 3, hour: 18, minute: 0, weather: 'clear', group: false, rel: 1 }, new ChatLog(), seededRng(seed));
  let turn = talk.open();
  for (let i = 0; i < 6 && !turn.ends; i++) {
    const people = turn.options.find((o) => o.id === 'people');
    if (people) return talk.choose('people').lines;
    turn = talk.choose(turn.options[0].id);
  }
  return [];
};
const told = Array.from({ length: 12 }, (_, s) => ask({ identity: withPartner.a }, s)).flat();
assert.ok(told.some((l) => l.includes(IDENTITIES[withPartner.b].name)), 'nadie llega a hablar de su pareja');
if (lonely) assert.equal(Array.from({ length: 12 }, (_, s) => ask({ identity: lonely.index }, s)).flat().length, 0, '«Preguntar por su gente» a quien no tiene a nadie');
const sara = Array.from({ length: 12 }, (_, s) => ask({ named: 'sara' }, s)).flat();
assert.ok(sara.some((l) => l.includes('Ada')), 'Sara no habla nunca de Ada');
console.log(`personajes con nombre OK: ${Object.keys(NAMED_PEOPLE).length} identidades, ${NAMED_RELATIONSHIPS.length} relaciones (${namedFriends} de amistad o trabajo, ${namedPartners.size / 2} parejas); su gente se descubre hablando, nunca un flechazo`);
