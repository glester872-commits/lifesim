#!/usr/bin/env node
// Dashboard privado de /autodev: lee .autodev/runs.jsonl y escribe .autodev/dashboard.html (estático, sin red).
// .autodev/ está en .gitignore: no se versiona ni se publica. Nada del juego lo importa.
//   node scripts/autodev-dashboard.mjs   → abre .autodev/dashboard.html en el navegador
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOG, readRuns } from './autodev-run.mjs';

const MIN = 3; // por debajo, una proporción no dice nada
const runs = readRuns(LOG).sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
const done = runs.filter((r) => r.status === 'done');
const h = (s) => String(s ?? '—').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pct = (n, d) => (d < MIN ? `N=${d} &lt; ${MIN}` : `${Math.round((100 * n) / d)} % (${n}/${d})`);
const mins = (ms) => (typeof ms === 'number' ? `${(ms / 60000).toFixed(1)} min` : '—');
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const firstTry = (r) => r.result === 'PASS' && (r.retries?.count ?? 0) === 0;
const qa = (r) => (r.phases ?? []).filter((p) => p.role === 'especialista').map((p) => `${p.name}${p.verdict ? ' ' + p.verdict : ''}`).join(', ') || '—';
const tests = (r) => (r.tests?.length ? `${r.tests.filter((t) => t.result === 'PASS').length}/${r.tests.length}` : '—');
const tokens = (r) => (r.tokens_measured ? ['input', 'output', 'cache_read', 'cache_creation'].reduce((a, k) => a + (r.tokens_measured[k] ?? 0), 0).toLocaleString('es') : 'no medido');
const cost = (r) => (r.api_cost_estimated ? `$${r.api_cost_estimated.usd}` : '—');

function group(key) {
  const g = new Map();
  for (const r of done) { const k = key(r); g.set(k, [...(g.get(k) ?? []), r]); }
  return [...g].sort((a, b) => String(b[0]).localeCompare(String(a[0])));
}
const groupRows = (rows) => rows.map(([k, rs]) => {
  const d = avg(rs.map((r) => r.duration_ms).filter((x) => typeof x === 'number'));
  const c = rs.length < MIN ? 'N &lt; mínimo' : avg(rs.map((r) => r.retries?.count ?? 0)).toFixed(1);
  return `<tr><td>${h(k)}</td><td>${rs.length}</td><td>${pct(rs.filter((r) => r.result === 'PASS').length, rs.length)}</td><td>${pct(rs.filter(firstTry).length, rs.length)}</td><td>${d === null ? '—' : mins(d)}</td><td>${c}</td></tr>`;
}).join('');
const head = '<tr><th>Grupo</th><th>N</th><th>PASS</th><th>A la primera</th><th>Duración media</th><th>Correcciones medias</th></tr>';

const empty = '<p class="empty">Sin datos. Lanza una ejecución con <code>node scripts/autodev-run.mjs "--audit …"</code>.</p>';
const counts = ['PASS', 'FAIL', 'BLOCKED'].map((v) => `${v} ${done.filter((r) => r.result === v).length}`).join(' · ');
const rowsHtml = runs.map((r) => `<tr><td>${h(String(r.started_at).replace('T', ' ').slice(0, 16))}</td><td class="task">${h(r.task)}</td><td>${h(r.mode)}</td><td class="${h(r.result)}">${r.status === 'done' ? h(r.result) : r.status === 'interrupted' ? 'interrumpido' : 'sin terminar'}</td><td>${mins(r.duration_ms)}</td><td>${r.retries ? `${r.retries.count}/${r.retries.max ?? '?'}` : '—'}</td><td>${h(qa(r))}</td><td>${tests(r)}</td><td>${tokens(r)}</td><td>${cost(r)}</td><td><code>${h(String(r.run_id).slice(0, 8))}</code></td></tr>`).join('');

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
<p>Privado y local (.autodev/, fuera de git). ${runs.length} ejecuciones registradas, ${done.length} terminadas: ${counts}. Generado ${h(new Date().toISOString())}.</p>
<p>Éxito a la primera (PASS sin correcciones): ${pct(done.filter(firstTry).length, done.length)}. Tokens y coste API los mide Claude Code; el coste real de la suscripción no lo expone la plataforma.</p>
<h2>Por modo</h2>${done.length ? `<div class="wrap"><table>${head}${groupRows(group((r) => r.mode))}</table></div>` : empty}
<h2>Tendencia por día</h2>${done.length ? `<div class="wrap"><table>${head}${groupRows(group((r) => String(r.started_at).slice(0, 10)))}</table></div>` : empty}
<h2>Ejecuciones</h2>${runs.length ? `<div class="wrap"><table><tr><th>Inicio</th><th>Tarea</th><th>Modo</th><th>Resultado</th><th>Duración</th><th>Correcciones</th><th>QA</th><th>Tests</th><th>Tokens</th><th>Coste API est.</th><th>run_id</th></tr>${rowsHtml}</table></div>` : empty}
</main></body></html>`;

writeFileSync(join(LOG, '..', 'dashboard.html'), html);
console.log(`dashboard: .autodev/dashboard.html (${runs.length} ejecuciones)`);
