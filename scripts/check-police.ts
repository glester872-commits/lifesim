// La policía (systems/Police sobre StreetLife y Pickpocket): la comisaría de Puerta Central, las patrullas de cada barrio
// con su cupo, su hora y sus zonas, la respuesta a un robo visto (aviso → llegada → atiende → vuelve), la cancelación sin
// nadie enganchado y la recepción (información y denuncia). La misma lógica que el juego, sin Phaser.
// Llamado desde la cadena `check` de package.json. `node scripts/check-police.ts`.
import assert from 'node:assert/strict';
import { STREET_PROFILES } from '../src/data/streets.ts';
import { PLACES } from '../src/data/places.ts';
import { getOffer } from '../src/data/services.ts';
import { profileFor, type Clock } from '../src/systems/Crowd.ts';
import { getLocation, isWalkable } from '../src/systems/LocationSystem.ts';
import { TILE } from '../src/config/constants.ts';
import { VEHICLES } from '../src/data/vehicles.ts';
import { withDistrictLanes } from '../src/systems/Districts.ts';
import { Traffic } from '../src/systems/Traffic.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { absMinute } from '../src/systems/Handoff.ts';
import { identity } from '../src/systems/Service.ts';
import { zoneAt } from '../src/systems/Zones.ts';
import { deskBrief, fileReport, incidentById, parsePolice, patrolLines, POLICE, policeMemory, recentIncidents, recordIncident, reportable, resetIncidents, restoreIncidents } from '../src/systems/Police.ts';
import { SaveSystem, createInitialState, restore, type SaveStorage } from '../src/systems/SaveSystem.ts';
import { PATROL, StreetLife, streetProfileFor, type Walker } from '../src/systems/StreetLife.ts';

const TUE = 2;
const FRI = 5;
const SAT = 6;
const MS = 500; // ms reales por minuto de juego
const at = (day: number, minutes: number): Clock => ({ day: day + Math.floor(minutes / 1440), hour: Math.floor((minutes % 1440) / 60), minute: minutes % 60 });
const FAR = { tx: -999, ty: -999 };

/** Una calle poblada a esa hora, lista para avanzar en pasos de 100 ms. */
function street(location: string, day: number, hour: number, seed: number, who: { tx: number; ty: number } = FAR) {
  const life = new StreetLife(getLocation(location), streetProfileFor(location)!, seededRng(seed));
  life.pickpocket.seed(seed + 1000);
  let minutes = Math.round(hour * 60);
  let acc = 0;
  life.populate(at(day, minutes), who);
  return {
    life,
    step: (ms: number, each?: () => void): void => {
      for (let t = 0; t < ms; t += 100) {
        acc += 100;
        if (acc >= MS) {
          acc -= MS;
          minutes++;
        }
        life.update(100, at(day, minutes), who);
        each?.();
      }
    },
  };
}
const patrols = (life: StreetLife): Walker[] => life.agents.filter((a) => a.role === PATROL);

