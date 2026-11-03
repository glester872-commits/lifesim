// Academias (data/academies + systems/Academy + systems/Fitness): datos completos y coherentes con su local, cobro una
// vez por clase (suelta o con bono), sin dinero no se entra, la técnica sube despacio y con límite diario, y los
// guardados (también los de antes de las academias) cargan bien. Llamado desde la cadena `check`. `node scripts/check-academies.ts`.
import assert from 'node:assert/strict';
import { ACADEMIES, type AcademyDef } from '../src/data/academies.ts';
import { BOXING_PROFILE } from '../src/data/boxing.ts';
import { SERVICE_OFFERS } from '../src/data/services.ts';
import { STATIONS } from '../src/data/stations.ts';
import { buyPass, charge, classSlot, NO_MEMBERSHIP, parseMembership } from '../src/systems/Academy.ts';
import { parseFitness, quote, START_FITNESS, summary, train, type Fitness } from '../src/systems/Fitness.ts';
import { getLocation, isWalkable, validate } from '../src/systems/LocationSystem.ts';
import { ACADEMY_PROFILES } from '../src/data/academyRooms.ts';
import { CHARACTERS } from '../src/data/characters.ts';
import { PLACES } from '../src/data/places.ts';
import { whereaboutsIn } from '../src/systems/Characters.ts';
import { Crowd } from '../src/systems/Crowd.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { tilePath, worldRoute } from '../src/systems/Navigation.ts';
import { placeInfo } from '../src/systems/Places.ts';
import { mapPositionOf } from '../src/systems/WorldMap.ts';
import { createInitialState, restore, SaveSystem } from '../src/systems/SaveSystem.ts';

const DAY = 1440;
const at = (day: number, h: number, m: number): number => (day - 1) * DAY + h * 60 + m;

// ----------------------------------------------- 1. datos: cada academia tiene local, puestos, quien la da y cupo
const academies = Object.values(ACADEMIES) as AcademyDef[];
assert.ok(academies.length >= 1, 'no hay ninguna academia');
for (const a of academies) {
  const loc = getLocation(a.location);
  const stations = Object.entries(STATIONS).filter(([, s]) => s.training?.academy === a.id).map(([id]) => id);
  assert.ok(stations.length > 0, `${a.id}: sin puestos de clase`);
  const points = Object.values(loc.points ?? {}).filter((p) => p.use && stations.includes(p.use));
  assert.ok(points.length > 0, `${a.id}: su local no tiene ningún puesto de clase`);
  const offer = Object.values(SERVICE_OFFERS).find((o) => o.kind === 'training' && o.academy === a.id);
  assert.ok(offer, `${a.id}: nadie da las clases`);
  assert.ok(a.pass.price < a.pass.classes * a.fee, `${a.id}: el bono no sale más barato que las sueltas`);
  assert.ok(a.capacity >= 2 && a.capacity <= points.length, `${a.id}: cupo ${a.capacity} para ${points.length} puestos`);
  assert.ok(a.grace < a.every && a.hours[0] < a.hours[1], `${a.id}: horario imposible`);
}
assert.ok(BOXING_PROFILE.maxVisitors < ACADEMIES.boxing!.capacity, 'la gente llena el club sin dejar sitio al jugador');

// ----------------------------------------------- 2. horario: sólo se entra al empezar cada clase
const box = ACADEMIES.boxing!;
assert.equal(classSlot(box, at(3, 18, 0)), at(3, 18, 0));
assert.equal(classSlot(box, at(3, 18, 4)), at(3, 18, 0), 'dentro del margen no se entra en la clase que toca');
assert.equal(classSlot(box, at(3, 18, 5)), null, 'se entra pasado el margen');
assert.equal(classSlot(box, at(3, 7, 59)), null, 'se entra antes de abrir');
assert.equal(classSlot(box, at(3, 22, 0)), null, 'se entra al cerrar');

