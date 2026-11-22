// Ojos rojos (QA-04) sin navegador: `node scripts/check-eye-frame.ts`.
// Con pelo o gorra rojos, el píxel de pelo pegado encima del ojo hacía que el ojo se leyera rojo. Encima de cada
// ojo no puede quedar rojo vivo (R > 2G y R > 2B) y el ojo sigue siendo el contorno (28, 22, 32), sin tocar.
// Tampoco puede fundirse con el ojo: si no es piel, dista del contorno más de 40 (RGB euclídea), o el ojo mide 3 px.
// Control positivo manual: quitar las llamadas a browsOverEyes() en world/HumanArt.ts hace fallar el caso (a) en
// 'down' (el flequillo, tone(#b8423a, -0.12) = 159, 58, 53, queda encima del ojo izquierdo).
// El lienzo es un contexto falso de 16 × 24 con transformación y getImageData por región (el de check-avatar
// devuelve siempre el lienzo entero y no tiene getTransform).
import assert from 'node:assert/strict';
import type { Facing } from '../src/types/game.ts';
import { drawHuman, type HumanColors, type Pose } from '../src/world/HumanArt.ts';
import type { Ctx } from '../src/world/paint.ts';

const W = 16;
const H = 24;
const EYE = [28, 22, 32];

function render(facing: Facing, colors: HumanColors, pose: Pose): Uint8ClampedArray {
  const data = new Uint8ClampedArray(W * H * 4);
  let t = { tx: 0, ty: 0, sx: 1, sy: 1 };
  const stack: (typeof t)[] = [];
  let fill = '#000000';
  const paint = (x: number, y: number, w: number, h: number, rgba: readonly number[] | null): void => {
    const [ax, bx] = [t.tx + t.sx * x, t.tx + t.sx * (x + w)];
    const [ay, by] = [t.ty + t.sy * y, t.ty + t.sy * (y + h)];
    for (let py = Math.min(ay, by); py < Math.max(ay, by); py++) {
      for (let px = Math.min(ax, bx); px < Math.max(ax, bx); px++) {
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        data.set(rgba ?? [0, 0, 0, 0], (py * W + px) * 4);
      }
    }
  };
  const rgba = (hex: string): number[] => {
    assert.match(hex, /^#[0-9a-f]{6}$/i, `color que el contexto falso no entiende: ${hex}`);
    const n = Number.parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
  };
  const ctx = {
    canvas: { width: W, height: H },
    get fillStyle(): string {
      return fill;
    },
    set fillStyle(v: string) {
      fill = v;
    },
    fillRect: (x: number, y: number, w: number, h: number): void => paint(x, y, w, h, rgba(fill)),
    clearRect: (x: number, y: number, w: number, h: number): void => paint(x, y, w, h, null),
    save: (): void => void stack.push({ ...t }),
    restore: (): void => {
      t = stack.pop()!;
    },
    translate: (x: number, y: number): void => {
      t.tx += t.sx * x;
      t.ty += t.sy * y;
    },
    scale: (x: number, y: number): void => {
      t.sx *= x;
      t.sy *= y;
    },
    getTransform: () => ({ a: t.sx, b: 0, c: 0, d: t.sy, e: t.tx, f: t.ty }),
    getImageData: (x0: number, y0: number, width: number, height: number) => {
      const out = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const [sx, sy] = [x0 + x, y0 + y];
          if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
          out.set(data.subarray((sy * W + sx) * 4, (sy * W + sx) * 4 + 4), (y * width + x) * 4);
        }
      }
      return { data: out, width, height };
    },
    putImageData: (img: { data: Uint8ClampedArray; width: number; height: number }, x0: number, y0: number): void => {
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          const [dx, dy] = [x0 + x, y0 + y];
          if (dx < 0 || dy < 0 || dx >= W || dy >= H) continue;
          data.set(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4), (dy * W + dx) * 4);
        }
      }
    },
  };
  drawHuman(ctx as unknown as Ctx, facing, pose, colors);
  return data;
}

const at = (d: Uint8ClampedArray, x: number, y: number): number[] => [...d.subarray((y * W + x) * 4, (y * W + x) * 4 + 4)];
const isEye = (p: readonly number[]): boolean => p[0] === EYE[0] && p[1] === EYE[1] && p[2] === EYE[2] && p[3] === 255;

const BASE: HumanColors = { cloth: '#c9743f', clothDark: '#9d5730', trousers: '#3c4152', shoes: '#23262f', hair: '#2a2430', skin: '#e3b692' };
const CASES: Record<string, HumanColors> = {
  'pelo rojo (short)': { ...BASE, hair: '#b8423a', hairStyle: 'short' },
  'gorra roja (bob)': { ...BASE, cap: '#b8423a', hair: '#6b5a3f', hairStyle: 'bob' },
  'ceja fina con piel oscura': { ...BASE, hair: '#1a1614', hairStyle: 'bald', skin: '#b27450', brows: 'fine' },
};
// Columnas donde puede estar el ojo: de frente, los dos; de perfil, x 10; a la izquierda, su espejo (x 5).
const COLUMNS: Record<'down' | 'left' | 'right', readonly (readonly number[])[]> = { down: [[6], [9]], right: [[10]], left: [[4, 5, 6]] };
const POSES: readonly Pose[] = [0, 1, 2, 36, 37];

let eyes = 0;
for (const [name, colors] of Object.entries(CASES)) {
  for (const facing of ['down', 'left', 'right'] as const) {
    for (const pose of POSES) {
      const d = render(facing, colors, pose);
      for (const xs of COLUMNS[facing]) {
        let found: [number, number] | null = null;
        for (const x of xs) {
          for (let y = 3; y <= 9 && !found; y++) if (isEye(at(d, x, y))) found = [x, y];
          if (found) break;
        }
        const where = `${name} ${facing}/${pose} x ${xs.join('|')}`;
        assert.ok(found, `${where}: no hay ojo`);
        const [x, y] = found;
        eyes++;
        // El ojo, intacto: dos píxeles del contorno (sin iris en estos colores).
        assert.ok(isEye(at(d, x, y + 1)), `${where}: el ojo ya no son dos píxeles de contorno`);
        const [r, g, b] = at(d, x, y - 1);
        assert.ok(!(r > 2 * g && r > 2 * b), `${where}: encima del ojo (y ${y - 1}) queda rojo ${r},${g},${b}`);
        // Ni tan oscuro que se funda con el ojo: si no es piel, lejos del contorno (el ojo no crece a 3 px).
        const skin = Number.parseInt(colors.skin.slice(1), 16);
        if (r !== ((skin >> 16) & 255) || g !== ((skin >> 8) & 255) || b !== (skin & 255)) {
          const dist = Math.hypot(r - EYE[0], g - EYE[1], b - EYE[2]);
          assert.ok(dist > 40, `${where}: encima del ojo (y ${y - 1}) queda ${r},${g},${b}, a ${dist.toFixed(1)} del contorno (≤ 40): el ojo parece de 3 px`);
        }
      }
    }
  }
}
assert.equal(eyes, Object.keys(CASES).length * POSES.length * 4, 'no se revisaron todos los ojos');

console.log('check-eye-frame: ok');
