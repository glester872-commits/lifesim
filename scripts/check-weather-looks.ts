// Ropa para personajes con rutina: identidad fija y las mismas decisiones que los peatones.
// Vite resuelve los módulos de render sin exigir Phaser ni un navegador para este check.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { CHARACTERS } from '../src/data/characters.ts';
import { getNpc } from '../src/data/npcs.ts';
import { hashSeed } from '../src/systems/MetroDaily.ts';
import type { Weather } from '../src/systems/Weather.ts';

const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null }, appType: 'custom' });
try {
  const { WEATHER_LOOKS, characterLook, umbrellaFor } = await server.ssrLoadModule('/src/world/WeatherLooks.ts') as typeof import('../src/world/WeatherLooks.ts');
  const { colorsOf } = await server.ssrLoadModule('/src/world/HumanArt.ts') as typeof import('../src/world/HumanArt.ts');
  const cold: Weather = { cloud: 1, rain: 0.9, wet: 1, celsius: 3, sky: 'heavy-rain', temp: 'cold' };
  const warm: Weather = { cloud: 0, rain: 0, wet: 0, celsius: 30, sky: 'clear', temp: 'warm' };
  assert.equal(new Set(WEATHER_LOOKS.map((l) => l.id)).size, WEATHER_LOOKS.length, 'aspectos duplicados');
  for (const def of CHARACTERS) {
    const base = getNpc(def.npc);
    const before = structuredClone(base);
    const original = colorsOf(base);
    for (const layer of ['coat', 'light', 'hood']) {
      const look = WEATHER_LOOKS.find((l) => l.id === base.id + '~' + layer);
      assert.ok(look, base.id + ': falta la capa ' + layer);
      const colors = colorsOf(look);
      for (const key of ['skin', 'hair', 'hairStyle', 'trousers', 'spots', 'shoes', 'bag'] as const) {
        assert.deepEqual(colors[key], original[key], base.id + ': cambia ' + key + ' con ' + layer);
      }
      if (layer === 'coat' || layer === 'hood') {
        assert.equal(look.sleeves, undefined, base.id + ': el abrigo deja brazos al aire');
        assert.equal(look.sleeveLen, undefined, base.id + ': el abrigo usa mangas cortas');
      }
      assert.equal(umbrellaFor(0, cold, true), null, 'capucha y paraguas a la vez');
    }
    const seed = hashSeed('weather', def.npc);
    assert.deepEqual(characterLook(base, seed, cold), characterLook(base, seed, cold), 'decisión no determinista');
    assert.notEqual(characterLook(base, seed, cold).id, characterLook(base, seed, warm).id, base.id + ': ignora frío y calor');
    assert.equal(umbrellaFor(seed, warm, false), null, 'paraguas sin lluvia');
    assert.deepEqual(base, before, base.id + ': se ha alterado identidad o diálogo');
    console.log(base.name + ': frío ' + characterLook(base, seed, cold).id + ', calor ' + characterLook(base, seed, warm).id);
  }
  console.log('OK: capas de personajes con rutina, identidad estable, mangas, frío/calor y paraguas deterministas.');
} finally {
  await server.close();
}
