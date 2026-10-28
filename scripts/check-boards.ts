// Los tablones del barrio (systems/Boards): uno por mapa de calle con metro, puesto sin cortar el paso, y lo que dicen
// sale del mundo: horarios de systems/Places, eventos de systems/PopUps, el partido de systems/Match y quien actúa en la
// calle. Nada inventado, nada oculto, terminado y suspendido marcados, estado vacío claro. Sin Phaser.
// Llamado desde la cadena `check` de package.json. `node scripts/check-boards.ts`.
import assert from 'node:assert/strict';
import { POPUPS } from '../src/data/popups.ts';
import { STREET_EVENTS } from '../src/data/streetEvents.ts';
import { CHARACTERS } from '../src/data/characters.ts';
import { ARENA_CLUB } from '../src/data/cityEvents.ts';
import { getNpc } from '../src/data/npcs.ts';
import { INTERACT_RADIUS, TILE } from '../src/config/constants.ts';
import { PROPS, TILES } from '../src/world/tiles.ts';
import { allLocations } from '../src/systems/LocationSystem.ts';
import { wallBetween } from '../src/systems/Interaction.ts';
import { activePopUp } from '../src/systems/PopUps.ts';
import { matchPhase } from '../src/systems/Match.ts';
import { HEAVY_RAIN, weatherAt } from '../src/systems/Weather.ts';
import { districtAt } from '../src/systems/World.ts';
import { boardAt, sectionOf, type Board } from '../src/systems/Boards.ts';

const SAT = 6;
const SUN = 7;
const events = (b: Board) => b.sections.find((s) => s.id === 'events')!;
const entry = (b: Board, label: string) => b.sections.flatMap((s) => s.entries).find((e) => e.label === label);

// ------------------------------------------------------------ dónde están: uno por mapa con metro, sin cortar el paso

const boards = new Map<string, { tx: number; ty: number }>();
for (const loc of allLocations()) {
  if (loc.kind === 'interior') continue;
  const mine = loc.props.filter((p) => PROPS[p.kind].board);
  const metro = loc.portals.some((p) => p.to.location.endsWith('station'));
  assert.equal(mine.length, metro ? 1 : 0, `${loc.id}: ${mine.length} tablones (uno por mapa de barrio con metro, no uno por calle)`);
  if (!mine.length) continue;
  const { tx, ty } = mine[0];
  boards.set(loc.id, { tx, ty });
  const pts = loc.points ?? {};
  const busy = (x: number, y: number, withBoard = false): boolean => {
    const ch = loc.ground[y]?.[x];
    if (ch === undefined || TILES[ch]?.solid) return true;
    if ((loc.buildings ?? []).some((b) => x >= b.tx && x < b.tx + b.w && y >= b.ty && y < b.ty + b.h)) return true;
    return loc.props.some((p) => (withBoard || p !== mine[0]) && p.ty === y && x >= p.tx && x < p.tx + (PROPS[p.kind].tilesWide ?? 1));
  };
  assert.ok(',cP'.includes(loc.ground[ty][tx]), `${loc.id}: el tablón va en acera o plaza, no en la calzada`);
  assert.ok(!busy(tx, ty), `${loc.id}: el tablón pisa otra cosa`);
  for (const [a, b] of loc.links ?? []) {
    const A = pts[a];
    const B = pts[b];
    // El mismo trazado que LocationSystem.lineClear: el tablón no puede estar en ningún tile que pise el tramo.
    const steps = Math.max(1, Math.ceil(Math.hypot(B.tx - A.tx, B.ty - A.ty) * 4));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const on = Math.floor(A.tx + 0.5 + (B.tx - A.tx) * t) === tx && Math.floor(A.ty + 0.5 + (B.ty - A.ty) * t) === ty;
      assert.ok(!on, `${loc.id}: el tablón corta el camino ${a}–${b}`);
    }
  }
  assert.ok(!Object.values(pts).some((p) => p.tx === tx && p.ty === ty), `${loc.id}: el tablón está encima de un punto`);
  assert.ok(!loc.portals.some((p) => Math.abs(p.tx - tx) <= 2 && Math.abs(p.ty - ty) <= 2), `${loc.id}: el tablón tapa una puerta`);
  // Se rodea por los cuatro lados y se lee desde cualquiera: al alcance de E y sin pared en medio.
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    assert.ok(!busy(tx + dx, ty + dy, true), `${loc.id}: el tablón encajona el paso por (${tx + dx},${ty + dy})`);
    const from = { x: (tx + dx) * TILE + TILE / 2, y: (ty + dy) * TILE + TILE / 2 };
    const to = { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
    assert.ok(Math.hypot(from.x - to.x, from.y - to.y) < INTERACT_RADIUS && !wallBetween(loc, from, to), `${loc.id}: el tablón no se alcanza desde (${tx + dx},${ty + dy})`);
  }
}
assert.deepEqual([...boards.keys()].sort(), ['arena', 'cuatro-rios', 'district', 'poligono-norte', 'puerta-central', 'ribera', 'velaria'], 'los siete mapas de barrio con metro tienen tablón');
const at = (loc: string, day: number, hour: number, minute = 0): Board => boardAt(loc, boards.get(loc)!.tx, boards.get(loc)!.ty, { day, hour, minute });

