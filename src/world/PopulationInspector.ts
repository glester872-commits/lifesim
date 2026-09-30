import type { Walker } from '../systems/StreetLife';
import type { Agent } from '../systems/Crowd';
import { IDENTITIES, relationsOf } from '../systems/People';
import { zoneAt, type ZoneClock } from '../systems/Zones';
import type { TilePoint } from '../types/game';

/**
 * Inspector de gente, sólo con el modo depuración (config/debug.ts, F3 en
 * desarrollo): la persona más cercana al jugador con su identidad, lo que
 * hace, dónde, su horario y sus relaciones. Aquí sí salen los datos privados
 * (orientación, si es trans): en el juego normal no aparecen nunca.
 */
export interface NamedNearby {
  name: string;
  tx: number;
  ty: number;
}

const CATEGORY = (a: Agent): string =>
  a.kind === 'staff' || a.staffRole || a.uniform ? 'personal de un local' : IDENTITIES[a.look]?.resident === false ? 'visitante' : 'vecino/a';

export class PopulationInspector {
  private readonly panel: HTMLElement;
  private last = '';

  constructor() {
    this.panel = document.createElement('pre');
    this.panel.style.cssText = 'position:fixed;right:8px;bottom:8px;margin:0;padding:6px 8px;max-width:340px;background:#000c;color:#fff;font:11px monospace;z-index:50;pointer-events:none;white-space:pre-wrap';
    document.body.appendChild(this.panel);
  }

  update(player: TilePoint, location: string, clock: ZoneClock, agents: readonly Agent[], named: readonly NamedNearby[]): void {
    const d = (x: number, y: number): number => Math.hypot(x - player.tx, y - player.ty);
    const agent = [...agents].sort((a, b) => d(a.x, a.y) - d(b.x, b.y))[0];
    const person = [...named].sort((a, b) => d(a.tx, a.ty) - d(b.tx, b.ty))[0];
    let text = 'INSPECTOR · nadie cerca';
    if (person && d(person.tx, person.ty) < 4 && (!agent || d(person.tx, person.ty) <= d(agent.x, agent.y))) {
      text = `INSPECTOR · ${person.name}\npersonaje con nombre: identidad y rutina propias (data/characters.ts)\nzona: ${zoneAt(location, person.tx, person.ty)?.name ?? '—'}`;
    } else if (agent && d(agent.x, agent.y) < 4) text = this.describe(agent as Walker, location, clock);
    if (text !== this.last) this.panel.textContent = this.last = text;
  }

  private describe(a: Walker, location: string, clock: ZoneClock): string {
    const p = a.uniform || a.staffRole ? undefined : IDENTITIES[a.look];
    const zone = zoneAt(location, a.x, a.y);
    const lines = [`INSPECTOR · agente #${a.id} · ${CATEGORY(a)}`];
    if (p) {
      lines.push(
        `${p.name} (${p.id}) · ${p.age} años · ${p.pronouns}`,
        `género: ${p.gender}${p.trans ? ' · trans' : ''} · presenta ${p.presentation}`,
        `[privado] orientación: ${p.orientation}`,
        `cuerpo: ${p.build}, ${p.height}, ${p.posture}${p.cane ? ', bastón' : ''} · paso ${p.gait}`,
        `estilo: ${p.fashion} · renta ${p.income} · ${p.temperament} · social ${p.sociability.toFixed(2)}`,
        `intereses: ${p.interests.join(', ')}`,
        `trabajo: ${p.work ?? (p.resident ? 'fuera del barrio' : '—')}`,
      );
    }
    const rule = a.rule;
    lines.push(`actividad: ${a.label || a.role} · ${a.state}${a.moving ? ' (andando)' : ''}`);
    lines.push(`zona: ${zone ? `${zone.name} (${zone.type})` : '—'} · ${clock.hour}:${String(clock.minute).padStart(2, '0')}`);
    if (rule) lines.push(`horario: ${rule.hours ? `${rule.hours[0]}–${rule.hours[1]} h` : 'todo el día'}${rule.days ? ` · ${rule.days}` : ''}${rule.stay ? ` · se queda ${rule.stay[0]}–${rule.stay[1]} min` : ''}`);
    if (a.leader) {
      const lead = IDENTITIES[a.leader.look];
      lines.push(`grupo: ${a.bond ?? 'sin relación'} · con ${lead?.name ?? '—'}${a.tie ? ` (${a.tie})` : ''}`);
    } else if (a.bond) lines.push(`grupo: lleva un grupo de ${a.bond}`);
    if (p) {
      const rel = relationsOf(p.index).map((r) => `${r.type}: ${IDENTITIES[r.a === p.index ? r.b : r.a].name}${r.type === 'crush' && r.a !== p.index ? ' (hacia esta persona)' : ''}`);
      lines.push(`relaciones: ${rel.length ? rel.join(' · ') : 'ninguna'}`);
    }
    return lines.join('\n');
  }

  destroy(): void {
    this.panel.remove();
  }
}
