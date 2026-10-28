import type { Services } from '../services';
import { getCatalog, type Catalog } from '../data/catalogs';
import { getItem } from '../data/items';
import { getActivity, getOffMapPlace, type ActivityDef } from '../data/activities';
import { STOPS, type TransitStop } from '../data/transit';
import { checkout, consume, euros, maxQty, payFare, productUse, purchase, spend } from '../systems/Commerce';
import { blocker, perform, type ActivityContext } from '../systems/Activities';
import { destinationsFrom, type Destination } from '../systems/Transit';
import { formatClock } from '../systems/TimeSystem';
import { getJob, jobAt, type JobDef } from '../data/jobs';
import { clockInBlocker, decline, hire, hireBlocker, levelOf, levelSummary, nextShift, offerText, promote, promotionReady, quit, settle as settleJob, situationFor, work, type JobProgress } from '../systems/Jobs';
import { formatDate, WEEKDAY_LABEL, weekdayOf } from '../systems/Calendar';
import type { MenuOption } from '../ui/Menu';
import { getOffer, type OfferId, type ServiceOffer } from '../data/services';
import { deskBrief, fileReport, POLICE, reportable } from '../systems/Police';
import { boardAt } from '../systems/Boards';
import { attend as attendGathering, getGathering, hhmm, joinBlocker, lastAttendance, occurrenceOn } from '../systems/Parish';
import { getNpc } from '../data/npcs';
import { buyTicket, fixtureLine, offer, ticketLine, venueOf } from '../systems/Tickets';
import { absMinute } from '../systems/Handoff';
import { HAIRSTYLES, type Appearance } from '../data/appearance';
import type { RackDef } from '../types/game';
import { haircut, sleeveOf, tattoo, visibleTattoos, withAppearance } from '../systems/Appearance';
import { buyGarment, stockOf, takeOff, wear } from '../systems/Retail';
import { CATEGORIES, getGarment, getStore } from '../data/retail';
import { getDesign, getZone, STYLE_NAMES, TATTOO_DESIGNS, TATTOO_ZONES, type TattooZone } from '../data/tattoos';
import { PLAYER_COLORS } from '../world/TextureFactory';
import { pairingFor, type MenuItem, type MoreOption, type ServiceMenu } from '../data/menus';
import { STATIONS, type StationId } from '../data/stations';
import { INTENSITIES, INTENSITY_ORDER, quote, settle, summary, type Intensity } from '../systems/Fitness';
import { getGig, getSkill, type CourseDef, type GigDef, type PracticeSite } from '../data/study';
import {
  acceptGig, attend, classBlocker, courseAt, courseOffer, deliver, deliverBlocker, demo, demoBlocker, enroll, enrollBlocker, gigAt, gigDeadline, gigStatus, gigTerms,
  hasCamera, knowledge, lessonStatus, levelName, nextSession, practice, practiceAt, practiceBlocker, practiceGain, sessionLabel, sessionNow, type Outcome as StudyOutcome, type StudyState,
} from '../systems/Study';
import { closedLines, isOpen, placeForInterior, placeInfo } from '../systems/Places';

/** Lo que se tarda en pagar en la caja de una tienda con caja (Catalog.checkout), compres una cosa o diez. */
const CHECKOUT_MINUTES = 2;

/** Dónde va una prenda, dicho en la ficha antes de probarla o comprarla. */
const SLOT_LABEL = { top: 'arriba (torso y brazos)', bottom: 'abajo (piernas)', shoes: 'en los pies' } as const;
import { UPGRADES, getHome, getUpgrade } from '../data/housing';
import { buy, buyBlocker, installAll, installedIn, layout, move, moveBlocker, movePlans, moveSummary, optionsOf, quote as housingQuote, relocate, slotName, storedIn, type HousingState } from '../systems/Housing';
import { owed, statusOf as billStatus, unpaid } from '../systems/Household';

/** Lo que Menus necesita de la Scene: guardar y viajar a una estación. */
export interface MenuHost {
  persist(): void;
  /** Llega en tren a esa localización (andén, spawn 'train'). */
  arriveByTrain(locationId: string): void;
  /** Entra andando en una localización por su entrada (spawn 'entry'): el interior de un sitio sin mapa. */
  enter(locationId: string): void;
  /** Funde a negro al irse a un sitio sin mapa. */
  fadeOut(): void;
  /** Vuelve a montar la casa donde estás (se ha instalado algo) sin moverte. */
  refreshHome(): void;
  /** Te lleva a la entrada de tu casa nueva, tras mudarte. */
  movedHome(): void;
}

/**
 * Las interacciones que se eligen en un menú: comprar (cualquier catálogo),
 * usar algo de la bolsa, elegir destino en el tren y estar en un sitio sin
 * mapa. Toda la lógica es de los sistemas (Commerce, Activities, Transit);
 * aquí sólo se enseñan las opciones, se aplica el resultado al estado y se
 * adelanta el reloj. Así la Scene coordina y no acumula.
 */
/**
 * De qué estación se vino a un sitio sin mapa (id de parada): al salir de su tienda, el metro de vuelta lleva ahí.
 * Dura lo que la página; tras recargar dentro de la tienda, se vuelve a la estación más cercana.
 */
let cameFrom: string | null = null;

export class Menus {
  private readonly services: Services;
  private readonly host: MenuHost;
  // La prueba de una prenda vive en GameState: así ningún guardado se queda con la prenda sin pagar.
  private get fitting(): Appearance | null {
    return this.services.state.fitting;
  }

  private set fitting(outfit: Appearance | null) {
    this.services.state.setFitting(outfit);
  }

  constructor(services: Services, host: MenuHost) {
    this.services = services;
    this.host = host;
  }

  // ------------------------------------------------------------- comprar

  /**
   * Máquina, barra o taquilla: el catálogo dice qué hay; Commerce, si se puede. Un puesto que atiende sólo a ratos (el
   * quiosco del estadio) pasa `stall`: el menú es «en vivo» (el mundo y el partido siguen mientras se elige) y, si deja
   * de atender con el menú abierto, ya no cobra.
   */
  openCatalog(title: string, catalogId: string, note = '', selected = 0, onClose?: () => void, stall?: { closed: () => string | null }): void {
    const { state, menu } = this.services;
    const catalog = getCatalog(catalogId);
    if (catalog.checkout && !stall) {
      this.openShop(title, catalog, note, selected);
      return;
    }
    const wallet = state.wallet;
    const shut = stall?.closed() ?? null;
    const options: MenuOption[] = catalog.products.map((p) => {
      const trial = purchase(wallet, p);
      return { label: p.label, detail: euros(p.price), disabled: shut ?? (trial.ok ? undefined : trial.message) };
    });
    options.push({ label: 'Salir' });
    menu.open(
      title,
      `${catalog.greeting} Llevas ${euros(state.money)}.`,
      options,
      (i) => {
        if (i === catalog.products.length) {
          menu.close();
          onClose?.();
          return;
        }
        const closed = stall?.closed() ?? null;
        if (closed) {
          this.openCatalog(title, catalogId, closed, i, onClose, stall);
          return;
        }
        const result = purchase(state.wallet, catalog.products[i]);
        if (result.ok) {
          state.as(catalog.products[i].label, () => {
            state.wallet = result.wallet;
          });
          this.host.persist();
        }
        this.openCatalog(title, catalogId, result.message, i, onClose, stall);
      },
      onClose,
      shut ?? note,
      selected,
      !!stall,
    );
  }

  // ------------------------------------------------------ tienda con caja

  /**
   * Una tienda con caja (Catalog.checkout, el súper): la lista con precio, uso y lo que ya llevas; al elegir, la ficha.
   * Elegir no corre el reloj (un menú para el mundo); pagar lleva CHECKOUT_MINUTES.
   */
  private openShop(title: string, catalog: Catalog, note = '', selected = 0): void {
    const { state, menu } = this.services;
    const options: MenuOption[] = catalog.products.map((p) => {
      const have = 'item' in p.effect ? (state.wallet.inventory[p.effect.item] ?? 0) : 0;
      return { label: p.label, detail: `${euros(p.price)} · ${productUse(p)}${have ? ` · llevas ${have}` : ''}` };
    });
    options.push({ label: 'Salir' });
    menu.open(title, `${catalog.greeting} Llevas ${euros(state.money)}.`, options, (i) => {
      if (i === catalog.products.length) menu.close();
      else this.openProductSheet(title, catalog, i, 1);
    }, undefined, note, selected);
  }

