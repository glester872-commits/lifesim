// El quiosco y la charla en la grada (systems/Concourse, data/concourse.ts), sin Phaser: el quiosco atiende sólo antes
// del saque y en el descanso del partido de aquí, vende cosas que existen, la charla sale del partido de verdad (nunca
// un gol o una victoria que no ha pasado), cada tema tiene al menos cuatro frases para cada cual y repetir la charla
// no repite la frase. Llamado desde la cadena `check` de package.json. `node scripts/check-concourse.ts`.
import assert from 'node:assert/strict';
import { getCatalog } from '../src/data/catalogs.ts';
import { getItem } from '../src/data/items.ts';
import { FAN_LINES, KIOSK_WINDOWS, type FanTopic, type Standing } from '../src/data/concourse.ts';
import { HALVES, LIVE_END } from '../src/data/matchPlay.ts';
import { STADIUM } from '../src/data/stadium.ts';
import { matchOn } from '../src/systems/Match.ts';
import { timelineOf, type Timeline } from '../src/systems/MatchPlay.ts';
import { fanLine, fanMoment, kioskService, reactionTopic } from '../src/systems/Concourse.ts';
import type { Supporter } from '../src/systems/StandLife.ts';

const tls: Timeline[] = Array.from({ length: 200 }, (_, i) => i + 1).filter((d) => matchOn(d)).map((d) => timelineOf(matchOn(d)!));
const tl = tls[0];
const at = (t: number): number => tl.kickoff + t;

// ------------------------------------------------------------ 1. el quiosco: horario del partido y lo que vende
const open = (t: number): boolean => kioskService(KIOSK_WINDOWS, tl, at(t)).open;
assert.ok(!open(-120), 'abierto antes de abrir puertas');
assert.ok(open(-60) && open(-1), 'cerrado antes del saque');
assert.ok(!open(10), 'abierto con el balón en juego');
assert.ok(open(HALVES.first.to + 1), 'cerrado en el descanso');
assert.ok(!open(HALVES.second.from + 1) && !open(LIVE_END + 5), 'abierto en la segunda parte o al acabar');
const why = (t: number): string => {
  const s = kioskService(KIOSK_WINDOWS, tl, at(t));
  assert.ok(!s.open);
  return s.lines.join(' ');
};
assert.match(why(10), /descanso/);
assert.match(why(LIVE_END + 5), /cerrado/);
assert.match(why(-150), /puertas/);
assert.match((kioskService(KIOSK_WINDOWS, null, 0) as { lines: string[] }).lines[0], /partido/);
const kiosk = STADIUM.terminals?.find((t) => t.serves);
assert.ok(kiosk, 'el estadio no tiene quiosco');
const products = getCatalog(kiosk.catalog).products;
assert.ok(products.length >= 3, 'el quiosco vende menos de tres cosas');
for (const p of products) {
  assert.ok(p.price > 0);
  if ('item' in p.effect) getItem(p.effect.item);
}
// Se llega por delante del mostrador y quien atiende tiene su sitio detrás.
assert.notEqual(STADIUM.ground[kiosk.ty + 1][kiosk.tx], 'W', 'no se llega al mostrador');
assert.ok(Object.entries(STADIUM.points ?? {}).some(([k, p]) => k.startsWith(kiosk.staff!) && p.ty === kiosk.ty - 1), 'nadie detrás del mostrador');
assert.ok(kiosk.tx > 12 || kiosk.tx + 1 < 11, 'el quiosco tapa la escalera o la salida');

// ------------------------------------------------------------ 2. sólo de lo que ya ha pasado
for (const t of tls) {
  for (let m = -90; m <= LIVE_END + 30; m += 0.5) {
    for (const who of ['home', 'away', 'neutral'] as const) {
      const fm = fanMoment(t, t.kickoff + m, who);
      const ours = who === 'away' ? 'away' : 'home';
      const done = t.moments.filter((x) => x.at <= m);
      if (fm.topic === 'goal-us') assert.ok(done.some((x) => x.goal && x.side === ours), `gol nuestro sin gol a ${m}`);
      if (fm.topic === 'goal-them') assert.ok(done.some((x) => x.goal && x.side !== ours), `gol suyo sin gol a ${m}`);
      if (fm.topic === 'chance-us' || fm.topic === 'chance-them') assert.ok(done.some((x) => !x.goal), `ocasión inventada a ${m}`);
      if (fm.topic === 'win' || fm.topic === 'loss' || fm.topic === 'draw') assert.ok(m >= LIVE_END, `resultado antes del final a ${m}`);
      if (fm.celebrate) assert.ok(done.some((x) => x.goal && x.side === 'home'), `celebrar sin gol de casa a ${m}`);
      if (m < 0) assert.equal(fm.topic, 'pre');
    }
  }
}

// ------------------------------------------------------------ 3. cuatro frases o más por tema, para cada cual
const topics: FanTopic[] = ['pre', 'match', 'chance-us', 'chance-them', 'goal-us', 'goal-them', 'half', 'win', 'draw', 'loss', 'bye', 'cheer-us', 'cheer-them', 'celebrate-us', 'celebrate-them'];
const standings: Standing[] = ['ahead', 'level', 'behind'];
for (const topic of topics) {
  for (const side of ['home', 'away'] as const) {
    for (const standing of standings) {
      const n = FAN_LINES.filter((l) => l.topic === topic && (!l.side || l.side === side) && (!l.standing || l.standing === standing)).length;
      assert.ok(n >= 4, `${topic}/${side}/${standing}: ${n} frases`);
    }
  }
}
assert.equal(new Set(FAN_LINES.map((l) => l.id)).size, FAN_LINES.length, 'frases con el mismo id');

// ------------------------------------------------------------ 4. repetir la charla no repite la frase; todo relleno
for (const who of ['home', 'away', 'neutral'] as Supporter[]) {
  for (const m of [-30, 20, HALVES.first.to + 3, LIVE_END + 2]) {
    const fm = fanMoment(tl, at(m), who);
    const heard: string[] = [];
    const said = Array.from({ length: 4 }, () => {
      const l = fanLine(fm.topic, fm, who, 77, heard, []);
      heard.push(l.id);
      assert.ok(!l.text.includes('{'), `sin rellenar: ${l.text}`);
      return l.id;
    });
    assert.equal(new Set(said).size, 4, `${who} a ${m}: se repite`);
    // Dos personas distintas no empiezan igual siempre.
    const firsts = new Set(Array.from({ length: 12 }, (_, s) => fanLine(fm.topic, fm, who, s, [], []).id));
    assert.ok(firsts.size >= 2, `todos dicen lo mismo a ${m}`);
  }
}
assert.equal(reactionTopic('celebrate', 'away'), 'celebrate-them');
assert.equal(reactionTopic('cheer', 'neutral'), 'cheer-us');

console.log(`check-concourse: ok (${tls.length} partidos)`);
