// Ciclo de vida de los sucesos del mundo (systems/WorldEvents.ts) con los mismos StreetEvent, AlleyDeal,
// Pickpocket y SecurityAI del juego: `npm run check`. Cada tipo se fuerza, corre, se resuelve, se recoge,
// se comprueba el enfriamiento, se reinicia y se vuelve a forzar. Falla si algo queda activo, duplicado,
// con papeles temporales o con quien acude sin soltar.
import assert from 'node:assert/strict';
import { METRO_CONFIG } from '../src/config/metro.ts';
import { STREET_EVENTS } from '../src/data/streetEvents.ts';
import { ALLEY_SPOTS } from '../src/data/alleyDeals.ts';
import { getLocation } from '../src/systems/LocationSystem.ts';
import { StreetEvent } from '../src/systems/StreetEvents.ts';
import { AlleyDeal, COOLDOWN } from '../src/systems/AlleyDeals.ts';
import { Pickpocket, type PickpocketHost } from '../src/systems/Pickpocket.ts';
import { SecurityAI } from '../src/systems/SecurityAI.ts';
import type { EventInfo, Lifecycle } from '../src/systems/WorldEvents.ts';
import type { Facing, Vec2 } from '../src/types/game.ts';
import type { PassengerAI, StationLayout } from '../src/systems/PassengerAI.ts';
import type { Walker } from '../src/entities/Walker.ts';
import type { TrainSystem } from '../src/systems/TrainSystem.ts';

const ORDER: Lifecycle[] = ['ELIGIBLE', 'SPAWNING', 'ACTIVE', 'RESOLUTION', 'CLEANUP', 'COOLDOWN'];
const uniqueIds = (e: EventInfo): void => assert.equal(new Set(e.participants.map((p) => p.id)).size, e.participants.length, `${e.id}: participante repetido`);
/** El ciclo sólo avanza (ELIGIBLE → … → COOLDOWN), nunca hacia atrás dentro del mismo suceso. */
function forward(seen: Lifecycle[], id: string): void {
  const idx = seen.map((l) => ORDER.indexOf(l));
  for (let i = 1; i < idx.length; i++) assert.ok(idx[i] >= idx[i - 1], `${id}: el ciclo va hacia atrás (${seen.join(' → ')})`);
}
const dedupe = (xs: Lifecycle[]): Lifecycle[] => xs.filter((x, i) => i === 0 || xs[i - 1] !== x);

// ------------------------------------------------------------------- peleas de patio

