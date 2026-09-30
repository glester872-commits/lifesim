// Gestos de ambiente: la misma lógica que pintan world/CrowdView y WorldScene
// (systems/AmbientActions.ts con data/ambientActions.ts), sin Phaser.
import assert from 'node:assert/strict';
import { AMBIENT_ACTIONS, registerAmbientAction, type AmbientActionDef, type AmbientContext, type AmbientPosture } from '../src/data/ambientActions.ts';
import {
  AmbientDirector, ambientFrame, ambientSituation, ambientWeights, chooseAmbient, dayPart, hasTrait, type AmbientSubject,
} from '../src/systems/AmbientActions.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { stride, type Agent } from '../src/systems/Crowd.ts';

const HOURS = { morning: 8.5, afternoon: 16, evening: 21, night: 1.5 } as const;
const base = (over: Partial<AmbientSubject> = {}): AmbientSubject => ({ seed: 1, posture: 'stand', context: 'idle', outdoor: true, tags: [], ...over });
/** Proporción de elecciones de `id` en muchas personas distintas. */
function share(id: string, over: Partial<AmbientSubject>, hour: number, people = 4_000): number {
  const rng = seededRng(7);
  let hits = 0;
  for (let seed = 0; seed < people; seed++) if (chooseAmbient(base({ ...over, seed }), hour, rng)?.id === id) hits++;
  return hits / people;
}

// ------------------------------------------------------------ el registro
{
  const ids = new Set<string>();
  for (const def of AMBIENT_ACTIONS) {
    assert.ok(!ids.has(def.id), `gesto repetido: ${def.id}`);
    ids.add(def.id);
    assert.ok(def.loop.length > 0, `${def.id}: sin bucle`);
    assert.ok(def.total[0] > 0 && def.total[0] <= def.total[1], `${def.id}: duración`);
    for (const step of [...(def.intro ?? []), ...def.loop, ...(def.outro ?? [])]) {
      assert.ok(step.ms[0] > 0 && step.ms[0] <= step.ms[1], `${def.id}/${step.name}: duración del tramo`);
      assert.equal(!!step.prop, !!step.at, `${def.id}/${step.name}: lo que lleva necesita sitio (y al revés)`);
      for (const pose of [step.pose, step.sitPose]) assert.ok(pose === undefined || ![8, 9, 10, 27, 28, 29, 30, 31].includes(pose), `${def.id}: pose de pelea`);
    }
  }
  // Nadie se queda sin nada que hacer: cada situación posible tiene algún gesto, dentro y fuera, a cualquier hora.
  const situations: [AmbientPosture, AmbientContext][] = [
    ['sit', 'eat'], ['sit', 'drink'], ['sit', 'read'], ['sit', 'wait'], ['sit', 'talk'], ['sit', 'rest'],
    ['stand', 'wait'], ['stand', 'talk'], ['stand', 'idle'], ['stand', 'browse'], ['walk', 'walk'],
  ];
  for (const [posture, context] of situations) {
    for (const outdoor of [true, false]) {
      for (const hour of Object.values(HOURS)) {
        assert.ok(ambientWeights(base({ posture, context, outdoor }), hour).length > 0, `sin gesto: ${posture}/${context} ${outdoor ? 'fuera' : 'dentro'} a las ${hour}`);
      }
    }
  }
}

// ------------------------------------------- qué admite gesto y qué no
{
  // Las máquinas del gimnasio, bailar, jalear, la cena servida, la barra y trotar se quedan como están.
  for (const busy of ['treadmill', 'bench', 'squat', 'bike', 'row', 'curl', 'cable', 'lift', 'stretch', 'dance', 'cheer', 'dine', 'sip']) {
    assert.equal(ambientSituation(busy, undefined, false), undefined, `${busy} admite gesto`);
  }
  assert.equal(ambientSituation('run', undefined, true), undefined, 'trotando admite gesto');
  assert.deepEqual(ambientSituation('idle', 'BROWSE', false), { posture: 'stand', context: 'browse' });
  assert.deepEqual(ambientSituation('drink', 'DRINK', false), { posture: 'sit', context: 'drink' });
}

