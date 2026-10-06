// Fallos que sólo salen con varios sistemas a la vez (prueba cruzada): `npm run check`. Con los mismos StreetLife,
// Crowd y TableService del juego:
//   1. una persona del corro de una pelea o de un trapicheo no anda a la vez por la calle (StreetLife.claimLooks);
//   2. el servicio de mesa sabe si hay alguien de turno (TableService.staffed): sin camarero no se espera para siempre;
//   3. al cruzar una puerta, un doble toque no vuelve a cruzarla (WorldScene: ARRIVAL_LOCK_MS).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TRANSITION_MS } from '../src/config/constants.ts';
import { getLocation } from '../src/systems/LocationSystem.ts';
import { StreetLife, streetProfileFor } from '../src/systems/StreetLife.ts';
import { Crowd, profileFor, type Clock } from '../src/systems/Crowd.ts';
import { placeInfo } from '../src/systems/Places.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { offCamera } from '../src/systems/Recovery.ts';
import type { TilePoint } from '../src/types/game.ts';

const STEP = 100;
const MS_PER_MIN = 500;
const tick = (c: Clock, acc: { ms: number }): Clock => {
  acc.ms += STEP;
  if (acc.ms < MS_PER_MIN) return c;
  acc.ms -= MS_PER_MIN;
  const total = c.hour * 60 + c.minute + 1;
  return { day: c.day + Math.floor(total / 1440), hour: Math.floor((total % 1440) / 60), minute: total % 60 };
};

// ------------------------------------- 1. la misma persona no está en la pelea y en la calle a la vez

{
  const PLAYER: TilePoint = { tx: 72, ty: 53 };
  const street = new StreetLife(getLocation('district'), streetProfileFor('district')!, seededRng(5));
  let clock: Clock = { day: 6, hour: 21, minute: 30 };
  const acc = { ms: 0 };
  street.populate(clock, PLAYER);
  for (let ms = 0; ms < 5 * MS_PER_MIN; ms += STEP) street.update(STEP, (clock = tick(clock, acc)), PLAYER);
  // El corro se lleva a la mitad de las caras que hay ahora en la calle (lo peor posible) y a otras diez.
  const onStreet = street.agents.filter((a) => a.kind === 'visitor').map((a) => a.look);
  const claimed = new Set([...onStreet.filter((_, i) => i % 2 === 0), ...Array.from({ length: 10 }, (_, i) => i * 7)]);
  let offCamClones = 0;
  let visibleClones = 0;
  let spawnedClaimed = 0;
  const before = new Set(street.agents.map((a) => a.id));
  for (let ms = 0; ms < 60 * MS_PER_MIN; ms += STEP) {
    // El mismo orden que WorldScene en cada frame: la calle se mueve y luego se le dice quién está en el corro (antes de pintar).
    street.update(STEP, (clock = tick(clock, acc)), PLAYER);
    street.claimLooks(claimed);
    for (const a of street.agents) {
      if (a.kind !== 'visitor' || a.leader || !claimed.has(a.look)) continue;
      // Quien sale nuevo a la calle no es nadie del corro; quien ya estaba, cambia de cara sólo fuera de cámara.
      if (!before.has(a.id)) spawnedClaimed++;
      if (offCamera({ tx: a.x, ty: a.y }, PLAYER)) offCamClones++;
      else visibleClones++;
    }
  }
  assert.equal(spawnedClaimed, 0, `sale a la calle alguien que está en el corro (${spawnedClaimed})`);
  assert.equal(offCamClones, 0, `fuera de cámara sigue habiendo clones del corro (${offCamClones})`);
  // Sin corro (lista vacía) todo vuelve a valer: nadie queda vetado para siempre.
  street.claimLooks(new Set());
  const freeLooks = new Set<number>();
  for (let ms = 0; ms < 30 * MS_PER_MIN; ms += STEP) {
    street.update(STEP, (clock = tick(clock, acc)), PLAYER);
    for (const a of street.agents) freeLooks.add(a.look);
  }
  assert.ok([...claimed].some((l) => freeLooks.has(l)), 'tras la pelea, quien estaba en el corro ya no vuelve nunca a la calle');
  console.log(`pelea + calle: 0 personas nuevas del corro en la calle, 0 clones fuera de cámara (a la vista hasta salir de cámara: ${visibleClones} agente·paso), tras la pelea vuelven`);
}

