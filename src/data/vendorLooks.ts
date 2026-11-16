import type { NpcLook } from '../types/game';
import type { HairStyle } from './appearance';

/** Lo que distingue a quien atiende un puesto; world/PopUpArt pone la sombra de la ropa. */
export interface VendorLook {
  readonly hair: string;
  readonly cloth: string;
  readonly hairStyle: HairStyle;
  readonly skin: string;
  readonly trousers: string;
  readonly shoes: string;
  readonly facialHair?: NpcLook['facialHair'];
}

/**
 * Vendedores del Gran Rastro (CAS-07): doce looks para diez puestos, ninguno repetido. Pieles, pantalones y
 * zapatos salen de las listas de world/HumanArt; cada uno con su color de ropa.
 */
export const VENDOR_LOOKS: readonly VendorLook[] = [
  { hair: '#2b2420', cloth: '#4f6a8c', hairStyle: 'short', skin: '#e3b692', trousers: '#33374a', shoes: '#20232c', facialHair: 'stubble' },
  { hair: '#5a3a26', cloth: '#b8674a', hairStyle: 'bun', skin: '#b98462', trousers: '#2f4563', shoes: '#e6e0d4' },
  { hair: '#8a5a32', cloth: '#6a7a3f', hairStyle: 'curly', skin: '#96654a', trousers: '#5b4b3a', shoes: '#20232c' },
  { hair: '#1c1a1e', cloth: '#7a3f5a', hairStyle: 'bob', skin: '#f0caa8', trousers: '#232329', shoes: '#5a3a26' },
  { hair: '#3a2a22', cloth: '#d8b04a', hairStyle: 'buzz', skin: '#d3a17c', trousers: '#33374a', shoes: '#20232c', facialHair: 'beard' },
  { hair: '#b8915a', cloth: '#3f6f78', hairStyle: 'long', skin: '#f0caa8', trousers: '#6a6d75', shoes: '#e6e0d4' },
  { hair: '#1c1a1e', cloth: '#c0493f', hairStyle: 'afro', skin: '#96654a', trousers: '#3f4b3a', shoes: '#20232c' },
  { hair: '#2b2420', cloth: '#e6dcc0', hairStyle: 'braids', skin: '#b98462', trousers: '#232329', shoes: '#5a3a26' },
  { hair: '#3a2a22', cloth: '#8c5a6e', hairStyle: 'locs', skin: '#96654a', trousers: '#2f4563', shoes: '#20232c' },
  { hair: '#a04a2a', cloth: '#5a6a4a', hairStyle: 'ponytail', skin: '#e3b692', trousers: '#5b4b3a', shoes: '#e6e0d4' },
  { hair: '#6a6d75', cloth: '#2b2d33', hairStyle: 'bald', skin: '#d3a17c', trousers: '#6a6d75', shoes: '#5a3a26', facialHair: 'moustache' },
  { hair: '#9a9a9a', cloth: '#a07a4a', hairStyle: 'short', skin: '#b98462', trousers: '#3f4b3a', shoes: '#20232c' },
];
