// El carterista de la calle (systems/Pickpocket, sobre StreetLife): sólo con mucha gente alrededor y en zonas que lo permitan;
// rechazado en una calle de barrio vacía; víctima NPC o el jugador; el mismo ciclo de vida que el del metro; descanso y limpieza.
// La misma lógica que el juego, sin Phaser. Llamado desde la cadena `check` de package.json. `node scripts/check-pickpocket.ts`.
import assert from 'node:assert/strict';
import { METRO_CONFIG } from '../src/config/metro.ts';
import { ZONES, type ZoneType } from '../src/data/zones.ts';
import type { Clock } from '../src/systems/Crowd.ts';
import { getLocation } from '../src/systems/LocationSystem.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { crowdFactor, STREET_PICKPOCKET, type Robbery } from '../src/systems/Pickpocket.ts';
import { StreetLife, streetProfileFor } from '../src/systems/StreetLife.ts';

const SAT = 6;
const TUE = 2;
const MS = 500; // ms reales por minuto de juego
const loc = getLocation('district');
const profile = streetProfileFor('district')!;
const player = { tx: 90, ty: 49 }; // la calle del Carmen

const at = (day: number, minutes: number): Clock => ({ day: day + Math.floor(minutes / 1440), hour: Math.floor((minutes % 1440) / 60), minute: minutes % 60 });

/** Una calle poblada a esa hora, lista para avanzar en pasos de 100 ms. */
function street(day: number, hour: number, seed: number, who = player): { life: StreetLife; step: (ms: number) => void } {
  const life = new StreetLife(loc, profile, seededRng(seed));
  life.pickpocket.seed(seed + 1000);
  let minutes = Math.round(hour * 60);
  let acc = 0;
  life.populate(at(day, minutes), who);
  return {
    life,
    step: (ms: number) => {
      for (let t = 0; t < ms; t += 100) {
        acc += 100;
        if (acc >= MS) {
          acc -= MS;
          minutes++;
        }
        life.update(100, at(day, minutes), who);
      }
    },
  };
}

// --------------------------------------------------- 1. la regla: sólo donde hay gente y en zonas que lo permiten
{
  // Zonas: plazas, tiendas, el metro, la noche y los eventos sí; barrio, parque, avenida, gimnasio y terrazas, no.
  const types = new Set<ZoneType>(ZONES.map((z) => z.type));
  for (const t of ['residential', 'park', 'main_road', 'gym_area', 'restaurant_area'] as const) assert.ok(types.has(t) && !STREET_PICKPOCKET.zoneWeight[t], `${t}: no debería permitir robos`);
  for (const t of ['plaza', 'commercial', 'metro', 'nightlife', 'special_event_area'] as const) assert.ok((STREET_PICKPOCKET.zoneWeight[t] ?? 0) > 0, `${t}: debería permitirlos`);
  // La densidad: nada con pocos, plena con muchos.
  assert.equal(crowdFactor(STREET_PICKPOCKET.minCrowd - 1), 0);
  assert.ok(crowdFactor(STREET_PICKPOCKET.minCrowd) > 0 && crowdFactor(STREET_PICKPOCKET.minCrowd) < 0.3);
  assert.equal(crowdFactor(STREET_PICKPOCKET.fullCrowd), 1);
  // Raro: ni con la densidad plena pasa de la probabilidad del andén de hora punta, y el descanso es más largo que el del metro.
  assert.ok(STREET_PICKPOCKET.perSecond <= METRO_CONFIG.pickpocket.perSecond.RUSH_HOUR, 'la calle no es más rara que el metro');
  assert.ok(STREET_PICKPOCKET.cooldownMs >= METRO_CONFIG.pickpocket.cooldownMs * 2, 'el descanso de la calle no es más largo');
}