for (const def of STREET_EVENTS) {
  const ev = new StreetEvent(def, getLocation(def.location));
  ev.devReset();
  // Una noche del calendario que sí pasa: así se ve también que la forzada no deja que se repita esa noche.
  let day = 10;
  while (!ev.night(day).happens) day++;
  const night = ev.night(day);
  const t0 = night.start - 180;
  assert.equal(ev.lifecycle(t0).lifecycle, 'ELIGIBLE', `${def.id}: antes de nada no está ELIGIBLE`);

  // a) Natural de principio a fin: acotada, sin gente al acabar, y en enfriamiento hasta el día siguiente.
  const natural: Lifecycle[] = [];
  let t = night.start - 1;
  for (; t < night.start + 12 * 60; t += 0.25) {
    const e = ev.lifecycle(t);
    uniqueIds(e);
    natural.push(e.lifecycle);
    if (e.lifecycle === 'COOLDOWN') break;
  }
  const naturalPath = dedupe(natural);
  forward(naturalPath, def.id);
  assert.deepEqual(naturalPath.slice(0, 3), ['ELIGIBLE', 'SPAWNING', 'ACTIVE'], `${def.id}: natural ${naturalPath.join(' → ')}`);
  assert.equal(naturalPath.at(-1), 'COOLDOWN', `${def.id}: la natural no acaba (${naturalPath.join(' → ')})`);
  assert.equal(ev.presentAt(t).length, 0, `${def.id}: queda gente tras la pelea`);
  assert.ok(t - night.start < 10 * 60, `${def.id}: dura ${t - night.start} min`);

  // b) Forzada esa misma tarde → resuelta a mano → recogida → la de esa noche ya no pasa (una por patio y noche).
  ev.devReset();
  ev.devForce(t0);
  const forced: Lifecycle[] = [];
  let resolvedAt = -1;
  for (t = t0; t < t0 + 6 * 60; t += 0.25) {
    const e = ev.lifecycle(t);
    uniqueIds(e);
    forced.push(e.lifecycle);
    if (e.lifecycle === 'ACTIVE' && resolvedAt < 0) {
      assert.equal(ev.devResolve(t), 'el vigía avisa: el corro se deshace');
      resolvedAt = t;
    }
    if (resolvedAt >= 0 && e.lifecycle === 'COOLDOWN') break;
  }
  const forcedPath = dedupe(forced);
  forward(forcedPath, def.id);
  assert.ok(forcedPath.includes('RESOLUTION') && forcedPath.includes('CLEANUP') && forcedPath.at(-1) === 'COOLDOWN', `${def.id}: forzada ${forcedPath.join(' → ')}`);
  assert.equal(ev.presentAt(t).length, 0, `${def.id}: queda gente tras resolver`);
  for (let s = t; s < night.start + 8 * 60; s += 5) {
    assert.equal(ev.presentAt(s).length, 0, `${def.id}: la noche del calendario aparece tras una forzada (duplicado) a los ${s - t0} min`);
    assert.equal(ev.lifecycle(s).lifecycle, 'COOLDOWN', `${def.id}: sin enfriamiento tras resolver`);
  }

  // c) Cancelar (retirar) quita a todos ya; reiniciar devuelve el calendario: puede volver a pasar.
  ev.devForce(t0);
  assert.ok(ev.presentAt(t0 + 5).length > 0, `${def.id}: forzada sin gente`);
  ev.devCancel(t0 + 5);
  assert.equal(ev.presentAt(t0 + 5).length, 0, `${def.id}: cancelada y con gente`);
  ev.devReset();
  assert.equal(ev.lifecycle(t0).lifecycle, 'ELIGIBLE', `${def.id}: tras reiniciar no vuelve a ELIGIBLE`);
  assert.ok(ev.presentAt(night.fightAt).length > 0, `${def.id}: tras reiniciar no vuelve a pasar`);
  ev.devForce(t0);
  assert.equal(ev.lifecycle(t0 + 2).lifecycle, 'SPAWNING', `${def.id}: no se puede volver a forzar`);
  ev.devReset();
  console.log(`pelea ${def.id}: natural ${naturalPath.join('→')} · forzada ${forcedPath.join('→')} · cancelar, reiniciar y repetir OK`);
}

// ------------------------------------------------------------- trapicheo en callejones

for (const spot of ALLEY_SPOTS) {
  const deal = new AlleyDeal(spot, getLocation(spot.location));
  deal.devReset();
  const t0 = 30 * 1440 + 13 * 60;
  assert.equal(deal.lifecycle(t0).lifecycle, 'ELIGIBLE', `${spot.id}: no está ELIGIBLE`);

  // a) Forzado → activo → resuelto (alguien de uniforme) → recogida → enfriamiento COOLDOWN minutos.
  deal.devForce(t0);
  const seen: Lifecycle[] = [];
  let t = t0;
  let resolvedAt = -1;
  for (; t < t0 + 6 * 60; t += 0.25) {
    const e = deal.lifecycle(t);
    uniqueIds(e);
    seen.push(e.lifecycle);
    if (e.lifecycle === 'ACTIVE' && e.participants.length >= 2 && resolvedAt < 0) {
      assert.match(deal.devResolve(t), /cortado/);
      resolvedAt = t;
    }
    if (resolvedAt >= 0 && e.lifecycle === 'COOLDOWN') break;
  }
  const path = dedupe(seen);
  forward(path, spot.id);
  assert.ok(path.includes('ACTIVE') && path.includes('CLEANUP') && path.at(-1) === 'COOLDOWN', `${spot.id}: ${path.join(' → ')}`);
  assert.equal(deal.presentAt(t).length, 0, `${spot.id}: queda gente tras resolver`);
  const cd = deal.lifecycle(t).cooldownLeft;
  assert.ok(cd > 0 && cd <= COOLDOWN, `${spot.id}: enfriamiento ${cd}`);
  // En enfriamiento no empieza nada del calendario en ese sitio.
  for (let s = t; s < resolvedAt + COOLDOWN - 16; s += 5) assert.equal(deal.episodeAt(s), undefined, `${spot.id}: empieza otro en enfriamiento (min ${s - resolvedAt})`);
  assert.equal(deal.lifecycle(resolvedAt + COOLDOWN + 1).cooldownLeft, 0, `${spot.id}: el enfriamiento no acaba`);

  // b) Cancelar: vacío al momento y con enfriamiento; reiniciar y volver a forzar funciona.
  deal.devReset();
  deal.devForce(t0);
  assert.ok(deal.presentAt(t0 + 5).length > 0, `${spot.id}: forzado sin gente`);
  deal.devCancel(t0 + 5);
  assert.equal(deal.presentAt(t0 + 5).length, 0, `${spot.id}: cancelado y con gente`);
  assert.equal(deal.lifecycle(t0 + 5).lifecycle, 'COOLDOWN', `${spot.id}: cancelado sin enfriamiento`);
  deal.devReset();
  assert.equal(deal.lifecycle(t0).lifecycle, 'ELIGIBLE');
  deal.devForce(t0);
  assert.ok(['SPAWNING', 'ACTIVE'].includes(deal.lifecycle(t0 + 1).lifecycle), `${spot.id}: no se puede volver a forzar`);

  // c) Un forzado que acaba no deja aparecer a medias el rato del calendario que ya había empezado (duplicado).
  deal.devReset();
  let day = 30;
  while (deal.plan(day).episodes.length === 0) day++;
  const nat = deal.plan(day).episodes[0];
  deal.devForce(nat.start - 1);
  let s = nat.start;
  while (deal.lifecycle(s).forced) s += 1;
  for (; s < nat.end; s += 2) assert.equal(deal.presentAt(s).length, 0, `${spot.id}: tras el forzado reaparece el rato del calendario a medias`);
  deal.devReset();
  console.log(`trapicheo ${spot.id}: ${path.join('→')} · enfriamiento ${Math.round(cd)} min · cancelar, reiniciar, repetir y sin duplicado OK`);
}

