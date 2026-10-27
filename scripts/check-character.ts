// Creador de personaje (Alpha-04): `npm run check`. Nombre limpio; opciones que existen y se dibujan; la partida
// nueva no hereda nada; aspecto e identidad vuelven iguales tras guardar y cargar (también por GameState); una
// partida de la versión 1 carga con los valores de serie sin perder nada; ids rotos no entran; al azar es
// reproducible, siempre válido y nunca con el pelo fundido en la cara; y sólo cambia colores, nunca el cuerpo.
import assert from 'node:assert/strict';
import { SAVE_KEY } from '../src/config/constants.ts';
import { EYE_COLORS, EYE_IDS, HAIR_COLOR_IDS, HAIR_COLORS, HAIRSTYLES, SKIN_IDS, SKIN_TONES } from '../src/data/appearance.ts';
import { getGarment } from '../src/data/retail.ts';
import { withAppearance } from '../src/systems/Appearance.ts';
import { BASE_DRAFT, CATEGORIES, cycle, draftAppearance, newGameState, OPTIONS, randomDraft, readable, type CreatorDraft } from '../src/systems/CharacterCreator.ts';
import { cleanName, DEFAULT_NAME, NAME_MAX } from '../src/systems/PlayerIdentity.ts';
import { createInitialState, SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';
import { readFileSync } from 'node:fs';
import type { HumanColors } from '../src/world/HumanArt.ts';

const memory = (): { store: Map<string, string>; save: SaveSystem } => {
  const store = new Map<string, string>();
  const storage: SaveStorage = { read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) };
  return { store, save: new SaveSystem(storage) };
};

// 1 · Nombre: sin control, sin marcas, espacios juntos, tope de longitud y uno por defecto si no queda nada.
assert.equal(cleanName('  Nerea  '), 'Nerea');
assert.equal(cleanName('Ana\u0000​ María'), 'Ana María');
assert.equal(cleanName('<b>Lu</b>'), 'bLub');
assert.equal(cleanName('Íñigo O’Neill-Ruiz'), 'Íñigo O’Neill-Ru');
assert.equal([...cleanName('x'.repeat(40))].length, NAME_MAX);
for (const empty of ['', '   ', '1234', '🙂🙂', '...', undefined, 42, null]) assert.equal(cleanName(empty), DEFAULT_NAME, `«${String(empty)}»`);

