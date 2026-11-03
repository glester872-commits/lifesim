import assert from 'node:assert/strict';
import { createBout, stepBout, MOVES, STYLE_MOVES, SPAR, distanceOf } from '../src/systems/Sparring.ts';
import { register, afterBout, TOURNAMENTS, NO_RECORD, parseEntries, status } from '../src/systems/Tournaments.ts';
import { SimulationPause } from '../src/systems/SimulationPause.ts';
import { parseFitness, START_FITNESS } from '../src/systems/Fitness.ts';
import { charge, NO_MEMBERSHIP, holdsClass } from '../src/systems/Academy.ts';
import { ACADEMIES } from '../src/data/academies.ts';
import { getLocation, isWalkable } from '../src/systems/LocationSystem.ts';
import { tilePath } from '../src/systems/Navigation.ts';
import { SaveSystem, createInitialState, restore } from '../src/systems/SaveSystem.ts';
const neutral = { move: 0 as const, block: false };
let bouts = 0;
for (const style of ['taekwondo', 'boxing'] as const) {
  const academy = ACADEMIES[style]!;
  const loc = getLocation(academy.location);
  const area = academy.spar!;
  assert.ok(tilePath(loc, loc.spawns.entry!, area), style + ': entrada al ring/tatami');
  for (let i = -1; i <= 4; i++) assert.ok(isWalkable(loc, area.tx + i, area.ty), 'línea de combate libre');
  for (const id of STYLE_MOVES[style]) {
    for (const side of ['L', 'R'] as const) {
      const b = createBout(style, 0, 1);
      b.ai.next = Infinity;
      b.p.x = 1; b.o.x = 1 + (MOVES[id].reach[0] + MOVES[id].reach[1]) / 2;
      stepBout(b, 0, { ...neutral, attack: { id, side } });
      while (b.t <= MOVES[id].windupMs + 100) stepBout(b, 10, neutral);
      assert.equal(b.p.landed, 1, id + ': un solo contacto');
      assert.equal(b.p.score, MOVES[id].points);
      const blocked = createBout(style, 0, 5);
      blocked.ai.next = Infinity;
      blocked.p.x = 1; blocked.o.x = 1 + (MOVES[id].reach[0] + MOVES[id].reach[1]) / 2;
      blocked.o.move = { id, side, start: 0, resolved: false };
      for (let i = 0; i < 50; i++) stepBout(blocked, 10, { ...neutral, block: true });
      assert.equal(blocked.o.score, 0, 'guardia detiene golpe');
      assert.ok(blocked.p.blocks >= 1);
      const miss = createBout(style, 0, 1);
      miss.ai.next = Infinity; miss.o.x = 4;
      stepBout(miss, 0, { ...neutral, attack: { id, side } });
      for (let i=0;i<60;i++) stepBout(miss,10,neutral);
      assert.equal(miss.p.score, 0, 'fuera de alcance');
    }
  }
  // Rivales reales durante veinte combates por disciplina; sin manipular puntuaciones ni finalización.
  let rivalsHit = 0;
  for (let seed=1;seed<=20;seed++) {
    const b = createBout(style, 0.5, seed);
    let frames=0;
    while (!b.ended && frames++ < 10_100) {
      const id = STYLE_MOVES[style][frames % 3]!;
      const dist = distanceOf(b);
      stepBout(b, 16, { move: dist > MOVES[id].reach[1] ? 1 : dist < MOVES[id].reach[0] ? -1 : 0, block: frames % 120 > 95,
        attack: frames % 35 === 0 ? { id, side: frames % 2 ? 'L' : 'R' } : null });
      assert.ok(distanceOf(b) >= SPAR.minGap - 1e-9, 'no se atraviesan');
      assert.ok([b.p.x,b.o.x].every(x => x >= SPAR.bounds[0] && x <= SPAR.bounds[1]), 'dentro del espacio');
    }
    assert.ok(b.ended, 'combate termina');
    assert.equal(typeof b.won, 'boolean');
    assert.deepEqual(stepBout(b, 500, neutral), []);
    rivalsHit += b.o.landed;
    bouts++;
  }
  assert.ok(rivalsHit > 0, 'el oponente ataca y puntúa');
  const dt = createBout(style, 0, 1); stepBout(dt, 3600000, neutral); assert.equal(dt.t, 50);
  const def = TOURNAMENTS[style], day = def.weekday + 1;
  assert.equal(register(def, undefined, 0, day, 660, 10).ok, false);
  assert.equal(register(def, undefined, 100, day, 660, 0).ok, false);
  const entry = register(def, undefined, 100, day, 660, 10);
  assert.ok(entry.ok);
  assert.equal(entry.money, 90);
  assert.equal(register(def, entry.entry, entry.money, day, 660, 10).ok, false);
  const semi = afterBout(def, entry.entry, true, NO_RECORD);
  assert.equal(semi.entry.stage, 'final'); assert.equal(semi.prize, 0);
  const final = afterBout(def, semi.entry, true, semi.record);
  assert.equal(final.entry.stage, 'champion'); assert.equal(final.prize, 40);
  assert.equal(afterBout(def, final.entry, true, final.record).prize, 0);
  const loss = afterBout(def, semi.entry, false, semi.record);
  assert.equal(loss.entry.stage,'runner-up'); assert.equal(loss.prize,15);
  assert.equal(status(def, final.entry, day, 660,10).can,null);
  const old = parseFitness({ ...START_FITNESS }); assert.equal(old.tournaments,undefined);
  const storage = new Map<string,string>();
  const save = new SaveSystem({read:k=>storage.get(k)??null,write:(k,v)=>{storage.set(k,v);},remove:k=>{storage.delete(k);}});
  const s = createInitialState();
  s.fitness = { ...s.fitness, tournaments: { [style]: final.entry }, fights: { [style]: final.record } };
  assert.ok(save.save(s)); const loaded = restore(save.load());
  assert.deepEqual(loaded.fitness.tournaments?.[style],final.entry);
  assert.deepEqual(loaded.fitness.fights?.[style],final.record);
  // Reserva válida incluso fuera de los cinco minutos iniciales y al final del horario.
  const paid=charge(academy,NO_MEMBERSHIP,100,18*60+1); assert.ok(paid.ok);
  assert.ok(holdsClass(academy,paid.membership,18*60+28));
  assert.equal(charge(academy,paid.membership,paid.money,18*60+28).ok,true);
  assert.equal(holdsClass(academy,paid.membership,18*60+30),false);
}
assert.equal(parseEntries({ boxing:{stage:'inventado',day:1} }),undefined);
const transitions:boolean[]=[];
const pause=new SimulationPause(p=>transitions.push(p));
pause.set('menu',true); pause.set('hidden',true); pause.set('hidden',false);
assert.equal(pause.paused,true); assert.deepEqual(transitions,[true]);
pause.set('menu',false); assert.deepEqual(transitions,[true,false]);
console.log('QA-08 PASS: '+bouts+' combates completos, seis ataques con ambas extremidades, guardia, alcance, rival, puntos, resultados, cuadro y premio único, save antiguo, reserva y pausas anidadas.');