// -------------------------------------------------------------------- carteristas del metro

/** Pasajero de mentira con el mismo contrato que PassengerAI usa Pickpocket, y la misma marca de papel temporal. */
class FakePassenger {
  state = 'WAITING';
  activity = '';
  incident = false;
  private pending: { ms: number; fn: (() => void) | null } | null = null;
  readonly walker: { x: number; y: number; look: { id: string } };
  constructor(id: string, x: number, y: number) {
    this.walker = { x, y, look: { id } };
  }
  get freeToSteal(): boolean {
    return this.state === 'WAITING' && !this.incident;
  }
  get canBeRobbed(): boolean {
    return this.state === 'WAITING' && !this.incident;
  }
  private after(ms: number, fn: (() => void) | null): void {
    this.pending = { ms, fn };
  }
  sneakTo(to: Vec2, then: () => void): void {
    this.incident = true;
    this.activity = 'se acerca';
    this.after(800, () => {
      this.walker.x = to.x;
      this.walker.y = to.y;
      then();
    });
  }
  pause(ms: number, activity: string, then: () => void): void {
    this.incident = true;
    this.activity = activity;
    this.after(ms, then);
  }
  freeze(): void {
    this.incident = true;
    this.after(0, null);
  }
  noticeFrom(_x: number, ms: number): void {
    this.incident = true;
    this.activity = '¡eh!';
    this.after(ms, () => this.release());
  }
  release(): void {
    this.incident = false;
    this.activity = '';
    this.pending = null;
    this.state = 'WAITING';
  }
  escape(_run: boolean, activity: string): void {
    this.incident = false;
    this.activity = activity;
    this.state = 'LEAVING_STATION';
    this.after(3_000, () => (this.state = 'OFFSTAGE'));
  }
  update(dt: number): void {
    if (!this.pending) return;
    this.pending.ms -= dt;
    if (this.pending.ms > 0) return;
    const fn = this.pending.fn;
    this.pending = null;
    fn?.();
  }
}

class FakeWalker {
  x = 0;
  y = 0;
  path: Vec2[] = [];
  jammed = false;
  visible = true;
  talking = false;
  readonly look: { id: string };
  constructor(id: string) {
    this.look = { id };
  }
  get moving(): boolean {
    return this.path.length > 0;
  }
  get destination(): Vec2 | undefined {
    return this.path[this.path.length - 1];
  }
  place(p: Vec2, _f: Facing): void {
    this.x = p.x;
    this.y = p.y;
    this.path = [];
  }
  walk(path: Vec2[]): void {
    this.path = path.slice();
  }
  halt(): void {
    this.path = [];
  }
  face(): void {}
  step(dt: number): boolean {
    if (this.jammed || !this.path.length) return false;
    const t = this.path[0];
    const d = Math.hypot(t.x - this.x, t.y - this.y);
    const r = (60 * dt) / 1000;
    if (d <= r) {
      this.x = t.x;
      this.y = t.y;
      this.path.shift();
      return this.path.length === 0;
    }
    this.x += ((t.x - this.x) / d) * r;
    this.y += ((t.y - this.y) / d) * r;
    return false;
  }
}

