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
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const LOG = join(ROOT, '.autodev', 'runs.jsonl');
const ROLES = { 'lifesim-planner': 'planner', 'lifesim-builder': 'builder', 'lifesim-evaluator': 'evaluator', 'gameplay-qa': 'especialista', 'visual-qa': 'especialista', optimizer: 'especialista' };
const TEST_CMD = /npm run (build|check)|node scripts\/|npx tsx scripts\/|npx tsc/;

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
        t.test.result = !c.is_error ? 'PASS' : /requested permissions|permission|Fact-Forcing Gate|denied/i.test(text) ? 'BLOCKED' : 'FAIL';
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
  const verdict = first.match(/autodev:\s*(PASS|FAIL|BLOCKED)/i);
  run.result = verdict ? verdict[1].toUpperCase() : 'BLOCKED';
  run.mode = first.match(/modo=(\w+)/i)?.[1]?.toUpperCase() ?? run.mode;
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
  run.status = 'done';
  run.finished_at = at;
  run.duration_ms = Date.parse(at) - Date.parse(run.started_at);
  run.notes = sanitize(first || (ev.is_error ? `error: ${ev.subtype}` : 'sin línea «autodev:» en la respuesta'), 200);
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
export function newRun(task, runId) {
  return {
    schema: 1, run_id: runId ?? randomUUID(), task: sanitize(task, 160), mode: task.match(/--mode=(\w+)|^\s*\[(\w+)\]/i)?.slice(1).find(Boolean)?.toUpperCase() ?? 'BALANCED',
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

  const child = spawn(claudeBin(), ['-p', `/autodev ${task}`, '--output-format', 'stream-json', '--verbose', ...extra], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
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
  if (run.status === 'running') Object.assign(run, { status: 'done', result: 'BLOCKED', finished_at: now(), notes: `claude terminó (exit ${code}) sin evento result` });
  const head = gitHead();
  run.git_commit = head && head !== run.git_head_before ? head : ''; // /autodev no hace commits: normalmente vacío
  upsert(run);
  process.stdout.write(finalText + '\n');
  console.error(`autodev-run: ${run.result} · ${run.run_id}`);
  process.exit(code ?? 0);
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
  console.log('autodev-run selftest OK');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--selftest')) selftest();
  else main(process.argv.slice(2));
}