// --------------------------------------------------- 2. rechazado: poca gente (madrugada) y zona de barrio
{
  const quiet = street(TUE, 4, 3);
  quiet.step(30_000);
  const r = quiet.life.pickpocket.force(player);
  assert.equal(r.ok, false, 'un robo forzado de madrugada con la calle vacía');
  assert.match(r.reason, /rechazado/);
  assert.equal(quiet.life.pickpocket.lifecycle().lifecycle, 'ELIGIBLE');
  assert.ok(quiet.life.pickpocket.stats.rejected >= 1 && quiet.life.pickpocket.stats.started === 0);
  // Y por mucha gente que haya en una zona que no lo permite (el barrio), tampoco.
  const busy = street(SAT, 19, 4);
  busy.step(20_000);
  const resid = ZONES.find((z) => z.id === 'vallesco-residencial')!;
  const only = busy.life.agents.filter((a) => a.kind === 'visitor');
  const saved = only.map((a) => [a.x, a.y] as const);
  only.forEach((a, i) => {
    a.x = resid.rects[0].tx + (i % 5);
    a.y = resid.rects[0].ty + Math.floor(i / 5);
  });
  assert.equal(busy.life.pickpocket.force(player).ok, false, 'robo forzado en una calle de barrio llena de gente');
  only.forEach((a, i) => {
    a.x = saved[i][0];
    a.y = saved[i][1];
  });
}

// --------------------------------------------------- 3. gente de sobra en una zona que lo permite: un robo de principio a fin
function runIncident(seed: number, onPlayer: boolean): { life: StreetLife; phases: string[]; robbed: Robbery[] } {
  const s = street(SAT, 19, seed);
  const robbed: Robbery[] = [];
  s.life.pickpocket.onRobbed = (r) => robbed.push(r);
  // Se espera a que haya un grupo de verdad (una oleada del metro, una cola): la regla es la misma que sin forzar.
  let r = { ok: false, reason: '' };
  for (let wait = 0; wait < 300 && !r.ok; wait++) {
    r = onPlayer ? s.life.pickpocket.forceOnPlayer(player) : s.life.pickpocket.force({ tx: -999, ty: -999 });
    if (!r.ok) s.step(2_000);
  }
  assert.ok(r.ok, `forzado: ${r.reason}`);
  const phases: string[] = [];
  for (let i = 0; i < 1_800 && s.life.pickpocket.active; i++) {
    s.step(100);
    const e = s.life.pickpocket.lifecycle();
    if (phases[phases.length - 1] !== `${e.lifecycle}/${e.phase}`) phases.push(`${e.lifecycle}/${e.phase}`);
  }
  s.step(60_000); // que se vaya y se limpie
  return { life: s.life, phases, robbed };
}
{
  let completed = 0, noticedCount = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const r = runIncident(seed, false);
    assert.ok(!r.life.pickpocket.active, `seed ${seed}: el robo no se cerró (${r.phases.join(' > ')})`);
    assert.ok(r.life.agents.every((a) => !a.incident), `seed ${seed}: queda alguien marcado en el robo`);
    assert.ok(r.life.agents.every((a) => a.delay < 60_000), `seed ${seed}: alguien se queda parado para siempre`);
    assert.equal(r.life.pathFailures, 0);
    assert.equal(r.life.pickpocket.lifecycle().lifecycle, 'COOLDOWN', `seed ${seed}: sin descanso tras el robo`);
    assert.ok(r.life.pickpocket.lifecycle().cooldownLeft > 0);
    const seq = r.phases.join(' > ');
    assert.ok(seq.startsWith('SPAWNING/APPROACH'), `seed ${seed}: empieza por ${seq}`);
    if (seq.includes('ACTIVE/ATTEMPT')) {
      completed++;
      if (seq.includes('RESOLUTION/FLEE')) noticedCount++;
      else assert.ok(seq.includes('CLEANUP/LEAVE'), `seed ${seed}: ${seq}`);
    }
  }
  assert.ok(completed >= 12, `muy pocos robos llegan al tirón (${completed} de 24)`);
  assert.ok(noticedCount >= 3 && noticedCount < completed, `lo notan ${noticedCount} de ${completed}`);
  console.log(`  NPC: ${completed} de 24 llegan al tirón, ${noticedCount} descubiertos (huyen corriendo); todos acaban limpios y en descanso`);
}

