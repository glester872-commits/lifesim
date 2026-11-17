// DEC-05 · Diálogos por sección en Decathlon: banco completo, sin mezclas, sin repetir y sin prometer lo que no existe.
import { LINE_SECTIONS, SECTION_LINES, VOICED_SECTIONS, type HourBand, type LineKind, type LineSection, type StaffState } from '../src/data/sectionLines.ts';
import { line, sectionOfRole, tipFor } from '../src/systems/StoreKnowledge.ts';
import { getOffer, type OfferId } from '../src/data/services.ts';
import { DECATHLON_PROFILE, SECTORS } from '../src/data/decathlon.ts';
import { STORE_CATEGORIES } from '../src/data/storeQueries.ts';

const fails: string[] = [];
const fail = (m: string): void => { fails.push(m); };
const STATES: readonly StaffState[] = ['disponible', 'reponiendo', 'desplazandose', 'atendiendo'];
const BANDS: readonly [HourBand, number][] = [['manana', 10], ['tarde', 16], ['cierre', 20]];
const clockAt = (hour: number, day = 3) => ({ day, hour, minute: 0 });

// Entradas: ids únicos, ≥2 variaciones no vacías y sin huecos.
const ids = new Set<string>();
for (const e of SECTION_LINES) {
  if (ids.has(e.id)) fail(`id repetido: ${e.id}`);
  ids.add(e.id);
  if (e.variations.length < 2) fail(`${e.id}: menos de 2 variaciones`);
  for (const v of e.variations) {
    if (!v.trim()) fail(`${e.id}: variación vacía`);
    if (v.includes('{')) fail(`${e.id}: hueco sin rellenar «${v}»`);
    if (/\btallas?\b/i.test(v)) fail(`${e.id}: menciona tallas «${v}»`);
    // Servicios que Decathlon no tiene (taller, reparaciones, planes, reservas, encargos) ni precios ni tallas.
    for (const re of [/taller/i, /repar/i, /pinchaz/i, /talla/i, /€/, /precio/i, /rutina/i, /encarg/i, /reserv/i])
      if (re.test(v)) fail(`${e.id}: raíz prohibida ${re} en «${v}»`);
    if (/€|\beuros?\b/i.test(v)) fail(`${e.id}: menciona precios «${v}»`);
    if (/\b(nike|adidas|puma|asics|salomon|quechua|kalenji|btwin|domyos|kipsta|nabaiji|tribord|forclaz|rockrider|reebok|new balance)\b/i.test(v)) fail(`${e.id}: marca que no es Trazo/Ondra «${v}»`);
  }
}

// Ningún texto en dos secciones.
const owner = new Map<string, LineSection>();
for (const e of SECTION_LINES) for (const v of e.variations) {
  const o = owner.get(v);
  if (o && o !== e.section) fail(`«${v}» está en ${o} y en ${e.section}`);
  owner.set(v, e.section);
}
const inSection = (text: string, section: LineSection, kind: LineKind): boolean =>
  SECTION_LINES.some((e) => (e.section === section || e.section === 'general') && e.kind === kind && e.variations.includes(text));

// Secciones con voz: saludo y despedida propios.
for (const s of VOICED_SECTIONS) for (const kind of ['greeting', 'farewell'] as const)
  if (!SECTION_LINES.some((e) => e.section === s && e.kind === kind)) fail(`${s}: sin ${kind}`);

// Cada sección × tipo × estado × franja: frase de esa sección (o de general), nunca muda.
const samples: string[] = [];
for (const s of LINE_SECTIONS) for (const kind of ['greeting', 'farewell'] as const) for (const st of STATES) for (const [band, hour] of BANDS) {
  const text = line(s, kind, { staffKey: `chk-${s}`, state: st, clock: clockAt(hour) });
  if (!text) fail(`${s}/${kind}/${st}/${band}: sin frase`);
  else if (!inSection(text, s, kind)) fail(`${s}/${kind}/${st}/${band}: mezcla «${text}»`);
  else if (kind === 'greeting' && (st === 'disponible' || st === 'desplazandose' || (s === 'cajas' && st === 'atendiendo') || (s === 'general' && st === 'reponiendo')))
    samples.push(`${s} | ${st} | ${kind} | ${band} | ${text}`);
}

// Las franjas cambian el saludo en alguna sección.
const pool = (s: LineSection, hour: number): Set<string> => {
  const out = new Set<string>();
  for (let d = 0; d < 12; d++) out.add(line(s, 'greeting', { staffKey: `franja-${s}-${d}`, clock: clockAt(hour, d) }) ?? '');
  return out;
};
if (!(['running', 'ciclismo', 'fitness', 'montana', 'general'] as const).some((s) => [...pool(s, 10)].every((t) => !pool(s, 20).has(t)))) fail('las franjas no cambian el saludo');

