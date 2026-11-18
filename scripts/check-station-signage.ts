// MET-04: señalética de los andenes. `node scripts/check-station-signage.ts`. Toda señal apunta a un portal real del
// andén (o a su línea, el plano), la flecha va hacia él, los postes y planos siguen donde estaban y con la misma
// colisión, el plano tiene las paradas de su línea y marca la suya, la correspondencia sólo existe con portal
// `transfer` y todo texto se escribe en la fuente 5×7.
import assert from 'node:assert/strict';
import { LOCATIONS } from '../src/data/locations.ts';
import { LINES, STOPS, stationLine } from '../src/data/transit.ts';
import { LINE_MAPS, SIGN_BACKGROUND, SIGN_FACES, signVariant, stationSigns } from '../src/data/stationSigns.ts';
import { PROPS, TILES } from '../src/world/tiles.ts';
import { canSpell } from '../src/world/paint.ts';

// Las posiciones de antes de MET-04 (data/locations.ts: platform()): no se mueve ni se añade ningún prop.
const POSTS = ['19,9', '2,9', '6,12'];
const MAPS = ['16,1', '2,1'];

assert.ok(PROPS.sign.post && PROPS.sign.tilesHigh === 2 && !PROPS.sign.tilesWide && !PROPS.sign.foot, 'poste: misma colisión');
assert.ok(PROPS['line-map'].tilesHigh === 1 && PROPS['line-map'].tilesWide === 3, 'plano: mismo tamaño');
assert.equal(PROPS.sign.defaultVariant, 0, 'los postes sin variante, el dibujo de siempre');
assert.equal(PROPS['line-map'].defaultVariant, 0, 'los planos sin variante, el dibujo de siempre');
assert.equal(PROPS.sign.variants, SIGN_FACES.length + 1);
assert.equal(PROPS['line-map'].variants, LINE_MAPS.length + 1);
// Corrección 1 (visual-qa): la correspondencia no se confunde con la salida ni con el color de ninguna línea.
assert.notEqual(SIGN_BACKGROUND.salida, SIGN_BACKGROUND.correspondencia, 'fondo de salida = fondo de correspondencia');
for (const l of LINES) assert.notEqual(TILES[l.wall]?.trim, SIGN_BACKGROUND.correspondencia, `${l.id}: correspondencia del color de la línea`);
for (const f of SIGN_FACES) if (f.type === 'correspondencia') assert.ok(f.line && canSpell(f.line), `«${f.line}» sin glifos 5×7`);

const stations = LOCATIONS.filter((l) => l.metro);
assert.ok(stations.length >= 12, `andenes encontrados: ${stations.length}`);
const rows: string[] = [];
for (const loc of stations) {
  const own = stationLine(loc.id).id;
  const at = (kind: string): string[] => loc.props.filter((p) => p.kind === kind).map((p) => `${p.tx},${p.ty}`).sort();
  assert.deepEqual(at('sign'), POSTS, `${loc.id}: postes movidos o añadidos`);
  assert.deepEqual(at('line-map'), MAPS, `${loc.id}: planos movidos o añadidos`);
  const signs = stationSigns(loc);
  assert.equal(signs.length, POSTS.length + MAPS.length, `${loc.id}: cada poste y plano con su señal`);
  const transfer = loc.portals.find((p) => p.id === 'transfer');
  for (const s of signs) {
    const where = `${loc.id} ${s.signId}`;
    assert.ok(s.text === '' || canSpell(s.text), `${where}: «${s.text}» por debajo de la fuente 5×7`);
    const prop = loc.props.find((p) => `${p.kind}-${p.tx}-${p.ty}` === s.signId);
    assert.equal(prop?.variant, signVariant(s), `${where}: variante colocada distinta de la derivada`);
    if (s.type === 'plano') {
      assert.ok(LINES.some((l) => l.id === s.targetId) && s.targetId === own, `${where}: plano de otra línea`);
      const map = LINE_MAPS[signVariant(s) - 1];
      const line = STOPS.filter((o) => o.line === own).sort((a, b) => a.order - b.order);
      assert.equal(map.station, loc.id, `${where}: plano de otro andén`);
      assert.deepEqual(map.stops.map((o) => o.id), line.map((o) => o.id), `${where}: paradas del plano ≠ STOPS`);
      assert.equal(map.stops[map.current]?.id, STOPS.find((o) => o.station === loc.id)?.id, `${where}: no marca su parada`);
      rows.push(`${loc.id} ${s.signId} plano ${own} (${map.stops.length} paradas, actual ${map.current + 1})`);
      continue;
    }
    const portal = loc.portals.find((p) => p.id === s.targetId);
    assert.ok(portal, `${where}: destino ${s.targetId} sin portal`);
    const dx = portal.tx - s.position.tx;
    const dy = portal.ty - s.position.ty;
    const ok = {
      right: dx > 0 && Math.abs(dx) >= Math.abs(dy),
      left: dx < 0 && Math.abs(dx) >= Math.abs(dy),
      up: dy < 0 && Math.abs(dy) >= Math.abs(dx),
      down: dy > 0 && Math.abs(dy) >= Math.abs(dx),
    }[s.arrow ?? 'up'];
    assert.ok(s.arrow && ok, `${where}: flecha ${s.arrow} no va hacia ${s.targetId} (${dx},${dy})`);
    if (s.type === 'correspondencia') {
      assert.ok(transfer && s.targetId === 'transfer', `${where}: correspondencia sin portal transfer`);
      assert.equal(s.text, stationLine(transfer.to.location).id, `${where}: rótulo de otra línea`);
      assert.notEqual(s.text, own, `${where}: correspondencia a su propia línea`);
    }
    rows.push(`${loc.id} ${s.signId} ${s.type} ${s.arrow} → ${s.targetId}${s.text ? ` «${s.text}»` : ''}`);
  }
  assert.equal(signs.filter((s) => s.type === 'correspondencia').length, transfer ? 1 : 0, `${loc.id}: correspondencias`);
  assert.equal(signs.filter((s) => s.type === 'salida').length, 2, `${loc.id}: dos salidas en el andén`);
}

// Fuera del metro, postes y planos quedan con el dibujo de siempre.
for (const loc of LOCATIONS.filter((l) => !l.metro)) {
  for (const p of loc.props) {
    if (p.kind === 'sign' || p.kind === 'line-map') assert.equal(p.variant, undefined, `${loc.id}: ${p.kind} con variante de metro`);
  }
}

console.log(rows.join('\n'));
console.log(`check-station-signage: ${stations.length} andenes, ${rows.length} señales con respaldo`);