const layout = { walkY: 200, edgeY: 180, gates: [{ gate: { x: 100, y: 300 }, lobby: { x: 100, y: 316 } }], entrance: { x: 100, y: 340 }, spots: [], seats: [], signs: [], doorXs: [] } as unknown as StationLayout;
const train = { state: 'AWAY', cycle: 0 } as unknown as TrainSystem;
const cfg = { ...METRO_CONFIG, pickpocket: { ...METRO_CONFIG.pickpocket, guardRange: 10_000 } };
const host: PickpocketHost = { player: () => null, takeCash: (n) => n, returnCash: () => {}, tell: () => true };

function station(id: string) {
  const passengers = Array.from({ length: 8 }, (_, i) => new FakePassenger(`p${i}`, 60 + i * 20, 210));
  const walkers = [new FakeWalker('g0'), new FakeWalker('g1')];
  const guards = walkers.map((w, i) => new SecurityAI(w as unknown as Walker, { x: 10 + i * 380, y: 214 }, 'up', [], { patrols: false, onPlatform: true }, cfg));
  const crime = new Pickpocket(cfg, host, layout, 400, () => {}, id);
  const ps = passengers as unknown as PassengerAI[];
  const tick = (ms: number): void => {
    for (let k = 0; k < ms; k += 100) {
      for (const p of passengers) p.update(100);
      for (const g of guards) g.update(100, train);
      crime.update(100, 'NORMAL', ps, guards);
    }
  };
  return { passengers, walkers, guards, crime, ps, tick };
}
const clean = (s: ReturnType<typeof station>, what: string): void => {
  assert.equal(s.passengers.filter((p) => p.incident).length, 0, `${what}: quedan pasajeros con papel de robo`);
  assert.ok(s.guards.every((g) => g.available), `${what}: un vigilante sigue ocupado`);
};

{
  // a) Visto por un vigilante: ACTIVE → RESOLUTION (acude) → CLEANUP → cerrado → COOLDOWN; todos sueltos.
  const s = station('test-a');
  assert.equal(s.crime.lifecycle().lifecycle, 'ELIGIBLE');
  assert.match(s.crime.force(s.ps, s.guards, { outcome: 'fail', seen: true }), /en marcha/);
  const seen: Lifecycle[] = [];
  let ms = 0;
  for (; ms < 120_000 && (seen.length === 0 || s.crime.active); ms += 100) {
    s.tick(100);
    seen.push(s.crime.lifecycle().lifecycle);
  }
  const path = dedupe(seen);
  forward(['SPAWNING', ...path], 'pickpocket');
  assert.ok(path.includes('RESOLUTION') && path.includes('CLEANUP') && path.at(-1) === 'COOLDOWN', `robo: ${path.join(' → ')}`);
  assert.ok(ms <= cfg.pickpocket.maxDurationMs + 1_000, `robo sin acotar: ${ms} ms`);
  s.tick(10_000);
  clean(s, 'robo resuelto');
  assert.ok(s.guards.every((g) => g.state === 'IDLE'), `el vigilante no vuelve a lo suyo: ${s.guards.map((g) => g.state)}`);

  // b) En enfriamiento no empieza otro aunque toque (perSecond al máximo).
  const busy = { ...cfg, pickpocket: { ...cfg.pickpocket, perSecond: { ...cfg.pickpocket.perSecond, NORMAL: 1 } } };
  const eager = new Pickpocket(busy, host, layout, 400, () => {}, 'test-a');
  for (let k = 0; k < 60_000; k += 100) eager.update(100, 'NORMAL', s.ps, s.guards);
  assert.equal(eager.active, false, 'empieza un robo en enfriamiento');

  // c) Cambio de escena: el enfriamiento es de la estación (antes se perdía al volver a entrar).
  const again = new Pickpocket(cfg, host, layout, 400, () => {}, 'test-a');
  assert.equal(again.lifecycle().lifecycle, 'COOLDOWN', 'volver a entrar se salta el enfriamiento');
  again.resetCooldown();
  assert.equal(again.lifecycle().lifecycle, 'ELIGIBLE');
  assert.match(again.force(s.ps, s.guards, {}), /en marcha/, 'tras reiniciar no se puede volver a forzar');
  console.log(`carterista: ${path.join('→')} en ${(ms / 1000).toFixed(1)} s · enfriamiento sobrevive al cambio de escena · reiniciar y repetir OK`);
}

