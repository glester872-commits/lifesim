// Simula la gente de la calle con el mismo StreetLife que usa el juego:
// `npm run simulate:streets`. Falla si algo no se cumple.
import assert from 'node:assert/strict';
import { getLocation, isStandable } from '../src/systems/LocationSystem.ts';
import { findPoint } from '../src/systems/Navigation.ts';
import { StreetLife, streetProfileFor, streetTargetAt } from '../src/systems/StreetLife.ts';
import type { Clock } from '../src/systems/Crowd.ts';
import { hashSeed, seededRng, weekday } from '../src/systems/MetroDaily.ts';
import type { TilePoint } from '../src/types/game.ts';

const STEP_MS = 100;
const MS_PER_MIN = 500; // el reloj del juego: 2 minutos por segundo real
const loc = getLocation('district');
const profile = streetProfileFor('district')!;
const ROADWAY = new Set(['.', '=', ':', 'z']);
const CLUB = findPoint('CLUB_ENTRANCE')!;
// El jugador, en un rincón del parque: lejos de las puertas y de los viajes.
const PLAYER: TilePoint = { tx: 72, ty: 53 };

const at = (day: number, hhmm: string): Clock => ({ day, hour: Number(hhmm.slice(0, 2)), minute: Number(hhmm.slice(3)) });
const addMinutes = (c: Clock, m: number): Clock => {
  const total = c.hour * 60 + c.minute + m;
  return { day: c.day + Math.floor(total / 1440), hour: Math.floor((total % 1440) / 60), minute: total % 60 };
};
const nearClub = (s: StreetLife): number => s.agents.filter((a) => Math.hypot(a.x - CLUB.tx, a.y - CLUB.ty) <= 8).length;

/** Deja correr la calle `minutes` minutos de juego comprobando cada paso. */
function run(start: Clock, minutes: number, seed: number) {
  const street = new StreetLife(loc, profile, seededRng(seed));
  street.populate(start, PLAYER);
  const initial = street.agents.length;
  let clock = start;
  let elapsed = 0;
  let last = initial;
  let maxDelta = 0;
  let peakNearClub = 0;
  const roles = new Map<string, number>();
  for (let ms = 0; ms < minutes * MS_PER_MIN; ms += STEP_MS) {
    street.update(STEP_MS, clock, PLAYER);
    elapsed += STEP_MS;
    if (elapsed >= MS_PER_MIN) {
      elapsed -= MS_PER_MIN;
      clock = addMinutes(clock, 1);
      maxDelta = Math.max(maxDelta, Math.abs(street.agents.length - last));
      last = street.agents.length;
    }
    const still: string[] = [];
    for (const a of street.agents) {
      const tile = `${Math.round(a.x)},${Math.round(a.y)}`;
      assert.ok(isStandable(loc, Math.round(a.x), Math.round(a.y)), `${a.role} dentro de algo en ${tile}`);
      const standing = !a.moving && a.path.length === 0 && a.delay <= 0 && !a.vanish;
      if (standing) {
        still.push(tile);
        // Parado, nunca en la calzada: los coches no tienen por qué esquivar a nadie quieto.
        assert.ok(!ROADWAY.has(loc.ground[Math.round(a.y)][Math.round(a.x)]), `${a.role} parado en la calzada en ${tile}`);
      }
    }
    // Dos personas quietas nunca en el mismo tile: los sitios se reservan y el grupo se pone al lado.
    assert.equal(new Set(still).size, still.length, `dos personas quietas en el mismo sitio a las ${clock.hour}:${clock.minute}`);
    peakNearClub = Math.max(peakNearClub, nearClub(street));
    for (const a of street.agents) roles.set(a.role, (roles.get(a.role) ?? 0) + 1);
  }
  assert.equal(street.pathFailures, 0, 'rutas no encontradas');
  assert.ok(street.agents.length <= profile.maxWalkers, 'más gente que el tope de la calle');
  return { street, initial, final: street.agents.length, maxDelta, peakNearClub, roles, target: streetTargetAt(profile, start) };
}

const top = (roles: Map<string, number>): string =>
  [...roles].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r]) => r).join(', ');

// ------------------------------------------------------------ casos pedidos

