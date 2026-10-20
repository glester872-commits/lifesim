// Sin Phaser: lo usan main.ts, state/GameState.ts y scripts/check-economy.ts y check-save-torture.ts.
import { INITIAL_CLOCK, INITIAL_ENERGY, INITIAL_MONEY, SAVE_KEY, SAVE_VERSION, TILE } from '../config/constants.ts';
import type { EventMemory, Facing, GameStateData, SaveFile } from '../types/game.ts';
import { emptyMemory } from './MetroEventManager.ts';
import { HAIR_IDS, type Appearance, type HairStyle, type TattooMark } from '../data/appearance.ts';
import { GARMENT_IDS, getGarment } from '../data/retail.ts';
import { DESIGN_IDS, ZONE_IDS } from '../data/tattoos.ts';
import { parseFitness, START_FITNESS } from './Fitness.ts';
import { LOCATIONS, START_LOCATION, START_SPAWN } from '../data/locations.ts';
import { getLocation, hasLocation, safePosition } from './LocationSystem.ts';
import { mayStay, parseTickets, venueOf } from './Tickets.ts';
import { parseSocialState } from './Social.ts';
import { parseStories } from './Story.ts';
import { createPhone, parsePhone } from './Phone.ts';
import { parseJob } from './Jobs.ts';
import { parseHousehold, parseLedger, startHousehold } from './Household.ts';
import { emptyStudy, parseStudy } from './Study.ts';
import { parseAgenda, startAgenda } from './Agenda.ts';
import { homeDoor, installAll, parseHousing, reaches, startHousing } from './Housing.ts';

/**
 * Qué se guarda y qué no (política de lo pasajero). Se guarda lo que es del
 * jugador: dinero, energía, reloj, dónde está, objetos, tarjetas, aspecto,
 * ropa, forma física y la memoria de lo que ha vivido en el metro (incluidas
 * las personas que ha conocido y lo que eligió).
 *
 * NO se guarda, a propósito, y al cargar empieza limpio: los sucesos en curso
 * (peleas de patio, trapicheo, carteristas: sus enfriamientos son de la sesión),
 * la gente de los locales y de la calle (sale del reloj y de su semilla), los
 * vigilantes que acudían, las charlas abiertas, los retrasos de los personajes
 * con nombre por pararse a hablar (vuelven a su horario) y el tiempo, que sale
 * del día. Sólo se carga al arrancar, así que nada de eso puede quedar a medias.
 */

/** Partida nueva: en el portal de casa, a la hora de empezar. */
export function createInitialState(): GameStateData {
  const start = LOCATIONS.find((loc) => loc.id === START_LOCATION);
  if (!start) throw new Error(`Localizacion inicial desconocida: ${START_LOCATION}`);
  const spawn = start.spawns[START_SPAWN];
  if (!spawn) throw new Error(`Spawn inicial desconocido: ${START_SPAWN}`);

  return {
    money: INITIAL_MONEY,
    energy: INITIAL_ENERGY,
    day: INITIAL_CLOCK.day,
    hour: INITIAL_CLOCK.hour,
    minute: INITIAL_CLOCK.minute,
    locationId: start.id,
    position: { x: spawn.tx * TILE + TILE / 2, y: spawn.ty * TILE + TILE },
    facing: spawn.facing,
    events: emptyMemory(),
    // Se empieza sin tarjeta de transporte: se compra en la máquina del metro.
    inventory: {},
    cards: {},
    appearance: {},
    wardrobe: [],
    fitness: { ...START_FITNESS },
    // Una partida nueva todavía no conoce a nadie (systems/Social, Prompt 57).
    social: {},
    stories: {},
    phone: createPhone(),
    tickets: [],
    job: null,
    household: startHousehold(INITIAL_CLOCK.day),
    ledger: [],
    study: emptyStudy(),
    housing: startHousing(),
    agenda: startAgenda(),
  };
}

/**
 * De lo cargado (o de nada) a la partida con la que se arranca. Un sitio que ya
 * no existe (renombrado o quitado) manda al portal de casa, pero conserva todo
 * lo demás; una posición que ahora cae dentro de algo va al tile libre más
 * cercano (systems/LocationSystem.safePosition).
 */
