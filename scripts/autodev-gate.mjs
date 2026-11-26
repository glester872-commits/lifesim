#!/usr/bin/env node
// Gate de cierre de /autodev (AGENT-V2-04). Herramienta de desarrollo: nada de src/ lo importa. Sin red ni dependencias.
// Registra en .autodev/gate/<run>.json (ignorado por git) el baseline, los criterios definidos ANTES de editar, la evidencia
// y el veredicto del evaluator, y comprueba lo objetivo: alcance del diff, archivos protegidos, tests debilitados,
// evidencia posterior al último cambio y revisión independiente. No juzga la semántica: eso es del evaluator.
//   node scripts/autodev-gate.mjs baseline --run=R --files=a,b --acceptance=A1,A2 [--authorize=ruta,...]
//   node scripts/autodev-gate.mjs evidence --run=R --criterion=A1 --exit=0 --cmd="node scripts/check-x.ts"
//   node scripts/autodev-gate.mjs verdict  --run=R --evaluator=PASS|RETRY|FAIL|BLOCKED
//   node scripts/autodev-gate.mjs check    --run=R        → «gate: PASS|FAIL|BLOCKED», exit 0/1/2
//   node scripts/autodev-gate.mjs rollback --run=R        → parche inverso de los cambios propios (no lo aplica)
//   node scripts/autodev-gate.mjs --selftest              → repositorio sintético en un temporal
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathRule, testRule } from './agent-guard.mjs';

const REGISTRY = 'docs/AGENT-HARNESS.md'; // única escritura del orquestador (SKILL.md §2)
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const root = (cwd) => git(['rev-parse', '--show-toplevel'], cwd).trim().replace(/\\/g, '/');
const sha = (file) => (existsSync(file) ? createHash('sha1').update(readFileSync(file)).digest('hex') : null);
const headSha = (rel, cwd) => { try { return createHash('sha1').update(execFileSync('git', ['show', `HEAD:${rel}`], { cwd, stdio: ['ignore', 'pipe', 'ignore'] })).digest('hex'); } catch { return null; } };
function dirty(cwd) {
  return git(['status', '--porcelain=v1', '--untracked-files=all', '-z'], cwd).split('\0').filter(Boolean)
    .map((l) => l.slice(3)).filter((p) => !p.startsWith('.autodev/'));
}
const arg = (argv, k) => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const list = (s) => (s ? s.split(',').map((x) => x.trim().replace(/\\/g, '/')).filter(Boolean) : []);
const store = (r, run) => join(r, '.autodev', 'gate', `${run.replace(/[^\w.-]/g, '_')}.json`);
const load = (r, run) => { const f = store(r, run); if (!existsSync(f)) return null; return JSON.parse(readFileSync(f, 'utf8')); };
const save = (r, run, d) => { const f = store(r, run); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, JSON.stringify(d, null, 2)); };

function baseline(r, argv) {
  const run = arg(argv, 'run'), files = list(arg(argv, 'files')), acceptance = list(arg(argv, 'acceptance'));
  if (!run || !files.length || !acceptance.length) return fail('baseline necesita --run, --files y --acceptance (criterios definidos antes de editar)');
  if (load(r, run)) return fail(`ya hay baseline para ${run}; usa otro --run`);
  const paths = [...new Set([...files, ...dirty(r)])];
  const snapDir = join(r, '.autodev', 'gate', `${run}.snap`);
  const hashes = {};
  for (const p of paths) {
    hashes[p] = sha(join(r, p));
    if (files.includes(p) && existsSync(join(r, p))) { mkdirSync(dirname(join(snapDir, p)), { recursive: true }); copyFileSync(join(r, p), join(snapDir, p)); }
  }
  save(r, run, { run, created: new Date().toISOString(), head: git(['rev-parse', 'HEAD'], r).trim(), files, acceptance, authorize: list(arg(argv, 'authorize')), hashes, evidence: [], verdict: null });
  console.log(`gate: baseline ${run} · ${files.length} archivo(s) del plan · ${acceptance.length} criterio(s) · ${paths.length - files.length} cambio(s) previos registrados`);
  return 0;
}