// --------------------------------------------------- 1. datos: comisaría y reglas de patrulla de cada barrio
{
  // La comisaría de Puerta Central (24 h) y la oficina de barrio de Vallesco (ALPHA-10, en la Ronda): las mismas reglas.
  const STATIONS = [
    { place: 'pc-comisaria', street: 'puerta-central', point: 'PC_COMISARIA_ENTRANCE' },
    { place: 'vallesco-policia', street: 'district', point: 'VPOLICIA_ENTRANCE' },
  ];
  assert.deepEqual(PLACES.filter((p) => p.tags.includes('police')).map((p) => p.id).sort(), STATIONS.map((s) => s.place).sort(), 'comisarías en data/places.ts distintas de las que se comprueban');
  for (const s of STATIONS) {
    const station = PLACES.find((p) => p.id === s.place)!;
    const pc = getLocation(s.street);
    const building = pc.buildings?.find((b) => b.id === station.building);
    assert.equal(building?.enter?.location, s.place, `${s.place}: la puerta de la comisaría no lleva a su interior`);
    assert.ok(pc.spawns?.[station.building!], `${s.place}: sin sitio delante de la puerta para salir`);
    assert.ok((pc.links ?? []).some((l) => l.includes(s.point)), `${s.place}: la puerta de la comisaría no está en el grafo de la calle`);
    const inside = getLocation(s.place);
    const exit = inside.portals?.find((p) => p.to.location === s.street);
    assert.equal(exit?.to.spawn, station.building, `${s.place}: sin salida a la calle`);
    assert.ok(!(inside.props ?? []).some((p) => p.kind === 'register'), `${s.place}: una recepción no lleva caja registradora`);
    // Recepción con agente que ofrece el servicio de la comisaría (systems/Police, scenes/Menus.openPoliceDesk).
    const desk = profileFor(s.place)?.staff.find((st) => st.service === 'police-officer');
    assert.ok(desk, `${s.place}: sin agente de guardia en recepción`);
    const offer = identity(desk).offers;
    assert.ok(offer && getOffer(offer).kind === 'police', `${s.place}: la guardia no ofrece la recepción de la comisaría`);
    const brief = getOffer(offer);
    assert.equal(brief.kind === 'police' && brief.street, s.street, `${s.place}: la recepción habla de otro barrio`);
  }

  for (const profile of STREET_PROFILES) {
    const loc = getLocation(profile.location);
    const rules = profile.trips.filter((r) => r.role === PATROL);
    assert.ok(rules.length > 0, `${profile.location}: sin patrulla`);
    for (const r of rules) {
      assert.ok(r.ambient && r.uniform === 'uniforme-policia', `${profile.location}: la patrulla no es ambiente o va sin uniforme`);
      assert.ok((r.group?.[1] ?? 1) <= POLICE.patrolCap, `${profile.location}: grupo mayor que el cupo`);
      // Nunca a las calles de vecinos: sus paradas están en plazas, metro, comercio, ocio o la explanada.
      for (const prefix of r.to.points ?? []) {
        const stops = Object.entries(loc.points ?? {}).filter(([id]) => id.startsWith(prefix));
        assert.ok(stops.length > 0, `${profile.location}: ninguna parada ${prefix}`);
        for (const [id, p] of stops) assert.notEqual(zoneAt(loc.id, p.tx, p.ty)?.type, 'residential', `${profile.location}: parada de patrulla en zona residencial (${id})`);
      }
    }
  }
}

// La denuncia se deriva a una recepción abierta, también de madrugada y justo al abrir/cerrar Vallesco.
{
  for (let day = 1; day <= 7; day++) {
    for (const [hour, minute] of [[0, 0], [7, 59], [8, 0], [12, 0], [21, 59], [22, 0], [23, 59]]) {
      const now = absMinute(day, hour, minute);
      const station = PLACES.find((p) => p.id === (hour >= 8 && hour < 22 ? 'vallesco-policia' : 'pc-comisaria'))!;
      resetIncidents();
      recordIncident({ location: 'district', zone: 'Plaza de la Fuente', at: now - 1, victim: 'player', amount: 12.5 });
      for (const { location } of STREET_PROFILES) {
        const lines = patrolLines(location, { day, hour, minute }, now);
        assert.ok(lines.at(-1)?.includes(station.name), `${location}, día ${day} ${hour}:${minute}: la patrulla no remite a la comisaría abierta (${station.name})`);
      }
    }
  }
  resetIncidents();
}

