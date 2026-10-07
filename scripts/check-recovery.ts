// NPC atascados (systems/Recovery.ts) con los mismos Crowd, StreetLife y SecurityAI del juego: `npm run check`.
// Fuerza los cuatro casos (obstáculo en un local, en la calle, vigilante del metro, cambio de horario a mitad
// del atasco), comprueba que todos salen solos, que nadie reaparece en un sitio prohibido y que, sin
// obstáculos, la escalera no salta nunca (falsos positivos).
import assert from 'node:assert/strict';
import { TILE } from '../src/config/constants.ts';
import { METRO_CONFIG } from '../src/config/metro.ts';
import { getLocation, isWalkable, ROADWAY } from '../src/systems/LocationSystem.ts';
import { placeInfo } from '../src/systems/Places.ts';
import { Crowd, profileFor, type Agent, type Clock } from '../src/systems/Crowd.ts';
import { StreetLife, streetProfileFor, type Walker as StreetWalker } from '../src/systems/StreetLife.ts';
import { SecurityAI } from '../src/systems/SecurityAI.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { NAMED_LAG_CAP, RECOVERY, StuckWatch, settleNamed, tileKey } from '../src/systems/Recovery.ts';
import type { Facing, TilePoint, Vec2 } from '../src/types/game.ts';
import type { Walker } from '../src/entities/Walker.ts';
import type { TrainSystem } from '../src/systems/TrainSystem.ts';

const STEP = 100;
const MS_PER_MIN = 500;
const FAR: TilePoint = { tx: -999, ty: -999 };
const tick = (c: Clock, ms: number, acc: { ms: number }): Clock => {
  acc.ms += ms;
  if (acc.ms < MS_PER_MIN) return c;
  acc.ms -= MS_PER_MIN;
  const total = c.hour * 60 + c.minute + 1;
  return { day: c.day + Math.floor(total / 1440), hour: Math.floor((total % 1440) / 60), minute: total % 60 };
};
const attempts = (w: StuckWatch): number => w.stats.attempts.reduce((s, n) => s + n, 0);

// ---------------------------------------------------------------- 0. sin falsos positivos

{
  const place = placeInfo('cafe')!;
  const crowd = new Crowd(getLocation(place.interior!), place, profileFor('cafe')!, seededRng(11));
  let clock: Clock = { day: 3, hour: 9, minute: 0 };
  const acc = { ms: 0 };
  crowd.populate(clock, FAR);
  for (let ms = 0; ms < 180 * MS_PER_MIN; ms += STEP) crowd.update(STEP, (clock = tick(clock, STEP, acc)), FAR);
  assert.equal(attempts(crowd.watch), 0, `café sin obstáculos: la escalera saltó ${crowd.watch.stats.attempts}`);

  const street = new StreetLife(getLocation('district'), streetProfileFor('district')!, seededRng(12));
  clock = { day: 5, hour: 18, minute: 0 };
  street.populate(clock, { tx: 72, ty: 53 });
  for (let ms = 0; ms < 180 * MS_PER_MIN; ms += STEP) street.update(STEP, (clock = tick(clock, STEP, acc)), { tx: 72, ty: 53 });
  assert.equal(attempts(street.watch), 0, `calle sin obstáculos (con semáforos, grupos y paradas): la escalera saltó ${street.watch.stats.attempts}`);
  console.log(`sin obstáculos: 3 h de café y 3 h de calle, 0 peldaños (${crowd.agents.length} y ${street.agents.length} personas al final)`);
}

// ------------------------------------------------- 1. local: obstáculo temporal y encierro