function evidence(r, argv) {
  const run = arg(argv, 'run'), d = load(r, run);
  if (!d) return fail(`no hay baseline para ${run}`);
  const criterion = arg(argv, 'criterion'), exit = Number(arg(argv, 'exit')), cmd = arg(argv, 'cmd');
  if (!d.acceptance.includes(criterion) || !Number.isInteger(exit) || !cmd) return fail('evidence necesita --criterion (de la baseline), --exit entero y --cmd');
  d.evidence.push({ criterion, exit, cmd, at: new Date().toISOString() });
  save(r, run, d);
  console.log(`gate: evidencia ${criterion} ← ${cmd} (exit ${exit})`);
  return 0;
}

function verdict(r, argv) {
  const run = arg(argv, 'run'), d = load(r, run), v = arg(argv, 'evaluator');
  if (!d) return fail(`no hay baseline para ${run}`);
  if (!/^(PASS|RETRY|FAIL|BLOCKED)$/.test(v ?? '')) return fail('verdict necesita --evaluator=PASS|RETRY|FAIL|BLOCKED');
  d.verdict = { evaluator: v, at: new Date().toISOString() };
  save(r, run, d);
  console.log(`gate: veredicto del evaluator ${v}`);
  return 0;
}

/** Rutas cuyo contenido cambió desde la baseline (incluye archivos que ya estaban sucios y siguieron cambiando). */
function changed(r, d) {
  const paths = [...new Set([...Object.keys(d.hashes), ...dirty(r)])];
  return paths.filter((p) => sha(join(r, p)) !== (p in d.hashes ? d.hashes[p] : headSha(p, r)));
}

export function evaluate(r, d) {
  const fails = [], blocks = [];
  if (!d) return { result: 'BLOCKED', fails, blocks: ['sin baseline: los criterios no se registraron antes de editar'] };
  const ch = changed(r, d);
  const outOfScope = ch.filter((p) => !d.files.includes(p) && p !== REGISTRY);
  if (outOfScope.length) fails.push(`fuera de alcance o concurrente: ${outOfScope.join(', ')}`);
  for (const p of ch) {
    const rule = pathRule(join(r, p).replace(/\\/g, '/'), r, false);
    if (rule && !d.authorize.includes(p)) fails.push(`protegido sin autorización: ${p} (${rule.why})`);
    const snap = join(r, '.autodev', 'gate', `${d.run}.snap`, p);
    if (existsSync(snap) && existsSync(join(r, p))) {
      const t = testRule(join(r, p).replace(/\\/g, '/'), r, readFileSync(snap, 'utf8'), readFileSync(join(r, p), 'utf8'));
      if (t && !d.authorize.includes(p)) fails.push(`prueba debilitada: ${t.why}`);
    }
  }
  if (!ch.length && d.files.some((p) => sha(join(r, p)) !== headSha(p, r) && d.hashes[p] === sha(join(r, p)))) {
    blocks.push('sin cambios desde la baseline, pero el plan ya difería de HEAD: ¿baseline posterior a la edición?');
  }
  const last = Math.max(0, ...ch.filter((p) => existsSync(join(r, p))).map((p) => statSync(join(r, p)).mtimeMs));
  for (const a of d.acceptance) {
    const ev = d.evidence.filter((e) => e.criterion === a && Date.parse(e.at) >= last);
    if (!ev.length) blocks.push(`${a}: sin evidencia posterior al último cambio`);
    else if (ev.some((e) => e.exit !== 0)) fails.push(`${a}: ${ev.find((e) => e.exit !== 0).cmd} salió con ${ev.find((e) => e.exit !== 0).exit}`);
    else if (ev.every((e) => /^\s*npm run build\s*$/.test(e.cmd))) blocks.push(`${a}: solo hay build; no basta como evidencia`);
  }
  if (!d.verdict) blocks.push('falta la revisión independiente del evaluator');
  else if (d.verdict.evaluator === 'FAIL') fails.push('el evaluator dio FAIL');
  else if (d.verdict.evaluator !== 'PASS') blocks.push(`el evaluator dio ${d.verdict.evaluator}`);
  return { result: fails.length ? 'FAIL' : blocks.length ? 'BLOCKED' : 'PASS', fails, blocks, changed: ch };
}