// --------------------------------------------------------------- fumar
{
  let smokers = 0;
  for (let seed = 0; seed < 10_000; seed++) if (hasTrait('smoker', seed)) smokers++;
  assert.ok(smokers > 1_700 && smokers < 2_300, `fuma el ${smokers / 100} %`);
  let clubSmokers = 0;
  for (let seed = 0; seed < 10_000; seed++) if (hasTrait('smoker', seed, 'club-smoke')) clubSmokers++;
  assert.ok(clubSmokers > 7_000, 'quien sale a tomar el aire de la discoteca casi siempre fuma');

  for (let seed = 0; seed < 3_000; seed++) {
    for (const hour of Object.values(HOURS)) {
      for (const [posture, context] of [['stand', 'idle'], ['sit', 'drink'], ['walk', 'walk']] as const) {
        const indoor = ambientWeights(base({ seed, posture, context, outdoor: false }), hour);
        assert.ok(!indoor.some(([d]) => d.id.startsWith('smoke')), 'se fuma dentro de un local');
        const out = ambientWeights(base({ seed, posture, context }), hour);
        if (!hasTrait('smoker', seed)) assert.ok(!out.some(([d]) => d.trait === 'smoker'), 'fuma quien no fuma');
      }
    }
  }
  const morning = share('smoke', {}, HOURS.morning);
  const night = share('smoke', {}, HOURS.night);
  const club = share('smoke', { tags: ['nightlife'], role: 'club-smoke' }, HOURS.night);
  assert.ok(morning > 0 && night > morning * 2, `de noche se fuma más (${morning.toFixed(3)} → ${night.toFixed(3)})`);
  assert.ok(club > 0.4, `a la puerta de la discoteca se fuma mucho (${club.toFixed(2)})`);

  // La secuencia: sacar, encender, soltar, (con la mano / calada / soltar)…, apagar, y en ese orden.
  const def = AMBIENT_ACTIONS.find((a) => a.id === 'smoke')!;
  const choice = { def, start: 0, total: 16_000, seed: 42 };
  const names: string[] = [];
  let puffs = 0;
  let lastKey = '';
  for (let t = 0; t <= 16_000; t += 20) {
    const f = ambientFrame(choice, t);
    assert.deepEqual(ambientFrame(choice, t), f, 'el gesto cambia al volver a pedirlo');
    if (f.key !== lastKey) {
      names.push(f.step.name);
      if (f.step.puff) puffs++;
      lastKey = f.key;
    }
  }
  assert.deepEqual(names.slice(0, 3), ['sacar el cigarro', 'encenderlo', 'soltar el humo']);
  assert.deepEqual(names.slice(-2), ['apagarlo', 'quieto']);
  const middle = names.slice(3, -2);
  const cycle = ['con el cigarro en la mano', 'dar una calada', 'soltar el humo'];
  middle.forEach((n, i) => assert.equal(n, cycle[i % 3], 'las caladas se desordenan'));
  assert.ok(middle.filter((n) => n === 'dar una calada').length >= 2, 'menos de dos caladas');
  assert.ok(puffs >= 4, 'casi sin humo');
}

// ------------------------------------------------------- hora del día
{
  assert.equal(dayPart(8), 'morning');
  assert.equal(dayPart(15), 'afternoon');
  assert.equal(dayPart(21), 'evening');
  assert.equal(dayPart(2), 'night');
  const walk = { posture: 'walk', context: 'walk' } as const;
  assert.ok(share('coffee-walk', { ...walk, role: 'commuter' }, HOURS.morning) > 0.2, 'por la mañana no hay café para llevar');
  assert.equal(share('coffee-walk', { ...walk, role: 'commuter' }, HOURS.night), 0, 'café para llevar de madrugada');
  assert.ok(share('bags', { ...walk, role: 'shopper' }, HOURS.afternoon) > 0.5, 'quien sale de las tiendas no lleva bolsas');
  assert.equal(share('bags', { ...walk, role: 'passer' }, HOURS.afternoon), 0, 'bolsas sin haber comprado');
  assert.equal(share('bags', { ...walk, role: 'shopper' }, HOURS.night), 0, 'bolsas de madrugada');
  assert.ok(share('stretch', {}, HOURS.morning) > share('stretch', {}, HOURS.night), 'se estira más por la mañana');
}

