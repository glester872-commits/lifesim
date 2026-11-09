// Accesorios y barbería (LV-06) sin navegador: `node scripts/check-avatar.ts`.
// Control positivo manual: quitar hat() de la rama 'buzz' de hairFront (world/HumanArt.ts) hace fallar (2) en 'down' y
// 'up' («buzz sin gorra»); el (1) corre siempre con un peinado que ya pintaba gorra, para distinguir «el helper no
// dibuja nada» de «falta la gorra en una rama».
// El lienzo es un contexto falso de 16 × 24: se prueba el dibujo de world/HumanArt, no la pantalla (AVATAR-LV06.md).
import assert from 'node:assert/strict';
import { PALETTE, PLAYER_BODY, PLAYER_SPEED, SAVE_VERSION } from '../src/config/constants.ts';
import { FACTORY_HAIR_COLOR, HAIR_DYE, HAIR_EXTRA_MINUTES, HAIR_EXTRA_PRICE, HAIRSTYLES, type Appearance } from '../src/data/appearance.ts';
import { UNIFORM_LOOKS } from '../src/data/npcs.ts';
import { GARMENTS, getGarment } from '../src/data/retail.ts';
import { dyeHair, haircut, haircutQuote, lookChange, reworkTattoo, tattooAt, tattooWorks, visibleTattoos, withAppearance, withUniform } from '../src/systems/Appearance.ts';
import type { Wallet } from '../src/systems/Commerce.ts';
import { buyGarment } from '../src/systems/Retail.ts';
import { MemoryStorage, slotSave } from '../src/systems/SaveSlots.ts';
import { createInitialState, inspectRaw, restore, SaveSystem } from '../src/systems/SaveSystem.ts';
import type { Facing } from '../src/types/game.ts';
import { partOf } from '../src/world/Garments.ts';
import { drawHuman, type HumanColors } from '../src/world/HumanArt.ts';
import type { Ctx } from '../src/world/paint.ts';

const W = 16;
const H = 24;
const FACINGS: readonly Facing[] = ['down', 'up', 'left', 'right'];
const BASE: HumanColors = { cloth: '#c9743f', clothDark: '#9d5730', trousers: '#3c4152', shoes: '#23262f', hair: '#2a2430', skin: '#e3b692' };
const SAVED_AT = Date.UTC(2026, 9, 1);
const NEGRAS = 'gafas-sol-negras';
const AVIADOR = 'gafas-sol-aviador';
const CLARAS = 'gafas-pasta-clara';
const GORRA = 'gorra-halcones';
const GORRA_NEGRA = 'gorra-negra';
const BUFANDA = 'bufanda-naranja';

let outside = 0;
let writes = 0;

/** Contexto falso de 16 × 24 RGBA con lo que usa drawHuman en la pose 0; cuenta lo que se pinte fuera del lienzo. */
function render(facing: Facing, colors: HumanColors): Uint8ClampedArray {
  const data = new Uint8ClampedArray(W * H * 4);
  let t = { tx: 0, ty: 0, sx: 1, sy: 1 };
  const stack: (typeof t)[] = [];
  let fill = '#000000';
  const paint = (x: number, y: number, w: number, h: number, rgba: readonly number[] | null): void => {
    const [ax, bx] = [t.tx + t.sx * x, t.tx + t.sx * (x + w)];
    const [ay, by] = [t.ty + t.sy * y, t.ty + t.sy * (y + h)];
    for (let py = Math.min(ay, by); py < Math.max(ay, by); py++) {
      for (let px = Math.min(ax, bx); px < Math.max(ax, bx); px++) {
        writes++;
        if (px < 0 || py < 0 || px >= W || py >= H) {
          outside++;
          continue;
        }
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
    getImageData: (_x: number, _y: number, width: number, height: number) => ({ data: data.slice(), width, height }),
    putImageData: (img: { data: Uint8ClampedArray }): void => data.set(img.data),
  };
  drawHuman(ctx as unknown as Ctx, facing, 0, colors);
  return data;
}

/** Píxeles distintos entre dos dibujos, en las filas y0..y1. */
function diff(a: Uint8ClampedArray, b: Uint8ClampedArray, y0 = 0, y1 = H - 1): number {
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) n++;
    }
  }
  return n;
}

