// VID-01 F1 · Proyectos de vida (systems/LifeProjects) y su guardado: `node scripts/check-life-projects.ts`.
// Control positivo: si markMilestone/completeIfMet no fueran idempotentes, (6) ve dos originEventIds; si migrate no
// añadiera lifeProjects, (2) falla; si el parse no deduplicara, (3) ve el proyecto dos veces.
import assert from 'node:assert/strict';
import { SAVE_KEY, SAVE_VERSION } from '../src/config/constants.ts';
import { createInitialState, SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';
import {
  cancelProject, canStart, completeIfMet, deriveProgress, emptyLifeProjects, lifeNoteId, markMilestone, noteCompletions, onJobChange, onWalletChange,
  parseLifeProjects, pauseProject, projectCatalog, projectView, resumeProject, promotionRequirements, startBlocker, startProject, type LifeProjectRequirements, type LifeProjectsState, type LifeProjectType,
} from '../src/systems/LifeProjects.ts';
import { getCatalog } from '../src/data/catalogs.ts';
import { consume, euros, purchase, type Wallet } from '../src/systems/Commerce.ts';
import { createPhone } from '../src/systems/Phone.ts';
import { JOBS } from '../src/data/jobs.ts';
import { hire, promote, promotionReady, quit } from '../src/systems/Jobs.ts';

function memory(): { store: Map<string, string>; save: SaveSystem } {
  const store = new Map<string, string>();
  const storage: SaveStorage = { read: (k) => store.get(k) ?? null, write: (k, v) => void store.set(k, v), remove: (k) => void store.delete(k) };
  return { store, save: new SaveSystem(storage) };
}
const started = (s: LifeProjectsState, type: LifeProjectType, now: number, reqs: LifeProjectRequirements = {}): LifeProjectsState => {
  const r = startProject(s, type, now, reqs);
  assert.ok(r.ok, r.message);
  return r.state;
};

// 1 · basura → vacío
for (const junk of [undefined, null, 1, 'x', [], {}, { items: 'no' }, { v: 1, items: [1, null, 'x', { id: 'a' }, { id: 'b', type: 'yate', status: 'active', startedAt: 0 }] }]) {
  assert.deepEqual(parseLifeProjects(junk), emptyLifeProjects(), JSON.stringify(junk));
}

// 2 · migración v6 → v7, y migrar dos veces da lo mismo
assert.equal(SAVE_VERSION, 12); // VID-07 subió el esquema (wellbeing); la migración v6 → v7 sigue igual.
{
  const v6 = { ...createInitialState(), money: 77 };
  const a = memory();
  a.store.set(SAVE_KEY, JSON.stringify({ version: 6, savedAt: 0, state: v6 }));
  const once = a.save.load()!;
  assert.deepEqual(once.lifeProjects, emptyLifeProjects());
  assert.equal(once.money, 77);
  assert.ok(a.save.save(once));
  const twice = a.save.load()!;
  assert.deepEqual(twice, once, 'migrar y volver a cargar no cambia nada');
  const b = memory();
  b.store.set(SAVE_KEY, JSON.stringify({ version: 6, savedAt: 0, state: once }));
  assert.deepEqual(b.save.load(), once, 'migrar un estado ya migrado da lo mismo');
}

// 3 · ida y vuelta por SaveSystem sin duplicados
{
  let s = started(emptyLifeProjects(), 'buy-bike', 100, { cost: 250, item: 'bike', shopCatalog: 'decathlon' });
  s = started(s, 'promotion', 200, { fromLevel: 1 });
  s = markMilestone(s, 'buy-bike-100', 'saved', 300, 'mv-1');
  const { store, save } = memory();
  assert.ok(save.save({ ...createInitialState(), lifeProjects: s }));
  assert.deepEqual(save.load()!.lifeProjects, s);
  // Un archivo con el mismo proyecto repetido carga una sola vez.
  const file = JSON.parse(store.get(SAVE_KEY)!) as { state: { lifeProjects: LifeProjectsState } };
  file.state.lifeProjects.items.push(structuredClone(s.items[0]));
  store.set(SAVE_KEY, JSON.stringify(file));
  assert.deepEqual(save.load()!.lifeProjects, s);
}

// 4 · un duplicado vivo se rechaza (activo o en pausa); uno cancelado no bloquea
{
  const s = started(emptyLifeProjects(), 'buy-bike', 10, { cost: 100 });
  const dup = startProject(s, 'buy-bike', 20, { cost: 100 });
  assert.ok(!dup.ok && dup.state === s && dup.message.length > 0);
  const cancelled = cancelProject(s, 'buy-bike-10', 30);
  assert.ok(cancelled.ok);
  assert.ok(startProject(cancelled.state, 'buy-bike', 40).ok);
}

// 4b · startBlocker: el motivo que enseña el móvil es el mismo que el rechazo de startProject
{
  const bikeIn = (id: string): boolean => id === 'bike';
  const none = (): boolean => false;
  const s = started(emptyLifeProjects(), 'buy-bike', 10, { cost: 100 });
  assert.equal(startBlocker(s, 'buy-bike', none), startProject(s, 'buy-bike', 20, { cost: 100 }).message, 'proyecto vivo: el mismo motivo');
  assert.ok(startBlocker(s, 'buy-bike', none)!.length > 0);
  assert.equal(startBlocker(emptyLifeProjects(), 'buy-bike', bikeIn), 'Ya tienes una bicicleta.');
  assert.equal(startBlocker(emptyLifeProjects(), 'buy-bike', none), null);
  assert.equal(startBlocker(emptyLifeProjects(), 'buy-bike'), null);
  assert.equal(startBlocker(emptyLifeProjects(), 'promotion', bikeIn), null);
  assert.equal(startBlocker(cancelProject(s, 'buy-bike-10', 30).state, 'buy-bike', none), null, 'uno cancelado no bloquea');
}

// 5 · cancelar uno no toca el otro; 6 · dos a la vez no comparten hitos
{
  let s = started(emptyLifeProjects(), 'buy-bike', 10, { cost: 100 });
  s = started(s, 'promotion', 10, { fromLevel: 0 });
  const ids = s.items.map((p) => p.milestones.map((m) => m.id));
  assert.equal(new Set(ids.flat()).size, ids.flat().length, 'hitos únicos');
  for (const p of s.items) assert.ok(p.milestones.every((m) => m.id.startsWith(`${p.id}:`)));
  const promo = s.items.find((p) => p.type === 'promotion')!;
  const c = cancelProject(s, 'buy-bike-10', 50);
  assert.equal(c.state.items.find((p) => p.type === 'buy-bike')!.status, 'cancelled');
  assert.deepEqual(c.state.items.find((p) => p.type === 'promotion'), promo);
}

// 7 · markMilestone y completeIfMet idempotentes, un solo originEventId
{
  let s = started(emptyLifeProjects(), 'buy-bike', 10, { cost: 100, item: 'bike' });
  const id = 'buy-bike-10';
  const p0 = s.items[0];
  assert.equal(deriveProgress(p0, { money: 50, hasItem: () => false }).blockers.length, 1);
  assert.equal(deriveProgress(p0, { money: 150, hasItem: () => false }).ratio, 0.8);
  assert.equal(deriveProgress(p0, { money: 0, hasItem: (i) => i === 'bike' }).ratio, 1);
  s = markMilestone(s, id, 'saved', 20, 'mv-a');
  assert.deepEqual(markMilestone(s, id, 'saved', 99, 'mv-a'), s);
  assert.deepEqual(markMilestone(s, id, 'saved', 99, 'mv-b'), s, 'hito hecho: no suma otro origen');
  assert.deepEqual(completeIfMet(s, id, 30), s, 'falta bought: no completa');
  s = markMilestone(s, id, 'bought', 40, 'mv-c');
  s = completeIfMet(s, id, 50, 'mv-c');
  const done = s.items[0];
  assert.equal(done.status, 'completed');
  assert.equal(done.completedAt, 50);
  assert.deepEqual(done.originEventIds, ['mv-a', 'mv-c']);
  assert.deepEqual(completeIfMet(s, id, 60, 'mv-d'), s, 'completado: no cambia jamás');
  assert.deepEqual(markMilestone(s, id, 'saved', 60, 'mv-d'), s);
  assert.ok(!cancelProject(s, id, 70).ok);
}

// 8 · F2: comprar la bici de verdad (catálogo real + Commerce.purchase como Menus.openCatalog + el gancho que llama
// GameState.wallet). Control positivo: sin el tope `max` de la bici, la segunda compra pasa; sin el guard de
// onWalletChange, repetir el gancho suma otro origen o duplica la nota.
{
  const shop = getCatalog('ca-taller-mostrador');
  const bike = shop.products.find((p) => 'item' in p.effect && p.effect.item === 'bike')!;
  assert.ok(bike, 'el taller no vende la bici');
  const reqs = projectCatalog['buy-bike'].requirements;
  assert.equal(reqs.cost, bike.price, 'el coste del proyecto sale del catálogo');
  assert.equal(reqs.item, 'bike');
  const now = 3 * 1440 + 11 * 60; // día 4, 11:00
  const id = `buy-bike-${now}`;
  let s = started(emptyLifeProjects(), 'buy-bike', now, reqs);
  let phone = createPhone();

  // Sin fondos: no se cobra, no hay hito, la bolsa igual.
  const broke: Wallet = { money: bike.price - 0.01, inventory: {}, cards: {} };
  const refused = purchase(broke, bike);
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'money');
  assert.deepEqual(refused.wallet, broke);
  const idle = onWalletChange(s, phone, broke, refused.wallet, now);
  assert.equal(idle.projects, s, 'una compra fallida no marca nada');
  assert.equal(idle.phone, phone);

  // Con fondos: cobra el precio una vez, bike: 1, completado con un origen y una nota.
  const rich: Wallet = { money: 250, inventory: {}, cards: {} };
  const bought = purchase(rich, bike);
  assert.ok(bought.ok, bought.message);
  assert.ok(Math.abs(bought.wallet.money - (250 - bike.price)) < 1e-6, 'cobra otra cosa');
  assert.equal(bought.wallet.inventory.bike, 1);
  const r = onWalletChange(s, phone, rich, bought.wallet, now + 5, 'm-4-1');
  s = r.projects;
  phone = r.phone;
  const p = s.items.find((x) => x.id === id)!;
  assert.equal(p.status, 'completed');
  assert.deepEqual(p.originEventIds, ['m-4-1']);
  assert.ok(p.milestones.every((m) => m.done));
  const notes = (phone.notes ?? []).filter((n) => n.id === lifeNoteId(id));
  assert.equal(notes.length, 1, 'un recuerdo');
  assert.ok(notes[0].body.includes('Día 4') && notes[0].body.includes(euros(bike.price)), notes[0].body);

  // Repetir el gancho (u otro cambio de cartera) no cambia nada.
  const again = onWalletChange(s, phone, rich, bought.wallet, now + 9, 'm-4-2');
  assert.equal(again.projects, s);
  assert.equal(again.phone, phone);

  // Una compra sin proyecto no crea ninguno.
  assert.deepEqual(onWalletChange(emptyLifeProjects(), createPhone(), rich, bought.wallet, now, 'm-4-1').projects, emptyLifeProjects());

  // Segunda bici con una en la bolsa: bloqueada por el tope (data/items.ts max 1).
  const second = purchase({ ...bought.wallet, money: 1000 }, bike);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'full');
  // Y no se come ni se regala.
  assert.equal(consume(bought.wallet, 'bike').ok, false);

  // Ida y vuelta por SaveSystem: completado y recuerdo, sin duplicados.
  const { save } = memory();
  assert.ok(save.save({ ...createInitialState(), money: bought.wallet.money, inventory: bought.wallet.inventory, lifeProjects: s, phone }));
  const loaded = save.load()!;
  assert.deepEqual(loaded.lifeProjects, s);
  assert.equal(loaded.inventory.bike, 1);
  assert.equal((loaded.phone?.notes ?? []).filter((n) => n.id === lifeNoteId(id)).length, 1);
}

