// Navegación y accesibilidad de todas las calles con gente (data/streets.ts): puertas libres, cruces sólo por los
// pasos, carrito de limpieza sin atravesar fachadas, recuperación finita, ninguna reserva suelta y ninguna ruta rota.
// Simula las horas más llenas de cada calle (y la salida del partido si la calle lo tiene) con el jugador paseando
// por la acera de un borde a otro y vuelta. Uso: node scripts/check-navigation.ts [--report] (sin asserts, sólo tabla).
import assert from 'node:assert/strict';
import { STREET_PROFILES } from '../src/data/streets.ts';
import { LEVELS } from '../src/config/population.ts';
import { allLocations, getLocation, isStandable, isWalkable, ROADWAY } from '../src/systems/LocationSystem.ts';
import { hashSeed, seededRng } from '../src/systems/MetroDaily.ts';
import { route } from '../src/systems/Navigation.ts';
import { StreetLife, trolleyAt } from '../src/systems/StreetLife.ts';
import { matchOn } from '../src/systems/Match.ts';
import { onCrossing, signalAt } from '../src/systems/Signals.ts';
import { ARENA_MATCHES } from '../src/data/cityEvents.ts';
import type { Clock } from '../src/systems/Crowd.ts';
import type { LocationDef, TilePoint } from '../src/types/game.ts';

const REPORT = process.argv.includes('--report');
const MS_PER_MIN = 500;
const STEP_MS = 100;
const MINUTES = 25;
/** Quieto con camino pendiente más de esto (ms de juego reales) es estar atascado, no esperar un semáforo. */
const STUCK_MS = 30_000;

/** Lo que pinta world/CrowdView del carrito de limpieza (StreetLife.trolleyAt): la base del sprite, 14 px de ancho. */
function cartBase(loc: LocationDef, a: { x: number; y: number; dir: string; moving: boolean; path: unknown[] }): { x0: number; x1: number; y: number } {
  const c = trolleyAt(a, (x, y) => isStandable(loc, x, y));
  return { x0: c.x - 7, x1: c.x + 6, y: c.y - 2 };
}

/** Tiles de puerta: el punto de entrada de cada edificio y el spawn de vuelta a la calle. */
function doorTiles(loc: LocationDef): Map<string, string> {
  const out = new Map<string, string>();
  for (const [id, p] of Object.entries(loc.points ?? {})) if (p.kind === 'entrance') out.set(`${p.tx},${p.ty}`, id);
  for (const [id, s] of Object.entries(loc.spawns)) out.set(`${s.tx},${s.ty}`, `spawn ${id}`);
  return out;
}

/** El paseo del jugador: de un borde de acera al opuesto y vuelta (el de más tiles de camino). */
function playerWalk(loc: LocationDef): TilePoint[] {
  const edges = Object.entries(loc.points ?? {}).filter(([, p]) => p.kind === 'edge').map(([id]) => id);
  let best: TilePoint[] = [];
  for (const a of edges) for (const b of edges) {
    if (a >= b) continue;
    const r = route(a, b);
    if (r && r.length > best.length) best = r;
  }
  return [...best, ...[...best].reverse()];
}

interface Scenario {
  name: string;
  clock: Clock;
}

