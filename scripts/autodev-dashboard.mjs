#!/usr/bin/env node
// Dashboard privado de /autodev: lee .autodev/runs.jsonl y escribe .autodev/dashboard.html (estático, sin red).
// .autodev/ está en .gitignore: no se versiona ni se publica. Nada del juego lo importa.
//   node scripts/autodev-dashboard.mjs             → .autodev/dashboard.html
//   node scripts/autodev-dashboard.mjs --summary   → resumen en la terminal (mismas cifras, mismas fórmulas)
// Las cifras salen de metrics() (scripts/autodev-run.mjs): solo ejecuciones reales terminadas, con denominador y exclusiones.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOG, metrics, normalize, readGates, readRuns } from './autodev-run.mjs';

const runs = readRuns(LOG).map(normalize).sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
const gates = readGates();
const byMode = metrics(runs, { gates });
const byOrigin = metrics(runs, { gates, by: (r) => `${r.mode ?? '—'} · ${r.origin ?? 'origen no registrado'}` });
const byModels = metrics(runs, { gates, by: (r) => (r.models_used ?? []).join(' + ') || 'modelos no medidos' });

const frac = (n, d) => (d ? `${Math.round((100 * n) / d)} % (${n}/${d})` : `n/d (0/0)`);
const mins = (ms) => (typeof ms === 'number' ? `${(ms / 60000).toFixed(1)} min` : '—');
const cells = (s) => [
  s.n,
  frac(s.firstTry.num, s.firstTry.den) + (s.firstTry.excludedBlocked ? ` · ${s.firstTry.excludedBlocked} BLOCKED fuera` : ''),
  mins(s.medianDurationMs),
  s.meanRetries === null ? '—' : s.meanRetries.toFixed(2),
  `${frac(s.regressions.num, s.regressions.den)}${s.regressions.immature ? ` · ${s.regressions.immature} PASS con ventana <7 d` : ''}`,
  `${s.tokens.measured}/${s.tokens.of} medidas${s.tokens.measured ? ` · ${s.tokens.total.toLocaleString('es')} tokens` : ''}`,
  s.gate.runs ? `${frac(s.gate.evidenced, s.gate.criteria)} criterios con evidencia · ${s.gate.outOfScope} con cambios fuera de alcance` : 'sin registro de Gate',
  s.smallSample ? `muestra pequeña (N=${s.n} < 5): no comparar` : '',
];
const COLS = ['N', 'A la primera (PASS sin corrección / PASS+FAIL)', 'Mediana de duración', 'Correcciones medias', 'Regresiones (ventana 7 d)', 'Tokens (medidos)', 'Gate', 'Aviso'];
const excl = (m) => `${m.total} registros; fuera de las cifras: ${m.excluded['dry-run']} dry-run, ${m.excluded.running} sin terminar, ${m.excluded.interrupted} interrumpidas, ${m.excluded.blocked} BLOCKED (solo fuera del denominador de «a la primera»).`;

if (process.argv.includes('--summary')) {
  console.log(`autodev · ${excl(byMode)}`);
  for (const [title, m] of [['Total', { groups: [['todas', byMode.all]] }], ['Por modo', byMode], ['Por modo · origen (complejidad)', byOrigin], ['Por modelos medidos', byModels]]) {
    console.log(`\n${title}`);
    for (const [k, s] of m.groups) console.log(`  ${k}\n    ${COLS.map((c, i) => `${c}: ${cells(s)[i]}`).filter((l) => !/: $/.test(l)).join('\n    ')}`);
  }
  console.log('\nTokens: solo los que mide Claude Code (stream-json); coste API estimado ≠ coste de la suscripción, que la plataforma no expone.');
  process.exit(0);
}