// ----------------------------------------------- 3. cobro: una vez por clase, con la misma cartera
const t = at(3, 18, 1);
const first = charge(box, NO_MEMBERSHIP, 20, t);
assert.ok(first.ok && first.via === 'fee' && first.money === 20 - box.fee, 'la primera clase no se cobra bien');
// La misma clase otra vez (cortar y retomar, salir y entrar, recargar): no se cobra de nuevo.
const again = charge(box, first.membership, first.money, at(3, 18, 3));
assert.ok(again.ok && again.via === 'paid' && again.money === first.money, 'la misma clase se cobra dos veces');
// La siguiente clase, sí.
const next = charge(box, first.membership, first.money, at(3, 18, 30));
assert.ok(next.ok && next.via === 'fee' && next.money === first.money - box.fee, 'la clase siguiente no se cobra');
// Sin dinero ni bono, no se entra; y no cambia nada.
const broke = charge(box, NO_MEMBERSHIP, box.fee - 0.01, t);
assert.ok(!broke.ok && /no te llega/.test(broke.message), 'sin dinero se entra en clase');
assert.ok(!charge(box, NO_MEMBERSHIP, 100, at(3, 18, 10)).ok, 'se cobra fuera de la hora de empezar');
// El reloj de la escena lleva decimales: la misma clase a 18:00,3 y a 18:02,7 (y tras guardar, redondeada) es la misma.
const frac = charge(box, NO_MEMBERSHIP, 20, at(3, 18, 0) + 0.3);
assert.ok(frac.ok && Number.isInteger(frac.membership.paid), 'la clase pagada se guarda con decimales');
const frac2 = charge(box, parseMembership(JSON.parse(JSON.stringify(frac.ok ? frac.membership : {}))), 14, at(3, 18, 2) + 0.7);
assert.ok(frac2.ok && frac2.via === 'paid', 'con el reloj en decimales, la misma clase se cobra dos veces');

// ----------------------------------------------- 4. bono: más barato, se gasta una por clase y sin dinero no se compra
assert.ok(!buyPass(box, NO_MEMBERSHIP, box.pass.price - 1).ok, 'se compra el bono sin dinero');
const bought = buyPass(box, NO_MEMBERSHIP, 100);
assert.ok(bought.ok && bought.money === 100 - box.pass.price && bought.membership.pass === box.pass.classes);
let m = bought.ok ? bought.membership : NO_MEMBERSHIP;
const money = bought.ok ? bought.money : 0;
for (let k = 0; k < box.pass.classes; k++) {
  const c = charge(box, m, money, at(4, 9, 30 * k));
  assert.ok(c.ok && c.via === 'pass' && c.money === money, `la clase ${k + 1} del bono cobra dinero`);
  if (c.ok) m = c.membership;
}
assert.equal(m.pass, 0, 'el bono no se gasta');
const after = charge(box, m, money, at(5, 9, 0));
assert.ok(after.ok && after.via === 'fee', 'acabado el bono, la clase no se paga suelta');
// La cotización del menú sabe que una clase con bono o ya pagada no cuesta.
const f0: Fitness = { ...START_FITNESS, academies: { boxing: { pass: 3, paid: -1 } } };
const q = quote(f0, 'boxing-bag', 'normal', 100, { money: 0, hour: 18, minute: 0, at: at(3, 18, 0) });
assert.equal(q.fee, 0);
assert.equal(q.blocked, null, 'con bono y sin dinero no deja entrar');
assert.ok(quote(START_FITNESS, 'boxing-bag', 'normal', 100, { money: 0, hour: 18, minute: 0, at: at(3, 18, 0) }).blocked, 'sin bono ni dinero deja entrar');

// ----------------------------------------------- 5. progreso: sube despacio, menos cuanto más se repite el mismo día
let f: Fitness = { ...START_FITNESS };
const gains: number[] = [];
for (let k = 0; k < 6; k++) {
  const before = f.skills?.boxing ?? 0;
  f = train(f, 'boxing-bag', 'normal', 1, at(6, 9 + k, 0), 6, 100).next;
  gains.push((f.skills?.boxing ?? 0) - before);
}
assert.ok(gains[0] > 0 && gains[0] < 2, `una clase da demasiada técnica (${gains[0]})`);
assert.ok(gains[5] < gains[0] / 3, `repetir el mismo día no rinde menos (${gains.map((g) => g.toFixed(2)).join(', ')})`);
assert.ok((f.skills?.boxing ?? 0) < 5, 'un día de clases convierte a nadie en experto');
assert.match(summary(f), /Técnica de boxeo/, 'el resumen no muestra la técnica');
// Entrenar fuera de la academia no toca la técnica, y no se pierde lo que había.
const gym = train(f, 'treadmill', 'normal', 1, at(7, 9, 0), 7, 100).next;
assert.equal(gym.skills?.boxing, f.skills?.boxing, 'la cinta cambia la técnica de boxeo');

