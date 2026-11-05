// Piloto de entradas reales para recorridos (LV-01). Chrome propio con perfil temporal (nunca la partida
// personal) y órdenes sueltas por CDP: teclas y dedos MANTENIDOS de verdad (Input.dispatchKeyEvent /
// dispatchTouchEvent), clics, capturas y lectura del texto que ve el jugador. No lee ni toca `lifesim`.
//
//   node scripts/qa/pilot.mjs start [desktop|mobile]   (antes: npm run dev -- --port 5199)
//   node scripts/qa/pilot.mjs walk <n|ne|e|se|s|sw|w|nw> <ms>     teclado WASD mantenido
//   node scripts/qa/pilot.mjs key <E|M|P|I|Escape|Space|Enter|1..9|+|-> [ms]
//   node scripts/qa/pilot.mjs stick <dir> <ms>          joystick con un dedo real
//   node scripts/qa/pilot.mjs touch <x> <y> [ms]         toque (mantenido ms) en px CSS
//   node scripts/qa/pilot.mjs tap <selector | texto>     clic en un botón visible
//   node scripts/qa/pilot.mjs wait <ms>                  dejar correr el reloj (2 min de juego por segundo)
//   node scripts/qa/pilot.mjs read                       HUD, aviso, diálogo y menú visibles
//   Cada acción reanuda la pausa del juego antes y la vuelve a poner después (añade --live para no pausar);
//   `read` y `shot` miran sin reanudar.
//   node scripts/qa/pilot.mjs shot <archivo.png>
//   node scripts/qa/pilot.mjs selftest                   comprueba teclas y joystick (sí lee el juego)
//   node scripts/qa/pilot.mjs stop
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 9341;
const URL = 'http://localhost:5199/';
const STATE = join(tmpdir(), 'lifesim-pilot.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DIRS = { n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0], nw: [-1, -1] };
const KEYS = {
  W: ['w', 'KeyW', 87], A: ['a', 'KeyA', 65], S: ['s', 'KeyS', 83], D: ['d', 'KeyD', 68], E: ['e', 'KeyE', 69],
  M: ['m', 'KeyM', 77], P: ['p', 'KeyP', 80], I: ['i', 'KeyI', 73], Q: ['q', 'KeyQ', 81], Escape: ['Escape', 'Escape', 27],
  Space: [' ', 'Space', 32], Enter: ['Enter', 'Enter', 13], '+': ['+', 'BracketRight', 187], '-': ['-', 'Slash', 189],
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [String(n), [String(n), `Digit${n}`, 48 + n]])),
};

async function connect() {
  const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
  const page = list.find((t) => t.type === 'page' && t.url.startsWith(URL)) ?? list.find((t) => t.type === 'page');
  if (!page) throw new Error('Sin página: ¿pilot start?');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = ko; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); pending.get(m.id)?.(m); };
  const send = (method, params = {}) => new Promise((ok, ko) => {
    const n = ++id;
    pending.set(n, (m) => (m.error ? ko(new Error(JSON.stringify(m.error))) : ok(m.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails));
    return r.result.value;
  };
  return { ws, send, evaluate };
}

const keyEvent = (send, type, name) => {
  const [key, code, kc] = KEYS[name] ?? (() => { throw new Error(`Tecla desconocida: ${name}`); })();
  return send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: kc, nativeVirtualKeyCode: kc, text: type === 'keyDown' && key.length === 1 ? key : undefined });
};

// Mantener = keyDown repetido cada 50 ms (como la autorrepetición del sistema): si el juego suelta las teclas al salir
// de la pausa (releaseAll/resetKeys), la siguiente repetición las vuelve a apretar y no se pierde el paseo.
async function holdKeys(send, names, ms) {
  const end = Date.now() + ms;
  do {
    for (const k of names) await keyEvent(send, 'keyDown', k);
    await sleep(Math.min(50, Math.max(0, end - Date.now())));
  } while (Date.now() < end);
  for (const k of names.reverse()) await keyEvent(send, 'keyUp', k);
}

