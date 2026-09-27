import type { Services } from '../services';
import { getCatalog } from '../data/catalogs';
import { getItem } from '../data/items';
import { getActivity, getOffMapPlace, type ActivityDef } from '../data/activities';
import type { TransitStop } from '../data/transit';
import { consume, euros, payFare, purchase, spend } from '../systems/Commerce';
import { blocker, perform, type ActivityContext } from '../systems/Activities';
import { destinationsFrom, type Destination } from '../systems/Transit';
import { formatClock } from '../systems/TimeSystem';
import type { MenuOption } from '../ui/Menu';

/** Lo que Menus necesita de la Scene: guardar y viajar a una estación. */
export interface MenuHost {
  persist(): void;
  /** Llega en tren a esa localización (andén, spawn 'train'). */
  arriveByTrain(locationId: string): void;
  /** Funde a negro al irse a un sitio sin mapa. */
  fadeOut(): void;
}

/**
 * Las interacciones que se eligen en un menú: comprar (cualquier catálogo),
 * usar algo de la bolsa, elegir destino en el tren y estar en un sitio sin
 * mapa. Toda la lógica es de los sistemas (Commerce, Activities, Transit);
 * aquí sólo se enseñan las opciones, se aplica el resultado al estado y se
 * adelanta el reloj. Así la Scene coordina y no acumula.
 */
export class Menus {
  private readonly services: Services;
  private readonly host: MenuHost;

  constructor(services: Services, host: MenuHost) {
    this.services = services;
    this.host = host;
  }

  // ------------------------------------------------------------- comprar

  /** Máquina, barra o taquilla: el catálogo dice qué hay; Commerce, si se puede. */
  openCatalog(title: string, catalogId: string, note = '', selected = 0, onClose?: () => void): void {
    const { state, menu } = this.services;
    const catalog = getCatalog(catalogId);
    const wallet = state.wallet;
    const options: MenuOption[] = catalog.products.map((p) => {
      const trial = purchase(wallet, p);
      return { label: p.label, detail: euros(p.price), disabled: trial.ok ? undefined : trial.message };
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
        const result = purchase(state.wallet, catalog.products[i]);
        if (result.ok) {
          state.wallet = result.wallet;
          this.host.persist();
        }
        this.openCatalog(title, catalogId, result.message, i, onClose);
      },
      onClose,
      note,
      selected,
    );
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
    const activities = place.activities.map(getActivity);
    const ret = destinationsFrom(stop).find((d) => d.stop.id === back.id)!;
    const ctx = (): ActivityContext => this.activityContext();
    const returnFare = payFare(state.wallet, ret.line.card, ret.fare);
    const options: MenuOption[] = [
      ...activities.map((a) => ({
        label: a.name,
        detail: a.effects.money ? `+${euros(a.effects.money)}` : '',
        disabled: blocker(a, ctx()) ?? undefined,
      })),
      { label: 'Recargar la tarjeta', detail: 'máquina' },
      { label: `Volver en metro a ${back.name}`, detail: `${ret.minutes} min · ${euros(ret.fare)}`, disabled: returnFare.ok ? undefined : returnFare.message },
    ];
    const again = (n = ''): void => this.offMap(stop, back, n);
    menu.open(place.name, `${place.arrival} ${formatClock(state.day, state.hour, state.minute)}.`, options, (i) => {
      if (i < activities.length) {
        this.run(place.name, activities[i], () => again());
        return;
      }
      if (i === activities.length) {
        this.openCatalog('Máquina de billetes', 'transport-machine', '', 0, () => again());
        return;
      }
      const paid = payFare(state.wallet, ret.line.card, ret.fare);
      if (!paid.ok) return again(paid.message);
      menu.close();
      state.wallet = paid.wallet;
      const { day, hour, minute, money, energy } = state;
      metroEvents.onRide({ day, hour, minute, money, energy, to: back.station! });
      clock.advanceMinutes(ret.minutes);
      this.host.arriveByTrain(back.station!);
    }, () => again(), note);
  }

  // ---------------------------------------------------------- actividades

  private activityContext(): ActivityContext {
    const { state } = this.services;
    return { day: state.day, hour: state.hour, minute: state.minute, money: state.money, energy: state.energy, inventory: state.wallet.inventory };
  }

  /**
   * Un sitio de un interior con algo que hacer (la cama, la cocina, una mesa):
   * sus actividades, con lo que falta para cada una si no se puede ahora.
   */
  openSpot(name: string, activityIds: readonly string[], note = ''): void {
    const { menu } = this.services;
    const activities = activityIds.map(getActivity);
    const ctx = this.activityContext();
    const options: MenuOption[] = activities.map((a) => ({
      label: a.name,
      detail: a.cost ? euros(a.cost) : a.consumes ? 'gasta la compra' : '',
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
    state.money += out.money;
    state.energy += out.energy;
    if (out.consumes) state.wallet = spend(state.wallet, out.consumes.item, out.consumes.qty);
    clock.advanceMinutes(out.minutes);
    this.host.persist();
    dialogue.start(title, [...out.lines, `${formatClock(state.day, state.hour, state.minute)}.`]);
    if (after) dialogue.once('close', after);
  }
}
