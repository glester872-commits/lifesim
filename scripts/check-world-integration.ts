/**
 * La ciudad como un todo (systems/World.ts): cada barrio con su sitio en el árbol, cómo se va de uno a otro, un
 * solo reloj para todo, lo que pasa lejos del jugador sin simular a nadie, sucesos con barrio, gente diversa en
 * todos y los picos de cada calle dentro de su presupuesto (config/budgets.ts).
 */
import assert from 'node:assert/strict';
import { DISTRICT_IDENTITIES, LOCATION_DISTRICT } from '../src/data/districtIdentity.ts';
import { ZONES } from '../src/data/zones.ts';
import { PLACES } from '../src/data/places.ts';
import { STREET_PROFILES } from '../src/data/streets.ts';
import { STREET_EVENTS } from '../src/data/streetEvents.ts';
import { PASSENGER_LOOKS } from '../src/data/npcs.ts';
import { BUDGETS } from '../src/config/budgets.ts';
import { allLocations, getLocation } from '../src/systems/LocationSystem.ts';
import { placeInfo } from '../src/systems/Places.ts';
import { cityAt, cityEvents, districtAt, matchOn, matchPhase, placeDistrict, travel, worldTree } from '../src/systems/World.ts';
import { StreetLife } from '../src/systems/StreetLife.ts';
import { hashSeed, seededRng } from '../src/systems/MetroDaily.ts';
import { weekIndex } from '../src/systems/Calendar.ts';
import { zoneAt } from '../src/systems/Zones.ts';

// --------------------------------------------------- 1. MUNDO → BARRIO → ZONA → LUGAR
const tree = worldTree();
assert.deepEqual(tree.map((d) => d.id).sort(), Object.keys(DISTRICT_IDENTITIES).sort(), 'un barrio sin nodo');
const mapped = ['vallesco', 'vintage', 'ribera', 'velaria', 'puerta-central', 'cuatro-rios'];
for (const id of mapped) {
  const d = tree.find((n) => n.id === id)!;
  assert.ok(d.maps.length > 0, `${id} sin mapa`);
  assert.ok(d.zones.length > 0, `${id} sin zonas`);
  assert.ok(d.places.length > 0, `${id} sin lugares`);
  assert.ok(d.stop, `${id} sin parada de metro (propia o compartida)`);
}
for (const id of ['arena', 'luna']) assert.equal(tree.find((n) => n.id === id)!.maps.length, 0, `${id} tiene mapa: actualiza este check`);
for (const z of ZONES) assert.ok(z.districtId in DISTRICT_IDENTITIES, `zona ${z.id}: barrio ${z.districtId} desconocido`);
for (const loc of allLocations()) assert.ok(districtAt(loc.id), `${loc.id}: de ningún barrio`);
for (const loc of allLocations().filter((l) => l.kind !== 'interior')) assert.ok(loc.id in LOCATION_DISTRICT, `calle ${loc.id} fuera de LOCATION_DISTRICT`);
for (const p of PLACES) assert.ok(placeDistrict(placeInfo(p.id)!), `lugar ${p.id}: de ningún barrio`);
// La Calle del Carmen es un barrio dentro del mapa de Vallesco: la zona manda sobre el mapa.
const carmen = ZONES.find((z) => z.districtId === 'vintage')!;
assert.equal(districtAt(carmen.location, carmen.rects[0].tx, carmen.rects[0].ty), 'vintage');
assert.equal(districtAt('district'), 'vallesco');
assert.equal(districtAt('cafe'), 'vallesco', 'un interior es del barrio de su calle');

// --------------------------------------------------- 2. viajar
assert.deepEqual(travel('vallesco', 'vintage'), { mode: 'walk', map: 'district' }, 'Vallesco ↔ Carmen se anda');
const toRibera = travel('vallesco', 'ribera');
assert.ok(toRibera.mode === 'metro' && toRibera.minutes > 0 && toRibera.fare > 0, 'Vallesco → Ribera en metro');
const fromCarmen = travel('vintage', 'puerta-central');
assert.ok(fromCarmen.mode === 'metro' && fromCarmen.from === 'vallesco', 'desde el Carmen, el metro de Vallesco');
assert.equal(travel('vallesco', 'arena').mode, 'none', 'el Arena no tiene mapa todavía');
for (const a of mapped) for (const b of mapped) assert.notEqual(travel(a, b).mode, 'none', `${a} → ${b} sin forma de llegar`);