// 9 · F3: ascenso con las funciones reales de Jobs (hire/promote/promotionChecks) y el gancho que llama GameState.setJob.
// Control positivo: sin el guard de onJobChange, repetirlo suma otro origen o reescribe la nota; sin el rechazo de
// startProject, el proyecto sin trabajo se crea.
{
  const def = JOBS.find((j) => j.levels.length > 1)!;
  assert.ok(def, 'ningún empleo tiene ascenso');
  const noJob = startProject(emptyLifeProjects(), 'promotion', 10);
  assert.ok(!noJob.ok && noJob.message === 'Necesitas un trabajo para pedir un ascenso.', noJob.message);
  assert.deepEqual(promotionRequirements(null, []), []);

  const day = 5;
  const now = (day - 1) * 1440 + 18 * 60;
  const job0 = hire(def, day - 1);
  const reqs = promotionRequirements(job0, []);
  assert.ok(reqs.some((c) => !c.ok), 'recién contratado ya cumple el ascenso');
  assert.equal(reqs.every((c) => c.ok), promotionReady(job0, []) !== null, 'requisitos y promotionReady discrepan');

  // buy-bike y promotion vivos a la vez.
  const bikeReqs = projectCatalog['buy-bike'].requirements;
  let s = started(emptyLifeProjects(), 'buy-bike', now - 60, bikeReqs);
  s = started(s, 'promotion', now - 60, { fromLevel: job0.level });
  const bikeId = `buy-bike-${now - 60}`;
  const promoId = `promotion-${now - 60}`;
  let phone = createPhone();
  const bike0 = s.items.find((p) => p.id === bikeId)!;

  // Cambios de contrato que no son ascensos no hacen nada (dejarlo, mismo nivel).
  for (const [a, b] of [[null, job0], [job0, null], [job0, quit(job0, day)], [job0, job0]] as const) {
    const r = onJobChange(s, phone, a, b, now);
    assert.equal(r.projects, s);
    assert.equal(r.phone, phone);
  }

  const job1 = promote(job0, day);
  assert.equal(deriveProgress(s.items.find((p) => p.id === promoId)!, { money: 0, hasItem: () => false, jobLevel: job0.level }).ratio, 0);
  const r = onJobChange(s, phone, job0, job1, now);
  s = r.projects;
  phone = r.phone;
  const promo = s.items.find((p) => p.id === promoId)!;
  assert.equal(promo.status, 'completed');
  assert.deepEqual(promo.originEventIds, [`promo-${day}-${def.id}-${job1.level}`]);
  assert.ok(promo.milestones.every((m) => m.done));
  assert.deepEqual(s.items.find((p) => p.id === bikeId), bike0, 'el ascenso no toca la bici');
  const notes = (phone.notes ?? []).filter((n) => n.id === lifeNoteId(promoId));
  assert.equal(notes.length, 1);
  assert.equal(notes[0].body, `Día ${day}: ascenso a ${def.levels[1].title} en ${def.employer}.`);

  // Repetir el gancho no cambia nada.
  const again = onJobChange(s, phone, job0, job1, now + 30);
  assert.equal(again.projects, s);
  assert.equal(again.phone, phone);

  // Comprar la bici no toca el ascenso completado (y al revés, arriba).
  const shopBike = getCatalog('ca-taller-mostrador').products.find((p) => 'item' in p.effect && p.effect.item === 'bike')!;
  const rich: Wallet = { money: 500, inventory: {}, cards: {} };
  const bought = purchase(rich, shopBike);
  assert.ok(bought.ok);
  const w = onWalletChange(s, phone, rich, bought.wallet, now + 60, 'm-5-1');
  assert.equal(w.projects.items.find((p) => p.id === bikeId)!.status, 'completed');
  assert.deepEqual(w.projects.items.find((p) => p.id === promoId), promo, 'la bici no toca el ascenso');
  s = w.projects;
  phone = w.phone;

  // Ida y vuelta por SaveSystem con los dos proyectos y sus dos recuerdos.
  const { save } = memory();
  assert.ok(save.save({ ...createInitialState(), job: job1, lifeProjects: s, phone }));
  const loaded = save.load()!;
  assert.deepEqual(loaded.lifeProjects, s);
  for (const id of [bikeId, promoId]) assert.equal((loaded.phone?.notes ?? []).filter((n) => n.id === lifeNoteId(id)).length, 1);

  // Nivel por debajo del de partida (otra empresa): bloqueo visible, sin cambios.
  const high = started(emptyLifeProjects(), 'promotion', 1, { fromLevel: 1 });
  const d = deriveProgress(high.items[0], { money: 0, hasItem: () => false, jobLevel: 0 });
  assert.equal(d.ratio, 0);
  assert.ok(d.blockers.length > 0);
}

