// La Calle del Carmen como destino (data/popups.ts, data/streets.ts, systems/PopUps.ts): `npm run check`.
// Falla si falta un comercio, si el calendario de eventos no es determinista, se solapa o no se suspende con
// lluvia, si un evento no llena la calle de lo suyo, si la gente de la zona va toda igual o toda distinta,
// o si la calle no cambia de carácter entre las 12:00, las 18:00 y las 23:00.
import assert from 'node:assert/strict';
import { POPUPS } from '../src/data/popups.ts';
import { BIKES } from '../src/data/bikes.ts';
import { DISTRICTS } from '../src/data/districts.ts';
import { PLACES } from '../src/data/places.ts';
import { getLocation } from '../src/systems/LocationSystem.ts';
import { findPoint } from '../src/systems/Navigation.ts';
import { IDENTITIES } from '../src/systems/People.ts';
import { activePopUp, popUpCrowd, upcoming, visiblePopUp } from '../src/systems/PopUps.ts';
import { StreetLife, streetProfileFor, streetTargetAt, type Walker } from '../src/systems/StreetLife.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { forceWeather } from '../src/systems/Weather.ts';
import { weekIndex } from '../src/systems/Calendar.ts';
import type { Clock } from '../src/systems/Crowd.ts';

const loc = getLocation('district');
const profile = streetProfileFor('district')!;
const PLAYER = { tx: 72, ty: 53 };
const at = (day: number, hhmm: string): Clock => ({ day, hour: Number(hhmm.slice(0, 2)), minute: Number(hhmm.slice(3)) });

// ------------------------------------------------ los comercios que definen la calle
const carmen = loc.buildings!.filter((b) => b.tx >= 76 && b.ty >= 37 && b.tx < 110);
const styles = new Set(carmen.map((b) => b.style));
for (const s of ['vintage', 'thrift', 'streetwear', 'sneaker', 'tattoo', 'piercing', 'records', 'coffee', 'bar']) assert.ok(styles.has(s as never), `el Carmen no tiene ${s}`);
for (const b of carmen) if (!b.style.startsWith('res-')) assert.ok(PLACES.some((p) => p.building === b.id), `${b.name} no tiene lugar (horario, etiquetas)`);
const bar = PLACES.find((p) => p.id === 'bar-gaviota')!;
assert.ok(bar.tags.includes('nightlife') && bar.hours![1] < bar.hours![0], 'el bar abre por la noche y pasa de medianoche');
assert.ok(PLACES.find((p) => p.id === 'sneaker-store')!.tags.includes('fashion'));
for (const id of ['SUELA_ENTRANCE', 'NAVAJA_ENTRANCE', 'GAVIOTA_ENTRANCE', 'GAVIOTA_SMOKE_01', 'CARMEN_HANG_01', 'CARMEN_PHOTO_01', 'POPUP_BROWSE_01', 'POPUP_QUEUE_01', 'CARMEN_DANCE_01']) assert.ok(findPoint(id), `falta el punto ${id}`);
// Los patinadores van por el carril del Carmen más que por la avenida.
assert.ok(BIKES.some((b) => b.frame === 'skate'), 'ningún patinador');
assert.ok((DISTRICTS.vintage.vehicles?.all?.skater ?? 1) > 3 && !DISTRICTS.commercial.vehicles?.all?.skater, 'el Carmen atrae patinadores y la avenida no más que la media');

