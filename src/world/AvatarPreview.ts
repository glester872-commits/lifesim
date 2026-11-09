import { PALETTE } from '../config/constants';
import { lookChange } from '../systems/Appearance';
import type { Facing } from '../types/game';
import { drawPersonFine } from './HumanArtHD';
import type { HumanColors } from './HumanArt';

/**
 * Antes y después de un cambio de aspecto, con el mismo dibujo que el sprite del juego: cada dirección sobre suelo
 * claro y de noche, a factor entero y sin suavizar (AVATAR-LV06.md, D8). Va dentro del panel del menú (ui/Menu.figure).
 */

const W = 16;
const H = 24;
const GAP = 2;
const FLOORS = ['#b8b0a2', PALETTE.night] as const;
const ORDER: readonly Facing[] = ['down', 'left', 'right', 'up'];
const FACING_NAME: Readonly<Record<Facing, string>> = { down: 'de frente', left: 'por la izquierda', right: 'por la derecha', up: 'de espaldas' };

/** Ancho útil del panel con preview: `#menu.has-figure` (style.css), menos relleno y borde. */
const roomIn = (viewport: number): number => Math.min(580, viewport - 32) - 40;

function sprite(facing: Facing, colors: HumanColors): CanvasRenderingContext2D {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Sin canvas 2D');
  drawPersonFine(ctx, facing, 0, colors);
  return ctx;
}

export function avatarPreview(before: HumanColors, after: HumanColors, viewport: number, viewportH: number): { el: HTMLElement; note: string } {
  const factor = viewport < 360 || viewportH < 480 ? 3 : 4;
  const wide = roomIn(viewport) >= (ORDER.length * W * 2 + (ORDER.length - 1) * GAP) * factor;
  const cols = wide ? ORDER.length : 2;
  const logicalW = cols * W * 2 + (cols - 1) * GAP;
  const logicalH = FLOORS.length * H + GAP;

  // Entero en píxeles de dispositivo: con devicePixelRatio fraccionario tampoco se emborrona.
  const dpr = window.devicePixelRatio || 1;
  const scale = Math.max(1, Math.round(factor * dpr));
  const canvas = document.createElement('canvas');
  canvas.width = logicalW * scale;
  canvas.height = logicalH * scale;
  canvas.style.width = `${(logicalW * scale) / dpr}px`;
  canvas.style.height = `${(logicalH * scale) / dpr}px`;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Antes y después en cuatro direcciones, sobre suelo claro y de noche.');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Sin canvas 2D');
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  const changes = ORDER.map((facing, i) => {
    const was = sprite(facing, before);
    const is = sprite(facing, after);
    // A lo ancho, cada dirección sobre los dos suelos. En estrecho no caben sin salirse de la pantalla: dos direcciones
    // sobre cada suelo, como el creador de personaje. La legibilidad se mide igual sobre los dos.
    const slots = wide ? FLOORS.map((floor, row) => ({ floor, col: i, row })) : [{ floor: FLOORS[i < 2 ? 0 : 1], col: i % 2, row: i < 2 ? 0 : 1 }];
    slots.forEach(({ floor, col, row }) => {
      const x = col * (W * 2 + GAP);
      const y = row * (H + GAP);
      ctx.fillStyle = floor;
      ctx.fillRect(x, y, W * 2, H);
      ctx.drawImage(was.canvas, x, y);
      ctx.drawImage(is.canvas, x + W, y);
    });
    return lookChange(was.getImageData(0, 0, W, H).data, is.getImageData(0, 0, W, H).data, FLOORS);
  });

  const faint = ORDER.filter((_, i) => changes[i] === 'faint').map((f) => FACING_NAME[f]);
  const note = changes.every((c) => c === 'none') ? 'Con lo que llevas, no se verá.' : faint.length > 0 ? `A tamaño de juego casi no se distingue ${faint.join(', ')}.` : '';

  const el = document.createElement('div');
  const caption = document.createElement('p');
  caption.className = 'menu__caption';
  caption.textContent = 'En cada pareja: antes, después.';
  el.append(canvas, caption);
  return { el, note };
}
