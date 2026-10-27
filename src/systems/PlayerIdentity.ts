// Sin Phaser: lo usan systems/SaveSystem.ts, ui/CharacterCreator.ts y scripts/check-character.ts.
import type { PlayerIdentity } from '../types/game.ts';

/**
 * Quién es el jugador, aparte de cómo se ve (data/appearance) y de su cuerpo para chocar (entities/Player, que
 * no mira nada de esto). Hoy, sólo el nombre que se enseña: en la pantalla de inicio y en la pausa.
 */

export const NAME_MAX = 16;
/** Sin nombre válido: este, neutro. */
export const DEFAULT_NAME = 'Alex';

/**
 * El nombre tal como se guarda: sin caracteres de control ni invisibles, espacios juntos y en los bordes fuera,
 * sólo letras (de cualquier idioma, con tildes), números, espacio, guion, apóstrofo y punto, y como mucho
 * NAME_MAX caracteres. Si no queda nada con una letra, DEFAULT_NAME.
 */
export function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_NAME;
  const kept = raw
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}\p{N} '’.\-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  const cut = [...kept].slice(0, NAME_MAX).join('').trim();
  return /\p{L}/u.test(cut) ? cut : DEFAULT_NAME;
}

export const startIdentity = (): PlayerIdentity => ({ name: DEFAULT_NAME });

/** Una partida anterior a la identidad (versión 1) carga con el nombre por defecto; lo demás no cambia. */
export function parseIdentity(value: unknown): PlayerIdentity {
  const v = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return { name: cleanName(v.name) };
}