const h = (s) => String(s ?? '—').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const table = (m) => (m.groups.length ? `<div class="wrap"><table><tr><th>Grupo</th>${COLS.map((c) => `<th>${h(c)}</th>`).join('')}</tr>${m.groups.map(([k, s]) => `<tr><td>${h(k)}</td>${cells(s).map((c) => `<td>${h(c)}</td>`).join('')}</tr>`).join('')}</table></div>` : '<p class="empty">Sin ejecuciones reales terminadas.</p>');
const qa = (r) => (r.phases ?? []).filter((p) => p.role === 'especialista').map((p) => `${p.name}${p.verdict ? ' ' + p.verdict : ''}`).join(', ') || '—';
const tests = (r) => (r.tests?.length ? `${r.tests.filter((t) => t.result === 'PASS').length}/${r.tests.length}` : '—');
const tokens = (r) => (r.tokens_measured ? ['input', 'output', 'cache_read', 'cache_creation'].reduce((a, k) => a + (r.tokens_measured[k] ?? 0), 0).toLocaleString('es') : 'no medido');
const cost = (r) => (r.api_cost_estimated ? `$${r.api_cost_estimated.usd}` : '—');
const rowsHtml = runs.map((r) => `<tr><td>${h(String(r.started_at).replace('T', ' ').slice(0, 16))}</td><td>${h(r.kind)}</td><td>${h(r.ticket)}</td><td class="task">${h(r.task)}</td><td>${h(r.mode)}${r.origin ? ` · ${h(r.origin)}` : ''}</td><td class="${h(r.result)}">${r.status === 'done' ? h(r.result) : r.status === 'interrupted' ? 'interrumpido' : 'sin terminar'}</td><td>${mins(r.duration_ms)}</td><td>${r.retries ? `${r.retries.count}/${r.retries.max ?? '?'}` : '—'}</td><td>${h(qa(r))}</td><td>${tests(r)}</td><td>${tokens(r)}</td><td>${cost(r)}</td><td>${(r.regressions ?? []).length || '—'}</td><td><code>${h(String(r.run_id).slice(0, 8))}</code></td></tr>`).join('');

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Registro autodev</title><style>
:root{--bg:#f7f6f2;--fg:#1d1d1b;--mute:#6b6a64;--line:#dedcd4;--pass:#2f7d3b;--fail:#b3261e;--block:#8a6d00}
@media (prefers-color-scheme:dark){:root{--bg:#161614;--fg:#ecebe6;--mute:#9a9890;--line:#33322e;--pass:#7cc487;--fail:#f08a80;--block:#e0c45c}}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:14px/1.45 ui-sans-serif,system-ui,sans-serif}
main{max-width:1100px;margin:auto}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:28px 0 8px}
p{color:var(--mute);margin:0 0 8px}table{border-collapse:collapse;width:100%}.wrap{overflow-x:auto}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top;white-space:nowrap}
td.task{white-space:normal;min-width:240px}th{font-weight:600;color:var(--mute)}code{font-size:13px}
.PASS{color:var(--pass);font-weight:600}.FAIL{color:var(--fail);font-weight:600}.BLOCKED{color:var(--block);font-weight:600}.empty{padding:12px 0}
</style></head><body><main>
<h1>Registro de /autodev</h1>
<p>Privado y local (.autodev/, fuera de git). ${h(excl(byMode))} Generado ${h(new Date().toISOString())}.</p>
<p>Tokens y coste API los mide Claude Code; el coste real de la suscripción no lo expone la plataforma. Con N &lt; 5 por grupo, no se compara.</p>
<h2>Total</h2>${table({ groups: [['todas', byMode.all]] })}
<h2>Por modo</h2>${table(byMode)}
<h2>Por modo · origen (complejidad)</h2>${table(byOrigin)}
<h2>Por modelos medidos</h2>${table(byModels)}
<h2>Ejecuciones</h2>${runs.length ? `<div class="wrap"><table><tr><th>Inicio</th><th>Tipo</th><th>Ticket</th><th>Tarea</th><th>Modo · origen</th><th>Resultado</th><th>Duración</th><th>Correcciones</th><th>QA</th><th>Tests</th><th>Tokens</th><th>Coste API est.</th><th>Regresiones</th><th>run_id</th></tr>${rowsHtml}</table></div>` : '<p class="empty">Sin datos.</p>'}
</main></body></html>`;

writeFileSync(join(LOG, '..', 'dashboard.html'), html);
console.log(`dashboard: .autodev/dashboard.html (${runs.length} ejecuciones)`);
