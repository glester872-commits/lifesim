// Vivienda (systems/Housing, data/housing.ts, data/studio.ts, data/visits.ts): compra única, todas las combinaciones de
// muebles con rutas a lo esencial, mudanza con pertenencias, partidas antiguas, carga con un mueble encima y la visita
// de principio a fin. `npm run check`. Falla si algo no se cumple.
import assert from 'node:assert/strict';
import { HOMES, SLOTS, UPGRADES, getHome, getUpgrade } from '../src/data/housing.ts';
import { CHARACTERS } from '../src/data/characters.ts';
import { getActivity } from '../src/data/activities.ts';
import { STORIES } from '../src/data/saraStory.ts';
import { PROPS } from '../src/world/tiles.ts';
import { baseLocation, getLocation, isWalkable } from '../src/systems/LocationSystem.ts';
import { route } from '../src/systems/Navigation.ts';
import {
  buy, buyBlocker, installAll, installedIn, move, moveBlocker, moveSummary, movePlans, homeDoor, homeEntry, parseHousing, quote, reaches, rentsOf,
  startHousing, storedIn, variantOf, type HousingState,
} from '../src/systems/Housing.ts';
import { routineFor, whereabouts, whereaboutsIn } from '../src/systems/Characters.ts';
import {
  acceptPlan, beatAfterTalk, cancelStoryPlan, chooseBeat, createStory, dayStart, minuteOf, openerFor, phoneStory, planSummary,
  presentBeat, routineOn, watchPlan, type NamedStory, type ReadyBeat,
} from '../src/systems/Story.ts';
import { createSocialProfile, grantContact, type SocialProfile } from '../src/systems/Social.ts';
import { createInitialState, restore, SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';
import { SAVE_KEY, TILE } from '../src/config/constants.ts';
import { sync, startHousehold } from '../src/systems/Household.ts';

const ids = UPGRADES.map((u) => u.id);
const subsets = (list: readonly string[]): string[][] => list.reduce<string[][]>((acc, x) => [...acc, ...acc.map((s) => [...s, x])], [[]]);
const homeAt = (id: string, owned: string[]): HousingState => ({ home: id, owned });

// ------------------------------------------------------------------ datos

assert.ok(UPGRADES.length >= 3, 'al menos tres mejoras');
assert.ok(UPGRADES.some((u) => u.kind === 'funcional') && UPGRADES.some((u) => u.kind === 'expresiva'), 'una funcional y una expresiva');
assert.equal(new Set(ids).size, ids.length, 'ids repetidos');
assert.equal(HOMES.length, 2, 'dos viviendas');
for (const home of HOMES) {
  const base = baseLocation(home.location);
  assert.equal(base.home, home.id, `${home.id}: la localización no apunta a su vivienda`);
  assert.ok(base.spawns.entry && Object.values(base.points ?? {}).some((p) => p.kind === 'exit'), `${home.id}: sin entrada o salida`);
  assert.ok(base.spots?.some((s) => s.housing), `${home.id}: sin catálogo del hogar`);
  assert.ok(STORIES.sara.plans[home.visitPlan] && STORIES.ada.plans[home.visitPlan], `${home.id}: sin plan de visita`);
  const door = homeDoor({ home: home.id, owned: [] });
  assert.ok(getLocation(door.location).spawns[door.spawn], `${home.id}: la puerta no tiene spawn`);
}
for (const u of UPGRADES) {
  assert.ok(u.price > 0 && Object.keys(u.placements).length > 0, `${u.id}: sin precio o sin sitio`);
  for (const [homeId, p] of Object.entries(u.placements)) {
    const slot = SLOTS[homeId]?.[p.slot];
    assert.ok(slot, `${u.id}/${homeId}: ranura ${p.slot} desconocida`);
    const inside = (tx: number, ty: number): boolean => tx >= slot.tx && tx < slot.tx + slot.w && ty >= slot.ty && ty < slot.ty + slot.h;
    const base = baseLocation(getHome(homeId).location);
    for (const prop of p.props) {
      const w = PROPS[prop.kind].tilesWide ?? 1;
      for (let x = prop.tx; x < prop.tx + w; x++) {
        assert.ok(inside(x, prop.ty), `${u.id}/${homeId}: ${prop.kind} fuera de su ranura en ${x},${prop.ty}`);
        // Lo de pared (un cuadro) va sobre la pared; lo de suelo, sobre suelo libre.
        const onWall = ['painting', 'mirror', 'window', 'wall-shelf', 'clock'].includes(prop.kind);
        assert.equal(isWalkable(base, x, prop.ty), !onWall, `${u.id}/${homeId}: ${prop.kind} mal colocado en ${x},${prop.ty}`);
        for (const [pid, pt] of Object.entries(base.points ?? {})) assert.ok(!(pt.tx === x && pt.ty === prop.ty), `${u.id}/${homeId}: tapa el punto ${pid}`);
        for (const s of base.spots ?? []) assert.ok(!(s.tx === x && s.ty === prop.ty), `${u.id}/${homeId}: tapa ${s.name}`);
      }
    }
    for (const s of p.spots ?? []) for (const a of s.activities) getActivity(a);
  }
}
assert.equal(getActivity('read-sofa').effects.energy, 12, 'la mejora funcional da descanso');

// ------------------------------------------- todas las combinaciones, rutas a lo esencial

let combos = 0;
const baseline: Record<string, string[]> = {};
function unreachableOf(locationId: string): string[] {
  const loc = getLocation(locationId);
  const from = { tx: loc.spawns.entry.tx, ty: loc.spawns.entry.ty };
  return [
    ...Object.entries(loc.points ?? {}).filter(([, p]) => !reaches(loc, from, p)).map(([id]) => id),
    ...(loc.spots ?? []).filter((q) => !reaches(loc, from, q)).map((q) => q.name),
    ...(loc.inspects ?? []).filter((q) => !reaches(loc, from, q)).map((q) => q.name),
  ];
}
for (const home of HOMES) {
  for (const owned of subsets(ids)) {
    const h = homeAt(home.id, owned);
    installAll(h);
    const loc = getLocation(home.location);
    const entry = loc.spawns.entry;
    const from = { tx: entry.tx, ty: entry.ty };
    assert.ok(isWalkable(loc, from.tx, from.ty), `${home.id}+[${owned}]: la entrada está tapada`);
    // Lo esencial (puerta, cama, cocina, armario, ducha, sofá de invitados, sitio de invitados) se alcanza siempre; y nada
    // de lo que se alcanzaba en la casa sin mejoras deja de alcanzarse (alguna cosa de pared ya estaba tapada por un lavabo).
    const unreachable = (): string[] => [
      ...Object.entries(loc.points ?? {}).filter(([, p]) => !reaches(loc, from, p)).map(([id]) => id),
      ...(loc.spots ?? []).filter((q) => !reaches(loc, from, q)).map((q) => q.name),
      ...(loc.inspects ?? []).filter((q) => !reaches(loc, from, q)).map((q) => q.name),
    ];
    for (const [pid, p] of Object.entries(loc.points ?? {})) if (/_(EXIT|BED|KITCHEN|WARDROBE|SHOWER|SOFA_02|GUEST)$/.test(pid)) assert.ok(reaches(loc, from, p), `${home.id}+[${owned}]: no se llega a ${pid}`);
    baseline[home.id] ??= (installAll(homeAt(home.id, [])), unreachableOf(home.location));
    installAll(h);
    for (const miss of unreachable()) assert.ok(baseline[home.id].includes(miss), `${home.id}+[${owned}]: ya no se llega a «${miss}»`);
    for (const [pid, p] of Object.entries(loc.points ?? {})) if (p.kind === 'interact') assert.ok(isWalkable(loc, p.tx, p.ty), `${home.id}+[${owned}]: ${pid} quedó bajo un mueble`);
    // Lo que se hizo siempre: dormir, cocinar, ducharse, vestirse, y el catálogo.
    for (const need of ['Cama', 'Cocina', 'Ducha', 'Armario']) assert.ok(loc.spots?.some((s) => s.name === need), `${home.id}: falta «${need}»`);
    assert.ok(loc.spots?.some((s) => s.housing), `${home.id}: falta el catálogo`);
    // La visita: la ruta de la puerta al sofá de invitados existe.
    const exit = Object.entries(loc.points!).find(([, p]) => p.kind === 'exit')![0];
    const seat = home.visitPlan === 'visita' ? 'HOME_SOFA_02' : 'STUDIO_SOFA_02';
    assert.ok(route(exit, seat), `${home.id}+[${owned}]: sin ruta de la puerta al sofá`);
    // Lo comprado e instalado se ve y se toca desde la misma definición.
    for (const id of installedIn(h)) {
      const placed = getUpgrade(id).placements[home.id];
      for (const prop of placed.props) assert.ok(loc.props.some((q) => q.kind === prop.kind && q.tx === prop.tx && q.ty === prop.ty), `${home.id}: ${id} no está en la casa`);
      for (const s of placed.spots ?? []) assert.ok(loc.spots?.some((q) => q.name === s.name), `${home.id}: ${id} no se puede usar`);
    }
    combos++;
  }
}
installAll(startHousing());
assert.deepEqual(variantOf(getHome('olmo7'), []).props, baseLocation('home').props, 'sin mejoras, la casa es la de los datos');
// Una mejora sólida cambia las colisiones: el tile del sofá nuevo deja de ser transitable.
installAll(homeAt('olmo7', ['sofa-lectura']));
assert.equal(isWalkable(getLocation('home'), 13, 11), false, 'el sofá nuevo no choca');
installAll(startHousing());
assert.equal(isWalkable(getLocation('home'), 13, 11), true, 'sin sofá, el sitio está libre');

// ----------------------------------------------------------------- comprar

let h = startHousing();
const price = getUpgrade('cuadro-carmen').price;
assert.match(quote(h, 'cuadro-carmen', 100), new RegExp(`Cuesta €${price}.*saldo €100.* → €${100 - price}`), 'antes de confirmar: precio y cambio');
assert.match(buyBlocker(h, 'sofa-lectura', 10)!, /Te faltan €85/, 'dinero insuficiente');
assert.equal(buy(h, 'sofa-lectura', 10).ok, false);
assert.equal(buy(h, 'sofa-lectura', 10).money, 10, 'sin dinero no cobra');
const bought = buy(h, 'cuadro-carmen', 100);
assert.ok(bought.ok && bought.money === 100 - price);
h = bought.housing;
const twice = buy(h, 'cuadro-carmen', 500);
assert.ok(!twice.ok && twice.money === 500 && /Ya la tienes/.test(twice.message), 'comprar dos veces cobra dos veces');
assert.deepEqual(parseHousing(JSON.parse(JSON.stringify(h))), h, 'lo comprado no sobrevive a recargar');
assert.deepEqual(parseHousing({ home: 'palacio', owned: ['cuadro-carmen', 'cuadro-carmen', 'yate', 4] }), { home: 'olmo7', owned: ['cuadro-carmen'] }, 'guardado raro');

// ------------------------------------------------------------- mudarse

const rich = homeAt('olmo7', ['sofa-lectura', 'cuadro-carmen', 'lampara-pie']);
const target = getHome('estudio').move!;
assert.match(moveBlocker(rich, 'estudio', target.free - 1, false)!, /Aún no llegas.*€250 libres/, 'no pide la meta');
assert.match(moveBlocker(rich, 'estudio', 999, true)!, /pagos vencidos/, 'deja mudarse con deudas');
assert.equal(moveBlocker(rich, 'estudio', target.free, false), null, 'con la meta justa no se puede');
assert.equal(moveBlocker(rich, 'olmo7', 999, false), 'Ya vives aquí.');
const summary = moveSummary(rich, 'estudio');
assert.match(summary, /€150/);
assert.match(summary, /Se trasladan y se instalan: Cuadro de la Calle del Carmen, Lámpara de pie/);
assert.match(summary, /guardan en el trastero, sin perderse.*Sofá de lectura/, 'no explica lo incompatible');
assert.match(summary, /€45 → €35/);
const moved = move(rich, 'estudio', 300, 300, false);
assert.ok(moved.ok && moved.money === 300 - target.fee && moved.housing.home === 'estudio');
assert.deepEqual(moved.housing.owned, rich.owned, 'se pierde algo al mudarse');
assert.deepEqual(installedIn(moved.housing).sort(), ['cuadro-carmen', 'lampara-pie']);
assert.deepEqual(storedIn(moved.housing), ['sofa-lectura'], 'lo que no cabe se guarda');
assert.equal(move(rich, 'estudio', 100, 300, false).money, 100, 'sin dinero cobra la mudanza');
// Volver: lo guardado vuelve a instalarse solo.
const back = move(moved.housing, 'olmo7', 500, 500, false);
assert.ok(back.ok && installedIn(back.housing).length === 3, 'al volver no se reinstala todo');
// Reubicación: «volver a casa» y la entrada salen de los datos.
assert.deepEqual(homeDoor(moved.housing), { location: 'district', spawn: 'res-olmo-11' });
assert.deepEqual(homeEntry(moved.housing), { location: 'studio', spawn: 'entry' });
assert.deepEqual(homeDoor(startHousing()), { location: 'district', spawn: 'home-door' });
assert.deepEqual(rentsOf(moved.housing), { rent: 35 });
// El alquiler nuevo se anuncia en los periodos nuevos; lo ya anunciado no cambia.
const bills = sync(sync(startHousehold(1), 1).household, 8, rentsOf(moved.housing));
assert.deepEqual(bills.household.obligations.filter((o) => o.bill === 'rent').map((o) => o.amount), [45, 35]);

// ------------------------------------------------ partidas antiguas y carga

{
  const store = new Map<string, string>();
  const storage: SaveStorage = { read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) };
  const save = new SaveSystem(storage);
  const old = { money: 1184.2, energy: 70, day: 665, hour: 21, minute: 43, locationId: 'home', position: { x: 10 * TILE, y: 10 * TILE }, facing: 'down', inventory: { water: 2 }, wardrobe: ['vaquero-70'] };
  store.set(SAVE_KEY, JSON.stringify({ version: 1, savedAt: 0, state: old }));
  const loaded = save.load()!;
  assert.deepEqual(loaded.housing, startHousing(), 'una partida anterior no conserva su piso');
  assert.equal(loaded.money, 1184.2, 'cobra al asignar la vivienda');
  assert.deepEqual([loaded.inventory, loaded.wardrobe], [{ water: 2 }, ['vaquero-70']], 'desposee al cargar');
  // Y lo comprado vuelve igual.
  save.save({ ...loaded, housing: moved.housing });
  assert.deepEqual(save.load()!.housing, moved.housing);

  // Posición guardada ahora ocupada por un mueble: se aparece en un sitio libre al que se llega desde la puerta.
  const sofa = getUpgrade('sofa-lectura').placements.olmo7.props[0];
  const withSofa = { ...createInitialState(), housing: homeAt('olmo7', ['sofa-lectura']), locationId: 'home', position: { x: sofa.tx * TILE + TILE / 2, y: (sofa.ty + 1) * TILE - 2 } };
  const r = restore(withSofa);
  const loc = getLocation('home');
  const tx = Math.floor(r.position.x / TILE);
  const ty = Math.floor((r.position.y - 1) / TILE);
  assert.ok(isWalkable(loc, tx, ty) && reaches(loc, loc.spawns.entry, { tx, ty }), 'la posición cargada sigue ocupada o inalcanzable');
  assert.equal(r.locationId, 'home');
  // Guardado dentro de una casa que ya no es la tuya: a la puerta de la de ahora.
  const away = restore({ ...createInitialState(), housing: homeAt('estudio', []), locationId: 'home', position: { x: 10 * TILE, y: 10 * TILE } });
  const spawn = getLocation('district').spawns['res-olmo-11'];
  assert.deepEqual([away.locationId, away.position.x, away.position.y], ['district', spawn.tx * TILE + TILE / 2, (spawn.ty + 1) * TILE], 'no vuelve a la casa de ahora');
}
installAll(startHousing());