async function hold(send, from, to, ms) {
  const point = (p) => [{ x: p[0], y: p[1], id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(from) });
  for (let k = 1; k <= 4; k++) {
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point([from[0] + (to[0] - from[0]) * k / 4, from[1] + (to[1] - from[1]) * k / 4]) });
    await sleep(16);
  }
  await sleep(ms);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const stickVector = async (evaluate, dir) => {
  const r = await evaluate(`(() => { const b = document.querySelector('.touch__stick').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2, b.width / 2]; })()`);
  const [dx, dy] = DIRS[dir];
  const n = Math.hypot(dx, dy);
  return [[r[0], r[1]], [r[0] + (dx / n) * r[2] * 0.9, r[1] + (dy / n) * r[2] * 0.9]];
};
const wasd = (dir) => { const [dx, dy] = DIRS[dir]; return [...(dy < 0 ? ['W'] : dy > 0 ? ['S'] : []), ...(dx < 0 ? ['A'] : dx > 0 ? ['D'] : [])]; };

const VISIBLE_TEXT = `(() => {
  const vis = (e) => e && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && e.getBoundingClientRect().height > 0;
  const t = (s) => [...document.querySelectorAll(s)].filter(vis).map((e) => e.innerText.trim().replace(/\\s+/g, ' ')).filter(Boolean);
  return { hud: t('#hud'), hint: t('#hint'), place: t('#place'), announce: t('#announce'), toast: t('#phone-toast'), dialogue: t('#dialogue'), menu: t('.menu, #menu, #bag'), phone: t('#phone'), map: t('#map').map((s) => s.slice(0, 80)), paused: t('#pause').length > 0, title: t('#title'), action: t('.touch__action') };
})()`;

