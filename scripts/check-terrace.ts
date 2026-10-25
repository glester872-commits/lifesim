// La terraza de Casa Tomás con el mismo servicio de mesa que el comedor (systems/TableService, activado en la calle
// por StreetProfile.tableService): `npm run check`. Falla si el jugador no recibe fuera el mismo flujo que dentro
// (carta, pedido, cocina, entrega, comida, cuenta), si dos camareros atienden una mesa, si levantarse a medias deja la
// mesa o al camarero colgados, o si el camarero atraviesa algo.
import assert from 'node:assert/strict';
import { getLocation, isStandable } from '../src/systems/LocationSystem.ts';
import type { LocationDef, TilePoint } from '../src/types/game.ts';
import { placeInfo } from '../src/systems/Places.ts';
import { Crowd, profileFor, type Clock } from '../src/systems/Crowd.ts';
import { StreetLife, streetProfileFor, type Walker } from '../src/systems/StreetLife.ts';
import { TableService, type PlayerCall, type Table } from '../src/systems/TableService.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { HEAVY_RAIN, weatherAt } from '../src/systems/Weather.ts';

const STEP_MS = 100;
const MS_PER_MIN = 500;
const SEAT_1 = 'RESTAURANT_TERRACE_01';
const SEAT_2 = 'RESTAURANT_TERRACE_02';
const PLAYER_TILE = { tx: 40, ty: 17 };

/** Una terraza con servicio: dónde, de qué local, con qué carta, sus asientos, a qué horas hay camarero seguro y una en que está cerrado. */
interface Terrace { location: string; place: string; menu: string; seats: readonly string[]; open: readonly string[]; closed: string; player: TilePoint }
const CASA_TOMAS: Terrace = { location: 'district', place: 'restaurant', menu: 'casa-tomas', seats: [SEAT_1, SEAT_2], open: ['14:00', '21:00', '13:30', '20:30'], closed: '05:00', player: PLAYER_TILE };
/** Todas las terrazas de comida y bebida que hay hoy: cada una con su servicio, su carta y su camarero. */
const TERRACES: readonly Terrace[] = [
  CASA_TOMAS,
  { location: 'district', place: 'cafe', menu: 'pausa', seats: ['CAFE_TERRACE_01', 'CAFE_TERRACE_02'], open: ['10:00', '17:00', '11:00'], closed: '05:00', player: { tx: 57, ty: 20 } },
  { location: 'district', place: 'coffee-molinillo', menu: 'molinillo', seats: ['MOLINILLO_TERRACE_01', 'MOLINILLO_TERRACE_02'], open: ['10:00', '16:30', '12:00'], closed: '22:00', player: { tx: 92, ty: 53 } },
  { location: 'ribera', place: 'bar-ribera', menu: 'bar-ribera', seats: ['RB_BAR_TERRACE_01', 'RB_BAR_TERRACE_02'], open: ['18:00', '15:00', '20:00'], closed: '06:00', player: { tx: 20, ty: 19 } },
  { location: 'ribera', place: 'cafe-rio', menu: 'cafe-rio', seats: ['RB_CAFE_TERRACE_01', 'RB_CAFE_TERRACE_02'], open: ['10:00', '17:00', '12:00'], closed: '05:00', player: { tx: 20, ty: 19 } },
  { location: 'ribera', place: 'casa-mar', menu: 'casa-mar', seats: ['RB_CASAMAR_TERRACE_01', 'RB_CASAMAR_TERRACE_02'], open: ['14:00', '21:00', '13:00', '12:30', '18:00'], closed: '05:00', player: { tx: 20, ty: 19 } },
];

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
  const life = new StreetLife(getLocation('district'), streetProfileFor('district')!, seededRng(1));
  const terrace = life.serviceAt(SEAT_1);
  assert.ok(crowd.service && terrace, 'falta el servicio en el comedor o en la terraza');
  assert.equal(terrace.menu, crowd.service!.menu, 'la terraza no sirve la misma carta');
  assert.ok(terrace instanceof TableService && crowd.service instanceof TableService);
  assert.deepEqual(terrace.tables.map((t) => t.def.seats[0]), [SEAT_1, SEAT_2]);
}

/** Una calle en marcha: avanza como el juego (un minuto de reloj cada 500 ms) y comprueba lo de siempre en cada paso. */
class Street {
  readonly life: StreetLife;
  readonly service: TableService;
  clock: Clock;
  readonly calls: PlayerCall[] = [];
  readonly waiterStates = new Set<string>();
  private elapsed = 0;

  readonly place: string;
  private readonly loc: LocationDef;
  private readonly player: TilePoint;

  constructor(seed: number, hhmm: string, where: Terrace = CASA_TOMAS, day = 6, reserved: readonly string[] = []) {
    this.loc = getLocation(where.location);
    this.player = where.player;
    this.life = new StreetLife(this.loc, streetProfileFor(where.location)!, seededRng(seed));
    this.clock = at(day, hhmm);
    this.life.claim(new Set(reserved));
    this.life.populate(this.clock, this.player);
    this.service = this.life.serviceAt(where.seats[0])!;
    this.place = where.place;
  }