// ----------------------------------------------------------------- la visita

const DAY = 24 * 60;
const abs = (day: number, hhmm: string): number => (day - 1) * DAY + minuteOf(hhmm);
const now = (day: number, hhmm: string, home = 'olmo7', owned: string[] = []) => ({ day, minute: minuteOf(hhmm), home, owned });
let visits = 0;

for (const npc of ['sara', 'ada']) {
  const def = STORIES[npc];
  const char = CHARACTERS.find((c) => c.npc === npc)!;
  for (const home of HOMES) {
    const plan = def.plans[home.visitPlan];
    const routine = char.routines.find((r) => r.id === plan.routine);
    assert.ok(routine?.story, `${npc}/${home.id}: su rutina ${plan.routine} no existe o no es de historia`);
    for (let m = minuteOf(plan.from); m < minuteOf(plan.until); m += 5) {
      const w = whereaboutsIn(char, routine, m);
      assert.ok(!w.moving && w.stop.point === plan.point, `${npc}/${home.id}: a las ${m} min no está sentada en ${plan.point}`);
      assert.equal(w.location, home.location, `${npc}/${home.id}: no está en la casa`);
    }
    // Entra por la puerta por una ruta válida y se va: no queda en la casa ni de noche ni al día siguiente.
    const picker = (d: number) => routineFor(char, d, { forced: d === 20 ? routine.id : undefined });
    for (const hhmm of ['22:40', '23:30']) assert.notEqual(whereabouts(char, abs(20, hhmm), picker).location, home.location, `${npc}/${home.id}: se queda en la casa a las ${hhmm}`);
    assert.notEqual(whereabouts(char, abs(21, '09:00'), picker).location, home.location, `${npc}/${home.id}: sigue en la casa al día siguiente`);
    // ...con cualquier combinación de muebles instalada.
    for (const owned of subsets(ids)) {
      installAll(homeAt(home.id, owned));
      assert.ok(route(Object.entries(getLocation(home.location).points!).find(([, p]) => p.kind === 'exit')![0], plan.point), `${npc}/${home.id}+[${owned}]: la visita no llega al sofá`);
    }
    visits++;
  }
}
installAll(startHousing());

