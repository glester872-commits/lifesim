// Regresión de lo que ningún otro check cubre: escenas, arranque del jugador, interiores con
// ida y vuelta, metro, vigilantes lejos de la vía, guardado completo, interacciones y texturas.
// Parte de `npm run check` y de `npm run test:regression`.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SAVE_KEY, SAVE_VERSION } from '../src/config/constants.ts';
import { START_LOCATION, START_SPAWN } from '../src/data/locations.ts';
import { getCatalog } from '../src/data/catalogs.ts';
import { getActivity } from '../src/data/activities.ts';
import { STORES, GARMENTS } from '../src/data/retail.ts';
import { LINES, STOPS } from '../src/data/transit.ts';
import { allLocations, getLocation, isWalkable } from '../src/systems/LocationSystem.ts';
import { destinationsFrom } from '../src/systems/Transit.ts';
import { SaveSystem } from '../src/systems/SaveSystem.ts';
import { emptyMemory } from '../src/systems/MetroEventManager.ts';
import { START_FITNESS } from '../src/systems/Fitness.ts';
import type { GameStateData } from '../src/types/game.ts';

const src = (p: string): string => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
const files = (dir: string): string[] =>
  readdirSync(new URL(`../src/${dir}`, import.meta.url), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
  );

// 1. Escenas: las que main.ts registra existen y todo scene.start() apunta a una de ellas.
const main = src('main.ts');
const sceneList = main.match(/scene:\s*\[([^\]]*)\]/)?.[1] ?? '';
const keys = new Set<string>();
for (const cls of sceneList.matchAll(/new (\w+)\(/g)) {
  const code = src(`scenes/${cls[1]}.ts`);
  const key = code.match(/super\(\{\s*key:\s*'([^']+)'/)?.[1];
  assert.ok(key, `escena ${cls[1]} sin key`);
  keys.add(key);
}
assert.ok(keys.has('Boot') && keys.has('World'), `escenas registradas: ${[...keys]}`);
for (const f of files('.')) {
  for (const m of src(f).matchAll(/scene\.start\('([^']+)'/g)) assert.ok(keys.has(m[1]), `${f}: scene.start('${m[1]}') no está registrada`);
}

// 3. Arranque del jugador: localización y spawn existen y son pisables.
const start = getLocation(START_LOCATION);
const spawn = start.spawns[START_SPAWN];
assert.ok(spawn, `spawn inicial ${START_SPAWN} no existe en ${START_LOCATION}`);
assert.ok(isWalkable(start, spawn.tx, spawn.ty), 'spawn inicial sólido');

// 5. Interiores: cada interior tiene salida a un sitio que a su vez tiene puerta hacia él.
for (const loc of allLocations()) {
  if (loc.kind !== 'interior' || loc.metro) continue;
  const exits = loc.portals.filter((p) => !p.train);
  assert.ok(exits.length > 0, `[${loc.id}] interior sin salida`);
  for (const p of exits) {
    const back = getLocation(p.to.location).portals.some((q) => q.to.location === loc.id);
    assert.ok(back, `[${loc.id}] sale a ${p.to.location}, pero desde allí no se vuelve a entrar`);
  }
  const entered = allLocations().some((o) => o.id !== loc.id && o.portals.some((q) => q.to.location === loc.id));
  assert.ok(entered, `[${loc.id}] interior al que no se entra desde ningún sitio`);
}

// 6. Metro: cada estación con parada tiene andén, puerta al tren y spawn 'train'; los destinos son simétricos.
for (const stop of STOPS) {
  const others = destinationsFrom(stop);
  assert.equal(others.length, STOPS.filter((s) => s.line === stop.line).length - 1, `${stop.id}: destinos incompletos`);
  for (const d of others) {
    assert.ok(d.minutes > 0 && d.fare > 0, `${stop.id} → ${d.stop.id}: minutos/tarifa`);
    const back = destinationsFrom(d.stop).find((x) => x.stop.id === stop.id);
    assert.equal(back?.minutes, d.minutes, `${stop.id} ↔ ${d.stop.id}: ida y vuelta distintas`);
  }
  if (!stop.station) continue;
  const st = getLocation(stop.station);
  assert.ok(st.metro, `${stop.station} sin andén`);
  assert.ok(st.spawns.train, `${stop.station} sin spawn 'train'`);
  assert.ok(st.portals.some((p) => p.train), `${stop.station} sin puerta al tren`);
}
assert.ok(LINES.every((l) => STOPS.some((s) => s.line === l.id)), 'línea sin paradas');

// 12. Seguridad: puestos y rondas nunca en la vía ni en el borde; el barrido y el aviso van por la fila de paso.
for (const loc of allLocations()) {
  const m = loc.metro;
  if (!m) continue;
  assert.ok(m.trackRow + 3 <= m.edgeRow && m.edgeRow < m.walkRow, `[${loc.id}] vía/borde/paso mal ordenados`);
  for (const g of m.guards) {
    for (const p of [g.post, ...g.patrol]) assert.ok(p.ty > m.edgeRow, `[${loc.id}] ${g.id} pisa la vía o el borde en ${p.tx},${p.ty}`);
  }
}
const metroSys = src('systems/MetroSystem.ts');
assert.ok(/const y =\s*this\.layout\.walkY \+\s*\d+;[\s\S]{0,900}guard\.sweep\(/.test(metroSys), 'el barrido del andén ya no va por la fila de paso');
// La escolta del carterista (MetroSystem.startPickpocket): por la fila de paso, el torniquete, el vestíbulo y la salida; nunca por la vía.
assert.ok(/escortRoute = \[[\s\S]{0,700}?\.walkY[\s\S]{0,700}?\.gate\b[\s\S]{0,400}?\.lobby[\s\S]{0,400}?\.entrance/.test(metroSys), 'la escolta del carterista ya no va por el andén hasta la salida');

// 10. Guardado: un estado completo sobrevive la ida y vuelta; versión ajena o JSON roto no cargan.
const store = new Map<string, string>();
const save = new SaveSystem({ read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) });
const full: GameStateData = {
  money: 42.5,
  energy: 77,
  day: 9,
  hour: 21,
  minute: 35,
  locationId: START_LOCATION,
  position: { x: 123, y: 456 },
  facing: 'left',
  events: emptyMemory(),
  inventory: { water: 2 },
  cards: { transport: 8.5 },
  appearance: { player: { hair: 'buzz', top: GARMENTS.find((g) => g.slot === 'top')!.id } },
  wardrobe: [GARMENTS[0].id],
  fitness: { ...START_FITNESS },
  social: {},
};
assert.ok(save.save(full));
assert.deepEqual(save.load(), full, 'el guardado no vuelve igual');
store.set(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION + 1, savedAt: 0, state: full }));
assert.equal(save.load(), null, 'carga una versión ajena');
store.set(SAVE_KEY, '{roto');
assert.equal(save.load(), null, 'carga JSON roto');
save.clear();
assert.equal(save.load(), null, 'clear no borra');

// 14. Interacciones: cada terminal, sitio, percha e inspección apunta a algo real y cae dentro del mapa.
let interactions = 0;
for (const loc of allLocations()) {
  const inside = (t: { tx: number; ty: number }, what: string): void => {
    interactions++;
    assert.ok(loc.ground[t.ty]?.[t.tx] !== undefined, `[${loc.id}] ${what} fuera del mapa en ${t.tx},${t.ty}`);
  };
  for (const t of loc.terminals ?? []) (getCatalog(t.catalog), inside(t, t.name));
  for (const s of loc.spots ?? []) {
    assert.ok(s.activities.length > 0 || s.wardrobe, `[${loc.id}] ${s.name} no hace nada`);
    s.activities.forEach(getActivity);
    inside(s, s.name);
  }
  for (const r of loc.racks ?? []) {
    assert.ok(STORES.some((st) => st.id === r.store), `[${loc.id}] ${r.name}: tienda ${r.store} desconocida`);
    inside(r, r.name);
  }
  for (const i of loc.inspects ?? []) {
    assert.ok(i.lines.length > 0, `[${loc.id}] ${i.name} sin texto`);
    inside(i, i.name);
  }
}

// 15. Texturas: toda clave literal que se pinta (add.image/sprite, setTexture) se crea con make() en algún sitio.
const made = new Set<string>();
const madePatterns: RegExp[] = [];
const used: [string, string][] = [];
for (const f of files('.')) {
  const code = src(f);
  for (const m of code.matchAll(/\bmake\(\s*\w+,\s*(['`])([^'`]+)\1/g)) {
    if (m[1] === "'") made.add(m[2]);
    else madePatterns.push(new RegExp(`^${m[2].replace(/[.*+?^()|[\]\\-]/g, '\\$&').replace(/\$\\?\{[^}]*\}/g, '.+')}$`));
  }
  for (const m of code.matchAll(/createCanvas\(\s*'([^']+)'/g)) made.add(m[1]);
  for (const m of code.matchAll(/(?:add\.(?:image|sprite)\(|setTexture\()((?:[^;\n()]|\([^()]*\))*)\)/g)) {
    // Fuera: llamadas anidadas (fotogramas) y comparaciones (`x === 'eat' ? …`); quedan las claves.
    const args = m[1].replace(/\([^()]*\)/g, '').replace(/[=!]==?\s*'[^']*'/g, '');
    for (const k of args.matchAll(/'([a-z][a-z0-9-]*)'/g)) used.push([f, k[1]]);
  }
}
const missing = used.filter(([, k]) => !made.has(k) && !madePatterns.some((r) => r.test(k)));
assert.equal(missing.length, 0, `texturas usadas que nadie crea:\n${missing.map(([f, k]) => `  ${f}: ${k}`).join('\n')}`);

console.log(`OK: ${keys.size} escenas · arranque en ${START_LOCATION}/${START_SPAWN} · ${STOPS.length} paradas · ${interactions} interacciones · ${new Set(used.map(([, k]) => k)).size} texturas referenciadas de ${made.size}+${madePatterns.length} creadas · guardado ida y vuelta.`);
