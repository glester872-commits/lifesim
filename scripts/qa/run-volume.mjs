// Reproducible WebGL test and visual evidence, isolated from the user's save.
// node scripts/qa/run-volume.mjs [evidence-directory]
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';
const evidence = resolve(process.argv[2] || 'design/volume-evidence');
mkdirSync(evidence, { recursive: true });
const chromePath = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => p && existsSync(p));
if (!chromePath) throw new Error('Set CHROME to a Chrome executable');
const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 5189, strictPort: true, hmr: false } });
await server.listen();
const profile = mkdtempSync(join(tmpdir(), 'lifesim-volume-'));
const port = 9348;
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,800', 'about:blank'], { stdio: 'ignore', windowsHide: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
try {
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    await wait(200);
    target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent('http://127.0.0.1:5189')}`, { method: 'PUT' }).then((r) => r.json()).catch(() => null);
  }
  if (!target) throw new Error('Chrome debug port unavailable');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails);
    pending.get(m.id)?.(m);
  };
  const call = (method, params = {}) => new Promise((ok, fail) => {
    const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); fail(new Error(`${method} timeout`)); }, 60000);
    pending.set(n, (m) => { clearTimeout(timer); pending.delete(n); m.error ? fail(new Error(JSON.stringify(m.error))) : ok(m.result); });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const until = async (expression) => {
    for (let i = 0; i < 140; i++) {
      if (await evaluate(expression).catch(() => false)) return;
      await wait(200);
    }
    await shot('failure');
    throw new Error(`Not ready: ${expression}; ${await evaluate('location.href+" "+document.body.innerText.slice(0,2000)')}; ${JSON.stringify(errors).slice(0, 2000)}`);
  };
  const shot = async (name) => {
    if (name !== 'failure') await evaluate(`VQA.step(60)`);
    if (name !== 'failure') await until(`!!window.lifesim?.game.scene.getScene('World')?.player && !lifesim.game.scene.getScene('World').cameras.main.fadeEffect.isRunning`);
    const { data } = await call('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(evidence, `${name}.png`), Buffer.from(data, 'base64'));
    console.log('screenshot:', name);
  };
  await call('Runtime.enable');
  await call('Page.enable');
  await call('Page.bringToFront');
  await call('Emulation.setFocusEmulationEnabled', { enabled: true });
  console.log('loading title');
  await until(`!!document.querySelector('[data-action="new"]')`);
  await evaluate(`document.querySelector('[data-action="new"]').click()`);
  await until(`[...document.querySelectorAll('button')].some(b=>b.offsetParent && b.textContent.trim()==='Continuar')`);
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.offsetParent && b.textContent.trim()==='Continuar').click()`);
  await until(`[...document.querySelectorAll('button')].some(b=>b.offsetParent && b.textContent.trim()==='Empezar')`);
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.offsetParent && b.textContent.trim()==='Empezar').click()`);
  await until(`!!window.lifesim?.game.scene.getScene('World')?.player`);
  console.log('world ready');
  await evaluate(`window.VQA={wait:ms=>new Promise(r=>setTimeout(r,ms)), W:()=>lifesim.game.scene.getScene('World'),S:lifesim.services}; VQA.S.state.setAgenda({...VQA.S.state.agenda,tour:'skipped'}); VQA.S.dialogue.close(); VQA.S.menu.close(); VQA.S.clock.release();VQA.S.clock.setPaused(false);VQA.S.state.setClock(6,14,0); VQA.W().teleport('district',{tx:36,ty:51},'up');`);
  await evaluate(`lifesim.game.loop.sleep(); VQA.t=performance.now()+5000; VQA.step=(n)=>{for(let i=0;i<n;i++)lifesim.game.step(VQA.t+=16,16)};VQA.step(30);void 0;`);
  await wait(1000);
  const initial = await evaluate(`({location:VQA.S.state.locationId,volumes:VQA.W().children.list.filter(o=>o.name?.startsWith('volume:')).map(o=>({name:o.name,x:o.x,y:o.y,w:o.width,h:o.height,depth:o.depth})),renderer:lifesim.game.renderer.type})`);
  console.log('initial:', JSON.stringify(initial));
  if (initial.volumes.length !== 3) throw new Error('Expected three volumetric buildings');
  await shot('after-day');
  // Matched baseline: only strip the opt-in render data in this disposable browser.
  await evaluate(`(async()=>{ const {getLocation}=await import('/src/systems/LocationSystem.ts'); VQA.def=getLocation('district'); VQA.volumes=VQA.def.buildings.map(b=>b.volume); VQA.def.buildings.forEach(b=>delete b.volume); VQA.W().scene.restart({locationId:'district',position:{x:584,y:830},facing:'up'}); })()`);
  await wait(1200);
  await evaluate(`VQA.step(30)`);
  console.log('testing movement');
  await shot('before-day');
  await evaluate(`VQA.def.buildings.forEach((b,i)=>{if(VQA.volumes[i])b.volume=VQA.volumes[i]}); VQA.W().scene.restart({locationId:'district',position:{x:584,y:830},facing:'up'}); void 0;`);
  await wait(1200);
  await evaluate(`VQA.step(60)`);
  const checks = [];
  const check = (name, pass, detail) => { checks.push({ name, pass, detail }); if (!pass) console.error('FAIL',name,JSON.stringify(detail)); };
  const motion = await evaluate(`(()=>{const W=VQA.W(), S=VQA.S; W.teleport('district',{tx:41,ty:51},'right'); const x=W.player.x; S.input.setStick(1,0); VQA.step(30); S.input.releaseAll(); return {from:x,to:W.player.x};})()`);
  check('walk along facade',motion.to>motion.from+15,motion);
  const wall = await evaluate(`(()=>{const W=VQA.W(),S=VQA.S; W.teleport('district',{tx:40,ty:51},'up');S.input.setStick(0,-1);VQA.step(45);S.input.releaseAll(); return {y:W.player.y,wall:51*16};})()`);
  check('facade collision',wall.y>=wall.wall,wall);
  await evaluate(`VQA.W().teleport('district',{tx:41,ty:51},'up')`);
  await wait(400);
  await evaluate(`VQA.S.input.press('interact'); VQA.step(45);void 0;`);
  await wait(700);
  await evaluate(`VQA.S.input.releaseAll()`);
  check('enter home',await evaluate(`VQA.S.state.locationId==='home'`),await evaluate(`VQA.S.state.locationId`));
  await evaluate(`(async()=>{const{getLocation}=await import('/src/systems/LocationSystem.ts');const d=getLocation('home'),p=d.portals[0];VQA.W().teleport('home',{tx:p.tx,ty:p.ty},'down')})()`);
  await wait(300);
  await evaluate(`VQA.S.input.press('interact'); VQA.step(45);void 0;`);
  await wait(700);
  await evaluate(`VQA.S.input.releaseAll()`);
  check('exit home',await evaluate(`VQA.S.state.locationId==='district'`),await evaluate(`VQA.S.state.locationId`));
  // Walk behind the raised north edge, then in front: real silhouette fading and restoration.
  await evaluate(`VQA.W().teleport('district',{tx:41,ty:41},'right')`);
  await evaluate(`VQA.step(60)`);
  await wait(650);
  const behind = await evaluate(`VQA.W().children.getByName('volume:home-door').alpha`);
  check('occlusion reveals player behind roof',behind<0.6,behind);
  await shot('behind-roof');
  await evaluate(`VQA.W().teleport('district',{tx:36,ty:51},'up');VQA.S.state.setClock(6,22,0)`);
  await evaluate(`VQA.step(60)`);
  await wait(800);
  const front = await evaluate(`VQA.W().children.getByName('volume:home-door').alpha`);
  check('building returns opaque',front>0.98,front);
  await shot('after-night');
  await evaluate(`VQA.S.save.save(VQA.S.state.snapshot)`);
  const saved = await evaluate(`({location:VQA.S.state.locationId,money:VQA.S.state.money,hour:VQA.S.state.hour})`);
  await call('Page.reload');
  await until(`!!document.querySelector('[data-action="continue"]')`);
  await evaluate(`document.querySelector('[data-action="continue"]').click()`);
  await until(`!!window.lifesim?.game.scene.getScene('World')?.player`);
  const restored = await evaluate(`({location:lifesim.services.state.locationId,money:lifesim.services.state.money,hour:lifesim.services.state.hour})`);
  check('save and reload',saved.location===restored.location&&saved.money===restored.money&&saved.hour===restored.hour,{saved,restored});
  check('no runtime exceptions',errors.length===0,errors);
  const result={initial,checks,pass:checks.every(c=>c.pass),errors};
  writeFileSync(join(evidence,'results.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
  if (!result.pass) process.exitCode=1;
} finally {
  ws?.close();chrome.kill();await server.close();await wait(500);
  if (resolve(profile).startsWith(resolve(tmpdir()) + '\\') && profile.includes('lifesim-volume-')) try { rmSync(profile,{recursive:true,force:true}); } catch { /* Chrome still releasing the temporary profile. */ }
}
