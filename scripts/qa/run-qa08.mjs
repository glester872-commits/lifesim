import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!chromePath) throw Error('Chrome no disponible');
const server = await createServer({ root, logLevel: 'error', server: { port: 5198, strictPort: true, hmr: false } });
await server.listen();
const profile = mkdtempSync(join(tmpdir(), 'lifesim-qa08-'));
const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=9335', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=960,720', 'about:blank'], { stdio: 'ignore', windowsHide: true });
let ws;
let code = 1;
try {
  let target;
  for (let i=0;i<80&&!target;i++) {
    await sleep(200);
    target = await fetch('http://127.0.0.1:9335/json/new?http://localhost:5198', {method:'PUT'}).then(r=>r.json()).catch(()=>null);
  }
  if (!target) throw Error('Chrome no inicia');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok,ko)=>{ws.onopen=ok;ws.onerror=ko;});
  let id=0;
  const pending=new Map();
  const errors=[];
  ws.onmessage=e=>{
    const msg=JSON.parse(e.data);
    if(msg.method==='Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.text);
    if(msg.method==='Runtime.consoleAPICalled') {const text=msg.params.args.map(a=>a.value??'').join(' ');if(text.startsWith('QA08'))console.log(text);}
    pending.get(msg.id)?.(msg);
  };
  const send=(method,params={})=>new Promise((ok,ko)=>{
    const n=++id;
    const timer=setTimeout(()=>{pending.delete(n);ko(Error('Timeout '+method));},180000);
    pending.set(n,msg=>{clearTimeout(timer);pending.delete(n);if(msg.error)ko(Error(JSON.stringify(msg.error)));else ok(msg.result);});
    ws.send(JSON.stringify({id:n,method,params}));
  });
  const evaluate=async expression=>{
    const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  await send('Runtime.enable');
  const wait=async expression=>{
    for(let i=0;i<240;i++) {if(await evaluate(expression).catch(()=>false))return;await sleep(250);}
    throw Error('No se cumple: '+expression);
  };
  await wait("!!document.querySelector('[data-action=new]')");
  await evaluate(`(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    const button=t=>[...document.querySelectorAll('button')].find(b=>b.offsetParent&&b.textContent.trim()===t);
    document.querySelector('[data-action=new]').click();
    for(let i=0;i<100&&!button('Continuar');i++)await wait(150);
    button('Continuar').click();
    for(let i=0;i<100&&!button('Empezar');i++)await wait(150);
    button('Empezar').click();
  })()`);
  await wait("!!window.lifesim?.game.scene.getScene('World')?.player");
  await sleep(1800);
  const result=await evaluate('('+readFileSync(join(root,'scripts/qa/qa08-gameplay.js'),'utf8')+')()');
  console.log('GAMEPLAY',JSON.stringify(result));
  mkdirSync(join(root,'design/qa08'),{recursive:true});
  const screenshot=async name=>{
    await evaluate('window.__qaRender()');
    const shot=await send('Page.captureScreenshot',{format:'png'});
    writeFileSync(join(root,'design/qa08',name),Buffer.from(shot.data,'base64'));
  };
  await screenshot('combate-escritorio.png');
  for (const [key,code,side] of [['j',74,'L'],['k',75,'R']]) {
    await evaluate("(()=>{const b=lifesim.game.scene.getScene('World').spar.bout;b.p.move=null;b.p.stunUntil=0;b.o.move=null;b.o.x=4;b.ai.next=Infinity;})()");
    await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:'Key'+key.toUpperCase(),windowsVirtualKeyCode:code,nativeVirtualKeyCode:code});
    await evaluate('window.__qaFrames(1)');
    const got=await evaluate('lifesim.game.scene.getScene("World").spar.bout.p.move?.side');
    if(got!==side)throw Error('Teclado incorrecto '+key+': '+got);
    await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:'Key'+key.toUpperCase(),windowsVirtualKeyCode:code,nativeVirtualKeyCode:code});
    await evaluate('window.__qaFrames(60)');
  }
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
  await sleep(500);
  const touch=[];
  for(const key of ['kickLeft','kickRight']) {
    // Espera/IA desactivada sólo para aislar cada botón táctil.
    await evaluate(`(()=>{const b=lifesim.game.scene.getScene('World').spar.bout;b.p.move=null;b.p.stunUntil=0;b.o.move=null;b.o.x=4;b.ai.next=Infinity;})()`);
    const rect=await evaluate(`(()=>{const b=document.querySelector('#spar-panel [data-key=${key}]').getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};})()`);
    if(rect.w<44||rect.h<44||rect.x<0||rect.y+rect.h>844)throw Error('Botón inaccesible '+JSON.stringify(rect));
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rect.x+rect.w/2,y:rect.y+rect.h/2,id:0}]});
    await evaluate('window.__qaFrames(1)');
    const side=await evaluate('lifesim.game.scene.getScene("World").spar.bout.p.move?.side');
    if(side!==(key==='kickLeft'?'L':'R'))throw Error('Botón incorrecto '+key+': '+side);
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    touch.push({key,side,rect});
    await evaluate('window.__qaFrames(60)');
  }
  await screenshot('combate-movil-emulado.png');
  await evaluate('lifesim.game.events.emit("lifesim:pause");window.__qaFrames(2)');
  await evaluate(`Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'))`);
  const paused=await evaluate('({paused:lifesim.game.scene.isPaused("World"),t:lifesim.game.scene.getScene("World").spar.bout.t})');
  await evaluate('window.__qaFrames(100)');
  await evaluate(`Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'))`);
  const still=await evaluate('({paused:lifesim.game.scene.isPaused("World"),t:lifesim.game.scene.getScene("World").spar.bout.t})');
  if(!paused.paused||!still.paused||paused.t!==still.t)throw Error('Pausa anidada incorrecta');
  await evaluate('document.querySelector("#pause [data-action=resume]").click();window.__qaFrames(3)');
  const saved=await evaluate('(()=>{const S=lifesim.services;S.save.save(S.state.snapshot);return {money:S.state.money,paid:S.state.fitness.academies.taekwondo.paid};})()');
  await send('Page.reload');
  await wait("!!document.querySelector('[data-action=continue]')");
  await evaluate("document.querySelector('[data-action=continue]').click()");
  await wait("!!window.lifesim?.game.scene.getScene('World')?.player");
  const reloaded=await evaluate(`(async()=>{
    const S=lifesim.services;const W=lifesim.game.scene.getScene('World');
    const {quote,settle}=await import('/src/systems/Fitness.ts');
    const at=(S.state.day-1)*1440+S.state.hour*60+S.state.minute;
    const q=quote(settle(S.state.fitness,at),'tkd-kicks-front','normal',S.state.energy,{money:S.state.money,hour:S.state.hour,minute:S.state.minute,at});
    return {money:S.state.money,paid:S.state.fitness.academies.taekwondo.paid,fee:q.fee,wait:q.wait,blocked:q.blocked,spar:!!W.spar};
  })()`);
  if(reloaded.money!==saved.money||reloaded.paid!==saved.paid||reloaded.fee!==0||reloaded.wait!==0||reloaded.spar)throw Error('Recarga incorrecta '+JSON.stringify({saved,reloaded}));
  const boxingSaved=await evaluate(`(async()=>{
    const G=lifesim.game,S=lifesim.services,W=G.scene.getScene('World');
    S.dialogue.close();S.clock.release();S.state.setClock(7,18,1);S.state.money=100;S.state.energy=100;
    S.state.fitness={...S.state.fitness,fatigue:0,academies:{}};
    W.teleport('boxing',{tx:18,ty:7},'up');
    await new Promise(r=>setTimeout(r,1600));
    const scene=G.scene.getScene('World');S.dialogue.close();
    const target=scene.interactables.find(i=>i.kind==='station'&&i.station==='boxing-bag'&&!scene.stationBusy(i.point));
    if(!target)throw Error('Sin saco libre para recarga');
    scene.startWorkout(target,'normal',30);
    await new Promise(r=>setTimeout(r,1000));
    if(!scene.workout||S.state.money!==94)throw Error('Admisión de boxeo para recarga incorrecta');
    S.save.save(S.state.snapshot);
    return {money:S.state.money,paid:S.state.fitness.academies.boxing.paid};
  })()`);
  await send('Page.reload');
  await wait("!!document.querySelector('[data-action=continue]')");
  await evaluate("document.querySelector('[data-action=continue]').click()");
  await wait("!!window.lifesim?.game.scene.getScene('World')?.player");
  const boxingReloaded=await evaluate(`(async()=>{
    const S=lifesim.services,W=lifesim.game.scene.getScene('World');
    const {quote,settle}=await import('/src/systems/Fitness.ts');
    const at=(S.state.day-1)*1440+S.state.hour*60+S.state.minute;
    const q=quote(settle(S.state.fitness,at),'boxing-bag','normal',S.state.energy,{money:S.state.money,hour:S.state.hour,minute:S.state.minute,at});
    return {money:S.state.money,paid:S.state.fitness.academies.boxing.paid,fee:q.fee,wait:q.wait,blocked:q.blocked,workout:!!W.workout};
  })()`);
  if(boxingReloaded.money!==boxingSaved.money||boxingReloaded.paid!==boxingSaved.paid||boxingReloaded.fee!==0||boxingReloaded.wait!==0||boxingReloaded.workout)throw Error('Recarga boxeo incorrecta '+JSON.stringify(boxingReloaded));
  console.log('QA08 recarga real boxeo PASS',JSON.stringify(boxingReloaded));
  if(errors.length)throw Error('Errores en navegador: '+JSON.stringify(errors));
  writeFileSync(join(root,'design/qa08/runtime.json'),JSON.stringify({result,touch,paused,still,reloaded,boxingReloaded,errors,environment:'Chrome headless, SwiftShader; escritorio y móvil emulado. No teléfono físico.'},null,2));
  console.log('QA-08 RUNTIME PASS',JSON.stringify({touch,paused,still,reloaded}));
  code=0;
} catch(e) { console.error('QA-08 FAIL',e.stack); }
finally {
  ws?.close();chrome.kill();await server.close();await sleep(400);
  try {const target=resolve(profile);if(dirname(target)===resolve(tmpdir())&&basename(target).startsWith('lifesim-qa08-'))rmSync(target,{recursive:true,force:true});}catch{}
}
process.exit(code);