export function restore(loaded: GameStateData | null): GameStateData {
  if (!loaded) return createInitialState();
  if (!hasLocation(loaded.locationId)) {
    const fresh = createInitialState();
    return { ...loaded, locationId: fresh.locationId, position: fresh.position, facing: fresh.facing };
  }
  // Dentro de un recinto con entrada (el estadio) sin derecho a estar (cerrado, partido acabado, sin entrada usada):
  // se aparece en su salida, a la calle. Nada más cambia: ni el dinero ni las entradas.
  const venue = venueOf(getLocation(loaded.locationId).venue);
  if (venue && !mayStay(venue, loaded.tickets ?? [], loaded)) {
    const spawn = getLocation(venue.exit.location).spawns[venue.exit.spawn];
    if (spawn) return { ...loaded, locationId: venue.exit.location, position: { x: spawn.tx * TILE + TILE / 2, y: spawn.ty * TILE + TILE }, facing: spawn.facing };
  }
  // Las mejoras instaladas cambian las colisiones: se ponen antes de mirar si la posición guardada sigue libre.
  const housing = loaded.housing ?? startHousing();
  installAll(housing);
  const here = getLocation(loaded.locationId);
  // Dentro de una vivienda que ya no es la tuya: «volver a casa» se resuelve por los datos (data/housing.ts), a la puerta de la que vives.
  if (here.home && here.home !== housing.home) {
    const door = homeDoor(housing);
    const spawn = getLocation(door.location).spawns[door.spawn];
    return { ...loaded, locationId: door.location, position: { x: spawn.tx * TILE + TILE / 2, y: spawn.ty * TILE + TILE }, facing: spawn.facing };
  }
  const position = safePosition(loaded.locationId, loaded.position, START_SPAWN);
  // Un interior con la posición en un rincón al que ya no se llega (un mueble nuevo la encierra): a la entrada.
  const entry = here.kind === 'interior' ? here.spawns.entry : undefined;
  if (entry && !reaches(here, { tx: entry.tx, ty: entry.ty }, { tx: Math.floor(position.x / TILE), ty: Math.floor((position.y - 1) / TILE) })) {
    return { ...loaded, position: { x: entry.tx * TILE + TILE / 2, y: entry.ty * TILE + TILE }, facing: entry.facing };
  }
  return { ...loaded, position };
}

/** Clave donde se aparta una partida que no se puede leer (rota o de una versión más nueva) antes de que el autoguardado la pise. */
export const UNREADABLE_KEY = `${SAVE_KEY}.unreadable`;

/**
 * Backend de persistencia.
 *
 * localStorage es la implementación actual.
 */
export interface SaveStorage {
  read(
    key: string,
  ): string | null;

  write(
    key: string,
    value: string,
  ): void;

  remove(
    key: string,
  ): void;
}

export class LocalStorageAdapter
  implements SaveStorage {
  read(
    key: string,
  ): string | null {
    try {
      return window.localStorage.getItem(
        key,
      );
    } catch {
      return null;
    }
  }

  write(
    key: string,
    value: string,
  ): void {
    try {
      window.localStorage.setItem(
        key,
        value,
      );
    } catch {
      /*
       * Modo privado o cuota llena:
       * la partida continúa aunque no persista.
       */
    }
  }

  remove(
    key: string,
  ): void {
    try {
      window.localStorage.removeItem(
        key,
      );
    } catch {
      // Ignorado.
    }
  }
}

const FACINGS =
  new Set<string>([
    'up',
    'down',
    'left',
    'right',
  ]);

function isNumber(
  value: unknown,
): value is number {
  return (
    typeof value ===
      'number' &&
    Number.isFinite(
      value,
    )
  );
}

const isRecord = (
  value: unknown,
): value is Record<
  string,
  unknown
> =>
  typeof value ===
    'object' &&
  value !== null &&
  !Array.isArray(
    value,
  );

// ================================================================
// EVENTOS
// ================================================================

/**
 * Memoria narrativa del metro.
 *
 * Una partida antigua que no la tenga empieza vacía.
 */
