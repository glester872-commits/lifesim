// Quien entra por una puerta delante del jugador sigue dentro (systems/Handoff): la calle (StreetLife) apunta a quien
// ve entrar, el local (Crowd) lo tiene dentro con la misma cara, se va a su hora por la puerta y vuelve a la calle por
// la misma; nunca dentro y fuera a la vez, y la cola no crece. `node scripts/check-handoff.ts`.
import assert from 'node:assert/strict';
import { getLocation } from '../src/systems/LocationSystem.ts';
import { Crowd, profileFor, type Clock } from '../src/systems/Crowd.ts';
import { absMinute, enterPlace, handoffs, insideLooks, insideOf, MAX_PER_PLACE, resetHandoffs } from '../src/systems/Handoff.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { findPoint } from '../src/systems/Navigation.ts';
import { placeInfo } from '../src/systems/Places.ts';
import { StreetLife, streetProfileFor } from '../src/systems/StreetLife.ts';

const DAY = 2; // martes
const at = (m: number): Clock => ({ day: DAY + Math.floor(m / 1440), hour: Math.floor((m % 1440) / 60), minute: m % 60 });
const abs = (c: Clock): number => absMinute(c.day, c.hour, c.minute);
const gym = placeInfo('gym')!;
const gymLoc = getLocation(gym.interior!);
const inside = { tx: 3, ty: 3 };

// 1. La calle apunta a quien ve entrar (con el jugador en la puerta del gimnasio) y a nadie que entre lejos.
{
  resetHandoffs();
  const door = findPoint('GYM_ENTRANCE')!;
  const street = new StreetLife(getLocation('district'), streetProfileFor('district')!, seededRng(7));
  const player = { tx: door.tx, ty: door.ty + 2 };
  let clock = at(18 * 60);
  street.populate(clock, player);
  const seen = new Set<string>();
  for (let m = 18 * 60; m < 21 * 60; m++) {
    clock = at(m);
    for (let k = 0; k < 30; k++) street.update((1_000 / 60) * 2, clock, player);
    for (const h of handoffs()) {
      seen.add(h.token);
      const p = findPoint(h.door)!;
      assert.ok(Math.hypot(p.tx - player.tx, p.ty - player.ty) <= 14, `apuntado lejos del jugador: ${h.door}`);
      // Mientras está dentro, en la calle no hay nadie con su cara.
      if (insideOf(h.place, abs(clock)).includes(h)) assert.ok(!street.agents.some((a) => a.look === h.look && a.kind === 'visitor' && !a.vanish), `${h.token} dentro y fuera a la vez`);
    }
    for (const place of new Set(handoffs().map((h) => h.place))) assert.ok(insideOf(place, abs(clock)).length <= MAX_PER_PLACE);
  }
  assert.ok(seen.size > 0, 'en tres horas de tarde nadie entró en un local delante del jugador');
  console.log(`  calle: ${seen.size} entradas vistas cerca de la puerta del gimnasio en 3 h (tope ${MAX_PER_PLACE} por sitio)`);
}

