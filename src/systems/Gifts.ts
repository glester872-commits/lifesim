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
