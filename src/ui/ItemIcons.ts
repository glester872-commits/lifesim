import { PALETTE } from '../config/constants';
import { getItem } from '../data/items';
import type { GarmentDef } from '../data/retail';
import { px, shade, type Ctx } from '../world/paint';

/**
 * Iconos de los menús de compra (ui/Menu `icon`): un dibujo de 12 × 12 por prenda u objeto, pintado por código como el
 * resto del mundo (nada de imágenes) y agrandado sin suavizar en el menú. La forma sale de la categoría de la prenda o
 * del tipo y el id del objeto; el color, de la prenda. Se pintan una vez y se guardan.
 */

const SIZE = 12;
const OUTLINE = PALETTE.outline;
const cache = new Map<string, string>();

function draw(key: string, paint: (ctx: Ctx) => void): string {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  paint(ctx);
  const url = c.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

/** Caja con contorno: el cuerpo de casi todo (cuerpo, luz arriba, sombra abajo). */
function box(ctx: Ctx, color: string, x: number, y: number, w: number, h: number): void {
  px(ctx, OUTLINE, x - 1, y - 1, w + 2, h + 2);
  px(ctx, color, x, y, w, h);
  px(ctx, shade(color, 0.18), x, y, w, 1);
  px(ctx, shade(color, -0.2), x, y + h - 1, w, 1);
}

// ------------------------------------------------------------------ prendas

export function garmentIcon(g: GarmentDef): string {
  const main = g.color;
  const dark = g.dark ?? shade(main, -0.22);
  return draw(`g:${g.id}`, (ctx) => {
    switch (g.slot) {
      case 'top': {
        // Camiseta o chaqueta de frente: hombros, mangas (cortas o largas) y cuerpo.
        const long = (g.sleeve ?? 'long') === 'long';
        px(ctx, OUTLINE, 1, 1, 10, long ? 10 : 6);
        px(ctx, OUTLINE, 2, 1, 8, 11);
        px(ctx, main, 3, 2, 6, 9);
        if (g.sleeve !== 'none') {
          px(ctx, dark, 2, 2, 1, long ? 8 : 4);
          px(ctx, dark, 9, 2, 1, long ? 8 : 4);
        }
        px(ctx, shade(main, 0.2), 3, 2, 6, 1);
        px(ctx, OUTLINE, 5, 2, 2, 1); // cuello
        if (g.category === 'chaqueta' || g.category === 'camisa') px(ctx, dark, 6, 3, 1, 8);
        return;
      }
      case 'bottom':
        // Pantalón: cintura y dos perneras.
        px(ctx, OUTLINE, 2, 1, 8, 11);
        px(ctx, main, 3, 2, 6, 2);
        px(ctx, main, 3, 4, 2, 7);
        px(ctx, main, 7, 4, 2, 7);
        px(ctx, OUTLINE, 5, 4, 2, 8);
        px(ctx, shade(main, 0.2), 3, 2, 6, 1);
        return;
      case 'shoes':
        // Zapatilla de perfil: puntera, caña y suela clara.
        px(ctx, OUTLINE, 1, 4, 10, 7);
        px(ctx, main, 2, 5, 5, 3);
        px(ctx, main, 2, 7, 8, 2);
        px(ctx, shade(main, 0.2), 2, 5, 5, 1);
        px(ctx, PALETTE.white, 2, 9, 8, 1);
        return;
      case 'glasses': {
        // Dos cristales con su montura y el puente.
        const lens = g.lens === 'dark' ? PALETTE.ink : '#bfe3ff';
        for (const x of [1, 7]) {
          px(ctx, main, x, 4, 4, 4);
          px(ctx, lens, x + 1, 5, 2, 2);
        }
        px(ctx, main, 5, 5, 2, 1);
        px(ctx, main, 0, 4, 1, 1);
        px(ctx, main, 11, 4, 1, 1);
        return;
      }
      case 'cap':
        // Gorra: copa redonda y visera.
        px(ctx, OUTLINE, 2, 3, 7, 6);
        px(ctx, main, 3, 4, 5, 4);
        px(ctx, shade(main, 0.2), 4, 4, 2, 1);
        px(ctx, OUTLINE, 7, 7, 5, 2);
        px(ctx, dark, 8, 7, 3, 1);
        return;
      case 'scarf':
        // Bufanda: la vuelta al cuello y las dos puntas con flecos.
        px(ctx, OUTLINE, 1, 2, 10, 4);
        px(ctx, main, 2, 3, 8, 2);
        px(ctx, OUTLINE, 6, 5, 3, 7);
        px(ctx, main, 7, 5, 1, 5);
        px(ctx, shade(main, 0.2), 2, 3, 8, 1);
        for (const x of [6, 8]) px(ctx, PALETTE.white, x, 11, 1, 1);
        return;
    }
  });
}

// ------------------------------------------------------------------ objetos de la bolsa

const GIFT_RIBBON = '#d8b04a';

export function itemIcon(itemId: string): string {
  return draw(`i:${itemId}`, (ctx) => {
    const item = getItem(itemId);
    const id = item.id;
    if (id.includes('bracelet')) {
      // Pulsera: un aro de hilo de colores.
      for (const [x, y, c] of [[3, 3, '#c0493f'], [5, 2, '#d8b04a'], [7, 3, '#3f8f8a'], [8, 5, '#c0493f'], [7, 7, '#d8b04a'], [5, 8, '#3f8f8a'], [3, 7, '#c0493f'], [2, 5, '#d8b04a']] as const) px(ctx, c, x, y, 2, 2);
      return;
    }
    if (id.includes('necklace')) {
      // Colgante: cordón en V y la piedra.
      for (let i = 0; i < 4; i++) {
        px(ctx, '#7b5a3d', 2 + i, 1 + i * 2, 1, 2);
        px(ctx, '#7b5a3d', 9 - i, 1 + i * 2, 1, 2);
      }
      box(ctx, '#3f8f8a', 5, 8, 2, 2);
      return;
    }
    if (id.includes('magnet')) {
      // Imán de recuerdo: la rosa de los vientos en una placa.
      box(ctx, PALETTE.white, 2, 2, 8, 8);
      px(ctx, '#c0493f', 5, 3, 2, 6);
      px(ctx, '#c0493f', 3, 5, 6, 2);
      return;
    }
    if (id.includes('keyring')) {
      // Llavero: anilla y la miniatura.
      px(ctx, PALETTE.metal, 2, 1, 4, 1);
      px(ctx, PALETTE.metal, 1, 2, 1, 3);
      px(ctx, PALETTE.metal, 6, 2, 1, 3);
      px(ctx, PALETTE.metal, 2, 5, 4, 1);
      box(ctx, '#d8b04a', 5, 6, 4, 5);
      return;
    }
    if (id.includes('fan')) {
      // Abanico abierto: tela con flores sobre las varillas.
      px(ctx, OUTLINE, 1, 2, 10, 5);
      px(ctx, '#c0493f', 2, 3, 8, 3);
      for (const x of [3, 6, 8]) px(ctx, PALETTE.white, x, 4, 1, 1);
      for (let i = 0; i < 4; i++) px(ctx, '#7b5a3d', 2 + i * 2, 6 + Math.floor(i / 2), 1, 4 - Math.floor(i / 2));
      return;
    }
    switch (item.kind) {
      case 'gift':
        // Caja envuelta con lazo.
        box(ctx, id.includes('cologne') ? '#3f6f4a' : '#8c2f3f', 2, 4, 8, 7);
        px(ctx, GIFT_RIBBON, 5, 4, 2, 7);
        px(ctx, GIFT_RIBBON, 2, 6, 8, 1);
        px(ctx, GIFT_RIBBON, 3, 2, 2, 2);
        px(ctx, GIFT_RIBBON, 7, 2, 2, 2);
        return;
      case 'drink':
        if (id.includes('cola') || id.includes('energy')) {
          // Lata.
          box(ctx, id.includes('cola') ? '#c0493f' : '#3f8f8a', 3, 2, 6, 9);
          px(ctx, PALETTE.metal, 3, 2, 6, 1);
          px(ctx, PALETTE.white, 4, 5, 4, 2);
        } else {
          // Botella o brik.
          box(ctx, id.includes('juice') ? '#f2aa63' : '#8fd6cd', 3, 4, 6, 7);
          px(ctx, PALETTE.white, 5, 1, 2, 3);
          px(ctx, shade('#8fd6cd', 0.25), 4, 5, 1, 4);
        }
        return;
      case 'food':
        if (id.includes('seeds') || id.includes('chips')) {
          // Bolsa.
          box(ctx, id.includes('seeds') ? '#d8b04a' : '#c0493f', 2, 2, 8, 9);
          px(ctx, PALETTE.white, 4, 5, 4, 3);
        } else if (id.includes('bread')) {
          box(ctx, '#c08a4a', 1, 5, 10, 3);
          for (const x of [3, 6, 9]) px(ctx, shade('#c08a4a', -0.25), x, 5, 1, 1);
        } else if (id.includes('fruit')) {
          box(ctx, '#c0493f', 3, 4, 6, 6);
          px(ctx, PALETTE.leaf, 6, 2, 2, 2);
        } else {
          // Plato o envase con comida.
          box(ctx, PALETTE.white, 1, 6, 10, 4);
          px(ctx, '#c08a4a', 3, 5, 6, 2);
        }
        return;
      case 'medicine':
        box(ctx, PALETTE.white, 2, 3, 8, 6);
        px(ctx, '#c0493f', 5, 4, 2, 4);
        px(ctx, '#c0493f', 4, 5, 4, 2);
        return;
      case 'hygiene':
        box(ctx, '#8fd6cd', 3, 3, 6, 8);
        px(ctx, PALETTE.white, 5, 1, 2, 2);
        return;
      case 'card':
        box(ctx, '#3f5f8a', 1, 3, 10, 6);
        px(ctx, '#d8b04a', 2, 4, 3, 2);
        return;
      case 'ingredient':
        // La compra para cocinar: bolsa con lo que asoma.
        box(ctx, '#c4bdb0', 2, 4, 8, 7);
        px(ctx, PALETTE.leaf, 3, 2, 2, 2);
        px(ctx, '#c0493f', 6, 2, 2, 2);
        return;
    }
  });
}