  waiter(): Walker | undefined {
    return this.life.agents.find((a) => a.kind === 'staff' && a.post?.place === this.place && !a.vanish);
  }

  table(seat: string): Table {
    return this.service.tableOf(seat)!;
  }

  step(): void {
    this.life.update(STEP_MS, this.clock, this.player);
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
      assert.ok(isStandable(this.loc, Math.round(w.x), Math.round(w.y)), `${this.place}: el camarero está dentro de algo en ${w.x.toFixed(1)},${w.y.toFixed(1)}`);
    }
    // Una mesa tiene un solo camarero (y sólo hay uno de turno), y un camarero una sola mesa.
    const held = this.service.tables.filter((t) => t.waiter !== null).map((t) => t.waiter);
    assert.equal(new Set(held).size, held.length, 'un camarero con dos mesas');
    for (const t of this.service.tables) assert.ok(t.waiter === null || t.waiter === w?.id, `la mesa ${t.def.id} tiene un camarero que no es el de turno`);
    assert.equal(this.life.agents.filter((a) => a.kind === 'staff' && a.post?.place === this.place && !a.vanish).length <= 1, true, 'dos camareros en la terraza');
    // Ningún otro servicio de la calle tiene una mesa con el camarero de esta terraza.
    for (const other of this.life.services) {
      if (other === this.service) continue;
      for (const t of other.tables) assert.ok(t.waiter === null || t.waiter !== w?.id, `el camarero de ${this.place} atiende ${t.def.id}`);
    }
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

/** Una calle con el camarero de la terraza de servicio y las mesas libres (busca hora y semilla donde las haya). */
function openTerrace(where: Terrace = CASA_TOMAS, free: readonly string[] = where.seats): Street {
  for (const hhmm of where.open) {
    for (let seed = 1; seed <= 40; seed++) {
      const street = new Street(seed, hhmm, where, 6, free);
      if (street.waiter() && free.every((seat) => street.table(seat).party === null)) return street;
    }
  }
  throw new Error(`${where.place}: no hay forma de abrir la terraza con las mesas libres`);
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
  // Hasta que se recoge (como abajo, a medias de tomar nota): libre, la mesa la puede coger enseguida gente de la calle,
  // y eso no es que se quede pedida. Como mucho una hora de reloj: le sobra para volver y no cruza el fin de su turno.
  street.runUntil(() => t.state === 'AVAILABLE', 30_000);
  assert.equal(t.state, 'AVAILABLE');
  assert.equal(t.party, null);
  assert.equal(t.waiter, null, 'la mesa abandonada sigue con camarero');
  // Y el camarero, que iba de camino, lo deja y vuelve (como abajo).
  const back = (): boolean => ['IDLE', 'RETURNING', 'CHECKING_TABLES'].includes(street.service.waiterState(w.id)!);
  street.runUntil(back, 30_000);
  assert.ok(back(), `el camarero sigue en ${street.service.waiterState(w.id)}`);
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
  for (const [hhmm, seed] of [['13:30', 3], ['21:00', 4], ['21:00', 5], ['13:30', 6], ['21:30', 7], ['14:00', 8], ['21:00', 9], ['13:30', 10], ['21:00', 11], ['14:00', 12]] as const) {
    const street = new Street(seed, hhmm);
    // Hora y tres cuartos por tirada: una comida entera en terraza (sentarse, pedir, comer, pagar) dura hora y cuarto y puede
    // empezar a media tirada; con justo hora y cuarto, el pago caía fuera según quién saliera a la calle ese día.
    for (let i = 0; i < stepsFor(105 * MS_PER_MIN); i++) {
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
  // A la hora de comer la calle ocupa la otra mesa con cualquier semilla (100 de 100); a las 21:00 era un suceso raro (1 de 60 en
  // el código de antes), así que la prueba pasaba o no por azar de la semilla y no por lo que comprueba.
  for (let seed = 1; seed <= 60 && !done; seed++) {
    const street = new Street(seed, '13:00');
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

/** Un momento de lluvia fuerte con el local abierto (de la previsión de verdad, no inventado). */
function rainyOpen(where: Terrace): { day: number; hhmm: string } {
  for (let day = 1; day < 400; day++) {
    for (const hhmm of where.open) {
      const c = at(day, hhmm);
      if (weatherAt(day, c.hour + c.minute / 60).rain > HEAVY_RAIN + 0.05) return { day, hhmm };
    }
  }
  throw new Error(`${where.place}: ningún aguacero en horario de apertura`);
}

// ------------------------------------------------ todas las terrazas: el ciclo entero del jugador, su carta y su camarero
for (const where of TERRACES) {
  const tag = `${where.place} (${where.location})`;
  const street = openTerrace(where, [where.seats[0]]);
  const svc = street.service;
  assert.equal(svc.menu.id, where.menu, `${tag}: carta equivocada (${svc.menu.id})`);
  assert.equal(street.life.placeOf(svc), where.place, `${tag}: el servicio es de otro local`);
  // Cada asiento de esta terraza es de este servicio y de ningún otro.
  for (const seat of where.seats) {
    assert.ok(svc.tableOf(seat), `${tag}: ${seat} no es una mesa con servicio`);
    assert.equal(street.life.services.filter((s) => s.tableOf(seat)).length, 1, `${tag}: ${seat} es de dos servicios`);
  }
  const seat = where.seats[0];
  const t = street.table(seat);
  const spot = t.def.service;
  let reached = false;
  let charged = 0;
  street.sit(seat, (call) => {
    if (call.kind === 'order') {
      assert.equal(call.menu.id, where.menu, `${tag}: el camarero trae otra carta`);
      const drink = call.items.find((i) => i.kind === 'drink');
      const food = call.items.find((i) => i.kind === 'food');
      assert.ok(drink, `${tag}: la carta no tiene bebida a esta hora`);
      street.service.playerOrder(food ? [drink, food] : [drink]);
    } else if (call.kind === 'bill') {
      assert.equal(charged, 0, `${tag}: cobra dos veces`);
      charged = street.service.playerPay();
      assert.equal(street.service.playerPay(), 0, `${tag}: se puede pagar dos veces`);
    }
  });
  assert.equal(t.party, -1, `${tag}: la mesa no es del jugador`);
  const seen: string[] = [t.state];
  for (let i = 0; i < stepsFor(400_000) && t.state !== 'PAID'; i++) {
    street.step();
    if (seen[seen.length - 1] !== t.state) seen.push(t.state);
    const w = street.waiter();
    // El camarero llega de verdad a su sitio junto a la mesa para tomar nota, servir y cobrar.
    if (w && ['TAKING_ORDER', 'TAKING_PAYMENT', 'SERVING'].includes(street.service.waiterState(w.id) ?? '') && Math.hypot(w.x - spot.tx, w.y - spot.ty) < 0.6) reached = true;
    if (t.state === 'ROUND_DONE') street.service.playerAsk('bill');
  }
  assert.deepEqual(seen, ['OCCUPIED', 'WAITING_TO_ORDER', 'ORDERED', 'SERVED', 'ROUND_DONE', 'WAITING_TO_PAY', 'PAID'], `${tag}: flujo de la mesa: ${seen.join(' → ')}`);
  assert.ok(reached, `${tag}: el camarero nunca llegó junto a la mesa`);
  assert.ok(charged > 0, `${tag}: no se cobró`);
  assert.deepEqual(street.calls.map((c) => c.kind).filter((k, i, all) => k !== all[i - 1]), ['order', 'served', 'finished', 'bill'], `${tag}: lo que ve el jugador`);
  for (const s of ['GOING_TO_TABLE', 'TAKING_ORDER', 'GOING_TO_KITCHEN', 'WAITING_FOR_ORDER', 'DELIVERING_ORDER', 'SERVING', 'TAKING_PAYMENT']) {
    assert.ok(street.waiterStates.has(s), `${tag}: el camarero nunca estuvo en ${s}`);
  }
  // Se levanta: no debe nada, la mesa se recoge y queda libre, y el servicio ya no le tiene en ninguna mesa.
  assert.equal(street.stand(), 0, `${tag}: cobra al levantarse tras pagar`);
  street.runUntil(() => t.state === 'AVAILABLE', 90_000);
  assert.equal(t.state, 'AVAILABLE', `${tag}: la mesa no se recoge`);
  assert.equal(t.waiter, null);
  assert.equal(street.service.playerTable, undefined, `${tag}: el jugador sigue en una mesa`);
  assert.equal(street.life.pathFailures, 0, `${tag}: rutas no encontradas`);
  // Cerrado: nadie atiende esa terraza.
  const closed = new Street(1, where.closed, where);
  closed.runUntil(() => false, 5_000);
  assert.equal(closed.service.staffed, false, `${tag}: con el local cerrado hay camarero en la terraza`);
  // Con lluvia fuerte y el local abierto, la terraza tampoco se sirve (la misma regla que los puestos de calle).
  const storm = rainyOpen(where);
  const wet = new Street(1, storm.hhmm, where, storm.day);
  wet.runUntil(() => false, 5_000);
  assert.equal(wet.service.staffed, false, `${tag}: con lluvia fuerte (día ${storm.day} ${storm.hhmm}) hay camarero en la terraza`);
  console.log(`  ${tag}: sentarse, su servicio, camarero junto a la mesa, carta ${where.menu}, entrega, cuenta ${charged.toFixed(2)} EUR una vez, mesa libre`);
}

console.log('terraza OK: mismo TableService y misma carta que el comedor · pedir, cocina, entrega, comer y cuenta en la terraza · levantarse antes de que llegue, a medias y sin pagar libera mesa y camarero · dos mesas con un solo camarero');
