#!/usr/bin/env node
// E2E jugable de LIFE//SIM (AGENT-V2-05). Herramienta de desarrollo: nada de src/ lo importa. Sin dependencias nuevas:
// reutiliza el arnés de scripts/qa (Vite + Chrome headless por CDP con perfil TEMPORAL, nunca la partida personal) y las
// entradas reales de pilot.mjs (Input.dispatchKeyEvent / dispatchTouchEvent / dispatchMouseEvent). La API `window.lifesim`
// solo existe con `npm run dev` (src/main.ts, import.meta.env.DEV): se usa para preparar el fixture y para LEER el estado;
// la acción que se prueba entra siempre como input del jugador.
//
//   npm run test:e2e                      todos los casos (salida 0 = todo PASS, 1 = algún FAIL, 2 = algún BLOCKED o fallo de arnés)
//   npm run test:e2e -- --only=metro,save casos concretos (ECO/BALANCED: los afectados)
//   npm run test:e2e -- --list            requisito, entrada, esperado, negativo y regresión de cada caso
//   npm run test:e2e -- --negative        control negativo: un caso con la expectativa mal a propósito; debe salir 1
//   --port=5196 (o E2E_PORT)  --keep (no borra el perfil temporal)  --probe=<archivo.js> (evalúa un script tras partida nueva)
// Artefactos (capturas, consola, traza de pasos) en .autodev/e2e/<ejecución>/ (ignorado por git).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const opt = (k) => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const flag = (k) => argv.includes(`--${k}`);
const VITE_PORT = Number(opt('port') ?? process.env.E2E_PORT ?? 5196);
const CDP_PORT = VITE_PORT + 4000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ casos (documentación antes que código)
// status 'blocked' = la mecánica no existe o falta su vía de entrada: no se ejecuta, se informa con su ticket.
export const CASES = [
  {
    id: 'boot-move', title: 'Inicio y movimiento en escritorio',
    requirement: 'Partida nueva desde la portada; el jugador se mueve con el teclado.',
    input: 'Clic en Nueva partida → Continuar → Empezar; tecla D mantenida 700 ms (CDP keyDown/keyUp).',
    expected: 'El jugador avanza > 8 px hacia la derecha y sigue en el mismo sitio.',
    negative: 'Sin tecla, durante el mismo tiempo, no se mueve (< 1 px): el desplazamiento lo causa la entrada.',
    regression: 'MOV-01..03 (movimiento), QA.md «Arranca en Vallesco, se mueve con teclado».',
  },
  {
    id: 'collision', title: 'Colisión con una pared',
    requirement: 'El jugador no atraviesa paredes.',
    input: 'Fixture: andén de Vallesco (11,12). Tecla A mantenida hasta topar y 800 ms más.',
    expected: 'Primero avanza; después la x deja de cambiar (< 1 px) y no sale del mapa.',
    negative: 'Si la pared no frenara, la x seguiría bajando durante los 800 ms extra.',
    regression: 'QA.md «choca con paredes y postes».',
  },
  {
    id: 'metro', title: 'Calle → estación → tren → llegada → salida',
    requirement: 'Tarjeta en la máquina, subir al tren, viajar a Ribera Norte: €2 y 15 min por parada (CLAUDE.md).',
    input: 'Fixture: delante de la boca del metro (portal leído de los datos de la calle), 09:00 → E. Fixture: andén (11,6) → E sin tarjeta; máquina (14,12) → E y clic en «Tarjeta de transporte». Con el tren en BOARDING: W hasta el borde y E. En Ribera, delante del portal exit (de los datos) → E.',
    expected: 'Entra en la estación; sin tarjeta no sube; la tarjeta cuesta 12,50 € y da 10 €; el viaje descuenta exactamente 2 € y el reloj salta exactamente 15 min al llegar; la salida lleva a la calle de Ribera.',
    negative: 'Sin tarjeta, subir al tren se bloquea y no cambia de sitio.',
    regression: 'check-metro*, check-economy (tarifa), METRO-LV07.md.',
  },
  {
    id: 'npc-tracks', title: 'NPC dentro de zonas transitables (sin vía ni fondo negro)',
    requirement: 'Ningún pasajero ni vigilante pisa la vía (QA-03/QA-04).',
    input: 'Fixture: andén de Vallesco. Reutiliza scripts/qa/qa03-metro-tracks.js con 3 ciclos de tren.',
    expected: 'pass: true (ni un pie en la vía; contadores a cero; las invasiones provocadas se corrigen al fotograma siguiente).',
    negative: 'El propio escenario provoca invasiones y exige que la guarda salte.',
    regression: 'R-01 del registro (docs/AGENT-HARNESS.md); run-qa03.mjs.',
  },
  {
    id: 'save', title: 'Guardar, recargar y restaurar',
    requirement: 'Tras recargar la página, Continuar devuelve el mismo sitio, día, hora y dinero.',
    input: 'Partida nueva, movimiento con teclado, autoguardado; F5 real (Page.reload) y clic en Continuar.',
    expected: 'locationId, día, hora:minuto (±1 min) y dinero iguales; la posición dentro de 1 tile.',
    negative: 'La ranura queda en el perfil TEMPORAL: el perfil real del usuario no se toca.',
    regression: 'check-save-torture, check-save-slots, check-persistence (sin navegador).',
  },
  {
    id: 'mobile', title: 'Móvil 390×844 con entrada táctil',
    requirement: 'En móvil, joystick y botón de acción visibles y alcanzables; el HUD no los tapa.',
    input: 'Emulación 390×844 táctil; dedo real mantenido sobre el joystick 700 ms.',
    expected: 'El jugador se mueve; elementFromPoint en el centro del joystick y del botón E es el propio control; ningún rectángulo del HUD los cruza.',
    negative: 'Sin dedo no se mueve.',
    regression: 'CV-08/CV-09, MobileControls.ts.',
  },
  {
    id: 'visual', title: 'Capturas: zoom cercano y lejano, nearest-neighbor',
    requirement: 'Pixel art nítido (pixelArt sin suavizado); capturas para revisión humana de sprites, ojos y HUD.',
    input: 'Partida nueva; capturas con zoom máximo y mínimo (teclas + y −) en escritorio.',
    expected: 'game.config.pixelArt === true y antialias === false; capturas guardadas. La comparación estética es MANUAL: no hay baseline aprobada.',
    negative: 'Ninguna captura se aprueba como referencia automáticamente.',
    regression: 'R-02 del registro; check-eye-frame (ojos sobre un frame quieto).',
  },
  {
    id: 'bike', title: 'Bici: compra, recogida en casa, montar/desmontar, colisión y persistencia',
    status: 'blocked', ticket: 'V2-05-BIKE', critical: false,
    justification: 'No obligatorio: no está en la lista manual de CLAUDE.md «Antes de dar algo por terminado»; lo cubre check-bici sin navegador. Queda NO VERIFICADO en navegador hasta V2-05-BIKE.',
    requirement: 'La mecánica existe (LifeProjects buy-bike en ca-taller, ensurePlayerBike en la puerta de casa, mount/dismount con E).',
    input: '—', expected: '—', negative: '—',
    regression: 'H-001/R-03 del registro; check-bici.',
    why: 'Escenario de entrada real aún no escrito (compra en Campo Alto + trayecto a casa). No se inventa resultado.',
  },
  {
    id: 'shift', title: 'Turno de Decathlon y salario exactamente una vez',
    status: 'blocked', ticket: 'V2-05-SHIFT', critical: false,
    justification: 'No obligatorio: no está en la lista manual de CLAUDE.md; lo cubren check-decathlon, check-jobs y check-attendance sin navegador. Queda NO VERIFICADO en navegador hasta V2-05-SHIFT.',
    requirement: 'La mecánica existe (data/jobs.ts decathlon; Menus.clockIn cobra una vez por día: shifts[day]).',
    input: '—', expected: '—', negative: '—',
    regression: 'check-decathlon, check-jobs, check-attendance (sin navegador).',
    why: 'Escenario de entrada real aún no escrito (contrato + fichaje en el terminal). No se inventa resultado.',
  },
];

