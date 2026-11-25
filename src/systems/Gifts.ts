// Sin Phaser: lo usan WorldScene y scripts/check-department.ts.
import { getItem } from '../data/items.ts';
import { spend, type Wallet } from './Commerce.ts';
import { applyDelta, noteSocialMemory, type SocialDelta, type SocialMoment, type SocialProfile } from './Social.ts';

/**
 * Regalos (CV-03): lo que se compra en el departamento de regalos de Velarde se da hablando con alguien que ya conoces,
 * y queda en su perfil social (systems/Social.ts) como cualquier otra cosa que pasó: sube la amistad, la confianza y el
 * ánimo, y se recuerda («regalo: …»). Puras: devuelven perfil y cartera nuevos y quien llama los aplica.
 *
 * Reglas: a alguien que aún no conoces no se le regala; a la misma persona, un regalo al día (el segundo no suma
 * nada y no se gasta); el regalo sale de la bolsa al darlo, una unidad.
 */

/** Lo que hace cada regalo en el perfil de quien lo recibe. */
export const GIFTS: Readonly<Record<string, Omit<SocialDelta, 'romance' | 'attraction'> & { attraction?: number; given: string }>> = {
  'gift-chocolates': { friendship: 6, trust: 2, mood: 10, given: 'Le das la caja de bombones.' },
  'gift-cologne': { friendship: 8, trust: 3, mood: 12, attraction: 2, given: 'Le das la colonia, envuelta en el papel verde de Velarde.' },
  // CV-08A · de las mantas de Puerta Central: detalles de poco precio, que suman menos.
  'gift-bracelet': { friendship: 3, trust: 0, mood: 6, given: 'Le das la pulsera de hilo y te ayuda a atarla.' },
  'gift-necklace': { friendship: 5, trust: 1, mood: 8, given: 'Le das el colgante. Lo mira a contraluz antes de ponérselo.' },
  'gift-magnet': { friendship: 2, trust: 0, mood: 4, given: 'Le das el imán. «Para la nevera», dice, y se ríe.' },
  'gift-keyring': { friendship: 2, trust: 0, mood: 4, given: 'Le das el llavero y lo engancha en sus llaves en el momento.' },
  'gift-fan': { friendship: 3, trust: 0, mood: 6, given: 'Le das el abanico. Lo abre y se da aire, aunque no haga calor.' },
  // CA-03 · del Taller Biciclo de Campo Alto: accesorios para la bici de otra persona.
  'gift-bike-bell': { friendship: 2, trust: 0, mood: 4, given: 'Le das el timbre. Lo hace sonar dos veces, sin poder evitarlo.' },
  'gift-bike-light': { friendship: 3, trust: 1, mood: 5, given: 'Le das la luz. «Para volver de noche», dice, y la guarda en la mochila.' },
  // CAS-03 · del Gran Rastro: lo que vale es haberlo encontrado.
  'rastro-vinyl': { friendship: 4, trust: 1, mood: 7, given: 'Le das el disco. Lee la contraportada entera antes de darte las gracias.' },
  'rastro-book': { friendship: 3, trust: 1, mood: 5, given: 'Le das el libro. Lo primero que hace es leer la dedicatoria.' },
  'rastro-camera': { friendship: 6, trust: 2, mood: 9, given: 'Le das la cámara. Te saca una foto en el momento, por probar.' },
  'rastro-pocketwatch': { friendship: 6, trust: 2, mood: 8, given: 'Le das el reloj de bolsillo. Le da cuerda y se lo acerca al oído.' },
  'rastro-cartridge': { friendship: 3, trust: 0, mood: 6, given: 'Le das el cartucho. Sopla los contactos, por costumbre.' },
  'rastro-handheld': { friendship: 6, trust: 1, mood: 10, given: 'Le das la consola. La enciende y la pantalla verdosa le ilumina la cara.' },
  'rastro-badge': { friendship: 2, trust: 0, mood: 4, given: 'Le das la chapa y se la prende en la chaqueta.' },
  'rastro-keyring': { friendship: 2, trust: 0, mood: 4, given: 'Le das el llavero. Prueba la llave en el aire, por si acaso.' },
  // CAS-04 · rarezas: piezas únicas, pesan algo más que lo común.
  'rastro-vinyl-first': { friendship: 7, trust: 2, mood: 11, given: 'Le das el vinilo. Ve que es primera edición y se queda un rato sin decir nada.' },
  'rastro-book-signed': { friendship: 6, trust: 2, mood: 9, given: 'Le das el libro firmado. Pasa el dedo por la firma, sin tocar la tinta.' },
  'rastro-camera-slr': { friendship: 8, trust: 3, mood: 12, given: 'Le das la réflex. Mira por el visor y enfoca tu cara despacio.' },
  'rastro-figure': { friendship: 7, trust: 2, mood: 11, given: 'Le das la figura. No la saca de la caja: así vale más, te explica.' },
};