  /**
   * La ficha de un producto: cantidad (Menos/Más, sin pasar de lo que llega o cabe), total y saldo que queda, antes de
   * pagar. Pagar vuelve a mirar si el local sigue abierto y cobra con systems/Commerce.checkout (todo o nada); después
   * se vuelve a la lista, así una segunda pulsación sobre «Pagar» ya no cobra otra vez.
   */
  private openProductSheet(title: string, catalog: Catalog, index: number, qty: number, note = '', selected = 2): void {
    const { state, menu, clock } = this.services;
    const p = catalog.products[index];
    const max = maxQty(state.wallet, p);
    const n = Math.min(Math.max(1, qty), Math.max(1, max));
    const total = p.price * n;
    const trial = checkout(state.wallet, catalog, p.id, n);
    const have = 'item' in p.effect ? (state.wallet.inventory[p.effect.item] ?? 0) : 0;
    const text = `${euros(p.price)} la unidad · ${productUse(p)}. En la bolsa llevas ${have}. Llevas ${euros(state.money)}.`;
    menu.open(`${p.label}`, text, [
      { label: 'Menos', detail: `cantidad ${n}`, disabled: n <= 1 ? 'Menos de una no se puede.' : undefined },
      { label: 'Más', detail: max > n ? `hasta ${max}` : '', disabled: n >= max ? 'No llega el dinero para otra o no cabe en la bolsa.' : undefined },
      {
        label: `Pagar ${n} · ${euros(total)}`,
        detail: trial.ok ? `te quedan ${euros(state.money - total)} · ${CHECKOUT_MINUTES} min en caja` : trial.reason === 'money' ? `faltan ${euros(total - state.money)}` : '',
        disabled: trial.ok ? undefined : trial.message,
      },
      { label: 'Volver' },
    ], (i) => {
      if (i === 0) this.openProductSheet(title, catalog, index, n - 1, '', 0);
      else if (i === 1) this.openProductSheet(title, catalog, index, n + 1, '', 1);
      else if (i === 3) this.openShop(title, catalog, '', index);
      else {
        const shut = this.shutHere();
        if (shut) {
          this.openShop(title, catalog, shut, index);
          return;
        }
        const result = checkout(state.wallet, catalog, p.id, n);
        if (!result.ok) {
          this.openProductSheet(title, catalog, index, n, result.message);
          return;
        }
        state.as(`${n} × ${p.label}`, () => {
          state.wallet = result.wallet;
        });
        clock.advanceMinutes(CHECKOUT_MINUTES);
        this.host.persist();
        this.openShop(title, catalog, result.message, index);
      }
    }, () => this.openShop(title, catalog, '', index), note, selected);
  }

  /** El local en el que estás, cerrado ahora: lo que dice la puerta; abierto (o sin horario), null. */
  private shutHere(): string | null {
    const { day, hour, minute, locationId } = this.services.state;
    const place = placeForInterior(locationId);
    return place?.type === 'business' && !isOpen(place, day, hour, minute) ? closedLines(place, day, hour, minute).join(' ') : null;
  }

  // --------------------------------------------------------------- bolsa

  /** Lo que se lleva encima; comer o beber algo devuelve energía. */
  openBag(note = '', selected = 0): void {
    const { state, menu } = this.services;
    const wallet = state.wallet;
    const ids = Object.keys(wallet.inventory);
    const options: MenuOption[] = ids.map((id) => {
      const item = getItem(id);
      return { label: `${item.name} ×${wallet.inventory[id]}`, detail: item.energy ? `+${item.energy} ⚡` : '' };
    });
    for (const [card, balance] of Object.entries(wallet.cards)) {
      options.push({ label: getItem(card).name, detail: `saldo ${euros(balance)}`, disabled: 'Se usa sola al subir al tren.' });
    }
    options.push({ label: 'Cerrar' });
    const text = options.length === 1 ? 'No llevas nada encima.' : 'Lo que llevas encima.';
    menu.open('Bolsa', text, options, (i) => {
      if (i >= ids.length) {
        menu.close();
        return;
      }
      const result = consume(state.wallet, ids[i]);
      if (result.ok) {
        state.wallet = result.wallet;
        state.energy += result.energy ?? 0;
        this.host.persist();
      }
      this.openBag(result.message, i);
    }, undefined, note, selected);
  }

  // ---------------------------------------------------------------- tren

  /** Subir al tren: se elige a dónde; la tarjeta paga; el reloj avanza lo que dura el viaje. */
  board(from: TransitStop, note = ''): void {
    const { state, menu } = this.services;
    const dests = destinationsFrom(from);
    const options: MenuOption[] = [
      { label: from.name, detail: 'estás aquí', disabled: 'Ya estás en esta estación.' },
      ...dests.map((d) => {
        const paid = payFare(state.wallet, d.line.card, d.fare);
        return { label: d.stop.name, detail: `${d.minutes} min · ${euros(d.fare)}`, disabled: paid.ok ? undefined : paid.message };
      }),
      { label: 'Quedarme en el andén' },
    ];
    menu.open(`${dests[0]?.line.name ?? 'Metro'} · destino`, '¿A dónde vas?', options, (i) => {
      if (i === options.length - 1) {
        menu.close();
        return;
      }
      this.ride(from, dests[i - 1]);
    }, undefined, note, 1);
  }

  private ride(from: TransitStop, d: Destination): void {
    const { state, clock, menu, metroEvents } = this.services;
    const paid = payFare(state.wallet, d.line.card, d.fare);
    if (!paid.ok) {
      this.board(from, paid.message);
      return;
    }
    menu.close();
    state.wallet = paid.wallet;
    // El evento del trayecto se decide al salir, con la hora de salida; se cuenta al llegar a una estación.
    if (d.stop.station) {
      const { day, hour, minute, money, energy } = state;
      metroEvents.onRide({ day, hour, minute, money, energy, to: d.stop.station });
    }
    clock.advanceMinutes(d.minutes);
    if (d.stop.station) this.host.arriveByTrain(d.stop.station);
    else {
      this.host.fadeOut();
      this.host.persist();
      this.offMap(d.stop, from);
    }
  }

  // ---------------------------------------------------- sitio sin mapa

  /**
   * Un sitio al que se llega en tren y que aún no tiene mapa: se ve en un menú
   * con sus actividades. Cada actividad adelanta el reloj de verdad; al volver,
   * la estación de origen (y todo el barrio) está a la hora que toca. Cuando el
   * sitio tenga mapa, su parada pasa a ser una estación y esto deja de usarse.
   */
  private offMap(stop: TransitStop, back: TransitStop, note = ''): void {
    const { state, clock, menu, metroEvents } = this.services;
    const place = getOffMapPlace(stop.offMap!);
    // La agenda estima desde aquí, no desde la estación que sigue cargada detrás del menú.
    state.setOffMap(stop.id);
    const job = jobAt(place.id);
    const ret = destinationsFrom(stop).find((d) => d.stop.id === back.id)!;
    const again = (n = ''): void => this.offMap(stop, back, n);
    const news = job ? this.reviewJob() : '';
    const contract = job && state.job?.job === job.id && state.job.status === 'active' ? state.job : null;
    const ctx = this.activityContext();
    const returnFare = payFare(state.wallet, ret.line.card, ret.fare);
    cameFrom = back.id;
    const entries: { option: MenuOption; run: () => void }[] = [];
    // El sitio por dentro (data/decathlon.ts): se entra a pie y se sale por la puerta a este mismo menú.
    if (place.store) {
      const store = place.store;
      entries.push({ option: { label: 'Entrar en la tienda', detail: 'a pie' }, run: () => (menu.close(), this.host.enter(store)) });
    }
    if (job) entries.push(...this.jobEntries(job, contract, again));
    for (const a of place.activities.map(getActivity)) {
      const casualShut = contract && a.id === job?.casual ? 'Con contrato, aquí se trabaja en tus turnos.' : null;
      entries.push({
        option: { label: a.name, detail: a.effects.money ? `+${euros(a.effects.money)}` : '', disabled: casualShut ?? blocker(a, ctx) ?? undefined },
        run: () => this.run(place.name, a, () => again()),
      });
    }
    entries.push({ option: { label: 'Recargar la tarjeta', detail: 'máquina' }, run: () => this.openCatalog('Máquina de billetes', 'transport-machine', '', 0, () => again()) });
    entries.push({
      option: { label: `Volver en metro a ${back.name}`, detail: `${ret.minutes} min · ${euros(ret.fare)}`, disabled: returnFare.ok ? undefined : returnFare.message },
      run: () => {
        const paid = payFare(state.wallet, ret.line.card, ret.fare);
        if (!paid.ok) return again(paid.message);
        menu.close();
        state.wallet = paid.wallet;
        const { day, hour, minute, money, energy } = state;
        metroEvents.onRide({ day, hour, minute, money, energy, to: back.station! });
        clock.advanceMinutes(ret.minutes);
        this.host.arriveByTrain(back.station!);
      },
    });
    const arrival = `${place.arrival}${job && !contract ? ` ${job.posting}` : ''} ${formatClock(state.day, state.hour, state.minute)}.`;
    menu.open(place.name, arrival, entries.map((e) => e.option), (i) => entries[i].run(), () => again(), [news, note].filter(Boolean).join(' '));
  }

  /** Salir de la tienda de un sitio sin mapa: el menú de su parada, con el metro de vuelta a donde se vino. */
  leaveTo(stopId: string): void {
    const stop = STOPS.find((s) => s.id === stopId && s.offMap);
    if (!stop) return;
    const options = destinationsFrom(stop).filter((d) => d.stop.station);
    const back = options.find((d) => d.stop.id === cameFrom) ?? [...options].sort((a, b) => a.minutes - b.minutes)[0];
    if (back) this.offMap(stop, back.stop);
  }

  /** El fichaje de un empleo en su lugar de trabajo: lo mismo que en el menú del sitio (fichar, ascenso, dejarlo). */
  openJob(jobId: string, name: string, note = ''): void {
    const { state, menu } = this.services;
    const job = getJob(jobId);
    const news = this.reviewJob();
    const contract = state.job?.job === job.id && state.job.status === 'active' ? state.job : null;
    const again = (n = ''): void => this.openJob(jobId, name, n);
    const entries = this.jobEntries(job, contract, again);
    // El turno suelto, sin contrato (data/jobs.ts `casual`): antes en el menú de la parada, ahora aquí, en el fichaje.
    if (job.casual) {
      const casual = getActivity(job.casual);
      const shut = contract ? 'Con contrato, aquí se trabaja en tus turnos.' : null;
      entries.push({
        option: { label: casual.name, detail: casual.effects.money ? `+${euros(casual.effects.money)}` : '', disabled: shut ?? blocker(casual, this.activityContext()) ?? undefined },
        run: () => this.run(name, casual, () => again()),
      });
    }
    const text = contract ? `Tu taquilla, el chaleco colgado y el reloj de fichar. ${formatClock(state.day, state.hour, state.minute)}.` : job.posting;
    menu.open(name, text, entries.map((e) => e.option), (i) => entries[i].run(), () => menu.close(), [news, note].filter(Boolean).join(' '));
  }