// --------------------------------------------------- 2. aparición natural: hora, zona, cupo y salida
/** Simula `hours` horas de juego desde `hour`: presencia (parte del tiempo con alguien), máximo a la vez y dónde se paran. */
function watch(location: string, day: number, hour: number, hours: number, seed: number) {
  const s = street(location, day, hour, seed);
  const ground = getLocation(location).ground;
  let samples = 0;
  let present = 0;
  let max = 0;
  const seen = new Set<number>();
  const stops = new Set<string>();
  s.step(hours * 60 * MS, () => {
    const p = patrols(s.life);
    max = Math.max(max, p.length);
    for (const a of p) {
      seen.add(a.id);
      if (a.staying && a.stayPoint) stops.add(zoneAt(location, a.x, a.y)?.type ?? '-');
      // Parados, por la acera o la plaza: nunca en la calzada.
      if (a.staying) assert.ok(!['u', 'l', '.'].includes(ground[Math.round(a.y)]?.[Math.round(a.x)] ?? ''), `${location}: patrulla parada en la calzada`);
    }
    samples++;
    if (p.length > 0) present++;
  });
  return { presence: present / samples, max, seen: seen.size, stops, left: seen.size - patrols(s.life).length };
}
{
  const cases = [
    { what: 'Puerta Central de día (metro y monumento)', location: 'puerta-central', day: TUE, hour: 10, want: ['plaza'] },
    { what: 'Puerta Central de noche', location: 'puerta-central', day: SAT, hour: 22, want: ['plaza'] },
    { what: 'Vallesco de día (plaza y metro)', location: 'district', day: TUE, hour: 10, want: ['plaza', 'metro'] },
    { what: 'Vallesco de noche (ocio)', location: 'district', day: FRI, hour: 22, want: ['nightlife', 'commercial'] },
    { what: 'Cuatro Ríos de día (metro y avenida)', location: 'cuatro-rios', day: TUE, hour: 10, want: ['metro', 'main_road'] },
    { what: 'Cuatro Ríos de noche (recreativos)', location: 'cuatro-rios', day: FRI, hour: 21, want: ['main_road'] },
    { what: 'Ribera de día', location: 'ribera', day: SAT, hour: 12, want: ['plaza', 'park'] },
    { what: 'Velaria de día', location: 'velaria', day: TUE, hour: 11, want: ['plaza'] },
    { what: 'Arena sin partido', location: 'arena', day: TUE, hour: 11, want: ['metro', 'special_event_area'] },
  ];
  for (const c of cases) {
    const r = watch(c.location, c.day, c.hour, 4, 7);
    console.log(`  ${c.what}: presencia ${(r.presence * 100).toFixed(0)} %, ${r.seen} agentes, máx. ${r.max} a la vez, paradas en ${[...r.stops].join(', ') || '—'}, ${r.left} ya se han ido`);
    assert.ok(r.max <= POLICE.patrolCap, `${c.what}: ${r.max} agentes a la vez (cupo ${POLICE.patrolCap})`);
    assert.ok(r.seen > 0, `${c.what}: ninguna patrulla en cuatro horas`);
    for (const z of r.stops) assert.ok(c.want.includes(z), `${c.what}: parada en ${z}`);
    assert.ok(r.left > 0, `${c.what}: nadie ha terminado su ronda (salida)`);
  }
}