function scenarios(profile: (typeof STREET_PROFILES)[number]): Scenario[] {
  // Las dos franjas más llenas de la calle, un sábado (día 6 es sábado: el 1 es lunes).
  const bands = [...profile.bands].sort((a, b) => LEVELS.indexOf(b[2]) - LEVELS.indexOf(a[2])).slice(0, 2);
  const out = bands.map(([from, to]): Scenario => {
    const h = (from + Math.min(to, from + 2)) / 2;
    return { name: `${String(Math.floor(h)).padStart(2, '0')}:${h % 1 ? '30' : '00'}`, clock: { day: 6, hour: Math.floor(h), minute: h % 1 ? 30 : 0 } };
  });
  // La limpieza viaria con su carrito, a su hora (la primera regla con `sweep` que tenga horario): junto a bancos,
  // bolardos y fachadas.
  const sweep = profile.trips.find((r) => r.sweep && r.hours);
  if (sweep) {
    const h = sweep.hours![0] + 0.25;
    out.push({ name: 'limpieza', clock: { day: 3, hour: Math.floor(h), minute: Math.round((h % 1) * 60) } });
  }
  // Calle con partido: la salida del estadio, lo más denso que hay.
  if (profile.match) {
    const day = Array.from({ length: 60 }, (_, i) => i + 1).find((d) => matchOn(d))!;
    const m = matchOn(day)!.kickoff + ARENA_MATCHES.phases.leaving[0] + 10;
    out.push({ name: 'salida partido', clock: { day, hour: Math.floor(m / 60), minute: m % 60 } });
  }
  return out;
}

const step = (c: Clock): Clock => {
  const t = c.hour * 60 + c.minute + 1;
  return { day: c.day + Math.floor(t / 1440), hour: Math.floor((t % 1440) / 60), minute: t % 60 };
};

