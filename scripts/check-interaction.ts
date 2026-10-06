// Interacción (systems/Interaction.ts, systems/DialogueSystem.ts, systems/PlayerInput.ts) con los mismos datos que el juego: `npm run check`.
// Qué se ofrece (alcance, paredes, delante, tipo, id; nunca el orden), que todo lo interactuable de todos los mapas se pueda
// alcanzar, cómo se sale de una charla (Esc, «Volver», despedida), que no se abran dos cosas a la vez y que el móvil haga lo mismo.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TILE } from '../src/config/constants.ts';
import { getCatalog } from '../src/data/catalogs.ts';
import { KIND_OF } from '../src/systems/Fitness.ts';
import { allLocations, doorRow, solidMask } from '../src/systems/LocationSystem.ts';
import { seatsIn } from '../src/systems/Seating.ts';
import { INTERACTION, PRIORITY, pickTarget, wallBetween, type Candidate } from '../src/systems/Interaction.ts';
import { DialogueSystem } from '../src/systems/DialogueSystem.ts';
import { PlayerInput } from '../src/systems/PlayerInput.ts';
import { purchase, payFare } from '../src/systems/Commerce.ts';
import { destinationsFrom, getStop } from '../src/systems/Transit.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import type { Facing, LocationDef } from '../src/types/game.ts';

const C = TILE / 2;
const FACINGS: Facing[] = ['up', 'down', 'left', 'right'];
const src = (p: string): string => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

/** Lo que WorldScene reúne de un mapa (sus mismos tipos y posiciones), sin personas. */
function candidatesOf(loc: LocationDef): Candidate[] {
  const out: Candidate[] = [];
  for (const p of loc.portals) if (!p.train) out.push({ id: `portal:${p.id}`, kind: 'portal', x: p.tx * TILE + C, y: p.ty * TILE + C });
  for (const i of loc.inspects ?? []) out.push({ id: `inspect:${i.name}@${i.tx},${i.ty}`, kind: 'inspect', x: i.tx * TILE + C, y: i.ty * TILE + C });
  for (const b of loc.buildings ?? []) if (b.inspect && b.doorX !== undefined) out.push({ id: `inspect:${b.id}`, kind: 'inspect', x: b.doorX * TILE + C, y: doorRow(b) * TILE + C });
  for (const r of loc.racks ?? []) out.push({ id: `rack:${r.name}@${r.tx},${r.ty}`, kind: 'rack', x: r.tx * TILE + C, y: r.ty * TILE + C });
  for (const t of loc.terminals ?? []) out.push({ id: `terminal:${t.name}@${t.tx},${t.ty}`, kind: 'terminal', x: t.tx * TILE + C, y: t.ty * TILE + C });
  for (const s of loc.spots ?? []) out.push({ id: `spot:${s.name}@${s.tx},${s.ty}`, kind: 'spot', x: s.tx * TILE + C, y: s.ty * TILE + C });
  for (const [id, p] of Object.entries(loc.points ?? {})) if (p.use && KIND_OF[p.use]) out.push({ id: `station:${id}`, kind: 'station', x: p.tx * TILE + C, y: p.ty * TILE + C });
  for (const s of seatsIn(loc)) out.push({ id: `seat:${s.id}`, kind: 'seat', x: s.tx * TILE + C, y: s.ty * TILE + C });
  return out;
}

// -------------------------------------------- 1. todo lo interactuable se puede alcanzar (sin avisos ocultos)

