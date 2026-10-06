// Suite de regresión: `npm run test:regression`. Tipos, cada paso de `npm run check` y el build,
// uno a uno; sigue aunque uno falle, resume al final y sale con código 1 si algo falló.
// `--fast` se salta el build de vite.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const steps: string[] = [
  'npx tsc --noEmit',
  ...pkg.scripts.check.split('&&').map((s: string) => s.trim()),
  ...(process.argv.includes('--fast') ? [] : ['npx vite build --logLevel error']),
];

const failed: string[] = [];
for (const cmd of steps) {
  const t = Date.now();
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8', cwd: new URL('..', import.meta.url) });
  const ok = r.status === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${cmd}  (${((Date.now() - t) / 1000).toFixed(1)} s)`);
  if (!ok) {
    failed.push(cmd);
    const out = `${r.stdout}\n${r.stderr}`.trim().split('\n');
    console.log(out.slice(-25).map((l) => `      ${l}`).join('\n'));
  }
}

// Lo que sólo se ve con el juego abierto (npm run dev, F3 activa el modo depuración).
console.log(`
Humo manual (navegador, no automatizado):
  - Arranca en Vallesco, se mueve con teclado y con el joystick táctil, choca con paredes y postes.
  - Entra y sale de casa, café y gimnasio; la puerta devuelve al mismo sitio.
  - Metro: compra tarjeta, sube al tren, viaja a Ribera Norte y vuelve.
  - Guarda, recarga la página y sigue en el mismo sitio, hora y dinero.
  - F3: zonas, panel del metro y recuadros de bicis; sin errores en la consola.`);

console.log(`\n${steps.length - failed.length}/${steps.length} pasos OK${failed.length ? ` · FALLAN: ${failed.join(' | ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
