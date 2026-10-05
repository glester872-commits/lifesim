// La terraza de Casa Tomás con el mismo servicio de mesa que el comedor (systems/TableService, activado en la calle
// por StreetProfile.tableService): `npm run check`. Falla si el jugador no recibe fuera el mismo flujo que dentro
// (carta, pedido, cocina, entrega, comida, cuenta), si dos camareros atienden una mesa, si levantarse a medias deja la
// mesa o al camarero colgados, o si el camarero atraviesa algo.
import assert from 'node:assert/strict';
import { getLocation, isStandable } from '../src/systems/LocationSystem.ts';
import { placeInfo } from '../src/systems/Places.ts';
import { Crowd, profileFor, type Clock } from '../src/systems/Crowd.ts';
import { StreetLife, streetProfileFor, type Walker } from '../src/systems/StreetLife.ts';
import { TableService, type PlayerCall, type Table } from '../src/systems/TableService.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';

const STEP_MS = 100;
const MS_PER_MIN = 500;
const loc = getLocation('district');
const profile = streetProfileFor('district')!;
const SEAT_1 = 'RESTAURANT_TERRACE_01';
const SEAT_2 = 'RESTAURANT_TERRACE_02';
const PLAYER_TILE = { tx: 40, ty: 17 };

const at = (day: number, hhmm: string): Clock => ({ day, hour: Number(hhmm.slice(0, 2)), minute: Number(hhmm.slice(3)) });
const addMinutes = (c: Clock, m: number): Clock => {
  const total = c.hour * 60 + c.minute + m;
  return { day: c.day + Math.floor(total / 1440), hour: Math.floor((total % 1440) / 60), minute: total % 60 };
};
const stepsFor = (ms: number): number => Math.ceil(ms / STEP_MS);

// ------------------------------------------------ el mismo servicio que dentro
{
  const interior = placeInfo('restaurant')!;
  const crowd = new Crowd(getLocation(interior.interior!), interior, profileFor('restaurant')!, seededRng(1));
  const life = new StreetLife(loc, profile, seededRng(1));
  assert.ok(crowd.service && life.service, 'falta el servicio en el comedor o en la terraza');
  assert.equal(life.service!.menu, crowd.service!.menu, 'la terraza no sirve la misma carta');
  assert.ok(life.service instanceof TableService && crowd.service instanceof TableService);
  assert.deepEqual(life.service!.tables.map((t) => t.def.seats[0]), [SEAT_1, SEAT_2]);
}

/** Una calle en marcha: avanza como el juego (un minuto de reloj cada 500 ms) y comprueba lo de siempre en cada paso. */
class Street {
  readonly life: StreetLife;
  readonly service: TableService;
  clock: Clock;
  readonly calls: PlayerCall[] = [];
  readonly waiterStates = new Set<string>();
  private elapsed = 0;

  constructor(seed: number, hhmm: string) {
    this.life = new StreetLife(loc, profile, seededRng(seed));
    this.clock = at(6, hhmm);
    this.life.populate(this.clock, PLAYER_TILE);
    this.service = this.life.service!;
  }

  waiter(): Walker | undefined {
    return this.life.agents.find((a) => a.kind === 'staff' && a.post?.place === 'restaurant' && !a.vanish);
  }

  table(seat: string): Table {
    return this.service.tableOf(seat)!;
  }

  step(): void {
    this.life.update(STEP_MS, this.clock, PLAYER_TILE);
    this.elapsed += STEP_MS;
    if (this.elapsed >= MS_PER_MIN) {
      this.elapsed -= MS_PER_MIN;
      this.clock = addMinutes(this.clock, 1);
    }
    const w = this.waiter();
    if (w) {
      const s = this.service.waiterState(w.id);
      if (s) this.waiterStates.add(s);
      // Nunca dentro de algo: el camarero va por el suelo, no por mesas, paredes ni sillas.
      assert.ok(isStandable(loc, Math.round(w.x), Math.round(w.y)), `el camarero está dentro de algo en ${w.x.toFixed(1)},${w.y.toFixed(1)}`);
    }
    // Una mesa tiene un solo camarero (y sólo hay uno de turno), y un camarero una sola mesa.
    const held = this.service.tables.filter((t) => t.waiter !== null).map((t) => t.waiter);
    assert.equal(new Set(held).size, held.length, 'un camarero con dos mesas');
    for (const t of this.service.tables) assert.ok(t.waiter === null || t.waiter === w?.id, `la mesa ${t.def.id} tiene un camarero que no es el de turno`);
    assert.equal(this.life.agents.filter((a) => a.kind === 'staff' && a.post?.place === 'restaurant' && !a.vanish).length <= 1, true, 'dos camareros en la terraza');
  }

  /** El jugador hace lo mismo que la escena (WorldScene.tableCall): se sienta, y lo que le pregunten lo contesta `answer`. */
  sit(seat: string, answer: (call: PlayerCall) => void): void {
    this.service.onPlayer = (call) => {
      this.calls.push(call);
      answer(call);
    };
    this.service.seatPlayer(seat);
    // El asiento de quien se sienta es suyo: nadie de la calle lo coge.
    this.life.claim(new Set([seat]));
  }

