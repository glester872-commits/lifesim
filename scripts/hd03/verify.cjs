// npm i --no-save playwright (or set PLAYWRIGHT_MODULE to an installed copy).
// Start npm run dev separately. HD03_URL, HD03_OUTPUT and HD03_BROWSER are optional.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve(process.env.HD03_OUTPUT || 'work/hd03');
fs.mkdirSync(output, {recursive:true});

(async () => {
  const browser = await chromium.launch({headless:true, channel:process.env.HD03_BROWSER || 'msedge'});
  const context = await browser.newContext({viewport:{width:1920,height:1080}});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const results = [];
  try {
    await page.goto(process.env.HD03_URL || 'http://127.0.0.1:5173');
    await page.waitForFunction(() => window.lifesim?.game.scene.isActive('World'), {timeout:120000});
    await page.evaluate(()=>lifesim.services.state.setAgenda({...lifesim.services.state.agenda,tour:'skipped'}));
    await page.keyboard.press('Escape');
    // Each context has isolated storage. All scenario preparation is through development APIs.
    const setup = async (id, hour, tile) => {
      await page.evaluate(async ({id,hour,tile}) => {
        const {getLocation} = await import('/src/systems/LocationSystem.ts');
        const def = getLocation(id);
        const s = lifesim.services;
        s.clock.setPaused(true);
        s.state.setClock(6,hour,0);
        lifesim.game.scene.getScene('World').teleport(id, tile || def.spawns.start || Object.values(def.spawns)[0]);
      }, {id,hour,tile});
      await page.waitForTimeout(900);
      await page.evaluate(() => { lifesim.services.clock.setPaused(true); });
    };
    if (!process.env.HD03_FOCUS) for (const id of ['district','ribera','cuatro-rios','velaria','puerta-central','arena']) {
      for (const hour of [14,23]) {
        await setup(id,hour);
        const metrics = await page.evaluate(async () => {
          const {getLocation} = await import('/src/systems/LocationSystem.ts');
          const w = lifesim.game.scene.getScene('World');
          const def = getLocation(lifesim.services.state.locationId);
          const c = w.cameras.main;
          c.stopFollow(); c.setZoom(1); c.centerOn(w.mapWidth/2,w.mapHeight/2);
          const people = w.children.list.filter(o => o.texture && /^(npc-|people|person-|player-|fight-)/.test(o.texture.key));
          return {id:def.id,finish:def.finish,people:people.length,scales:[...new Set(people.map(o=>o.scaleX))],windows:w.lighting.windowSpots.length};
        });
        assert.equal(metrics.finish,true,`${id}: missing shared finish`);
        assert.ok(metrics.scales.every(s=>s===1),`${id}: fractional people scale ${metrics.scales}`);
        await page.waitForTimeout(200);
        await page.screenshot({path:path.join(output,`${id}-${hour}.png`)});
        results.push({...metrics,hour});
        console.log('district',id,hour,JSON.stringify(metrics));
      }
    }
    // Close views of the original pilot edge (x=58) and the shopfronts.
    if (!process.env.HD03_FOCUS) for (const hour of [14,23]) {
      for (const [name,tile] of [['seam',{tx:58,ty:52}],['shops',{tx:56,ty:16}],['olmo',{tx:49,ty:52}]]) {
        await setup('district',hour,tile);
        await page.evaluate(() => {const w=lifesim.game.scene.getScene('World');w.cameras.main.setZoom(4).centerOn(w.player.x,w.player.y);});
        await page.waitForTimeout(200);
        await page.screenshot({path:path.join(output,`${name}-${hour}.png`)});
      }
    }
    // Walk with the real keyboard, enter home, leave and recover the save.
    await setup('district',14,{tx:41,ty:52});
    const before = await page.evaluate(()=>lifesim.services.state.position.x);
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(450); await page.keyboard.up('ArrowRight');
    assert.ok(await page.evaluate(()=>lifesim.services.state.position.x)>before+8,'keyboard movement');
    await setup('district',14,{tx:41,ty:51});
    await page.keyboard.press('e',{delay:120}); await page.waitForTimeout(1400);
    assert.equal(await page.evaluate(()=>lifesim.services.state.locationId),'home','enter home using E');
    await page.screenshot({path:path.join(output,'home-wall.png')});
    await page.evaluate(()=>{ const w=lifesim.game.scene.getScene('World');w.teleport('home',{tx:10,ty:13},'down'); });
    await page.waitForTimeout(700); await page.keyboard.press('e',{delay:120}); await page.waitForTimeout(1200);
    assert.equal(await page.evaluate(()=>lifesim.services.state.locationId),'district','leave home using E');
    await page.evaluate(()=>lifesim.services.save.save(lifesim.services.state.snapshot));
    const saved = await page.evaluate(()=>({money:lifesim.services.state.money,energy:lifesim.services.state.energy,location:lifesim.services.state.locationId}));
    await page.reload(); await page.waitForFunction(()=>window.lifesim?.game.scene.isActive('World'),{timeout:120000});
    assert.deepEqual(await page.evaluate(()=>({money:lifesim.services.state.money,energy:lifesim.services.state.energy,location:lifesim.services.state.locationId})),saved,'save reload');
    results.push({interaction:'keyboard walk, home enter/exit, save/reload',ok:true});
    await setup('district',23);
    await page.evaluate(()=>{lifesim.fight.goto();lifesim.fight.force();lifesim.fight.pin(true);});
    await page.waitForTimeout(1800);
    await page.evaluate(()=>{const w=lifesim.game.scene.getScene('World');const f=w.children.list.filter(o=>o.texture?.key.startsWith('fight-'));w.cameras.main.setZoom(4).centerOn(f.reduce((s,o)=>s+o.x,0)/f.length,f.reduce((s,o)=>s+o.y,0)/f.length);});
    await page.waitForTimeout(200);
    await page.screenshot({path:path.join(output,'fight.png')});
    const fighters = await page.evaluate(()=>{const w=lifesim.game.scene.getScene('World');return w.children.list.filter(o=>o.texture?.key.startsWith('fight-')).map(o=>({scale:o.scaleX,w:o.frame.width,h:o.frame.height}));});
    assert.equal(fighters.length,2,'two rendered fighters');
    assert.ok(fighters.every(f=>f.scale===1&&f.w===24&&f.h===28),'fighters use native pixel scale');
    results.push({fighters});
    // Regression: background glow, person, middle glow, person. Test actual GPU alpha.
    const depthQA = await page.evaluate(async () => {
      const {LightDepth} = await import('/src/world/LightDepth.ts');
      const {default:Phaser} = await import('/node_modules/.vite/deps/phaser.js');
      const scene = await new Promise(resolve => lifesim.game.scene.add('DepthQA',{create(){resolve(this);}},true));
      scene.cameras.main.setScroll(0,0); scene.cameras.main.preRender();
      const g = scene.make.graphics({x:0,y:0},false);g.fillStyle(0xffffff).fillRect(0,0,20,20);g.generateTexture('qa-solid',20,20);g.destroy();
      const d = LightDepth.of(scene);
      const back=scene.add.image(50,50,'qa-solid').setOrigin(0).setBlendMode(Phaser.BlendModes.ADD);
      const mid=scene.add.image(50,50,'qa-solid').setOrigin(0).setBlendMode(Phaser.BlendModes.ADD);
      d.light(back,10);d.light(mid,30);
      const a=scene.add.image(50,50,'qa-solid').setOrigin(0).setDepth(20);
      const b=scene.add.image(50,50,'qa-solid').setOrigin(0).setDepth(40);
      d.occluder(a);d.occluder(b);
      const sample = async () => {
        d.compose();
        const rt=d.layers.add;
        return await new Promise(resolve=>rt.snapshotPixel(55-rt.x,55-rt.y,c=>resolve(c.alpha)));
      };
      const front=await sample();
      b.setVisible(false);const between=await sample();
      mid.setVisible(false);const behind=await sample();
      a.setDepth(10);const sameFoot=await sample();
      a.setDepth(20).setAlpha(0.5);const faded=await sample();
      a.setPosition(90,50);const moved=await sample();
      const objectCount=scene.children.list.length;
      d.compose();const stable=scene.children.list.length===objectCount;
      lifesim.game.scene.remove('DepthQA');
      return {front,between,behind,sameFoot,faded,moved,stable};
    });
    assert.equal(depthQA.front,0,'front person hides both glows');
    assert.ok(depthQA.between>0,'middle glow survives the rear person');
    assert.equal(depthQA.behind,0,'rear glow hidden by rear person');
    assert.ok(depthQA.sameFoot>0,'light at the same foot survives');
    assert.ok(depthQA.faded>0&&depthQA.faded<255,'transparent occluder transmits light');
    assert.ok(depthQA.moved>0,'moving occluder leaves no baked hole');
    assert.ok(depthQA.stable,'no per-frame object growth');
    results.push({depthQA});
    const mobile = await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
    const touch = await mobile.newPage();
    touch.on('pageerror',e=>errors.push(e.message));
    await touch.goto(process.env.HD03_URL || 'http://127.0.0.1:5173');
    await touch.waitForFunction(()=>window.lifesim?.game.scene.isActive('World'),{timeout:120000});
    await touch.evaluate(()=>{lifesim.services.state.setAgenda({...lifesim.services.state.agenda,tour:'skipped'});lifesim.services.menu.cancel();});
    for (const hour of [14,23]) {
      await touch.evaluate(hour=>{lifesim.services.state.setClock(6,hour,0);lifesim.game.scene.getScene('World').teleport('district',{tx:41,ty:51});},hour);
      await touch.waitForTimeout(700);
      await touch.screenshot({path:path.join(output,`mobile-${hour}.png`)});
    }
    await touch.locator('#map-button').tap();
    await touch.waitForTimeout(200);
    assert.equal(await touch.evaluate(()=>lifesim.services.map.isOpen),true,'touch map opens');
    await touch.locator('#map [data-act="close"]').tap();
    assert.equal(await touch.evaluate(()=>lifesim.services.map.isOpen),false,'touch map closes');
    results.push({mobile:'390x844 @2x, day/night, touch map open/close',ok:true});
    await mobile.close();
    assert.deepEqual(errors,[],'browser errors');
    fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify({ok:true,results,errors},null,2));
    console.log('HD03 visual/runtime verification OK');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