// Estados: desplazándose y atendiendo tienen frase propia.
for (const s of ['running', 'ciclismo', 'fitness', 'montana', 'general'] as const) {
  const t = line(s, 'greeting', { staffKey: `paso-${s}`, state: 'desplazandose', clock: clockAt(10) }) ?? '';
  if (!SECTION_LINES.some((e) => e.section === s && e.state === 'desplazandose' && e.variations.includes(t))) fail(`${s}: no saluda de camino`);
}
const busy = line('cajas', 'greeting', { staffKey: 'caja-x', state: 'atendiendo', clock: clockAt(20) }) ?? '';
if (!SECTION_LINES.some((e) => e.section === 'cajas' && e.state === 'atendiendo' && e.variations.includes(busy))) fail('cajas: no dice que está atendiendo');

// Consejo: cada pregunta de las secciones de Decathlon con variantes de su sección.
const ADVICE: readonly OfferId[] = ['decathlon-montana', 'decathlon-running', 'decathlon-ciclismo', 'decathlon-fitness'];
for (const id of ADVICE) {
  const offer = getOffer(id);
  if (offer.kind !== 'advice') { fail(`${id}: no es advice`); continue; }
  const role = DECATHLON_PROFILE.staff.find((r) => r.offers === id);
  const section = sectionOfRole(role);
  if (section === 'general') fail(`${id}: su colaborador no tiene sección`);
  for (const q of offer.questions) {
    if (!q.id) { fail(`${id}: «${q.question}» sin id`); continue; }
    if (!SECTION_LINES.some((e) => e.kind === 'advice' && e.ref === q.id && e.section === section)) fail(`${q.id}: sin variantes en ${section}`);
    const t = line(section, 'advice', { staffKey: `adv-${section}`, ref: q.id, clock: clockAt(10) });
    if (!t || !SECTION_LINES.some((e) => e.section === section && e.ref === q.id && e.variations.includes(t))) fail(`${q.id}: consejo mezclado o mudo`);
    else samples.push(`${section} | disponible | advice | manana | ${t}`);
  }
}

// Coletillas: sus secciones existen en el plano y salen al preguntar por ellas.
for (const e of SECTION_LINES.filter((x) => x.kind === 'tip'))
  if (!SECTORS.some((s) => s.id === e.section || s.family === e.section)) fail(`${e.id}: «${e.section}» no está en SECTORS`);
const queries = STORE_CATEGORIES.flatMap((c) => c.queries);
// Toda coletilla del banco tiene que salir en alguna pregunta (sin datos muertos).
for (const s of [...new Set(SECTION_LINES.filter((e) => e.kind === 'tip').map((e) => e.section))]) {
  const asked = queries.filter((q) => (q.kind === 'fitting' && s === 'probadores') || q.kind === 'department');
  const hit = asked.map((q) => tipFor(q, `tip-${s}`, clockAt(10))).find((t) => t !== undefined && SECTION_LINES.some((e) => e.section === s && e.kind === 'tip' && e.variations.includes(t)));
  if (!hit) fail(`${s}: su coletilla no sale al preguntar por ella`);
  else samples.push(`${s} | — | tip | manana | ${hit}`);
}

// Anti-repetición: 6 seguidas del mismo colaborador nunca repiten la inmediata anterior.
for (const s of LINE_SECTIONS) for (const kind of ['greeting', 'farewell'] as const) {
  let prev = '';
  for (let k = 0; k < 6; k++) {
    const t = line(s, kind, { staffKey: `rep-${s}-${kind}`, clock: clockAt(10) }) ?? '';
    if (t === prev) fail(`${s}/${kind}: repite «${t}»`);
    prev = t;
  }
}

// Rol → sección: cada colaborador de Decathlon habla por la suya.
for (const r of DECATHLON_PROFILE.staff) {
  const s = sectionOfRole(r);
  if (r.service === 'cashier' && s !== 'cajas') fail(`${r.label}: cajero sin sección cajas`);
  if ((r.label ?? '').startsWith('Sección de ') && s === 'general') fail(`${r.label}: sin sección`);
}

const count = new Map<string, number>();
for (const e of SECTION_LINES) count.set(e.section, (count.get(e.section) ?? 0) + e.variations.length);
console.log('Frases por sección:', [...count].map(([s, n]) => `${s} ${n}`).join(', '));
console.log('Muestra (sección | estado | tipo | franja | frase):');
for (const s of samples.filter((_, i) => i % 3 === 0)) console.log(`  ${s}`);
if (fails.length > 0) {
  console.error(`check-section-lines: ${fails.length} fallos`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('check-section-lines: OK');