/** El arco de una visita con Sara, paso a paso: invitar, aceptar, celebrar, hacer algo juntos, reconocer y seguir. */
{
  const def = STORIES.sara;
  const sara = CHARACTERS.find((c) => c.npc === 'sara')!;
  let story: NamedStory = createStory(def);
  let profile: SocialProfile = { ...createSocialProfile(), friendship: 40, trust: 25, encounters: 6 };
  profile = grantContact(profile, { day: 1, hour: 10, minute: 0 }, 'te dio su número');
  Object.assign(story.flags, { sara_met: 1, sara_friend: 1, sara_lookbook_asked: 1, sara_arc_done: 1, sara_tattoo_asked: 1, sara_close_friend: 1, sara_event_02: 1 });
  story.dayDone = 9;
  const owned = ['sofa-lectura', 'cuadro-carmen'];
  const start = (s: NamedStory, p: SocialProfile, day: number) => dayStart(s, p, def, { day, rainy: false, pick: (forced) => routineFor(sara, day, { forced }).id });

  // La invitación sale según la casa donde vives, con su plan, y la propuesta queda pendiente hasta contestar.
  let invite: ReadyBeat | null = null;
  let day = 10;
  for (; day < 40 && !invite; day++) {
    const b = beatAfterTalk(story, def, profile, now(day, '12:00', 'olmo7', owned), day);
    if (b?.id === 'visita') invite = b;
    else if (b) story = chooseBeat(presentBeat(story, b, now(day, '12:00')), profile, def, b, b.choices ? b.choices.length - 1 : 0, now(day, '12:00')).story;
  }
  assert.ok(invite?.plan?.id === 'visita' && invite.offer, 'no invita a tu casa en un mes');
  const asked = day - 1;
  story = presentBeat(story, invite!, now(asked, '12:00'));
  assert.equal(story.offer?.plan, 'visita', 'la propuesta no queda pendiente');
  // Por el móvil sale el mismo acontecimiento, una vez: contestar en una superficie cierra la otra.
  const sent = phoneStory(story, def, profile, now(asked, '15:00', 'olmo7', owned), asked);
  assert.ok(sent && sent.story.offer?.sent, 'por el móvil no se manda la propuesta pendiente');
  assert.equal(phoneStory(sent.story, def, profile, now(asked, '16:00', 'olmo7', owned), asked), null, 'por el móvil la manda dos veces');
  const pendingBeat = beatAfterTalk(sent.story, def, profile, now(asked, '16:10', 'olmo7', owned), asked);
  assert.equal(pendingBeat?.id, 'visita', 'en persona no ofrece la propuesta que ya mandó por el móvil');
  const answered = chooseBeat(sent.story, profile, def, pendingBeat!, 0, now(asked, '16:30'));
  assert.equal(answered.story.offer, null, 'contestar no cierra la propuesta');
  assert.equal(answered.story.plan?.status, 'pending');
  assert.equal(answered.story.plan?.id, 'visita');
  assert.notEqual(beatAfterTalk(answered.story, def, profile, now(asked, '17:00', 'olmo7', owned), asked)?.id, 'visita', 'en persona vuelve a preguntar lo ya contestado');
  assert.match(planSummary(answered.story, def, asked)!, /tu piso · .* a las 19:30/, 'no muestra hora');
  story = answered.story;
  profile = answered.profile;
  const visitDay = story.plan!.day;
  assert.equal(routineOn(story, visitDay), 'plan-visita', 'aceptar no fija la rutina de la visita');
  ({ story, profile } = start(story, profile, visitDay));
  // Celebrarla: ella está, y el jugador con ella a la hora.
  assert.equal(watchPlan(story, profile, def, { day: visitDay, minute: minuteOf('19:40') }, false), null, 'sin el jugador aún no pasa nada');
  const kept = watchPlan(story, profile, def, { day: visitDay, minute: minuteOf('19:40') }, true);
  assert.ok(kept?.kept && kept.story.events.some((e) => e.id === 'visita' && e.day === visitDay), 'no se celebra');
  assert.ok(kept.profile.friendship > profile.friendship);
  story = kept.story;
  profile = kept.profile;
  assert.equal(watchPlan(story, profile, def, { day: visitDay, minute: minuteOf('19:50') }, true), null, 'la visita se celebra dos veces');
  // Reconoce una mejora (el sofá, el primero que tienes) sin sustituir el diálogo: es su primera frase al hablar.
  assert.match(openerFor(story, def, profile, now(visitDay, '20:00', 'olmo7', owned), visitDay) ?? '', /sofá/, 'no reconoce el sofá');
  assert.match(openerFor(story, def, profile, now(visitDay, '20:00', 'olmo7', ['cuadro-carmen']), visitDay) ?? '', /cuadro/, 'no reconoce el cuadro');
  assert.doesNotMatch(openerFor(story, def, profile, now(visitDay, '20:00', 'olmo7', []), visitDay) ?? '', /sofá|cuadro|lámpara/, 'inventa una mejora');
  // Una actividad compartida al hablar, una vez, y se recuerda.
  const share = beatAfterTalk(story, def, profile, now(visitDay, '20:10', 'olmo7', owned), visitDay)!;
  assert.equal(share.id, 'visita-comparte');
  const did = chooseBeat(presentBeat(story, share, now(visitDay, '20:10')), profile, def, share, 0, now(visitDay, '20:10'));
  assert.equal(did.story.decisions['visita-plan'], 'tele');
  assert.notEqual(beatAfterTalk(did.story, def, did.profile, now(visitDay, '20:30', 'olmo7', owned), visitDay)?.id, 'visita-comparte', 'repite la actividad compartida');
  story = did.story;
  profile = did.profile;
  // Al día siguiente: en persona y por móvil.
  assert.match(openerFor(story, def, profile, now(visitDay + 1, '11:00', 'olmo7', owned), visitDay + 1) ?? '', /sofá/, 'no lo reconoce al día siguiente');
  const text = phoneStory(story, def, profile, now(visitDay + 1, '11:00', 'olmo7', owned), visitDay + 1);
  assert.match(text?.text ?? '', /ayer|Gracias/, 'no escribe al día siguiente');
  assert.equal(phoneStory(text!.story, def, profile, now(visitDay + 1, '12:00', 'olmo7', owned), visitDay + 1), null, 'escribe dos veces el mismo día');
  assert.equal(story.plan?.status, 'kept', 'el plan queda abierto tras celebrarse');
  // Terminó: nadie reservado (la rutina del día siguiente es la normal).
  ({ story, profile } = start(story, profile, visitDay + 1));
  assert.notEqual(routineOn(story, visitDay + 1), 'plan-visita');

  // Cancelar con tiempo cuesta menos que el mismo día; reprogramar es volver a quedar (la invitación vuelve tras unos días).
  const early = acceptPlan({ ...story, plan: null, dayDone: visitDay + 1 }, def, { id: 'visita', day: visitDay + 6 });
  const soon = cancelStoryPlan(early, profile, def, { day: visitDay + 2, minute: 600 })!;
  const late = cancelStoryPlan(early, profile, def, { day: visitDay + 6, minute: 600 })!;
  assert.equal(soon.story.plan?.status, 'cancelled');
  assert.ok(late.profile.trust < soon.profile.trust && soon.profile.trust < profile.trust, 'cancelar el mismo día no cuesta más');
  assert.equal(routineOn(soon.story, visitDay + 6), undefined, 'cancelar con tiempo deja la rutina del plan');
  assert.equal(cancelStoryPlan(soon.story, soon.profile, def, now(visitDay + 3, '10:00')), null, 'cancela dos veces');

  // Mudarse con una visita quedada: pasa a la casa nueva, a su día, con su rutina.
  const pending = acceptPlan(story, def, { id: 'visita', day: visitDay + 4 });
  const moved2 = movePlans({ sara: pending }, 'olmo7', 'estudio').sara;
  assert.equal(moved2.plan?.id, 'visita-estudio');
  assert.equal(moved2.plan?.day, visitDay + 4);
  assert.equal(routineOn(moved2, visitDay + 4), 'plan-visita-estudio', 'la visita no se pasa al estudio');
  assert.deepEqual(movePlans({ sara: story }, 'olmo7', 'estudio'), {}, 'toca lo que no es una visita');
  // En el estudio la invitación es la del estudio.
  let studioInvite: string | undefined;
  for (let d = visitDay + 10; d < visitDay + 40 && !studioInvite; d++) {
    const b = beatAfterTalk({ ...story, plan: null, beats: {} }, def, profile, now(d, '12:00', 'estudio', ['cuadro-carmen']), d);
    if (b?.id.startsWith('visita')) studioInvite = b.plan?.id;
  }
  assert.equal(studioInvite, 'visita-estudio', 'en el estudio invita al piso');
}

console.log(
  `vivienda: ${UPGRADES.length} mejoras · ${HOMES.length} casas · ${combos} combinaciones con rutas a lo esencial · compra única · mudanza con traslado y trastero · ` +
    `partida antigua, posición ocupada y casa ajena · ${visits} visitas (Sara y Ada, dos casas) con entrada, actividad, reconocimiento, cancelar y mudarse · ok`,
);
