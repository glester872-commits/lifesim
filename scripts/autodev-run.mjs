#!/usr/bin/env node
// Instrumentación de /autodev (herramienta de desarrollo, no es código del juego: nada de src/ la importa).
// Lanza `claude -p "/autodev …" --output-format stream-json` y apunta en .autodev/runs.jsonl lo que la
// plataforma expone de verdad. No guarda prompts, salidas completas ni rutas con el nombre de usuario.
//
//   node scripts/autodev-run.mjs [--run-id=ID] "<argumentos de /autodev>" [-- <flags extra para claude>]
//   node scripts/autodev-run.mjs --selftest
//
// Una línea JSON por ejecución, reescrita entera al actualizarla (tmp + rename): mismo run_id = misma línea.
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { maskedCheck } from './agent-guard.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const LOG = join(ROOT, '.autodev', 'runs.jsonl');
const ROLES = { 'lifesim-planner': 'planner', 'lifesim-builder': 'builder', 'lifesim-evaluator': 'evaluator', 'gameplay-qa': 'especialista', 'visual-qa': 'especialista', optimizer: 'especialista' };
const MODE_CAP = { ECO: 1, BALANCED: 2, DEEP: 3 }; // correcciones máximas por modo; 3 es el techo absoluto
const TEST_CMD =/npm run (build|check)|node scripts\/|npx tsx scripts\/|npx tsc/;

