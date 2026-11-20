/**
 * SIM-05 · Compañero de piso. Sólo datos: las reglas (reparto, desde qué periodo cuenta, qué pasa al terminar o al
 * mudarse) están en systems/Roommate.ts y la convivencia se guarda con la partida (GameStateData.roommate).
 *
 * El reparto es sólo del alquiler: los suministros (luz, agua e internet) los sigues pagando tú enteros. La aportación
 * del compañero no pasa por tu cartera: rebaja tu parte de ese alquiler.
 */

export interface MateDef {
  id: string;
  /** Personaje con rutina (data/characters.ts) que se viene a vivir. */
  npc: 'kevin';
  name: string;
  /** Por qué quiere compartir, dicho al proponerlo. */
  motive: string;
  /** Fracción del ALQUILER que paga él (el resto de céntimos, a tu parte). */
  share: number;
  /** Condiciones, dichas antes de confirmar. */
  terms: readonly string[];
}

export const MATES: readonly MateDef[] = [
  {
    id: 'kevin',
    npc: 'kevin',
    name: 'Kevin',
    motive: 'Kevin busca piso: en Ribera le suben el alquiler y prefiere compartir con alguien de confianza.',
    share: 0.4,
    terms: [
      'Paga el 40 % de cada alquiler semanal; tú, el resto. Su parte rebaja lo que pagas tú, no entra en tu cartera.',
      'Luz, agua e internet los sigues pagando tú enteros.',
      'Duerme en casa y hace el día por Ribera: sale por la mañana y vuelve por la tarde al salón.',
      'Espera que pagues tu parte del alquiler antes de que venza: se acuerda de si cumples.',
    ],
  },
];

export const getMate = (id: string): MateDef => {
  const m = MATES.find((x) => x.id === id);
  if (!m) throw new Error(`Compañero desconocido: ${id}`);
  return m;
};