  // -------------------------------------------------------------- empleo

  /** Repasa el contrato hasta ahora (faltas, despido) y lo guarda si cambió. Devuelve qué contar. */
  private reviewJob(): string {
    const { state } = this.services;
    const job = state.job;
    if (!job) return '';
    const { progress, missed, fired } = settleJob(job, this.now());
    if (progress.checked !== job.checked) {
      state.setJob(progress);
      this.host.persist();
    }
    if (!missed.length) return '';
    const days = missed.map((d) => WEEKDAY_LABEL[weekdayOf(d)]).join(', ');
    if (fired) return `Marta te espera en la puerta: con tantas faltas (${days}), el contrato se acaba aquí.`;
    return `Faltaste al turno del ${days}. Marta lo tiene apuntado: ${progress.strikes} de ${getJob(progress.job).maxStrikes}. Dos buenos turnos seguidos lo arreglan.`;
  }

  private now(): number {
    const { state } = this.services;
    return absMinute(state.day, state.hour, state.minute);
  }

  /** Lo que se puede hacer con el empleo del sitio: leer la oferta, fichar, el ascenso o dejarlo. */
  private jobEntries(job: JobDef, contract: JobProgress | null, back: (n?: string) => void): { option: MenuOption; run: () => void }[] {
    const { state } = this.services;
    const boss = job.manager.split(',')[0];
    if (!contract) {
      return [{ option: { label: 'Leer el cartel de «Se busca personal»', detail: 'oferta' }, run: () => this.jobOffer(job, back) }];
    }
    const lvl = levelOf(contract);
    const out: { option: MenuOption; run: () => void }[] = [{
      option: { label: `Fichar · ${lvl.title}`, detail: euros(lvl.wage), disabled: clockInBlocker(contract, this.now(), state.energy) ?? undefined },
      run: () => this.shiftDecision(job, back),
    }];
    if (promotionReady(contract)) out.push({ option: { label: `Hablar con ${boss}: te propone un ascenso` }, run: () => this.jobPromotion(job, back) });
    out.push({ option: { label: 'Dejar el puesto' }, run: () => this.jobQuit(job, back) });
    return out;
  }

  private jobOffer(job: JobDef, back: (n?: string) => void): void {
    const { state, menu, dialogue } = this.services;
    const blocked = hireBlocker(job, state.job, state.day);
    menu.open(job.employer, offerText(job), [
      { label: `Firmar con ${job.manager.split(',')[0]}`, disabled: blocked ?? undefined },
      { label: 'Ahora no' },
    ], (i) => {
      if (i === 1) return back();
      const p = hire(job, state.day);
      state.setJob(p);
      this.host.persist();
      menu.close();
      const next = nextShift(p, this.now());
      dialogue.start(job.manager, [
        '«Bienvenido. Aquí lo que cuenta es venir y no dejar tirada a la gente.»',
        `Firmas como ${levelOf(p).title.toLowerCase()}.${next ? ` Tu primer turno: el ${formatDate(next.day, false)} a las ${String(levelOf(p).start).padStart(2, '0')}:00.` : ''}`,
        'El horario y cómo vas lo tienes en el móvil, en Trabajo.',
      ]);
      dialogue.once('close', () => back());
    }, () => back());
  }

  /**
   * Fichar: antes de hacer el turno entero se decide la situación del día. Volver (o Esc) no ficha: ni cobra ni
   * pasa el tiempo, y el turno sigue ahí mientras haya margen.
   */
  private shiftDecision(job: JobDef, back: (n?: string) => void): void {
    const { state, menu, clock, dialogue } = this.services;
    const contract = state.job!;
    const situation = situationFor(contract, state.day);
    // Lo que se ha abierto estudiando (data/jobs.ts `perks`): una decisión más en cualquier turno.
    const unlocks = state.study.unlocks;
    const choices = [...situation.choices, ...(job.perks ?? []).filter((p) => unlocks.includes(p.unlock))];
    menu.open(`Turno · ${levelOf(contract).title}`, situation.text, [...choices.map((c) => ({ label: c.label })), { label: 'Volver sin fichar' }], (i) => {
      if (i === choices.length) return back();
      // Se vuelve a mirar: el menú puede llevar rato abierto.
      const blocked = clockInBlocker(contract, this.now(), state.energy);
      if (blocked) return back(blocked);
      const out = work(contract, this.now(), choices[i]);
      menu.close();
      state.setJob(out.progress);
      state.as(`Sueldo · ${job.employer}`, () => {
        state.money += out.money;
      });
      state.energy += out.energy;
      clock.advanceMinutes(out.minutes);
      this.host.persist();
      const ready = promotionReady(out.progress) ? `${job.manager.split(',')[0]} quiere hablar contigo antes de que te vayas.` : '';
      dialogue.start(job.employer, [...out.lines, ready, `${formatClock(state.day, state.hour, state.minute)}.`].filter(Boolean));
      dialogue.once('close', () => back());
    }, () => back());
  }

  private jobPromotion(job: JobDef, back: (n?: string) => void): void {
    const { state, menu, dialogue } = this.services;
    const contract = state.job!;
    const next = promotionReady(contract)!;
    menu.open(job.manager, `«Llevas ${contract.good} turnos buenos y necesito a alguien al frente.» Ahora: ${levelSummary(levelOf(contract))} Te propone: ${levelSummary(next)} Una hora más por turno y la sección a tu cargo, desde mañana.`, [
      { label: 'Aceptar el ascenso' },
      { label: 'Seguir como estoy' },
    ], (i) => {
      const p = i === 0 ? promote(contract, state.day) : decline(contract);
      state.setJob(p);
      this.host.persist();
      menu.close();
      dialogue.start(job.manager, i === 0
        ? [`«Hecho. Desde mañana, ${next.title.toLowerCase()}.»`, levelSummary(next)]
        : ['«Vale. Sigue así y lo volvemos a hablar.»']);
      dialogue.once('close', () => back());
    }, () => back());
  }

  private jobQuit(job: JobDef, back: (n?: string) => void): void {
    const { state, menu } = this.services;
    menu.open(job.manager, '¿Dejas el puesto? Lo cobrado es tuyo; los turnos que quedan, ya no. Podrías volver a firmar más adelante.', [
      { label: 'Sí, lo dejo' },
      { label: 'No, me quedo' },
    ], (i) => {
      if (i === 1) return back();
      state.setJob(quit(state.job!, state.day));
      this.host.persist();
      back('Devuelves el chaleco. «Suerte. Si cambias de idea, ya sabes dónde está el cartel.»');
    }, () => back());
  }

  // ------------------------------------------------------------- estudios

  /**
   * Un punto de estudio del mapa (data/study.ts): la ventanilla de un curso, un sitio de práctica o el del encargo.
   * Las reglas son de systems/Study; aquí se enseñan, se aplica el resultado y se adelanta el reloj.
   */
  openStudy(id: string, name: string, lines: readonly string[], note = ''): void {
    const course = courseAt(id);
    if (course) return this.courseDesk(course, name, lines, note);
    const site = practiceAt(id);
    if (site) return this.practiceSite(site, name, note);
    const gig = gigAt(id);
    if (gig) return this.gigSite(gig, name, lines);
  }

  /** Aplica lo que devuelve systems/Study: progreso, dinero, energía, reloj; guarda y lo cuenta. */
  private studied(title: string, out: StudyOutcome, label: string, back?: () => void): void {
    const { state, clock, menu, dialogue } = this.services;
    menu.close();
    state.setStudy(out.study);
    if (out.money) {
      state.as(label, () => {
        state.money += out.money;
      });
    }
    state.energy += out.energy;
    clock.advanceMinutes(out.minutes);
    this.host.persist();
    dialogue.start(title, [...out.lines, `${formatClock(state.day, state.hour, state.minute)}.`]);
    if (back) dialogue.once('close', back);
  }

  private courseDesk(c: CourseDef, name: string, lines: readonly string[], note = ''): void {
    const { state, menu, dialogue } = this.services;
    const place = placeInfo(c.place);
    if (place && !isOpen(place, state.day, state.hour, state.minute)) {
      dialogue.start(name, [...lines, ...closedLines(place, state.day, state.hour, state.minute).slice(1)]);
      return;
    }
    const s = state.study;
    const now = this.now();
    const again = (n = ''): void => this.courseDesk(c, name, lines, n);
    const p = s.course?.id === c.id ? s.course : null;
    const entries: { option: MenuOption; run: () => void }[] = [];
    if (!p) {
      entries.push({ option: { label: `Matricularse · ${c.name}`, detail: euros(c.fee), disabled: enrollBlocker(c, s, state.money) ?? undefined }, run: () => this.enrollConfirm(c, again) });
    } else {
      const session = sessionNow(c, p, now);
      if (p.attended.length < c.lessons.length) {
        entries.push({
          option: { label: session?.kind === 'recovery' ? 'Entrar a la tutoría de recuperación' : 'Entrar a clase', detail: session ? `${session.hours} h` : '', disabled: classBlocker(c, s, now, state.energy) ?? undefined },
          run: () => {
            const blocked = classBlocker(c, state.study, this.now(), state.energy);
            if (blocked) return again(blocked);
            this.studied(c.name, attend(c, state.study, this.now()), '', () => again());
          },
        });
      }
      if (!p.passed) {
        entries.push({ option: { label: 'Hacer la prueba final', detail: `${c.demo.minutes} min`, disabled: demoBlocker(c, s, now, state.energy) ?? undefined }, run: () => this.demoStep(c, [], again) });
      }
      const gig = getGig(c.gig);
      const status = gigStatus(gig, s, now);
      if (status === 'offered' || status === 'expired') {
        entries.push({ option: { label: status === 'offered' ? `Ver el encargo · ${gig.client}` : 'Pedir otro plazo para el encargo', detail: euros(gig.pay) }, run: () => this.gigOffer(gig, again) });
      }
    }
    entries.push({ option: { label: 'Nada' }, run: () => menu.close() });
    menu.open(name, this.courseSummary(c, s, now), entries.map((e) => e.option), (i) => entries[i].run(), undefined, note);
  }