const pixelDiffers = (a: Uint8ClampedArray, b: Uint8ClampedArray, x: number, y: number): boolean => {
  const i = (y * W + x) * 4;
  return a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3];
};

const dressed = (changes: Appearance): HumanColors => withAppearance(BASE, changes);
const wallet = (money: number): Wallet => ({ money, inventory: { agua: 1 }, cards: { transport: 5 } });
const fileOf = (state: unknown, version: number = SAVE_VERSION): string => JSON.stringify({ version, savedAt: SAVED_AT, state });
const read = (state: unknown, version: number = SAVE_VERSION) => {
  const info = inspectRaw(fileOf(state, version));
  assert.equal(info.status, 'ok', `versión ${version}: no carga`);
  return info.status === 'ok' ? info.state : createInitialState();
};
const reload = (state: ReturnType<typeof createInitialState>) => {
  const save = new SaveSystem(new MemoryStorage());
  assert.ok(save.save(state), 'no guarda');
  return restore(save.load());
};

// 1. Control positivo: con un peinado que siempre pintó gorra, el helper la ve en las cuatro direcciones.
for (const facing of FACINGS) {
  const none = render(facing, dressed({ hair: 'short' }));
  const cap = render(facing, dressed({ hair: 'short', cap: GORRA }));
  assert.ok(diff(none, cap) > 0, `control: la gorra no se dibuja en ${facing}`);
}

// 2. Gorra en todos los peinados y direcciones (la negra sobre pelo negro sólo exige un píxel: su contraste es visual).
for (const h of HAIRSTYLES) {
  for (const facing of FACINGS) {
    const none = render(facing, dressed({ hair: h.id }));
    for (const id of [GORRA, GORRA_NEGRA]) assert.ok(diff(none, render(facing, dressed({ hair: h.id, cap: id }))) > 0, `${h.id} sin gorra ${id} en ${facing}`);
  }
}

// 3. Gafas: se ven de frente y de perfil; de espaldas, ni un píxel.
for (const h of HAIRSTYLES) {
  for (const id of [NEGRAS, CLARAS]) {
    for (const facing of FACINGS) {
      const none = render(facing, dressed({ hair: h.id }));
      const worn = render(facing, dressed({ hair: h.id, glasses: id }));
      if (facing === 'up') assert.equal(diff(none, worn), 0, `${h.id}/${id}: las gafas se ven de espaldas`);
      else assert.ok(diff(none, worn) > 0, `${h.id}/${id}: las gafas no se ven en ${facing}`);
    }
  }
}

// 4. La montura se distingue; quien no tiene montura propia (NPC) pinta como siempre.
for (const facing of ['right', 'down'] as const) {
  assert.ok(diff(render(facing, dressed({ glasses: AVIADOR })), render(facing, dressed({ glasses: NEGRAS }))) > 0, `aviador y negras iguales en ${facing}`);
  assert.equal(diff(render(facing, { ...BASE, glasses: 'dark' }), render(facing, { ...BASE, glasses: 'dark', glassesFrame: PALETTE.ink })), 0, `dark sin montura cambia en ${facing}`);
  assert.equal(diff(render(facing, { ...BASE, glasses: 'clear' }), render(facing, { ...BASE, glasses: 'clear', glassesFrame: '#3a3a44' })), 0, `clear sin montura cambia en ${facing}`);
}