// 2 · Opciones: al menos seis peinados, ids estables que el guardado reconoce, y la ropa sale del catálogo de siempre.
assert.ok(OPTIONS.hair.length >= 6, 'menos de seis peinados');
assert.ok(SKIN_TONES.length >= 6 && HAIR_COLORS.length >= 6 && EYE_COLORS.length >= 4);
for (const slot of ['top', 'bottom', 'shoes'] as const) {
  assert.equal(OPTIONS[slot][0], null, `${slot}: la de serie primero`);
  for (const id of OPTIONS[slot].slice(1)) {
    const g = getGarment(id!);
    assert.equal(g.slot, slot, `${id} no es de ${slot}`);
    assert.ok(!g.unique, `${id} es pieza única: no puede salir gratis`);
  }
}
const colors = (list: readonly { color: string }[]): boolean => list.every((s) => /^#[0-9a-f]{6}$/.test(s.color));
assert.ok(colors(SKIN_TONES) && colors(HAIR_COLORS) && colors(EYE_COLORS));

// 3 · Dar la vuelta: ← y → recorren todas las opciones y vuelven a la primera.
for (const cat of CATEGORIES) {
  let d = BASE_DRAFT;
  for (let i = 0; i < OPTIONS[cat].length; i++) d = cycle(d, cat, 1);
  assert.equal(d[cat], BASE_DRAFT[cat], `${cat}: no da la vuelta`);
  assert.equal(cycle(cycle(BASE_DRAFT, cat, 1), cat, -1)[cat], BASE_DRAFT[cat]);
}

// 4 · Partida nueva: la inicial de siempre, con nombre, aspecto y su ropa en el armario. Nada más.
const nerea: CreatorDraft = { ...BASE_DRAFT, name: '  Nerea ', skin: 'piel-7', hair: 'afro', hairColor: 'pelirrojo', eyes: 'verde', top: 'camiseta-raya', bottom: null, shoes: 'bota-cuero' };
const fresh = newGameState(nerea);
const base = createInitialState();
assert.deepEqual({ ...fresh, identity: base.identity, appearance: base.appearance, wardrobe: base.wardrobe }, base, 'la partida nueva cambia algo más que el personaje');
assert.deepEqual(fresh.identity, { name: 'Nerea' });
assert.deepEqual(fresh.appearance, { player: { hair: 'afro', skin: 'piel-7', hairColor: 'pelirrojo', eyes: 'verde', top: 'camiseta-raya', shoes: 'bota-cuero' } });
assert.deepEqual(fresh.wardrobe, ['camiseta-raya', 'bota-cuero']);
assert.equal(fresh.money, base.money);
assert.deepEqual(fresh.social, {});

// 5 · Guardar y cargar: todo vuelve igual. GameState (cuyo snapshot guarda el autoguardado) no se carga en node: su
// snapshot se mira en el código, y la ida y vuelta de verdad, en el navegador.
{
  const { save } = memory();
  assert.ok(save.save(fresh));
  const back = save.load()!;
  assert.deepEqual(back.identity, fresh.identity);
  assert.deepEqual(back.appearance, fresh.appearance);
  assert.deepEqual(back.wardrobe, fresh.wardrobe);
  const gs = readFileSync(new URL('../src/state/GameState.ts', import.meta.url), 'utf8');
  assert.match(gs, /identity: { ...this._identity }/, 'GameState.snapshot no guarda la identidad');
  const snap = back;
  assert.deepEqual(snap.identity, fresh.identity, 'GameState pierde el nombre');
  assert.deepEqual(snap.appearance, fresh.appearance, 'GameState pierde el aspecto');
  assert.ok(save.save(snap));
  assert.deepEqual(save.load()!.identity, fresh.identity);
}

// 6 · Una partida de la versión 1 (sin identidad ni colores): carga con los de serie y conserva todo lo demás.
{
  const { store, save } = memory();
  const old: Record<string, unknown> = { ...createInitialState(), money: 987.65, day: 40, appearance: { player: { hair: 'buzz' } }, wardrobe: ['camiseta-basica'] };
  delete old.identity;
  store.set(SAVE_KEY, JSON.stringify({ version: 1, savedAt: 1, state: old }));
  const s = save.load()!;
  assert.equal(s.identity!.name, DEFAULT_NAME);
  assert.deepEqual(s.appearance, { player: { hair: 'buzz' } });
  assert.equal(s.money, 987.65);
  assert.equal(s.day, 40);
  assert.deepEqual(s.wardrobe, ['camiseta-basica']);
}

// 7 · Ids que no existen o de otro tipo (tocados a mano): no entran; lo demás del aspecto, sí.
{
  const { store, save } = memory();
  const bad = { ...createInitialState(), identity: { name: '\u0007' }, appearance: { player: { hair: 'afro', skin: 'verde-marciano', hairColor: 7, eyes: { x: 1 } } } };
  store.set(SAVE_KEY, JSON.stringify({ version: 2, savedAt: 1, state: bad }));
  const s = save.load()!;
  assert.deepEqual(s.appearance.player, { hair: 'afro' });
  assert.equal(s.identity!.name, DEFAULT_NAME);
}

// 8 · Al azar: la misma semilla da el mismo; 2000 semillas, siempre ids válidos, legible y con su nombre.
assert.deepEqual(randomDraft(1234), randomDraft(1234));
assert.notDeepEqual(randomDraft(1), randomDraft(2));
const seen = new Set<string>();
for (let seed = 0; seed < 2000; seed++) {
  const d = randomDraft(seed, { name: 'Nerea' });
  assert.equal(d.name, 'Nerea');
  assert.ok(SKIN_IDS.has(d.skin) && HAIR_COLOR_IDS.has(d.hairColor) && EYE_IDS.has(d.eyes) && HAIRSTYLES.some((h) => h.id === d.hair), `semilla ${seed}: id inválido`);
  for (const cat of CATEGORIES) assert.ok((OPTIONS[cat] as readonly (string | null)[]).includes(d[cat]), `semilla ${seed}: ${cat}`);
  assert.ok(readable(d), `semilla ${seed}: pelo fundido en la cara`);
  seen.add(d.hair);
}
assert.ok(seen.size >= 6, 'al azar casi no varía el peinado');

// 9 · Sólo colores: el cuerpo (complexión, estatura, postura) no cambia, y quien no tiene cambios queda igual.
const player: HumanColors = { cloth: '#c9743f', clothDark: '#9d5730', hair: '#2a2430', skin: '#d3a17c', trousers: '#3c4152', shoes: '#23262f', hairStyle: 'short', build: 'athletic' };
const dressed = withAppearance(player, draftAppearance(nerea));
assert.equal(dressed.skin, '#7a4f38');
assert.equal(dressed.hair, '#b4532c');
assert.equal(dressed.eyes, '#4f8a4f');
assert.equal(dressed.hairStyle, 'afro');
assert.equal(dressed.build, 'athletic', 'el aspecto cambia la complexión');
assert.equal(withAppearance(player, { hair: 'bun' }).eyes, undefined, 'ojos de serie: sin iris');
assert.equal(withAppearance(player, draftAppearance(BASE_DRAFT)).eyes, undefined, 'ojos oscuros: los del contorno');
assert.equal(withAppearance(player, undefined), player);
// Brazos al aire: siguen siendo de piel con la piel nueva.
const bare = withAppearance({ ...player, sleeves: player.skin }, { skin: 'piel-1' });
assert.equal(bare.sleeves, bare.skin);

console.log(`check-character: OK (nombre, ${OPTIONS.hair.length} peinados, ${SKIN_TONES.length} pieles, ${HAIR_COLORS.length} pelos, ${EYE_COLORS.length} ojos, partida nueva limpia, ida y vuelta, versión 1, ids rotos, 2000 al azar)`);