function check(r, argv) {
  const run = arg(argv, 'run');
  const d = run ? load(r, run) : null;
  const e = evaluate(r, d);
  // V2-06: el último resultado queda en el registro del Gate para las métricas (scripts/autodev-run.mjs metrics).
  if (d) save(r, run, { ...d, lastCheck: { result: e.result, fails: e.fails, blocks: e.blocks, at: new Date().toISOString() } });
  console.log(`gate: ${e.result}${e.changed ? ` · cambiados: ${e.changed.join(', ') || 'ninguno'}` : ''}`);
  for (const f of e.fails) console.log(`  FAIL  ${f}`);
  for (const b of e.blocks) console.log(`  BLOCK ${b}`);
  return e.result === 'PASS' ? 0 : e.result === 'FAIL' ? 1 : 2;
}

function rollback(r, argv) {
  const run = arg(argv, 'run'), d = load(r, run);
  if (!d) return fail(`no hay baseline para ${run}`);
  const ch = changed(r, d).filter((p) => d.files.includes(p));
  const patch = [], created = [];
  for (const p of ch) {
    const snap = join(r, '.autodev', 'gate', `${run}.snap`, p);
    if (!existsSync(snap)) { created.push(p); continue; }
    const res = spawnSync('git', ['diff', '--no-index', '--no-color', '--', p, snap.replace(/\\/g, '/')], { cwd: r, encoding: 'utf8' });
    patch.push(res.stdout.split('\n').map((l) => (/^(diff --git|\+\+\+ |--- )/.test(l) ? l.replace(/ (a|b)\/\S+/g, (m, s) => ` ${s}/${p}`).replace(/^(\+\+\+|---) \S+/, `$1 ${l.startsWith('---') ? 'a' : 'b'}/${p}`) : l)).join('\n'));
  }
  const out = join(r, '.autodev', 'gate', `${run}.rollback.patch`);
  writeFileSync(out, patch.join(''));
  console.log(`gate: parche inverso de ${ch.length - created.length} archivo(s) propio(s) → ${out.replace(/\\/g, '/').slice(r.length + 1)}`);
  console.log('  revísalo y aplícalo con: git apply --check <parche> && git apply <parche>   (no toca el índice ni otros archivos)');
  for (const p of created) console.log(`  archivo nuevo de esta ejecución (bórralo a mano si procede): ${p}`);
  return 0;
}

function fail(msg) { console.error(`gate: ${msg}`); return 2; }