// --------------------------------------------------- 3. un reloj, lejos del jugador
let saturday = 8;
while (weekIndex(saturday) !== 5) saturday++;
const at = (day: number, hour: number, minute = 0) => cityAt({ day, hour, minute });
const dz = (s: ReturnType<typeof at>, id: string) => s.districts.find((d) => d.id === id)!;
assert.deepEqual(at(saturday, 18), at(saturday, 18), 'la ciudad no es determinista');
const morning = at(saturday - 3, 9);
const midday = at(saturday - 3, 13);
const lateNight = at(saturday, 1);
// Comercios que abren y cierran con el mismo reloj; la noche se enciende de madrugada y se apaga de mañana.
for (const id of mapped) assert.ok(dz(midday, id).open > dz(lateNight, id).open, `${id}: no cierra nada de madrugada`);
assert.ok(mapped.some((id) => dz(lateNight, id).nightlife), 'de madrugada no hay noche en ningún barrio');
assert.ok(mapped.every((id) => !dz(morning, id).nightlife), 'noche a las 9 de la mañana');
assert.ok(dz(at(saturday, 23), 'luna').nightlife && !dz(at(saturday, 12), 'luna').nightlife, 'Luna (sin mapa) sin ritmo de noche');
// Cada barrio a su ritmo: Velaria se vacía de noche, la Ribera se llena al atardecer.
assert.ok(dz(at(saturday - 3, 23), 'velaria').activity < dz(at(saturday - 3, 9), 'velaria').activity, 'Velaria no se vacía de noche');
assert.ok(dz(at(saturday - 3, 20), 'ribera').activity > dz(at(saturday - 3, 12), 'ribera').activity, 'la Ribera no se anima al atardecer');
// Los personajes con nombre cambian de sitio aunque nadie los mire.
const moves = new Map<string, Set<string>>();
for (let d = saturday - 5; d <= saturday + 1; d++)
  for (let h = 0; h < 24; h++) for (const c of at(d, h).characters) (moves.get(c.id) ?? moves.set(c.id, new Set()).get(c.id)!).add(c.location);
assert.ok(moves.size > 0, 'sin personajes con nombre');
for (const [id, places] of moves) assert.ok(places.size >= 2, `${id} no se mueve en una semana`);

// --------------------------------------------------- 4. sucesos con barrio
const seen = new Map<string, Set<string>>();
let matches = 0;
for (let d = 1; d <= 56; d++) {
  if (matchOn(d)) matches++;
  for (let h = 0; h < 24; h += 0.5)
    for (const e of cityEvents({ day: d, hour: Math.floor(h), minute: (h % 1) * 60 })) (seen.get(e.id) ?? seen.set(e.id, new Set()).get(e.id)!).add(e.district ?? '?');
}
const where = (id: string): string[] => [...(seen.get(id) ?? [])];
assert.deepEqual(where('vintage-market'), ['vintage'], 'el mercadillo vintage fuera del Carmen');
assert.deepEqual(where('vl-boutique-launch'), ['velaria'], 'el lanzamiento de moda fuera de Velaria');
assert.ok([...seen.keys()].some((id) => id.startsWith('pc-') && where(id)[0] === 'puerta-central'), 'sin artistas en Puerta Central');
assert.deepEqual(where('arena-match'), ['arena'], 'el partido fuera del Arena');
assert.ok(matches >= 10 && matches <= 40, `partidos en 8 semanas: ${matches}`);
// La pelea: rara, y sólo en zonas de noche, de evento o de calle comercial; nunca en una residencial ni en un parque.
const fightZones = new Set(['nightlife', 'special_event_area', 'commercial', 'main_road']);
for (const f of STREET_EVENTS) {
  assert.ok(seen.has(f.id), `${f.id}: ninguna noche en 8 semanas`);
  const z = zoneAt(f.location, f.area.tx + Math.floor(f.area.w / 2), f.area.ty + Math.floor(f.area.h / 2));
  assert.ok(z && fightZones.has(z.type), `${f.id}: pelea en zona ${z?.type ?? 'ninguna'}`);
}
// Fases del partido, en orden.
const md = Array.from({ length: 60 }, (_, i) => i + 1).find((d) => matchOn(d))!;
const phases = Array.from({ length: 48 }, (_, i) => matchPhase({ day: md, hour: Math.floor(i / 2), minute: (i % 2) * 30 })).filter(Boolean);
assert.deepEqual([...new Set(phases)], ['arrival', 'live', 'leaving'], 'el partido no llega, se juega y se vacía');

