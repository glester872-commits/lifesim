import type { LocationDef } from '../types/game.ts';
import { PALETTE } from '../config/constants.ts';
import { LINES, STOPS, stationLine } from './transit.ts';

/**
 * MET-04: señalética de los andenes, derivada del LocationDef (sus postes `sign`, sus `line-map` y sus portales
 * reales) y de STOPS. Nada escrito a mano por estación y nada se guarda: sale igual en cada carga.
 */

export type SignType = 'salida' | 'anden' | 'correspondencia' | 'plano';
export type Arrow = 'up' | 'down' | 'left' | 'right';

export interface StationSignage {
  stationId: string;
  /** `<kind>-<tx>-<ty>` del prop que la lleva. */
  signId: string;
  type: SignType;
  /** Lo que se escribe en el panel (fuente 5×7): «L2»/«L3» en correspondencia; '' si sólo hay pictograma. */
  text: string;
  position: { tx: number; ty: number };
  /** Portal del andén (`exit`, `board`, `transfer`) o, en un plano, la línea (LINES). */
  targetId: string;
  /** Hacia el portal; los planos no llevan. */
  arrow?: Arrow;
}

/** Un dibujo de poste (world/TextureFactory: `prop-sign-<índice + 1>`; la 0 es el poste de siempre). */
export interface SignFace {
  type: Exclude<SignType, 'plano'>;
  arrow: Arrow;
  /** Color del panel y texto: la línea del andén (andén) o la del otro andén (correspondencia). Salida: verde, sin línea. */
  line: string | null;
}

/**
 * Fondo de panel por tipo (world/TextureFactory.drawSignFace). Salida, verde de convención; correspondencia, blanco con
 * marco y texto del color de la línea destino, para no confundirse con la salida ni con la placa. El andén va del color
 * de su línea (no está aquí: sale de world/tiles).
 */
export const SIGN_BACKGROUND = { salida: PALETTE.leaf, correspondencia: PALETTE.white } as const;

const ARROWS: readonly Arrow[] = ['up', 'down', 'left', 'right'];

export const SIGN_FACES: readonly SignFace[] = [
  ...ARROWS.map((arrow): SignFace => ({ type: 'salida', arrow, line: null })),
  ...(['anden', 'correspondencia'] as const).flatMap((type) =>
    LINES.flatMap((l) => ARROWS.map((arrow): SignFace => ({ type, arrow, line: l.id })))),
];

/** Un plano por andén (`prop-line-map-<índice + 1>`; la 0 es el de siempre): las paradas de su línea en orden. */
export interface LineMapFace {
  station: string;
  line: string;
  stops: readonly { id: string; hub: boolean }[];
  /** Índice de la parada del andén en `stops`. */
  current: number;
}

export const LINE_MAPS: readonly LineMapFace[] = STOPS.filter((s) => s.station).map((s) => {
  const stops = STOPS.filter((o) => o.line === s.line).sort((a, b) => a.order - b.order);
  return { station: s.station as string, line: s.line, stops: stops.map((o) => ({ id: o.id, hub: !!o.hub })), current: stops.indexOf(s) };
});

/** Flecha por el eje dominante del vector señal→destino (empate: horizontal). */
export function arrowTo(from: { tx: number; ty: number }, to: { tx: number; ty: number }): Arrow {
  const dx = to.tx - from.tx;
  const dy = to.ty - from.ty;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}

export function stationSigns(loc: LocationDef): StationSignage[] {
  const stop = STOPS.find((s) => s.station === loc.id);
  if (!loc.metro || !stop) return [];
  const portals = loc.portals ?? [];
  const portal = (id: string) => portals.find((p) => p.id === id);
  // Por encima de los tornos es el andén (se busca la salida); por debajo, el vestíbulo (el otro andén o el tren).
  const gateRow = Math.min(...loc.metro.gates.map((g) => g.ty));
  const out: StationSignage[] = [];
  for (const p of loc.props ?? []) {
    const position = { tx: p.tx, ty: p.ty };
    const signId = `${p.kind}-${p.tx}-${p.ty}`;
    if (p.kind === 'line-map') out.push({ stationId: loc.id, signId, type: 'plano', text: '', position, targetId: stop.line });
    if (p.kind !== 'sign') continue;
    const target = p.ty < gateRow ? portal('exit') : (portal('transfer') ?? portal('board'));
    if (!target) continue;
    const type: SignType = target.id === 'exit' ? 'salida' : target.id === 'transfer' ? 'correspondencia' : 'anden';
    const text = type === 'correspondencia' ? stationLine(target.to?.location ?? '').id : '';
    out.push({ stationId: loc.id, signId, type, text, position, targetId: target.id, arrow: arrowTo(position, target) });
  }
  return out;
}

/** Índice de textura de la señal: en `prop-line-map-*` si es plano, en `prop-sign-*` si no. */
export function signVariant(s: StationSignage): number {
  if (s.type === 'plano') {
    const i = LINE_MAPS.findIndex((m) => m.station === s.stationId);
    if (i < 0) throw new Error(`${s.stationId}: plano sin parada en STOPS`);
    return i + 1;
  }
  const line = s.type === 'salida' ? null : s.type === 'correspondencia' ? s.text : stationLine(s.stationId).id;
  const i = SIGN_FACES.findIndex((f) => f.type === s.type && f.arrow === s.arrow && f.line === line);
  if (i < 0) throw new Error(`${s.signId} en ${s.stationId}: sin dibujo para ${s.type}/${s.arrow}/${line}`);
  return i + 1;
}

/** El LocationDef con la variante de cada poste y plano puesta según su señal; lo demás, igual. */
export function withSignage(loc: LocationDef): LocationDef {
  const signs = stationSigns(loc);
  if (signs.length === 0) return loc;
  return {
    ...loc,
    props: (loc.props ?? []).map((p) => {
      const s = signs.find((x) => x.signId === `${p.kind}-${p.tx}-${p.ty}`);
      return s ? { ...p, variant: signVariant(s) } : p;
    }),
  };
}