// --------------------------------------------------- 3. respuesta: aviso → llegada → atiende → vuelve, una sola vez
resetIncidents();
{
  const s = street('puerta-central', SAT, 12, 11);
  s.step(20_000);
  // La disponibilidad de víctima es preparación: esperar hasta una parada real, no exigir la semilla antigua.
  for (let i = 0; i < 60 && !s.life.agents.some(a => a.kind === 'visitor' && a.role !== PATROL && a.role !== 'terrace' && !a.leader && a.path.length === 0 && a.staying && zoneAt('puerta-central', Math.floor(a.x), Math.floor(a.y))?.type === 'plaza'); i++) s.step(500);
  // Alguien quieto en la plaza (el aviso dice «Plaza de la Puerta»), no en una mesa de terraza: a esa la suelta el
  // servicio de la terraza cuando acaba, aviso o no. Al recibir el aviso espera a la policía (dispatch le alarga el rato y
  // el recorte de gente no lo echa): antes, con más gente de la cuenta, se iba y el aviso se cancelaba.
  const victim = s.life.agents.find((a) => a.kind === 'visitor' && a.role !== PATROL && a.role !== 'terrace' && !a.leader && a.path.length === 0 && a.staying && zoneAt('puerta-central', Math.floor(a.x), Math.floor(a.y))?.type === 'plaza')!;
  assert.ok(victim, 'nadie quieto en la plaza para hacer de víctima');
  const rec = recordIncident({ location: 'puerta-central', zone: 'Plaza de la Puerta', at: absMinute(SAT, 12, 0), victim: 'npc', amount: 20 });
  assert.equal(s.life.dispatch(victim, rec.id), true, 'nadie acude al aviso');
  assert.equal(s.life.dispatch(victim, rec.id), false, 'el mismo aviso recibe dos respuestas');
  const team = [...s.life.responding];
  assert.ok(team.length >= 1 && team.length <= POLICE.patrolCap, `${team.length} agentes respondiendo`);
  assert.ok(team.every((a) => a.role === PATROL && a.respond?.incident === rec.id), 'responde quien no es patrulla o con otro aviso');
  // Un segundo aviso a la vez: nadie que ya responde lo coge (una sola asignación por agente).
  const other = s.life.agents.find((a) => a !== victim && a.kind === 'visitor' && a.role !== PATROL && !a.leader)!;
  const rec2 = recordIncident({ location: 'puerta-central', zone: 'Plaza de la Puerta', at: absMinute(SAT, 12, 1), victim: 'npc', amount: 0 });
  s.life.dispatch(other, rec2.id);
  for (const a of team) assert.equal(a.respond?.incident, rec.id, 'un agente lleva dos avisos');
  let attendedAt = -1;
  let ms = 0;
  while (ms < POLICE.reachMs + POLICE.attendMs + 5_000 && team.some((a) => a.respond)) {
    s.step(100);
    ms += 100;
    if (attendedAt < 0 && incidentById(rec.id)?.attended) {
      attendedAt = ms;
      const officer = team.find((a) => a.respond?.phase === 'ATTEND')!;
      assert.ok(Math.hypot(officer.x - victim.x, officer.y - victim.y) <= 2.6, 'atiende lejos de la víctima');
      assert.match(victim.line, /policía/, 'la víctima no cuenta que la ha atendido la policía');
    }
  }
  assert.ok(attendedAt > 0, 'el agente no llegó a atender');
  assert.ok(team.every((a) => !a.respond), 'un agente se ha quedado enganchado al aviso');
  // Vuelta: a la comisaría (está en esta calle) o por un borde; y al llegar, fuera de la calle.
  for (const a of team) {
    if (!s.life.agents.includes(a)) continue;
    assert.ok(a.vanish && (a.dest === 'PC_COMISARIA_ENTRANCE' || a.dest?.startsWith('EDGE_')), `no vuelve: ${a.dest}`);
  }
  s.step(60_000);
  assert.ok(team.every((a) => !s.life.agents.includes(a)), 'la patrulla no ha salido de la calle tras atender');
  console.log(`  respuesta: ${team.length} agente(s), atendido a los ${(attendedAt / 1000).toFixed(1)} s, de vuelta y fuera`);
}

// --------------------------------------------------- 4. cancelación a mitad: la víctima se va antes de que lleguen
{
  const s = street('district', TUE, 10, 21);
  s.step(10_000);
  const victim = s.life.agents.find((a) => a.kind === 'visitor' && a.role !== PATROL && !a.leader)!;
  const rec = recordIncident({ location: 'district', zone: 'Plaza de la Fuente', at: absMinute(TUE, 10, 0), victim: 'npc', amount: 5 });
  assert.ok(s.life.dispatch(victim, rec.id), 'sin patrulla ni hueco para salir una en Vallesco');
  const team = [...s.life.responding];
  // Cancelado en plena transición: la víctima sale de la calle.
  s.life.agents.splice(s.life.agents.indexOf(victim), 1);
  s.step(300);
  assert.ok(team.every((a) => !a.respond), 'el agente sigue con un aviso cancelado');
  assert.ok(team.every((a) => !s.life.agents.includes(a) || a.vanish), 'tras cancelar, el agente no vuelve');
  assert.equal(incidentById(rec.id)?.attended, false, 'un aviso cancelado consta como atendido');
  assert.ok(patrols(s.life).length <= POLICE.patrolCap);
}

