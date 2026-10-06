// Postes de la acera (farolas, señales, bolardos, parquímetros): su colisión es una caja estrecha
// (PropDef.post), así que sólo bloquean si están en un pasillo de un tile de ancho. `npm run check`.
import assert from 'node:assert/strict';
import { LOCATIONS } from '../src/data/locations.ts';
import { PROPS, TILES } from '../src/world/tiles.ts';
import { solidMask } from '../src/systems/LocationSystem.ts';

let posts = 0;
const blocked: string[] = [];

for (const loc of LOCATIONS) {
  // Lo que choca de verdad con un tile entero: terreno, edificios y muebles (los postes, no).
  const mask = solidMask(loc, true);
  const solid = (x: number, y: number): boolean => mask[y]?.[x] !== false;
  for (const p of loc.props) {
    if (!PROPS[p.kind].post) continue;
    // Sobre suelo que ya es sólido (la mediana ajardinada) no cierra nada: por ahí no se pasa igual.
    if (TILES[loc.ground[p.ty]?.[p.tx] ?? '']?.solid) continue;
    posts++;
    const [l, r, u, d] = [solid(p.tx - 1, p.ty), solid(p.tx + 1, p.ty), solid(p.tx, p.ty - 1), solid(p.tx, p.ty + 1)];
    // Un pasillo de un tile de ancho con el poste dentro: a cada lado quedarían 5 px y el cuerpo mide 10.
    if ((l && r && !u && !d) || (u && d && !l && !r)) blocked.push(`${loc.id}: ${p.kind} en ${p.tx},${p.ty}`);
  }
}

assert.deepEqual(blocked, [], `postes que cierran un pasillo de un tile:\n  ${blocked.join('\n  ')}`);
assert.ok(posts > 0, 'ningún poste en el mundo: la regla no comprueba nada');
console.log(`\nOK: ${posts} postes, ninguno cierra un pasillo.`);