function parseEvents(
  value: unknown,
): EventMemory {
  const empty =
    emptyMemory();

  if (!isRecord(value)) {
    return empty;
  }

  return {
    rides:
      isNumber(
        value.rides,
      )
        ? value.rides
        : empty.rides,

    eventsSeen:
      isRecord(
        value.eventsSeen,
      )
        ? (
            value.eventsSeen as EventMemory['eventsSeen']
          )
        : {},

    choicesMade:
      Array.isArray(
        value.choicesMade,
      )
        ? (
            value.choicesMade as EventMemory['choicesMade']
          )
        : [],

    importantNPCsMet:
      isRecord(
        value.importantNPCsMet,
      )
        ? (
            value.importantNPCsMet as EventMemory['importantNPCsMet']
          )
        : {},

    eventFlags:
      isRecord(
        value.eventFlags,
      )
        ? (
            value.eventFlags as EventMemory['eventFlags']
          )
        : {},

    eventCooldowns:
      isRecord(
        value.eventCooldowns,
      )
        ? (
            value.eventCooldowns as EventMemory['eventCooldowns']
          )
        : {},

    scheduled:
      Array.isArray(
        value.scheduled,
      )
        ? (
            value.scheduled as EventMemory['scheduled']
          )
        : [],

    lastEventRide:
      isNumber(
        value.lastEventRide,
      )
        ? value.lastEventRide
        : empty.lastEventRide,

    lastNarrativeAt:
      isNumber(
        value.lastNarrativeAt,
      )
        ? value.lastNarrativeAt
        : empty.lastNarrativeAt,
  };
}

/**
 * Lo imprescindible es el dinero y el reloj: sin eso no es una partida. Lo
 * demás tiene un valor seguro si falta o viene mal (partidas antiguas o
 * tocadas a mano): energía acotada a 0–100, hora y minuto normalizados, sin
 * orientación mira abajo, sin sitio o sin posición va al portal de casa
 * (restore). Nada de eso tira la partida entera.
 */
function parseState(value: unknown): GameStateData | null {
  if (typeof value !== 'object' || value === null) return null;
  const s = value as Record<string, unknown>;
  const pos = isRecord(s.position) ? s.position : undefined;

  if (!isNumber(s.money) || !isNumber(s.day) || !isNumber(s.hour) || !isNumber(s.minute)) return null;

  // Reloj: un minuto absoluto válido (día ≥ 1, 00:00–23:59), aunque venga con 24:00 o minutos de más.
  const total = Math.max(0, Math.floor((Math.max(1, Math.floor(s.day)) - 1) * 1440 + Math.floor(s.hour) * 60 + Math.floor(s.minute)));
  const fresh = createInitialState();
  const located = typeof s.locationId === 'string' && pos && isNumber(pos.x) && isNumber(pos.y);

  return {
    money: s.money,
    energy: isNumber(s.energy) ? Math.min(100, Math.max(0, s.energy)) : INITIAL_ENERGY,
    day: Math.floor(total / 1440) + 1,
    hour: Math.floor((total % 1440) / 60),
    minute: total % 60,
    locationId: located ? (s.locationId as string) : fresh.locationId,
    position: located ? { x: pos.x as number, y: pos.y as number } : fresh.position,
    facing: typeof s.facing === 'string' && FACINGS.has(s.facing) ? (s.facing as Facing) : 'down',
    events: parseEvents(s.events),
    inventory: parseCounts(s.inventory),
    cards: parseCounts(s.cards),
    appearance: parseAppearance(s.appearance),
    wardrobe: Array.isArray(s.wardrobe) ? [...new Set(s.wardrobe.filter((g): g is string => typeof g === 'string' && GARMENT_IDS.has(g)))] : [],
    fitness: parseFitness(s.fitness),
    // Prompt 57: una partida anterior al sistema social carga sin nadie conocido (parseSocialState(undefined) = {}).
    social: parseSocialState(s.social),
    // Una partida anterior a las historias (systems/Story) carga sin ninguna.
    stories: parseStories(s.stories),
    // Una partida anterior al móvil carga con el móvil vacío.
    phone: parsePhone(s.phone),
    // Una partida anterior a las entradas del estadio carga sin ninguna.
    tickets: parseTickets(s.tickets),
    // Una partida anterior al empleo carga sin contrato; el turno suelto de Decathlon sigue abierto.
    job: parseJob(s.job),
    // Una partida anterior a los gastos de casa empieza sus periodos el día que se carga: nada de alquiler atrasado.
    household: parseHousehold(s.household, Math.floor(total / 1440) + 1),
    ledger: parseLedger(s.ledger),
    // Una partida anterior a los estudios carga sin curso ni habilidades.
    study: parseStudy(s.study),
    // Una partida anterior a las mejoras conserva su piso y sus cosas: sin cobrar ni quitar nada.
    housing: parseHousing(s.housing),
    // Una partida anterior a la agenda no ve la guía del principio ni avisos de lo que ya pasó.
    agenda: parseAgenda(s.agenda),
  };
}