// 2. El gimnasio la tiene dentro: recién llegada en la puerta si se la sigue enseguida, a mitad de lo suyo si se tarda.
{
  resetHandoffs();
  const t0 = 18 * 60;
  const h = enterPlace({ place: 'gym', from: 'district', door: 'GYM_ENTRANCE', look: 11, dressSeed: 4242, role: 'gym-goer', label: 'x', line: 'x', at: abs(at(t0)), roll: 0.5 })!;
  assert.ok(h && !h.transit && h.leaveAt - h.enteredAt >= 45);
  // La sigue enseguida.
  const now = new Crowd(gymLoc, gym, profileFor('gym')!, seededRng(1));
  now.populate(at(t0 + 1), inside);
  const her = now.agents.filter((a) => a.handoff === h.token);
  assert.equal(her.length, 1, 'no está dentro (o está dos veces)');
  assert.equal(her[0].look, 11, 'otra cara');
  assert.equal(her[0].dressSeed, 4242, 'otra ropa');
  const door = gymLoc.portals.find((p) => p.to.location !== gymLoc.id)!;
  assert.deepEqual([her[0].x, her[0].y], [door.tx, door.ty], 'recién llegada: en la puerta');
  // El personal va de uniforme (su índice de cara no se ve): entre la clientela, nadie más con su cara.
  assert.equal(now.agents.filter((a) => a.look === 11 && !a.uniform && !a.npc).length, 1, 'su cara repetida dentro');
  // Entra media hora después: ya está a lo suyo, en un sitio de su plan (no en la puerta, no en una pared).
  const later = new Crowd(gymLoc, gym, profileFor('gym')!, seededRng(2));
  later.populate(at(t0 + 30), inside);
  const busy = later.agents.find((a) => a.handoff === h.token)!;
  assert.ok(busy && busy.point && !(busy.x === door.tx && busy.y === door.ty), 'a la media hora sigue en la puerta');
  // Sale y vuelve a entrar en el mismo minuto: una sola vez.
  const again = new Crowd(gymLoc, gym, profileFor('gym')!, seededRng(3));
  again.populate(at(t0 + 30), inside);
  assert.equal(again.agents.filter((a) => a.handoff === h.token || (a.look === 11 && !a.uniform && !a.npc)).length, 1, 'duplicada al volver a entrar');
  // Se va a su hora por la puerta: el local la ve salir y la ficha lo apunta.
  for (let m = t0 + 30; m < Math.ceil(h.leaveAt) + 45 && h.exitedAt === undefined; m++) for (let k = 0; k < 30; k++) later.update(1_000 / 30, at(m), inside);
  assert.ok(h.exitedAt !== undefined && h.exitedAt <= h.leaveAt + 45, 'no se fue nunca');
  assert.ok(!later.agents.some((a) => a.handoff === h.token));
  console.log(`  gimnasio: en la puerta al minuto, a lo suyo a la media hora, sale a los ${Math.round(h.exitedAt! - h.enteredAt)} min (su hora: ${Math.round(h.leaveAt - h.enteredAt)})`);

  // 3. Vuelve a la calle por la misma puerta, con su cara y su ropa, si el jugador está fuera a tiempo.
  const street = new StreetLife(getLocation('district'), streetProfileFor('district')!, seededRng(9));
  const t = Math.ceil(h.exitedAt!);
  const outClock: Clock = { day: Math.floor(t / 1440) + 1, hour: Math.floor((t % 1440) / 60), minute: t % 60 };
  street.populate(outClock, { tx: 0, ty: 0 });
  street.update(16, outClock, { tx: 0, ty: 0 });
  const back = street.agents.find((a) => a.look === 11 && a.kind === 'visitor');
  const gymDoor = findPoint('GYM_ENTRANCE')!;
  assert.ok(back && Math.hypot(back.x - gymDoor.tx, back.y - gymDoor.ty) < 1.5 && back.dressSeed === 4242, 'no sale por su puerta');
  assert.ok(!handoffs().some((o) => o.token === h.token && !o.done), 'la ficha sigue abierta tras salir');
}

// 4. Lo que no cuadra no se apunta y la cola tiene tope.
{
  resetHandoffs();
  assert.equal(enterPlace({ place: 'home', from: 'district', door: 'X', look: 1, dressSeed: 1, role: '', label: '', line: '', at: 0, roll: 0 }), undefined, 'una casa no tiene traspaso');
  for (let i = 0; i < 20; i++) enterPlace({ place: 'cafe', from: 'district', door: 'CAFE_ENTRANCE', look: i, dressSeed: i, role: '', label: '', line: '', at: 100 + i, roll: 0.5 });
  assert.equal(insideOf('cafe', 125).length, MAX_PER_PLACE, 'tope por sitio');
  // La misma persona en dos sitios: la segunda entrada cierra la primera.
  enterPlace({ place: 'gym', from: 'district', door: 'GYM_ENTRANCE', look: 19, dressSeed: 19, role: '', label: '', line: '', at: 126, roll: 0.5 });
  assert.ok(!insideOf('cafe', 127).some((h) => h.look === 19) && insideOf('gym', 127).some((h) => h.look === 19));
  assert.ok(insideLooks(127).has(19));
  // El metro: se queda hasta su tren y no vuelve a salir por la boca.
  const metro = enterPlace({ place: 'metro-vallesco', from: 'district', door: 'METRO_ENTRANCE', look: 30, dressSeed: 30, role: '', label: '', line: '', at: 200, roll: 0.5 })!;
  assert.ok(metro.transit && metro.interior === 'vallesco-station' && metro.leaveAt - metro.enteredAt <= 10);
  // Pasado el tiempo, la cola se vacía sola.
  enterPlace({ place: 'cafe', from: 'district', door: 'CAFE_ENTRANCE', look: 50, dressSeed: 50, role: '', label: '', line: '', at: 5_000, roll: 0 });
  assert.equal(handoffs().length, 1, 'la cola no se vacía');
  resetHandoffs();
}

console.log('check-handoff: la calle apunta a quien ve entrar, el local lo tiene dentro (misma cara y ropa), sale a su hora por su puerta, sin duplicados ni cola infinita, OK');
