// La vista de la concentración vecinal (world/ProtestView.ts), sin Phaser: rutas y sitios pisables, looks distintos,
// presupuesto por minuto y pancartas que caben (o su versión corta). `node scripts/check-protest-view.ts`.
import assert from 'node:assert/strict';
import { PROTESTS } from '../src/data/protests.ts';
import { PASSENGER_LOOKS } from '../src/data/npcs.ts';
import { getLocation, isWalkable } from '../src/systems/LocationSystem.ts';
import { bannerLines, bannerText, lookOrder, MAX_POLICE, planDay, protestRoute, type ProtestMember } from '../src/systems/Protest.ts';
import type { LocationDef } from '../src/types/game.ts';

const DAYS = 60;
// La misma lista que scripts/check-protest.ts.
const BANNED = /\b(pp|psoe|vox|podemos|sumar|ciudadanos|erc|junts|bildu|pnv|bng|cup|partido|vota|votad|votar|elecciones|candidat\w*|izquierda|derecha|fascis\w*|comunis\w*|socialis\w*|gobierno|dimisi[oó]n|presidente|alcalde\w*|ministr\w*)\b/i;

/** (a) Sitio, entrada, salida y cada tile de las dos rutas: pisables. */
function validate(loc: LocationDef, members: readonly ProtestMember[], tag: string): void {
  for (const m of members) {
    for (const [what, p] of [['slot', m.slot], ['entry', m.entry], ['exit', m.exit]] as const) {
      assert.ok(isWalkable(loc, p.tx, p.ty), `${tag} #${m.id}: ${what} ${p.tx},${p.ty} no se pisa`);
    }
    for (const leg of ['in', 'out'] as const) {
      const r = protestRoute(loc, m, leg);
      assert.ok(r && r.length > 0, `${tag} #${m.id}: sin ruta ${leg}`);
      for (const p of r) assert.ok(isWalkable(loc, p.tx, p.ty), `${tag} #${m.id}: ruta ${leg} pisa ${p.tx},${p.ty}`);
    }
  }
}

const ids = PASSENGER_LOOKS.map((l) => l.id);

for (const def of PROTESTS) {
  const loc = getLocation(def.location);

  // Pancartas: cada lema (o su versión corta) cabe en dos líneas de 16, y las cortas tampoco llevan términos vetados.
  for (const b of def.banners) {
    const lines = bannerText(def, b);
    assert.ok(lines.length <= 2 && lines.every((l) => l.length <= 16), `${def.id}: «${b}» no cabe en la pancarta (${lines.join(' / ')})`);
  }
  for (const [b, short] of Object.entries(def.bannerShort)) {
    assert.ok(def.banners.includes(b), `${def.id}: versión corta de un lema que no existe: «${b}»`);
    assert.ok(!BANNED.test(short), `${def.id}: versión corta con término vetado: «${short}»`);
  }
  assert.ok(bannerLines('Vivienda asequible para quien vive aquí').length > 2, 'control: el reparto en líneas no parte nada');

  // Pancartas que no se pisan: cada puesto de pancarta es un puesto real, y dos pancartas en filas a menos de 3 tiles
  // deben estar a 3 o más columnas (la pancarta mide 44 px, casi tres tiles, y se dibuja sobre la cabeza).
  type Tile = { tx: number; ty: number };
  const clash = (a: Tile, b: Tile): boolean => Math.abs(a.ty - b.ty) < 3 && Math.abs(a.tx - b.tx) < 3;
  const clashes = (spots: readonly Tile[]): boolean => spots.some((a, i) => spots.slice(i + 1).some((b) => clash(a, b)));
  for (const s of def.bannerSlots) assert.ok(def.slots.some((q) => q.tx === s.tx && q.ty === s.ty), `${def.id}: pancarta en (${s.tx},${s.ty}) fuera de slots`);
  assert.ok(!clashes(def.bannerSlots), `${def.id}: dos pancartas se solapan`);
  assert.ok(clashes([{ tx: 16, ty: 21 }, { tx: 17, ty: 22 }]), 'control: el detector de solapes no detecta nada');

  // Un corte de calzada siempre con un agente al lado: el primer puesto de policía (con police[0] ≥ 1 siempre se
  // ocupa) está en la acera, pisable y pegado al tramo cortado.
  if (def.closure) {
    const c = def.closure;
    const p0 = def.policeSlots[0];
    const near = (p: Tile): boolean => p.tx >= c.tx - 1 && p.tx <= c.tx + c.w && (p.ty === c.ty - 1 || p.ty === c.ty + c.h);
    assert.ok(def.police[0] >= 1 && isWalkable(loc, p0.tx, p0.ty) && near(p0), `${def.id}: el corte de calzada no tiene agente al lado`);
    assert.ok(!near({ tx: c.tx + c.w + 5, ty: c.ty + c.h }), 'control: el detector de «al lado del corte» acepta cualquier sitio');
  }

  for (let d = 1; d <= DAYS; d++) {
    const p = planDay(def, loc, d, d * 1440 + def.window[0] * 60 + ((d * 7) % 60));
    assert.ok(p.happens, `${def.id}: día ${d} forzado y no pasa`);
    validate(loc, p.members, `${def.id} día ${d}`);

    // (b) looks distintos entre los manifestantes, nunca el uniforme de policía.
    const order = lookOrder(def.id, p.day, ids);
    const looks = p.members.filter((m) => m.role === 'manifestante').map((m) => order[(m.id - 1) % order.length]);
    assert.equal(new Set(looks).size, looks.length, `${def.id}: día ${d}, looks repetidos`);
    assert.ok(looks.every((l) => ids[l] !== 'uniforme-policia'), `${def.id}: día ${d}, manifestante de uniforme`);

    // (c) presupuesto en cada minuto.
    for (let t = p.start; t < p.end; t++) {
      const here = p.members.filter((m) => t >= m.arrive && t < m.leave);
      assert.ok(here.filter((m) => m.role === 'policia').length <= MAX_POLICE, `${def.id}: día ${d}, minuto ${t}, más de ${MAX_POLICE} policías`);
      assert.ok(here.filter((m) => m.role === 'manifestante').length <= def.crowd[1], `${def.id}: día ${d}, minuto ${t}, demasiados manifestantes`);
    }
  }

  // (d) control positivo: un sitio en un tile sólido tiene que hacer fallar la validación.
  const solid = loc.ground.flatMap((row, ty) => [...row].map((_, tx) => ({ tx, ty }))).find((q) => !isWalkable(loc, q.tx, q.ty));
  assert.ok(solid, `${def.id}: control sin tile sólido`);
  const sample = planDay(def, loc, 1, 1440 + def.window[0] * 60).members[0];
  assert.throws(() => validate(loc, [{ ...sample, slot: solid }], 'control'), 'control: un sitio sólido no falla');
  console.log(`${def.id}: ${DAYS} días forzados, rutas pisables, looks distintos y presupuesto por minuto`);
}

console.log('check-protest-view: ok');