// ------------------------------------------------------------------ datos sensibles
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pathish = (p) => esc(p).replace(/\\\\|\//g, '[\\\\/]');
const ROOT_RE = new RegExp(pathish(ROOT), 'gi');
const HOME_RE = new RegExp(pathish(homedir()), 'gi');
/** Quita secretos, correos y rutas con nombre de usuario; recorta. */
export function sanitize(text, max = 160) {
  if (text == null) return null;
  const s = String(text)
    .replace(ROOT_RE, '.')
    .replace(HOME_RE, '~')
    .replace(/([A-Za-z]:[\\/]|\/[a-z]\/)Users[\\/][^\\/\s"']+/gi, '$1Users/~')
    .replace(/(sk-[A-Za-z0-9_-]{10,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[abprs]-[\w-]{10,}|AKIA[0-9A-Z]{16}|eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]+)/g, '[REDACTED]')
    .replace(/\b(token|secret|password|passwd|api[_-]?key|authorization)\b(\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/gi, '$1$2[REDACTED]')
    .replace(/:\/\/[^/\s:@]+:[^/\s@]+@/g, '://[REDACTED]@')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// ------------------------------------------------------------------ almacén
/** Lee el log JSONL de ejecuciones; devuelve [] si no existe y omite las líneas corruptas. */
export function readRuns(file = LOG) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).flatMap((l) => {
    try { return [JSON.parse(l)]; } catch { return []; } // una línea rota no tumba el resto
  });
}
/** Inserta o reemplaza por run_id. Escribe a un temporal y lo renombra: nunca deja el archivo a medias. */
export function upsert(run, file = LOG) {
  mkdirSync(dirname(file), { recursive: true });
  const runs = readRuns(file).filter((r) => r.run_id !== run.run_id);
  runs.push(run);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, runs.map((r) => JSON.stringify(r)).join('\n') + '\n');
  for (let i = 0; ; i++) {
    try { renameSync(tmp, file); return; } catch (e) { if (i >= 5) throw e; } // Windows: lector abierto un instante
  }
}

// ------------------------------------------------------------------ lectura del stream
function declaredModel(agent) {
  const f = join(ROOT, '.claude', 'agents', `${agent}.md`);
  if (!existsSync(f)) return null;
  const m = readFileSync(f, 'utf8').match(/^model:\s*(\S+)/m);
  return m ? m[1] : 'inherit';
}
const now = () => new Date().toISOString();

/** Aplica un evento de stream-json al registro. Devuelve true si cambió algo que merezca guardarse ya. */
export function applyEvent(run, ev, st, at = now()) {
  if (ev.type === 'system' && ev.subtype === 'init') {
    run.claude_code_version = ev.claude_code_version ?? null;
    run.auth = ev.apiKeySource === 'none' ? 'suscripción (sin API key)' : ev.apiKeySource ? 'API key' : 'desconocido';
    run.agents.push({ name: 'autodev', role: 'orquestador', model: ev.model ?? null, model_source: ev.model ? 'medido (init)' : null });
    return true;
  }
  if (ev.type === 'system' && ev.subtype === 'task_notification' && st.phaseByTool.has(ev.tool_use_id)) {
    const p = st.phaseByTool.get(ev.tool_use_id);
    p.finished_at = at;
    p.status = ev.status ?? null;
    p.tokens_measured = ev.usage?.total_tokens ?? null;
    p.duration_ms = ev.usage?.duration_ms ?? null;
    const verdict = String(ev.summary ?? '').match(/"verdict"\s*:\s*"(PASS|RETRY|BLOCKED|FAIL)"/);
    if (verdict) p.verdict = verdict[1];
    if (p.name === 'lifesim-evaluator' && verdict?.[1] === 'RETRY') {
      const why = String(ev.summary).match(/"reason"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      st.retryReasons.push(sanitize(why ? JSON.parse(`"${why[1]}"`) : 'RETRY sin motivo', 140));
    }
    return true;
  }
  if (ev.parent_tool_use_id) return false; // mensajes internos de un subagente: no son del orquestador
  const content = Array.isArray(ev.message?.content) ? ev.message.content : [];
  let changed = false;
  for (const c of content) {
    if (c.type === 'tool_use' && c.name === 'Agent') {
      const name = c.input?.subagent_type ?? 'general-purpose';
      const phase = { name, role: ROLES[name] ?? 'otro', started_at: at, finished_at: null };
      run.phases.push(phase);
      st.phaseByTool.set(c.id, phase);
      if (!run.agents.some((a) => a.name === name)) run.agents.push({ name, role: phase.role, model: declaredModel(name), model_source: 'declarado (.claude/agents)' });
      changed = true;
    } else if (c.type === 'tool_use' && c.name === 'Bash' && TEST_CMD.test(c.input?.command ?? '')) {
      const test = { command: sanitize(c.input.command, 200), result: null, duration_ms: null };
      run.tests.push(test);
      st.testByTool.set(c.id, { test, t0: Date.parse(at), id: c.id });
    } else if (c.type === 'tool_result') {
      const phase = st.phaseByTool.get(c.tool_use_id);
      if (phase && !phase.finished_at) { phase.finished_at = at; changed = true; }
      const t = st.testByTool.get(c.tool_use_id);
      if (t) {
        const text = JSON.stringify(c.content ?? '');
        // Un check encadenado (| ; ||) da el exit code de otro comando: aunque salga 0, no es PASS (V2-07).
        t.test.result = !c.is_error ? (maskedCheck(t.test.command) ? 'NO_VERIFICADO' : 'PASS') : /requested permissions|permission|Fact-Forcing Gate|denied/i.test(text) ? 'BLOCKED' : 'FAIL';
        t.test.duration_ms = Date.parse(at) - t.t0;
      }
    }
  }
  if (ev.type === 'result') {
    finish(run, ev, st, at);
    return true;
  }
  return changed;
}

function finish(run, ev, st, at) {
  const first = String(ev.result ?? '').split(/\r?\n/).find((l) => /^autodev:/i.test(l.trim())) ?? '';
  const verdict = first.match(/autodev:\s*(PASS|FAIL|BLOCKED|NO VERIFICADO)/i);
  run.result = verdict ? verdict[1].toUpperCase().replace(' ', '_') : 'BLOCKED'; // NO_VERIFICADO: diagnóstico sin pruebas ejecutadas
  run.mode = first.match(/modo=(\w+)/i)?.[1]?.toUpperCase() ?? run.mode;
  run.origin = String(ev.result ?? '').match(/origen=(auto|expl[ií]cito)/i)?.[1]?.toLowerCase().replace('explicito', 'explícito') ?? run.origin ?? null;
  const corr = first.match(/correcciones=(\d+)\s*\/\s*(\d+)/i);
  const builders = run.phases.filter((p) => p.name === 'lifesim-builder').length;
  run.retries = { count: corr ? Number(corr[1]) : Math.max(0, builders - 1), max: corr ? Number(corr[2]) : null, source: corr ? 'línea autodev' : 'ciclos del builder', reasons: st.retryReasons };
  // Lo que el permiso denegó no llegó a ejecutarse: BLOCKED, no FAIL. Y lo que no tuvo resultado, tampoco.
  const denied = new Set((ev.permission_denials ?? []).map((d) => d.tool_use_id));
  for (const { test, id } of st.testByTool.values()) if (denied.has(id) || test.result === null) test.result = 'BLOCKED';
  const u = ev.usage;
  run.tokens_measured = u ? {
    source: 'stream-json result.usage + modelUsage (medido por Claude Code)',
    input: u.input_tokens ?? null, output: u.output_tokens ?? null,
    cache_read: u.cache_read_input_tokens ?? null, cache_creation: u.cache_creation_input_tokens ?? null,
    by_model: Object.fromEntries(Object.entries(ev.modelUsage ?? {}).map(([m, v]) => [m, { input: v.inputTokens, output: v.outputTokens, cache_read: v.cacheReadInputTokens, cache_creation: v.cacheCreationInputTokens }])),
  } : null;
  const basis = [...new Set(Object.values(ev.modelUsage ?? {}).map((v) => v.costBasis).filter(Boolean))].join(',');
  run.api_cost_estimated = typeof ev.total_cost_usd === 'number'
    ? { usd: Math.round(ev.total_cost_usd * 10000) / 10000, source: `total_cost_usd de Claude Code, precio API ${basis || 'sin costBasis'}; no es lo que paga una suscripción` }
    : null;
  run.subscription_cost_real = null; // la plataforma no expone el coste real de la suscripción
  run.models_used = Object.keys(ev.modelUsage ?? {});
  run.permission_denials = Array.isArray(ev.permission_denials) ? ev.permission_denials.length : null;
  run.num_turns = ev.num_turns ?? null;
  // Puede haber varios `result`: con agentes en segundo plano la sesión sigue tras el primero (visto en V2-07 C).
  // Gana el último; «done» lo pone main() cuando el proceso termina, no este evento.
  run.finished_at = at;
  run.duration_ms = Date.parse(at) - Date.parse(run.started_at);
  run.notes = sanitize(first || (ev.is_error ? `error: ${ev.subtype}` : 'sin línea «autodev:» en la respuesta'), 200);
  const why = closure(run, st.gates ?? readGates());
  run.closure = why;
  if (why) Object.assign(run, { result: 'BLOCKED', closure: why, notes: sanitize(`cierre: ${why} · ${run.notes}`, 200) });
}

/** Cierre obligatorio (V2-07): un PASS necesita el último evaluator en PASS y, si hubo builder, un `gate check` PASS. Devuelve el motivo del bloqueo o null. */
export function closure(run, gates) {
  if (run.result !== 'PASS') return null;
  const evals = run.phases.filter((p) => p.name === 'lifesim-evaluator');
  if (!evals.length) return 'PASS sin lifesim-evaluator';
  if (evals.at(-1).verdict !== 'PASS') return `último evaluator ${evals.at(-1).verdict ?? 'sin veredicto'}`;
  const cap = MODE_CAP[run.mode] ?? 3;
  const used = Math.max(run.retries?.count ?? 0, run.phases.filter((p) => p.name === 'lifesim-builder').length - 1);
  if (used > cap) return `correcciones ${used} > máx. ${cap} del modo ${run.mode}`;
  if (!run.phases.some((p) => p.name === 'lifesim-builder')) return null; // diagnóstico: sin Gate de cambios
  const ids = run.tests.map((t) => t.command.match(/autodev-gate\.mjs\s+baseline\s+--run=([\w.-]+)/)?.[1]).filter(Boolean);
  if (!ids.length) return 'hubo builder y no hay baseline del Gate';
  const bad = ids.find((id) => gates[id]?.lastCheck?.result !== 'PASS');
  return bad ? `gate check de ${bad}: ${gates[bad]?.lastCheck?.result ?? 'no ejecutado'}` : null;
}

// ------------------------------------------------------------------ ejecución
function gitHead() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return null; }
}
function claudeBin() {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const win = process.env.APPDATA && join(process.env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
  return win && existsSync(win) ? win : 'claude';
}
// ------------------------------------------------------------------ V2-06: clasificación, mantenimiento y métricas
/** Tipo de ejecución: 'dry-run' (solo routing, sin agentes) o 'real'. Las sintéticas (selftest) van a otro archivo. */
export const kindOf = (task) => (/--dry-run\b/i.test(String(task ?? '')) ? 'dry-run' : 'real');
/** Ticket abreviado (p. ej. QA-09, V2-05-BIKE) si el objetivo lo nombra; si no, null. */
export const ticketOf = (task) => String(task ?? '').match(/\b([A-Z][A-Z0-9]*-\d+[A-Z0-9-]*)\b/)?.[1] ?? null;
/** Completa registros antiguos (schema 1) sin reescribirlos: lo que falta se deriva o queda null. */
export function normalize(r) {
  return { kind: kindOf(r.task), ticket: ticketOf(r.task), origin: null, regressions: [], ...r };
}
const STALE_MS = 6 * 3600_000;
/** Una ejecución «running» sin fin desde hace más de 6 h se da por interrumpida (no por fallida). */
export function recover(runs, now = Date.now()) {
  return runs.filter((r) => r.status === 'running' && now - Date.parse(r.started_at) > STALE_MS).map((r) => ({
    ...r, status: 'interrupted', result: 'BLOCKED', recovered: true, finished_at: r.finished_at ?? null,
    notes: sanitize(`${r.notes ? `${r.notes} · ` : ''}recuperado: sin fin registrado`, 200),
  }));
}
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
/**
 * Métricas reproducibles. Solo ejecuciones reales y terminadas; cada cifra lleva su denominador y lo excluido.
 * - A la primera = PASS con 0 correcciones / evaluables (PASS + FAIL); BLOCKED, interrumpidas y dry-run no cuentan.
 * - Regresiones = PASS con regresión confirmada vinculada / PASS con ventana de 7 días cumplida (madurez visible).
 * - Tokens: solo los medidos por Claude Code; cobertura = con medida / terminadas.
 * - Gate (si hay .autodev/gate/<run_id>.json): criterios con evidencia y cambios fuera de alcance.
 */
export function metrics(allRuns, { gates = {}, now = Date.now(), by = (r) => r.mode ?? '—' } = {}) {
  const runs = allRuns.map(normalize);
  const excluded = { 'dry-run': runs.filter((r) => r.kind === 'dry-run').length, running: 0, interrupted: 0, blocked: 0 };
  const real = runs.filter((r) => r.kind === 'real');
  excluded.running = real.filter((r) => r.status === 'running').length;
  excluded.interrupted = real.filter((r) => r.status === 'interrupted').length;
  const done = real.filter((r) => r.status === 'done');
  excluded.blocked = done.filter((r) => r.result === 'BLOCKED' || r.result === 'NO_VERIFICADO' || !r.result).length;
  const groups = new Map();
  for (const r of done) { const k = by(r); groups.set(k, [...(groups.get(k) ?? []), r]); }
  const stat = (rs) => {
    const evaluable = rs.filter((r) => r.result === 'PASS' || r.result === 'FAIL');
    const passes = rs.filter((r) => r.result === 'PASS');
    const mature = passes.filter((r) => now - Date.parse(r.finished_at ?? r.started_at) >= 7 * 86400_000);
    const withTokens = rs.filter((r) => r.tokens_measured);
    const gated = rs.map((r) => gates[r.run_id]).filter(Boolean);
    const criteria = gated.reduce((a, g) => a + (g.acceptance?.length ?? 0), 0);
    const evidenced = gated.reduce((a, g) => a + (g.acceptance ?? []).filter((c) => (g.evidence ?? []).some((e) => e.criterion === c && e.exit === 0)).length, 0);
    return {
      n: rs.length,
      firstTry: { num: evaluable.filter((r) => (r.retries?.count ?? 0) === 0 && r.result === 'PASS').length, den: evaluable.length, excludedBlocked: rs.length - evaluable.length },
      medianDurationMs: median(rs.map((r) => r.duration_ms).filter((x) => typeof x === 'number')),
      meanRetries: rs.length ? rs.reduce((a, r) => a + (r.retries?.count ?? 0), 0) / rs.length : null,
      regressions: { num: mature.filter((r) => (r.regressions ?? []).some((g) => g.confirmed)).length, den: mature.length, immature: passes.length - mature.length },
      tokens: { measured: withTokens.length, of: rs.length, total: withTokens.reduce((a, r) => a + ['input', 'output', 'cache_read', 'cache_creation'].reduce((s, k) => s + (r.tokens_measured[k] ?? 0), 0), 0) },
      gate: { runs: gated.length, criteria, evidenced, outOfScope: gated.filter((g) => (g.lastCheck?.fails ?? []).some((f) => /fuera de alcance/.test(f))).length },
      smallSample: rs.length < 5,
    };
  };
  return { total: runs.length, excluded, all: stat(done), groups: [...groups].map(([k, rs]) => [k, stat(rs)]) };
}
/** Lee los registros del Gate (.autodev/gate/<run>.json) indexados por run. */
export function readGates(dir = join(ROOT, '.autodev', 'gate')) {
  if (!existsSync(dir)) return {};
  return Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith('.json')).flatMap((f) => { try { const g = JSON.parse(readFileSync(join(dir, f), 'utf8')); return [[g.run, g]]; } catch { return []; } }));
}