/** La nota que deja en su memoria: así se sabe si ya hubo regalo hoy. */
const NOTE = 'regalo';

/** Los regalos que llevas en la bolsa, con cuántos. */
export const giftsIn = (w: Wallet): { id: string; qty: number }[] =>
  Object.entries(w.inventory).filter(([id, qty]) => qty > 0 && id in GIFTS).map(([id, qty]) => ({ id, qty }));

/** Por qué no se puede regalar ahora a esta persona, o null. */
export function giftBlocker(profile: SocialProfile, day: number): string | null {
  if (profile.encounters < 1) return 'Aún no os conocéis lo bastante para regalarle nada.';
  // `giftDay` no se pierde con los recuerdos; el recuerdo sigue valiendo para partidas de antes de ese campo.
  if (profile.giftDay === day || profile.memories.some((m) => m.day === day && m.note?.startsWith(NOTE))) return 'Hoy ya le has dado algo. Mejor otro día.';
  return null;
}

export interface GiftResult {
  ok: boolean;
  message: string;
  profile: SocialProfile;
  wallet: Wallet;
}

/** Dar un regalo de la bolsa: todo o nada (sale de la bolsa y entra en su perfil a la vez). */
export function giveGift(profile: SocialProfile, w: Wallet, itemId: string, at: SocialMoment): GiftResult {
  const fail = (message: string): GiftResult => ({ ok: false, message, profile, wallet: w });
  const effect = GIFTS[itemId];
  if (!effect) return fail('Eso no es un regalo.');
  if (!w.inventory[itemId]) return fail('No lo llevas encima.');
  const blocked = giftBlocker(profile, at.day);
  if (blocked) return fail(blocked);
  const name = getItem(itemId).name;
  const { given, ...delta } = effect;
  const next = noteSocialMemory(applyDelta(profile, { romance: 0, attraction: 0, ...delta }), { kind: 'SHARED_EVENT', ...at, outcome: 'positive', note: `${NOTE}: ${name.toLowerCase()}` });
  return { ok: true, message: given, profile: { ...next, giftDay: at.day }, wallet: spend(w, itemId) };
}

/**
 * VID-09 · Compartir comida: un plato casero (data/items.ts home-meal, sale de cocinar) con alguien que está contigo en
 * una quedada en casa. Misma idea que el regalo: hay que conoceros, una vez al día por persona (un recuerdo de ese día
 * cuya nota empieza por «comida») y todo o nada.
 *
 * Raciones: un plato es una ración para una persona, nunca para dos. Si llevas dos o más, coméis los dos: salen dos
 * de la bolsa y tú recibes la energía del tuyo. Si llevas uno, se lo das a ella y tú no comes.
 */
export const MEAL = 'home-meal';
const MEAL_NOTE = 'comida';

/** Por qué no se puede compartir comida ahora con esta persona, o null. */
export function mealBlocker(profile: SocialProfile, w: Wallet, day: number): string | null {
  if (profile.encounters < 1) return 'Aún no os conocéis lo bastante para regalarle nada.';
  if (!w.inventory[MEAL]) return 'No llevas ningún plato casero. Se cocinan en la cocina de casa.';
  if (profile.memories.some((m) => m.day === day && m.note?.startsWith(MEAL_NOTE))) return 'Hoy ya habéis comido juntos. Mejor otro día.';
  return null;
}

export interface MealResult extends GiftResult {
  /** Energía para el jugador: la de su plato si comisteis los dos, 0 si sólo comió ella. */
  energy: number;
  /** Lo que se cuenta. */
  lines: string[];
}

/** Compartir un plato casero: perfil y cartera nuevos a la vez, o los mismos con el motivo. */
export function shareMeal(profile: SocialProfile, w: Wallet, at: SocialMoment): MealResult {
  const blocked = mealBlocker(profile, w, at.day);
  if (blocked) return { ok: false, message: blocked, profile, wallet: w, energy: 0, lines: [blocked] };
  const both = w.inventory[MEAL] >= 2;
  const next = noteSocialMemory(applyDelta(profile, { friendship: 5, attraction: 0, trust: 2, romance: 0, mood: 8 }), {
    kind: 'SHARED_EVENT', ...at, outcome: 'positive', note: `${MEAL_NOTE}: plato casero`,
  });
  const lines = both
    ? ['Sacas dos platos caseros y coméis juntos en la mesa.', '«¿Esto lo has hecho tú? Está buenísimo. Me tienes que pasar la receta.»']
    : ['Sólo te queda un plato casero: se lo das entero.', '«¿Y tú? ¿Seguro?» Lo prueba y sonríe. «Gracias. Está buenísimo.»'];
  return { ok: true, message: lines[0], profile: next, wallet: spend(w, MEAL, both ? 2 : 1), energy: both ? (getItem(MEAL).energy ?? 0) : 0, lines };
}