  /** Lo que se ve en la ventanilla: nivel, clases, la próxima sesión y el encargo. */
  private courseSummary(c: CourseDef, s: StudyState, now: number): string {
    const k = knowledge(s, c.skill);
    const skill = `${getSkill(c.skill).name}: ${k} (${levelName(c.skill, k)}).`;
    const p = s.course?.id === c.id ? s.course : null;
    if (!p) return `${skill} ${courseOffer(c, this.services.state.day)}`;
    const next = nextSession(c, p, now);
    const lost = p.lessons.filter((_, i) => lessonStatus(c, p, i, now) === 'missed').length;
    const gig = getGig(c.gig);
    const parts = [skill, `Clases: ${p.attended.length} de ${c.lessons.length}${lost ? ` (${lost} perdida${lost > 1 ? 's' : ''}: se recupera en tutoría)` : ''}.`];
    if (next && p.attended.length < c.lessons.length) parts.push(`Próxima: ${sessionLabel(c, next)}.`);
    if (p.passed) parts.push('Prueba aprobada.');
    const status = gigStatus(gig, s, now);
    if (status === 'active') parts.push(`Encargo: ${gig.client}, hasta el ${gigDeadline(gig, s.gig!)}.`);
    if (status === 'expired') parts.push('El plazo del encargo se pasó: puedes pedir otro.');
    if (status === 'done') parts.push('Encargo entregado.');
    if (hasCamera(s)) parts.push('Llevas la cámara del centro.');
    return parts.join(' ');
  }

  private enrollConfirm(c: CourseDef, back: (n?: string) => void): void {
    const { state, menu } = this.services;
    menu.open(c.name, courseOffer(c, state.day), [{ label: `Pagar la matrícula (${euros(c.fee)})` }, { label: 'Ahora no' }], (i) => {
      if (i === 1) return back();
      const blocked = enrollBlocker(c, state.study, state.money);
      if (blocked) return back(blocked);
      state.as(`Matrícula · ${c.name.split(' · ')[0]}`, () => {
        state.money -= c.fee;
      });
      state.setStudy(enroll(c, state.study, state.day));
      this.host.persist();
      const first = state.study.course!.lessons[0];
      back(`Matriculado. Primera clase: ${formatDate(first, false)} a las ${String(c.start).padStart(2, '0')}:00. Te dan la cámara; el horario, en el móvil (Estudios).`);
    }, () => back());
  }

  /** La prueba: una decisión por paso. Volver en cualquier paso no la gasta; sólo cuenta al acabar. */
  private demoStep(c: CourseDef, picks: number[], back: (n?: string) => void): void {
    const { state, menu } = this.services;
    const step = c.demo.steps[picks.length];
    menu.open('Prueba final', step.text, [...step.choices.map((ch) => ({ label: ch.label })), { label: 'Dejarlo para otro momento' }], (i) => {
      if (i === step.choices.length) return back();
      const next = [...picks, i];
      if (next.length < c.demo.steps.length) return this.demoStep(c, next, back);
      const blocked = demoBlocker(c, state.study, this.now(), state.energy);
      if (blocked) return back(blocked);
      this.studied('Prueba final', demo(c, state.study, next, this.now()), '', () => back());
    }, () => back());
  }

  private gigOffer(g: GigDef, back: (n?: string) => void): void {
    const { state, menu } = this.services;
    menu.open('Bolsa de encargos', gigTerms(g, state.day), [{ label: 'Aceptar el encargo' }, { label: 'Ahora no' }], (i) => {
      if (i === 1) return back();
      state.setStudy(acceptGig(g, state.study, state.day));
      this.host.persist();
      back(`Aceptado. ${g.client}: hasta el ${gigDeadline(g, state.study.gig!)}.`);
    }, () => back());
  }

  private practiceSite(site: PracticeSite, name: string, note = ''): void {
    const { state, menu } = this.services;
    const s = state.study;
    const blocked = practiceBlocker(site, s, this.now(), state.energy);
    const gain = practiceGain(site, s, state.day);
    const repeat = gain < site.gain ? ' Ya has practicado aquí hoy: rinde menos.' : '';
    const text = blocked ? site.text : `${site.text} Ahora rinde unos +${gain} de conocimiento, según cómo lo hagas.${repeat}`;
    const options: MenuOption[] = site.choices.map((ch) => ({ label: ch.label, detail: `${site.minutes + (ch.minutes ?? 0)} min`, disabled: blocked ?? undefined }));
    options.push({ label: 'Ahora no' });
    menu.open(name, text, options, (i) => {
      if (i === site.choices.length) return menu.close();
      const again = practiceBlocker(site, state.study, this.now(), state.energy);
      if (again) return this.practiceSite(site, name, again);
      this.studied(name, practice(site, state.study, site.choices[i], this.now()), '');
    }, undefined, note);
  }

  /** El sitio del encargo: con el encargo en marcha, se hace aquí; si no, la puerta se mira y cuenta cómo va. */
  private gigSite(g: GigDef, name: string, lines: readonly string[]): void {
    const { state, menu, dialogue } = this.services;
    const s = state.study;
    const status = gigStatus(g, s, this.now());
    const who = g.client.split(',')[0];
    if (status !== 'active') {
      const extra = status === 'offered' ? `${who} sabe que vienes: acepta el encargo en el centro de estudios.`
        : status === 'expired' ? `«Se nos pasó el plazo», dice ${who}. En el centro puedes pedir otro.`
        : status === 'done' ? 'Tus fotos están en el escaparate.' : '';
      dialogue.start(name, [...lines, extra].filter(Boolean));
      return;
    }
    const blocked = deliverBlocker(g, s, this.now(), state.energy);
    const options: MenuOption[] = g.choices.map((ch) => ({ label: ch.label, detail: `${g.minutes + (ch.minutes ?? 0)} min`, disabled: blocked ?? undefined }));
    options.push({ label: 'Ahora no' });
    menu.open(`Encargo · ${name}`, `${g.brief} Hasta el ${gigDeadline(g, s.gig!)}. ${euros(g.pay)}.`, options, (i) => {
      if (i === g.choices.length) return menu.close();
      const again = deliverBlocker(g, state.study, this.now(), state.energy);
      if (again) return dialogue.start(name, [again]);
      this.studied(name, deliver(g, state.study, g.choices[i], this.now()), `Encargo · ${who}`);
    });
  }

  // ------------------------------------------------------------- vivienda

  /**
   * El catálogo del hogar: el ordenador de casa (`shop` vacío) o el mostrador de una tienda (`shop`, p. ej. 'velarde'),
   * cada uno con lo que vende (UpgradeDef.sold). Elegir una enseña precio, saldo y dónde puede ir; comprarla la instala
   * hoy mismo, en la ranura elegida, y cobra una sola vez. En casa, además, se cambia de sitio lo que ya está puesto.
   */
  openHousing(name: string, shop?: string, note = '', selected = 0): void {
    const { state, menu } = this.services;
    const h = state.housing;
    const sold = UPGRADES.filter((u) => (u.sold ?? ['casa']).includes(shop ?? 'casa'));
    const movable = shop ? [] : installedIn(h).filter((id) => optionsOf(getUpgrade(id), h.home).length > 1);
    const again = (n = '', i = 0): void => this.openHousing(name, shop, n, i);
    const options: MenuOption[] = sold.map((u) => {
      const owned = h.owned.includes(u.id);
      const blocked = buyBlocker(h, u.id, state.money);
      return {
        label: `${u.name} · ${u.kind}`,
        detail: owned ? (installedIn(h).includes(u.id) ? 'instalada' : 'en el trastero') : euros(u.price),
        disabled: blocked ?? undefined,
      };
    });
    for (const id of movable) options.push({ label: `Cambiar de sitio: ${getUpgrade(id).name}`, detail: `ahora en ${slotName(h.home, this.slotOf(id)!)}` });
    options.push({ label: shop ? 'Volver' : 'Cerrar el catálogo' });
    const intro = shop
      ? `Te lo llevan hoy a ${getHome(h.home).name} y eliges dónde va. Cada cosa se tiene una vez. Saldo: ${euros(state.money)}.`
      : `Mejoras para ${getHome(h.home).name}. Se instalan hoy mismo en su ranura y no se pueden comprar dos veces. Saldo: ${euros(state.money)}.`;
    menu.open(name, intro, options, (i) => {
      if (i < sold.length) this.confirmUpgrade(sold[i].id, name, (n) => again(n, i));
      else if (i < sold.length + movable.length) this.openRelocate(movable[i - sold.length], (n) => again(n, i));
      else menu.close();
    }, undefined, note, selected);
  }

  /** La ranura de la casa de ahora en la que está puesta una mejora. */
  private slotOf(id: string): string | undefined {
    return [...layout(this.services.state.housing)].find(([, v]) => v.id === id)?.[0];
  }

  /** Lo comprado, ya en casa: si estás en ella, se vuelve a montar con el mueble puesto; si no, lo encontrarás al llegar. */
  private installed(h: HousingState, lines: string[], title: string): void {
    const { state, dialogue } = this.services;
    state.setHousing(h);
    installAll(h);
    this.host.persist();
    dialogue.start(title, [...lines, `${formatClock(state.day, state.hour, state.minute)}.`]);
    if (state.locationId === getHome(h.home).location) dialogue.once('close', () => this.host.refreshHome());
  }

