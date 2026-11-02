// ALPHA-10 · emergencias (data/emergencies.ts, systems/Emergencies.ts): el incendio de la Ronda con la misma lógica que
// el juego, sin Phaser. Frecuencia y enfriamiento en dos años de días, fases siempre en orden, nunca dos a la vez, sitios
// sin puerta que se use, la autobomba sin cortar la acera ni ninguna puerta, la llamada al 112 adelanta la salida una
// vez y sobrevive a guardar y cargar, y el forzado de desarrollo se limpia solo. `npm run check`.
import assert from 'node:assert/strict';
import { EMERGENCIES } from '../src/data/emergencies.ts';
import { callEmergency, callFlag, clearForced, cooldownLeft, emergencyInfo, forceIncident, incidentAt, phaseAt, stagingOf, type EmergencyPhase } from '../src/systems/Emergencies.ts';
import { getLocation, getSpawn, isWalkable } from '../src/systems/LocationSystem.ts';
import { tilePath } from '../src/systems/Navigation.ts';
import { createInitialState, SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';

const ORDER: readonly EmergencyPhase[] = ['smoke', 'responding', 'extinguishing', 'cleanup'];
const DAYS = 730;

for (const def of EMERGENCIES) {
  const loc = getLocation(def.location);
  const buildings = new Map((loc.buildings ?? []).map((b) => [b.id, b]));

  // ----------------------------------------------- sitios: existen, no tienen interior y se llega desde el parque
  assert.ok(buildings.has(def.station), `${def.id}: no está el parque ${def.station}`);
  const station = getSpawn(loc, def.station);
  for (const site of def.sites) {
    const b = buildings.get(site);
    assert.ok(b, `${def.id}: ${site} no es un edificio de ${def.location}`);
    assert.ok(!b.enter, `${def.id}: ${site} tiene interior; un incendio cerraría una puerta que se usa`);
    const s = stagingOf(def, loc, site);
    assert.ok(tilePath(loc, station, s.door), `${def.id}: del parque no se llega a ${site}`);
    for (const p of [...s.crew, ...s.onlookers]) assert.ok(isWalkable(loc, p.tx, p.ty), `${def.id}/${site}: alguien de pie en un tile bloqueado`);
    assert.ok(s.onlookers.length > 0, `${def.id}/${site}: no hay acera de enfrente para mirar`);
    assert.ok(s.engine, `${def.id}/${site}: la autobomba no tiene dónde aparcar`);
    // La autobomba aparcada no corta nada: la acera de la puerta se recorre de punta a punta y se llega a cada puerta.
    if (s.engine) {
      const avoid = new Set(s.engine.map((p) => `${p.tx},${p.ty}`));
      assert.ok(!avoid.has(`${s.door.tx},${s.door.ty}`), `${def.id}/${site}: la autobomba tapa la puerta`);
      const ends = [{ tx: 0, ty: s.door.ty }, { tx: loc.ground[0].length - 1, ty: s.door.ty }].filter((p) => isWalkable(loc, p.tx, p.ty));
      for (const e of ends) assert.ok(tilePath(loc, e, s.door, avoid), `${def.id}/${site}: con la autobomba no se llega a la puerta desde (${e.tx}, ${e.ty})`);
      for (const b of buildings.values()) {
        if (!b.enter || !loc.spawns[b.id]) continue;
        const d = getSpawn(loc, b.id);
        assert.ok(!avoid.has(`${d.tx},${d.ty}`), `${def.id}/${site}: la autobomba tapa la puerta de ${b.id}`);
      }
    }
  }

  // ----------------------------------------------- calendario: frecuencia, enfriamiento, una a la vez, fases en orden
  const days: number[] = [];
  for (let day = 0; day < DAYS; day++) {
    const inc = incidentAt(def, day * 1440);
    const today = inc && inc.day === day ? inc : incidentAt(def, day * 1440 + 1439);
    if (today && today.day === day) {
      days.push(day);
      assert.ok(today.start >= day * 1440 + def.hours[0] * 60 && today.start < day * 1440 + def.hours[1] * 60, `${def.id}: día ${day} empieza fuera de hora`);
      assert.ok(today.start < today.report && today.report < today.arrive && today.arrive < today.out && today.out < today.end, `${def.id}: día ${day} fases desordenadas`);
      let last = -1;
      for (let t = today.start; t < today.end; t++) {
        const ph = phaseAt(incidentAt(def, t), t);
        const i = ORDER.indexOf(ph);
        assert.ok(i >= last, `${def.id}: día ${day} vuelve de ${ORDER[last]} a ${ph}`);
        last = i;
      }
      assert.equal(phaseAt(incidentAt(def, today.end), today.end), 'none', `${def.id}: día ${day} no termina`);
    }
  }
  for (let i = 1; i < days.length; i++) assert.ok(days[i] - days[i - 1] >= def.cooldownDays, `${def.id}: dos incendios a ${days[i] - days[i - 1]} días`);
  const perYear = (days.length / DAYS) * 365;
  assert.ok(perYear >= 8 && perYear <= 40, `${def.id}: ${perYear.toFixed(1)} al año (esperados entre 8 y 40)`);

  // ----------------------------------------------- llamar al 112: antes del aviso adelanta la salida; después, nada
  const first = incidentAt(def, days[0] * 1440)!;
  const early = first.start + 1;
  const call = callEmergency(def, early, {});
  assert.ok(call && call.flag === callFlag(def, first.day), `${def.id}: llamar con humo no se registra`);
  const calls = { [call.flag]: call.minute };
  const called = incidentAt(def, early, calls)!;
  assert.ok(called.calledByPlayer && called.report === early && called.arrive < first.arrive, `${def.id}: llamar antes no adelanta la salida`);
  assert.equal(callEmergency(def, early + 1, calls), null, `${def.id}: se puede volver a dar el aviso`);
  assert.equal(callEmergency(def, first.report + 1, {}), null, `${def.id}: llamar con el aviso ya dado cambia algo`);
  // Guardar y cargar con la llamada: el incidente sigue siendo el de la llamada (sin depender de la memoria de la página).
  const store = new Map<string, string>();
  const storage: SaveStorage = { read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) };
  const base = createInitialState();
  new SaveSystem(storage).save({ ...base, events: { ...base.events, eventFlags: { ...base.events.eventFlags, ...calls } } });
  const loaded = new SaveSystem(storage).load()!;
  assert.equal(incidentAt(def, early, loaded.events.eventFlags)!.report, early, `${def.id}: tras recargar se olvida la llamada`);

  // ----------------------------------------------- formato común y forzado de desarrollo
  const mid = first.arrive + 1;
  const info = emergencyInfo(def, mid);
  assert.equal(info.id, `fire:${def.id}`);
  assert.equal(info.lifecycle, 'RESOLUTION');
  assert.equal(info.responders.length, def.crew);
  assert.ok(cooldownLeft(def, first.end + 60) > 0 && emergencyInfo(def, first.end + 60).lifecycle === 'COOLDOWN', `${def.id}: sin enfriamiento tras apagarse`);
  const quiet = (days.find((d, i) => i > 0 && d - days[i - 1] > def.cooldownDays + 2) ?? DAYS) - 1;
  const t0 = quiet * 1440 + 600;
  forceIncident(def, t0, def.sites[0]);
  const forced = incidentAt(def, t0)!;
  assert.ok(forced.forced && forced.site === def.sites[0] && phaseAt(forced, t0) === 'smoke', `${def.id}: forzar no empieza ahora`);
  assert.equal(incidentAt(def, forced.end + 1)?.forced ?? false, false, `${def.id}: lo forzado no se limpia al acabar`);
  forceIncident(def, t0);
  clearForced(def);
  assert.equal(incidentAt(def, t0)?.forced ?? false, false, `${def.id}: clearForced no lo quita`);

  console.log(`OK ${def.id}: ${days.length} incendios en ${DAYS} días (${perYear.toFixed(1)}/año, ≥ ${def.cooldownDays} días entre dos), ${def.sites.length} portales alcanzables sin cortar acera ni puertas, fases en orden, 112 guardado y forzado limpio.`);
}