// 5. La melena sigue bajo la gorra; el pelo no tapa los cristales.
{
  const none = render('up', dressed({ hair: 'long' }));
  const cap = render('up', dressed({ hair: 'long', cap: GORRA }));
  assert.ok(diff(none, cap, 0, 3) > 0, 'de espaldas no se ve la gorra');
  assert.equal(diff(none, cap, 9, H - 1), 0, 'la gorra cambió la melena por debajo');
  assert.ok(diff(cap, render('up', dressed({ hair: 'short', cap: GORRA })), 9, 12) > 0, 'no hay melena bajo la gorra');
  for (const h of HAIRSTYLES) {
    const bare = render('down', dressed({ hair: h.id }));
    for (const id of [NEGRAS, CLARAS]) {
      const worn = render('down', dressed({ hair: h.id, glasses: id }));
      for (const x of [5, 10]) assert.ok(pixelDiffers(bare, worn, x, 5), `${h.id}/${id}: el pelo tapa el cristal en x ${x}`);
    }
  }
}

// 6. Ningún dibujo se sale del lienzo.
{
  writes = 0;
  outside = 0;
  for (const h of HAIRSTYLES) for (const facing of FACINGS) render(facing, dressed({ hair: h.id, cap: GORRA, glasses: NEGRAS, scarf: BUFANDA }));
  assert.ok(writes > 0, 'el contexto falso no recibió nada');
  assert.equal(outside, 0, 'se pinta fuera de 16 × 24');
}

// 7. Tatuajes y ropa.
{
  const neck = { tattoos: [{ zone: 'neck', design: 'luna' }] } as const;
  assert.equal(visibleTattoos(BASE, { ...neck }).length, 1, 'el cuello sin bufanda no se ve');
  assert.equal(visibleTattoos(BASE, { ...neck, scarf: BUFANDA }).length, 0, 'la bufanda no tapa el cuello');
  const arm = { tattoos: [{ zone: 'forearm-r', design: 'golondrina' }] } as const;
  assert.equal(getGarment('camisa-hawai').sleeve, 'short');
  assert.equal(visibleTattoos(BASE, { ...arm }).length, 0, 'la manga larga no tapa el antebrazo');
  assert.equal(visibleTattoos(BASE, { ...arm, top: 'camisa-hawai' }).length, 1, 'la manga corta tapa el antebrazo');
  for (const top of [undefined, 'camisa-hawai', 'camiseta-tirantes']) {
    assert.equal(visibleTattoos(BASE, { tattoos: [{ zone: 'chest', design: 'rosa' }], top }).length, 0, 'el pecho se ve');
  }
}

// 8. De uniforme: sin gorra ni bufanda, con gafas; la apariencia de entrada, intacta.
{
  const personal = Object.freeze(dressed({ cap: GORRA, scarf: BUFANDA, glasses: AVIADOR }));
  const before = structuredClone(personal);
  const worn = withUniform(personal, UNIFORM_LOOKS[0]);
  assert.equal(worn.cap, undefined, 'gorra con uniforme');
  assert.equal(worn.scarf, undefined, 'bufanda con uniforme');
  assert.equal(worn.glasses, 'dark');
  assert.equal(worn.glassesFrame, getGarment(AVIADOR).color);
  assert.deepEqual(personal, before, 'el uniforme modificó la entrada');
  assert.equal(withUniform(personal, null), personal, 'sin uniforme, lo de siempre');
}

// 9. Las gafas no se confunden con una prenda en el mapa de partes (el color testigo no las cubre).
{
  const glasses = GARMENTS.filter((g) => g.slot === 'glasses');
  assert.ok(glasses.length > 0, 'sin gafas en el catálogo');
  for (const g of glasses) {
    const n = Number.parseInt(g.color.slice(1), 16);
    assert.equal(partOf((n >> 16) & 255, (n >> 8) & 255, n & 255, 255), 0, `${g.id}: partOf ve ropa en la montura`);
  }
}