  stand(): number {
    const owed = this.service.playerStands();
    this.life.claim(new Set());
    return owed;
  }

  runUntil(done: () => boolean, ms: number): void {
    for (let i = 0; i < stepsFor(ms) && !done(); i++) this.step();
  }
}

/** Una calle con el camarero de la terraza de servicio y las dos mesas libres (busca hora y semilla donde las haya). */
function openTerrace(): Street {
  for (const hhmm of ['14:00', '21:00', '13:30', '20:30']) {
    for (let seed = 1; seed <= 40; seed++) {
      const street = new Street(seed, hhmm);
      if (street.waiter() && street.service.tables.every((t) => t.party === null)) return street;
    }
  }
  throw new Error('no hay forma de abrir la terraza con las mesas libres');
}

const orderBoth = (street: Street) => (call: PlayerCall): void => {
  if (call.kind === 'order') {
    const food = call.items.find((i) => i.kind === 'food');
    const drink = call.items.find((i) => i.kind === 'drink');
    assert.ok(food && drink, 'la carta de la terraza no tiene comida y bebida');
    street.service.playerOrder([food, drink]);
  } else if (call.kind === 'bill') street.service.playerPay();
};

// ------------------------------------------------ sentarse en terraza: carta, comida, bebida, cuenta
{
  const street = openTerrace();
  const t = street.table(SEAT_1);
  street.sit(SEAT_1, orderBoth(street));
  assert.equal(t.party, -1, 'la mesa de terraza no es del jugador');
  assert.equal(t.state, 'OCCUPIED');
  assert.equal(street.service.playerStatus(), 'Esperando a que te atiendan');
  const seen: string[] = [t.state];
  for (let i = 0; i < stepsFor(400_000) && t.state !== 'PAID'; i++) {
    street.step();
    if (seen[seen.length - 1] !== t.state) seen.push(t.state);
    // Acabada la ronda, el jugador pide la cuenta desde la mesa (la escena lo hace con E: TableService.playerAsk).
    if (t.state === 'ROUND_DONE') street.service.playerAsk('bill');
  }
  assert.deepEqual(seen, ['OCCUPIED', 'WAITING_TO_ORDER', 'ORDERED', 'SERVED', 'ROUND_DONE', 'WAITING_TO_PAY', 'PAID'], `flujo de la mesa: ${seen.join(' → ')}`);
  // 'finished' llega por cada plato o bebida que se acaba (la energía se cuenta al terminar cada cosa): se juntan los seguidos.
  assert.deepEqual(street.calls.map((c) => c.kind).filter((k, i, all) => k !== all[i - 1]), ['order', 'served', 'finished', 'bill'], 'lo que ve el jugador');
  for (const s of ['GOING_TO_TABLE', 'TAKING_ORDER', 'GOING_TO_KITCHEN', 'WAITING_FOR_ORDER', 'DELIVERING_ORDER', 'SERVING', 'TAKING_PAYMENT']) {
    assert.ok(street.waiterStates.has(s), `el camarero de la terraza nunca estuvo en ${s}`);
  }
  assert.ok(t.plates.length >= 2, 'no se sirvió comida y bebida');
  assert.equal(street.life.pathFailures, 0, 'rutas no encontradas');
  // Pagó: se levanta sin deber nada y la mesa se recoge y queda libre.
  assert.equal(street.stand(), 0);
  street.runUntil(() => t.state === 'AVAILABLE', 60_000);
  assert.equal(t.state, 'AVAILABLE', 'la mesa no se recoge');
  assert.equal(t.waiter, null);
  assert.equal(street.service.playerStatus(), null);
}

// ------------------------------------------------ levantarse antes de que llegue el camarero
{
  const street = openTerrace();
  const t = street.table(SEAT_1);
  street.sit(SEAT_1, () => assert.fail('el camarero atendió a quien ya se había ido'));
  street.runUntil(() => t.state === 'WAITING_TO_ORDER' && t.waiter !== null, 120_000);
  assert.equal(t.state, 'WAITING_TO_ORDER');
  assert.notEqual(t.waiter, null, 'el camarero no sale a atender la mesa de la terraza');
  const w = street.waiter()!;
  assert.equal(street.service.waiterState(w.id), 'GOING_TO_TABLE');
  // Se levanta con el camarero de camino.
  assert.equal(street.stand(), 0, 'cobra una mesa sin pedir nada');
  // Una hora de reloj: le sobra para volver (unos cinco minutos) y no cruza el fin de su turno, que lo mete dentro.
  street.runUntil(() => false, 30_000);
  assert.equal(t.state, 'AVAILABLE');
  assert.equal(t.party, null);
  assert.equal(t.waiter, null, 'la mesa abandonada sigue con camarero');
  assert.ok(['IDLE', 'RETURNING', 'CHECKING_TABLES'].includes(street.service.waiterState(w.id)!), `el camarero sigue en ${street.service.waiterState(w.id)}`);
  assert.equal(street.calls.length, 0, 'el jugador oyó al camarero tras irse');

  // Y a medias de tomar nota: el camarero ya está en la mesa cuando se levanta.
  const again = openTerrace();
  const u = again.table(SEAT_1);
  again.sit(SEAT_1, () => undefined);
  again.runUntil(() => again.service.waiterState(again.waiter()!.id) === 'TAKING_ORDER', 120_000);
  assert.equal(again.service.waiterState(again.waiter()!.id), 'TAKING_ORDER');
  again.stand();
  // Hasta que se recoge: a la hora de cenar, la mesa libre la puede coger enseguida gente de la calle.
  again.runUntil(() => u.state === 'AVAILABLE', 30_000);
  assert.equal(u.state, 'AVAILABLE', 'la mesa se queda pedida sin nadie');
  assert.equal(u.waiter, null);
  assert.deepEqual(u.plates, []);
  const free = (): boolean => ['IDLE', 'RETURNING', 'CHECKING_TABLES'].includes(again.service.waiterState(again.waiter()!.id)!);
  again.runUntil(free, 30_000);
  assert.ok(free(), 'el camarero no vuelve de la mesa abandonada');
}