function selftest() {
  const me = fileURLToPath(import.meta.url);
  const dir = mkdtempSync(join(tmpdir(), 'autodev-gate-'));
  const g = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const w = (p, s) => { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), s); };
  const run = (...a) => spawnSync(process.execPath, [me, ...a], { cwd: dir, encoding: 'utf8' });
  const expect = (label, res, code, re) => { if (res.status !== code || (re && !re.test(res.stdout + res.stderr))) throw new Error(`${label}: exit ${res.status}\n${res.stdout}${res.stderr}`); };
  const touch = () => { const t = Date.now() + 5; while (Date.now() < t); };
  try {
    g('init', '-q'); g('config', 'user.email', 'gate@test.invalid'); g('config', 'user.name', 'gate-test'); g('config', 'core.autocrlf', 'false');
    w('a.txt', 'uno\ndos\ntres\n'); w('b.txt', 'b\n'); w('c.txt', 'c\n'); w('scripts/check-z.ts', 'assert.ok(1);\nassert.ok(2);\n');
    g('add', '.'); g('commit', '-qm', 'base');
    // trabajo ajeno previo: unstaged en b, staged en c, untracked u
    w('b.txt', 'b ajeno\n'); w('c.txt', 'c ajeno staged\n'); g('add', 'c.txt'); w('u.txt', 'untracked ajeno\n');
    const staged0 = g('diff', '--cached');
    expect('check sin baseline', run('check', '--run=R'), 2, /BLOCKED/);
    expect('baseline sin criterios', run('baseline', '--run=R', '--files=a.txt'), 2);
    expect('baseline', run('baseline', '--run=R', '--files=a.txt,scripts/check-z.ts', '--acceptance=A1'), 0);
    w('a.txt', 'uno\nDOS propio\ntres\n'); touch();
    expect('sin evidencia ni evaluator', run('check', '--run=R'), 2, /A1: sin evidencia/);
    expect('evidencia solo build', run('evidence', '--run=R', '--criterion=A1', '--exit=0', '--cmd=npm run build'), 0);
    expect('solo build no basta', run('check', '--run=R'), 2, /solo hay build/);
    run('evidence', '--run=R', '--criterion=A1', '--exit=0', '--cmd=node scripts/check-z.ts');
    expect('falta evaluator', run('check', '--run=R'), 2, /revisión independiente/);
    run('verdict', '--run=R', '--evaluator=PASS');
    expect('PASS', run('check', '--run=R'), 0, /gate: PASS/);
    // fuera de alcance: el ajeno b cambia después de la baseline
    w('b.txt', 'b ajeno\notra cosa\n');
    expect('fuera de alcance', run('check', '--run=R'), 1, /fuera de alcance o concurrente: b\.txt/);
    w('b.txt', 'b ajeno\n');
    // protegido
    w('.env', 'SECRET=1\n');
    expect('.env', run('check', '--run=R'), 1, /protegido sin autorización: \.env/);
    rmSync(join(dir, '.env'));
    // test debilitado
    w('scripts/check-z.ts', 'assert.ok(1);\n'); touch(); run('evidence', '--run=R', '--criterion=A1', '--exit=0', '--cmd=node scripts/check-z.ts');
    expect('test debilitado', run('check', '--run=R'), 1, /prueba debilitada/);
    w('scripts/check-z.ts', 'assert.ok(1);\nassert.ok(2);\n'); // vuelve a la baseline: deja de contar como cambio
    // evidencia anterior al último cambio: un cambio propio nuevo después de la última evidencia
    touch(); w('a.txt', 'uno\nDOS propio v2\ntres\n'); touch();
    expect('evidencia vieja', run('check', '--run=R'), 2, /sin evidencia posterior/);
    run('evidence', '--run=R', '--criterion=A1', '--exit=1', '--cmd=node scripts/check-z.ts');
    expect('prueba que falla', run('check', '--run=R'), 1, /salió con 1/);
    // rollback: el parche inverso solo deshace a.txt; ajenos intactos
    expect('rollback', run('rollback', '--run=R'), 0, /parche inverso de 1/);
    g('apply', '--check', '.autodev/gate/R.rollback.patch'); g('apply', '.autodev/gate/R.rollback.patch');
    const ok = (p, s) => { if (readFileSync(join(dir, p), 'utf8') !== s) throw new Error(`rollback alteró ${p}`); };
    ok('a.txt', 'uno\ndos\ntres\n'); ok('b.txt', 'b ajeno\n'); ok('c.txt', 'c ajeno staged\n'); ok('u.txt', 'untracked ajeno\n');
    if (g('diff', '--cached') !== staged0) throw new Error('rollback alteró el índice');
    console.log('autodev-gate selftest OK (baseline, evidencia, build-solo, evaluator, alcance, protegido, test debilitado, evidencia vieja, fallo, rollback con ajenos staged/unstaged/untracked)');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const [cmd, ...argv] = process.argv.slice(2);
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (cmd === '--selftest') selftest();
  else {
    const r = root(process.cwd());
    const fns = { baseline, evidence, verdict, check, rollback };
    if (!fns[cmd]) { console.error('uso: autodev-gate.mjs baseline|evidence|verdict|check|rollback --run=R … | --selftest'); process.exit(2); }
    process.exit(fns[cmd](r, argv));
  }
}