// ------------------------------------------------------ la terraza
{
  const terrace = { posture: 'sit', context: 'drink', tags: ['food'] } as const;
  assert.equal(share('chat', terrace, HOURS.afternoon), 0, 'charla de cara sin nadie al lado');
  const together = share('chat', { ...terrace, companion: 'right' }, HOURS.evening);
  assert.ok(together > 0.25, `en pareja casi no se miran (${together.toFixed(2)})`);
  const chat = AMBIENT_ACTIONS.find((a) => a.id === 'chat')!;
  assert.ok(chat.loop.some((s) => s.look === 'companion'), 'la charla no se gira hacia quien acompaña');
  const seen = new Set<string>();
  const rng = seededRng(3);
  for (let seed = 0; seed < 2_000; seed++) seen.add(chooseAmbient(base({ ...terrace, seed, companion: 'left' }), HOURS.evening, rng)!.id);
  for (const id of ['sip', 'chat', 'phone', 'smoke', 'look-around']) assert.ok(seen.has(id), `en la terraza nadie hace ${id}`);
}

// ------------------------------------------------- no decidir cada frame
{
  let clock = 0;
  const director = new AmbientDirector(() => 20);
  const agents = 40;
  let calls = 0;
  for (let frame = 0; frame < 60 * 60; frame++, clock += 1000 / 60) {
    for (let id = 0; id < agents; id++) {
      calls++;
      const choice = director.at(id, 'sit|drink|CAFE_TERRACE_1', clock, () => base({ seed: id, posture: 'sit', context: 'drink', companion: id % 2 ? 'left' : undefined }));
      assert.ok(choice, 'alguien sin gesto en la terraza');
    }
  }
  assert.ok(director.decisions < calls * 0.01, `decide demasiado: ${director.decisions} de ${calls}`);
  // Quien aparece ya va a mitad de un gesto; quien cambia de situación empieza desde el principio.
  const fresh = new AmbientDirector(() => 12);
  const first = fresh.at('x', 'stand|idle|', 50_000, () => base())!;
  assert.ok(first.start <= 50_000, 'aparece en el futuro');
  const changed = fresh.at('x', 'sit|rest|BENCH_1', 50_100, () => base({ posture: 'sit', context: 'rest' }))!;
  assert.equal(changed.start, 50_100, 'al sentarse no empieza de cero');
  fresh.forget('x');
  assert.equal(fresh.size, 0, 'olvidar no olvida');
}

// ------------------------------------------------ arrancar y frenar al andar
{
  const a = { speed: 2, moving: false } as Agent;
  const full = (2 * 16) / 1000;
  const first = stride(a, 16, Infinity);
  a.moving = true;
  assert.ok(first < full * 0.5, 'arranca de golpe a paso de crucero');
  let last = first;
  for (let i = 0; i < 30; i++) last = stride(a, 16, Infinity);
  assert.ok(Math.abs(last - full) < 1e-9, 'no llega a su paso');
  assert.ok(stride(a, 16, 0.1) < full * 0.6, 'no frena antes de pararse');
  a.moving = false;
  assert.ok(stride(a, 16, Infinity) < full * 0.5, 'tras pararse no vuelve a arrancar despacio');
}

// ------------------------------------------- un gesto nuevo sin tocar nada más
{
  const laptop: AmbientActionDef = {
    id: 'test-laptop', label: 'Con el portátil', postures: ['sit'], contexts: ['rest'], weight: 1_000, total: [5_000, 8_000],
    loop: [{ name: 'tecleando', ms: [1_000, 2_000], prop: 'book', at: 'lap' }],
  };
  registerAmbientAction(laptop);
  assert.equal(chooseAmbient(base({ posture: 'sit', context: 'rest' }), 15, seededRng(1))?.id, 'test-laptop', 'el gesto registrado no se elige');
  AMBIENT_ACTIONS.splice(AMBIENT_ACTIONS.indexOf(laptop), 1);
}

console.log(`check-ambient: ${AMBIENT_ACTIONS.length} gestos; fumar (fuera, con el rasgo, secuencia completa), hora del día, terraza, programación y registro, OK`);
