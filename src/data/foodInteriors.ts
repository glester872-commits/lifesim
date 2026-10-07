import type { LocationDef, PointDef, TableDef } from '../types/game.ts';
import { FOOD_VENUES, getArchetype, takeawayCatalogOf, type FoodVenue } from './foodVenues.ts';
import { at, many, p, room, TWO } from './interiors.ts';
import { seatsFurniture } from './seating.ts';

/**
 * El interior de un local de comida, hecho a partir de su arquetipo
 * (data/foodVenues.ts). Siempre la misma planta, la de Casa Mar: cocina al
 * fondo con fogones, mostrador con el pase, el comedor de mesas de dos y la
 * puerta abajo. Cambian lo que cuelga del arquetipo: las mesas, la barra de
 * taburetes (sushi), la mesa de preparación (pizza), la caja de para llevar y
 * el punto donde espera el repartidor.
 *
 * Puntos (con PREFIX = el del local): EXIT, COUNTER, STAFF, PASS, TABLE_nn,
 * BAR_nn, WAIT_nn, QUEUE_nn, PICKUP, WAITER_nn. Son los que lee su perfil de
 * población y el servicio de mesa; nada está puesto a mano por local.
 */

const AMBIENT = { pizza: '#ffd9a8', burger: '#fff0c8', sushi: '#f3ead0' } as const;

export function interiorOf(v: FoodVenue): LocationDef {
  const a = getArchetype(v.archetype);
  const L = a.layout;
  const P = v.prefix;
  const [x0, x1] = L.counter;
  const doorY = L.h - 3;

  // Dos sitios por mesa, delante y a su derecha, cada uno con su silla.
  const n = L.tables.length;
  const seats: Record<string, PointDef> = {
    ...Object.fromEntries(L.tables.map(([x, y], i) => [`${P}_TABLE_${TWO(i)}`, p(x, y + 1, 'seat', 'up')])),
    ...Object.fromEntries(L.tables.map(([x, y], i) => [`${P}_TABLE_${TWO(i + n)}`, p(x + 1, y, 'seat', 'left')])),
  };
  const bar: Record<string, PointDef> = Object.fromEntries((L.bar ?? []).map(([x, y], i) => [`${P}_BAR_${TWO(i)}`, p(x, y, 'seat', 'up')]));

  const tables: TableDef[] = [
    ...L.tables.map(([x, y], i): TableDef => ({ id: `${P}_MESA_${TWO(i)}`, seats: [`${P}_TABLE_${TWO(i)}`, `${P}_TABLE_${TWO(i + n)}`], service: { tx: x - 1, ty: y } })),
    ...(L.bar ?? []).map(([x, y], i): TableDef => ({ id: `${P}_BARRA_${TWO(i)}`, seats: [`${P}_BAR_${TWO(i)}`], service: { tx: x, ty: y + 1 } })),
  ];

  const catalog = takeawayCatalogOf(v);
  const shelves: [number, number][] = [];
  for (let x = x0; x <= x1; x++) if (x !== L.stoveX) shelves.push([x, 2]);
  const counter: [number, number][] = [];
  for (let x = x0; x <= x1; x++) counter.push([x, 4]);
  const boardX = Math.min(L.w - 3, 12);

  return {
    id: v.id,
    name: v.name,
    kind: 'interior',
    ground: room(L.w, L.h, L.doorX, (_x, y) => (y <= 3 ? 't' : 'f')),
    props: [
      ...many('shelf', shelves),
      at('stove', L.stoveX, 2),
      // Pizza: la mesa donde se estira la masa, a cada lado del cocinero.
      ...many('table', (L.prepTables ?? []).map((x): [number, number] => [x, 3])),
      ...many('counter', counter),
      ...many('dining-table', L.tables),
      ...seatsFurniture(seats),
      ...seatsFurniture(bar, 'stool'),
      at('chalkboard', boardX, 1),
      ...many('plant', a.tier === 'premium' ? [[1, L.h - 4], [L.w - 3, L.h - 4], [L.w - 3, 3]] : [[1, L.h - 4], [L.w - 3, L.h - 4]]),
      ...many('pendant', [...L.tables, ...(L.bar ?? []).map(([x, y]): [number, number] => [x, y - 1])]),
    ],
    ambient: AMBIENT[a.cuisine],
    portals: [{ id: 'exit', tx: L.doorX, ty: L.h - 2, label: 'Salir a la calle', to: { location: v.door.location, spawn: v.door.building } }],
    spawns: { entry: { tx: L.doorX, ty: doorY, facing: 'up' } },
    inspects: [{ tx: boardX, ty: 2, name: 'Pizarra', lines: [`${v.name}: ${a.categories.filter((c) => c.id !== 'bebidas').map((c) => c.title.toLowerCase()).join(', ')} y bebidas.`] }],
    ...(catalog ? { terminals: [{ tx: x0, ty: 4, name: `Mostrador · ${v.name}`, catalog: catalog.id }] } : {}),
    // Servicio de mesa (data/population.ts: tableService): sentarse a una mesa es pedir que te atiendan.
    tables,
    npcs: [],
    points: {
      [`${P}_EXIT`]: p(L.doorX, doorY, 'exit', 'up'),
      [`${P}_COUNTER`]: p(x0, 5, 'interact', 'up'),
      [`${P}_STAFF`]: p(L.stoveX + 1, 3, 'work', 'down'),
      // El pase: donde recoge el camarero lo que sale de cocina y deja la vajilla sucia.
      [`${P}_PASS`]: p(x1 + 1, 5, 'interact', 'up'),
      ...seats,
      ...bar,
      [`${P}_QUEUE_01`]: p(x0, 6, 'wait', 'up'),
      [`${P}_QUEUE_02`]: p(x0 + 1, 6, 'wait', 'up'),
      [`${P}_WAIT_01`]: p(L.doorX - 1, doorY, 'wait', 'up'),
      [`${P}_WAIT_02`]: p(L.doorX + 1, doorY, 'wait', 'up'),
      // Donde espera el repartidor a que le den el pedido, junto a la puerta.
      [`${P}_PICKUP`]: p(L.doorX + 3, doorY, 'wait', 'up'),
      [`${P}_WAITER_01`]: p(x1 + 2, 6, 'work'),
      [`${P}_WAITER_02`]: p(L.doorX + 4, doorY, 'work'),
    },
  };
}

export const FOOD_INTERIORS: readonly LocationDef[] = FOOD_VENUES.map(interiorOf);