export function newRun(task, runId) {
  return {
    schema: 2, kind: kindOf(task), ticket: ticketOf(task), origin: null, regressions: [],
    run_id: runId ?? randomUUID(), task: sanitize(task, 160), mode: task.match(/--mode=(\w+)|^\s*\[(\w+)\]/i)?.slice(1).find(Boolean)?.toUpperCase() ?? 'BALANCED',
    started_at: now(), finished_at: null, duration_ms: null, status: 'running', phases: [], agents: [], retries: null, tests: [],
    git_head_before: gitHead(), git_commit: '', result: null, tokens_measured: null, api_cost_estimated: null, subscription_cost_real: null, notes: null,
  };
}

async function main(argv) {
  const sep = argv.indexOf('--');
  const own = sep < 0 ? argv : argv.slice(0, sep);
  const extra = sep < 0 ? [] : argv.slice(sep + 1);
  const runId = own.find((a) => a.startsWith('--run-id='))?.slice(9);
  const task = own.filter((a) => !a.startsWith('--run-id=')).join(' ').trim();
  if (!task) { console.error('uso: node scripts/autodev-run.mjs [--run-id=ID] "<argumentos de /autodev>" [-- <flags para claude>]'); process.exit(2); }

  const run = newRun(task, runId);
  const st = { phaseByTool: new Map(), testByTool: new Map(), retryReasons: [] };
  upsert(run);
  console.error(`autodev-run: run_id=${run.run_id} → .autodev/runs.jsonl`);

  // AUTODEV_RUN_ID: el orquestador lo usa como --run del Gate (scripts/autodev-gate.mjs), y así las métricas los enlazan.
  const child = spawn(claudeBin(), ['-p', `/autodev ${task}`, '--output-format', 'stream-json', '--verbose', ...extra], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, AUTODEV_RUN_ID: run.run_id } });
  const stop = (why) => {
    if (run.status !== 'running') return;
    Object.assign(run, { status: 'interrupted', result: 'BLOCKED', finished_at: now(), notes: `interrumpido (${why})` });
    run.duration_ms = Date.parse(run.finished_at) - Date.parse(run.started_at);
    upsert(run);
    child.kill();
    process.exit(130);
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));

  let finalText = '';
  for await (const line of createInterface({ input: child.stdout })) {
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev.type === 'result') finalText = String(ev.result ?? '');
    if (applyEvent(run, ev, st)) upsert(run);
  }
  const code = await new Promise((r) => (child.exitCode !== null ? r(child.exitCode) : child.on('close', r)));
  if (run.result === null) Object.assign(run, { result: 'BLOCKED', finished_at: now(), notes: `claude terminó (exit ${code}) sin evento result` });
  run.status = 'done';
  const head = gitHead();
  run.git_commit = head && head !== run.git_head_before ? head : ''; // /autodev no hace commits: normalmente vacío
  upsert(run);
  process.stdout.write(finalText + '\n');
  console.error(`autodev-run: ${run.result} · ${run.run_id}${run.closure ? ` (cierre: ${run.closure})` : ''}`);
  process.exit(code || (run.result === 'PASS' ? 0 : run.result === 'FAIL' ? 1 : 2)); // solo PASS sale con 0
}