let total = 0;
let positions = 0;
for (const loc of allLocations()) {
  const cands = candidatesOf(loc);
  assert.equal(new Set(cands.map((c) => c.id)).size, cands.length, `${loc.id}: ids repetidos entre candidatos`);
  const mask = solidMask(loc);
  const wins = new Map<string, number>();
  for (let ty = 0; ty < loc.ground.length; ty++) {
    for (let tx = 0; tx < loc.ground[0].length; tx++) {
      if (mask[ty][tx]) continue;
      for (const ox of [2, 8, 14]) {
        for (const oy of [2, 8, 15]) {
          const origin = { x: tx * TILE + ox, y: ty * TILE + oy - 8 };
          for (const facing of FACINGS) {
            const best = pickTarget(origin, cands, { facing, blocked: (c) => wallBetween(loc, origin, c) });
            if (!best) continue;
            wins.set(best.id, (wins.get(best.id) ?? 0) + 1);
            positions++;
            // Lo que se ofrece está al alcance y sin pared por medio, sea quien sea.
            assert.ok(Math.hypot(best.x - origin.x, best.y - origin.y) < INTERACTION.range, `${loc.id}: ${best.id} fuera de alcance`);
            assert.ok(!wallBetween(loc, origin, best), `${loc.id}: ${best.id} ofrecido a través de una pared`);
          }
        }
      }
    }
  }
  for (const c of cands) {
    total++;
    assert.ok(wins.has(c.id), `${loc.id}: ${c.id} no se ofrece desde ningún sitio (aviso oculto o tapado por otro)`);
  }
}

// ------------------------------------------------ 2. la elección no depende del orden ni del azar