// ------------------------------------------------ levantarse sin pagar: deja el dinero y la mesa se recoge
{
  const street = openTerrace();
  const t = street.table(SEAT_2);
  street.sit(SEAT_2, (call) => {
    if (call.kind === 'order') street.service.playerOrder([call.items.find((i) => i.kind === 'drink')!]);
  });
  street.runUntil(() => t.state === 'SERVED', 200_000);
  assert.equal(t.state, 'SERVED');
  const owed = street.stand();
  assert.ok(owed > 0, 'se va sin pagar y no se cobra');
  street.runUntil(() => t.state === 'AVAILABLE', 90_000);
  assert.equal(t.state, 'AVAILABLE', 'la vajilla de la mesa abandonada no se recoge');
  assert.equal(t.waiter, null);
}

// ------------------------------------------------ varias mesas a la vez: la gente de la calle
{
  let both = 0;
  let served = 0;
  let paid = 0;
  for (const [hhmm, seed] of [['13:30', 3], ['21:00', 4], ['21:00', 5], ['13:30', 6], ['21:30', 7], ['14:00', 8]] as const) {
    const street = new Street(seed, hhmm);
    // Hora y cuarto de reloj por tirada: lo que tarda una comida entera en terraza (sentarse, pedir, comer, pagar).
    for (let i = 0; i < stepsFor(75 * MS_PER_MIN); i++) {
      street.step();
      for (const t of street.service.tables) {
        // Quien come ahí es de verdad quien está sentado en esa silla; nadie más.
        for (const d of t.diners) {
          const a = street.life.agents.find((x) => x.id === d.who);
          assert.ok(a, `${t.def.id}: comensal que ya no existe`);
          // (un fotograma después de levantarse, el servicio aún no lo ha recogido)
          assert.ok(a.stayPoint === d.seat || a.stayPoint === undefined, `${t.def.id}: el comensal está en ${a.stayPoint}`);
        }
        if (t.state === 'ORDERED') assert.ok(t.plates.length > 0, `${t.def.id}: pedido sin platos`);
        if (t.state === 'SERVED') served++;
        if (t.state === 'PAID') paid++;
      }
      if (street.service.tables.every((t) => t.party !== null)) both++;
    }
    assert.equal(street.life.pathFailures, 0, 'calle: rutas no encontradas');
  }
  assert.ok(served > 0, 'nadie fue servido en la terraza');
  assert.ok(paid > 0, 'nadie pagó en la terraza');
  assert.ok(both > 0, 'nunca hubo las dos mesas ocupadas a la vez');
}

// ------------------------------------------------ el jugador en una mesa mientras la otra la usa la calle
{
  let done = false;
  for (let seed = 1; seed <= 60 && !done; seed++) {
    const street = new Street(seed, '21:00');
    if (!street.waiter() || street.table(SEAT_1).party !== null) continue;
    const mine = street.table(SEAT_1);
    const other = street.table(SEAT_2);
    street.sit(SEAT_1, orderBoth(street));
    let otherUsed = false;
    for (let i = 0; i < stepsFor(250_000) && mine.state !== 'PAID'; i++) {
      street.step();
      if (mine.state === 'ROUND_DONE') street.service.playerAsk('bill');
      if (other.party !== null) otherUsed = true;
      assert.ok(other.waiter === null || mine.waiter === null || other.waiter !== mine.waiter || other === mine);
    }
    if (mine.state === 'PAID' && otherUsed) done = true;
  }
  assert.ok(done, 'no se probó al jugador con la otra mesa ocupada por la calle');
}

console.log('terraza OK: mismo TableService y misma carta que el comedor · pedir, cocina, entrega, comer y cuenta en la terraza · levantarse antes de que llegue, a medias y sin pagar libera mesa y camarero · dos mesas con un solo camarero');
