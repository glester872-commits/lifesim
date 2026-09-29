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
import { getOffer, type OfferId } from '../data/services';
import { HAIRSTYLES } from '../data/appearance';
import { haircut, sleeveOf, tattoo, visibleTattoos, withAppearance } from '../systems/Appearance';
import { buyGarment, stockOf, takeOff, wear } from '../systems/Retail';
import { getGarment, getStore } from '../data/retail';
import { getDesign, getZone, STYLE_NAMES, TATTOO_DESIGNS, TATTOO_ZONES, type TattooZone } from '../data/tattoos';
import { PLAYER_COLORS } from '../world/TextureFactory';
import type { MenuItem, ServiceMenu } from '../data/menus';

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
        state.wallet = result.wallet;
        state.wardrobe = result.wardrobe;
        state.setAppearance('player', result.appearance);
        clock.advanceMinutes(minutes);
        this.host.persist();
      }
      this.openStore(storeId, who, minutes, result.message, i);
    }, undefined, note, selected);
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
      detail: current[g.slot] === g.id ? 'puesta' : g.slot === 'top' ? 'arriba' : 'abajo',
      disabled: current[g.slot] === g.id ? 'Ya la llevas puesta.' : undefined,
    }));
    options.push(
      { label: 'Lo de siempre arriba', detail: current.top ? '' : 'puesto', disabled: current.top ? undefined : 'Ya lo llevas.' },
      { label: 'Lo de siempre abajo', detail: current.bottom ? '' : 'puesto', disabled: current.bottom ? undefined : 'Ya lo llevas.' },
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
      const next = i < owned.length ? wear(current, owned[i].id) : takeOff(current, i === owned.length ? 'top' : 'bottom');
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
      state.wallet = result.wallet;
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
   * Pedir sentado a una mesa con servicio (systems/TableService): primero de
   * comer y luego de beber, con su precio, sólo lo que se sirve a esta hora y
   * sin pasar de lo que se lleva encima. Se abre en vivo: el local sigue
   * mientras se elige. Esc, o no pedir nada, es «todavía no».
   */
  openOrder(menu: ServiceMenu, items: readonly MenuItem[], waiter: string, onDone: (picked: MenuItem[]) => void): void {
    const { state } = this.services;
    const course = (kind: MenuItem['kind'], picked: MenuItem[], title: string, none: string, next: (picked: MenuItem[]) => void): void => {
      const list = items.filter((i) => i.kind === kind);
      const spent = picked.reduce((sum, i) => sum + i.price, 0);
      const options: MenuOption[] = list.map((i) => ({
        label: i.name,
        detail: euros(i.price),
        disabled: spent + i.price > state.money ? `No te llega: llevas ${euros(state.money)}.` : undefined,
      }));
      options.push({ label: none });
      this.services.menu.open(
        `${menu.title} · ${title}`,
        `${waiter} espera con la libreta.${spent > 0 ? ` Llevas pedido ${euros(spent)}.` : ''}`,
        options,
        (i) => next(i < list.length ? [...picked, list[i]] : picked),
        () => {
          this.services.menu.close();
          onDone([]);
        },
        '',
        0,
        true,
      );
    };
    course('food', [], 'de comer', 'Nada de comer', (picked) =>
      course('drink', picked, 'de beber', picked.length > 0 ? 'Nada de beber' : 'Nada, todavía no', (all) => {
        this.services.menu.close();
        onDone(all);
      }),
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
