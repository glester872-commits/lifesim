import type { Walker } from '../systems/StreetLife';
import type { Agent } from '../systems/Crowd';
import { IDENTITIES, namedPerson, namedRelation, relationsOf } from '../systems/People';
import { NAMED_RELATIONSHIPS } from '../data/namedPeople';
import { getNpc } from '../data/npcs';
import { zoneAt, type ZoneClock } from '../systems/Zones';
import type { TilePoint } from '../types/game';
import type { WatchEntry } from '../systems/Recovery';

/** Atascos (systems/Recovery): cuántos hay en la escena y el estado de recuperación de cada agente. */
export interface RecoveryView {
  stuck: number;
  entry: (a: Agent) => WatchEntry | undefined;
}

/**
 * Inspector de gente, sólo con el modo depuración (config/debug.ts, F3 en
 * desarrollo): la persona más cercana al jugador con su identidad, lo que
 * hace, dónde, su horario y sus relaciones. Aquí sí salen los datos privados
 * (orientación, si es trans): en el juego normal no aparecen nunca.
 */
export interface NamedNearby {
  id: string;
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

  update(player: TilePoint, location: string, clock: ZoneClock, agents: readonly Agent[], recovery: RecoveryView, named: readonly NamedNearby[]): void {
    const d = (x: number, y: number): number => Math.hypot(x - player.tx, y - player.ty);
    const agent = [...agents].sort((a, b) => d(a.x, a.y) - d(b.x, b.y))[0];
    const person = [...named].sort((a, b) => d(a.tx, a.ty) - d(b.tx, b.ty))[0];
    let text = 'INSPECTOR · nadie cerca';
    if (person && d(person.tx, person.ty) < 4 && (!agent || d(person.tx, person.ty) <= d(agent.x, agent.y))) {
      text = this.describeNamed(person, location);
    } else if (agent && d(agent.x, agent.y) < 4) text = this.describe(agent as Walker, location, clock);
    // Atascos: el total de la escena y, de quien se inspecciona, a dónde va, cuánto lleva parado y en qué peldaño.
    const rec = agent && d(agent.x, agent.y) < 4 && !text.includes('personaje con nombre') ? agent : undefined;
    const goal = rec ? (rec.resume ?? rec.path[rec.path.length - 1]) : undefined;
    const e = rec ? recovery.entry(rec) : undefined;
    text += `
atascados en escena: ${recovery.stuck}`;
    if (rec) text += `
destino: ${goal ? `${goal.tx},${goal.ty}` : '—'} · parado ${((e?.stall ?? 0) / 1000).toFixed(1)} s · peldaño ${e?.level ?? 0}${e?.forced ? ' (forzado)' : ''}`;
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

  /** Un personaje con nombre: su identidad escrita a mano (data/namedPeople.ts), dónde está y su gente. */
  private describeNamed(person: NamedNearby, location: string): string {
    const p = namedPerson(person.id);
    const lines = [`INSPECTOR · ${person.name} (${person.id}) · personaje con nombre`];
    if (p) {
      lines.push(
        `${p.age} años · ${p.pronouns} · ${p.from}`,
        `género: ${p.gender}${p.trans ? ' · trans' : ''} · presenta ${p.presentation}`,
        `[privado] orientación: ${p.orientation}`,
        `estilo: ${p.fashion} · ${p.temperament}`,
        `intereses: ${p.interests.join(', ')}`,
        `trabajo: ${p.work}`,
      );
    }
    lines.push(`zona: ${zoneAt(location, person.tx, person.ty)?.name ?? '—'}`);
    const rel = NAMED_RELATIONSHIPS.filter((r) => r.a === person.id || r.b === person.id).map((r) => {
      const id = r.a === person.id ? r.b : r.a;
      const kind = namedRelation(person.id, id);
      return `${kind === 'strangers' ? 'crush (hacia esta persona)' : kind}: ${getNpc(id).name}`;
    });
    lines.push(`relaciones: ${rel.length ? rel.join(' · ') : 'ninguna'}`);
    return lines.join('\n');
  }

  destroy(): void {
    this.panel.remove();
  }
}
