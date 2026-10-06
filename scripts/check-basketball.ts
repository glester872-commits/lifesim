// Tirar a canasta (systems/Basketball.ts, data/courts.ts, scenes/WorldScene.ts): `npm run check`. La pista de la Ribera
// ya no es un entrenamiento: tiene su actividad, su fórmula de acierto, siete caminos distintos del balón y una sesión
// que se puede cortar en cualquier momento sin dejar balón ni sitio ocupado. El camino visible por la pantalla (E → balón
// en la mano → gesto → vuelo → red o fallo → bote de vuelta) se comprueba además en el navegador.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COURTS } from '../src/data/courts.ts';
import { getLocation, isStandable } from '../src/systems/LocationSystem.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import {
  MAKES, POSES, SHOOTING, ShootingSession, ballAt, chanceOf, pathFor, pathMs, resultAt, shotOutcome,
  type Geometry, type ShotKind,
} from '../src/systems/Basketball.ts';

const loc = getLocation('ribera');
const spots = Object.values(COURTS.ribera);

// ------------------------------------------------ 1. la pista: sitios de verdad, libres, de cara a su canasta

assert.equal(spots.length, 6, 'seis sitios de tiro');
assert.equal(new Set(spots.map((s) => s.id)).size, spots.length);
for (const s of spots) {
  const p = loc.points![s.point];
  assert.ok(p, `${s.id}: el punto ${s.point} no existe`);
  assert.ok(isStandable(loc, p.tx, p.ty), `${s.id}: no se puede estar en ${p.tx},${p.ty}`);
  assert.equal(p.facing, 'up', `${s.id}: no mira a la canasta`);
  // El aro está en su misma columna o a una columna: el tiro sale hacia arriba, nunca de espaldas.
  assert.ok(Math.abs(p.tx - s.hoop.tx) <= 1 && p.ty > s.hoop.ty, `${s.id}: la canasta no queda delante`);
  assert.ok(loc.props.some((pr) => pr.kind === 'hoop' && pr.tx === s.hoop.tx && pr.ty === s.hoop.ty), `${s.id}: no hay canasta en ${s.hoop.tx},${s.hoop.ty}`);
  assert.ok(s.ideal > 0.2 && s.ideal < 0.8 && s.base > 0.4 && s.base < 0.95, `${s.id}: números fuera de rango`);
}
// Más lejos, más potencia y menos acierto con el tiro perfecto.
const by = (id: string) => COURTS.ribera[id];
assert.ok(by('HOOPS_01').ideal < by('HOOPS_02').ideal && by('HOOPS_02').ideal < by('RB_COURT_FT_01').ideal, 'la potencia ideal no crece con la distancia');
assert.ok(by('HOOPS_01').base > by('HOOPS_02').base && by('HOOPS_02').base > by('RB_COURT_FT_01').base, 'la probabilidad no baja con la distancia');
// Ya no es ejercicio: la canasta del jugador no pasa por las máquinas del gimnasio.
const scene = readFileSync(new URL('../src/scenes/WorldScene.ts', import.meta.url), 'utf8');
assert.ok(/const spot = COURTS\[def\.id\]\?\.\[id\];\s*if \(spot\) this\.interactables\.push\(\{ kind: 'court'/.test(scene), 'la canasta no se trata como una actividad propia');
assert.ok(/'Tirar a canasta'/.test(scene), 'el botón táctil no dice «Tirar a canasta»');

// ------------------------------------------------ 2. la fórmula: el buen tiempo gana, el malo pierde, nunca está decidido

const close = by('HOOPS_01');
const free = by('RB_COURT_FT_01');
const perfect = chanceOf(close, close.ideal);
const off = chanceOf(close, close.ideal + 0.15);
const wild = chanceOf(close, 1);
assert.equal(perfect.accuracy, 1);
assert.ok(perfect.chance > off.chance && off.chance > wild.chance, 'más cerca de la ideal, más probable');
assert.ok(perfect.chance <= SHOOTING.maxChance && wild.chance >= SHOOTING.minChance, 'topes de la probabilidad');
assert.ok(chanceOf(free, free.ideal).chance < perfect.chance, 'el tiro libre es más difícil que el de cerca');
assert.ok(chanceOf(close, close.ideal, 1).chance > perfect.chance, 'la forma física no suma');
assert.ok(chanceOf(close, close.ideal, 1).chance - perfect.chance <= SHOOTING.skill + 1e-9, 'la forma física suma demasiado');

/** Una tanda de tiros con el mismo reparto de potencia: proporción de entradas y qué resultados salen. */
function batch(spot = close, offset = 0, n = 4000, seed = 7): { makes: number; kinds: Map<ShotKind, number> } {
  const rng = seededRng(seed);
  const kinds = new Map<ShotKind, number>();
  let makes = 0;
  for (let i = 0; i < n; i++) {
    const power = Math.max(0.1, Math.min(1, spot.ideal + offset * (rng() * 2 - 1)));
    const shot = shotOutcome(spot, power, rng);
    kinds.set(shot.kind, (kinds.get(shot.kind) ?? 0) + 1);
    if (shot.made) makes++;
  }
  return { makes: makes / n, kinds };
}
const good = batch(close, 0.05);
const mid = batch(close, 0.2);
// Mal tiempo: siempre fuera de la ventana (de 0,3 a 0,6 por encima de la ideal).
const bad = (() => {
  const rng = seededRng(11);
  const kinds = new Map<ShotKind, number>();
  let makes = 0;
  for (let i = 0; i < 4000; i++) {
    const shot = shotOutcome(close, Math.min(1, close.ideal + 0.3 + 0.3 * rng()), rng);
    kinds.set(shot.kind, (kinds.get(shot.kind) ?? 0) + 1);
    if (shot.made) makes++;
  }
  return { makes: makes / 4000, kinds };
})();
assert.ok(good.makes > mid.makes && mid.makes > bad.makes, `mejor tiempo no mejora: ${good.makes} ${mid.makes} ${bad.makes}`);
assert.ok(good.makes < 0.95 && good.makes > 0.6, `el buen tiempo debería acertar mucho, no siempre: ${good.makes}`);
assert.ok(bad.makes > 0.02 && bad.makes < 0.3, `mal tiempo: debería fallar casi siempre, no siempre: ${bad.makes}`);
assert.ok(batch(free, 0.05).makes < good.makes, 'el tiro libre acierta tanto como el de cerca');
// Un jugador medio (±0.2 de error) ve las dos cosas en una sesión corta de 20 tiros, con muchas semillas.
for (let seed = 1; seed <= 40; seed++) {
  const rng = seededRng(seed);
  let m = 0;
  for (let i = 0; i < 20; i++) if (shotOutcome(close, close.ideal + 0.2 * (rng() * 2 - 1), rng).made) m++;
  assert.ok(m >= 3 && m <= 19, `semilla ${seed}: ${m} de 20, no se ven las dos cosas`);
}
// Todos los resultados aparecen: tres de entrada y cuatro de fallo, según de dónde viene el error.
const seen = new Set<ShotKind>([...good.kinds.keys(), ...mid.kinds.keys(), ...bad.kinds.keys()]);
for (const k of ['swish', 'rim-in', 'board-in', 'short', 'long', 'left', 'right'] as ShotKind[]) assert.ok(seen.has(k), `nunca sale ${k}`);

// ------------------------------------------------ 3. el balón: visible de principio a fin, distinto cada vez

const feet = { x: 28 * 16 + 8, y: 18 * 16 };
const geo: Geometry = { hands: { x: feet.x + 3, y: feet.y - 13 }, rim: { x: 28 * 16 + 8, y: 17 * 16 - 22 }, floor: { x: 28 * 16 + 8, y: 17 * 16 }, feet };
const KINDS: ShotKind[] = ['swish', 'rim-in', 'board-in', 'short', 'long', 'left', 'right'];
const sig = new Map<ShotKind, string>();
for (const kind of KINDS) {
  const legs = pathFor(kind, geo);
  assert.ok(legs.filter((l) => l.mark === 'result').length === 1, `${kind}: sin un solo momento de resultado`);
  assert.ok(resultAt(legs) < pathMs(legs), `${kind}: el resultado llega después de volver`);
  // El balón existe en cada instante del vuelo (nunca desaparece y reaparece), sin saltos de más de medio tile.
  let prev = ballAt(legs, geo.hands, 0)!;
  for (let t = 5; t < pathMs(legs); t += 5) {
    const b = ballAt(legs, geo.hands, t);
    assert.ok(b, `${kind}: no hay balón a los ${t} ms`);
    assert.ok(Math.hypot(b.x - prev.x, b.y - prev.y) < 8, `${kind}: el balón salta a los ${t} ms`);
    assert.ok(b.scale > 0.5 && b.scale <= 1.01, `${kind}: escala ${b.scale}`);
    prev = b;
  }
  // Acaba otra vez en las manos: el siguiente tiro sale de donde sale.
  const end = ballAt(legs, geo.hands, pathMs(legs) - 1)!;
  assert.ok(Math.hypot(end.x - geo.hands.x, end.y - geo.hands.y) < 3, `${kind}: no vuelve a las manos`);
  // Lo que se ve en el momento del resultado: por dónde pasa en el aro.
  const at = ballAt(legs, geo.hands, resultAt(legs))!;
  sig.set(kind, `${Math.round(at.x - geo.rim.x)},${Math.round(at.y - geo.rim.y)}`);
  if (MAKES.has(kind)) {
    // Entra: pasa por el aro y baja por debajo de él.
    const below = ballAt(legs, geo.hands, resultAt(legs) + 400)!;
    assert.ok(below.y > geo.rim.y, `${kind}: no baja por la red`);
    assert.ok(Math.abs(at.x - geo.rim.x) <= 5 && at.y <= geo.rim.y, `${kind}: no pasa por el aro`);
  }
}
assert.equal(new Set(sig.values()).size, KINDS.length, `dos resultados pasan por el mismo sitio del aro: ${[...sig].join(' | ')}`);
// Fallos a izquierda y derecha, lo corto y lo largo: cada uno por su lado.
const at = (k: ShotKind) => ballAt(pathFor(k, geo), geo.hands, resultAt(pathFor(k, geo)))!;
assert.ok(at('left').x < geo.rim.x - 8 && at('right').x > geo.rim.x + 8, 'los fallos laterales no se van a su lado');
assert.ok(at('long').y < geo.rim.y - 12, 'lo largo no pasa de largo');
assert.ok(at('short').y > geo.rim.y + 3, 'lo corto no se queda corto');

// ------------------------------------------------ 4. la sesión: cargar, tirar, resultado, listo; cortar en cualquier punto

function play(session: ShootingSession, powerTarget: number): string[] {
  const events: string[] = [];
  let ms = 0;
  // Pulsa hasta llegar a la potencia pedida, suelta y deja que el tiro acabe.
  while (session.phase !== 'flight' && ms < 4_000) {
    const hold = session.phase === 'ready' || session.power < powerTarget;
    for (const e of session.update(16, hold)) events.push(e.type);
    ms += 16;
  }
  while (session.phase === 'flight' && ms < 9_000) {
    for (const e of session.update(16, false)) events.push(e.type);
    ms += 16;
  }
  return events;
}
{
  const s = new ShootingSession(close, geo, seededRng(3));
  assert.equal(s.phase, 'ready');
  assert.ok(Math.hypot(s.ball()!.x - geo.hands.x, s.ball()!.y - geo.hands.y) < 1, 'el balón no empieza en las manos');
  // Un toque sin querer no tira.
  s.update(16, true);
  s.update(16, false);
  assert.equal(s.attempts, 0, 'un toque tira');
  assert.deepEqual(play(s, close.ideal), ['release', 'result', 'ready'], 'el orden de un tiro');
  assert.equal(s.attempts, 1);
  assert.equal(s.phase, 'ready');
  assert.equal(s.makes, s.last!.made ? 1 : 0);
  // Quedarse pulsado de más tira solo, no se atasca.
  const held = new ShootingSession(close, geo, seededRng(4));
  let ms = 0;
  while (held.phase !== 'flight' && ms < 3_000) {
    held.update(16, true);
    ms += 16;
  }
  assert.equal(held.phase, 'flight');
  assert.ok(ms <= SHOOTING.chargeMs + SHOOTING.overholdMs + 80, `tarda ${ms} ms en tirar solo`);
}
{
  // La mano suelta el balón un instante después de empezar el gesto, y luego cada milisegundo hay balón.
  const s = new ShootingSession(close, geo, seededRng(9));
  while (s.phase !== 'flight') s.update(16, s.phase === 'ready' || s.power < close.ideal);
  assert.equal(s.pose().pose, POSES.release, 'sin pose de tiro');
  assert.ok(s.pose().lift > 0, 'no salta al tirar');
  assert.ok(Math.abs(s.ball()!.x - geo.hands.x) < 1, 'el balón sale antes de que la mano lo suelte');
  let gone = 0;
  while (s.phase === 'flight') {
    if (!s.ball()) gone++;
    s.update(16, false);
  }
  assert.equal(gone, 0, 'el balón desaparece durante el tiro');
}
{
  // Cortar antes de soltar, y con el balón en el aire: el balón no existe, no se tira más, y nada se queda a medias.
  const a = new ShootingSession(close, geo, seededRng(1));
  a.update(16, true);
  a.update(300, true);
  a.cancel();
  assert.equal(a.ball(), null);
  assert.deepEqual(a.update(16, true), []);
  assert.equal(a.attempts, 0);
  const b = new ShootingSession(close, geo, seededRng(2));
  while (b.phase !== 'flight') b.update(16, b.phase === 'ready' || b.power < close.ideal);
  b.update(400, false);
  assert.ok(b.ball());
  b.cancel();
  assert.equal(b.ball(), null);
  assert.deepEqual(b.update(2_000, false), [], 'un tiro cancelado sigue dando resultado');
}
{
  // Sesiones seguidas: cada una empieza limpia (nada del tiro anterior), con su marcador.
  const tallies: string[] = [];
  for (let i = 0; i < 6; i++) {
    const s = new ShootingSession(close, geo, seededRng(50 + i));
    for (let k = 0; k < 5; k++) play(s, close.ideal + (k % 2 ? 0.15 : -0.05));
    assert.equal(s.attempts, 5);
    tallies.push(`${s.makes}/5`);
  }
  assert.ok(new Set(tallies).size > 1, `todas las sesiones dan igual: ${tallies}`);
}

// ------------------------------------------------ 5. limpieza en la escena: todo lo que se crea, se destruye

assert.ok(/this\.destroyCourt\(\);\s*this\.services\.hint\.hide\(\)/.test(scene), 'cambiar de escena no limpia la pista');
assert.ok(/c\.session\.cancel\(\);\s*this\.destroyCourt\(true\)/.test(scene), 'acabar no limpia el balón y el medidor');
assert.ok(/c\.ball\.destroy\(\);\s*c\.meter\.destroy\(\);\s*c\.net\.destroy\(\)/.test(scene), 'no se destruyen el balón, el medidor y la red');
assert.ok(/this\.court = null;\s*this\.services\.input\.setContext/.test(scene), 'el sitio no se suelta al volver');
assert.ok(/if \(this\.court\) claimed\.add\(this\.court\.point\)/.test(scene), 'la gente puede coger el sitio del jugador');
assert.ok(/console\.error\('\[basket\]/.test(scene) && /No se encuentra el balón/.test(scene), 'sin balón no se avisa');
// El entrenamiento del gimnasio sigue siendo el de siempre.
assert.ok(/Entrenar · \$\{STATIONS\[target\.station\]\.name\}/.test(scene), 'el gimnasio ha cambiado');

console.log(`Baloncesto: 6 sitios · acierto con buen tiempo ${(good.makes * 100).toFixed(0)}%, regular ${(mid.makes * 100).toFixed(0)}%, mal ${(bad.makes * 100).toFixed(0)}% · 7 caminos distintos del balón · sesión cancelable en cualquier punto`);