// --------------------------------------------------- 5. un robo de verdad (systems/Pickpocket) avisa a la patrulla
{
  // Un tirón sólo se avisa si alguien lo nota (METRO_CONFIG.pickpocket): se recorren unas semillas fijas hasta dar con
  // uno visto. No es para que pase la prueba: muchos no los ve nadie y entonces no hay a quién avisar.
  let reported = false;
  for (let seed = 1; seed <= 12 && !reported; seed++) {
    const s = street('puerta-central', SAT, 19, 100 + seed, { tx: 27, ty: 26 });
    s.step(15_000);
    if (!s.life.pickpocket.force({ tx: 27, ty: 26 }).ok) continue;
    const before = recentIncidents(absMinute(SAT, 23, 59)).length;
    let ms = 0;
    while (s.life.pickpocket.active && ms < 60_000 && s.life.responding.length === 0) {
      s.step(100);
      ms += 100;
    }
    if (s.life.responding.length === 0) continue;
    reported = true;
    assert.equal(recentIncidents(absMinute(SAT, 23, 59)).length, before + 1, 'el robo visto no consta');
    assert.ok(s.life.pickpocket.lifecycle().responders.length > 0, 'el ciclo del robo no muestra quién responde');
    // Hasta el final: llega, atiende, se cierra y se va; nunca por encima del cupo, y luego la calle vuelve a lo normal.
    const rec = recentIncidents(absMinute(SAT, 23, 59)).at(-1)!;
    const team = [...s.life.responding];
    const cap = streetProfileFor('puerta-central')!.patrolCap ?? POLICE.patrolCap;
    let attending = false;
    for (ms = 0; ms < POLICE.chaseMs + POLICE.detainMs + POLICE.reachMs + POLICE.attendMs + 5_000 && s.life.responding.length > 0; ms += 100) {
      s.step(100);
      attending ||= team.some((a) => a.respond?.phase === 'ATTEND');
      assert.ok(patrols(s.life).length <= cap, `robo: ${patrols(s.life).length} patrullas con cupo ${cap}`);
    }
    assert.ok(attending && incidentById(rec.id)?.attended, 'la patrulla no llega a atender el robo');
    assert.equal(s.life.responding.length, 0, 'el aviso no se cierra');
    assert.ok(team.every((a) => !s.life.agents.includes(a) || a.vanish), 'tras atender, el agente no vuelve a su sitio');
    assert.equal(s.life.pickpocket.active, false, 'el carterista sigue en la calle tras el aviso');
    s.step(60_000);
    assert.ok(team.every((a) => !s.life.agents.includes(a)), 'el refuerzo no se retira');
    console.log(`  robo real: avisado con la semilla ${100 + seed}, atendido y cerrado`);
  }
  assert.ok(reported, 'ningún tirón visto en 12 semillas: la patrulla no recibe avisos');
}

// --------------------------------------------------- 6. recepción y patrulla: lo que cuentan y la denuncia
{
  resetIncidents();
  const noon = { day: TUE, hour: 12, minute: 0 };
  const now = absMinute(TUE, 12, 0);
  assert.equal(reportable(now), undefined, 'hay algo que denunciar sin haber robo');
  const brief = deskBrief('puerta-central', noon, now);
  assert.match(brief[0], /Puerta Central/, 'la recepción no habla de su barrio');
  assert.match(brief[1], /ojo en/, 'a mediodía en la plaza no hay riesgo de tirón');
  assert.match(brief[2], /no nos consta/, 'cuenta robos que no han pasado');
  assert.match(deskBrief('puerta-central', { day: TUE, hour: 4, minute: 0 }, now)[1], /tranquilo/, 'de madrugada no está tranquilo');
  // Un intento sin dinero no se denuncia; uno con dinero, sí, una vez.
  recordIncident({ location: 'district', zone: 'Plaza de la Fuente', at: now - 30, victim: 'player', amount: 0 });
  assert.equal(reportable(now), undefined, 'se ofrece denunciar un intento sin robo');
  const rob = recordIncident({ location: 'district', zone: 'Plaza de la Fuente', at: now - 20, victim: 'player', amount: 12.5 });
  assert.equal(reportable(now)?.id, rob.id);
  assert.match(patrolLines('district', noon, now).join(' '), /Plaza de la Fuente.*Policía de barrio · Vallesco/s, 'la patrulla no remite a la comisaría');
  assert.equal(fileReport(rob.id, now), true);
  assert.equal(fileReport(rob.id, now), false, 'se puede denunciar dos veces');
  assert.equal(reportable(now), undefined);
  assert.match(deskBrief('puerta-central', noon, now)[2], /Plaza de la Fuente/, 'la recepción no sabe del robo');
  // Uno de anoche se dice de anoche; pasado un día, ya no consta.
  recordIncident({ location: 'district', zone: 'Calle del Carmen', at: absMinute(TUE - 1, 23, 0), victim: 'npc', amount: 8 });
  assert.match(deskBrief('puerta-central', { day: TUE, hour: 9, minute: 0 }, absMinute(TUE, 9, 0))[2], /ayer a las 23:00/, 'un robo de anoche no se dice de ayer');
  // Pasado un día, ya no consta.
  assert.equal(recentIncidents(now + POLICE.memoryMinutes + 1).length, 0);
}