// 10. No se cobra dos veces; sin dinero no cambia nada.
for (const [store, id] of [['bandeja-gafas', NEGRAS], ['manta-bufandas', GORRA]] as const) {
  const first = buyGarment(wallet(100), [], {}, store, id);
  assert.ok(first.ok, first.message);
  const again = buyGarment(first.wallet, first.wardrobe, first.appearance, store, id);
  assert.equal(again.ok, false, `${id} se cobró dos veces`);
  assert.equal(again.wallet, first.wallet);
  assert.equal(again.wardrobe, first.wardrobe);
  assert.equal(again.paid, 0);
  const broke = wallet(0);
  const wardrobe: readonly string[] = [];
  const current = {};
  const none = buyGarment(broke, wardrobe, current, store, id);
  assert.equal(none.ok, false, `${id} sin dinero`);
  assert.equal(none.wallet, broke);
  assert.equal(none.wardrobe, wardrobe);
  assert.equal(none.appearance, current);
}

// 11. Heredados: lo que no es tuyo o no existe, fuera; los tatuajes con diseño desconocido, filtrados.
{
  const notOwned = read({ ...createInitialState(), wardrobe: [], appearance: { player: { cap: GORRA, glasses: NEGRAS, scarf: BUFANDA } } });
  for (const slot of ['cap', 'glasses', 'scarf'] as const) assert.equal(notOwned.appearance.player?.[slot], undefined, `${slot} sin estar en el armario`);
  const wrong = read({ ...createInitialState(), wardrobe: [GORRA, NEGRAS, BUFANDA], appearance: { player: { cap: NEGRAS, glasses: GORRA, scarf: 'no-existe' } } });
  for (const slot of ['cap', 'glasses', 'scarf'] as const) assert.equal(wrong.appearance.player?.[slot], undefined, `${slot} de otra categoría o desconocido`);
  const inked = read({ ...createInitialState(), appearance: { player: { tattoos: [{ zone: 'neck', design: 'no-existe' }, { zone: 'neck', design: 'luna' }] } } });
  assert.deepEqual(inked.appearance.player?.tattoos, [{ zone: 'neck', design: 'luna' }], 'tatuaje desconocido');
}

// 12. Migración: las versiones 1 y 2 conservan los accesorios.
for (const version of [1, 2]) {
  const worn = { glasses: NEGRAS, cap: GORRA, scarf: BUFANDA };
  const back = read({ ...createInitialState(), wardrobe: [NEGRAS, GORRA, BUFANDA], appearance: { player: worn } }, version);
  for (const slot of ['glasses', 'cap', 'scarf'] as const) assert.equal(back.appearance.player?.[slot], worn[slot], `versión ${version}: se pierde ${slot}`);
}

// 13. Exportar e importar: ids exactos y color de pelo.
{
  const player = { glasses: AVIADOR, cap: GORRA_NEGRA, scarf: BUFANDA, hairColor: 'rosa' };
  const back = read({ ...createInitialState(), wardrobe: [AVIADOR, GORRA_NEGRA, BUFANDA], appearance: { player } });
  assert.deepEqual(back.appearance.player, player);
}

// 14. Dos ranuras sobre el mismo almacén no se mezclan.
{
  const mem = new MemoryStorage();
  assert.ok(slotSave(mem, 1).save({ ...createInitialState(), wardrobe: [NEGRAS], appearance: { player: { glasses: NEGRAS } } }));
  assert.ok(slotSave(mem, 2).save({ ...createInitialState(), wardrobe: [GORRA], appearance: { player: { cap: GORRA } } }));
  const one = slotSave(mem, 1).load();
  const two = slotSave(mem, 2).load();
  assert.deepEqual(one?.appearance.player, { glasses: NEGRAS });
  assert.deepEqual(one?.wardrobe, [NEGRAS]);
  assert.deepEqual(two?.appearance.player, { cap: GORRA });
  assert.deepEqual(two?.wardrobe, [GORRA]);
}

