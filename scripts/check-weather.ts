// El tiempo: `npm run check`. Falla si deja de ser determinista, si cambia de golpe,
// si el suelo no se seca, o si la gente deja de reaccionar (terrazas, calle, bares).
import assert from 'node:assert/strict';
import { forceWeather, forecast, isRainy, outdoorAppeal, skyOf, weatherAt, weatherEffects, weatherLabel, type Sky } from '../src/systems/Weather.ts';
import { dateOf } from '../src/systems/Calendar.ts';
import { streetWeatherScale, weatherBias } from '../src/systems/StreetLife.ts';
import { STREET_PROFILES } from '../src/data/streets.ts';
import { getStop, prepareRide } from '../src/systems/Transit.ts';

// El mismo día a la misma hora, el mismo tiempo; y en tres meses hay de todo.
assert.deepEqual(weatherAt(40, 15.5), weatherAt(40, 15.5));
const skies = new Map<string, number>();
const temps = new Map<string, number>();
let maxJump = 0;
for (let d = 1; d <= 90; d++) {
  for (let m = 0; m < 1440; m += 5) {
    const w = weatherAt(d, m / 60);
    skies.set(w.sky, (skies.get(w.sky) ?? 0) + 1);
    temps.set(w.temp, (temps.get(w.temp) ?? 0) + 1);
    if (m > 0) maxJump = Math.max(maxJump, Math.abs(w.rain - weatherAt(d, (m - 5) / 60).rain));
  }
}
for (const s of ['clear', 'cloudy', 'light-rain', 'heavy-rain']) assert.ok((skies.get(s) ?? 0) > 0, `en 90 días nunca hay ${s}`);
for (const t of ['warm', 'mild', 'cold']) assert.ok((temps.get(t) ?? 0) > 0, `en 90 días nunca hace ${t}`);
// Gradual: en cinco minutos la lluvia no pasa de nada a chaparrón.
assert.ok(maxJump < 0.35, `la lluvia cambia de golpe: ${maxJump.toFixed(2)} en cinco minutos`);

// El suelo moja con la lluvia y se seca solo al parar.
let checked = 0;
for (let d = 1; d <= 90 && checked < 3; d++) {
  for (let h = 6; h < 21; h += 0.25) {
    // El momento en que para: justo después, mojado; dos horas más tarde, más seco.
    if (!(weatherAt(d, h).rain > 0.2 && weatherAt(d, h + 0.25).rain === 0)) continue;
    const stop = weatherAt(d, h + 0.25);
    const later = weatherAt(d, h + 2.25);
    assert.ok(stop.wet > 0.3, `día ${d}: ha llovido y el suelo sigue seco`);
    assert.ok(later.wet < stop.wet, `día ${d}: ha parado y el suelo no se seca`);
    checked++;
    break;
  }
}
assert.ok(checked > 0, 'no hubo lluvia que comprobar');

// La gente reacciona: menos calle y menos terraza con lluvia; más dentro; más terraza con calor.
const rules = STREET_PROFILES[0].trips;
const terrace = rules.find((r) => r.role === 'terrace')!;
const toBar = rules.find((r) => r.role === 'diner')!;
const rain = { cloud: 1, rain: 0.9, wet: 1, celsius: 14, sky: 'heavy-rain', temp: 'mild' } as const;
const warm = { cloud: 0, rain: 0, wet: 0, celsius: 28, sky: 'clear', temp: 'warm' } as const;
assert.ok(weatherBias(terrace, rain) < 0.3 && weatherBias(terrace, warm) > 1.2, 'la terraza no nota el tiempo');
assert.ok(weatherBias(toBar, rain) > 1.2, 'con lluvia no se busca un sitio a cubierto');
assert.ok(streetWeatherScale(rain) < streetWeatherScale(warm), 'con lluvia hay la misma gente en la calle');
assert.ok(outdoorAppeal(rain) < outdoorAppeal(warm));

// Forzar para probar, y volver al calendario.
forceWeather({ rain: 0.9, celsius: 3 });
assert.equal(weatherAt(5, 12).sky, 'heavy-rain');
assert.equal(weatherAt(5, 12).temp, 'cold');
forceWeather(null);