{
  // d) Cancelar con el vigilante acudiendo: vuelve a su puesto y nadie queda con papel de robo.
  const s = station('test-d');
  s.walkers.forEach((w) => (w.jammed = true));
  s.crime.force(s.ps, s.guards, { outcome: 'fail', seen: true });
  for (let k = 0; k < 20_000 && s.crime.lifecycle().lifecycle !== 'RESOLUTION'; k += 100) s.tick(100);
  assert.equal(s.crime.lifecycle().lifecycle, 'RESOLUTION');
  assert.equal(s.crime.devCancel(), 'cancelado');
  s.walkers.forEach((w) => (w.jammed = false));
  s.tick(15_000);
  clean(s, 'robo cancelado');
  assert.equal(s.crime.lifecycle().lifecycle, 'COOLDOWN');

  // e) Resolver a mano en plena aproximación: el carterista se va, la víctima vuelve a lo suyo.
  s.crime.resetCooldown();
  s.crime.force(s.ps, s.guards, {});
  assert.match(s.crime.devResolve(), /resuelto/);
  s.tick(10_000);
  assert.equal(s.crime.active, false, 'resuelto y sigue activo');
  clean(s, 'robo resuelto a mano');
  console.log('carterista: cancelar con vigilante acudiendo y resolver a mano sueltan a todos');
}

{
  // f) Fin de escena a mitad: se cancela, y la estación sigue en enfriamiento a la vuelta.
  const s = station('test-f');
  s.crime.force(s.ps, s.guards, {});
  s.tick(500);
  s.crime.shutdown();
  assert.equal(s.crime.active, false, 'el robo sobrevive al fin de escena');
  const back = new Pickpocket(cfg, host, layout, 400, () => {}, 'test-f');
  assert.equal(back.lifecycle().lifecycle, 'COOLDOWN', 'a la vuelta no hay enfriamiento');
  console.log('carterista: salir de la estación a mitad lo cancela y conserva el enfriamiento');
}

{
  // g) Un vigilante que llega tarde a un robo ya cerrado no resuelve el siguiente (aviso viejo).
  const s = station('test-g');
  s.walkers.forEach((w) => (w.jammed = true));
  s.crime.force(s.ps, s.guards, { outcome: 'fail', seen: true });
  for (let k = 0; k < 20_000 && s.crime.lifecycle().lifecycle !== 'RESOLUTION'; k += 100) s.tick(100);
  const first = s.guards.find((g) => g.state === 'RESPOND')!;
  assert.ok(first, 'nadie acude al primero');
  // Se cierra por tiempo con su vigilante aún de camino.
  for (let k = 0; k < cfg.pickpocket.maxDurationMs + 5_000 && s.crime.active; k += 100) s.tick(100);
  assert.equal(s.crime.active, false, 'el primero no se cierra por tiempo');
  // Segundo robo con el otro vigilante, también bloqueado: el primero llega ahora.
  s.crime.resetCooldown();
  for (const p of s.passengers) p.release();
  s.crime.force(s.ps, s.guards, { outcome: 'fail', seen: true });
  for (let k = 0; k < 20_000 && s.crime.lifecycle().lifecycle !== 'RESOLUTION'; k += 100) s.tick(100);
  assert.equal(s.crime.lifecycle().lifecycle, 'RESOLUTION', 'el segundo no llega a RESOLUTION');
  const second = s.guards.find((g) => g !== first && g.state === 'RESPOND');
  assert.ok(second, 'el segundo robo no tiene su propio vigilante');
  s.walkers[s.guards.indexOf(first)].jammed = false;
  for (let k = 0; k < 15_000 && first.state === 'RESPOND'; k += 100) s.tick(100);
  assert.equal(s.crime.lifecycle().lifecycle, 'RESOLUTION', 'el aviso viejo resolvió el robo nuevo');
  s.walkers.forEach((w) => (w.jammed = false));
  for (let k = 0; k < 60_000 && s.crime.active; k += 100) s.tick(100);
  s.tick(10_000);
  clean(s, 'dos robos seguidos');
  console.log('carterista: el aviso de un robo cerrado no resuelve el siguiente');
}

console.log('\nOK: cada suceso se fuerza, se resuelve, se recoge, enfría y vuelve; sin duplicados, papeles colgados ni vigilantes sin soltar.');