// 15. La apariencia no toca física ni estadísticas.
{
  const base = createInitialState();
  const fancy = reload({ ...base, wardrobe: [NEGRAS, GORRA, BUFANDA], appearance: { player: { glasses: NEGRAS, cap: GORRA, scarf: BUFANDA } } });
  const plain = reload({ ...base, wardrobe: [], appearance: {} });
  const rest = (s: typeof fancy): Record<string, unknown> => {
    const { appearance: _a, wardrobe: _w, ...others } = s;
    return others;
  };
  assert.deepEqual(rest(fancy), rest(plain), 'la ropa cambió otra cosa de la partida');
  assert.deepEqual(PLAYER_BODY, { width: 10, height: 8 });
  assert.equal(PLAYER_SPEED, 76);
  const body: HumanColors = { ...BASE, build: 'athletic', height: 'tall', posture: 'stooped' };
  const out = withAppearance(body, { glasses: NEGRAS, cap: GORRA, scarf: BUFANDA });
  for (const key of ['build', 'height', 'posture'] as const) assert.equal(out[key], body[key], `los accesorios cambian ${key}`);
}

// 16. Barbería.
{
  const w = wallet(100);
  const shorter = haircut(w, {}, 'bob', 'short');
  assert.ok(shorter.ok, shorter.message);
  assert.equal(shorter.wallet.money, 86, 'acortar no cuesta el corte');
  assert.deepEqual(shorter.appearance, { hair: 'short' });
  const sameLength = haircutQuote('curly', 'short', 30);
  assert.deepEqual(sameLength, { service: 'Corte', price: 14, minutes: 30 });

  const longer = haircut(w, {}, 'buzz', 'bob');
  assert.ok(longer.ok, longer.message);
  assert.equal(longer.wallet.money, 100 - 18 * HAIR_EXTRA_PRICE);
  assert.deepEqual(haircutQuote('buzz', 'bob', 30), { service: 'Extensiones', price: 18 * HAIR_EXTRA_PRICE, minutes: 30 * HAIR_EXTRA_MINUTES });

  const curled = haircut(w, {}, 'short', 'curly');
  assert.ok(curled.ok, curled.message);
  assert.equal(curled.wallet.money, 100 - 22 * HAIR_EXTRA_PRICE);
  assert.deepEqual(haircutQuote('short', 'curly', 45), { service: 'Permanente', price: 22 * HAIR_EXTRA_PRICE, minutes: 45 * HAIR_EXTRA_MINUTES });

  const current: Appearance = { hair: 'bob', hairColor: 'rosa' };
  const already = haircut(w, current, 'bob', 'bob');
  assert.equal(already.ok, false, 'cortó lo que ya lleva');
  assert.equal(already.wallet, w);
  assert.equal(already.appearance, current);
  const poor = wallet(1);
  const broke = haircut(poor, current, 'bob', 'short');
  assert.equal(broke.ok, false, 'cortó sin dinero');
  assert.equal(broke.wallet, poor);
  assert.equal(broke.appearance, current);

  for (const from of HAIRSTYLES) {
    for (const to of HAIRSTYLES) {
      const r = haircut(wallet(1000), {}, from.id, to.id);
      if (to.price === undefined || from.id === to.id) {
        assert.equal(r.ok, false, `${from.id} → ${to.id} no debería poder hacerse`);
        continue;
      }
      assert.ok(r.ok, r.message);
      const charged = 1000 - r.wallet.money;
      assert.ok(charged >= to.price, `${from.id} → ${to.id} cobra menos que el corte`);
      assert.ok(charged === to.price || charged === to.price * HAIR_EXTRA_PRICE, `${from.id} → ${to.id} cobra ${charged}`);
      const { price } = haircutQuote(from.id, to.id, 30);
      const exact = haircut(wallet(price), {}, from.id, to.id);
      assert.ok(exact.ok && exact.wallet.money === 0, `${from.id} → ${to.id} con el dinero justo`);
      const shy = wallet(price - 0.01);
      const refused = haircut(shy, {}, from.id, to.id);
      assert.equal(refused.ok, false, `${from.id} → ${to.id} deja saldo negativo`);
      assert.equal(refused.wallet, shy);
    }
  }
}