// --------------------------------------------------- 7. persecución: el agente cerca del ladrón sale tras él y acaba con la víctima
{
  let chased = 0;
  let caught = 0;
  for (let seed = 1; seed <= 80 && chased < 4; seed++) {
    const s = street('puerta-central', SAT, 19, 300 + seed, { tx: 27, ty: 26 });
    s.step(15_000);
    // Un agente cerca del sitio del tirón: a cuatro tiles, donde se pueda estar.
    const cop = patrols(s.life).find((a) => !a.leader);
    const near = [[31, 26], [27, 30], [23, 26], [27, 22]].find(([x, y]) => isWalkable(getLocation('puerta-central'), x, y));
    if (!cop || !near) continue;
    Object.assign(cop, { x: near[0], y: near[1], path: [], staying: false, settled: false, timer: 0, delay: 0 });
    if (!s.life.pickpocket.force({ tx: 27, ty: 26 }).ok) continue;
    let chaser: Walker | undefined;
    let incident = -1;
    let phases = '';
    for (let ms = 0; ms < 60_000 && (s.life.pickpocket.active || s.life.responding.length > 0); ms += 100) {
      s.step(100);
      if (!chaser) {
        chaser = s.life.agents.find((a) => a.respond?.phase === 'CHASE');
        incident = chaser?.respond?.incident ?? -1;
      }
      const p = chaser?.respond?.phase ?? '-';
      if (chaser && !phases.endsWith(p)) phases += ` ${p}`;
      assert.ok(patrols(s.life).length <= 3, 'la persecución saca agentes por encima del cupo');
    }
    if (!chaser) continue;
    chased++;
    const rec = incidentById(incident)!;
    if (rec.caught) caught++;
    assert.ok(phases.startsWith(' CHASE'), `la persecución no empieza corriendo (${phases})`);
    assert.ok(rec.caught ? phases.includes('DETAIN') : !phases.includes('DETAIN'), `alcanzado y retenido no cuadran (${phases})`);
    assert.ok(rec.attended, `tras la persecución nadie atiende a la víctima (${phases})`);
    assert.equal(chaser.respond, undefined, `el agente sigue enganchado a la persecución (${phases})`);
    assert.notEqual(chaser.gait, 'jog', 'el agente sigue corriendo después');
    assert.ok(chaser.speed < 3.8, 'el agente no vuelve a su paso');
  }
  assert.ok(chased > 0, 'ningún agente salió tras el ladrón en 80 semillas con uno al lado');
  console.log(`  persecución: ${chased} con agente cerca, ${caught} alcanzado(s); todos vuelven a su paso y sueltan el aviso`);
}