{
  const rng = seededRng(7);
  const shuffle = <T,>(xs: readonly T[]): T[] => xs.map((x) => [rng(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);
  let checked = 0;
  for (const loc of allLocations()) {
    const cands = candidatesOf(loc);
    if (cands.length < 2) continue;
    const mask = solidMask(loc);
    for (let ty = 0; ty < loc.ground.length; ty += 2) {
      for (let tx = 0; tx < loc.ground[0].length; tx += 2) {
        if (mask[ty][tx]) continue;
        const origin = { x: tx * TILE + 8, y: ty * TILE + 4 };
        const facing = FACINGS[(tx + ty) % 4];
        const opts = { facing, blocked: (c: Candidate) => wallBetween(loc, origin, c) };
        const first = pickTarget(origin, cands, opts)?.id ?? null;
        for (let k = 0; k < 4; k++) assert.equal(pickTarget(origin, shuffle(cands), opts)?.id ?? null, first, `${loc.id} ${tx},${ty}: la elección cambia con el orden`);
        checked++;
      }
    }
  }
  assert.ok(checked > 500, `muy pocos puntos comprobados (${checked})`);

  // Empate exacto entre tipos: manda la prioridad (salir > hablar > usar > sentarse > mirar), no la lista.
  const kinds = Object.keys(PRIORITY) as (keyof typeof PRIORITY)[];
  for (const a of kinds) {
    for (const b of kinds) {
      if (a === b) continue;
      const pair: Candidate[] = [{ id: 'b', kind: b, x: 20, y: 0 }, { id: 'a', kind: a, x: -20, y: 0 }];
      const want = PRIORITY[a] < PRIORITY[b] ? 'a' : 'b';
      assert.equal(pickTarget({ x: 0, y: 0 }, pair)?.id, want, `empate ${a}/${b}: no manda la prioridad`);
      assert.equal(pickTarget({ x: 0, y: 0 }, [...pair].reverse())?.id, want, `empate ${a}/${b}: depende del orden`);
    }
  }
  // Mismo tipo y misma distancia: manda el id (siempre el mismo), no el orden.
  const same: Candidate[] = [{ id: 'zeta', kind: 'seat', x: 12, y: 0 }, { id: 'alfa', kind: 'seat', x: -12, y: 0 }];
  assert.equal(pickTarget({ x: 0, y: 0 }, same)?.id, 'alfa');
  assert.equal(pickTarget({ x: 0, y: 0 }, [...same].reverse())?.id, 'alfa');
  // Delante gana a detrás con distancias casi iguales (y la distancia manda cuando la diferencia es grande).
  const near: Candidate[] = [{ id: 'detras', kind: 'terminal', x: -10, y: 0 }, { id: 'delante', kind: 'terminal', x: 12, y: 0 }];
  assert.equal(pickTarget({ x: 0, y: 0 }, near, { facing: 'right' })?.id, 'delante');
  assert.equal(pickTarget({ x: 0, y: 0 }, near, { facing: 'left' })?.id, 'detras');
  const far: Candidate[] = [{ id: 'cerca', kind: 'terminal', x: -5, y: 0 }, { id: 'lejos', kind: 'terminal', x: 24, y: 0 }];
  assert.equal(pickTarget({ x: 0, y: 0 }, far, { facing: 'right' })?.id, 'cerca', 'lo de delante no puede ganar a lo mucho más cerca');
  // Estable: el que ya se ofrecía no se pierde por un par de píxeles, pero sí por mucho.
  const duo: Candidate[] = [{ id: 'uno', kind: 'inspect', x: -13, y: 0 }, { id: 'dos', kind: 'inspect', x: 11, y: 0 }];
  assert.equal(pickTarget({ x: 0, y: 0 }, duo)?.id, 'dos');
  assert.equal(pickTarget({ x: 0, y: 0 }, duo, { current: duo[0] })?.id, 'uno', 'el aviso parpadea');
  assert.equal(pickTarget({ x: 8, y: 0 }, duo, { current: duo[0] })?.id, 'dos', 'se queda pegado a lo que ya no es lo mejor');
  console.log(`${total} interactuables en ${allLocations().length} mapas, todos alcanzables (${positions} posiciones) · ${checked} puntos sin depender del orden · prioridades, delante y estabilidad OK`);
}

// -------------------------------------------------------------- 3. alcance y paredes

{
  const R = INTERACTION.range;
  const one = (x: number): Candidate[] => [{ id: 'x', kind: 'terminal', x, y: 0 }];
  assert.equal(pickTarget({ x: 0, y: 0 }, one(R - 0.5))?.id, 'x', 'dentro del alcance');
  assert.equal(pickTarget({ x: 0, y: 0 }, one(R + 0.5)), null, 'fuera del alcance');
  for (const kind of Object.keys(PRIORITY) as (keyof typeof PRIORITY)[]) assert.equal(pickTarget({ x: 0, y: 0 }, [{ id: 'k', kind, x: R + 1, y: 0 }]), null, `${kind}: otro alcance`);
  // Un mapa de mentira: dos salas separadas por una pared (columna 4), con agua en la de la derecha.
  const room = {
    id: 'wall-test',
    ground: ['WWWWWWWWWW', 'WfffWfffWW', 'WfffWfffWW', 'WfffWaaffW', 'WWWWWWWWWW'],
    buildings: [],
  } as unknown as LocationDef;
  const at = (tx: number, ty: number) => ({ x: tx * TILE + C, y: ty * TILE + C });
  assert.ok(wallBetween(room, at(3, 1), at(5, 1)), 'una pared no tapa');
  assert.ok(!wallBetween(room, at(1, 1), at(3, 1)), 'la sala vacía tapa');
  // Una cartelera en la pared: se ve desde el suelo de al lado (su tile no cuenta).
  assert.ok(!wallBetween(room, at(3, 1), at(4, 1)), 'lo que vive en la pared queda tapado por ella');
  // El agua se ve a través.
  assert.ok(!wallBetween(room, at(5, 3), at(7, 3)), 'el agua tapa');
  // Una fachada de edificio (su huella) tapa.
  const hall = { id: 'hall-test', ground: ['fffffff', 'fffffff', 'fffffff', 'fffffff'], buildings: [{ id: 'b', tx: 2, ty: 0, w: 3, h: 2 }] } as unknown as LocationDef;
  assert.ok(wallBetween(hall, at(1, 0), at(6, 0)), 'la fachada no tapa');
  assert.ok(!wallBetween(hall, at(1, 3), at(6, 3)), 'el suelo libre tapa');
  console.log('alcance único para todos los tipos · pared, agua, cartel en pared y fachada OK');
}

// ----------------------------------------------- 4. cómo se sale: despedirse, volver, cancelar

{
  const log: string[] = [];
  const d = new DialogueSystem();
  d.on('open', () => log.push('open'));
  d.on('close', () => log.push('close'));

  // Charla sin opciones: E avanza y cierra; Esc cierra en cualquier línea.
  d.start('Ana', ['uno', 'dos', 'tres']);
  assert.ok(d.isOpen && d.canCancel);
  d.start('Otra', ['no']); // dos a la vez: la segunda se ignora
  assert.equal(log.filter((l) => l === 'open').length, 1, 'dos charlas a la vez');
  d.advance();
  assert.ok(d.cancel(), 'Esc no cierra una charla');
  assert.ok(!d.isOpen && !d.canCancel);
  assert.equal(d.cancel(), false, 'Esc sin charla hace algo');
  d.start('Ana', ['uno', 'dos']);
  d.advance();
  d.advance();
  assert.ok(!d.isOpen, 'E en la última línea no cierra');

  // Pregunta con despedida: Esc elige la despedida (también antes de ver las opciones) y la tecla del número, la suya.
  const picks: number[] = [];
  d.ask('Evento', ['mira', 'decide'], ['Mirar', 'Hablar', 'Irse'], (i) => picks.push(i), 2);
  assert.ok(d.canCancel);
  assert.equal(d.choices.length, 0);
  assert.ok(d.cancel());
  assert.deepEqual(picks, [2], 'Esc no elige la despedida');
  assert.ok(!d.isOpen);
  d.ask('Evento', ['x'], ['Mirar', 'Hablar', 'Irse'], (i) => picks.push(i), 2);
  d.choose(0);
  assert.deepEqual(picks, [2, 0]);
  assert.ok(!d.isOpen);
  d.ask('Evento', ['x'], ['Mirar', 'Irse'], (i) => picks.push(i), 9);
  assert.ok(!d.canCancel, 'una despedida que no existe cuenta como cancelable');
  d.close();

  // Pregunta sin despedida (una decisión: un evento del metro): Esc no la salta, y se puede responder.
  d.ask('Metro', ['te piden algo'], ['Dar', 'Negar'], (i) => picks.push(i));
  assert.ok(!d.canCancel);
  assert.equal(d.cancel(), false, 'Esc salta una decisión');
  assert.ok(d.isOpen);
  d.choose(1);
  assert.deepEqual(picks, [2, 0, 1]);
  // Una pregunta mientras hay otra abierta se ignora (no se pisan).
  d.ask('A', ['a'], ['1'], () => picks.push(100));
  d.ask('B', ['b'], ['1'], () => picks.push(200));
  d.choose(0);
  assert.deepEqual(picks.slice(3), [100]);
  // «once» y «off»: nada de escuchas que se queden colgadas tras cerrar.
  let after = 0;
  d.start('Ana', ['x']);
  d.once('close', () => after++);
  d.close();
  d.start('Ana', ['x']);
  d.close();
  assert.equal(after, 1, 'once se dispara más de una vez');
  const fn = (): number => log.push('x');
  d.on('close', fn);
  d.off('close', fn);
  const before = log.length;
  d.start('Ana', ['x']);
  d.close();
  assert.equal(log.length, before + 2, 'una escucha soltada sigue sonando');
  console.log('charla: Esc cierra, la pregunta con despedida la elige, una decisión no se salta, nada se abre dos veces ni deja escuchas');
}

// ------------------------------------------------------- 5. el móvil hace lo mismo que el teclado

{
  const input = new PlayerInput();
  // Una pulsación (botón táctil) se lee una vez; la que nadie lee a tiempo no se guarda para después (un toque sobre un diálogo recién cerrado).
  input.press('interact');
  assert.ok(input.consume('interact'));
  assert.ok(!input.consume('interact'), 'una pulsación se lee dos veces');
  input.release('interact');
  input.press('cancel');
  input.beginFrame();
  input.beginFrame();
  assert.ok(!input.consume('cancel'), 'una pulsación vieja se guarda para después');
  // Mantener el botón no repite la acción (sólo la pulsación nueva).
  input.release('cancel');
  input.press('interact');
  input.consume('interact');
  input.press('interact');
  assert.ok(!input.consume('interact'), 'mantener pulsado repite la acción');
  // El stick hace de flechas igual que el teclado, y soltarlo no deja nada pulsado.
  input.setStick(0, -1);
  assert.ok(input.isHeld('up'));
  input.releaseAll();
  assert.ok(!input.isHeld('up') && input.stick.x === 0 && input.stick.y === 0, 'releaseAll deja algo pulsado');

  // Lo que el bucle de WorldScene ofrece en cada modo (el texto de arriba lo lee ui/MobileControls): «Volver» donde Esc hace algo.
  const scene = src('scenes/WorldScene.ts');
  assert.ok(/back: !!this\.chatEnd \|\| dialogue\.canCancel/.test(scene), 'sin «Volver» en el móvil durante una charla');
  assert.ok(/'Levantarse', back: true/.test(scene), 'sin «Volver» en el móvil sentado');
  assert.ok(/action: 'Elegir', back: true/.test(scene), 'sin «Volver» en el móvil en un menú');
  // Teclado y táctil entran por el mismo pressedAny y todo lo que lee Esc lee 'cancel'.
  const cancels = (scene.match(/pressedAny\(\[[^\]]*\]\)/g) ?? []).filter((c) => c.includes("'cancel'"));
  assert.ok(cancels.length >= 5, `Esc se lee en ${cancels.length} sitios`);
  assert.ok(cancels.every((c) => c.includes("'cancelAlt'")), `un Esc sin su tecla alternativa (Q): ${cancels.filter((c) => !c.includes("'cancelAlt'"))}`);
  const touch = src('ui/MobileControls.ts');
  assert.ok(/bindButton\(this\.action, 'interact'\)/.test(touch) && /bindButton\(this\.back, 'cancel'\)/.test(touch), 'el botón táctil no es E / Esc');
  // Nada de interacción duplicada: un solo sitio decide qué se ofrece.
  assert.ok(!/INTERACT_RADIUS/.test(scene), 'WorldScene vuelve a tener su propio alcance');
  assert.equal((scene.match(/pickTarget\(/g) ?? []).length, 1, 'más de un selector de objetivo');
  // Al cambiar de escena no queda nada abierto ni pulsado.
  const shutdown = scene.slice(scene.indexOf('Phaser.Scenes.Events.SHUTDOWN'));
  for (const what of ['dialogue.close()', 'menu.close()', 'input.releaseAll()', 'endTalk']) assert.ok(shutdown.slice(0, 1200).includes(what), `al cambiar de escena no se limpia ${what}`);
  console.log('móvil: una pulsación se lee una vez, no se guarda para después, «Volver» donde Esc hace algo, un solo selector, limpieza al cambiar de escena');
}

// ----------------------------------------------------- 6. recorridos tipo: comprar, viajar, cancelar

{
  // Tienda: se ofrece el mostrador, se compra y se sale sin tocar nada más.
  const cafe = allLocations().find((l) => (l.terminals ?? []).some((t) => t.catalog === 'cafe-counter'))!;
  const till = cafe.terminals!.find((t) => t.catalog === 'cafe-counter')!;
  const cands = candidatesOf(cafe);
  const origin = { x: till.tx * TILE + C, y: till.ty * TILE + TILE + 4 - 8 };
  const offered = pickTarget(origin, cands, { facing: 'up', blocked: (c) => wallBetween(cafe, origin, c) });
  assert.ok(offered && offered.kind === 'terminal', `delante del mostrador se ofrece ${offered?.id}`);
  const wallet = { money: 30, inventory: {}, cards: {} };
  const product = getCatalog('cafe-counter').products[0];
  const bought = purchase(wallet, product);
  assert.ok(bought.ok && bought.wallet.money === wallet.money - product.price, 'comprar no cobra');
  assert.equal(wallet.money, 30, 'la compra toca el monedero original');

  // Metro: elegir destino, cancelar (no se paga ni se mueve nada) y luego viajar (se paga una vez).
  const dest = destinationsFrom(getStop('vallesco'))[0];
  const card = { money: 5, inventory: {}, cards: { transport: 10 } };
  const paid = payFare(card, 'transport', dest.fare);
  assert.ok(paid.ok && paid.wallet.cards.transport === 10 - dest.fare, 'viajar no cobra la tarifa');
  assert.equal(card.cards.transport, 10, 'pagar toca la tarjeta original (cancelar ya no podría deshacerse)');
  assert.ok(!payFare({ money: 5, inventory: {}, cards: { transport: 0 } }, 'transport', dest.fare).ok, 'viajar sin saldo');
  console.log('recorridos: mostrador ofrecido y compra sin efectos de más · metro: cancelar no cobra, viajar cobra una vez, sin saldo se niega');
}

console.log('\nOK: una sola regla decide qué se ofrece, todo se alcanza, nada a través de paredes, se sale de cualquier charla y el móvil es igual.');