// --------------------------------------------------- 5. gente diversa en cada barrio y picos dentro del presupuesto
// El tono de piel como lo pinta world/HumanArt (las caras sin `skin` toman uno fijo por id), igual que check-population.
const FALLBACK_SKINS = ['#e3b692', '#d3a17c', '#b98462', '#96654a', '#f0caa8'];
const fnv = (text: string): number => {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
};
const skinOf = (look: number): string => {
  const l = PASSENGER_LOOKS[look % PASSENGER_LOOKS.length];
  return l.skin ?? FALLBACK_SKINS[fnv(l.id) % FALLBACK_SKINS.length];
};
const budget = BUDGETS.high;
for (const profile of STREET_PROFILES) {
  assert.ok(profile.maxWalkers <= budget.agents, `${profile.location}: maxWalkers ${profile.maxWalkers} > presupuesto ${budget.agents}`);
  const loc = getLocation(profile.location);
  // Pico: veinte minutos simulados en las horas fuertes, con la gente entrando y saliendo.
  let peak = 0;
  for (const [day, hour] of [[saturday - 3, 8.5], [saturday, 18], [saturday, 13]] as const) {
    const life = new StreetLife(loc, profile, seededRng(hashSeed('world', profile.location, day, hour)));
    let clock = { day, hour: Math.floor(hour), minute: (hour % 1) * 60 };
    const player = { tx: 0, ty: 0 };
    life.populate(clock, player);
    for (let ms = 0, el = 0; ms < 20 * 500; ms += 100) {
      life.update(100, clock, player);
      peak = Math.max(peak, life.agents.length);
      if ((el += 100) >= 500) {
        el -= 500;
        const t = clock.hour * 60 + clock.minute + 1;
        clock = { day, hour: Math.floor(t / 60) % 24, minute: t % 60 };
      }
    }
  }
  assert.ok(peak <= budget.agents, `${profile.location}: pico de ${peak} personas > presupuesto ${budget.agents}`);
  // Diversidad: dos semanas a cuatro horas, por barrio (el Carmen aparte de Vallesco). Lo que cambia entre barrios es
  // la ropa, la hora y a dónde se va; el tono de piel, nunca.
  const skins = new Map<string, Map<string, number>>();
  for (let day = 1; day <= 14; day++)
    for (const hour of [8.5, 13, 18, 21]) {
      const life = new StreetLife(loc, profile, seededRng(hashSeed('world-skin', profile.location, day, hour)));
      life.populate({ day, hour: Math.floor(hour), minute: (hour % 1) * 60 }, { tx: 0, ty: 0 });
      for (const a of life.agents) {
        if (a.kind === 'staff') continue;
        const d = districtAt(profile.location, a.x, a.y) ?? '?';
        const m = skins.get(d) ?? skins.set(d, new Map()).get(d)!;
        const s = skinOf(a.look);
        m.set(s, (m.get(s) ?? 0) + 1);
      }
    }
  for (const [d, m] of skins) {
    const total = [...m.values()].reduce((a, b) => a + b, 0);
    if (total < 60) continue;
    assert.ok(m.size >= 8, `${d}: sólo ${m.size} tonos de piel entre ${total} personas`);
    assert.ok(Math.max(...m.values()) / total < 0.3, `${d}: un tono de piel es casi un tercio de la calle`);
  }
  console.log(`  ${profile.location}: pico ${peak}/${budget.agents} · ${[...skins].map(([d, m]) => `${d} ${m.size} tonos`).join(', ')}`);
}

const now = at(saturday, 22);
console.log(`  sábado 22:00 → ${now.districts.map((d) => `${d.id} ×${d.activity}${d.nightlife ? ' noche' : ''}${d.events.length ? ` [${d.events.length} sucesos]` : ''}`).join(' · ')}`);
console.log(`check-world-integration: ${tree.length} barrios, viajes, un reloj, estado lejos del jugador, sucesos con barrio, diversidad y presupuestos, OK`);
