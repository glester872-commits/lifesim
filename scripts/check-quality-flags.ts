// El pozo de partículas de world/Atmosphere dentro del presupuesto de cada calidad (config/budgets.ts), sin Phaser.
// PENDIENTE (VISUAL-UPGRADE-01): aún no está en `npm run check`. Integrarlo en un ticket propio que declare
// package.json en el baseline del Gate: añadir `node scripts/check-quality-flags.ts` tras check-ambient.
// Mientras tanto se ejecuta a mano: node scripts/check-quality-flags.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { atmosphereCap, BUDGETS, MAX_PARTICLES } from '../src/config/budgets.ts';
import type { QualityLevel } from '../src/config/quality.ts';

const levels = Object.keys(BUDGETS) as QualityLevel[];
assert.deepEqual([...levels].sort(), ['high', 'low', 'medium'], 'niveles de calidad');
for (const level of levels) {
  const cap = atmosphereCap(level);
  assert.ok(Number.isInteger(cap) && cap >= 0, `${level}: pozo ${cap}`);
  assert.ok(cap <= BUDGETS[level].particles, `${level}: pozo ${cap} > presupuesto ${BUDGETS[level].particles}`);
}
assert.equal(atmosphereCap('low'), 0, 'low: sin partículas');
assert.equal(MAX_PARTICLES, Math.max(...levels.map((l) => BUDGETS[l].particles)), 'MAX_PARTICLES = el presupuesto más alto');

// Que Atmosphere use de verdad ese tope (importarla arrastraría Phaser): el pozo se dimensiona con atmosphereCap(QUALITY.level).
const src = readFileSync(new URL('../src/world/Atmosphere.ts', import.meta.url), 'utf8');
assert.match(src, /const cap = atmosphereCap\(QUALITY\.level\);/, 'Atmosphere: el pozo no sale de atmosphereCap');
assert.match(src, /this\.off = cap === 0 \|\|/, 'Atmosphere: con tope 0 no se apaga');
assert.match(src, /for \(let i = 0; i < cap; i\+\+\)/, 'Atmosphere: el pozo no se llena hasta cap');
assert.doesNotMatch(src, /MAX_PARTICLES\s*=/, 'Atmosphere: techo propio fuera del presupuesto');

console.log(`check-quality-flags: ok — pozo de ambiente ${levels.map((l) => `${l} ${atmosphereCap(l)}/${BUDGETS[l].particles}`).join(', ')}`);