// --------------------------------------------------- 4. la víctima es el jugador: se lleva efectivo (nunca más del que tiene)
{
  let robbedTimes = 0, noticed = 0, tries = 0, min = Infinity, max = 0;
  for (let seed = 1; seed <= 40 && robbedTimes < 8; seed++) {
    const r = runIncident(seed, true);
    tries++;
    for (const x of r.robbed) {
      robbedTimes++;
      if (x.noticed) noticed++;
      min = Math.min(min, x.amount);
      max = Math.max(max, x.amount);
      assert.ok(x.amount >= METRO_CONFIG.pickpocket.cash[0] && x.amount <= METRO_CONFIG.pickpocket.cash[1], `efectivo fuera de rango: ${x.amount}`);
    }
    assert.ok(r.life.agents.every((a) => !a.incident));
  }
  assert.ok(robbedTimes >= 3, `pocos robos al jugador (${robbedTimes} en ${tries})`);
  console.log(`  jugador: ${robbedTimes} robos en ${tries} intentos (${noticed} notados), de ${min.toFixed(2)} a ${max.toFixed(2)} €`);
}

// --------------------------------------------------- 5. descanso: tras un robo no vuelve a salir solo hasta pasado su tiempo
{
  const s = street(SAT, 19, 7);
  let forced = false;
  for (let wait = 0; wait < 300 && !forced; wait++) {
    forced = s.life.pickpocket.force({ tx: -999, ty: -999 }).ok;
    if (!forced) s.step(2_000);
  }
  assert.ok(forced, 'nunca hubo un grupo suficiente');
  for (let i = 0; i < 1_800 && s.life.pickpocket.active; i++) s.step(100);
  const started = s.life.pickpocket.stats.started;
  s.step(STREET_PICKPOCKET.cooldownMs - 30_000);
  assert.equal(s.life.pickpocket.stats.started, started, 'otro robo antes de acabar el descanso');
  assert.equal(s.life.pickpocket.lifecycle().lifecycle, 'COOLDOWN');
  s.life.pickpocket.resetCooldown();
  assert.equal(s.life.pickpocket.lifecycle().lifecycle, 'ELIGIBLE');
  // El ciclo común: mismo id que el resto de sucesos (tipo:sitio) y sin vigilancia que acuda en la calle.
  assert.equal(s.life.pickpocket.lifecycle().id, 'pickpocket:district');
  assert.deepEqual(s.life.pickpocket.lifecycle().responders, [], 'en la calle no hay vigilancia que acuda');
}

// --------------------------------------------------- 6. por sí solo: raro, y algunas veces sí
{
  let total = 0, windows = 0, worst = 0;
  const WINDOW_MS = 20 * 60_000; // veinte minutos reales = 40 horas de juego
  for (let seed = 1; seed <= 6; seed++) {
    const s = street(SAT, 19, seed + 50);
    s.step(WINDOW_MS);
    const n = s.life.pickpocket.stats.started;
    total += n;
    worst = Math.max(worst, n);
    windows++;
    assert.ok(s.life.agents.every((a) => !a.incident || s.life.pickpocket.active), 'marcas sueltas de un robo ya cerrado');
  }
  // Unos pocos en veinte minutos reales, nunca uno tras otro: con el descanso, como mucho uno cada doce minutos.
  assert.ok(worst <= Math.ceil(WINDOW_MS / STREET_PICKPOCKET.cooldownMs) + 1, `${worst} robos en una ventana: demasiados`);
  assert.ok(total >= 1, `ningún robo en ${windows} ventanas de 20 min con la calle llena: nunca pasa`);
  assert.ok(total / windows < 2, `${(total / windows).toFixed(1)} robos por ventana: no son raros`);
  console.log(`  natural: ${total} robos en ${windows} ventanas de 20 min reales (máximo ${worst} en una) con la calle del Carmen llena`);
}

console.log('check-pickpocket: sólo con mucha gente y en zonas que lo permiten, rechazado donde no, víctima NPC o jugador, ciclo común, descanso y limpieza, OK');