// 17. Tinte.
{
  const w = wallet(100);
  const current: Appearance = { hair: 'bob', glasses: NEGRAS, eyes: 'verde', skin: 'piel-5' };
  const dyed = dyeHair(w, current, 'rosa');
  assert.ok(dyed.ok, dyed.message);
  assert.deepEqual(dyed.appearance, { ...current, hairColor: 'rosa' }, 'el tinte cambió otra cosa');
  assert.equal(dyed.wallet.money, 100 - HAIR_DYE.price);
  assert.equal(w.money, 100, 'dyeHair mutó la cartera');
  assert.deepEqual(current, { hair: 'bob', glasses: NEGRAS, eyes: 'verde', skin: 'piel-5' }, 'dyeHair mutó el aspecto');

  const again = dyeHair(dyed.wallet, dyed.appearance, 'rosa');
  assert.equal(again.ok, false, 'tiñó dos veces del mismo color');
  assert.equal(again.wallet, dyed.wallet);
  assert.equal(again.appearance, dyed.appearance);

  const factory = dyeHair(w, {}, FACTORY_HAIR_COLOR);
  assert.equal(factory.ok, false, 'tiñó del color de fábrica a quien ya lo lleva');

  const poor = wallet(HAIR_DYE.price - 0.01);
  const broke = dyeHair(poor, current, 'azul');
  assert.equal(broke.ok, false, 'tiñó sin dinero');
  assert.equal(broke.wallet, poor);
  assert.equal(broke.appearance, current);
  assert.equal(dyeHair(w, current, 'color-inventado').ok, false, 'tiñó de un color que no existe');

  const back = reload({ ...createInitialState(), wardrobe: [NEGRAS], appearance: { player: dyed.appearance } });
  assert.equal(back.appearance.player?.hairColor, 'rosa', 'el tinte no sobrevive a guardar y cargar');
}