const rows: string[] = [];
const problems: string[] = [];
for (const profile of STREET_PROFILES) {
  const loc = getLocation(profile.location);
  const doors = doorTiles(loc);
  // ---- estático: ninguna puerta tapada por un sitio donde quedarse ni por algo sólido.
  for (const [k, id] of doors) {
    const [tx, ty] = k.split(',').map(Number);
    if (!isWalkable(loc, tx, ty)) problems.push(`${loc.id}: puerta ${id} en ${k} no es pisable`);
    for (const [pid, p] of Object.entries(loc.points ?? {})) {
      if (p.kind === 'entrance' || p.kind === 'edge' || p.kind === 'path' || p.kind === 'exit') continue;
      if (`${p.tx},${p.ty}` === k) problems.push(`${loc.id}: ${pid} (sitio para quedarse) encima de la puerta ${id}`);
    }
  }
  const walk = playerWalk(loc);
  for (const sc of scenarios(profile)) {
    const t0 = performance.now();
    const street = new StreetLife(loc, profile, seededRng(hashSeed('nav', loc.id, sc.name)));
    let clock = sc.clock;
    let player = walk[0];
    street.populate(clock, player);
    const still = new Map<number, { x: number; y: number; ms: number }>();
    const onDoor = new Map<number, number>();
    let stuck = 0;
    let roadSamples = 0;
    let onRed = 0;
    const crossing = new Map<number, boolean>();
    // Quien ya está en mitad de un paso al llegar (populate lo deja a medio viaje) acaba de cruzar: no entra en rojo.
    for (const a of street.agents) crossing.set(a.id, !!onCrossing(loc.signals ?? [], { tx: Math.round(a.x), ty: Math.round(a.y) }));
    let cartWall = 0;
    let cartSamples = 0;
    let doorBlockMs = 0;
    let peak = 0;
    let elapsed = 0;
    let wi = 0;
    for (let ms = 0; ms < MINUTES * MS_PER_MIN; ms += STEP_MS) {
      // El jugador anda a ~4 tiles/s por la acera, de un borde al otro y vuelta.
      wi = Math.min(walk.length - 1, wi + (ms % 250 === 0 ? 1 : 0));
      if (wi === walk.length - 1) wi = 0;
      player = walk[wi];
      street.update(STEP_MS, clock, player);
      elapsed += STEP_MS;
      if (elapsed >= MS_PER_MIN) {
        elapsed -= MS_PER_MIN;
        clock = step(clock);
      }
      peak = Math.max(peak, street.agents.length);
      for (const a of street.agents) {
        const tx = Math.round(a.x);
        const ty = Math.round(a.y);
        if (!isStandable(loc, tx, ty)) problems.push(`${loc.id} ${sc.name}: ${a.role} dentro de algo en ${tx},${ty}`);
        // Por la calzada sólo se cruza por un paso de cebra (los que viven en la calle y quien vende no andan por ella).
        const ch = loc.ground[ty]?.[tx] ?? '';
        if (ROADWAY.has(ch) && ch !== 'z' && a.moving) roadSamples++;
        // Y por un paso con semáforo, sólo con el muñeco en verde (quien ya estaba cruzando acaba con el parpadeo).
        const sig = onCrossing(loc.signals ?? [], { tx, ty });
        if (sig && !crossing.get(a.id) && signalAt(sig, clock.hour * 60 + clock.minute + elapsed / MS_PER_MIN).walk === 'stop') onRed++;
        crossing.set(a.id, !!sig);
        // Quien se queda quieto en una puerta la tapa: se cuenta el tiempo (no es grave si es un momento al pasar).
        const door = doors.has(`${tx},${ty}`) && !a.moving && !a.vanish;
        if (door) {
          const t = (onDoor.get(a.id) ?? 0) + STEP_MS;
          onDoor.set(a.id, t);
          if (t > 10_000) doorBlockMs += STEP_MS;
        } else onDoor.delete(a.id);
        // Atascado: con camino pendiente y sin moverse.
        const s = still.get(a.id);
        if (a.path.length > 0 && s && Math.hypot(a.x - s.x, a.y - s.y) < 0.2) {
          s.ms += STEP_MS;
          if (s.ms === STUCK_MS) stuck++;
        } else still.set(a.id, { x: a.x, y: a.y, ms: 0 });
        // El carrito de limpieza: su base no se pinta encima de una fachada ni de algo sólido.
        if (a.belongings?.includes('trolley')) {
          cartSamples++;
          const c = cartBase(loc, a);
          const cy = Math.floor(c.y / 16);
          if ([c.x0, c.x1].some((x) => !isStandable(loc, Math.floor(x / 16), cy))) cartWall++;
        }
      }
    }
    // Reservas: cada asiento con dueño tiene a su dueño en la calle.
    const ids = new Set(street.agents.map((a) => a.id));
    const loose = [...street.seats.seats()].filter((s) => street.seats.ownerOf(s) !== undefined && !ids.has(street.seats.ownerOf(s)!));
    const st = street.watch.stats;
    const ms = Math.round(performance.now() - t0);
    rows.push(
      `${loc.id.padEnd(15)} ${sc.name.padEnd(15)} pico ${String(peak).padStart(3)}  fallos ${street.pathFailures}  atascos ${stuck}  ` +
        `rescates ${st.attempts.slice(1).join('/')} (ok ${st.recovered})  calzada ${roadSamples}  rojo ${onRed}  puerta ${Math.round(doorBlockMs / 1000)}s  carrito ${cartWall}/${cartSamples}  sueltas ${loose.length}  ${ms} ms`,
    );
    if (street.pathFailures) problems.push(`${loc.id} ${sc.name}: ${street.pathFailures} rutas no encontradas`);
    if (stuck) problems.push(`${loc.id} ${sc.name}: ${stuck} atascados más de ${STUCK_MS / 1000} s`);
    if (roadSamples) problems.push(`${loc.id} ${sc.name}: gente andando por la calzada fuera de los pasos (${roadSamples} muestras)`);
    if (onRed) problems.push(`${loc.id} ${sc.name}: ${onRed} entradas a un paso con el muñeco en rojo`);
    if (doorBlockMs) problems.push(`${loc.id} ${sc.name}: puerta tapada ${Math.round(doorBlockMs / 1000)} s`);
    if (cartWall) problems.push(`${loc.id} ${sc.name}: carrito pintado sobre algo sólido (${cartWall} muestras)`);
    if (loose.length) problems.push(`${loc.id} ${sc.name}: ${loose.length} reservas sin dueño`);
  }
}
// ---- transiciones: en cada sitio del juego (calles, interiores, andenes) el tile donde aparece quien llega por una
// puerta es pisable y no es el sitio de nadie (ni silla, ni barra, ni puesto de trabajo): entrar nunca es aparecer encima.
for (const loc of allLocations()) {
  const stays = new Map(Object.entries(loc.points ?? {}).filter(([, p]) => !['entrance', 'edge', 'path', 'exit'].includes(p.kind)).map(([id, p]) => [`${p.tx},${p.ty}`, id]));
  for (const [sid, s] of Object.entries(loc.spawns)) {
    if (!isWalkable(loc, s.tx, s.ty)) problems.push(`${loc.id}: llegada ${sid} en ${s.tx},${s.ty} no es pisable`);
    const on = stays.get(`${s.tx},${s.ty}`);
    if (on) problems.push(`${loc.id}: llegada ${sid} encima de ${on}`);
  }
}

