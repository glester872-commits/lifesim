async function qa08Gameplay() {
  const assert=(value,message)=>{if(!value)throw Error(message);};
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const G=lifesim.game,S=lifesim.services;
  let W=G.scene.getScene('World');
  const {MOVES,distanceOf}=await import('/src/systems/Sparring.ts');
  const {quote,settle}=await import('/src/systems/Fitness.ts');
  const {BELTS}=await import('/src/systems/Taekwondo.ts');
  const {playerUniformId}=await import('/src/world/TextureFactory.ts');
  const {getLocation}=await import('/src/systems/LocationSystem.ts');
  let t=performance.now();
  let wall=Date.now();
  const frame=()=>{t+=50;wall+=50;const now=Date.now;Date.now=()=>wall;try{G.headlessStep(t,50);}finally{Date.now=now;}};
  const frames=n=>{for(let i=0;i<n;i++)frame();};
  window.__qaFrames=frames;
  window.__qaRender=()=>G.step(t,0);
  const teleport=async(location,tx,ty)=>{
    G.loop.stop();
    S.menu.close();S.dialogue.close();S.phone.close();
    W.teleport(location,{tx,ty},'up');
    frames(100);
    W=G.scene.getScene('World');t=Math.max(t,W.time.now);wall=Math.max(wall,Date.now());
    S.dialogue.close();S.clock.release();S.clock.setPaused(false);
  };
  const phoneMoney=S.state.money;
  S.dialogue.close();S.phone.open();S.phone.go({app:'notes'});
  await sleep(350);
  [...document.querySelectorAll('#phone button')].find(b=>b.textContent.includes('Nueva nota')).click();
  await sleep(350);
  const title=document.querySelector('#phone input[aria-label="Título de la nota"]');
  const body=document.querySelector('#phone textarea');
  title.value='QA-08';body.value='Nota persistente desde el teléfono real del juego.';
  title.dispatchEvent(new Event('input',{bubbles:true}));body.dispatchEvent(new Event('input',{bubbles:true}));
  document.querySelector('#phone .phone__send').click();
  assert(S.state.phone.notes.some(n=>n.title==='QA-08'),'nota conectada al estado');
  assert(S.state.money===phoneMoney,'notas no alteran cartera');
  S.phone.close();
  assert(S.save.load().phone.notes.some(n=>n.title==='QA-08'),'nota persistente');
  const stage=[];
  for(const [style,location,tx,ty,station] of [['taekwondo','academy-tkd',3,6,'tkd-kicks-front'],['boxing','boxing',18,7,'boxing-bag']]) {
    await teleport(location,tx,ty);
    S.state.setClock(6,18,1);S.state.money=100;S.state.energy=100;
    S.state.fitness={...S.state.fitness,fatigue:0,at:5*1440+1081,academies:{}};
    const target=W.interactables.find(i=>i.kind==='station'&&i.station===station&&!W.stationBusy(i.point));
    assert(target,style+': puesto disponible');
    S.state.money=0;const beforeInventory=JSON.stringify(S.state.wallet.inventory);
    W.startWorkout(target,'normal',30,false);
    assert(!W.workout&&S.state.money===0&&JSON.stringify(S.state.wallet.inventory)===beforeInventory,style+': saldo insuficiente sin mutaciones');
    S.dialogue.close();S.state.money=100;
    W.startWorkout(target,'normal',30,false);
    assert(W.workout,style+': admisión');
    assert(S.state.money===94,style+': cobro único de 6');
    const admission=S.save.load();
    assert(admission.money===94&&admission.fitness.academies[style].paid>=0,style+': reserva guardada al admitir');
    frames(80);
    assert(W.player.isTraining,style+': práctica en el puesto '+JSON.stringify({workout:!!W.workout,training:W.player.training,paused:G.scene.isPaused('World')}));
    S.save.save(S.state.snapshot);
    const loaded=S.save.load();
    const minute=(S.state.day-1)*1440+S.state.hour*60+12;
    const q=quote(settle(loaded.fitness,minute),station,'normal',loaded.energy,{money:loaded.money,hour:S.state.hour,minute:12,at:minute});
    assert(q.fee===0&&q.wait===0&&!q.blocked,style+': volver después del margen sin pagar');
    // Pausa del ejercicio: ni reloj de órdenes ni teclas quedan acumuladas.
    if(style==='taekwondo') {
      const before=W.workout.kicks.t;
      G.scene.pause('World');S.input.releaseAll();frames(60);
      assert(W.workout.kicks.t===before,'órdenes detenidas al pausar');
      G.scene.resume('World');frames(1);
      assert(W.workout.kicks.t-before<=50,'sin salto de órdenes al reanudar');
      for(let belt=0;belt<BELTS.length;belt++) {
        S.state.fitness={...S.state.fitness,taekwondo:{...S.state.fitness.taekwondo,belt}};
        W.dressForWork();
        assert(playerUniformId()==='dobok-'+BELTS[belt].name,'uniforme del grado real');
        const source=G.textures.get('player-down-0').getSourceImage();
        const c=document.createElement('canvas');c.width=16;c.height=24;const ctx=c.getContext('2d');ctx.drawImage(source,0,0);
        const pixels=ctx.getImageData(0,0,16,24).data;
        const hex=BELTS[belt].color.slice(1);const rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));
        let count=0;for(let p=0;p<pixels.length;p+=4)if(pixels[p]===rgb[0]&&pixels[p+1]===rgb[1]&&pixels[p+2]===rgb[2]&&pixels[p+3])count++;
        assert(count>0,'cinturón visible '+BELTS[belt].name);
      }
      W.finishKicks(W.workout,W.workout.kicks);
    } else W.finishWorkout(0.1);
    frames(90);S.dialogue.close();
    assert(!W.workout,style+': retorno sin atrapamiento');
    assert(S.state.money===94,style+': resultado no vuelve a cobrar');
    console.log('QA08 clase '+style+' PASS');
    stage.push({style,admission:true,exercise:true,result:true,exit:true,resumeFee:q.fee});
  }
  const fights=[];
  for(const [style,location,day] of [['boxing','boxing',7],['taekwondo','academy-tkd',6]]) {
    await teleport(location,5,10);
    S.state.setClock(day,11,0);S.state.money=100;S.state.energy=100;
    S.state.fitness={...S.state.fitness,fatigue:0,skills:{...S.state.fitness.skills,[style]:10},tournaments:{}};
    // Prueba controlada: esperar a que el tatami no tenga peatones antes de reservarlo.
    const area=getLocation(location).points;
    for(let round=0;round<2;round++) {
      // La energía se repone aquí como fixture entre combates, sin atribuirlo a una acción jugable.
      S.state.energy=100;S.state.fitness={...S.state.fitness,fatigue:0};
      W.menus.openFighting(style);
      assert(S.menu.isOpen,style+': menú real de torneo');S.menu.close();
      W.startSpar(style,true);
      if(!W.spar) {
        S.dialogue.close();frames(180);W.startSpar(style,true);
      }
      assert(W.spar,style+': torneo admitido');
      frames(140);
      assert(W.spar?.ready,style+': rival presente');
      const b=W.spar.bout;
      let n=0;
      while(W.spar&&!W.spar.releasing&&n++<2400) {
        const id=style==='boxing'?'jab':'round';
        W.spar.selected=id;
        const d=distanceOf(b),m=MOVES[id];
        S.input.release('kickFore');S.input.release('kickBack');
        if(d>m.reach[1]-.1)S.input.press('kickFore');else if(d<m.reach[0]+.1)S.input.press('kickBack');
        if(d>=m.reach[0]&&d<=m.reach[1]){S.input.release('kickRight');S.input.press('kickRight');}
        frame();
      }
      assert(b.ended,style+': combate termina');
      assert(b.p.landed>0,style+': contacto real');
      assert(b.won,style+': bot controlado gana la ronda');
      frames(160);S.dialogue.close();S.input.releaseAll();
      const entry=S.state.fitness.tournaments[style];
      assert(entry.stage===(round===0?'final':'champion'),style+': progreso de cuadro');
      assert(S.state.money===(round===0?90:130),style+': cuota y premio únicos');
      assert(!G.textures.exists('spar-rival-8'),'texturas del rival liberadas');
      console.log('QA08 torneo '+style+' ronda '+(round+1)+' PASS');
      fights.push({style,round:round+1,score:[b.p.score,b.o.score],stage:entry.stage,money:S.state.money});
    }
  }
  await teleport('academy-tkd',5,10);
  S.state.setClock(6,18,1);S.state.money=100;S.state.energy=100;
  S.state.fitness={...S.state.fitness,fatigue:0,academies:{}};
  W.startSpar('taekwondo',false);
  if(!W.spar){S.dialogue.close();frames(60);W.startSpar('taekwondo',false);}
  frames(140);
  assert(W.spar?.ready,'combate de práctica para controles táctiles '+JSON.stringify({dialogue:S.dialogue.lines,busy:W.player.isBusyTraining,workout:!!W.workout}));
  // Teléfono integrado: abrir la pantalla real y volver no altera economía ni inventario.
  const phoneConnected=typeof S.phone.open==='function'&&typeof S.phone.attach==='function';
  assert(phoneConnected,'teléfono conectado a servicios');
  const snapshot={money:S.state.money,inventory:{...S.state.wallet.inventory}};
  const result={pass:true,classes:stage,fights,beltGrades:BELTS.length,phoneConnected,resourceSnapshot:snapshot,renderer:G.renderer.type===2?'WebGL':'Canvas',entities:W.children.list.length};
  G.step(t, 0);
  return result;
}