// ------------------------------------------------------------------ arnés
const chromePath = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => p && existsSync(p));

async function harness(artifacts, mobile) {
  const profile = mkdtempSync(join(tmpdir(), 'lifesim-e2e-'));
  const size = mobile ? '390,844' : '1280,800';
  const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', `--window-size=${size}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(200);
    target = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(`http://localhost:${VITE_PORT}/`)}`, { method: 'PUT' }).then((r) => r.json()).catch(() => null);
  }
  if (!target) { chrome.kill(); throw new Error('Chrome no abre el puerto de depuración'); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = ko; });
  let id = 0;
  const pending = new Map(), consoleLog = [], trace = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') consoleLog.push({ type: 'exception', text: m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text });
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) consoleLog.push({ type: m.params.type, text: m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 400) });
    pending.get(m.id)?.(m);
  };
  const send = (method, params = {}, timeout = 60_000) => new Promise((ok, ko) => {
    const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); ko(new Error(`${method}: tiempo agotado`)); }, timeout);
    pending.set(n, (m) => { clearTimeout(timer); pending.delete(n); m.error ? ko(new Error(`${method}: ${JSON.stringify(m.error)}`)) : ok(m.result); });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  await send('Runtime.enable');
  if (mobile) {
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  }
  const evaluate = async (expression, timeout = 120_000) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, timeout);
    if (r.exceptionDetails) throw new Error(`en la página: ${(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text).slice(0, 500)}`);
    return r.result.value;
  };
  /** Evalúa una función del navegador con argumentos JSON. */
  const page = (fn, ...args) => evaluate(`(${fn})(...${JSON.stringify(args)})`);
  const step = (what, data) => trace.push({ t: Date.now(), what, ...(data === undefined ? {} : { data }) });
  const waitFor = async (fn, what, timeout = 20_000, ...args) => {
    const end = Date.now() + timeout;
    for (;;) {
      const v = await page(fn, ...args).catch(() => null);
      if (v) return v;
      if (Date.now() > end) throw new Error(`esperando ${what}: tiempo agotado`);
      await sleep(150);
    }
  };
  const KEYS = { W: ['w', 'KeyW', 87], A: ['a', 'KeyA', 65], S: ['s', 'KeyS', 83], D: ['d', 'KeyD', 68], E: ['e', 'KeyE', 69], Escape: ['Escape', 'Escape', 27], '+': ['+', 'Equal', 187], '-': ['-', 'Minus', 189], Enter: ['Enter', 'Enter', 13] };
  const key = (type, name) => { const [k, code, kc] = KEYS[name]; return send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: kc, nativeVirtualKeyCode: kc, text: type === 'keyDown' && k.length === 1 ? k : undefined }); };
  const holdKeys = async (names, ms) => { step(`teclas ${names.join('+')} ${ms} ms`); for (const n of names) await key('keyDown', n); await sleep(ms); for (const n of names) await key('keyUp', n); };
  // 180 ms: una pulsación humana. Con swiftshader el juego va a pocos fps y una de 90 ms puede caer entre dos fotogramas.
  const press = (name) => holdKeys([name], 180);
  const click = async (x, y) => { step(`clic ${Math.round(x)},${Math.round(y)}`); for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); };
  const touchHold = async (from, to, ms) => {
    step(`dedo ${from} → ${to} ${ms} ms`);
    const pt = ([x, y]) => [{ x, y, id: 1 }];
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(from) });
    for (let k = 1; k <= 4; k++) await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt([from[0] + (to[0] - from[0]) * k / 4, from[1] + (to[1] - from[1]) * k / 4]) });
    await sleep(ms);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  /** Clic real en el centro del primer botón visible cuyo texto contiene `text` (o casa con un selector). */
  const clickText = async (text) => {
    // Una pantalla de menú recién abierta ignora elecciones durante PICK_LOCK_MS (src/config/constants.ts); el jugador real
    // tampoco elige antes. Se espera a que pase, leyendo el bloqueo del propio juego.
    await waitFor(async () => {
      const m = window.lifesim?.services?.menu;
      if (!m?.isOpen) return true;
      const { PICK_LOCK_MS } = await import('/src/config/constants.ts');
      return performance.now() - m.shownAt > PICK_LOCK_MS;
    }, 'el bloqueo de elección del menú', 5_000);
    const at = await waitFor((t) => {
      const els = [...document.querySelectorAll('button, [role="button"], li, [data-action]')].filter((b) => b.offsetParent && !b.disabled && b.getAttribute('aria-disabled') !== 'true');
      const b = els.find((x) => x.textContent.replace(/\s+/g, ' ').includes(t));
      if (!b) return null;
      b.scrollIntoView({ block: 'center' }); // como haría el jugador: el botón tiene que estar en pantalla para pulsarlo
      const r = b.getBoundingClientRect();
      return [r.x + r.width / 2, r.y + r.height / 2];
    }, `botón «${text}»`, 15_000, text);
    await click(at[0], at[1]);
  };
  const shot = async (name) => { const { data } = await send('Page.captureScreenshot', { format: 'png' }); const f = join(artifacts, `${name}.png`); writeFileSync(f, Buffer.from(data, 'base64')); return f.replace(/\\/g, '/').slice(root.length + 1); };
  const reload = async () => { step('F5 (Page.reload)'); await send('Page.reload', { ignoreCache: false }); await sleep(300); };
  const close = async () => { ws.close(); chrome.kill(); await sleep(400); if (!flag('keep')) try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome suelta el perfil tarde: es temporal */ } };
  return { send, evaluate, page, waitFor, holdKeys, press, click, clickText, touchHold, shot, reload, step, trace, consoleLog, close, profile };
}

// --- piezas comunes del lado del juego
async function newGame(h) {
  await h.waitFor(() => location.href.startsWith('http') && document.readyState === 'complete' && !!document.querySelector('[data-action="new"]'), 'la portada', 60_000);
  const at = await h.page(() => { const b = document.querySelector('[data-action="new"]'); const q = b.getBoundingClientRect(); return [q.x + q.width / 2, q.y + q.height / 2]; });
  await h.click(at[0], at[1]);
  await h.clickText('Continuar');
  await h.clickText('Empezar');
  await h.waitFor(() => !!window.lifesim?.game?.scene?.getScene('World')?.player, 'el jugador', 60_000);
  await closeTalk(h);
  // VID-12: la guía de los primeros días abre un menú al empezar; se elige con un clic, como el jugador.
  if (await h.waitFor(() => lifesim.services.menu.isOpen && document.body.textContent.includes('Explorar libremente'), 'la guía', 4_000).catch(() => false)) {
    await h.clickText('Explorar libremente');
    await h.waitFor(() => !lifesim.services.menu.isOpen, 'cerrar la guía');
  }
  await closeTalk(h);
  h.step('partida nueva');
}
const closeTalk = (h) => h.page(async () => { const w = (ms) => new Promise((r) => setTimeout(r, ms)); const S = lifesim.services; for (let i = 0; i < 20; i++) { while (S.dialogue.isOpen) S.dialogue.close(); await w(100); } S.clock.release?.(); S.clock.setPaused(false); return true; });
const read = (h) => h.page(() => { const S = lifesim.services, W = lifesim.game.scene.getScene('World'), st = S.state; return { loc: st.locationId, day: st.day, hour: st.hour, minute: st.minute, money: st.money, card: st.wallet?.cards?.transport ?? null, x: W.player.x, y: W.player.y, menu: S.menu.isOpen, dialogue: S.dialogue.isOpen }; });
/** Fixture: sitio, tile y hora (API de desarrollo). La acción que se prueba no pasa por aquí. */
async function place(h, loc, tx, ty, facing = 'up', hour = 9, minute = 0) {
  await h.page(async (loc, tx, ty, facing, hour, minute) => {
    const w = (ms) => new Promise((r) => setTimeout(r, ms));
    const S = lifesim.services;
    S.state.setClock(S.state.day, hour, minute);
    lifesim.game.scene.getScene('World').teleport(loc, { tx, ty }, facing);
    for (let i = 0; i < 60 && (S.state.locationId !== loc || !lifesim.game.scene.getScene('World').player); i++) await w(100);
    await w(600);
    return true;
  }, loc, tx, ty, facing, hour, minute);
  await closeTalk(h);
  h.step(`fixture: ${loc} (${tx},${ty}) ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
}
const menuText = (h) => h.page(() => { const S = lifesim.services; return S.menu.isOpen ? [...document.querySelectorAll('.menu__item')].filter((l) => l.offsetParent).map((l) => `${l.classList.contains('is-disabled') ? '×' : '·'}${l.textContent.replace(/\s+/g, ' ').trim()}`).join(' | ') : S.dialogue.isOpen ? `diálogo: ${document.body.innerText.slice(0, 0)}abierto` : 'cerrado'; });
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };
const pause = (ms) => sleep(ms);