// ---- obstáculo temporal (systems/Recovery): un tile cortado en mitad de la acera más transitada, con el jugador al
// lado (sin el peldaño 4, que sólo actúa fuera de cámara) y lejos. Nadie puede quedarse esperando para siempre: rodea,
// rehace la ruta o sale de escena; y al quitar el obstáculo no queda nadie atascado.
for (const [id, hour] of [['cuatro-rios', 18], ['puerta-central', 14]] as const) {
  const profile = STREET_PROFILES.find((p) => p.location === id)!;
  const loc = getLocation(id);
  const walk = playerWalk(loc);
  const cut = walk[Math.floor(walk.length / 4)];
  for (const watching of [true, false]) {
    const street = new StreetLife(loc, profile, seededRng(hashSeed('nav-block', id, String(watching))));
    let clock: Clock = { day: 6, hour, minute: 0 };
    const player = watching ? { tx: cut.tx, ty: Math.max(0, cut.ty - 2) } : { tx: 0, ty: 0 };
    street.populate(clock, player);
    street.blocked.add(`${cut.tx},${cut.ty}`);
    const waited = new Map<number, number>();
    let longest = 0;
    let elapsed = 0;
    const t0 = performance.now();
    for (let ms = 0; ms < 20 * MS_PER_MIN; ms += STEP_MS) {
      // Diez minutos con el obstáculo y diez sin él.
      if (ms === 10 * MS_PER_MIN) street.blocked.clear();
      street.update(STEP_MS, clock, player);
      if ((elapsed += STEP_MS) >= MS_PER_MIN) {
        elapsed -= MS_PER_MIN;
        clock = step(clock);
      }
      for (const a of street.agents) {
        const waiting = a.path.length > 0 && !a.moving && !a.staying && !a.talking && a.delay <= 0;
        const w = waiting ? (waited.get(a.id) ?? 0) + STEP_MS : 0;
        waited.set(a.id, w);
        longest = Math.max(longest, w);
      }
    }
    const st = street.watch.stats;
    const leftover = street.watch.stuckCount();
    rows.push(
      `${id.padEnd(15)} ${(watching ? 'obstáculo·vista' : 'obstáculo·lejos').padEnd(15)} espera máx ${(longest / 1000).toFixed(1)} s  rescates ${st.attempts.slice(1).join('/')} (ok ${st.recovered})  ` +
        `atascados al final ${leftover}  fallos ${street.pathFailures}  ${Math.round(performance.now() - t0)} ms`,
    );
    if (longest > STUCK_MS) problems.push(`${id} obstáculo (${watching ? 'a la vista' : 'lejos'}): alguien esperó ${(longest / 1000).toFixed(0)} s`);
    if (leftover) problems.push(`${id} obstáculo: ${leftover} atascados tras quitarlo`);
  }
}

console.log('calle           escena          resultados (rescates: peldaños 1/2/3/4)');
for (const r of rows) console.log(r);
const unique = [...new Set(problems)];
if (unique.length) console.log(`\n${unique.length} problemas:\n  ${unique.slice(0, 40).join('\n  ')}`);
if (!REPORT) assert.deepEqual(unique, [], 'navegación');
console.log(REPORT ? 'check-navigation: informe' : 'check-navigation: OK');
