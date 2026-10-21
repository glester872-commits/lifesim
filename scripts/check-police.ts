// La policía (systems/Police sobre StreetLife y Pickpocket): la comisaría de Puerta Central, las patrullas de cada barrio
// con su cupo, su hora y sus zonas, la respuesta a un robo visto (aviso → llegada → atiende → vuelve), la cancelación sin
// nadie enganchado y la recepción (información y denuncia). La misma lógica que el juego, sin Phaser.
// Llamado desde la cadena `check` de package.json. `node scripts/check-police.ts`.
import assert from 'node:assert/strict';
import { STREET_PROFILES } from '../src/data/streets.ts';
import { PLACES } from '../src/data/places.ts';
import { getOffer } from '../src/data/services.ts';
import { profileFor, type Clock } from '../src/systems/Crowd.ts';
import { getLocation } from '../src/systems/LocationSystem.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { absMinute } from '../src/systems/Handoff.ts';
import { identity } from '../src/systems/Service.ts';
import { zoneAt } from '../src/systems/Zones.ts';
import { deskBrief, fileReport, incidentById, patrolLines, POLICE, recentIncidents, recordIncident, reportable, resetIncidents } from '../src/systems/Police.ts';
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
  const station = PLACES.find((p) => p.tags.includes('police'));
  assert.ok(station, 'no hay comisaría en data/places.ts');
  const pc = getLocation('puerta-central');
  const building = pc.buildings?.find((b) => b.id === station.building);
  assert.equal(building?.enter?.location, 'pc-comisaria', 'la puerta de la comisaría no lleva a su interior');
  assert.ok(pc.spawns?.['pc-comisaria'], 'sin sitio delante de la puerta para salir');
  assert.ok((pc.links ?? []).some((l) => l.includes('PC_COMISARIA_ENTRANCE')), 'la puerta de la comisaría no está en el grafo de la plaza');
  const inside = getLocation('pc-comisaria');
  const exit = inside.portals?.find((p) => p.to.location === 'puerta-central');
  assert.equal(exit?.to.spawn, 'pc-comisaria', 'sin salida a la plaza');
  assert.ok(!(inside.props ?? []).some((p) => p.kind === 'register'), 'una recepción no lleva caja registradora');
  // Recepción con agente que ofrece el servicio de la comisaría (systems/Police, scenes/Menus.openPoliceDesk).
  const desk = profileFor('pc-comisaria')?.staff.find((s) => s.service === 'police-officer');
  assert.ok(desk, 'sin agente de guardia en recepción');
  const offer = identity(desk).offers;
  assert.equal(offer && getOffer(offer).kind, 'police', 'la guardia no ofrece la recepción de la comisaría');

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
    console.log(`  robo real: avisado con la semilla ${100 + seed}`);
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
  assert.match(patrolLines('district', noon, now, 'la Comisaría de Puerta Central').join(' '), /Plaza de la Fuente.*Comisaría de Puerta Central/s, 'la patrulla no remite a la comisaría');
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

console.log('Policía: comisaría, patrullas por barrio (hora, zona, cupo, salida), respuesta, cancelación, robo real y recepción OK');