// MAP-08: tormenta y niebla, previsión y efectos.
{
  let stormDays = 0;
  let fogDays = 0;
  const seen = new Set<Sky>();
  for (let d = 1; d <= 400; d++) {
    let storm = false;
    let fog = false;
    for (let m = 0; m < 1440; m += 10) {
      const w = weatherAt(d, m / 60);
      seen.add(w.sky);
      if (w.sky === 'storm') {
        storm = true;
        // La de ayer puede seguir de madrugada: cuenta la estación del día que la trajo.
        const from = m < 360 && dateOf(d).season === 'winter' ? d - 1 : d;
        assert.notEqual(dateOf(from).season, 'winter', `día ${d}: tormenta en invierno`);
      }
      if ((w.fog ?? 0) > 0) {
        assert.ok(w.rain <= 0.08, `día ${d} ${m} min: niebla con lluvia ${w.rain.toFixed(2)}`);
        if (w.sky === 'fog') fog = true;
      }
    }
    if (storm) stormDays++;
    if (fog) fogDays++;
  }
  assert.ok(stormDays >= 2 && stormDays <= 40, `tormenta ${stormDays} de 400 días (0,5–10 %)`);
  assert.ok(fogDays >= 8 && fogDays <= 80, `niebla ${fogDays} de 400 días (2–20 %)`);
  for (const s of ['clear', 'cloudy', 'fog', 'light-rain', 'heavy-rain', 'storm'] as const) assert.ok(seen.has(s), `en 400 días nunca hay ${s}`);
  assert.equal(skyOf(1, 0.9, 0, 0.9), 'storm');
  assert.equal(skyOf(0.2, 0, 0.8, 0), 'fog');
  assert.equal(skyOf(0.2, 0.3, 0.8, 0), 'light-rain');
  assert.ok(isRainy('storm') && !isRainy('fog'));
  assert.deepEqual(weatherAt(123, 5.5), weatherAt(123, 5.5));

  // La previsión es el tiempo que luego hace, también pasada la medianoche.
  const f = forecast(30, 20.5);
  assert.equal(f.length, 4);
  assert.deepEqual(f.map((x) => [x.day, x.hour]), [[30, 23.5], [31, 2.5], [31, 5.5], [31, 8.5]]);
  for (const x of f) assert.deepEqual(x.w, weatherAt(x.day, x.hour));
  assert.equal(weatherLabel(weatherAt(30, 20.5)).length > 0, true);

  // Efectos: andar más despacio con chaparrón y más con tormenta; el metro sólo se retrasa con tormenta o niebla.
  const at = (sky: Sky) => ({ cloud: 1, rain: 0, wet: 0, celsius: 14, sky, temp: 'mild' as const });
  const sun = weatherEffects(at('clear'));
  const heavy = weatherEffects(at('heavy-rain'));
  const storm = weatherEffects(at('storm'));
  assert.ok(sun.walkPace === 1 && heavy.walkPace < sun.walkPace && storm.walkPace < heavy.walkPace, 'el paso no nota el tiempo');
  assert.equal(sun.metroDelayPerStop, 0);
  assert.ok(storm.metroDelayPerStop > 0 && weatherEffects(at('fog')).metroDelayPerStop > 0);
  for (const s of seen) assert.ok(weatherLabel(at(s)).length > 0);
}

// MAP-08: el retraso llega al viaje real; la tarifa sigue siendo €2 exactos.
{
  const ride = (to: string, day?: number) => {
    const wallet = { money: 20, cards: { transport: 20 }, inventory: {} };
    const r = prepareRide(wallet, null, getStop('vallesco'), getStop(to), 12, day);
    if (!r.ok) throw new Error(r.message);
    assert.equal(r.wallet.cards.transport, 18, `${to}: no cobra €2 exactos`);
    return r.minutes;
  };
  const cases = [
    ['sol', { rain: 0, cloud: 0, fog: 0, gust: 0 }, 15, 60],
    ['tormenta', { rain: 0.9, cloud: 1, fog: 0, gust: 0.9 }, 18, 72],
    ['niebla', { rain: 0, cloud: 0.5, fog: 0.9, gust: 0 }, 16, 64],
  ] as const;
  for (const [name, w, ribera, arena] of cases) {
    forceWeather(w);
    assert.equal(ride('ribera', 5), ribera, `${name}: Vallesco–Ribera`);
    assert.equal(ride('arena', 5), arena, `${name}: Vallesco–Arena`);
  }
  forceWeather(cases[1][1]);
  assert.equal(ride('ribera'), 15, 'sin día no debe haber retraso');
  forceWeather(null);
}

console.log(`90 días: ${[...skies].map(([k, v]) => `${k} ${Math.round((v / 90 / 288) * 100)} %`).join(' · ')} · ${[...temps].map(([k, v]) => `${k} ${Math.round((v / 90 / 288) * 100)} %`).join(' · ')}`);
console.log('OK: tiempo determinista y gradual, el suelo se seca, la calle y los locales reaccionan.');
