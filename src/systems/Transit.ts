// Sin Phaser: lo usan WorldScene y scripts/check-economy.ts.
import { LINES, STOPS, TRANSFERS, type TransitLine, type TransitStop } from '../data/transit.ts';
import { getOffMapPlace } from '../data/activities.ts';
import { getLocation, hasLocation } from './LocationSystem.ts';

import { payFare, type Wallet } from './Commerce.ts';

/** Un destino desde una parada: a dónde, cuánto se tarda y cuánto cuesta. */
export interface Destination {
  stop: TransitStop;
  line: TransitLine;
  minutes: number;
  fare: number;
}

// Validado al arrancar: una parada lleva a una estación que existe o a un sitio sin mapa conocido.
for (const stop of STOPS) {
  if (!LINES.some((l) => l.id === stop.line)) throw new Error(`Parada ${stop.id}: línea desconocida ${stop.line}`);
  if (!!stop.station === !!stop.offMap) throw new Error(`Parada ${stop.id}: o estación o sitio sin mapa, no las dos`);
  if (stop.station && !hasLocation(stop.station)) throw new Error(`Parada ${stop.id}: estación desconocida ${stop.station}`);
  if (stop.offMap) getOffMapPlace(stop.offMap);
}

export function getStop(id: string): TransitStop {
  const stop = STOPS.find((s) => s.id === id);
  if (!stop) throw new Error(`Parada desconocida: ${id}`);
  return stop;
}

/** La parada cuyo andén es esta localización. */
export function stopAtStation(locationId: string): TransitStop | undefined {
  return STOPS.find((s) => s.station === locationId);
}

/** Todas las paradas de su línea menos ella misma, con minutos y tarifa. */
export function destinationsFrom(from: TransitStop): Destination[] {
  const line = LINES.find((l) => l.id === from.line)!;
  return STOPS.filter((s) => s.line === from.line && s.id !== from.id).map((stop) => ({
    stop,
    line,
    minutes: Math.abs(stop.order - from.order) * line.minutesPerStop,
    fare: line.fare,
  }));
}

/** Sólo el estado lógico de validación; el tren y sus puertas se reconstruyen localmente. */
export interface MetroJourney {
  version: 1;
  phase: 'platform';
  station: string;
}

export function parseMetroJourney(value: unknown, location: string): MetroJourney | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || v.phase !== 'platform' || v.station !== location || !stopAtStation(location)) return null;
  return { version: 1, phase: 'platform', station: location };
}

export function journeyFare(journey: MetroJourney | null, from: TransitStop, fare: number): number {
  return journey?.station === from.station ? 0 : fare;
}

export function transferFrom(location: string, to: string): { minutes: number } | undefined {
  return TRANSFERS.find(t => {
    const a = getStop(t.from).station;
    const b = getStop(t.to).station;
    return (a === location && b === to) || (a === to && b === location);
  });
}

/** Sin mapa no hay llegada: tampoco tarifa, minutos ni memoria de viaje. */
export function journeyAfterPortal(journey: MetroJourney | null, from: string, to: string): MetroJourney | null {
  return journey?.station === from && transferFrom(from, to) ? { ...journey, station: to } : null;
}

export function visitable(stop: TransitStop): boolean {
  if (!stop.station || !hasLocation(stop.station)) return false;
  const loc = getLocation(stop.station);
  return !!loc.metro && !!loc.spawns.train && loc.portals.some(p => !p.train && !p.offMap && hasLocation(p.to.location));
}

export function serviceOpen(line: TransitLine, hour: number): boolean {
  const [a, b] = line.hours;
  return b > a ? hour >= a && hour < b : hour >= a || hour < b;
}

/** Preparación sin efectos: se comprueban destino, horario y saldo antes de tocar el estado. */
export function prepareRide(wallet: Wallet, journey: MetroJourney | null, from: TransitStop, to: TransitStop, hour: number) {
  const d = destinationsFrom(from).find(d => d.stop.id === to.id);
  if (!d || !visitable(to)) return { ok: false as const, message: 'Esta estación aún no tiene mapa visitable.' };
  if (!serviceOpen(d.line, hour)) return { ok: false as const, message: 'Esta línea está fuera de servicio.' };
  const paid = payFare(wallet, d.line.card, journeyFare(journey, from, d.fare));
  if (!paid.ok) return { ok: false as const, message: paid.message };
  return { ok: true as const, wallet: paid.wallet, minutes: d.minutes, station: to.station!,
    journey: { version: 1, phase: 'platform', station: to.station! } satisfies MetroJourney };
}

export interface TransitLeg { mode: 'train' | 'transfer'; from: string; to: string; minutes: number; line?: string }
export interface TransitRoute { minutes: number; fare: number; legs: TransitLeg[] }

/** Grafo pequeño de andenes. Sólo ofrece recorridos que se pueden ejecutar mediante portales reales. */
export function routeBetween(from: string, to: string): TransitRoute | null {
  if (!STOPS.some(s => s.id === from && visitable(s)) || !STOPS.some(s => s.id === to && visitable(s))) return null;
  const queue: { id: string; minutes: number; legs: TransitLeg[] }[] = [{ id: from, minutes: 0, legs: [] }];
  const done = new Set<string>();
  while (queue.length) {
    queue.sort((a, b) => a.minutes - b.minutes);
    const cur = queue.shift()!;
    if (done.has(cur.id)) continue;
    if (cur.id === to) return { minutes: cur.minutes, fare: cur.legs.some(l => l.mode === 'train') ? LINES[0].fare : 0, legs: cur.legs };
    done.add(cur.id);
    const stop = getStop(cur.id);
    const edges: TransitLeg[] = destinationsFrom(stop).filter(d => visitable(d.stop)).map(d => ({ mode: 'train', from: cur.id, to: d.stop.id, minutes: d.minutes, line: d.line.id }));
    for (const t of TRANSFERS) {
      const next = t.from === cur.id ? t.to : t.to === cur.id ? t.from : null;
      if (next) edges.push({ mode: 'transfer', from: cur.id, to: next, minutes: t.minutes });
    }
    for (const leg of edges) if (!done.has(leg.to)) queue.push({ id: leg.to, minutes: cur.minutes + leg.minutes, legs: [...cur.legs, leg] });
  }
  return null;
}

// Correspondencias simétricas, con tiempo y spawns reales; sin enlaces de papel.
for (const t of TRANSFERS) {
  for (const [a, b] of [[t.from, t.to], [t.to, t.from]]) {
    const source = getLocation(getStop(a).station!);
    const target = getLocation(getStop(b).station!);
    const portal = source.portals.find(p => p.id === 'transfer' && p.to.location === target.id);
    if (!portal || portal.train || portal.minutes !== t.minutes || !target.spawns[portal.to.spawn]) throw new Error('Correspondencia sin pasillo: ' + a + ' → ' + b);
  }
}
