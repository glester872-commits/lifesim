import assert from 'node:assert/strict';
import { createBout, stepBout, MOVES, STYLE_MOVES, SPAR, distanceOf, specOf, type Bout, type BoutEvent, type BoutInput } from '../src/systems/Sparring.ts';
import { register, afterBout, TOURNAMENTS, NO_RECORD, parseEntries, status } from '../src/systems/Tournaments.ts';
import { SimulationPause } from '../src/systems/SimulationPause.ts';
import { parseFitness, practiceMma, START_FITNESS } from '../src/systems/Fitness.ts';
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
// ----------------------------------------------------------------- MMA (Academia MMA Arena)
{
  const academy = ACADEMIES.mma!;
  const loc = getLocation(academy.location);
  const area = academy.spar!;
  assert.ok(tilePath(loc, loc.spawns.entry!, area), 'mma: se llega al tatami');
  for (let i = -1; i <= 4; i++) assert.ok(isWalkable(loc, area.tx + i, area.ty), 'mma: línea de ejercicio libre');
  const r = academy.ring!;
  for (let x = area.tx - 1; x <= area.tx + 4; x++) assert.ok(x >= r.tx && x < r.tx + r.w && loc.ground[area.ty][x] === 'Q', 'mma: la línea va sobre el tatami reservado');
  // Un ejercicio quieto: el compañero no ataca solo (ai.next) salvo que se diga.
  const quiet = (drill: 'punches' | 'kicks' | 'grappling' | 'mixed', dist: number): Bout => { const b = createBout('mma', 0, 3, drill); b.ai.next = Infinity; b.ai.reactAt = 1e12; b.p.x = 1; b.o.x = 1 + dist; return b; };
  const run = (b: Bout, ms: number, input: BoutInput = neutral): BoutEvent[] => { const out: BoutEvent[] = []; for (let t = 0; t < ms; t += 10) out.push(...stepBout(b, 10, input)); return out; };
  const said = (ev: BoutEvent[], re: RegExp): boolean => ev.some((e) => re.test(e.text));

  // 1. Puños: la mano decide. Jab (izquierda) y directo (derecha) con su tiempo propio; mantener no repite ni cuenta dos veces.
  for (const [side, id] of [['L', 'jab'], ['R', 'cross']] as const) {
    const b = quiet('punches', 0.9);
    stepBout(b, 0, { ...neutral, attack: { id: 'jab', side } });
    assert.equal(b.p.move?.id, id, 'la mano ' + side + ' no da su golpe');
    run(b, MOVES[id].windupMs - 20, { ...neutral, attack: { id: 'jab', side } });
    assert.equal(b.p.landed, 0, id + ': contacta antes de su preparación');
    run(b, 600, { ...neutral, attack: { id: 'jab', side } });
    assert.ok(b.p.landed >= 1 && b.p.tech.punches === b.p.landed, id + ': contacto y técnica');
    const once = quiet('punches', 0.9);
    stepBout(once, 0, { ...neutral, attack: { id: 'jab', side } });
    run(once, MOVES[id].windupMs + MOVES[id].holdMs + 50);
    assert.equal(once.p.landed, 1, id + ': un solo contacto por golpe');
  }
  assert.ok(MOVES.cross.windupMs > MOVES.jab.windupMs && MOVES.cross.points > MOVES.jab.points, 'jab y directo iguales');
  // 2. Patadas con las dos piernas: la de atrás tarda más, llega más y vale más; las dos conectan sólo a su distancia.
  for (const id of ['front', 'round'] as const) {
    const l = specOf('mma', id, 'L'), rr = specOf('mma', id, 'R');
    assert.ok(rr.windupMs > l.windupMs && rr.points > l.points && rr.reach[1] > l.reach[1], id + ': las dos piernas iguales');
    for (const [side, d] of [['L', l], ['R', rr]] as const) {
      const b = quiet('kicks', (d.reach[0] + d.reach[1]) / 2);
      stepBout(b, 0, { ...neutral, attack: { id, side } });
      run(b, d.windupMs + 50);
      assert.equal(b.p.score, d.points, id + ' ' + side + ': no puntúa a su distancia');
      assert.equal(b.p.tech.kicks, 1);
      const far = quiet('kicks', 3.5);
      stepBout(far, 0, { ...neutral, attack: { id, side } });
      const ev = run(far, d.windupMs + 50);
      assert.ok(far.p.score === 0 && far.p.tech.kicks === 0 && said(ev, /no llega/), id + ': conecta fuera de alcance');
    }
  }
  // 3. Cada sesión, lo suyo: en la de puños no hay patadas ni agarres, y se dice por qué.
  { const b = quiet('punches', 1.2); const ev = stepBout(b, 0, { ...neutral, attack: { id: 'front', side: 'L' } }); assert.ok(!b.p.move && said(ev, /no toca/), 'patada en la sesión de puños'); }
  { const b = quiet('punches', 0.7); const ev = stepBout(b, 0, { ...neutral, grab: true }); assert.ok(!b.p.move && said(ev, /no toca/), 'agarre en la sesión de puños'); }
  // 4. Sin energía no empieza; el motivo se ve.
  { const b = quiet('punches', 0.9); const ev = stepBout(b, 0, { ...neutral, attack: { id: 'jab', side: 'R' }, energy: 0.1 }); assert.ok(!b.p.move && said(ev, /Sin energía/), 'golpea sin energía'); }
  // 5. Clinch: no hay agarre a distancia; a distancia de agarre entra salvo guardia a tiempo (que cuesta equilibrio).
  { const b = quiet('grappling', 2); stepBout(b, 0, { ...neutral, grab: true }); const ev = run(b, 400); assert.ok(b.grip.phase === 'stand' && said(ev, /no hay agarre a distancia/), 'agarre a distancia'); }
  // La defensa es la misma para los dos: aquí entra el compañero y el jugador sube la guardia a tiempo.
  const guard = { move: 0 as const, block: true };
  { const b = quiet('grappling', 0.8); b.o.move = { id: 'clinch', side: 'R', start: 0, resolved: false }; const ev = run(b, 400, guard); assert.ok(b.grip.phase === 'stand' && b.o.balance < 1 && said(ev, /Frenas/), 'la guardia no frena la entrada'); }
  { const b = quiet('grappling', 0.8); b.o.move = { id: 'clinch', side: 'R', start: 0, resolved: false }; const late = run(b, 400, neutral); assert.ok(b.grip.phase === 'clinch' && said(late, /clinch/), 'sin guardia no entra'); }
  const clinched = (): Bout => { const b = quiet('grappling', 0.8); stepBout(b, 0, { ...neutral, grab: true }); run(b, 700); return b; };
  { const b = clinched(); assert.equal(b.grip.phase, 'clinch'); assert.ok(Math.abs(distanceOf(b) - SPAR.clinchGap) < 1e-9 && distanceOf(b) >= SPAR.minGap, 'clinch: atraviesa o separa');
    const ev = stepBout(b, 0, { ...neutral, attack: { id: 'jab', side: 'L' } });
    assert.equal(b.p.move?.id, 'takedown', 'en el clinch J/K son la acción de lucha');
    void ev; }
  // 6. Derribo: defendido con la base (pierde equilibrio y no puede repetir enseguida); sin defensa, al suelo arriba (+2).
  { const b = clinched(); run(b, 800); b.o.move = { id: 'takedown', side: 'R', start: b.t, resolved: false }; const ev = run(b, 600, guard);
    assert.ok(b.grip.phase === 'clinch' && b.o.balance <= 1 - SPAR.balanceCost + 0.2 && said(ev, /Defiendes el derribo/), 'derribo garantizado contra la base'); }
  { const b = clinched(); run(b, 800); b.p.balance = 0.2; const ev = stepBout(b, 0, { ...neutral, grab: true }); assert.ok(!b.p.move && said(ev, /equilibrio/), 'derribo sin equilibrio'); }
  const grounded = (): Bout => { const b = clinched(); run(b, 800); stepBout(b, 0, { ...neutral, grab: true }); run(b, 1100); return b; };
  { const b = grounded(); assert.ok(b.grip.phase === 'ground' && b.grip.top === 'p' && b.p.score === 2, 'derribo controlado'); assert.ok(b.p.tech.grappling >= 2); }
  // 7. Suelo arriba: tres fijaciones = control y de pie otra vez; el compañero enmarca si sube la guardia a tiempo.
  { const b = grounded(); const ev: BoutEvent[] = []; for (let i = 0; i < SPAR.pinsToControl; i++) { stepBout(b, 0, { ...neutral, grab: true }); ev.push(...run(b, 1300)); }
    assert.ok(b.grip.phase === 'stand' && said(ev, /Control completo/), 'el control no levanta'); }
  { const b = createBout('mma', 0, 4, 'grappling'); b.ai.next = Infinity; b.ai.reactAt = 1e12; b.grip = { phase: 'ground', top: 'o', since: 0, pins: 0 }; b.p.x = 1; b.o.x = 1.5;
    b.o.move = { id: 'pin', side: 'R', start: 0, resolved: false }; const ev = run(b, 400, guard); assert.ok(b.grip.pins === 0 && said(ev, /Enmarcas/), 'fija contra los brazos'); }
  // 8. Suelo abajo: escape con su tiempo; parado si arriba fija o controla; sin parar, de pie (+1). Sin escapes infinitos.
  { const b = createBout('mma', 0, 4, 'grappling'); b.ai.next = Infinity; b.ai.reactAt = 1e12; b.grip = { phase: 'ground', top: 'o', since: 0, pins: 0 }; b.p.x = 1; b.o.x = 1.5;
    stepBout(b, 0, { ...neutral, grab: true }); assert.equal(b.p.move?.id, 'escape');
    const busy = stepBout(b, 10, { ...neutral, grab: true }); assert.ok(b.p.move?.start === 0 && !said(busy, /Escape/), 'escapes encadenados');
    run(b, 700); assert.ok(b.grip.phase === 'stand' && b.p.score === 1, 'el escape no levanta'); }
  { const b = createBout('mma', 0, 4, 'grappling'); b.ai.next = Infinity; b.ai.reactAt = 1e12; b.grip = { phase: 'ground', top: 'o', since: 0, pins: 0 }; b.p.x = 1; b.o.x = 1.5;
    b.o.move = { id: 'pin', side: 'R', start: 0, resolved: false }; for (let i = 0; i < 31; i++) stepBout(b, 10, neutral);
    stepBout(b, 0, { ...neutral, grab: true }); const ev = run(b, 700); assert.ok(b.grip.phase === 'ground' && said(ev, /fijado/), 'escapa de una fijación'); }
  // 9. Soltarse del clinch: atrás mantenido; y agarrados no se golpea.
  { const b = clinched(); run(b, 800); run(b, SPAR.releaseMs + 30, { move: -1, block: false }); assert.ok(b.grip.phase === 'stand' && distanceOf(b) > 1, 'no se suelta'); }
  { const b = clinched(); run(b, 800); const ev = stepBout(b, 0, { ...neutral, attack: { id: 'jab', side: 'L' } }); void ev; assert.notEqual(b.p.move?.id, 'jab', 'golpea agarrado'); }
  // 10. Ejercicios enteros con compañero real: pasa por clinch y suelo, sin atravesarse, dentro del tatami, y termina.
  let phases = new Set<string>(), aiGrapples = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const b = createBout('mma', 0.5, seed, 'mixed');
    let f = 0;
    while (!b.ended && f++ < 12_000) {
      const d = distanceOf(b);
      const ev = stepBout(b, 16, { move: b.grip.phase !== 'stand' ? 0 : d > 1 ? 1 : d < 0.6 ? -1 : 0, block: f % 140 > 110, attack: f % 41 === 0 ? { id: f % 3 ? 'jab' : 'front', side: f % 2 ? 'L' : 'R' } : null, grab: f % 97 === 0 });
      phases.add(b.grip.phase);
      aiGrapples += ev.filter((e) => e.who === 'o' && /clinch|derrib|fija|escap/i.test(e.text)).length;
      assert.ok(distanceOf(b) >= SPAR.minGap - 1e-9 && [b.p.x, b.o.x].every((x) => x >= SPAR.bounds[0] && x <= SPAR.bounds[1]), 'mma: se atraviesan o salen');
    }
    assert.ok(b.ended, 'mma: el ejercicio no termina');
    bouts++;
  }
  assert.ok(phases.has('clinch') && phases.has('ground'), 'mma: el ejercicio no pasa por clinch y suelo');
  assert.ok(aiGrapples > 0, 'mma: el compañero no lucha');
  // 11. Progreso: sólo lo practicado; nada practicado, nada sube; se guarda y se carga; guardado antiguo sin campo.
  const p0 = practiceMma(START_FITNESS, { punches: 0, kicks: 0, grappling: 0 });
  assert.deepEqual([p0.gained.punches, p0.gained.kicks, p0.gained.grappling, p0.next.skills?.mma], [0, 0, 0, undefined], 'progreso sin practicar');
  const p1 = practiceMma(START_FITNESS, { punches: 5, kicks: 0, grappling: 3 });
  assert.ok(p1.gained.punches > 0 && p1.gained.kicks === 0 && p1.gained.grappling > 0 && (p1.next.skills?.mma ?? 0) > 0, 'progreso por partes');
  assert.ok(practiceMma(START_FITNESS, { punches: 500, kicks: 0, grappling: 0 }).gained.punches <= 1.5, 'progreso sin tope');
  assert.deepEqual(parseFitness(JSON.parse(JSON.stringify(p1.next))).mma, p1.next.mma, 'el progreso de MMA no se guarda');
  assert.equal(parseFitness({ ...START_FITNESS }).mma, undefined, 'un guardado antiguo gana progreso de MMA');
  assert.deepEqual(parseFitness({ ...START_FITNESS, fights: { mma: { bouts: 2, wins: 1, titles: 0 } } }).fights?.mma, { bouts: 2, wins: 1, titles: 0 });
  // 12. La clase se paga una vez: volver tras recargar en la misma clase no cobra otra.
  const paid = charge(academy, NO_MEMBERSHIP, 50, 18 * 60 + 2); assert.ok(paid.ok && paid.money === 50 - academy.fee);
  const again = charge(academy, paid.membership, paid.money, 18 * 60 + 20); assert.ok(again.ok && again.via === 'paid' && again.money === paid.money, 'cobra dos veces la misma clase');
}

assert.equal(parseEntries({ boxing:{stage:'inventado',day:1} }),undefined);
const transitions:boolean[]=[];
const pause=new SimulationPause(p=>transitions.push(p));
pause.set('menu',true); pause.set('hidden',true); pause.set('hidden',false);
assert.equal(pause.paused,true); assert.deepEqual(transitions,[true]);
pause.set('menu',false); assert.deepEqual(transitions,[true,false]);
console.log('QA-08 PASS: '+bouts+' combates completos, seis ataques con ambas extremidades, guardia, alcance, rival, puntos, resultados, cuadro y premio único, save antiguo, reserva y pausas anidadas. MMA: jab/directo por mano, patadas con las dos piernas, clinch sólo a distancia, derribo, suelo, fijación, escape y soltarse; progreso sólo de lo practicado.');
