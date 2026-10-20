// Capas de dibujo (world/Layers, HD-03): un solo sitio para el orden. Comprueba que las capas fijas van en el orden
// que promete Layers.ts y que ningún archivo vuelve a poner una profundidad numérica suelta. `node scripts/check-layers.ts`.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { LAYER } from '../src/world/Layers.ts';

// Suelo < calcomanías < (el mundo, ordenado por la Y de los pies) < colgantes < cielo < luz < halos < emisivos < primer plano < avisos < depuración.
const order = ['ground', 'decal', 'overhead', 'sky', 'light', 'glow', 'emissive', 'foreground', 'prompt', 'debug'] as const;
for (let i = 1; i < order.length; i++) assert.ok(LAYER[order[i]] > LAYER[order[i - 1]], `${order[i]} debe ir encima de ${order[i - 1]}`);
assert.deepEqual(Object.keys(LAYER).sort(), [...order].sort(), 'Layers.ts y este orden deben listar las mismas capas');
// El mundo de pie se ordena por Y en px: cualquier mapa cabe muy por debajo de los colgantes.
assert.ok(LAYER.decal < 0 && LAYER.overhead > 100_000, 'la banda del mundo (0 … alto del mapa) debe quedar entre calcomanías y colgantes');

// Ninguna profundidad numérica suelta: `setDepth(900_000)` en un archivo es una capa que nadie más conoce.
const files: string[] = [];
const walk = (dir: string): void => {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.ts')) files.push(p);
  }
};
walk(path.join(import.meta.dirname, '..', 'src'));
const stray: string[] = [];
for (const f of files) {
  if (f.endsWith('Layers.ts')) continue;
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    // Un literal grande (de banda fija) o negativo; los pequeños derivados de la Y (hy + 0.3) son del mundo.
    if (/setDepth\(\s*(-\s*\d|\d[\d_]{4,})/.test(line) || /DEPTH\s*=\s*[\d_]{5,}/.test(line)) stray.push(`${path.relative(process.cwd(), f)}:${i + 1}`);
  });
}
assert.deepEqual(stray, [], `profundidades sueltas fuera de world/Layers.ts:\n${stray.join('\n')}`);
console.log(`check-layers: OK — ${order.length} capas en orden, ${files.length} archivos sin profundidades sueltas`);
