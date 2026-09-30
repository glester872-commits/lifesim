// Efectos de ambiente del agua, del fuego y de las cocinas (systems/AmbientRules.ts): `npm run check`.
// Falla si uno sale sin su motivo: la cocina humeando cerrada o a media tarde, agua
// de las ruedas en seco, pisadas que salpican quietas, destellos de día o en seco,
// chispas al arrancar el tren.
import assert from 'node:assert/strict';
import { coldness, cooking, glintLevel, kitchenSteam, sparkRate, splashRate, sprayRate } from '../src/systems/AmbientRules.ts';
import type { Weather } from '../src/systems/Weather.ts';

const w = (o: Partial<Weather>): Weather => ({ cloud: 0.1, rain: 0, wet: 0, celsius: 18, sky: 'clear', temp: 'mild', ...o });

// Frío que se ve.
assert.equal(coldness(w({ celsius: 3 })), 1, 'a 3 °C no hace frío');
assert.equal(coldness(w({ celsius: 20 })), 0, 'a 20 °C hace frío');

// Cocina: a la hora de cocinar y abierta; con frío se ve más.
for (const h of [8, 13.5, 21]) assert.ok(cooking(h), `a las ${h} no se cocina`);
for (const h of [5, 11, 17, 23.5]) assert.ok(!cooking(h), `a las ${h} se cocina`);
assert.ok(kitchenSteam(14, w({ celsius: 28 }), true) > 0, 'la cocina no humea a la hora de comer con calor');
assert.ok(kitchenSteam(14, w({ celsius: 4 }), true) > kitchenSteam(14, w({ celsius: 28 }), true), 'con frío la cocina no se ve más');
assert.equal(kitchenSteam(17, w({ celsius: 4 }), true), 0, 'la cocina humea a media tarde');
assert.equal(kitchenSteam(14, w({}), false), 0, 'humea la cocina de un local cerrado');

// Agua de las ruedas: mojado y con velocidad; más cuanto más rápido.
assert.equal(sprayRate(110, w({})), 0, 'agua de las ruedas en seco');
assert.equal(sprayRate(20, w({ wet: 0.9 })), 0, 'un coche parado levanta agua');
assert.ok(sprayRate(110, w({ wet: 0.9 })) > sprayRate(45, w({ wet: 0.9 })), 'el agua no depende de la velocidad');

// Pisadas: andando y con el suelo encharcado; lloviendo, algo más.
assert.equal(splashRate(true, w({ wet: 0.2 })), 0, 'salpica el suelo casi seco');
assert.equal(splashRate(false, w({ wet: 0.9 })), 0, 'salpica quien está quieto');
assert.ok(splashRate(true, w({ wet: 0.9, rain: 0.5 })) > splashRate(true, w({ wet: 0.9 })), 'lloviendo no salpica más');

// Destellos en el mojado: sólo de noche y en mojado.
assert.equal(glintLevel(w({ wet: 0.9 }), 0), 0, 'destellos a mediodía');
assert.equal(glintLevel(w({}), 1), 0, 'destellos en seco');
assert.ok(glintLevel(w({ wet: 0.9 }), 1) > glintLevel(w({ wet: 0.4 }), 1), 'más agua no brilla más');

// Chispas del tren: sólo frenando, más cuanto más despacio (el freno muerde).
assert.ok(sparkRate('ARRIVING', 40) > sparkRate('ARRIVING', 150), 'el freno no muerde más al final');
assert.equal(sparkRate('DEPARTING', 40), 0, 'chispas al arrancar');
assert.equal(sparkRate('BOARDING', 0), 0, 'chispas con el tren parado');
assert.equal(sparkRate('ARRIVING', 2), 0, 'chispas con el tren ya quieto');

console.log('OK: cocinas, agua, destellos y chispas sólo con su motivo.');
