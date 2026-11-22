// Prueba de atribución: checkout intacto; el fixture restaura solo PassengerAI.
import { spawnSync, execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const evidence = dirname(fileURLToPath(import.meta.url));
const root = dirname(evidence);
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (head !== 'd84f8fc85c4916e585e7b688356e81618ed10381') throw new Error(`HEAD cambió desde la auditoría: ${head}`);
const changed = execFileSync('git', ['diff', '--name-only', '--', 'src'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
if (changed.length !== 1 || changed[0] !== 'src/systems/PassengerAI.ts') {
  throw new Error(`No se puede atribuir el fixture con otros cambios src: ${JSON.stringify(changed)}`);
}
const originalCheck = execFileSync('git', ['show', 'd84f8fc:scripts/check-regression.ts'], { cwd: root, encoding: 'utf8' });
const actualCheck = readFileSync(join(root, 'scripts', 'check-regression.ts'), 'utf8');
if (originalCheck.replace(/\r\n/g, '\n') !== actualCheck.replace(/\r\n/g, '\n')) {
  throw new Error('check-regression.ts difiere del código base; no se ejecutará una prueba alterada');
}
const tempBase = resolve(tmpdir());
const fixture = mkdtempSync(join(tempBase, 'lifesim-qa03-regression-'));
try {
  cpSync(join(root, 'src'), join(fixture, 'src'), { recursive: true });
  mkdirSync(join(fixture, 'scripts'));
  writeFileSync(join(fixture, 'scripts', 'check-regression.ts'), actualCheck);
  writeFileSync(join(fixture, 'package.json'), '{"type":"module"}\n');
  const original = execFileSync('git', ['show', 'd84f8fc:src/systems/PassengerAI.ts'], { cwd: root, encoding: 'utf8' });
  writeFileSync(join(fixture, 'src', 'systems', 'PassengerAI.ts'), original);
  const start = Date.now();
  const result = spawnSync(process.execPath, [join(fixture, 'scripts', 'check-regression.ts')], { cwd: fixture, encoding: 'utf8', timeout: 90_000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
  writeFileSync(join(evidence, 'regression-baseline.stdout.log'), result.stdout ?? '');
  writeFileSync(join(evidence, 'regression-baseline.stderr.log'), result.stderr ?? '');
  const summary = { base: 'd84f8fc', restoredFile: 'src/systems/PassengerAI.ts', command: [process.execPath, 'scripts/check-regression.ts'], exitCode: result.status, durationMs: Date.now() - start, error: result.error?.message ?? null, assertionMatched: (result.stderr ?? '').includes('el guardado no vuelve igual'), srcChangesBeforeRun: changed };
  writeFileSync(join(evidence, 'regression-baseline.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  if (result.status !== 1 || !summary.assertionMatched) process.exitCode = 1;
} finally {
  const resolved = resolve(fixture);
  if (!resolved.startsWith(tempBase + sep) || !basename(resolved).startsWith('lifesim-qa03-regression-')) throw new Error('Ruta temporal fuera del ámbito esperado; no se elimina');
  rmSync(resolved, { recursive: true, force: true });
}