// ----------------------------------------------- 6. guardado: ficha y técnica, también desde un guardado de antes
const memory = new Map<string, string>();
const saves = new SaveSystem({ read: (k) => memory.get(k) ?? null, write: (k, v) => void memory.set(k, v), remove: (k) => void memory.delete(k) });
const withPass: Fitness = { ...f, academies: { boxing: { pass: 7, paid: at(3, 18, 0) } } };
assert.ok(saves.save({ ...createInitialState(), money: 33, fitness: withPass }));
let loaded = restore(saves.load());
for (let k = 0; k < 3; k++) {
  assert.deepEqual(loaded.fitness!.academies, withPass.academies, 'el bono o la clase pagada cambian al guardar');
  assert.equal(loaded.fitness!.skills!.boxing, f.skills!.boxing);
  assert.equal(loaded.money, 33);
  assert.ok(saves.save(loaded));
  loaded = restore(saves.load());
}
// QA-08 · la reserva vale mientras dure la clase: pagada a las 18:00, a las 18:12 (pasado el margen) se vuelve sin pagar y
// sin esperar; a las 18:30 empieza otra y se cobra. Igual para todas las academias (boxeo y taekwondo incluidos).
for (const id of ['boxing', 'taekwondo'] as const) {
  const ac = ACADEMIES[id]!;
  const paid = charge(ac, NO_MEMBERSHIP, 30, at(3, 18, 1));
  assert.ok(paid.ok && paid.via === 'fee');
  const later = charge(ac, paid.ok ? paid.membership : NO_MEMBERSHIP, 24, at(3, 18, 12));
  assert.ok(later.ok && later.via === 'paid' && later.money === 24, `${id}: a mitad de la clase pagada no se puede volver sin pagar`);
  const station = id === 'boxing' ? 'boxing-bag' : 'tkd-kicks-round';
  const held: Fitness = { ...START_FITNESS, academies: { [id]: paid.ok ? paid.membership : NO_MEMBERSHIP } };
  const qh = quote(held, station, 'normal', 100, { money: 0, hour: 18, minute: 12, at: at(3, 18, 12) });
  assert.ok(qh.blocked === null && qh.wait === 0 && qh.fee === 0, `${id}: el menú hace esperar o cobrar una clase ya pagada (${qh.blocked})`);
  assert.ok(quote(held, station, 'normal', 0, { money: 0, hour: 18, minute: 12, at: at(3, 18, 12) }).blocked, `${id}: con la clase pagada se entrena sin energía`);
  const next = charge(ac, paid.ok ? paid.membership : NO_MEMBERSHIP, 24, at(3, 18, 31));
  assert.ok(next.ok && next.via === 'fee', `${id}: la clase siguiente sale gratis con la reserva de la anterior`);
  assert.ok(quote(held, station, 'normal', 100, { money: 30, hour: 18, minute: 33, at: at(3, 18, 33) }).fee > 0, `${id}: el menú no cobra la clase siguiente`);
}
// Recargar a mitad de la clase pagada: entrar de nuevo en ella no cobra.
const reentry = charge(box, loaded.fitness!.academies!.boxing, loaded.money, at(3, 18, 2));
assert.ok(reentry.ok && reentry.via === 'paid', 'tras recargar se cobra otra vez la misma clase');
// Un guardado de antes de las academias: `boxing` suelto pasa a skills.boxing; sin ficha, sin bono.
const old = parseFitness({ fitness: 20, strength: 12, stamina: 16, fatigue: 0, at: 0, day: 0, sessions: 0, total: 3, boxing: 4.5 });
assert.equal(old.skills?.boxing, 4.5, 'la técnica de un guardado antiguo se pierde');
assert.equal(old.academies, undefined);
assert.equal(parseFitness({ ...START_FITNESS, skills: { boxing: 9, ninja: 50 } }).skills?.ninja, undefined, 'carga técnica de una academia que no existe');
assert.deepEqual(parseMembership({ pass: -4, paid: 'x' }), { pass: 0, paid: -1 }, 'una ficha mal formada rompe la carga');
assert.deepEqual(parseFitness(START_FITNESS), START_FITNESS, 'un guardado sin academias cambia de forma');