// ------------------------------------------------------------ dos barrios, contenido distinto; el suyo primero

const vallesco = at('district', SAT, 12, 30);
const ribera = at('ribera', SAT, 12, 30);
assert.equal(vallesco.title, 'Tablón · Barrio Vallesco y Calle Vintage');
assert.equal(ribera.title, 'Tablón · Ribera Norte');
const names = (b: Board) => new Set(b.sections.flatMap((s) => s.entries.map((e) => e.label)));
assert.ok([...names(vallesco)].every((n) => !names(ribera).has(n)), 'dos barrios, dos tablones distintos');
assert.ok(entry(vallesco, 'Café Molinillo')!.note.startsWith('Calle Vintage.'), 'con dos barrios, cada sitio dice el suyo');
const eat = vallesco.sections.find((s) => s.id === 'eat')!.entries.map((e) => e.label);
assert.ok(eat.indexOf('Casa Tomás') < eat.indexOf('Café Molinillo'), 'el barrio del tablón va antes que el vecino');
assert.deepEqual(at('district', SAT, 12, 30), vallesco, 'el mismo tablón a la misma hora dice lo mismo');

// ------------------------------------------------------------ abierto / cerrado, con la próxima apertura de su horario

assert.deepEqual(entry(vallesco, 'Súper Rosales'), { label: 'Súper Rosales', detail: 'abierto · hasta 22:00', note: 'Barrio Vallesco. Abre de lunes a sábado de 09:00 a 22:00; domingo de 10:00 a 15:00.', state: 'open' });
assert.equal(entry(at('district', SUN, 16), 'Súper Rosales')!.detail, 'abre mañana 09:00', 'el domingo a las 16:00 ya ha cerrado; abre el lunes');
assert.equal(entry(at('district', SUN, 8), 'Súper Rosales')!.detail, 'abre hoy 10:00', 'el domingo abre más tarde');
assert.equal(entry(at('district', 1, 12), 'Sala Órbita')!.detail, 'abre jueves 21:00', 'la discoteca, el día que abre');
assert.equal(entry(at('district', 5, 3), 'Sala Órbita')!.detail, 'abierto · hasta 06:00', 'la noche del jueves sigue abierta el viernes de madrugada');
const shop = vallesco.sections.find((s) => s.id === 'shop')!.entries;
const firstClosed = shop.findIndex((e) => e.state === 'closed');
assert.ok(firstClosed === -1 || shop.slice(firstClosed).every((e) => e.state === 'closed' || shop.indexOf(e) >= firstClosed), 'lo abierto primero');
for (const district of [shop.filter((e) => e.note.startsWith('Barrio Vallesco')), shop.filter((e) => e.note.startsWith('Calle Vintage'))]) {
  const k = district.findIndex((e) => e.state === 'closed');
  assert.ok(k === -1 || district.slice(k).every((e) => e.state === 'closed'), 'en cada barrio, lo abierto primero');
}
// Ni oficinas ni bancos ni portales: sólo lo que se puede usar.
for (const hidden of ['Edificio Atalaya', 'Banco', 'Mayor 3']) assert.equal(entry(vallesco, hidden), undefined, `${hidden} no es del tablón`);
assert.equal(sectionOf(['work']), null);
assert.equal(sectionOf(['shop', 'service', 'work']), 'services');
assert.equal(sectionOf(['food', 'shop']), 'shop');
assert.equal(entry(at('puerta-central', SAT, 12), 'Comisaría de Puerta Central')!.detail, 'abierto 24 h');

// ------------------------------------------------------------ eventos: hoy, ahora, terminado, suspendido, más adelante