/** Corre hasta que un cliente ande hacia algún sitio; devuelve el local y esa persona. */
function walkerIn(placeId: string, seed: number, clock: Clock): { crowd: Crowd; a: Agent; clock: Clock } {
  const place = placeInfo(placeId)!;
  const crowd = new Crowd(getLocation(place.interior!), place, profileFor(placeId)!, seededRng(seed));
  crowd.populate(clock, FAR);
  const acc = { ms: 0 };
  for (let ms = 0; ms < 60 * MS_PER_MIN; ms += STEP) {
    crowd.update(STEP, (clock = tick(clock, STEP, acc)), FAR);
    // Un cliente: al camarero lo mueve el servicio de mesa, que cambia de plan por su cuenta.
    // Lejos de la puerta: encerrado en el umbral, salir por ella es lo correcto (no un atasco).
    const atDoor = (x: Agent): boolean => crowd.agents.length > 0 && getLocation(place.interior!).portals.some((q) => Math.hypot(q.tx - x.x, q.ty - x.y) < 2.5);
    const a = crowd.agents.find((x) => x.kind === 'visitor' && x.path.length >= 1 && !x.leaving && !x.talking && !atDoor(x));
    if (a) return { crowd, a, clock };
  }
  throw new Error(`${placeId}: nadie anda`);
}

function safeCrowd(crowd: Crowd, loc = getLocation(placeInfo('cafe')!.interior!)): void {
  for (const a of crowd.agents) {
    const t = { tx: Math.round(a.x), ty: Math.round(a.y) };
    assert.ok(!crowd.blocked.has(tileKey(t)), `#${a.id} dentro de un obstáculo en ${tileKey(t)}`);
    assert.ok(t.tx >= 0 && t.ty >= 0 && t.ty < loc.ground.length && t.tx < loc.ground[0].length, `#${a.id} fuera del mapa`);
  }
}

{
  // a) Un tile cortado delante: rodea (peldaño 1 o 2) y sigue.
  let { crowd, a, clock } = walkerIn('cafe', 21, { day: 3, hour: 10, minute: 0 });
  const loc = getLocation(placeInfo('cafe')!.interior!);
  crowd.blocked.add(tileKey(a.path[0]));
  const goal = a.path[a.path.length - 1];
  const acc = { ms: 0 };
  let reached = false;
  for (let ms = 0; ms < 40_000 && !reached; ms += STEP) {
    crowd.update(STEP, (clock = tick(clock, STEP, acc)), FAR);
    safeCrowd(crowd, loc);
    reached = !crowd.agents.includes(a) || (Math.round(a.x) === goal.tx && Math.round(a.y) === goal.ty) || a.path.length === 0;
  }
  assert.ok(crowd.watch.stats.attempts[1] > 0, `#${a.id}: el obstáculo no se detectó`);
  assert.ok(reached, `#${a.id} no sale del obstáculo (${a.x.toFixed(1)},${a.y.toFixed(1)}; peldaños ${crowd.watch.stats.attempts})`);
  console.log(`local, obstáculo delante: #${a.id} sigue · peldaños ${crowd.watch.stats.attempts.slice(1).join('/')} · recuperados ${crowd.watch.stats.recovered}`);

  // b) Encerrado (los cuatro lados cortados): sube hasta el 4 y reaparece fuera de cámara, en un tile válido.
  ({ crowd, a, clock } = walkerIn('cafe', 22, { day: 3, hour: 10, minute: 0 }));
  const here = { tx: Math.round(a.x), ty: Math.round(a.y) };
  a.x = here.tx;
  a.y = here.ty;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) crowd.blocked.add(`${here.tx + dx},${here.ty + dy}`);
  let freed = false;
  for (let ms = 0; ms < 120_000 && !freed; ms += STEP) {
    crowd.update(STEP, (clock = tick(clock, STEP, acc)), FAR);
    safeCrowd(crowd, loc);
    freed = !crowd.agents.includes(a) || Math.hypot(a.x - here.tx, a.y - here.ty) >= 2;
  }
  assert.ok(freed, `#${a.id} sigue encerrado tras 2 min (peldaños ${crowd.watch.stats.attempts})`);
  if (crowd.agents.includes(a)) assert.ok(isWalkable(loc, Math.round(a.x), Math.round(a.y)), `#${a.id} reaparece en un tile sólido`);
  assert.ok(crowd.watch.stats.attempts[4] > 0, 'encerrado y sin peldaño 4');
  console.log(`local, encerrado: #${a.id} reaparece fuera de cámara · peldaños ${crowd.watch.stats.attempts.slice(1).join('/')}`);

  // c) Con el jugador delante, el 4 no se hace: espera (sin bucle: un reintento cada stepMs, no cada frame).
  ({ crowd, a, clock } = walkerIn('cafe', 23, { day: 3, hour: 10, minute: 0 }));
  const seenAt = { tx: Math.round(a.x), ty: Math.round(a.y) };
  a.x = seenAt.tx;
  a.y = seenAt.ty;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) crowd.blocked.add(`${seenAt.tx + dx},${seenAt.ty + dy}`);
  for (let ms = 0; ms < 40_000; ms += STEP) crowd.update(STEP, (clock = tick(clock, STEP, acc)), seenAt);
  if (crowd.agents.includes(a)) assert.ok(Math.hypot(a.x - seenAt.tx, a.y - seenAt.ty) < 1, `#${a.id} se teletransporta delante del jugador`);
  assert.ok(crowd.watch.stats.attempts[4] <= 40_000 / RECOVERY.stepMs, `peldaño 4 en bucle: ${crowd.watch.stats.attempts[4]}`);
  // Al irse el jugador, sale solo, sin recargar nada.
  crowd.blocked.clear();
  for (let ms = 0; ms < 20_000; ms += STEP) crowd.update(STEP, (clock = tick(clock, STEP, acc)), FAR);
  assert.equal(crowd.watch.stuckCount(), 0, 'quedan atascados al quitar el obstáculo');
  console.log(`local, encerrado a la vista: no salta delante del jugador (${crowd.watch.stats.attempts[4]} reintentos del 4 en 40 s) y sale al quitar el obstáculo`);
}

