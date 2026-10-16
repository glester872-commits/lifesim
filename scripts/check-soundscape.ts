// El sonido de la ciudad (systems/Soundscape) sin altavoz: cuatro capas como mucho, la distancia apaga, sólo cuentan
// las fuentes más cercanas, y cada fuente suena por lo que pasa en el mundo (la fuente siempre; una terraza sólo
// abierta y con gente; el metro según su tren; un coche según su velocidad). Lo que suena de verdad se escucha en el
// navegador (audio/CityAudio); aquí, que lo que se le pide tenga sentido. Sin Phaser.
// Llamado desde la cadena `check` de package.json. `node scripts/check-soundscape.ts`.
import assert from 'node:assert/strict';
import { PLACES } from '../src/data/places.ts';
import { PROPS } from '../src/world/tiles.ts';
import { allLocations, getLocation } from '../src/systems/LocationSystem.ts';
import { isOpen, placeInfo } from '../src/systems/Places.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { StreetLife, streetProfileFor } from '../src/systems/StreetLife.ts';
import { LAYERS, NEAREST, REACH, crowdLevel, falloff, metroLevel, mix, terraceEmitters, vehicleLevel, type Emitter } from '../src/systems/Soundscape.ts';

// ------------------------------------------------------------ mezcla: tope de capas, distancia, las más cercanas

assert.deepEqual([...LAYERS], ['water', 'murmur', 'traffic', 'metro'], 'cuatro capas, ni una más');
const water = (x: number): Emitter => ({ layer: 'water', x, y: 0, level: 1 });
let last = 2;
for (let d = 0; d <= REACH.water + 1; d += 0.5) {
  const g = mix({ x: 0, y: 0 }, [water(d)]).water;
  assert.ok(g <= last, `más lejos, más bajo (${d} tiles: ${g})`);
  last = g;
}
assert.equal(mix({ x: 0, y: 0 }, [water(REACH.water)]).water, 0, 'en el borde de su alcance, nada');
assert.ok(mix({ x: 0, y: 0 }, [water(1)]).water > 0.6, 'al lado de la fuente, se oye');
assert.equal(falloff('traffic', 0), 1);
// Veinte coches no suenan más que los tres más cercanos.
const cars = (n: number): Emitter[] => Array.from({ length: n }, (_, i) => ({ layer: 'traffic' as const, x: 2 + i * 0.1, y: 0, level: 0.6 }));
assert.equal(mix({ x: 0, y: 0 }, cars(20)).traffic, mix({ x: 0, y: 0 }, cars(NEAREST)).traffic, `sólo cuentan las ${NEAREST} más cercanas`);
// Todo a la vez, a tope: ninguna capa pasa de 1 y no aparece ninguna otra.
const everything = LAYERS.flatMap((layer) => Array.from({ length: 10 }, () => ({ layer, level: 5 })));
const loud = mix({ x: 0, y: 0 }, everything);
assert.deepEqual(Object.keys(loud), [...LAYERS]);
for (const layer of LAYERS) assert.ok(loud[layer] <= 1 && loud[layer] > 0.99, `${layer} satura en 1, no más`);
assert.deepEqual(mix({ x: 0, y: 0 }, []), { water: 0, murmur: 0, traffic: 0, metro: 0 }, 'sin fuentes, silencio');

// ------------------------------------------------------------ niveles: lo que pasa en el mundo

assert.equal(crowdLevel(false, 8, 8), 0, 'cerrado: no suena aunque haya alguien recogiendo');
assert.equal(crowdLevel(true, 0, 8), 0, 'abierto y vacío: no suena');
assert.ok(crowdLevel(true, 8, 8) > crowdLevel(true, 2, 8), 'más gente, más murmullo');
assert.ok(vehicleLevel(0, 40) < vehicleLevel(40, 40), 'un coche parado suena menos que uno a su velocidad');
assert.ok(metroLevel('ARRIVING') > metroLevel('BOARDING') && metroLevel('BOARDING') > metroLevel('AWAY'), 'el andén, según el tren');

// ------------------------------------------------------------ fuentes en los datos de todos los barrios

const exteriors = allLocations().filter((l) => l.kind !== 'interior');
const sounding = exteriors.flatMap((l) => l.props.filter((p) => PROPS[p.kind].sound).map((p) => `${l.id}:${p.kind}`));
assert.ok(sounding.includes('district:fountain') && sounding.includes('velaria:fountain'), `las fuentes de agua suenan: ${sounding.join(', ')}`);
for (const [kind, def] of Object.entries(PROPS)) if (def.sound) assert.ok(LAYERS.includes(def.sound.layer) && def.sound.level > 0 && def.sound.level <= 1, `${kind}: sonido válido`);
const mouths = exteriors.filter((l) => l.portals.some((p) => getLocation(p.to.location).metro)).map((l) => l.id);
assert.ok(mouths.length >= 6, `la boca del metro suena en cada barrio con metro: ${mouths.join(', ')}`);
const terraces = PLACES.map((p) => placeInfo(p.id)!).filter((p) => p.anchors?.length && p.type === 'business');
const withTerrace = [...new Set(terraces.map((p) => p.locationId))];
assert.ok(withTerrace.length >= 2, `terrazas con murmullo en más de un barrio: ${withTerrace.join(', ')}`);

// ------------------------------------------------------------ la terraza de verdad: la Cafetería Pausa con su gente

const cafe = placeInfo('cafe')!;
const loc = getLocation(cafe.locationId);
const spots = cafe.anchors!.map((a) => loc.points![a]);
const near = { tx: spots[0].tx, ty: spots[0].ty + 2 };
const SAT = 6;
function terraceOver(hour: number): { heard: number; peak: number; people: number } {
  const street = new StreetLife(loc, streetProfileFor(loc.id)!, seededRng(7));
  let clock = { day: SAT, hour, minute: 0 };
  street.populate(clock, near);
  let heard = 0;
  let peak = 0;
  let people = 0;
  for (let ms = 0; ms < 40 * 500; ms += 100) {
    street.update(100, clock, near);
    if (ms % 500 === 0) clock = { ...clock, minute: clock.minute + 1 };
    const e = terraceEmitters(spots, isOpen(cafe, clock.day, clock.hour, clock.minute), street.agents);
    people = Math.max(people, street.agents.filter((a) => !a.moving && spots.some((s) => Math.hypot(a.x - s.tx, a.y - s.ty) < 1.5)).length);
    if (!e.length) continue;
    heard++;
    peak = Math.max(peak, mix({ x: near.tx, y: near.ty }, e).murmur);
  }
  return { heard, peak, people };
}
const day = terraceOver(11);
assert.ok(day.people > 0 && day.heard > 0 && day.peak > 0.2, `la terraza abierta y con gente se oye (${JSON.stringify(day)})`);
assert.ok(!isOpen(cafe, SAT, 3, 0));
const night = terraceOver(3);
assert.equal(night.heard, 0, `la terraza cerrada no suena (${JSON.stringify(night)})`);

console.log(`Sonido: 4 capas, distancia y ${NEAREST} más cercanas; fuentes en ${sounding.length} props, metro en ${mouths.length} barrios, terrazas en ${withTerrace.join(', ')}; terraza de día ${day.peak} (pico ${day.people} personas), de noche en silencio OK`);