// El viernes 5, la inauguración de arte de la Calle Vintage (data/popups.ts art-event, 19–23).
assert.equal(entry(at('district', 1, 12), 'Inauguración de arte')!.detail, 'viernes 19:00–23:00');
assert.equal(entry(at('district', 4, 12), 'Inauguración de arte')!.detail, 'mañana 19:00–23:00');
assert.equal(entry(at('district', 5, 12), 'Inauguración de arte')!.state, 'today');
assert.equal(activePopUp('district', { day: 5, hour: 19, minute: 30 })?.id, 'art-event', 'la fuente dice que está en marcha');
assert.equal(entry(at('district', 5, 19, 30), 'Inauguración de arte')!.detail, 'ahora · hasta 23:00');
assert.equal(entry(at('district', 5, 23, 10), 'Inauguración de arte')!.state, 'ended', 'terminado: se marca, no se ofrece');
assert.equal(entry(at('district', 6, 12), 'Inauguración de arte'), undefined, 'al día siguiente ya no está');
// El día 62 llueve fuerte a las 11 en la Calle Vintage: el mercadillo no se monta.
assert.ok(weatherAt(62, 11).rain > HEAVY_RAIN && !activePopUp('district', { day: 62, hour: 11, minute: 0 }));
assert.equal(entry(at('district', 62, 11), 'Mercadillo vintage')!.detail, 'suspendido por la lluvia');
// El partido: anunciado, en juego, terminado (systems/Match).
assert.equal(matchPhase({ day: SAT, hour: 19, minute: 0 }), 'live');
const rival = entry(at('arena', SAT, 12), `${ARENA_CLUB.short} – Racing Vereda`)!;
assert.equal(rival.detail, 'hoy 18:30');
assert.equal(entry(at('arena', SAT, 19), rival.label)!.detail, 'en juego');
// El mismo rival vuelve el miércoles: dos partidos, cada uno con su estado (el terminado, al final).
const after = events(at('arena', SAT, 21, 30)).entries.filter((e) => e.label === rival.label);
assert.deepEqual(after.map((e) => e.detail), ['miércoles 21:00', 'terminado']);
assert.equal(entry(at('ribera', SAT, 19), rival.label), undefined, 'el partido es del tablón del Arena');

// Un barrio sin eventos: lo dice, y los locales siguen ahí.
const quiet = events(ribera);
assert.equal(quiet.entries.length, 0);
assert.match(quiet.empty!, /No hay eventos anunciados en Ribera Norte esta semana/);
assert.ok(ribera.sections.some((s) => s.id === 'eat' && s.entries.length), 'sin eventos, el directorio sigue');
assert.match(ribera.intro, /Sin eventos esta semana/);

// ------------------------------------------------------------ fidelidad: noventa días, cada hora, contra la fuente

const secret = new Set([...STREET_EVENTS.map((e) => e.name), ...CHARACTERS.map((c) => getNpc(c.npc).name)]);
for (let day = 1; day <= 90; day++) {
  for (let hour = 0; hour < 24; hour++) {
    const c = { day, hour, minute: 0 };
    for (const loc of boards.keys()) {
      const b = at(loc, day, hour);
      const list = events(b).entries;
      for (const e of b.sections.flatMap((s) => s.entries)) assert.ok(!secret.has(e.label), `${loc} ${day} ${hour}: ${e.label} no se anuncia`);
      // En marcha según el tablón ⇔ en marcha según PopUps.
      const live = activePopUp(loc, c);
      const shown = list.filter((e) => e.state === 'active' && POPUPS.some((p) => p.name === e.label));
      assert.deepEqual(shown.map((e) => e.label), live ? [live.name] : [], `${loc} día ${day} ${hour}:00: evento en marcha`);
      // Lo terminado o suspendido, al final; nada se ofrece después.
      const last = list.findIndex((e) => e.state === 'ended' || e.state === 'cancelled');
      assert.ok(last === -1 || list.slice(last).every((e) => e.state === 'ended' || e.state === 'cancelled'), `${loc} ${day} ${hour}: lo terminado, al final`);
      if (loc === 'arena') assert.equal(list.some((e) => e.detail === 'en juego'), matchPhase(c) === 'live', `arena ${day} ${hour}: en juego`);
      for (const e of list) {
        const def = POPUPS.find((p) => p.name === e.label);
        if (def) assert.equal(def.location, loc, `${e.label} es de ${def.location}`);
      }
    }
  }
}

// El barrio de cada cosa sale del mundo, no del texto: la Calle Vintage es la zona de su mercadillo.
assert.equal(districtAt('district', POPUPS[0].props[0].tx, POPUPS[0].props[0].ty), 'vintage');

console.log(`Tablones: ${boards.size} (uno por barrio con metro, sin cortar el paso); horarios, eventos, partido y estados contra la fuente OK`);