const [cmd, ...args] = process.argv.slice(2);
if (cmd === 'start') {
  const mobile = args[0] === 'mobile';
  const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
  if (!chromePath) throw new Error('Chrome no disponible');
  const profile = mkdtempSync(join(tmpdir(), 'lifesim-pilot-'));
  // El tamaño, la densidad y el táctil van en el arranque: la emulación de CDP se pierde al cerrar cada orden.
  const screen = mobile ? ['--window-size=390,844', '--force-device-scale-factor=3', '--touch-events=enabled'] : ['--window-size=1440,900', '--force-device-scale-factor=1'];
  const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...screen, URL], { stdio: 'ignore', detached: true, windowsHide: true });
  chrome.unref();
  writeFileSync(STATE, JSON.stringify({ pid: chrome.pid, profile, mobile }));
  for (let i = 0; i < 80; i++) { await sleep(250); if (await fetch(`http://127.0.0.1:${PORT}/json/list`).then(() => true).catch(() => false)) break; }
  console.log(`pilot: Chrome ${chrome.pid} (${mobile ? 'móvil 390×844@3 táctil' : 'escritorio 1440×900'}), perfil aislado ${profile}`);
} else if (cmd === 'stop') {
  const s = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : null;
  try { const { send } = await connect(); await send('Browser.close').catch(() => {}); } catch { /* ya cerrado */ }
  await sleep(800);
  if (s) { rmSync(s.profile, { recursive: true, force: true, maxRetries: 5 }); rmSync(STATE, { force: true }); }
  console.log('pilot: cerrado');
} else {
  const { ws, send, evaluate } = await connect();
  // Pausa del propio juego (permitida en el recorrido): el reloj sólo corre mientras se ejecuta una acción, no
  // mientras quien juega piensa. Se reanuda con «Seguir» y se vuelve a pausar con el botón Menú.
  // Sólo estas órdenes reanudan; `read` y `shot` miran con la pausa puesta. Cada espera cuesta reloj de juego
  // (1 s real = 2 min), así que no hay ninguna aparte de los 350 ms que pide el juego al seguir.
  const ACTIONS = new Set(['walk', 'key', 'stick', 'touch', 'tap', 'wait']);
  const click = async (selector) => {
    const at = await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e || e.getBoundingClientRect().height === 0 || getComputedStyle(e).visibility === 'hidden') return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    if (!at) return false;
    for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: at[0], y: at[1], button: 'left', clickCount: 1 });
    return true;
  };
  const paused = () => evaluate(`!!document.querySelector('#pause [data-action="resume"]') && document.querySelector('#pause').getBoundingClientRect().height > 0`);
  // Al seguir, el juego suelta todas las teclas (main.ts, SimulationPause): esperar a que la escena corra de nuevo.
  if (ACTIONS.has(cmd) && (await paused())) { await click('#pause [data-action="resume"]'); await sleep(350); }
  try {
    if (cmd === 'wait') {
      await sleep(Number(args[0] ?? 1000)); // dejar correr el reloj del juego (esperar a una hora)
    } else if (cmd === 'walk') {
      await holdKeys(send, wasd(args[0]), Number(args[1] ?? 500));
    } else if (cmd === 'key') {
      await holdKeys(send, [args[0]], Number(args[1] ?? 120));
    } else if (cmd === 'stick') {
      await hold(send, ...(await stickVector(evaluate, args[0])), Number(args[1] ?? 500));
    } else if (cmd === 'touch') {
      const p = [Number(args[0]), Number(args[1])];
      await hold(send, p, p, Number(args[2] ?? 60));
    } else if (cmd === 'tap') {
      const sel = args.join(' ');
      const at = await evaluate(`(() => { const vis = (e) => e.getBoundingClientRect().height > 0 && getComputedStyle(e).visibility !== 'hidden';
        let el = null; try { el = [...document.querySelectorAll(${JSON.stringify(sel)})].find(vis); } catch {}
        el ??= [...document.querySelectorAll('button, [role=button], li, a')].filter(vis).find((b) => b.innerText.trim().toLowerCase().includes(${JSON.stringify(sel.toLowerCase())}));
        if (!el) return null; const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2, el.innerText.trim().slice(0, 40)]; })()`);
      if (!at) throw new Error(`No hay nada visible para «${sel}»`);
      for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: at[0], y: at[1], button: 'left', clickCount: 1 });
      console.log(`tap: «${at[2]}»`);
    } else if (cmd === 'read') {
      console.log(JSON.stringify(await evaluate(VISIBLE_TEXT), null, 1));
    } else if (cmd === 'shot') {
      // Con la pausa puesta: el panel se esconde sólo durante la captura; el reloj no corre.
      await evaluate(`(() => { const p = document.querySelector('#pause'); if (p) p.style.visibility = 'hidden'; })()`);
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      await evaluate(`(() => { const p = document.querySelector('#pause'); if (p) p.style.visibility = ''; })()`);
      writeFileSync(args[0], Buffer.from(data, 'base64'));
      console.log(`shot: ${args[0]}`);
    } else if (cmd === 'selftest') {
      // Prueba de la herramienta, no del recorrido: aquí sí se lee la posición del jugador.
      const pos = () => evaluate(`(() => { const p = window.lifesim.game.scene.getScene('World').player; return [Math.round(p.x), Math.round(p.y)]; })()`);
      const mobile = JSON.parse(readFileSync(STATE, 'utf8')).mobile;
      const out = {};
      const push = async (d, ms) => { if (mobile) await hold(send, ...(await stickVector(evaluate, d)), ms); else await holdKeys(send, wasd(d), ms); await sleep(150); };
      // Hacia su lado = producto escalar positivo y al menos 4 px. Si una pared lo para, se aparta y lo repite una vez.
      const toward = (d, [x, y]) => x * DIRS[d][0] + y * DIRS[d][1] > 0 && Math.hypot(x, y) >= 4;
      const OPPOSITE = { n: 's', s: 'n', e: 'w', w: 'e', ne: 'sw', sw: 'ne', nw: 'se', se: 'nw' };
      for (const d of ['s', 'n', 'e', 'w', 'se', 'nw', 'sw', 'ne']) {
        for (let attempt = 0; attempt < 2; attempt++) {
          const a = await pos();
          await push(d, 400);
          const b = await pos();
          out[d] = [b[0] - a[0], b[1] - a[1]];
          if (toward(d, out[d])) break;
          await push(OPPOSITE[d], 500);
        }
      }
      const ok = Object.entries(out).every(([d, v]) => toward(d, v));
      console.log(JSON.stringify(out), ok ? 'OK: cada dirección mueve hacia su lado' : 'FALLO: alguna dirección no mueve hacia su lado');
      process.exitCode = ok ? 0 : 1;
    } else throw new Error(`Orden desconocida: ${cmd}`);
    if (ACTIONS.has(cmd) && !args.includes('--live') && !(await paused())) {
      if (!(await click('#pause-button'))) console.log('aviso: no se pudo pausar (botón Menú no visible)');
    }
  } finally {
    ws.close();
  }
}