// ------------------------------------------------ el calendario de eventos
const WEEKS = 52;
const events = upcoming('district', 1, WEEKS * 7);
assert.equal(JSON.stringify(upcoming('district', 1, WEEKS * 7)), JSON.stringify(events), 'el calendario cambia entre llamadas');
for (const p of POPUPS) {
  const mine = events.filter((e) => e.id === p.id);
  assert.ok(mine.length >= 2, `${p.name}: sólo ${mine.length} veces en un año`);
  assert.ok(mine.length <= WEEKS * (p.span ?? 1), `${p.name}: demasiado frecuente (${mine.length})`);
  // Cada evento empieza el día de la semana que le toca (y dura su plazo).
  const starts = mine.filter((e) => !mine.some((o) => o.day === e.day - 1));
  for (const e of starts) assert.ok(p.days.includes(weekIndex(e.day)), `${p.name} empieza un día que no le toca (${e.day})`);
}
// Nunca dos montados a la vez: en ningún momento del año hay más de uno visible.
let both = 0;
for (let day = 1; day <= WEEKS * 7; day++) {
  for (let h = 0; h < 24; h += 0.5) {
    const c = { day, hour: Math.floor(h), minute: (h % 1) * 60 };
    const shown = POPUPS.filter((p) => events.some((e) => e.day === (h < 6 ? day - 1 : day) && e.id === p.id) && visiblePopUp('district', c)?.id === p.id);
    if (shown.length > 1) both++;
  }
}
assert.equal(both, 0, 'dos eventos montados a la vez');
// Sin evento, nada: un martes por la mañana no hay nada puesto.
assert.equal(activePopUp('district', at(2, '11:00')), undefined);
// Con lluvia fuerte se suspenden los de la calle; con buen tiempo, abren y se montan antes.
const onDay = (id: string): number => events.find((e) => e.id === id)!.day;
const market = onDay('vintage-market');
forceWeather({ rain: 0, cloud: 0, celsius: 20, wet: 0 });
assert.equal(activePopUp('district', at(market, '13:00'))?.id, 'vintage-market', 'el mercadillo no abre un día de mercadillo');
assert.equal(visiblePopUp('district', at(market, '10:30'))?.id, 'vintage-market', 'no se monta antes de abrir');
assert.equal(activePopUp('district', at(market, '10:30')), undefined, 'hay gente antes de abrir');
assert.equal(visiblePopUp('district', at(market, '19:30')), undefined, 'no se recoge');
forceWeather({ rain: 0.9, cloud: 1, celsius: 12, wet: 0.9 });
assert.equal(activePopUp('district', at(market, '13:00')), undefined, 'el mercadillo abre bajo un chaparrón');
forceWeather({ rain: 0, cloud: 0, celsius: 20, wet: 0 });
// El DJ pasa de medianoche y sigue siendo del mismo día.
const dj = onDay('dj-event');
assert.equal(activePopUp('district', at(dj, '22:30'))?.id, 'dj-event');
assert.equal(activePopUp('district', at(dj + 1, '00:30'))?.id, 'dj-event', 'el DJ se corta a medianoche');
assert.equal(activePopUp('district', at(dj + 1, '08:30')), undefined);

// ------------------------------------------------ lo que hace la calle
interface Seen {
  roles: Map<string, number>;
  fashions: Map<string, number>;
  peak: number;
}

/** Deja correr la calle `minutes` minutos de juego y cuenta quién hace qué (y cómo viste quien va al Carmen). */
function run(start: Clock, minutes: number, seed: number): Seen {
  const street = new StreetLife(loc, profile, seededRng(seed));
  street.populate(start, PLAYER);
  const seenAgent = new Set<number>();
  const roles = new Map<string, number>();
  const fashions = new Map<string, number>();
  let peak = 0;
  let clock = start;
  const note = (a: Walker): void => {
    if (seenAgent.has(a.id)) return;
    seenAgent.add(a.id);
    roles.set(a.role, (roles.get(a.role) ?? 0) + 1);
    if (/^(carmen-|popup-|bar-|sneaker-|piercing-)/.test(a.role)) fashions.set(IDENTITIES[a.look].fashion, (fashions.get(IDENTITIES[a.look].fashion) ?? 0) + 1);
  };
  for (const a of street.agents) note(a);
  for (let ms = 0; ms < minutes * 500; ms += 100) {
    street.update(100, clock, PLAYER);
    if (ms % 500 === 0) {
      const t = clock.hour * 60 + clock.minute + 1;
      clock = { day: clock.day + Math.floor(t / 1440), hour: Math.floor((t % 1440) / 60), minute: t % 60 };
    }
    peak = Math.max(peak, street.agents.length);
    for (const a of street.agents) note(a);
  }
  assert.equal(street.pathFailures, 0, 'rutas no encontradas');
  return { roles, fashions, peak };
}
const sum = (m: Map<string, number>, keys: readonly string[]): number => keys.reduce((s, k) => s + (m.get(k) ?? 0), 0);

// Cada evento llena la calle de lo suyo, sólo mientras dura.
const withMarket = run(at(market, '14:00'), 90, 11);
assert.ok((withMarket.roles.get('popup-market') ?? 0) >= 6, `el mercadillo no llena los puestos (${withMarket.roles.get('popup-market') ?? 0})`);
const release = run(at(onDay('sneaker-release'), '11:00'), 90, 12);
assert.ok((release.roles.get('popup-queue') ?? 0) >= 5, `la zapatilla no hace cola (${release.roles.get('popup-queue') ?? 0})`);
const party = run(at(dj, '21:00'), 90, 13);
assert.ok((party.roles.get('popup-dj') ?? 0) >= 5, `el DJ no tiene a nadie bailando (${party.roles.get('popup-dj') ?? 0})`);
const gallery = run(at(onDay('art-event'), '20:00'), 90, 14);
assert.ok((gallery.roles.get('popup-art') ?? 0) >= 5, `la inauguración está vacía (${gallery.roles.get('popup-art') ?? 0})`);
const pop = run(at(onDay('fashion-popup'), '14:00'), 90, 15);
assert.ok((pop.roles.get('popup-market') ?? 0) >= 4, `el pop-up de moda está vacío (${pop.roles.get('popup-market') ?? 0})`);
// Y sólo entonces: un sábado cualquiera sin evento no hay colas ni bailes ni puestos.
const saturdays = Array.from({ length: WEEKS }, (_, i) => i * 7 + 6);
const plainSaturday = saturdays.find((d) => !events.some((e) => e.day === d));
assert.ok(plainSaturday, 'todos los sábados tienen evento');
const plain = run(at(plainSaturday!, '14:00'), 90, 11);
assert.equal(sum(plain.roles, ['popup-market', 'popup-queue', 'popup-dj', 'popup-art']), 0, 'viajes de evento sin evento');
// La gente de más es de verdad: con el evento, la calle admite más paseantes que sin él.
assert.ok(popUpCrowd('district', at(market, '14:00')) >= 8 && popUpCrowd('district', at(plainSaturday!, '14:00')) === 0);
assert.ok(streetTargetAt(profile, at(market, '14:00')) > streetTargetAt(profile, at(plainSaturday!, '14:00')), 'el evento no sube la afluencia');