  /** Comprar una mejora: una opción por ranura posible (las ocupadas, apagadas, diciendo qué hay). */
  private confirmUpgrade(id: string, title: string, back: (n?: string) => void): void {
    const { state, menu } = this.services;
    const u = getUpgrade(id);
    const h = state.housing;
    const slots = optionsOf(u, h.home);
    const options: MenuOption[] = slots.map((p) => ({
      label: slots.length > 1 ? `Comprar y ponerla en ${slotName(h.home, p.slot)}` : `Comprar e instalar (${euros(u.price)})`,
      detail: euros(u.price),
      disabled: buyBlocker(h, id, state.money, p.slot) ?? undefined,
    }));
    options.push({ label: 'Volver' });
    menu.open(u.name, housingQuote(h, id, state.money), options, (i) => {
      if (i === slots.length) return back();
      const r = buy(state.housing, id, state.money, slots[i].slot);
      if (!r.ok) return back(r.message);
      menu.close();
      state.as(`Mejora · ${u.name}`, () => {
        state.money = r.money;
      });
      const home = state.locationId === getHome(r.housing.home).location;
      this.installed(r.housing, [`Pedido confirmado: ${u.name}, ${euros(u.price)}. Saldo: ${euros(state.money)}.`, home ? `El montador la deja puesta en ${slotName(r.housing.home, slots[i].slot)}.` : `Te la llevan hoy: la encontrarás en ${slotName(r.housing.home, slots[i].slot)}.`], title);
    }, () => back());
  }

  /** Cambiar de sitio algo ya puesto: a otra de sus ranuras libres. No cobra ni crea otra. */
  private openRelocate(id: string, back: (n?: string) => void): void {
    const { state, menu } = this.services;
    const h = state.housing;
    const u = getUpgrade(id);
    const slots = optionsOf(u, h.home);
    const options: MenuOption[] = slots.map((p) => ({ label: `Ponerla en ${slotName(h.home, p.slot)}`, disabled: relocate(h, id, p.slot).ok ? undefined : relocate(h, id, p.slot).message }));
    options.push({ label: 'Volver' });
    menu.open(u.name, `Ahora está en ${slotName(h.home, this.slotOf(id)!)}. Moverla no cuesta nada.`, options, (i) => {
      if (i === slots.length) return back();
      const r = relocate(state.housing, id, slots[i].slot);
      if (!r.ok) return back(r.message);
      menu.close();
      this.installed(r.housing, [r.message], u.name);
    }, () => back());
  }

  /** ¿Hay algún pago vencido? Mudarse con deudas pendientes no se puede. */
  private overdueBills(): boolean {
    const { state } = this.services;
    return unpaid(state.household).some((o) => ['overdue', 'late'].includes(billStatus(o, state.day)));
  }

  /**
   * La puerta de una vivienda que no es la tuya: lo que cuesta, lo que pide y lo que pasa con tus cosas antes de
   * decidir. Mudarse cobra la mudanza, traslada lo que cabe, guarda lo que no y te deja en la casa nueva.
   */
  openHomeOffer(homeId: string, note = ''): void {
    const { state, menu, dialogue } = this.services;
    const home = getHome(homeId);
    const free = (): number => state.money - owed(state.household);
    const blocked = moveBlocker(state.housing, homeId, free(), this.overdueBills());
    const fee = home.move?.fee ?? 0;
    menu.open(home.name, moveSummary(state.housing, homeId), [
      { label: `Alquilarla y mudarte (${euros(fee)})`, disabled: blocked ?? undefined },
      { label: 'Ahora no' },
    ], (i) => {
      if (i === 1) return menu.close();
      const from = state.housing;
      const r = move(from, homeId, state.money, free(), this.overdueBills());
      if (!r.ok) return this.openHomeOffer(homeId, r.message);
      menu.close();
      state.as(`Mudanza · ${home.name}`, () => {
        state.money = r.money;
      });
      // Las visitas ya quedadas pasan a la casa nueva (systems/Housing.movePlans).
      const moved = movePlans(state.snapshot.stories ?? {}, from.home, homeId);
      for (const [npc, story] of Object.entries(moved)) state.setStory(npc, story);
      state.setHousing(r.housing);
      installAll(r.housing);
      this.host.persist();
      const carried = installedIn(r.housing);
      const parked = storedIn(r.housing);
      const names = (ids: readonly string[]): string => ids.map((c) => getUpgrade(c).name).join(', ');
      dialogue.start(home.name, [
        `Mudanza hecha: ${euros(fee)}. Saldo: ${euros(state.money)}.`,
        carried.length ? `Se han instalado contigo: ${names(carried)}.` : 'Tu ropa, tatuajes y bolsa vienen contigo.',
        parked.length ? `No caben aquí y quedan guardadas en el trastero, sin perderse: ${names(parked)}.` : '',
        `Alquiler: ${euros(getHome(from.home).rent)} → ${euros(home.rent)} desde el próximo periodo.`,
      ].filter(Boolean));
      dialogue.once('close', () => this.host.movedHome());
    }, () => menu.close(), note);
  }

  // ---------------------------------------------------------- encuentros

  /**
   * Un encuentro con hora (data/parish.ts), desde su tablón o hablando con quien lo lleva: qué es, el próximo, cómo
   * fue el último y, si es la hora y estás dentro, ir hasta el final o un rato. Las reglas son de systems/Parish; aquí
   * se enseñan, se aplica el resultado (una vez, antes de pasar el reloj) y se adelanta el reloj.
   */
  openGathering(id: string, name: string, note = ''): void {
    const g = getGathering(id);
    if (!g) return;
    const { state, menu } = this.services;
    const now = this.now();
    const s = state.parish;
    const today = occurrenceOn(g, state.day);
    const blocked = joinBlocker(g, s, now);
    const inside = placeForInterior(state.locationId)?.id === g.place;
    const why = blocked ?? (inside ? undefined : `Es dentro: entra en la ${placeInfo(g.place)?.name ?? 'iglesia'} y habla con ${getNpc(g.host).name}.`);
    const left = today ? today.end - now : 0;
    const status = blocked ?? `Ahora: ${g.name}, hasta las ${hhmm(g.start + g.minutes / 60)}.`;
    const text = [g.pitch, status, lastAttendance(g, s) ?? ''].filter(Boolean).join(' ');
    menu.open(name, text, [
      { label: 'Quedarme hasta el final', detail: blocked ? '' : `${left} min`, disabled: why },
      { label: 'Sólo un rato', detail: blocked ? '' : `${Math.min(g.shortStay, left)} min`, disabled: why },
      { label: 'Ahora no' },
    ], (i) => {
      if (i === 2) return menu.close();
      this.joinGathering(g.id, name, i === 0 ? 'full' : 'short');
    }, undefined, note);
  }

  /** Ir: se apunta en el estado y en el perfil de quien lo lleva, se guarda y luego pasa el rato. */
  private joinGathering(id: string, name: string, choice: 'full' | 'short'): void {
    const g = getGathering(id)!;
    const { state, clock, menu, dialogue } = this.services;
    const blocked = joinBlocker(g, state.parish, this.now());
    if (blocked) return this.openGathering(id, name, blocked);
    const out = attendGathering(g, state.parish, state.socialOf(g.host), this.now(), choice);
    menu.close();
    state.setParish(out.parish);
    state.setSocialProfile(g.host, out.host);
    state.energy += out.energy;
    clock.advanceMinutes(out.minutes);
    this.host.persist();
    const host = getNpc(g.host).name;
    dialogue.start(g.name, [
      ...out.lines,
      `${out.stay === 'full' ? 'Hasta el final' : 'Un rato'}: energía +${out.energy}; ${host} te tiene más presente (amistad +${out.effect.friendship}).`,
      `${formatClock(state.day, state.hour, state.minute)}.`,
    ]);
  }

  // ---------------------------------------------------------- actividades

  // ----------------------------------------------------------- servicios

  /**
   * Lo que ofrece alguien del personal al hablarle (data/services.ts): unas
   * actividades con su precio (la barra) o un cambio de aspecto (la barbera).
   * Lugar → servicio → esta interacción → la transacción → el estado.
   */
  openOffer(id: OfferId, who: string, note = '', selected = 0): void {
    const offer = getOffer(id);
    if (offer.kind === 'activities') {
      this.openSpot(`${offer.title} · ${who}`, offer.activities, note);
      return;
    }
    if (offer.kind === 'retail') {
      this.openStore(offer.store, who, offer.minutes, note, selected);
      return;
    }
    if (offer.kind === 'police') {
      this.openPoliceDesk(offer, who);
      return;
    }
    if (offer.kind === 'gathering') {
      this.openGathering(offer.gathering, who, note);
      return;
    }
    if (offer.slot === 'tattoos') {
      this.openTattoo(offer.title, offer.greeting, who, note, selected);
      return;
    }
    const { state, menu, clock, dialogue } = this.services;
    const current = state.appearanceOf('player');
    const wearing = withAppearance(PLAYER_COLORS, current).hairStyle ?? 'short';
    const cuts = HAIRSTYLES.filter((h) => h.price !== undefined);
    const options: MenuOption[] = cuts.map((h) => {
      const trial = haircut(state.wallet, current, wearing, h.id);
      return { label: h.name, detail: h.id === wearing ? 'el tuyo' : euros(h.price!), disabled: trial.ok ? undefined : trial.message };
    });
    options.push({ label: 'Nada, gracias' });
    menu.open(`${offer.title} · ${who}`, `${offer.greeting} Llevas ${euros(state.money)}.`, options, (i) => {
      if (i === cuts.length) {
        menu.close();
        return;
      }
      const result = haircut(state.wallet, current, wearing, cuts[i].id);
      if (!result.ok) {
        this.openOffer(id, who, result.message, i);
        return;
      }
      menu.close();
      state.wallet = result.wallet;
      // El aspecto es estado: se guarda con la partida y quien pinta al jugador lo repinta ya.
      state.setAppearance('player', result.appearance);
      clock.advanceMinutes(offer.minutes);
      this.host.persist();
      dialogue.start(who, [result.message, `${formatClock(state.day, state.hour, state.minute)}.`]);
    }, undefined, note, selected);
  }

