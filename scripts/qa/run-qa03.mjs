// QA-04 · lanza qa03-metro-tracks.js sin nadie delante: Vite (el de node_modules, por su API), el Chrome del sistema en
// headless con WebGL por software (SwiftShader) y el protocolo de depuración de Chrome con el WebSocket de Node (≥ 22).
// Sin dependencias nuevas. Partida nueva en un perfil temporal (no toca ninguna partida guardada), estación de Vallesco
// a las 8:15, y la prueba. Sale con 0 si pasa y 1 si no.
//
//   node scripts/qa/run-qa03.mjs [ciclos] [estación]      p. ej. node scripts/qa/run-qa03.mjs 20 arena-station
//   CHROME=/ruta/a/chrome node scripts/qa/run-qa03.mjs    si Chrome no está en el sitio de siempre
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cycles = Number(process.argv[2] ?? 20);
const station = process.argv[3] ?? 'vallesco-station';
const CHROMES = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
const chromePath = CHROMES.find((p) => p && existsSync(p));
if (!chromePath) {
  console.error('No encuentro Chrome: pásalo con CHROME=/ruta/a/chrome');
  process.exit(2);
}
const VITE_PORT = 5196;
const CDP_PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = await createServer({ root, logLevel: 'error', server: { port: VITE_PORT, strictPort: true, hmr: false } });
await server.listen();
const profile = mkdtempSync(join(tmpdir(), 'lifesim-qa03-'));
const chrome = spawn(chromePath, [
  '--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=480,270', 'about:blank',
], { stdio: 'ignore' });

let ws;
let code = 1;
try {
  let target = null;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    target = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(`http://localhost:${VITE_PORT}/`)}`, { method: 'PUT' }).then((r) => r.json()).catch(() => null);
  }
  if (!target) throw new Error('Chrome no abre el puerto de depuración');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = ko; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (pending.has(msg.id)) pending.get(msg.id)(msg);
  };
  const evaluate = (expression, timeout = 2_400_000) => new Promise((ok, ko) => {
    const n = ++id;
    const timer = setTimeout(() => ko(new Error('tiempo agotado')), timeout);
    pending.set(n, (msg) => {
      clearTimeout(timer);
      pending.delete(n);
      const r = msg.result;
      if (msg.error || r?.exceptionDetails) ko(new Error(JSON.stringify(msg.error ?? r.exceptionDetails).slice(0, 600)));
      else ok(r.result.value);
    });
    ws.send(JSON.stringify({ id: n, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
  });

  // La pestaña nace en about:blank y navega al juego: hasta que la página ha cargado, cada evaluación puede perder su
  // contexto («Execution context was destroyed»). Se espera a la portada antes de tocar nada.
  let loaded = false;
  for (let i = 0; i < 100 && !loaded; i++) {
    loaded = await evaluate(`location.href.startsWith('http') && document.readyState === 'complete' && !!document.querySelector('[data-action="new"]')`, 5_000).catch(() => false);
    if (!loaded) await sleep(300);
  }
  if (!loaded) throw new Error('la portada no carga');

  // Partida nueva con el creador por defecto, y a la estación.
  const ready = await evaluate(`(async () => {
    const w = (ms) => new Promise((r) => setTimeout(r, ms));
    const button = (t) => [...document.querySelectorAll('button')].find((b) => b.offsetParent && b.textContent.trim() === t);
    for (let i = 0; i < 100 && !document.querySelector('[data-action="new"]'); i++) await w(200);
    document.querySelector('[data-action="new"]').click();
    for (let i = 0; i < 100 && !button('Continuar'); i++) await w(200);
    button('Continuar').click();
    for (let i = 0; i < 100 && !button('Empezar'); i++) await w(200);
    button('Empezar').click();
    for (let i = 0; i < 200 && !window.lifesim?.game?.scene?.getScene('World')?.player; i++) await w(300);
    const S = lifesim.services, W = lifesim.game.scene.getScene('World');
    await w(1500);
    while (S.dialogue.isOpen) S.dialogue.close();
    S.state.setClock(S.state.day, 8, 15);
    W.teleport(${JSON.stringify(station)}, { tx: 11, ty: 12 }, 'up');
    await w(2500);
    while (S.dialogue.isOpen) S.dialogue.close();
    S.clock.release(); S.clock.setPaused(false);
    window.__qa03Cycles = ${cycles};
    return { location: S.state.locationId, renderer: lifesim.game.renderer.type === 2 ? 'WebGL' : 'Canvas' };
  })()`, 120_000);
  console.log('preparado:', JSON.stringify(ready));
  const test = readFileSync(join(root, 'scripts/qa/qa03-metro-tracks.js'), 'utf8');
  const result = await evaluate(`(${test})()`);
  console.log(JSON.stringify(result, null, 2));
  code = result?.pass ? 0 : 1;
  console.log(result?.pass ? 'QA-03/04 PASS' : 'QA-03/04 FAIL');
} catch (error) {
  console.error('QA-03/04 no se ha podido ejecutar:', error.message);
  code = 2;
} finally {
  ws?.close();
  chrome.kill();
  await server.close();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome aún suelta el perfil: es temporal */ }
}
process.exit(code);