// 10 · F4: completar al reanudar deja UNA nota (la misma vía que GameState.applyProject); la bici en la bolsa impide
// empezar buy-bike; projectView da progreso causal, próximo paso con dónde, y canStart no ofrece un tipo ya vivo.
// Control positivo: sin noteCompletions en applyProject no hay nota; sin el guard de la nota, repetir la reescribe.
{
  const reqs = projectCatalog['buy-bike'].requirements;
  const cost = reqs.cost!;
  const now = 2 * 1440 + 10 * 60; // día 3
  const id = `buy-bike-${now}`;
  let s = started(emptyLifeProjects(), 'buy-bike', now, reqs);
  const paused = pauseProject(s, id, now + 1);
  assert.ok(paused.ok);
  s = paused.state;
  // Compra en pausa: 'bought' sí, completar no (completeIfMet pide activo), ni nota.
  const rich: Wallet = { money: cost + 50, inventory: {}, cards: {} };
  const after: Wallet = { money: 50, inventory: { bike: 1 }, cards: {} };
  const w = onWalletChange(s, createPhone(), rich, after, now + 2, 'm-3-1');
  assert.equal(w.projects.items[0].status, 'paused');
  assert.equal((w.phone.notes ?? []).length, 0);
  // Reanudar, como applyProject: completeIfMet y noteCompletions con el antes.
  const prev = w.projects;
  const resumed = resumeProject(prev, id, now + 600);
  assert.ok(resumed.ok);
  let next = resumed.state;
  for (const p of next.items) next = completeIfMet(next, p.id, now + 600);
  assert.equal(next.items[0].status, 'completed');
  const phone = noteCompletions(prev, next, w.phone, now + 600);
  const notes = (phone.notes ?? []).filter((n) => n.id === lifeNoteId(id));
  assert.equal(notes.length, 1, 'completar al reanudar deja un recuerdo');
  assert.ok(notes[0].body.startsWith('Día 3:'), notes[0].body);
  assert.equal(noteCompletions(prev, next, phone, now + 700), phone, 'no se escribe dos veces');
  assert.equal(noteCompletions(next, next, phone, now + 700), phone, 'sin transición, nada');

  // La bici ya en la bolsa: no se empieza.
  const owned = startProject(emptyLifeProjects(), 'buy-bike', now, reqs, (i) => i === 'bike');
  assert.ok(!owned.ok && owned.message === 'Ya tienes una bicicleta.', owned.message);
  assert.ok(startProject(emptyLifeProjects(), 'buy-bike', now, reqs, () => false).ok);

  // projectView: progreso causal y próximo paso con dónde.
  const fresh = started(emptyLifeProjects(), 'buy-bike', now, reqs);
  const poor = projectView(fresh.items[0], { money: 95, hasItem: () => false });
  assert.equal(poor.progressText, `${euros(95)} de ${euros(cost)} ahorrados`);
  assert.ok(poor.nextStep.includes('Taller Biciclo'), poor.nextStep);
  assert.ok(poor.blockers.length > 0);
  assert.deepEqual(poor.actions, ['pause', 'cancel']);
  const ready = projectView(fresh.items[0], { money: cost, hasItem: () => false });
  assert.ok(ready.nextStep.startsWith('Cómprala en Taller Biciclo'), ready.nextStep);
  assert.ok(!canStart(fresh, 'buy-bike'), 'tipo vivo: sin «Empezar»');
  assert.ok(canStart(fresh, 'promotion'));
  assert.ok(canStart(cancelProject(fresh, fresh.items[0].id, now + 5).state, 'buy-bike'));
  assert.equal(cancelProject(fresh, fresh.items[0].id, now + 5).state.items[0].completedAt, now + 5, 'abandonar guarda la fecha');

  const def = JOBS.find((j) => j.levels.length > 1)!;
  const job = hire(def, 1);
  const promo = started(emptyLifeProjects(), 'promotion', now, { fromLevel: job.level });
  const pv = projectView(promo.items[0], { money: 0, hasItem: () => false, job, unlocks: [] });
  assert.equal(pv.progressText, `Turnos buenos 0/${def.promoteAfter}`);
  assert.ok(pv.nextStep.includes(def.employer), pv.nextStep);
  assert.ok(pv.blockers.length > 0);
  assert.equal(projectView(promo.items[0], { money: 0, hasItem: () => false }).progressText, 'Sin trabajo');
}

console.log('check-life-projects: OK (parse, migración v6→v7, ida y vuelta, duplicados, cancelar, hitos, idempotencia, compra de la bici, ascenso)');
