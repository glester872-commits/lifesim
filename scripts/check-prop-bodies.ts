// Cajas de choque de los objetos estrechos (PropDef.post y PropDef.foot): en todos los sitios, el tile del objeto
// sigue ocupado para colocar y para la navegación de los NPC, pero no bloquea entero; la caja cabe en el tile y
// sólo la llevan objetos de un tile. Los huecos reproducidos que corrige: la papelera paraba al jugador 4 px antes
// de su dibujo y la canasta 7 px (world/LocationBuilder). `node scripts/check-prop-bodies.ts`.
import assert from 'node:assert/strict';
import { TILE } from '../src/config/constants.ts';
import { PROPS } from '../src/world/tiles.ts';
import { allLocations, solidMask } from '../src/systems/LocationSystem.ts';

/** La caja de choque de un poste (world/LocationBuilder.POST_BODY). */
const POST_BODY = 6;

for (const [kind, def] of Object.entries(PROPS)) {
  if (!def.post && !def.foot) continue;
  assert.ok(!(def.post && def.foot), `${kind}: poste y caja al pie a la vez`);
  assert.equal(def.tilesWide ?? 1, 1, `${kind}: una caja al pie centrada sólo vale para objetos de un tile`);
  const [w, h] = def.foot ?? [POST_BODY, POST_BODY];
  assert.ok(w > 0 && h > 0 && w <= TILE && h <= TILE, `${kind}: caja ${w}×${h} fuera del tile`);
}
let checked = 0;
let free = 0;
for (const loc of allLocations()) {
  const nav = solidMask(loc, false);
  const bodies = solidMask(loc, true);
  // Lo que choca aunque no estuviera el objeto (muro, edificio u otro mueble en el mismo tile).
  const without = (p: (typeof loc.props)[number]) => solidMask({ ...loc, props: loc.props.filter((o) => o !== p) }, true)[p.ty][p.tx];
  for (const p of loc.props) {
    const def = PROPS[p.kind];
    if (!def.post && !def.foot) continue;
    assert.equal(nav[p.ty][p.tx], true, `${loc.id}: ${p.kind} en ${p.tx},${p.ty} debe ocupar su tile para colocar y navegar`);
    if (!without(p)) {
      assert.equal(bodies[p.ty][p.tx], false, `${loc.id}: ${p.kind} en ${p.tx},${p.ty} bloquea el tile entero en vez de su caja`);
      free++;
    }
    checked++;
  }
}
assert.ok(free > 0, 'ningún poste ni caja al pie sobre un tile libre');
console.log(`check-prop-bodies: OK — ${checked} postes y cajas al pie (${free} sobre tile libre)`);