// ------------------------------------------------------------------ autoprueba (sin red ni claude)
function selftest() {
  const assert = (ok, msg) => { if (!ok) { console.error('FALLO:', msg); process.exit(1); } };
  const s = sanitize(`ver ${ROOT}\\src\\x.ts y ${homedir()}/.ssh y C:\\Users\\otra\\a token=abc123 sk-ant-0123456789abcdef https://u:p@h.com/x correo a@b.co`, 400);
  assert(!s.includes(homedir()) && !/Users[\\/]otra/.test(s), 'rutas de usuario: ' + s);
  assert(!/abc123|sk-ant-0123|u:p@|a@b\.co/.test(s), 'secretos: ' + s);
  assert(s.startsWith('ver .') && s.includes('~/.ssh'), 'rutas relativas: ' + s);
  assert(sanitize('x'.repeat(300)).length === 160, 'recorte');

  const file = join(ROOT, '.autodev', `selftest-${process.pid}.jsonl`);
  const run = newRun('--mode=ECO --audit tarea', 'fijo');
  assert(run.mode === 'ECO', 'modo por flag');
  assert(newRun('[deep] x').mode === 'DEEP' && newRun('x').mode === 'BALANCED', 'modo por prefijo y por defecto');
  const st = { phaseByTool: new Map(), testByTool: new Map(), retryReasons: [] };
  const t = (n) => new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();
  run.started_at = t(0);
  const events = [
    { type: 'system', subtype: 'init', model: 'claude-x', apiKeySource: 'none', claude_code_version: '9.9.9' },
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'a1', name: 'Agent', input: { subagent_type: 'lifesim-evaluator', prompt: 'SECRETO DEL PROMPT' } }] } },
    { type: 'assistant', parent_tool_use_id: 'a1', message: { content: [{ type: 'tool_use', id: 'z', name: 'Bash', input: { command: 'npm run build' } }] } },
    { type: 'system', subtype: 'task_notification', tool_use_id: 'a1', status: 'completed', summary: '{"verdict":"RETRY","reason":"falta check en C:\\\\Users\\\\otra"}', usage: { total_tokens: 900, duration_ms: 1200 } },
    { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'npm run build' } }, { type: 'tool_use', id: 'b2', name: 'Bash', input: { command: 'node scripts/check-x.ts' } }, { type: 'tool_use', id: 'b3', name: 'Bash', input: { command: 'ls' } }, { type: 'tool_use', id: 'b4', name: 'Bash', input: { command: 'node scripts/check-y.ts > f' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'b1', is_error: false, content: 'ok' }, { type: 'tool_result', tool_use_id: 'b2', is_error: true, content: 'AssertionError' }, { type: 'tool_result', tool_use_id: 'b4', is_error: true, content: 'This command requires approval' }] } },
    { type: 'result', result: 'autodev: FAIL · modo=ECO · correcciones=1/1 · especialistas=ninguno\nresto privado', usage: { input_tokens: 5, output_tokens: 7, cache_read_input_tokens: 11, cache_creation_input_tokens: 13 }, modelUsage: { 'claude-x': { inputTokens: 5, outputTokens: 7, cacheReadInputTokens: 11, cacheCreationInputTokens: 13, costBasis: 'list' } }, total_cost_usd: 0.12345, permission_denials: [{ tool_name: 'Bash', tool_use_id: 'b4' }], num_turns: 3 },
  ];
  events.forEach((e, i) => applyEvent(run, e, st, t(i + 1)));
  assert(run.result === 'FAIL' && run.mode === 'ECO' && run.retries.count === 1 && run.retries.max === 1, 'resultado y correcciones');
  assert(run.phases.length === 1 && run.phases[0].tokens_measured === 900 && run.phases[0].verdict === 'RETRY', 'fase del evaluador');
  assert(run.retries.reasons[0] === 'falta check en C:\\Users/~', 'motivo saneado: ' + run.retries.reasons[0]);
  assert(run.tests.map((x) => x.result).join() === 'PASS,FAIL,BLOCKED', 'tests: ls y el del subagente no cuentan; el denegado es BLOCKED: ' + run.tests.map((x) => x.result));
  assert(run.agents.find((a) => a.name === 'lifesim-evaluator').model === 'sonnet', 'modelo declarado');
  assert(run.tokens_measured.output === 7 && run.api_cost_estimated.usd === 0.1235 && run.subscription_cost_real === null, 'tokens y coste');
  const json = JSON.stringify(run);
  assert(!json.includes('SECRETO DEL PROMPT') && !json.includes('resto privado'), 'no guarda prompts ni la respuesta');

  try {
    upsert(run, file); upsert({ ...run, notes: 'segunda' }, file); upsert({ ...run, run_id: 'otro' }, file);
    const back = readRuns(file);
    assert(back.length === 2 && back.find((r) => r.run_id === 'fijo').notes === 'segunda', 'upsert sin duplicar');
    writeFileSync(file, readFileSync(file, 'utf8') + '{"run_id":"roto",'); // línea cortada a medias
    assert(readRuns(file).length === 2, 'una línea rota no tumba el resto');
  } finally {
    if (existsSync(file)) unlinkSync(file);
  }

  // V2-06 · clasificación, recuperación y métricas (fixture sintético: nunca toca .autodev/runs.jsonl)
  assert(kindOf('--dry-run x') === 'dry-run' && kindOf('--audit x') === 'real', 'tipo de ejecución');
  assert(ticketOf('[DEEP] QA-09: pasajero') === 'QA-09' && ticketOf('arregla el NPC') === null, 'ticket abreviado');
  assert(run.origin === null, 'origen ausente → null');
  const o = newRun('x', 'o'); o.phases.push({ name: 'lifesim-evaluator', verdict: 'PASS' }); applyEvent(o, { type: 'result', result: 'autodev: PASS · modo=ECO · origen=auto · correcciones=0/1' }, { phaseByTool: new Map(), testByTool: new Map(), retryReasons: [] }, t(9));
  assert(o.origin === 'auto' && o.result === 'PASS', 'origen leído de la línea autodev');
  const nv = newRun('--audit x', 'nv'); applyEvent(nv, { type: 'result', result: 'autodev: NO VERIFICADO · modo=ECO · origen=explícito · correcciones=0/1' }, { phaseByTool: new Map(), testByTool: new Map(), retryReasons: [] }, t(9));
  assert(nv.result === 'NO_VERIFICADO', 'diagnóstico sin pruebas: NO_VERIFICADO, nunca PASS');
  assert(metrics([{ ...nv, status: 'done', kind: 'real' }]).all.firstTry.den === 0, 'NO_VERIFICADO no entra en el denominador');
  // Cierre obligatorio: casos reales de V2-07 (B: Gate BLOCKED; C: sin evaluator) y los que sí cierran.
  const ph = (...n) => n.map(([name, verdict]) => ({ name, verdict }));
  const base = { command: 'node scripts/autodev-gate.mjs baseline --run=G1 --files=x' };
  const C = (phases, tests, gates) => closure({ result: 'PASS', phases: ph(...phases), tests }, gates);
  assert(/sin lifesim-evaluator/.test(C([['lifesim-planner'], ['lifesim-builder']], [base], {})), 'cierre: sin evaluator (caso C)');
  assert(/RETRY/.test(C([['lifesim-builder'], ['lifesim-evaluator', 'PASS'], ['lifesim-evaluator', 'RETRY']], [base], {})), 'cierre: cuenta el último evaluator');
  assert(/BLOCKED/.test(C([['lifesim-builder'], ['lifesim-evaluator', 'PASS']], [base], { G1: { lastCheck: { result: 'BLOCKED' } } })), 'cierre: Gate BLOCKED (caso B)');
  assert(/no ejecutado/.test(C([['lifesim-builder'], ['lifesim-evaluator', 'PASS']], [base], {})), 'cierre: gate check no ejecutado');
  assert(/baseline/.test(C([['lifesim-builder'], ['lifesim-evaluator', 'PASS']], [], {})), 'cierre: builder sin baseline');
  assert(C([['lifesim-builder'], ['lifesim-evaluator', 'PASS']], [base], { G1: { lastCheck: { result: 'PASS' } } }) === null, 'cierre: Gate PASS cierra');
  assert(C([['lifesim-evaluator', 'PASS']], [], {}) === null, 'cierre: diagnóstico con evaluator PASS cierra');
  assert(closure({ result: 'FAIL', phases: [], tests: [] }, {}) === null, 'cierre: no toca FAIL');
  const G = { G1: { lastCheck: { result: 'PASS' } } };
  const eco3 = { result: 'PASS', mode: 'ECO', retries: { count: 0 }, phases: ph(['lifesim-builder'], ['lifesim-builder'], ['lifesim-builder'], ['lifesim-evaluator', 'PASS']), tests: [base] };
  assert(/correcciones 2 > máx. 1 del modo ECO/.test(closure(eco3, G)), 'cierre: techo del modo por ciclos de builder, aunque la línea diga 0');
  assert(closure({ ...eco3, mode: 'DEEP' }, G) === null, 'cierre: 2 correcciones caben en DEEP');
  // check encadenado: exit 0 pero no PASS
  const mk = newRun('x', 'mk'); const mst = { phaseByTool: new Map(), testByTool: new Map(), retryReasons: [], gates: {} };
  applyEvent(mk, { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'm1', name: 'Bash', input: { command: 'npm run check 2>&1 | tail -15' } }, { type: 'tool_use', id: 'm2', name: 'Bash', input: { command: 'npm run check' } }] } }, mst, t(1));
  applyEvent(mk, { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'm1', is_error: false, content: 'ok' }, { type: 'tool_result', tool_use_id: 'm2', is_error: false, content: 'ok' }] } }, mst, t(2));
  assert(mk.tests.map((x) => x.result).join() === 'NO_VERIFICADO,PASS', 'check con | tail: NO_VERIFICADO, no PASS: ' + mk.tests.map((x) => x.result));
  const cl = newRun('x', 'cl'); const cst = { phaseByTool: new Map(), testByTool: new Map(), retryReasons: [], gates: {} };
  applyEvent(cl, { type: 'result', result: 'autodev: PASS · modo=ECO · correcciones=0/1' }, cst, t(9));
  assert(cl.result === 'BLOCKED' && /sin lifesim-evaluator/.test(cl.closure), 'cierre aplicado en finish: PASS sin evaluator → BLOCKED');
  assert(cl.status === 'running', 'un result intermedio no marca done');
  applyEvent(cl, { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'e9', name: 'Agent', input: { subagent_type: 'lifesim-evaluator' } }] } }, cst, t(10));
  applyEvent(cl, { type: 'system', subtype: 'task_notification', tool_use_id: 'e9', summary: '{"verdict":"PASS"}' }, cst, t(11));
  applyEvent(cl, { type: 'result', result: 'autodev: PASS · modo=ECO · correcciones=0/1' }, cst, t(12));
  assert(cl.result === 'PASS' && cl.closure === null,'el último result gana: evaluator llegado después → PASS');
  const now = Date.parse('2026-02-01T00:00:00Z');
  const R = (id, extra) => ({ run_id: id, kind: 'real', status: 'done', started_at: '2026-01-01T00:00:00Z', finished_at: '2026-01-01T00:10:00Z', duration_ms: 600_000, retries: { count: 0 }, mode: 'ECO', ...extra });
  const fx = [
    R('p1', { result: 'PASS' }), R('p2', { result: 'PASS', retries: { count: 1 } }), R('f1', { result: 'FAIL', retries: { count: 1 }, duration_ms: 1_200_000 }),
    R('b1', { result: 'BLOCKED' }), R('p3', { result: 'PASS', regressions: [{ confirmed: true }] }),
    R('fresh', { result: 'PASS', finished_at: '2026-01-30T00:00:00Z' }),
    { run_id: 'd1', task: '--dry-run y', status: 'done', result: 'BLOCKED' }, { run_id: 'r1', kind: 'real', status: 'running', started_at: '2026-01-01T00:00:00Z' },
  ];
  const m = metrics(fx, { now, gates: { p1: { acceptance: ['A1', 'A2'], evidence: [{ criterion: 'A1', exit: 0 }, { criterion: 'A2', exit: 1 }], lastCheck: { fails: ['fuera de alcance o concurrente: x'] } } } });
  assert(m.excluded['dry-run'] === 1 && m.excluded.running === 1 && m.excluded.blocked === 1, 'exclusiones: ' + JSON.stringify(m.excluded));
  assert(m.all.firstTry.num === 3 && m.all.firstTry.den === 5, 'a la primera = 3/5 (p1, p3, fresh): ' + JSON.stringify(m.all.firstTry));
  assert(m.all.regressions.num === 1 && m.all.regressions.den === 3 && m.all.regressions.immature === 1, 'regresiones con ventana: ' + JSON.stringify(m.all.regressions));
  assert(m.all.medianDurationMs === 600_000 && m.all.tokens.measured === 0, 'mediana y tokens sin medir → 0 medidos');
  assert(m.all.gate.criteria === 2 && m.all.gate.evidenced === 1 && m.all.gate.outOfScope === 1, 'gate: ' + JSON.stringify(m.all.gate));
  const rec = recover(fx, now);
  assert(rec.length === 1 && rec[0].run_id === 'r1' && rec[0].status === 'interrupted' && rec[0].recovered, 'recuperación de interrumpidas');
  assert(normalize({ run_id: 'v', task: '--dry-run QA-01 z' }).kind === 'dry-run' && normalize({ run_id: 'v', task: 'QA-01 z' }).ticket === 'QA-01', 'registros schema 1');
  console.log('autodev-run selftest OK');
}