const TUESDAY = 2;
const FRIDAY = 5;
const SATURDAY = 6;
const SUNDAY = 7;
const CASES: [number, string][] = [
  [TUESDAY, '04:00'], [TUESDAY, '08:00'], [TUESDAY, '13:00'], [TUESDAY, '18:00'], [TUESDAY, '23:30'], [TUESDAY + 1, '02:00'],
  [FRIDAY, '23:30'], [SATURDAY, '02:00'], [SATURDAY, '04:30'], [SATURDAY, '12:00'], [SUNDAY, '18:00'],
];
const results = new Map<string, ReturnType<typeof run>>();
console.log('día        hora   objetivo  al entrar → 20 min   junto a la discoteca   viajes más vistos');
for (const [day, t] of CASES) {
  const r = run(at(day, t), 20, hashSeed('street', day, t));
  results.set(`${day} ${t}`, r);
  console.log(`${weekday(day).padEnd(10)} ${t}  ${String(r.target).padStart(5)}      ${String(r.initial).padStart(3)} → ${String(r.final).padStart(3)}         ${String(r.peakNearClub).padStart(3)}                 ${top(r.roles)}`);
  // Nunca cambia de golpe: como mucho un grupo por minuto de juego.
  assert.ok(r.maxDelta <= 3, `${weekday(day)} ${t}: cambió ${r.maxDelta} personas en un minuto`);
}
const get = (day: number, t: string) => results.get(`${day} ${t}`)!;

// Calle residencial de madrugada entre semana: casi nadie; la calle Mayor a las 18:00, llena.
assert.ok(get(TUESDAY, '04:00').target <= 3, 'a las 04:00 de un martes la calle debería estar casi vacía');
assert.ok(get(TUESDAY, '18:00').target >= 10, 'a las 18:00 la calle debería estar llena');
assert.ok(get(TUESDAY, '18:00').target > get(SUNDAY, '18:00').target, 'el domingo por la tarde debería haber menos gente');
// Por la mañana, la gente va al trabajo.
assert.ok(get(TUESDAY, '08:00').roles.get('commuter'), 'a las 08:00 nadie va al metro');
// La noche del viernes la gente se junta en la puerta de la discoteca; la del martes, no (está cerrada).
assert.ok(get(SATURDAY, '02:00').target >= 10, 'la madrugada del sábado debería tener gente por la discoteca');
assert.ok(get(SATURDAY, '02:00').peakNearClub >= 5, 'a las 02:00 del sábado debería haber corrillo en la discoteca');
assert.equal(get(TUESDAY + 1, '02:00').peakNearClub, 0, 'el martes de madrugada la discoteca está cerrada');
// Un sábado cualquiera a las 04:30 sale gente de la discoteca. Se miran cuatro: con la fecha de verdad (systems/Calendar)
// una madrugada de abril puede ser fría y vaciar la calle esos 20 minutos; lo que no puede es no salir nadie ningún sábado.
const leaving = [0, 1, 2, 3].map((k) => run(at(SATURDAY + 7 * k, '04:30'), 20, hashSeed('street', SATURDAY + 7 * k, '04:30')).roles.get('club-leaving') ?? 0);
assert.ok(leaving.some((n) => n > 0), `a las 04:30 nadie sale de la discoteca ningún sábado (${leaving.join(', ')})`);

// El camarero de la terraza trabaja mientras el café está abierto; de madrugada no hay nadie.
{
  const waiter = (day: number, t: string) => get(day, t).street.agents.filter((a) => a.kind === 'staff' && a.post?.place === 'cafe');
  assert.equal(waiter(TUESDAY, '13:00').length, 1, 'a las 13:00 falta el camarero de la terraza del café');
  assert.equal(waiter(TUESDAY, '04:00').length, 0, 'a las 04:00 el café está cerrado y su camarero, dentro');
  assert.equal(waiter(TUESDAY, '13:00')[0].uniform, 'uniforme-sala');
}

// Entrar dos veces en el mismo minuto enseña la misma calle.
{
  const a = new StreetLife(loc, profile, seededRng(1));
  const b = new StreetLife(loc, profile, seededRng(2));
  a.populate(at(3, '18:10'), PLAYER);
  b.populate(at(3, '18:10'), PLAYER);
  const sign = (s: StreetLife) => s.agents.map((g) => `${g.role}@${g.x.toFixed(2)},${g.y.toFixed(2)}#${g.look}`).join('|');
  assert.equal(sign(a), sign(b), 'dos entradas en el mismo minuto dan calles distintas');
  for (const g of a.agents) assert.ok(Math.hypot(g.x - PLAYER.tx, g.y - PLAYER.ty) >= 2, 'alguien apareció junto al jugador');
}

// Un día entero: la gente sube y baja con las horas, sin fallos de ruta.
{
  const hours = (day: number, n: number): number[] =>
    Array.from({ length: n }, (_, h) => streetTargetAt(profile, at(day, `${String(h).padStart(2, '0')}:00`)));
  console.log(`\nviernes, gente por hora: ${hours(FRIDAY, 24).join(' ')}`);
  console.log(`madrugada del sábado:    ${hours(SATURDAY, 7).join(' ')}`);
  const long = run(at(FRIDAY, '17:00'), 240, 42);
  console.log(`viernes 17:00 → 21:00: ${long.initial} → ${long.final} personas, sin rutas perdidas`);
}

console.log('\nOK: densidad por hora, día y zona, discoteca, suelo pisable, calzada libre, reservas y rutas.');