// ----------------------------------------------- 7. salas: se entra desde su gimnasio, en su barrio, y se llega a cada puesto
const DISTRICT: Record<string, string> = { boxing: 'cuatro-rios', mma: 'arena', taekwondo: 'district', dance: 'ribera' };
for (const a of academies) {
  const loc = getLocation(a.location);
  validate(loc);
  // Se sale a su gimnasio (un anexo) o a la calle (local propio); por ahí mismo se entra.
  const back = loc.portals.find((p) => p.id === 'exit')!;
  const outer = getLocation(back.to.location);
  assert.ok(outer.portals.some((p) => p.to.location === loc.id) || outer.buildings?.some((b) => b.enter?.location === loc.id), `${a.id}: no se entra desde ${outer.id}`);
  assert.ok(outer.spawns[back.to.spawn], `${a.id}: al salir no hay dónde aparecer en ${outer.id}`);
  assert.equal(mapPositionOf(loc.id, { x: 0, y: 0 })?.mapId, DISTRICT[a.id], `${a.id}: no está en su barrio`);
  assert.ok(PLACES.some((p) => p.id === loc.id && p.interior === loc.id), `${a.id}: no consta como lugar`);
  for (const [id, p] of Object.entries(loc.points ?? {})) {
    if (!p.use) continue;
    const path = tilePath(loc, loc.spawns.entry, p);
    assert.ok(path && path.every((t) => isWalkable(loc, t.tx, t.ty)), `${a.id}: sin camino libre a ${id}`);
  }
}

// ----------------------------------------------- 8. gente: dentro del cupo, sin caras repetidas, usando los puestos y con caras fijas
for (const profile of ACADEMY_PROFILES) {
  const loc = getLocation(profile.place);
  const faces: Set<number>[] = [];
  let uses = 0;
  for (const day of [2, 3, 9]) {
    const crowd = new Crowd(loc, placeInfo(profile.place)!, profile, seededRng(day * 31));
    let t = 18 * 60;
    const clock = () => ({ day, hour: Math.floor(t / 60), minute: Math.floor(t % 60) });
    crowd.populate(clock(), loc.spawns.entry);
    const seen = new Set<number>();
    for (let step = 0; step < 1200; step++) {
      crowd.update(100, clock(), loc.spawns.entry);
      t += 0.2;
      const visitors = crowd.agents.filter((x) => x.kind === 'visitor');
      assert.ok(visitors.length <= profile.maxVisitors, `${profile.place}: ${visitors.length} alumnos con cupo ${profile.maxVisitors}`);
      const looks = crowd.agents.map((x) => x.look);
      assert.equal(new Set(looks).size, looks.length, `${profile.place}: una cara repetida`);
      for (const x of visitors) {
        seen.add(x.look);
        assert.ok(isWalkable(loc, Math.round(x.x), Math.round(x.y)), `${profile.place}: alguien atraviesa un saco o una pared`);
        if (!x.moving && x.point && loc.points?.[x.point]?.use && STATIONS[loc.points[x.point].use as keyof typeof STATIONS]?.training) uses++;
      }
    }
    faces.push(seen);
  }
  assert.ok(uses > 0, `${profile.place}: nadie entrena en los puestos de clase`);
  const regulars = new Set(new Crowd(loc, placeInfo(profile.place)!, profile, seededRng(1)).regularLooks());
  const repeat = [...faces[0]].filter((l) => faces[1].has(l) && regulars.has(l)).length;
  assert.ok(repeat >= 2, `${profile.place}: de un día a otro no repite casi nadie (${repeat})`);
}