  /**
   * La recepción de la comisaría (systems/Police): cómo está la zona ahora (su barrio, el riesgo de esta hora y los robos
   * que constan) y, sólo si te han robado en la calle y no lo has denunciado, la denuncia, que lleva su rato y queda
   * registrada. Sin robo tuyo, no hay nada que denunciar y no se ofrece.
   */
  private openPoliceDesk(offer: Extract<ServiceOffer, { kind: 'police' }>, who: string): void {
    const { state, menu, clock, dialogue } = this.services;
    const now = absMinute(state.day, state.hour, state.minute);
    const theft = reportable(now);
    const options: MenuOption[] = [{ label: 'Cómo está la zona ahora' }];
    if (theft) options.push({ label: `Denunciar el robo de ${euros(theft.amount)}`, detail: `${POLICE.reportMinutes} min` });
    options.push({ label: 'Nada, gracias' });
    menu.open(`${offer.title} · ${who}`, 'Buenas. ¿En qué te puedo ayudar?', options, (i) => {
      menu.close();
      if (i === 0) {
        dialogue.start(who, deskBrief(offer.street, state, now));
        return;
      }
      if (!theft || i !== 1 || !fileReport(theft.id, now)) return;
      clock.advanceMinutes(POLICE.reportMinutes);
      this.host.persist();
      dialogue.start(who, [
        `Denuncia número ${theft.id}: robo de ${euros(theft.amount)} en ${theft.zone}. Queda registrada.`,
        theft.attended ? 'Consta también que una patrulla te atendió allí mismo.' : 'Nadie de patrulla llegó a verlo: queda sólo con lo que nos cuentas.',
        `${formatClock(state.day, state.hour, state.minute)}.`,
      ]);
    });
  }

  // ------------------------------------------------------------- tablón del barrio

  /**
   * La taquilla de un recinto (systems/Tickets): el partido que se vende, cuándo abren las puertas, hasta cuándo se
   * entra, por qué puerta y el precio. Comprar pide confirmar con el precio delante; pagar cobra y emite la entrada a
   * la vez y se guarda. Con entrada, la enseña; cerrada, agotada o sin partido, lo dice (y no deja comprar).
   */
  openTickets(venueId: string, note = ''): void {
    const { state, menu } = this.services;
    const venue = venueOf(venueId);
    if (!venue) return;
    const title = `Taquillas · ${venue.name}`;
    const o = offer(venue, state.tickets, state);
    if (o.kind === 'none') {
      menu.open(title, `No hay partidos en casa en los próximos ${venue.horizon} días. La taquilla abre cuando hay partido a la vista.`, [{ label: 'Cerrar' }], () => menu.close(), undefined, note);
      return;
    }
    const info = fixtureLine(venue, o.fixture, state.day);
    if (o.kind === 'owned') {
      menu.open(title, `${info} Tu entrada: ${ticketLine(o.ticket, state.day)}`, [{ label: 'Cerrar' }], () => menu.close(), undefined, note);
      return;
    }
    const label = `Entrada general · ${venue.sector}`;
    const buy: MenuOption =
      o.kind === 'closed' ? { label, detail: euros(venue.price), disabled: `La taquilla está cerrada. Abre ${o.opens}.` }
      : o.kind === 'sold-out' ? { label, detail: 'agotadas', disabled: 'Entradas agotadas para este partido.' }
      : { label: `${label} · fila ${o.row}, asiento ${o.seat}`, detail: euros(o.price), disabled: state.money + 1e-9 < o.price ? `No te llega: cuesta ${euros(o.price)} y llevas ${euros(state.money)}.` : undefined };
    const status = o.kind === 'closed' ? `Taquilla cerrada: abre ${o.opens}.` : o.kind === 'sold-out' ? 'Entradas agotadas.' : `Quedan ${o.left} entradas de ${venue.capacity}. Llevas ${euros(state.money)}.`;
    menu.open(title, `${info} ${status}`, [buy, { label: 'Cerrar' }], (i) => {
      if (i !== 0 || o.kind !== 'on-sale') {
        menu.close();
        return;
      }
      menu.open(`${title} · Confirmar`, `${venue.sector}, fila ${o.row}, asiento ${o.seat}, para el ${venue.home} – ${o.fixture.rival}. Se paga ahora: ${euros(o.price)}.`, [{ label: `Pagar ${euros(o.price)}` }, { label: 'Cancelar' }], (j) => {
        if (j !== 0) {
          this.openTickets(venueId, 'No has comprado nada.');
          return;
        }
        // Todo o nada: el cobro y la entrada salen del mismo resultado y se guardan juntos.
        const r = buyTicket(venue, state.money, state.tickets, state);
        if (r.ok) {
          state.as('Entrada de partido', () => state.setTickets(r.tickets, r.money));
          this.host.persist();
        }
        this.openTickets(venueId, r.message);
      }, () => this.openTickets(venueId, 'No has comprado nada.'));
    }, undefined, note);
  }

  /**
   * El tablón del barrio (systems/Boards): sus secciones y, dentro, cada sitio o evento con su estado. Se lee del
   * mundo cada vez que se abre una página (el reloj está parado mientras tanto). Elegir algo enseña su horario
   * entero abajo; «Volver» o Esc dentro de una sección vuelven al índice, y en el índice cierran.
   */
  openBoard(location: string, tx: number, ty: number, section = -1, selected = 0, note = ''): void {
    const { state, menu } = this.services;
    const board = boardAt(location, tx, ty, state);
    const page = board.sections[section];
    if (!page) {
      const options: MenuOption[] = board.sections.map((s) => {
        const open = s.entries.filter((e) => e.state === 'open' || e.state === 'active').length;
        const detail = s.id === 'events' ? (s.entries.length ? `${s.entries.length}` : 'nada esta semana') : `${open} de ${s.entries.length} abiertos`;
        return { label: s.title, detail };
      });
      options.push({ label: 'Cerrar' });
      menu.open(board.title, board.intro, options, (i) => {
        if (i === board.sections.length) menu.close();
        else this.openBoard(location, tx, ty, i);
      }, undefined, note, selected);
      return;
    }
    const options: MenuOption[] = [...page.entries.map((e) => ({ label: e.label, detail: e.detail })), { label: 'Volver' }];
    const text = page.entries.length ? (page.id === 'events' ? 'Lo de ahora primero; luego, lo anunciado para los próximos siete días.' : 'Lo abierto primero; luego, lo que abre antes.') : (page.empty ?? '');
    const back = (): void => this.openBoard(location, tx, ty, -1, section);
    menu.open(`${board.title} · ${page.title}`, text, options, (i) => {
      if (i === page.entries.length) back();
      else this.openBoard(location, tx, ty, section, i, page.entries[i].note);
    }, back, note, selected);
  }

  // ------------------------------------------------------------- ropa

  /**
   * La caja de una tienda de ropa (data/retail.ts): su género a su precio. Lo
   * tuyo se enseña como tuyo y ponértelo no cuesta; comprar cobra, lo guarda en
   * el armario y sales con ello puesto (systems/Retail.ts).
   */
  private openStore(storeId: string, who: string, minutes: number, note = '', selected = 0): void {
    const { state, menu, clock } = this.services;
    const store = getStore(storeId);
    const current = state.appearanceOf('player');
    const lines = stockOf(storeId, state.wardrobe, current);
    const options: MenuOption[] = lines.map((l) => {
      if (l.wearing) return { label: l.def.name, detail: 'la llevas', disabled: 'Ya la llevas puesta.' };
      if (l.owned) return { label: l.def.name, detail: 'tuya · ponértela' };
      const trial = buyGarment(state.wallet, state.wardrobe, current, storeId, l.garment);
      return { label: l.def.name, detail: `${euros(l.price)}${l.def.unique ? ' · única' : ''}`, disabled: trial.ok ? undefined : trial.message };
    });
    options.push({ label: 'Sólo miraba' });
    menu.open(`${store.name} · ${who}`, `${store.greeting} Llevas ${euros(state.money)}.`, options, (i) => {
      if (i === lines.length) {
        menu.close();
        return;
      }
      const line = lines[i];
      if (line.owned) {
        state.setAppearance('player', wear(current, line.garment));
        this.host.persist();
        this.openStore(storeId, who, minutes, `Te pones ${line.def.name.toLowerCase()}.`, i);
        return;
      }
      const result = buyGarment(state.wallet, state.wardrobe, current, storeId, line.garment);
      if (result.ok) {
        state.as(getGarment(line.garment).name, () => {
          state.wallet = result.wallet;
        });
        state.wardrobe = result.wardrobe;
        state.setAppearance('player', result.appearance);
        clock.advanceMinutes(minutes);
        this.host.persist();
      }
      this.openStore(storeId, who, minutes, result.message, i);
    }, undefined, note, selected);
  }