// 18. Retocar, cubrir y eliminar: precios y minutos del catálogo.
{
  const row = (a: Appearance, zone: 'forearm-r' | 'hand-r' = 'forearm-r') => tattooWorks(a, zone).map((x) => [x.action, x.design, x.price, x.minutes]);
  const on = (design: string): Appearance => ({ tattoos: [{ zone: 'forearm-r', design }] });
  assert.deepEqual(row(on('golondrina')), [
    ['retouch', 'rosa', 55, 60],
    ['cover', 'rama', 84, 60],
    ['cover', 'luna', 60, 40],
    ['cover', 'banda', 96, 75],
    ['cover', 'fecha', 72, 45],
    ['remove', undefined, 135, 180],
  ]);
  assert.deepEqual(row(on('banda')), [['remove', undefined, 120, 150]], 'banda no tiene nada más oscuro ni de su estilo');
  assert.ok(!row({ tattoos: [{ zone: 'hand-r', design: 'golondrina' }] }, 'hand-r').some((x) => x[1] === 'rosa'), 'ofrece un diseño que no cabe en la zona');
  assert.deepEqual(tattooWorks({}, 'neck'), [], 'trabajos sobre una zona vacía');

  const w = wallet(200);
  const before = on('golondrina');
  const redone = reworkTattoo(w, before, 'forearm-r', 'retouch', 'rosa');
  assert.ok(redone.ok, redone.message);
  assert.equal(redone.wallet.money, 145);
  assert.deepEqual(redone.appearance.tattoos, [{ zone: 'forearm-r', design: 'rosa' }]);
  assert.deepEqual(before, on('golondrina'), 'reworkTattoo mutó el aspecto');
  assert.equal(w.money, 200, 'reworkTattoo mutó la cartera');

  const lighter = reworkTattoo(w, on('luna'), 'forearm-r', 'cover', 'rosa');
  assert.equal(lighter.ok, false, 'cubrió con tinta más clara');
  assert.equal(lighter.wallet, w);
  const poor = wallet(134.99);
  const broke = reworkTattoo(poor, before, 'forearm-r', 'remove');
  assert.equal(broke.ok, false, 'eliminó sin dinero');
  assert.equal(broke.wallet, poor);
  assert.equal(broke.appearance, before);
  assert.ok(reworkTattoo(wallet(135), before, 'forearm-r', 'remove').ok, 'con el dinero justo');

  const gone = reworkTattoo(w, { hair: 'bob', ...before }, 'forearm-r', 'remove');
  assert.ok(gone.ok, gone.message);
  assert.deepEqual(gone.appearance, { hair: 'bob' }, 'la zona no queda limpia');
  const twice = reworkTattoo(gone.wallet, gone.appearance, 'forearm-r', 'remove');
  assert.equal(twice.ok, false, 'cobró dos veces la eliminación');
  assert.equal(twice.wallet, gone.wallet);

  // Heredados con duplicados: manda el último, y un trabajo deja una sola marca (las demás zonas, intactas).
  const dup: Appearance = { tattoos: [{ zone: 'neck', design: 'luna' }, { zone: 'hand-r', design: 'luna' }, { zone: 'neck', design: 'rama' }] };
  assert.equal(tattooAt(dup, 'neck'), 'rama');
  const clean = reworkTattoo(wallet(500), dup, 'neck', 'remove');
  assert.equal(clean.wallet.money, 500 - 105, 'el precio no sale del diseño visible');
  assert.deepEqual(clean.appearance.tattoos, [{ zone: 'hand-r', design: 'luna' }]);
  const single = reworkTattoo(wallet(500), dup, 'neck', 'retouch', 'luna');
  assert.deepEqual(single.appearance.tattoos, [{ zone: 'hand-r', design: 'luna' }, { zone: 'neck', design: 'luna' }]);

  const back = reload({ ...createInitialState(), appearance: { player: gone.appearance } });
  assert.deepEqual(back.appearance.player, { hair: 'bob' }, 'la eliminación no sobrevive a guardar y cargar');
}

// 19. Legibilidad del antes y después (D8).
{
  const FLOORS = ['#b8b0a2', PALETTE.night];
  const blank = (): Uint8ClampedArray => new Uint8ClampedArray(W * H * 4);
  const ink = (d: Uint8ClampedArray, n: number, rgba: readonly number[]): Uint8ClampedArray => {
    for (let i = 0; i < n; i++) d.set(rgba, i * 4);
    return d;
  };
  const WHITE = [255, 255, 255, 255];
  assert.equal(lookChange(blank(), blank(), FLOORS), 'none');
  assert.equal(lookChange(blank(), ink(blank(), 1, WHITE), FLOORS), 'faint', 'un píxel no basta');
  assert.equal(lookChange(blank(), ink(blank(), 2, WHITE), FLOORS), 'legible', 'dos píxeles fuertes sí');
  const n = Number.parseInt(PALETTE.night.slice(1), 16);
  assert.equal(lookChange(blank(), ink(blank(), 4, [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255]), FLOORS), 'faint', 'del color del suelo oscuro: no se lee sobre él');
  const plain = (facing: Facing, changes: Appearance): Uint8ClampedArray => render(facing, dressed(changes));
  assert.equal(lookChange(plain('up', { hair: 'short' }), plain('up', { hair: 'short', glasses: NEGRAS }), FLOORS), 'none', 'gafas de espaldas');
  assert.notEqual(lookChange(plain('down', { hair: 'short' }), plain('down', { hair: 'short', cap: GORRA }), FLOORS), 'none', 'gorra de frente');
}

console.log('check-avatar: ok');