// --------------------------------------- 2. cambio de horario a mitad del atasco (cierra el local)

{
  const place = placeInfo('cafe')!;
  const closeAt = place.hours?.[1] ?? 21;
  const { crowd, a, clock: start } = walkerIn('cafe', 31, { day: 3, hour: Math.floor(closeAt) - 1, minute: 20 });
  let clock = start;
  const here = { tx: Math.round(a.x), ty: Math.round(a.y) };
  a.x = here.tx;
  a.y = here.ty;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) crowd.blocked.add(`${here.tx + dx},${here.ty + dy}`);
  const acc = { ms: 0 };
  // Pasa la hora de cierre con la persona encerrada: el plan cambia a «irse» a mitad del atasco.
  for (let ms = 0; ms < 150 * MS_PER_MIN && crowd.agents.length > 0; ms += STEP) crowd.update(STEP, (clock = tick(clock, STEP, acc)), FAR);
  assert.equal(crowd.agents.length, 0, `tras cerrar quedan ${crowd.agents.length} (encerrado #${a.id}: ${crowd.agents.includes(a) ? a.state : 'fuera'})`);
  console.log(`cambio de horario encerrado: el café cierra a las ${closeAt} y se vacía entero (peldaños ${crowd.watch.stats.attempts.slice(1).join('/')})`);
}

// -------------------------------------------------- 3. calle: obstáculo en la acera, sin pisar calzada