// ================================================================
// APARIENCIA
// ================================================================

const garmentFor = (
  value: unknown,
  slot:
    | 'top'
    | 'bottom'
    | 'shoes',
): string | undefined =>
  typeof value ===
    'string' &&
  GARMENT_IDS.has(
    value,
  ) &&
  getGarment(
    value,
  ).slot === slot
    ? value
    : undefined;

/**
 * Apariencia persistente.
 */
function parseAppearance(
  value: unknown,
): Record<
  string,
  Appearance
> {
  if (!isRecord(value)) {
    return {};
  }

  const out:
    Record<
      string,
      Appearance
    > = {};

  for (
    const [
      id,
      a,
    ] of
    Object.entries(value)
  ) {
    if (!isRecord(a)) {
      continue;
    }

    const parsed:
      Appearance = {};

    if (
      typeof a.hair ===
        'string' &&
      HAIR_IDS.has(
        a.hair,
      )
    ) {
      parsed.hair =
        a.hair as HairStyle;
    }

    const top =
      garmentFor(
        a.top,
        'top',
      );

    const bottom =
      garmentFor(
        a.bottom,
        'bottom',
      );

    if (top) {
      parsed.top =
        top;
    }

    if (bottom) {
      parsed.bottom =
        bottom;
    }

    const shoes =
      garmentFor(
        a.shoes,
        'shoes',
      );

    if (shoes) {
      parsed.shoes =
        shoes;
    }

    const tattoos =
      Array.isArray(
        a.tattoos,
      )
        ? a.tattoos.filter(
            (
              t,
            ): t is TattooMark =>
              isRecord(t) &&
              typeof t.zone ===
                'string' &&
              ZONE_IDS.has(
                t.zone,
              ) &&
              typeof t.design ===
                'string' &&
              DESIGN_IDS.has(
                t.design,
              ),
          )
        : [];

    if (
      tattoos.length > 0
    ) {
      parsed.tattoos =
        tattoos.map(
          (t) => ({
            zone:
              t.zone,

            design:
              t.design,
          }),
        );
    }

    if (
      Object.keys(
        parsed,
      ).length > 0
    ) {
      out[id] =
        parsed;
    }
  }

  return out;
}

// ================================================================
// INVENTARIO / TARJETAS
// ================================================================

function parseCounts(
  value: unknown,
): Record<string, number> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(
      value,
    ).filter(
      (
        e,
      ): e is [
        string,
        number,
      ] =>
        isNumber(
          e[1],
        ) &&
        e[1] >= 0,
    ),
  );
}

// ================================================================
// SAVE SYSTEM
// ================================================================

export class SaveSystem {
  private readonly storage:
    SaveStorage;

  constructor(
    storage:
      SaveStorage =
      new LocalStorageAdapter(),
  ) {
    this.storage =
      storage;
  }

  save(
    state: GameStateData,
  ): boolean {
    const file:
      SaveFile = {
      version:
        SAVE_VERSION,

      savedAt:
        Date.now(),

      state,
    };

    try {
      this.storage.write(
        SAVE_KEY,
        JSON.stringify(
          file,
        ),
      );

      return true;
    } catch {
      return false;
    }
  }

  /**
   * La partida guardada, o null si no hay o no se puede leer. Sin número de
   * versión, o con uno anterior, se lee con los valores seguros de parseState
   * (hasta ahora sólo existe la 1: no hace falta migrar nada más). Una partida
   * rota o de una versión más nueva NO se pisa: se aparta a UNREADABLE_KEY
   * antes de que el autoguardado de la partida nueva la sobrescriba.
   */
  load(): GameStateData | null {
    const raw = this.storage.read(SAVE_KEY);
    if (!raw) return null;
    let state: GameStateData | null = null;
    try {
      const parsed: unknown = JSON.parse(raw);
      const file = isRecord(parsed) ? parsed : {};
      const version = file.version === undefined ? 1 : file.version;
      if (isNumber(version) && version <= SAVE_VERSION) state = parseState(file.state);
    } catch {
      state = null;
    }
    if (!state) this.storage.write(UNREADABLE_KEY, raw);
    return state;
  }

  clear(): void {
    this.storage.remove(
      SAVE_KEY,
    );
  }
}