// ----------------------------------------- 2. servicio de mesa con el tiempo corriendo: ¿hay quien atienda?

for (const placeId of ['restaurant', 'cafe']) {
  const place = placeInfo(placeId)!;
  const crowd = new Crowd(getLocation(place.interior!), place, profileFor(placeId)!, seededRng(9));
  const close = Math.floor(place.hours![1]);
  let clock: Clock = { day: 3, hour: close - 1, minute: 30 };
  const acc = { ms: 0 };
  const FAR: TilePoint = { tx: -999, ty: -999 };
  crowd.populate(clock, FAR);
  for (let ms = 0; ms < 5 * MS_PER_MIN; ms += STEP) crowd.update(STEP, (clock = tick(clock, acc)), FAR);
  assert.ok(crowd.service, `${placeId}: sin servicio de mesa`);
  assert.equal(crowd.service.staffed, true, `${placeId}: abierto y sin nadie de turno`);
  // Cierra: se va la gente y, después, el personal. En cuanto no queda camarero, staffed lo dice (la escena suelta al jugador).
  for (let ms = 0; ms < 180 * MS_PER_MIN; ms += STEP) crowd.update(STEP, (clock = tick(clock, acc)), FAR);
  assert.equal(crowd.service.staffed, false, `${placeId}: cerrado y con camarero «de turno»`);
  console.log(`servicio ${placeId}: con camarero de turno abierto, sin nadie tras cerrar a las ${close}`);
}
{
  // La terraza de la calle a deshoras (sin el camarero de la terraza del restaurante): nadie de turno; a mediodía, sí.
  const P: TilePoint = { tx: 72, ty: 53 };
  const night = new StreetLife(getLocation('district'), streetProfileFor('district')!, seededRng(4));
  let clock: Clock = { day: 3, hour: 3, minute: 0 };
  const acc = { ms: 0 };
  night.populate(clock, P);
  for (let ms = 0; ms < 10 * MS_PER_MIN; ms += STEP) night.update(STEP, (clock = tick(clock, acc)), P);
  assert.equal(night.service?.staffed, false, 'terraza de madrugada con camarero de turno');
  const noon = new StreetLife(getLocation('district'), streetProfileFor('district')!, seededRng(4));
  clock = { day: 3, hour: 13, minute: 0 };
  noon.populate(clock, P);
  for (let ms = 0; ms < 10 * MS_PER_MIN; ms += STEP) noon.update(STEP, (clock = tick(clock, acc)), P);
  assert.equal(noon.service?.staffed, true, 'terraza a mediodía sin camarero de turno');
  console.log('terraza: sin camarero de madrugada, con camarero a mediodía');
}

// ---------------------------------------------- 3. un doble toque al cruzar una puerta no la vuelve a cruzar

{
  const scene = readFileSync(new URL('../src/scenes/WorldScene.ts', import.meta.url), 'utf8');
  const lock = Number(scene.match(/const ARRIVAL_LOCK_MS = (\d+)/)?.[1]);
  assert.ok(lock >= TRANSITION_MS + 200, `el bloqueo al llegar (${lock} ms) no cubre el fundido (${TRANSITION_MS} ms) más un doble toque`);
  assert.ok(lock <= 800, `el bloqueo al llegar (${lock} ms) se come toques deliberados`);
  assert.ok(/camera\.fadeIn\(TRANSITION_MS[^)]*\);[\s\S]{0,200}this\.readyAt = this\.time\.now \+ ARRIVAL_LOCK_MS/.test(scene), 'el bloqueo no empieza al llegar');
  assert.ok(/const free = !dialogue\.isOpen && !menu\.isOpen && !arriving/.test(scene), 'la calle no respeta el bloqueo');
  assert.ok(/action: arriving \? null/.test(scene), 'el botón táctil ofrece la acción durante el bloqueo');
  console.log(`puertas: ${lock} ms sin acción al llegar (fundido ${TRANSITION_MS} ms + doble toque), también en el botón táctil`);
}

console.log('\nOK: sin clones entre pelea y calle, sin esperas eternas a la mesa, sin rebotes en las puertas.');