{
  const loc = getLocation('district');
  const street = new StreetLife(loc, streetProfileFor('district')!, seededRng(41));
  let clock: Clock = { day: 5, hour: 12, minute: 0 };
  const acc = { ms: 0 };
  street.populate(clock, FAR);
  let a: StreetWalker | undefined;
  for (let ms = 0; ms < 20 * MS_PER_MIN && !a; ms += STEP) {
    street.update(STEP, (clock = tick(clock, STEP, acc)), FAR);
    a = street.agents.find((w) => w.kind === 'visitor' && w.path.length >= 2 && !w.hold && w.delay <= 0 && !w.talking && (w.timer <= 0 || w.staying));
  }
  assert.ok(a, 'nadie anda por la calle');
  const id = street.devForceStuck({ tx: a.x, ty: a.y });
  assert.ok(id !== null);
  const who = street.agents.find((w) => w.id === id)!;
  const from = { tx: who.x, ty: who.y };
  // Quien ya estaba dentro del tile cuando se cortó sigue su camino hacia fuera (el tile donde ya está nunca cuenta).
  const already = new Set(street.agents.filter((w) => street.blocked.has(tileKey({ tx: w.x, ty: w.y }))).map((w) => w.id));
  let ok = false;
  for (let ms = 0; ms < 60_000 && !ok; ms += STEP) {
    street.update(STEP, (clock = tick(clock, STEP, acc)), FAR);
    for (const w of street.agents) {
      if (!w.resume) continue;
      // Quien va de rodeo no pisa la calzada (salvo el paso de cebra) ni el obstáculo.
      const ch = loc.ground[Math.round(w.y)]?.[Math.round(w.x)] ?? '';
      assert.ok(!ROADWAY.has(ch) || ch === 'z', `#${w.id} de rodeo por la calzada en ${Math.round(w.x)},${Math.round(w.y)} («${ch}»)`);
    }
    for (const w of street.agents) assert.ok(!street.blocked.has(tileKey({ tx: w.x, ty: w.y })) || already.has(w.id) || Math.hypot(w.x - from.tx, w.y - from.ty) < 0.7, `#${w.id} dentro del obstáculo`);
    ok = !street.agents.includes(who) || Math.hypot(who.x - from.tx, who.y - from.ty) >= 2;
  }
  assert.ok(ok, `#${id} sigue atascado en la calle (peldaños ${street.watch.stats.attempts})`);
  console.log(`calle, obstáculo forzado: #${id} sale · peldaños ${street.watch.stats.attempts.slice(1).join('/')}`);
}

// ------------------------------------------------------------- 4. vigilante del metro sin avanzar