/** Mantenimiento: `--recover` marca como interrumpidas las «running» de más de 6 h; `--link-regression <run> "<nota>" [--confirmed]`. */
function maintain(argv) {
  if (argv.includes('--recover')) {
    const fixed = recover(readRuns());
    for (const r of fixed) upsert(r);
    console.log(`autodev-run: ${fixed.length} ejecución(es) interrumpida(s) recuperada(s)${fixed.length ? `: ${fixed.map((r) => r.run_id).join(', ')}` : ''}`);
    return 0;
  }
  const i = argv.indexOf('--link-regression');
  const [id, note] = [argv[i + 1], argv[i + 2]];
  const run = readRuns().find((r) => r.run_id === id);
  if (!run || !note) { console.error('uso: --link-regression <run_id> "<qué se rompió y cómo se vio>" [--confirmed]'); return 2; }
  const n = normalize(run);
  n.regressions = [...n.regressions, { at: now(), note: sanitize(note, 200), confirmed: argv.includes('--confirmed'), source: 'manual' }];
  upsert(n);
  console.log(`autodev-run: regresión vinculada a ${id}${argv.includes('--confirmed') ? ' (confirmada)' : ' (sin confirmar)'}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--selftest')) selftest();
  else if (process.argv.includes('--recover') || process.argv.includes('--link-regression')) process.exit(maintain(process.argv.slice(2)));
  else main(process.argv.slice(2));
}