  /**
   * Un perchero de tienda: lo que cuelga ahí (sus categorías), con precio. Al
   * elegir una se ve su ficha y se puede probar, comprar o dejar (openGarment).
   * El género y los precios son los de la tienda: los mismos que en caja.
   */
  openRack(rack: RackDef, note = '', selected = 0): void {
    const { state, menu } = this.services;
    menu.peek(false);
    const lines = stockOf(rack.store, state.wardrobe, state.appearanceOf('player'), rack.categories);
    const options: MenuOption[] = lines.map((l) => ({
      label: l.def.name,
      detail: l.owned ? 'tuya' : `${euros(l.price)}${l.def.unique ? ' · única' : ''}`,
    }));
    options.push({ label: 'Cerrar' });
    menu.open(`${rack.name} · ${getStore(rack.store).name}`, `Llevas ${euros(state.money)}.`, options, (i) => {
      if (i === lines.length) menu.close();
      else this.openGarment(rack, lines[i].garment, i);
    }, undefined, note, selected);
  }

  /** Deja puesto lo de antes y cierra la prueba. */
  private endFitting(): void {
    if (!this.fitting) return;
    this.services.state.setAppearance('player', this.fitting);
    this.fitting = null;
  }

  /**
   * La ficha de una prenda: nombre, categoría, precio y descripción. PROBAR la
   * pone sobre el jugador (el menú baja para verla) guardando antes el outfit
   * de siempre; se compra desde ahí o se vuelve a lo anterior, y Esc también
   * restaura. COMPRAR cobra una sola vez (systems/Retail.ts) y la guarda en el
   * armario; para equiparla luego, el armario de casa.
   */
  private openGarment(rack: RackDef, garment: string, index: number, note = ''): void {
    const { state, menu, clock } = this.services;
    const def = getGarment(garment);
    const price = getStore(rack.store).stock.find((l) => l.garment === garment)?.price ?? 0;
    const current = state.appearanceOf('player');
    const owned = state.wardrobe.includes(garment);
    const trial = buyGarment(state.wallet, state.wardrobe, current, rack.store, garment, false);
    const title = `${def.name} · ${euros(price)}`;
    // Qué hueco ocupa y qué quita: lo de antes vuelve al armario, nunca se pierde.
    const before = (this.fitting ?? current)[def.slot];
    const swap = before && before !== garment ? `, en lugar de ${getGarment(before).name.toLowerCase()}` : !before ? ', en lugar de tu ropa de siempre' : '';
    const text = `${CATEGORIES[def.category].label}${def.unique ? ' · pieza única' : ''}. Va ${SLOT_LABEL[def.slot]}${swap}. ${def.description} Llevas ${euros(state.money)}.`;
    const buy = (): void => {
      const result = buyGarment(state.wallet, state.wardrobe, current, rack.store, garment, false);
      if (!result.ok) {
        this.openGarment(rack, garment, index, result.message);
        return;
      }
      state.as(getGarment(garment).name, () => {
        state.wallet = result.wallet;
      });
      state.wardrobe = result.wardrobe;
      // Si se la estaba probando, se queda puesta: ya es suya.
      this.fitting = null;
      clock.advanceMinutes(5);
      this.host.persist();
      this.openRack(rack, `${result.message} Guardada en tu armario.`, index);
    };
    if (this.fitting) {
      menu.open(title, text, [
        { label: 'COMPRAR', detail: owned ? 'tuya' : euros(price), disabled: trial.ok ? undefined : trial.message },
        { label: 'VOLVER A PONER OUTFIT ANTERIOR' },
      ], (i) => {
        if (i === 0) {
          buy();
          return;
        }
        this.endFitting();
        this.openGarment(rack, garment, index);
      }, () => this.endFitting(), note || 'Te la has puesto: mírate.');
      menu.peek(true);
      return;
    }
    menu.peek(false);
    const wearing = current[def.slot] === garment;
    menu.open(title, text, [
      { label: 'PROBAR', disabled: wearing ? 'Ya la llevas puesta.' : undefined },
      { label: 'COMPRAR', detail: owned ? 'tuya' : euros(price), disabled: trial.ok ? undefined : trial.message },
      { label: 'CANCELAR' },
    ], (i) => {
      if (i === 0) {
        this.fitting = current;
        state.setAppearance('player', wear(current, garment));
        this.openGarment(rack, garment, index);
      } else if (i === 1) buy();
      else this.openRack(rack, '', index);
    }, () => this.openRack(rack, '', index), note);
  }

  /**
   * El armario de casa: ponerse cualquier cosa comprada o volver a la ropa de
   * siempre en cada hueco. Cambiarse no cuesta dinero, sólo un par de minutos.
   */
  openWardrobe(note = '', selected = 0): void {
    const { state, menu, clock } = this.services;
    const current = state.appearanceOf('player');
    const owned = state.wardrobe.map(getGarment);
    const options: MenuOption[] = owned.map((g) => ({
      label: g.name,
      detail: current[g.slot] === g.id ? 'puesta' : g.slot === 'top' ? 'arriba' : g.slot === 'bottom' ? 'abajo' : 'pies',
      disabled: current[g.slot] === g.id ? 'Ya la llevas puesta.' : undefined,
    }));
    options.push(
      { label: 'Lo de siempre arriba', detail: current.top ? '' : 'puesto', disabled: current.top ? undefined : 'Ya lo llevas.' },
      { label: 'Lo de siempre abajo', detail: current.bottom ? '' : 'puesto', disabled: current.bottom ? undefined : 'Ya lo llevas.' },
      { label: 'Lo de siempre en los pies', detail: current.shoes ? '' : 'puesto', disabled: current.shoes ? undefined : 'Ya lo llevas.' },
      { label: 'Cerrar' },
    );
    const inked = current.tattoos?.length ?? 0;
    const seen = visibleTattoos(PLAYER_COLORS, current).length;
    const text = (owned.length ? 'Tu ropa.' : 'Aún no te has comprado nada: sólo está lo de siempre.') +
      (inked ? ` ${inked === 1 ? 'Tu tatuaje' : `De tus ${inked} tatuajes,`} ${seen === 0 ? (inked === 1 ? 'no se ve' : 'no se ve ninguno') : inked === 1 ? 'se ve' : `se ${seen === 1 ? 've uno' : `ven ${seen}`}`} con esta ropa.` : '');
    menu.open('Armario', text, options, (i) => {
      if (i === options.length - 1) {
        menu.close();
        return;
      }
      const next = i < owned.length ? wear(current, owned[i].id) : takeOff(current, (['top', 'bottom', 'shoes'] as const)[i - owned.length]);
      state.setAppearance('player', next);
      clock.advanceMinutes(2);
      this.host.persist();
      this.openWardrobe('Listo.', i);
    }, undefined, note, selected);
  }

  // ----------------------------------------------------------- tatuajes

  /**
   * El estudio de tatuaje: primero la zona (se ve cuál está libre y si se verá
   * con lo que llevas), luego el diseño con su estilo, precio y rato. La
   * transacción es de systems/Appearance.ts; el reloj avanza lo que dura.
   */
  private openTattoo(title: string, greeting: string, who: string, note = '', selected = 0): void {
    const { state, menu } = this.services;
    const current = state.appearanceOf('player');
    const sleeve = sleeveOf(PLAYER_COLORS, current);
    const options: MenuOption[] = TATTOO_ZONES.map((z) => {
      const taken = current.tattoos?.find((t) => t.zone === z.id);
      if (taken) return { label: z.name, detail: getDesign(taken.design).name, disabled: 'Ahí ya tienes uno.' };
      const shown = z.hiddenBy !== 'always' && !z.hiddenBy.includes(sleeve);
      return { label: z.name, detail: z.hiddenBy === 'always' ? 'bajo la ropa' : shown ? 'se verá' : 'tapado ahora' };
    });
    options.push({ label: 'Hoy no' });
    menu.open(`${title} · ${who}`, `${greeting} Llevas ${euros(state.money)}.`, options, (i) => {
      if (i === TATTOO_ZONES.length) {
        menu.close();
        return;
      }
      this.openDesigns(title, greeting, who, TATTOO_ZONES[i].id, i);
    }, undefined, note, selected);
  }

  private openDesigns(title: string, greeting: string, who: string, zone: TattooZone, zoneIndex: number, note = '', selected = 0): void {
    const { state, menu, clock, dialogue } = this.services;
    const current = state.appearanceOf('player');
    const back = (): void => this.openTattoo(title, greeting, who, '', zoneIndex);
    const options: MenuOption[] = TATTOO_DESIGNS.map((d) => {
      const trial = tattoo(state.wallet, current, zone, d.id);
      return { label: `${d.name} · ${STYLE_NAMES[d.style]}`, detail: `${euros(d.price)} · ${d.minutes} min`, disabled: trial.ok ? undefined : trial.message };
    });
    options.push({ label: 'Otra zona' });
    menu.open(`${title} · ${getZone(zone).name}`, 'Elige el diseño. Del catálogo de la pared.', options, (i) => {
      if (i === TATTOO_DESIGNS.length) return back();
      const design = TATTOO_DESIGNS[i];
      const result = tattoo(state.wallet, current, zone, design.id);
      if (!result.ok) return this.openDesigns(title, greeting, who, zone, zoneIndex, result.message, i);
      menu.close();
      state.as('Tatuaje', () => {
        state.wallet = result.wallet;
      });
      state.setAppearance('player', result.appearance);
      clock.advanceMinutes(design.minutes);
      this.host.persist();
      const shown = visibleTattoos(PLAYER_COLORS, result.appearance).length > visibleTattoos(PLAYER_COLORS, current).length;
      dialogue.start(who, [
        result.message,
        shown ? 'Con lo que llevas, se ve.' : 'Con lo que llevas, no se ve. Es tuyo igual.',
        `${formatClock(state.day, state.hour, state.minute)}.`,
      ]);
    }, back, note, selected);
  }