// ------------------------------------------------------------------ escenarios
const RUN = {
  async 'boot-move'(h, ev) {
    await newGame(h);
    const a = await read(h); await pause(700); const b = await read(h);
    ev.push(`sin entrada 700 ms: Δx=${(b.x - a.x).toFixed(2)} Δy=${(b.y - a.y).toFixed(2)}`);
    ok(Math.hypot(b.x - a.x, b.y - a.y) < 1, 'el jugador se mueve sin entrada');
    await h.holdKeys(['D'], 700);
    const c = await read(h);
    ev.push(`D 700 ms: x ${b.x.toFixed(1)} → ${c.x.toFixed(1)} en ${c.loc}`);
    ok(c.x - b.x > 8, `D no mueve al jugador (Δx=${(c.x - b.x).toFixed(2)})`);
    ok(c.loc === b.loc, 'cambió de sitio al andar');
  },
  async collision(h, ev) {
    await newGame(h);
    await place(h, 'vallesco-station', 11, 12, 'left');
    const a = await read(h);
    await h.holdKeys(['A'], 3500); const b = await read(h);
    await h.holdKeys(['A'], 800); const c = await read(h);
    ev.push(`A 3500 ms: x ${a.x.toFixed(1)} → ${b.x.toFixed(1)}; A 800 ms más: → ${c.x.toFixed(1)}`);
    ok(a.x - b.x > 8, 'no llegó a moverse hacia la pared');
    ok(Math.abs(c.x - b.x) < 1, `atraviesa o sigue moviéndose contra la pared (Δx=${(c.x - b.x).toFixed(2)})`);
    ok(c.x > 0 && c.loc === 'vallesco-station', 'salió del mapa o del sitio');
  },
  async 'npc-tracks'(h, ev) {
    await newGame(h);
    await place(h, 'vallesco-station', 11, 12, 'up', 8, 15);
    const test = readFileSync(join(root, 'scripts/qa/qa03-metro-tracks.js'), 'utf8');
    const r = await h.evaluate(`(window.__qa03Cycles = 3, (${test})())`, 900_000);
    ev.push(`qa03-metro-tracks (3 ciclos): ${JSON.stringify(r).slice(0, 600)}`);
    ok(r?.pass === true, `qa03 no pasa: ${JSON.stringify(r?.failures ?? r).slice(0, 300)}`);
  },
  async save(h, ev) {
    await newGame(h);
    await h.holdKeys(['D'], 500);
    await pause(1500);
    const a = await read(h);
    const saved = await h.page(() => Object.keys(localStorage).filter((k) => k.startsWith('lifesim')).length);
    ok(saved > 0, 'no hay ninguna clave de guardado en el perfil temporal');
    await h.reload();
    await h.waitFor(() => document.readyState === 'complete' && [...document.querySelectorAll('button')].some((b) => b.offsetParent && /Continuar/.test(b.textContent)), 'Continuar en la portada', 60_000);
    await h.clickText('Continuar');
    await h.waitFor(() => !!window.lifesim?.game?.scene?.getScene('World')?.player, 'el jugador tras recargar', 60_000);
    await closeTalk(h);
    const b = await read(h);
    const mins = (s) => s.day * 1440 + s.hour * 60 + s.minute;
    ev.push(`antes: ${a.loc} d${a.day} ${a.hour}:${a.minute} €${a.money} (${a.x.toFixed(0)},${a.y.toFixed(0)}) · después: ${b.loc} d${b.day} ${b.hour}:${b.minute} €${b.money} (${b.x.toFixed(0)},${b.y.toFixed(0)})`);
    ok(b.loc === a.loc, `otro sitio tras recargar: ${a.loc} → ${b.loc}`);
    ok(b.money === a.money, `dinero distinto: ${a.money} → ${b.money}`);
    ok(Math.abs(mins(b) - mins(a)) <= 1, `hora distinta: ${mins(a)} → ${mins(b)}`);
    ok(Math.hypot(b.x - a.x, b.y - a.y) <= 16, 'posición a más de 1 tile');
  },
  async mobile(h, ev) {
    await newGame(h);
    const geo = await h.page(() => {
      const rect = (el) => { if (!el || !el.offsetParent) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
      const stick = document.querySelector('.touch__stick'), act = document.querySelector('.touch__action');
      const hit = (el) => { const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!top && (top === el || el.contains(top)); };
      const hud = [...document.querySelectorAll('#hud *')].filter((e) => e.offsetParent).map(rect).filter((r) => r && r.w > 0 && r.h > 0);
      const cross = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      return { stick: rect(stick), action: rect(act), stickHit: stick ? hit(stick) : false, actionHit: act ? hit(act) : false, hudOverStick: hud.some((r) => cross(r, rect(stick))), hudOverAction: hud.some((r) => cross(r, rect(act))), vw: innerWidth, vh: innerHeight };
    });
    ev.push(`viewport ${geo.vw}×${geo.vh}; joystick ${JSON.stringify(geo.stick)}; botón E ${JSON.stringify(geo.action)}`);
    ok(geo.stick && geo.action, 'falta el joystick o el botón E en móvil');
    ok(geo.stickHit && geo.actionHit, `control tapado por otro elemento (joystick ${geo.stickHit}, E ${geo.actionHit})`);
    ok(!geo.hudOverStick && !geo.hudOverAction, 'un elemento del HUD se cruza con un control táctil');
    ev.push(`captura: ${await h.shot('mobile-hud')}`);
    const a = await read(h); await pause(700); const a2 = await read(h);
    ok(Math.hypot(a2.x - a.x, a2.y - a.y) < 1, 'el jugador se mueve sin dedo');
    const c = [geo.stick.x + geo.stick.w / 2, geo.stick.y + geo.stick.h / 2];
    await h.touchHold(c, [c[0] + geo.stick.w / 2, c[1]], 700);
    const b = await read(h);
    ev.push(`sin dedo 700 ms: Δ=${Math.hypot(a2.x - a.x, a2.y - a.y).toFixed(2)}; dedo en el joystick hacia la derecha 700 ms: x ${a2.x.toFixed(1)} → ${b.x.toFixed(1)}`);
    ok(b.x - a2.x > 8, `el joystick no mueve al jugador (Δx=${(b.x - a2.x).toFixed(2)})`);
  },
  async visual(h, ev) {
    await newGame(h);
    const cfg = await h.page(() => ({ pixelArt: lifesim.game.config.pixelArt, antialias: lifesim.game.config.antialias, roundPixels: lifesim.game.config.roundPixels, rendering: getComputedStyle(document.querySelector('canvas')).imageRendering }));
    ev.push(`config: ${JSON.stringify(cfg)}`);
    ok(cfg.pixelArt === true && cfg.antialias === false, 'el render no es nearest-neighbor (pixelArt/antialias)');
    for (let i = 0; i < 6; i++) await h.press('+');
    ev.push(`captura zoom cercano: ${await h.shot('zoom-near')}`);
    for (let i = 0; i < 12; i++) await h.press('-');
    ev.push(`captura zoom lejano: ${await h.shot('zoom-far')}`);
    ev.push('revisión estética MANUAL: no hay baseline aprobada (NO VERIFICADO hasta que una persona las mire)');
  },
  async metro(h, ev) {
    await newGame(h);
    // Calle → estación: el portal de la boca del metro se lee de los datos de la calle; delante, E.
    const door = await h.page(async (from) => { const { getLocation } = await import('/src/systems/LocationSystem.ts'); const p = getLocation(from).portals.find((q) => q.to?.location === 'vallesco-station'); return p ? { tx: p.tx, ty: p.ty, from } : null; }, await h.page(() => lifesim.services.state.locationId));
    ok(door, 'la calle de inicio no tiene portal a vallesco-station');
    await place(h, door.from, door.tx, door.ty + 1, 'up', 9, 0);
    await h.holdKeys(['W'], 300);
    let inside = false;
    for (let attempt = 1; attempt <= 2 && !inside; attempt++) {
      await h.press('E');
      inside = await h.waitFor(() => lifesim.services.state.locationId === 'vallesco-station', 'entrar en la estación', 8_000).then(() => true, () => false);
      ev.push(`calle → estación, intento ${attempt}: portal ${door.from} (${door.tx},${door.ty}) con E → ${inside ? 'vallesco-station' : 'sigue en la calle'}`);
    }
    ok(inside, 'E delante de la boca del metro no entra en la estación');
    await closeTalk(h);
    await place(h, 'vallesco-station', 11, 6, 'up', 9, 0);
    const a = await read(h);
    if (!a.card) {
      await h.press('E'); await pause(1200);
      const n = await read(h);
      ev.push(`sin tarjeta, E en el andén: sigue en ${n.loc}`);
      ok(n.loc === 'vallesco-station', 'sin tarjeta se sube igualmente al tren');
      await closeTalk(h);
      await h.page(() => { const S = lifesim.services; if (S.menu.isOpen) S.menu.close(); return true; });
      await place(h, 'vallesco-station', 14, 12, 'up', 9, 0);
      await h.press('E');
      await h.waitFor(() => lifesim.services.menu.isOpen, 'el menú de la máquina');
      ev.push(`menú de la máquina: ${await menuText(h)}`);
      await h.clickText('Tarjeta de transporte');
      await pause(800);
      ev.push(`tras el clic: ${await menuText(h)} · captura ${await h.shot('tras-tarjeta')}`);
      await closeTalk(h);
      await h.page(() => { const S = lifesim.services; if (S.menu.isOpen) S.menu.close(); return true; });
    }
    const b = await read(h);
    ev.push(`tarjeta: ${a.card ?? 'ninguna'} → ${b.card} · dinero ${a.money} → ${b.money}`);
    ok(b.card > 0, 'no se pudo conseguir saldo en la tarjeta');
    await place(h, 'vallesco-station', 11, 6, 'up', 9, 0);
    // Observador de solo lectura: anota cada cambio de sitio con la hora de juego de ese instante (cada 20 ms). Así el
    // tiempo del viaje se mide de subir a llegar, sin contar la espera del tren ni pausar nada (el horario del tren va
    // con el reloj: pausarlo cambiaría el comportamiento).
    await h.page(() => {
      const st = lifesim.services.state;
      const now = () => st.day * 1440 + st.hour * 60 + st.minute;
      let prev = now();
      const log = (window.__e2eLoc = [{ loc: st.locationId, abs: prev, prevAbs: prev }]);
      window.__e2eLocTimer = setInterval(() => { const a = now(); if (st.locationId !== log[log.length - 1].loc) log.push({ loc: st.locationId, abs: a, prevAbs: prev }); prev = a; }, 20);
      return true;
    });
    const c = await read(h);
    // Como el jugador: espera al tren con puertas abiertas (MetroSystem.train.state, condición y no espera fija), camina
    // hasta el borde del andén (W) y pulsa E. Si el tren se va antes, lo intenta con el siguiente (máx. 2, anotado).
    let boarded = false;
    for (let attempt = 1; attempt <= 2 && !boarded; attempt++) {
      await h.waitFor(() => lifesim.game.scene.getScene('World').metroSystem?.train?.state === 'BOARDING', 'el tren con puertas abiertas', 180_000);
      await h.holdKeys(['W'], 1200);
      await h.press('E');
      boarded = await h.waitFor(() => lifesim.services.state.locationId !== 'vallesco-station' || lifesim.services.menu.isOpen, 'subir al tren', 12_000).then(() => true, () => false);
      ev.push(`intento ${attempt} de subir: ${boarded ? 'sube' : 'no sube (el tren se fue)'}`);
    }
    ok(boarded, 'no se consigue subir al tren con E en dos trenes seguidos');
    if (await h.page(() => lifesim.services.menu.isOpen)) await h.clickText('Ribera');
    await h.waitFor(() => lifesim.services.state.locationId === 'ribera-station', 'llegar a Ribera Norte', 90_000);
    const d = await read(h);
    await closeTalk(h);
    const hops = await h.page(() => { clearInterval(window.__e2eLocTimer); return window.__e2eLoc; });
    const arriveAt = hops.find((x) => x.loc === 'ribera-station');
    const ride = arriveAt.abs - arriveAt.prevAbs; // salto del reloj en el cambio de sitio (muestreo cada 20 ms)
    const hm = (a) => `${Math.floor(a % 1440 / 60)}:${String(a % 60).padStart(2, '0')}`;
    ev.push(`sitios: ${hops.map((x) => `${x.loc}@${hm(x.abs)} (antes ${hm(x.prevAbs)})`).join(' → ')}`);
    ev.push(`viaje: tarjeta ${c.card} → ${d.card}; salto del reloj al llegar ${ride} min`);
    ok(Math.round((c.card - d.card) * 100) === 200, `la tarjeta no baja exactamente 2 € (${c.card} → ${d.card})`);
    ok(ride === 15, `el viaje Vallesco→Ribera no suma 15 min de juego (${ride})`);
    // La salida se lee de los datos del sitio (portal 'exit'), nunca de coordenadas escritas a mano.
    const exit = await h.page(async () => { const { getLocation } = await import('/src/systems/LocationSystem.ts'); const p = getLocation('ribera-station').portals.find((q) => q.id === 'exit'); return { tx: p.tx, ty: p.ty }; });
    ev.push(`portal de salida de Ribera: (${exit.tx},${exit.ty})`);
    await place(h, 'ribera-station', exit.tx, exit.ty - 1, 'down', d.hour, d.minute);
    await h.holdKeys(['S'], 900);
    await h.press('E'); // el portal pide E («Salir a la calle»), no se cruza andando
    await h.waitFor(() => lifesim.services.state.locationId !== 'ribera-station', 'salir a la calle', 15_000);
    const e = await read(h);
    ev.push(`salida: ${e.loc}`);
    ok(e.loc !== 'ribera-station', 'no se sale de la estación');
  },
  // Control negativo: la misma comprobación de boot-move con una expectativa imposible. Debe FALLAR.
  async 'negative-control'(h, ev) {
    await newGame(h);
    const a = await read(h);
    await h.holdKeys(['D'], 300);
    const b = await read(h);
    ev.push(`control negativo: Δx=${(b.x - a.x).toFixed(1)}; se exige Δx > 100000`);
    ok(b.x - a.x > 100000, 'control negativo: la expectativa imposible falla, como debe');
  },
};

// ------------------------------------------------------------------ ejecución
async function main() {
  if (flag('list')) {
    for (const c of CASES) console.log(`\n[${c.id}] ${c.title} · ${c.critical === false ? 'no obligatorio' : 'OBLIGATORIO'}${c.status === 'blocked' ? `  (sin escenario · ${c.ticket})` : ''}\n  requisito: ${c.requirement}\n  entrada:   ${c.input}\n  esperado:  ${c.expected}\n  negativo:  ${c.negative}\n  regresión: ${c.regression}${c.why ? `\n  motivo:    ${c.why}` : ''}`);
    return 0;
  }
  if (!chromePath) { console.error('e2e: no hay Chrome (pon CHROME=<ruta>). Resultado: BLOCKED (NO VERIFICADO sin navegador)'); return 2; }
  const only = opt('only')?.split(',');
  const probe = opt('probe');
  const selected = probe ? [{ id: 'probe' }] : flag('negative') ? [{ id: 'negative-control' }] : CASES.filter((c) => !only || only.includes(c.id));
  if (!selected.length) { console.error(`e2e: ningún caso con --only=${only}`); return 2; }
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const base = join(root, '.autodev', 'e2e', runId);
  mkdirSync(base, { recursive: true });
  const server = await createServer({ root, logLevel: 'error', server: { host: 'localhost', port: VITE_PORT, strictPort: true, hmr: false } });
  await server.listen();
  const results = [];
  try {
    for (const c of selected) {
      // Gate DEEP estricto (decisión del usuario, V2-07): un caso obligatorio que no se ejecuta es BLOCKED; uno no
      // obligatorio queda NO VERIFICADO con su justificación escrita. Nunca se omite en silencio ni cuenta como PASS.
      if (c.status === 'blocked') {
        const st = c.critical === false ? 'NO VERIFICADO' : 'BLOCKED';
        results.push({ id: c.id, status: st, critical: c.critical !== false, evidence: [`${c.ticket}: ${c.why}`, ...(c.justification ? [c.justification] : [])] });
        console.log(`${st} ${c.id}  (${c.ticket}: ${c.why}${c.justification ? ` · ${c.justification}` : ''})`);
        continue;
      }
      const dir = join(base, c.id); mkdirSync(dir, { recursive: true });
      const t0 = Date.now(), ev = [];
      let h, status = 'PASS', error = null;
      try {
        h = await harness(dir, c.id === 'mobile');
        if (probe) { await newGame(h); console.log(JSON.stringify(await h.evaluate(`(${readFileSync(resolve(probe), 'utf8')})()`, 600_000), null, 2)); }
        else await RUN[c.id](h, ev);
      } catch (e) {
        status = 'FAIL'; error = e.message;
        if (h) try { ev.push(`captura del fallo: ${await h.shot('fallo')}`); } catch { /* sin página */ }
      }
      if (h) {
        writeFileSync(join(dir, 'trace.json'), JSON.stringify(h.trace, null, 2));
        writeFileSync(join(dir, 'console.json'), JSON.stringify(h.consoleLog, null, 2));
        const errs = h.consoleLog.filter((l) => l.type !== 'warning');
        if (errs.length) ev.push(`consola: ${errs.length} error(es) → ${join(dir, 'console.json').replace(/\\/g, '/').slice(root.length + 1)}`);
        if (status === 'PASS' && errs.some((l) => l.type === 'exception')) { status = 'FAIL'; error = `excepción en la página: ${errs.find((l) => l.type === 'exception').text?.slice(0, 200)}`; }
        await h.close();
      }
      results.push({ id: c.id, status, ms: Date.now() - t0, error, evidence: ev });
      console.log(`${status.padEnd(7)} ${c.id}  (${((Date.now() - t0) / 1000).toFixed(1)} s)${error ? `\n        ${error}` : ''}${ev.length ? `\n        ${ev.join('\n        ')}` : ''}`);
    }
  } finally {
    await server.close();
  }
  writeFileSync(join(base, 'results.json'), JSON.stringify(results, null, 2));
  const n = (s) => results.filter((r) => r.status === s).length;
  console.log(`\ne2e: ${n('PASS')} PASS · ${n('FAIL')} FAIL · ${n('BLOCKED')} BLOCKED · ${n('NO VERIFICADO')} NO VERIFICADO (no obligatorios) → .autodev/e2e/${runId}/`);
  return n('FAIL') ? 1 : n('BLOCKED') ? 2 : 0; // NO VERIFICADO de casos no obligatorios no bloquea, pero se informa
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code), (e) => { console.error(`e2e: fallo del arnés: ${e.message}`); process.exit(2); });
}
