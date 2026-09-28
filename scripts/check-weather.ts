// El tiempo: `npm run check`. Falla si deja de ser determinista, si cambia de golpe,
// si el suelo no se seca, o si la gente deja de reaccionar (terrazas, calle, bares).
import assert from 'node:assert/strict';
import { forceWeather, outdoorAppeal, weatherAt } from '../src/systems/Weather.ts';
import { streetWeatherScale, weatherBias } from '../src/systems/StreetLife.ts';
import { STREET_PROFILES } from '../src/data/streets.ts';

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

console.log(`90 días: ${[...skies].map(([k, v]) => `${k} ${Math.round((v / 90 / 288) * 100)} %`).join(' · ')} · ${[...temps].map(([k, v]) => `${k} ${Math.round((v / 90 / 288) * 100)} %`).join(' · ')}`);
console.log('OK: tiempo determinista y gradual, el suelo se seca, la calle y los locales reaccionan.');
