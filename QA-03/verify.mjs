// Artefactos del Quality Gate: solo ejecuta pruebas y guarda sus salidas.
// No modifica código, refs, configuración ni partidas.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const evidence = dirname(fileURLToPath(import.meta.url));
const root = dirname(evidence);
const npm = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const cases = [
  ['passenger-access', ['scripts/check-passenger-access.ts'], 0],
  ['passenger-baseline', ['scripts/check-passenger-access.ts', '--baseline'], 1],
  ...['metro', 'metro-demand', 'metro-transfers', 'navigation', 'regression', 'save-torture', 'save-slots']
    .map((name) => [name, [`scripts/check-${name}.ts`], 0]),
  ['build', [npm, 'run', 'build'], 0],
  ['check', [npm, 'run', 'check'], 0],
];
const selected = process.argv[2] ? cases.filter(([name]) => name === process.argv[2]) : cases;
if (!selected.length) throw new Error('Caso desconocido');
mkdirSync(evidence, { recursive: true });
const summary = [];
for (const [name, args, expectedExit] of selected) {
  if ((name === 'build' || name === 'check') && !existsSync(npm)) throw new Error(`npm CLI no disponible: ${npm}`);
  console.log(`START ${name}: node ${args.join(' ')}`);
  const start = Date.now();
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 300_000, maxBuffer: 32 * 1024 * 1024, windowsHide: true });
  writeFileSync(join(evidence, `${name}.stdout.log`), result.stdout ?? '');
  writeFileSync(join(evidence, `${name}.stderr.log`), result.stderr ?? '');
  const item = { case: name, command: [process.execPath, ...args], exitCode: result.status, expectedExit, error: result.error?.message ?? null, durationMs: Date.now() - start, matchedExpectedExit: result.status === expectedExit };
  summary.push(item);
  writeFileSync(join(evidence, 'results.json'), JSON.stringify(summary, null, 2));
  console.log(`END ${name}: exit=${result.status}, esperado=${expectedExit}, ${item.durationMs}ms${item.error ? `, ${item.error}` : ''}`);
}
const diff = spawnSync('git', ['diff', '--', 'src/systems/PassengerAI.ts'], { cwd: root, encoding: 'utf8', windowsHide: true });
writeFileSync(join(evidence, 'changes.patch'), diff.stdout ?? '');
if (summary.some((item) => !item.matchedExpectedExit)) process.exitCode = 1;