{
  const station = getLocation('vallesco-station');
  const def = station.metro!;
  const at = (p: TilePoint): Vec2 => ({ x: p.tx * TILE + TILE / 2, y: p.ty * TILE + 13 });
  /** Un Walker de mentira: el mismo contrato que entities/Walker usa SecurityAI, sin Phaser. `jammed`: no avanza. */
  class FakeWalker {
    x = 0;
    y = 0;
    path: Vec2[] = [];
    jammed = true;
    visible = true;
    talking = false;
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
      this.visible = true;
    }
    walk(path: Vec2[]): void {
      this.path = path.slice();
    }
    halt(): void {
      this.path = [];
    }
    hide(): void {
      this.visible = false;
    }
    face(): void {}
    setIcon(): void {}
    say(): void {}
    step(dt: number): boolean {
      if (this.jammed || !this.path.length) return false;
      const t = this.path[0];
      const d = Math.hypot(t.x - this.x, t.y - this.y);
      const r = (34 * dt) / 1000;
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
  const train = { state: 'AWAY', cycle: 0 } as unknown as TrainSystem;
  const g = def.guards[0];
  const w = new FakeWalker();
  const guard = new SecurityAI(w as unknown as Walker, at(g.post), g.facing, g.patrol.map(at), { patrols: true, onPlatform: g.post.ty < def.gates[0].ty }, METRO_CONFIG);
  // Persigue a un carterista al otro lado del andén con el vigilante bloqueado: la persecución no avanza.
  const thief = new FakeWalker();
  thief.place({ x: at(g.post).x + 8 * TILE, y: at({ tx: 0, ty: def.walkRow }).y }, 'down');
  let caught = false;
  let escaped = false;
  assert.ok(guard.chase(thief as unknown as Walker, () => (caught = true), () => (escaped = true)), 'no empieza la persecución');
  assert.equal(guard.available, false, 'persiguiendo y libre');
  const watch = new StuckWatch();
  const levels: number[] = [];
  for (let ms = 0; ms < 30_000 && guard.handlingIncident; ms += STEP) {
    guard.update(STEP, train);
    const level = watch.check('g0', w.x / TILE, w.y / TILE, w.moving && !w.talking, STEP);
    if (level) {
      levels.push(level);
      guard.recover(level, true);
    }
  }
  assert.ok(!guard.handlingIncident && guard.available, `el vigilante sigue con la incidencia (${guard.state}, peldaños ${levels})`);
  assert.ok(escaped && !caught, 'la persecución atascada no se cierra como huida');
  assert.ok(levels.length > 0 && levels[0] === 1, `peldaños ${levels}`);
  // Desatascado: vuelve a su puesto andando y nunca por encima del borde del andén (la vía).
  w.jammed = false;
  const edgeY = (def.edgeRow + 1) * TILE;
  for (let ms = 0; ms < 30_000 && guard.state !== 'IDLE'; ms += STEP) {
    guard.update(STEP, train);
    assert.ok(w.y >= edgeY, `el vigilante pisa la vía (y=${w.y.toFixed(0)} < ${edgeY})`);
  }
  // Peldaño 4 a la vista: no se teletransporta; fuera de cámara, a su puesto (validado fuera de la vía).
  const far = { x: at(g.post).x + 5 * TILE, y: at({ tx: 0, ty: def.walkRow }).y };
  w.place(far, 'up');
  guard.recover(4, false);
  assert.deepEqual({ x: w.x, y: w.y }, far, 'peldaño 4 a la vista');
  guard.recover(4, true);
  assert.deepEqual({ x: w.x, y: w.y }, at(g.post), 'peldaño 4 fuera de cámara');
  assert.ok(g.post.ty > def.edgeRow, 'el puesto está en la vía');
  // Una escolta atascada también se cierra: el sospechoso sale de escena (nadie retenido para siempre).
  thief.place({ x: w.x + 6, y: w.y }, 'down');
  let escorted = false;
  guard.chase(thief as unknown as Walker, () => guard.prepareEscort(thief as unknown as Walker, [at(def.gates[0])], () => (escorted = true)), () => {});
  w.jammed = false;
  for (let ms = 0; ms < 10_000 && guard.state !== 'ESCORT'; ms += STEP) guard.update(STEP, train);
  assert.equal(guard.state, 'ESCORT', `no llega a escoltar (${guard.state})`);
  w.jammed = true;
  guard.recover(2, false);
  assert.ok(escorted && !guard.handlingIncident, 'una escolta atascada deja al sospechoso retenido');
  console.log(`metro, vigilante sin avanzar: peldaños ${levels.join('→')}, cierra la persecución como huida, vuelve a su puesto sin pisar la vía; escolta atascada cerrada`);
}

// --------------------------------------------------------------- 5. personaje con nombre colgado

{
  // Charla que ya no existe (la escena cambió a mitad): se suelta y el retraso pasa a lag, como al despedirse.
  const c = { heldAt: 1_000, lag: 0 };
  assert.equal(settleNamed(c, 1_030, true, true), null, 'hablando de verdad no se toca');
  assert.equal(settleNamed(c, 1_030, false, false), 'released');
  assert.deepEqual(c, { heldAt: null, lag: 30 });
  // Cambio de rutina durante la charla colgada (otro día): retraso enorme. A la vista no salta; fuera, al día.
  const d = { heldAt: 1_000, lag: 0 };
  settleNamed(d, 1_000 + 1_440, false, false);
  assert.ok(d.lag > NAMED_LAG_CAP);
  assert.equal(settleNamed(d, 2_500, false, false), null, 'se pone al día delante del jugador');
  assert.equal(settleNamed(d, 2_500, false, true), 'resynced');
  assert.equal(d.lag, 0);
  assert.equal(settleNamed(d, 2_600, false, true), null, 'sin nada colgado no hace nada');
  console.log('personaje con nombre: charla colgada soltada; cambio de rutina a mitad, puesto al día sólo fuera de cámara');
}

console.log('\nOK: atascos detectados y resueltos sin recargar, sin teletransportes a la vista, sin bucles, sin calzada ni vía.');