  private activityContext(): ActivityContext {
    const { state } = this.services;
    return { day: state.day, hour: state.hour, minute: state.minute, money: state.money, energy: state.energy, inventory: state.wallet.inventory };
  }

  // ---------------------------------------------------------- en la mesa

  /**
   * Pedir sentado a una mesa con servicio (systems/TableService): la carta del
   * local por sus grupos (los de la carta, data/menus.ts), y dentro de cada
   * uno lo que se sirve a esta hora con su precio, sin pasar de lo que se lleva
   * encima. Se pueden pedir varias cosas en la misma comanda. Un vino se elige
   * y luego copa o botella, con su origen, notas y cuerpo; a veces el camarero
   * sugiere con qué acompañarlo. `start` abre por un grupo o por un vino (otra
   * copa del mismo). Se abre en vivo: el local sigue mientras se elige. Esc, o
   * no pedir nada, es «todavía no».
   */
  openOrder(menu: ServiceMenu, items: readonly MenuItem[], waiter: string, onDone: (picked: MenuItem[]) => void, start: { category?: string; wine?: MenuItem } = {}): void {
    const { state } = this.services;
    const picked: MenuItem[] = [];
    let tip = '';
    const spent = (): number => picked.reduce((sum, i) => sum + i.price, 0);
    const label = (i: MenuItem): string => (i.wine ? `${i.wine.serving === 'bottle' ? 'botella' : 'copa'} de ${i.name}` : i.name.toLowerCase());
    const summary = (): string => (picked.length > 0 ? ` Llevas pedido: ${picked.map(label).join(', ')} (${euros(spent())}).` : '');
    const afford = (i: MenuItem): string | undefined => (spent() + i.price > state.money ? `No te llega: llevas ${euros(state.money)}.` : undefined);
    const close = (all: MenuItem[]): void => {
      this.services.menu.close();
      onDone(all);
    };
    const add = (i: MenuItem): void => {
      picked.push(i);
      // Maridaje: de vez en cuando, al pedir un vino sin nada de comer, el camarero sugiere una tapa.
      tip = i.wine && !picked.some((p) => p.kind === 'food') && Math.random() < 0.4 ? (pairingFor(menu, i)?.line ?? '') : '';
      root();
    };
    const root = (): void => {
      const groups = menu.categories.filter((c) => items.some((i) => i.category === c.id));
      const options: MenuOption[] = groups.map((c) => ({ label: c.title }));
      options.push({ label: picked.length > 0 ? 'Eso es todo' : 'Nada, todavía no' });
      this.services.menu.open(
        menu.title,
        `${tip ? `«${tip}» ` : ''}${waiter} espera con la libreta.${summary()}`,
        options,
        (i) => (i < groups.length ? group(groups[i].id) : close(picked)),
        () => close([]),
        '',
        0,
        true,
      );
    };
    const group = (id: string): void => {
      // Cada vino sale una vez (su copa): al elegirlo se pregunta copa o botella.
      const list = items.filter((i) => i.category === id && i.wine?.serving !== 'bottle');
      const options: MenuOption[] = list.map((i) => ({
        label: i.name,
        detail: i.wine ? `${euros(i.price)} la copa · ${i.wine.body}` : euros(i.price),
        disabled: afford(i),
      }));
      options.push({ label: 'Volver a la carta' });
      this.services.menu.open(
        `${menu.title} · ${menu.categories.find((c) => c.id === id)?.title ?? ''}`,
        `${waiter} espera con la libreta.${summary()}`,
        options,
        (i) => {
          if (i >= list.length) return root();
          if (list[i].wine) serving(list[i]);
          else add(list[i]);
        },
        () => root(),
        '',
        0,
        true,
      );
    };
    const serving = (glass: MenuItem): void => {
      const bottle = items.find((i) => i.wine?.wine === glass.wine?.wine && i.wine?.serving === 'bottle');
      const choices = bottle ? [glass, bottle] : [glass];
      const options: MenuOption[] = choices.map((i) => ({ label: i.wine?.serving === 'bottle' ? 'Botella' : 'Una copa', detail: euros(i.price), disabled: afford(i) }));
      options.push({ label: 'Volver' });
      this.services.menu.open(
        glass.name,
        `${glass.wine?.origin}. ${glass.wine?.notes}. Cuerpo ${glass.wine?.body}.`,
        options,
        (i) => (i < choices.length ? add(choices[i]) : group(glass.category)),
        () => group(glass.category),
        '',
        0,
        true,
      );
    };
    if (start.wine) serving(start.wine);
    else if (start.category && items.some((i) => i.category === start.category)) group(start.category);
    else root();
  }

  /**
   * Sentado a una mesa con servicio: lo que se puede hacer sin levantarse. Las
   * opciones de seguir pidiendo son las del local (ServiceMenu.more: otra
   * bebida, otra copa, otra tapa...); luego la cuenta y levantarse.
   */
  openTableOptions(menu: ServiceMenu, status: string, onPick: (choice: { kind: 'order'; more: MoreOption } | { kind: 'bill' } | { kind: 'stand' }) => void): void {
    const options: MenuOption[] = [...menu.more.map((m) => ({ label: m.label })), { label: 'Pedir la cuenta' }, { label: 'Levantarse' }, { label: 'Nada' }];
    const n = menu.more.length;
    this.services.menu.open(
      menu.title,
      status,
      options,
      (i) => {
        this.services.menu.close();
        if (i < n) onPick({ kind: 'order', more: menu.more[i] });
        else if (i === n) onPick({ kind: 'bill' });
        else if (i === n + 1) onPick({ kind: 'stand' });
      },
      () => this.services.menu.close(),
      '',
      0,
      true,
    );
  }

  /**
   * La cuenta en la mesa: pagar justo, pagar dejando algo de propina o pedir
   * un momento (el camarero vuelve luego). `onPay` recibe lo que se paga, o
   * null si todavía no. También en vivo.
   */
  openBill(total: number, onPay: (amount: number | null) => void): void {
    const { state, menu } = this.services;
    const tip = Math.ceil(total * 1.1 * 2) / 2;
    const options: MenuOption[] = [
      { label: 'Pagar', detail: euros(total), disabled: state.money < total ? 'No te llega.' : undefined },
      { label: 'Pagar y dejar propina', detail: euros(tip), disabled: state.money < tip ? 'No te llega.' : undefined },
      { label: 'Un momento' },
    ];
    menu.open(
      'La cuenta',
      `Son ${euros(total)}. Llevas ${euros(state.money)}.`,
      options,
      (i) => {
        menu.close();
        onPay(i === 0 ? total : i === 1 ? tip : null);
      },
      () => {
        menu.close();
        onPay(null);
      },
      '',
      0,
      true,
    );
  }

  /**
   * Un sitio de un interior con algo que hacer (la cama, la cocina, una mesa):
   * sus actividades, con lo que falta para cada una si no se puede ahora.
   */
  /**
   * Entrenar en una máquina del gimnasio: cuánto (suave, normal o intenso), con lo que dura y lo que cuesta de energía
   * según cómo estás ahora (systems/Fitness). `onStart` recibe la intensidad elegida y los minutos de juego.
   */
  openTraining(station: StationId, onStart: (intensity: Intensity, minutes: number) => void): void {
    const { state, menu } = this.services;
    const now = (state.day - 1) * 1440 + state.hour * 60 + state.minute;
    const f = settle(state.fitness, now);
    const quotes = INTENSITY_ORDER.map((i) => quote(f, station, i, state.energy));
    const options: MenuOption[] = INTENSITY_ORDER.map((i, k) => ({
      label: INTENSITIES[i].label,
      detail: `${quotes[k].minutes} min · -${quotes[k].energy} energía`,
      disabled: quotes[k].blocked ?? undefined,
    }));
    options.push({ label: 'Cancelar' });
    menu.open(`ENTRENAR · ${STATIONS[station].name}`, summary(f), options, (i) => {
      menu.close();
      if (i < INTENSITY_ORDER.length) onStart(INTENSITY_ORDER[i], quotes[i].minutes);
    }, undefined, '', 1);
  }

  openSpot(name: string, activityIds: readonly string[], note = ''): void {
    const { menu } = this.services;
    const activities = activityIds.map(getActivity);
    const ctx = this.activityContext();
    const options: MenuOption[] = activities.map((a) => ({
      label: a.name,
      detail: a.cost ? euros(a.cost) : a.consumes ? `gasta ${getItem(a.consumes.item).name.toLowerCase()} · te quedan ${this.services.state.wallet.inventory[a.consumes.item] ?? 0}` : '',
      disabled: blocker(a, ctx) ?? undefined,
    }));
    options.push({ label: 'Nada' });
    menu.open(name, '', options, (i) => {
      if (i === activities.length) {
        menu.close();
        return;
      }
      this.run(name, activities[i]);
    }, undefined, note);
  }

  /**
   * Hacer una actividad, sea donde sea: cobra, gasta de la bolsa lo que use,
   * cambia la energía y adelanta el reloj. El mundo sigue: personajes, locales,
   * calle, metro y luz salen de ese reloj.
   */
  private run(title: string, def: ActivityDef, after?: () => void): void {
    const { state, clock, menu, dialogue } = this.services;
    const out = perform(def);
    menu.close();
    state.as(def.name.replace(/ \(.*\)$/, ''), () => {
      state.money += out.money;
    });
    state.energy += out.energy;
    if (out.consumes) state.wallet = spend(state.wallet, out.consumes.item, out.consumes.qty);
    clock.advanceMinutes(out.minutes);
    this.host.persist();
    dialogue.start(title, [...out.lines, `${formatClock(state.day, state.hour, state.minute)}.`]);
    if (after) dialogue.once('close', after);
  }
}