// ----------------------------------------------- 9. traslado del MMA al Arena: local propio con puerta a la calle, sin anexo en Forja
{
  const arena = getLocation('arena');
  const door = arena.buildings?.find((b) => b.id === 'ar-mma');
  assert.ok(door?.enter?.location === 'academy-mma' && door.style === 'mma-gym', 'MMA: sin fachada ni puerta propia en Arena');
  const homes = new Set(PLACES.filter((p) => p.type === 'residence').map((p) => p.building));
  assert.ok(!homes.has('ar-mma'), 'MMA: ocupa una vivienda');
  const gym = getLocation('gym');
  assert.ok(!gym.portals.some((p) => p.to.location === 'academy-mma') && !gym.spawns.mma && !gym.points?.GYM_MMA_DOOR, 'Forja conserva la puerta vieja de MMA');
  for (const loc of ['gym', 'district', 'arena']) for (const p of getLocation(loc).portals) assert.ok(getLocation(p.to.location).spawns[p.to.spawn], `${loc}: portal huérfano ${p.id}`);
  // De la boca de metro a la puerta de la academia y de la puerta a cada puesto: camino real por la calle.
  const legs = worldRoute('AR_METRO_ENTRANCE', 'MMA_BAG_01');
  assert.ok(legs && legs[0].location === 'arena' && legs.at(-1)!.location === 'academy-mma', 'MMA: no se llega andando desde el metro de Arena');
  for (const c of CHARACTERS) for (const r of c.routines) for (const st of r.stops) assert.ok(!st.point.startsWith('MMA_'), `${c.npc}: va a MMA_ desde otro barrio`);
}

// ----------------------------------------------- 9b. traslado del baile a Ribera Norte: local propio, sin anexo en Velaria Club
{
  const ribera = getLocation('ribera');
  const door = ribera.buildings?.find((b) => b.id === 'ribera-dance');
  assert.ok(door?.enter?.location === 'academy-dance' && door.style === 'dance-school', 'Baile: sin fachada ni puerta propia en Ribera');
  const homes = new Set(PLACES.filter((p) => p.type === 'residence').map((p) => p.building));
  assert.ok(!homes.has('ribera-dance'), 'Baile: ocupa una vivienda');
  const vl = getLocation('vl-gym');
  assert.ok(!vl.portals.some((p) => p.id === 'dance' || p.to.location === 'academy-dance') && !vl.spawns.dance && !vl.points?.VLGYM_ACADEMY_DOOR, 'Velaria Club conserva la puerta vieja del baile');
  for (const loc of ['ribera', 'vl-gym']) for (const p of getLocation(loc).portals) assert.ok(getLocation(p.to.location).spawns[p.to.spawn], `${loc}: portal huérfano ${p.id}`);
  const legs = worldRoute('RB_METRO_FRONT', 'DANCE_STEP_01');
  assert.ok(legs && legs[0].location === 'ribera' && legs.at(-1)!.location === 'academy-dance', 'Baile: no se llega andando desde el metro de Ribera');
  assert.ok(ACADEMIES.dance!.id === 'dance' && ACADEMIES.dance!.location === 'academy-dance', 'Baile: cambia su id o su sala (rompe guardados)');
}

// ----------------------------------------------- 10. Ada y Sara: las tardes de MMA de Forja pasan al gimnasio (no cruzan de barrio)
for (const [npc, routineId, location] of [['ada', 'forja-mma', 'gym'], ['sara', 'forja-mma-sara', 'gym']] as const) {
  const def = CHARACTERS.find((c) => c.npc === npc)!;
  const routine = def.routines.find((r) => r.id === routineId)!;
  const classStop = routine.stops.find((st) => getLocation(location).points?.[st.point])!;
  const prev = routine.stops[routine.stops.indexOf(classStop) - 1];
  const legs = worldRoute(prev.point, classStop.point);
  assert.ok(legs && legs.at(-1)!.location === location, `${npc}: no llega a ${location}`);
  const [h, m] = classStop.at.split(':').map(Number);
  const w = whereaboutsIn(def, routine, h * 60 + m + 20);
  assert.equal(w.stop.point, classStop.point, `${npc}: a la hora de clase no está en su puesto`);
  assert.equal(w.location, location);
}

console.log(`Academias OK: ${academies.length} (${academies.map((a) => a.name).join(', ')}) · una vez por clase, bono de ${box.pass.classes} por €${box.pass.price}, sin dinero no se entra, técnica +${gains[0].toFixed(2)} la primera clase y +${gains[5].toFixed(2)} la sexta del día, guardado y guardado antiguo`);