// --------------------------------------------------- 8. coche patrulla: uno por calle, va al aviso con luces, para y sigue
{
  const loc = getLocation('puerta-central');
  const clock = { day: SAT, minuteOfDay: 19 * 60 };
  const t = new Traffic(withDistrictLanes(loc, loc.traffic!), VEHICLES, [], loc.ground[0].length * TILE, seededRng(11));
  const police = (): number => t.vehicles.filter((v) => v.type.id === 'police').length;
  assert.ok(t.forceSpawn('police', clock), 'el coche patrulla no puede salir en Puerta Central');
  assert.equal(t.forceSpawn('police', clock), false, 'sale un segundo coche patrulla en la misma calle');
  // Muchas horas de tráfico: nunca dos.
  for (let ms = 0; ms < 600_000; ms += 100) {
    t.update(100, { day: SAT, minuteOfDay: 8 * 60 + ms / 500 }, []);
    assert.ok(police() <= 1, 'dos coches patrulla a la vez');
  }
  // Un aviso: el que haya (o uno nuevo por el borde) va con las luces, para a la altura y, al soltarlo, sigue sin luces.
  const row = loc.traffic!.lanes[0].row;
  const car = t.callTo(20, row + 2, ['police'], clock);
  assert.ok(car?.alert, 'el coche patrulla no acude al aviso con las luces');
  let ms = 0;
  while (!t.isStopped(car!) && t.has(car!) && ms < POLICE.reachMs) {
    t.update(100, clock, []);
    ms += 100;
  }
  assert.ok(t.isStopped(car!), 'el coche patrulla no para en el aviso');
  t.release(car!);
  assert.equal(car!.alert, undefined, 'las luces siguen encendidas al seguir su carril');
  console.log(`  coche patrulla: uno por calle, llega al aviso en ${(ms / 1000).toFixed(1)} s con luces, para y sigue`);
}

// ----------------------------------------------- la memoria de la comisaría se guarda con la partida (GameState.snapshot)
{
  const store = new Map<string, string>();
  const storage: SaveStorage = { read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) };
  const save = new SaveSystem(storage);
  // Lo mismo que hace GameState: guardar copia el registro vivo; cargar lo sustituye.
  const persist = (): void => assert.ok(save.save({ ...createInitialState(), police: policeMemory() }));
  const reload = (): void => restoreIncidents(restore(save.load()).police);
  const now = absMinute(5, 19, 30);
  resetIncidents();
  const a = recordIncident({ location: 'district', zone: 'Calle del Carmen', at: now - 20, victim: 'player', amount: 10.92 });
  recordIncident({ location: 'district', zone: 'Calle del Carmen', at: now - 10, victim: 'npc', amount: 7 }).attended = true;
  persist();
  resetIncidents(); // recargar la página: el módulo empieza vacío
  reload();
  const back = reportable(now);
  assert.ok(back && back.id === a.id && back.amount === 10.92, 'el robo denunciable no sobrevive a recargar');
  assert.equal(recentIncidents(now).find((r) => r.victim === 'npc')?.attended, true, 'se pierde quién lo atendió');
  // Denunciar, guardar, recargar: sigue denunciado y no se puede denunciar otra vez.
  assert.ok(fileReport(back!.id, now));
  persist();
  resetIncidents();
  reload();
  assert.equal(reportable(now), undefined, 'tras recargar se puede volver a denunciar');
  assert.equal(incidentById(a.id)?.reported, true);
  // Los números de denuncia no se repiten tras cargar.
  assert.ok(recordIncident({ location: 'district', zone: 'x', at: now, victim: 'npc', amount: 0 }).id > a.id + 1);
  // Partida anterior (sin campo), memoria rota o registros sueltos mal formados: carga sin romper, vacía o sin lo malo.
  restoreIncidents(restore({ ...createInitialState() }).police);
  assert.equal(recentIncidents(now).length, 0, 'una partida anterior hereda robos de otra');
  assert.equal(parsePolice('basura'), undefined);
  const mixed = parsePolice({ nextId: 'x', incidents: [{ id: 3, at: now, amount: 5, location: 'district', zone: 'z', victim: 'player' }, { id: -1 }, null, { id: 4, at: now, amount: -2, location: 'd', zone: 'z', victim: 'npc' }] })!;
  assert.equal(mixed.incidents.length, 1);
  restoreIncidents(mixed);
  assert.equal(recordIncident({ location: 'd', zone: 'z', at: now, victim: 'npc', amount: 0 }).id, 4, 'nextId roto repite números');
  resetIncidents();
}

console.log('Policía: comisaría, patrullas por barrio (hora, zona, cupo, salida), respuesta, cancelación, robo real, persecución, coche patrulla y recepción OK');
