// Sin Phaser: lo usan la calle (StreetLife), los locales (Crowd), el metro (MetroSystem), la depuración y
// scripts/check-handoff.ts.
import { placeInfo, type PlaceInfo } from './Places.ts';
import { profileFor } from './Crowd.ts';

/**
 * Quien entra por una puerta delante del jugador sigue existiendo dentro.
 *
 * La calle y los locales no se simulan a la vez (sólo existe lo que ve el
 * jugador), así que el paso de una puerta deja aquí una ficha corta: quién es
 * (su cara, PASSENGER_LOOKS, y la semilla de su ropa del día), a qué sitio
 * entró, por qué puerta, cuándo y hasta cuándo se queda. Si el jugador entra
 * detrás, el local la lee y esa misma persona está dentro: recién llegada en
 * la puerta si la sigue enseguida, a mitad de lo suyo si tarda. Cuando se va
 * (por su plan o por su hora) sale por la misma puerta a la calle, si el
 * jugador está ahí para verlo. Y mientras está dentro no puede estar fuera.
 *
 * Es memoria de corto plazo, no un personaje nuevo: sólo se apunta a quien el
 * jugador ha podido ver entrar, hay un tope por sitio, y la ficha se borra al
 * salir o al pasar su hora. Los personajes con nombre no la necesitan: su
 * rutina (systems/Characters) ya dice dónde están a cada minuto.
 * ponytail: no va en la partida guardada; al recargar, quien estaba dentro ya no está (lo normal tras horas fuera).
 */
export interface Handoff {
  /** Id de la ficha: calle, persona y minuto de entrada. */
  token: string;
  /** Índice en PASSENGER_LOOKS: la persona. */
  look: number;
  /** Semilla de la ropa del día (world/WeatherLooks.dressedLook): el mismo abrigo dentro que fuera. */
  dressSeed: number;
  role: string;
  label: string;
  line: string;
  /** Lugar (data/places.ts) y su interior. */
  place: string;
  interior: string;
  /** Calle y puerta (punto) por la que entró. */
  from: string;
  door: string;
  /** Minutos absolutos de juego: (día − 1)·1440 + minuto del día. */
  enteredAt: number;
  leaveAt: number;
  /** Ya salió de verdad (el local lo vio irse por la puerta), y cuándo. */
  exitedAt?: number;
  /** Ya volvió a la calle (o se fue sin que nadie lo viera): la ficha se borra. */
  done?: boolean;
  /** El metro: sigue en el andén hasta su tren y no vuelve a salir por la boca. */
  transit: boolean;
}

/** Tope por sitio: unos pocos; quien entró antes deja sitio. */
export const MAX_PER_PLACE = 6;
/** Minutos que alguien recién entrado sigue en la puerta: si el jugador entra en ese tiempo, lo ve llegar. */
export const FRESH_MINUTES = 2;
/** Si sale a la calle y el jugador no estaba en esa calle en estos minutos, ya se ha ido lejos. */
const EMERGE_WINDOW = 4;

/** Cuánto se queda dentro, en minutos de juego, por tipo de sitio: lo que dura una visita normal. */
function stayRange(place: PlaceInfo): readonly [number, number] {
  if (place.type === 'transit') return [6, 10];
  if (place.tags.includes('sport') || place.tags.includes('fitness')) return [45, 80];
  if (place.tags.includes('nightlife')) return [40, 90];
  if (place.tags.includes('food')) return [25, 55];
  if (place.tags.includes('shop')) return [8, 20];
  return [15, 40];
}

const QUEUE: Handoff[] = [];

export const absMinute = (day: number, hour: number, minute: number): number => (day - 1) * 1440 + hour * 60 + minute;

/**
 * El sitio de esa puerta admite el traspaso: tiene interior con gente (Crowd) o es el metro. Una casa, una
 * oficina sin interior o una puerta de atrás, no.
 */
export function handoffPlace(placeId: string | undefined): PlaceInfo | undefined {
  const place = placeId ? placeInfo(placeId) : undefined;
  if (!place?.interior) return undefined;
  return place.type === 'transit' || profileFor(place.id) ? place : undefined;
}

/** Alguien cruza la puerta de `placeId` desde la calle `from` a ese minuto. `roll` (0–1) fija cuánto se queda. */
export function enterPlace(p: {
  place: string; from: string; door: string; look: number; dressSeed: number; role: string; label: string; line: string; at: number; roll: number;
}): Handoff | undefined {
  const place = handoffPlace(p.place);
  if (!place) return undefined;
  const [lo, hi] = stayRange(place);
  const h: Handoff = {
    token: `${p.from}#${p.look}@${Math.floor(p.at)}`,
    look: p.look, dressSeed: p.dressSeed, role: p.role, label: p.label, line: p.line,
    place: place.id, interior: place.interior!, from: p.from, door: p.door,
    enteredAt: p.at, leaveAt: p.at + lo + p.roll * (hi - lo), transit: place.type === 'transit',
  };
  // La misma persona no está en dos sitios: si tenía otra ficha abierta, esa se cierra.
  for (const o of QUEUE) if (o.look === p.look && !o.done) o.done = true;
  QUEUE.push(h);
  const here = QUEUE.filter((o) => o.place === place.id && !o.done);
  for (const o of here.slice(0, Math.max(0, here.length - MAX_PER_PLACE))) o.done = true;
  prune(p.at);
  return h;
}

/** Quien está dentro de ese sitio a ese minuto (entró y ni ha salido ni ha pasado su hora). */
export function insideOf(placeId: string, now: number): Handoff[] {
  return QUEUE.filter((h) => h.place === placeId && !h.done && h.exitedAt === undefined && h.enteredAt <= now && now < h.leaveAt);
}

/** Caras que ahora mismo están dentro de algún sitio: la calle no las saca a pasear. */
export function insideLooks(now: number): Set<number> {
  return new Set(QUEUE.filter((h) => !h.done && h.exitedAt === undefined && h.enteredAt <= now && now < h.leaveAt).map((h) => h.look));
}

/** El local lo ha visto salir por la puerta. */
export function markExited(token: string, now: number): void {
  const h = QUEUE.find((o) => o.token === token);
  if (h && h.exitedAt === undefined) h.exitedAt = now;
}

/**
 * Quien sale ahora a la calle `from` por su puerta: acaba de irse del local (o le ha llegado la hora sin que
 * nadie lo viera dentro). El metro no devuelve a nadie: se fue en un tren. Cada ficha sale una vez.
 */
export function dueOut(from: string, now: number): Handoff[] {
  const out: Handoff[] = [];
  for (const h of QUEUE) {
    if (h.done || h.from !== from) continue;
    const at = h.exitedAt ?? h.leaveAt;
    if (now < at) continue;
    h.done = true;
    if (!h.transit && now - at <= EMERGE_WINDOW) out.push(h);
  }
  return out;
}

/** Borra lo cerrado y lo que ya no puede volver a verse. */
export function prune(now: number): void {
  for (let i = QUEUE.length - 1; i >= 0; i--) {
    const h = QUEUE[i];
    if (h.done || now - (h.exitedAt ?? h.leaveAt) > EMERGE_WINDOW) QUEUE.splice(i, 1);
  }
}

/** Depuración (lifesim.handoff): la cola tal cual. */
export function handoffs(): readonly Handoff[] {
  return QUEUE;
}

/** Para los scripts: vaciar la cola. */
export function resetHandoffs(): void {
  QUEUE.length = 0;
}