// ------------------------------------------------ el carácter de la calle a lo largo del día
// Un sábado sin evento: por el día, tiendas y escaparates; al caer la tarde, quedar y salir; de noche, bar y discoteca.
const noon = run(at(plainSaturday!, '12:00'), 120, 21);
const evening = run(at(plainSaturday!, '18:00'), 120, 22);
const night = run(at(plainSaturday!, '23:00'), 120, 23);
const DAY = ['carmen-browse', 'carmen-hang', 'carmen-outfit', 'carmen-bench', 'window-shopper'];
const NIGHT = ['bar-night', 'bar-smoke', 'club-queue', 'club-goer', 'club-smoke', 'carmen-prenight'];
assert.ok(sum(noon.roles, DAY) >= 4, `a las 12:00 el Carmen no tiene vida de tienda (${sum(noon.roles, DAY)})`);
assert.equal(sum(noon.roles, ['bar-night', 'bar-smoke', 'club-goer', 'club-queue']), 0, 'a las 12:00 hay gente de bar y de discoteca');
assert.ok(sum(evening.roles, ['carmen-prenight', 'bar-night', 'carmen-hang', 'carmen-friends']) >= 4, 'a las 18:00 no se queda a nadie');
assert.ok(sum(night.roles, NIGHT) >= 5, `a las 23:00 no hay noche (${sum(night.roles, NIGHT)})`);
assert.equal(sum(night.roles, ['carmen-browse', 'window-shopper']), 0, 'a las 23:00 se miran escaparates');
assert.ok((evening.roles.get('bar-smoke') ?? 0) + (night.roles.get('bar-smoke') ?? 0) > 0, 'nadie sale a fumar al bar');

// ------------------------------------------------ moda: mezcla, no uniforme
const fashions = new Map<string, number>();
// Dos tardes más a la muestra: skate es el estilo más raro (un 2 % de la calle) y con sólo seis tandas salía o no por azar.
const more = [run(at(plainSaturday!, '15:00'), 120, 31), run(at(plainSaturday!, '20:00'), 120, 32)];
for (const r of [noon, evening, night, withMarket, party, gallery, ...more]) for (const [f, n] of r.fashions) fashions.set(f, (fashions.get(f) ?? 0) + n);
const total = [...fashions.values()].reduce((s, n) => s + n, 0);
const ALT = ['vintage', 'alternative', 'punk', 'skate', 'experimental', 'streetwear', 'designer', 'nightlife'];
const alt = sum(fashions, ALT) / total;
assert.ok(total >= 60, `muestra demasiado pequeña (${total})`);
assert.ok(alt > 0.3 && alt < 0.78, `moda alternativa en el Carmen: ${(alt * 100).toFixed(0)} % (debe notarse sin ser todos)`);
assert.ok(sum(fashions, ['casual', 'office', 'sportswear', 'workwear', 'tourist', 'formal', 'athletic', 'luxury']) / total > 0.22, 'no hay ropa normal en el Carmen');
for (const f of ['vintage', 'punk', 'skate', 'experimental', 'streetwear']) assert.ok((fashions.get(f) ?? 0) > 0, `nadie viste ${f} en el Carmen`);

console.log(
  `Carmen OK: ${carmen.length} edificios · eventos al año ${POPUPS.map((p) => `${p.id.split('-')[0]} ${events.filter((e) => e.id === p.id).length}`).join(', ')} · ` +
  `moda alternativa ${(alt * 100).toFixed(0)} % de ${total} · 12:00 ${sum(noon.roles, DAY)} de día · 23:00 ${sum(night.roles, NIGHT)} de noche · ` +
  `mercadillo ${withMarket.roles.get('popup-market')}, cola ${release.roles.get('popup-queue')}, baile ${party.roles.get('popup-dj')}, arte ${gallery.roles.get('popup-art')} · punta ${Math.max(withMarket.peak, party.peak)} paseantes`,
);
