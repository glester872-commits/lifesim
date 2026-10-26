// CV-07: integración determinista; NO es una partida jugada en navegador.
import assert from 'node:assert/strict';
import { CHARACTERS } from '../src/data/characters.ts';
import { getCatalog } from '../src/data/catalogs.ts';
import { getActivity } from '../src/data/activities.ts';
import { getJob } from '../src/data/jobs.ts';
import { getLocation } from '../src/systems/LocationSystem.ts';
import { routineFor, whereabouts, characterDay, tripsOf } from '../src/systems/Characters.ts';
import { Crowd, profileFor } from '../src/systems/Crowd.ts';
import { StreetLife, streetProfileFor } from '../src/systems/StreetLife.ts';
import { absMinute, handoffs, insideLooks, resetHandoffs } from '../src/systems/Handoff.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { placeInfo, isOpen, workingAt } from '../src/systems/Places.ts';
import { CHOIR } from '../src/data/parish.ts';
import { attend, emptyParish, gatheringReservedLooks, guestsOf, joinBlocker, parseParish } from '../src/systems/Parish.ts';
import { createInitialState, LocalStorageAdapter, SaveSystem, type SaveStorage } from '../src/systems/SaveSystem.ts';
import { resolve, usePregnancies } from '../src/systems/Pregnancy.ts';
import { TimeSystem } from '../src/systems/TimeSystem.ts';
import { commitments, review, startAgenda } from '../src/systems/Agenda.ts';
import { checkout, consume, payFare, purchase, spend } from '../src/systems/Commerce.ts';
import { perform } from '../src/systems/Activities.ts';
import { buyGarment } from '../src/systems/Retail.ts';
import { buy, rentsOf } from '../src/systems/Housing.ts';
import { hire, scheduled, situationFor, work, levelOf } from '../src/systems/Jobs.ts';
import { pay, sync, unpaid } from '../src/systems/Household.ts';
import { createSocialProfile } from '../src/systems/Social.ts';
import { destinationsFrom, getStop } from '../src/systems/Transit.ts';

const FAR = { tx: -999, ty: -999 };
const storage = new Map<string, string>();
const adapter: SaveStorage = { read: k => storage.get(k) ?? null, write: (k,v) => { storage.set(k,v); }, remove: k => { storage.delete(k); } };
const save = new SaveSystem(adapter);

// El adaptador de producción debe informar fallo, incluso si el almacenamiento está lleno.
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', {configurable:true, value:{localStorage:{setItem(){throw Error('QuotaExceededError');}}}});
assert.equal(new SaveSystem(new LocalStorageAdapter()).save(createInitialState()), false);
if (originalWindow) Object.defineProperty(globalThis,'window',originalWindow); else Reflect.deleteProperty(globalThis,'window');

// Un salto inválido no emite medianoches ni toca fracciones/retención del reloj.
let ticks = 0;
const clockState = {day:1,hour:8,minute:30,setClock(d:number,h:number,m:number){this.day=d;this.hour=h;this.minute=m;},emit(){ticks++;}};
const time = new TimeSystem(clockState as never);
time.holdJumps = true;
for (const value of [NaN, Infinity, -Infinity, -2, 0]) time.advanceMinutes(value);
assert.deepEqual([clockState.day,clockState.hour,clockState.minute,ticks,time.isHeld], [1,8,30,0,false]);
time.advanceMinutes(7*1440);
assert.equal(ticks,7);
assert.equal(clockState.day,8);

// La rotación de la caché no puede borrar planes base de otros personajes ni retener variantes indefinidamente.
for(let day=1;day<=170;day++) for(const def of CHARACTERS) {
  const r=routineFor(def,day);
  assert.ok(tripsOf(r)?.length,`${def.npc}/${day}: plan perdido tras rotar caché`);
  whereabouts(def,(day-1)*1440+15*60);
}
for(const def of CHARACTERS) for(const r of def.routines) assert.ok(tripsOf(r)?.length,`${def.npc}/${r.id}: plan base borrado`);

// Misma identidad al abandonar, entrar en otro local y regresar: reserva la visita en Handoff.
resetHandoffs();
const c = {day:3,hour:17,minute:0};
const superPlace=placeInfo('supermarket')!;
const room=()=>new Crowd(getLocation(superPlace.interior!),superPlace,profileFor(superPlace.id)!,seededRng(123));
const first=room();first.populate(c,FAR);
const observed=first.agents.filter(a=>a.kind==='visitor'&&!a.guest).map(a=>a.look);
assert.ok(observed.length>0);
first.rememberVisitors(c);
assert.equal(new Set(handoffs().filter(h=>!h.done).map(h=>h.look)).size,observed.length);
for(const id of ['cafe','parish']){
 const p=placeInfo(id)!;const other=new Crowd(getLocation(p.interior!),p,profileFor(id)!,seededRng(5));other.populate(c,FAR);
 assert.ok(other.agents.every(a=>!observed.includes(a.look)),`${id}: identidad simultánea con el supermercado`);
}
const back=room();back.populate(c,FAR);
for(const look of observed)assert.equal(back.agents.filter(a=>a.look===look).length,1,`volver al súper: ${look}`);
assert.equal(new Set(back.agents.map(a=>a.look)).size,back.agents.length);
const originalEnd=handoffs().filter(h=>!h.done).map(h=>h.leaveAt);
back.rememberVisitors(c);
assert.deepEqual(handoffs().filter(h=>!h.done).map(h=>h.leaveAt),originalEnd,'volver no prolonga visitas');
resetHandoffs();

// Reservas de trabajo/evento en todos los locales implicados, en tres franjas de cada día.
let inspected=0,duplicates=0;
for(let day=1;day<=7;day++)for(const hour of [9,12,18,23]) {
 const clock={day,hour,minute:0},now=absMinute(day,hour,0);
 const reserved=new Set(gatheringReservedLooks(now));
 for(const id of ['supermarket','cafe','parish','pc-monton','pc-velarde']){
  const p=placeInfo(id);assert.ok(p?.interior && profileFor(id),`local sin integrar: ${id}`);
  const crowd=new Crowd(getLocation(p.interior),p,profileFor(id)!,seededRng(day*100+hour));crowd.populate(clock,FAR);
  duplicates+=crowd.agents.length-new Set(crowd.agents.map(a=>a.look)).size;
  for(const a of crowd.agents.filter(a=>a.kind==='visitor'&&!a.guest)) {
   const {IDENTITIES}=await import('../src/systems/People.ts');
   assert.ok(!workingAt(IDENTITIES[a.look].work,now),`${id}: compra mientras trabaja`);
   assert.ok(!reserved.has(a.look),`${id}: compra mientras va al coro`);
  }
  inspected+=crowd.agents.length;
 }
 const street=new StreetLife(getLocation('district'),streetProfileFor('district')!,seededRng(day*100+hour));street.populate(clock,FAR);
 const ids=street.agents.map(a=>a.survivor ? `survivor:${a.survivor.id}` : a.npc ? `npc:${a.npc}` : `person:${a.look}`);
 assert.equal(new Set(ids).size,street.agents.length,'identidades duplicadas en la calle');
 for(const a of street.agents.filter(a=>a.kind==='visitor'))assert.ok(!reserved.has(a.look),'coro duplicado en calle');
}
assert.equal(duplicates,0);

// Si se agota el conjunto no se asigna una identidad ya ocupada como recurso de emergencia.
const crowded=new Crowd(getLocation(superPlace.interior!),superPlace,profileFor(superPlace.id)!,seededRng(1));
crowded.populate(c,FAR);
const {IDENTITIES}=await import('../src/systems/People.ts');
crowded.agents.splice(0,crowded.agents.length,...IDENTITIES.map((p,i)=>({...first.agents[0],id:i,look:p.index})));
assert.equal((crowded as unknown as {pickLook():number}).pickLook(),-1);

// Hoy usa la asistencia guardada y no da faltas ni avisos por una actividad voluntaria.
const initial=createInitialState();
const agendaInput={now:absMinute(7,11,0),job:null,study:initial.study!,household:initial.household!,phone:initial.phone!,stories:{},tickets:[],parish:emptyParish()};
assert.equal(commitments(agendaInput).find(x=>x.kind==='gathering')?.key,'gathering:coro-7');
const joined=attend(CHOIR,emptyParish(),createSocialProfile(),absMinute(7,12,0),'full');
assert.throws(()=>attend(CHOIR,joined.parish,joined.host,absMinute(7,12,0),'full'),/Ya has estado/);
assert.throws(()=>attend(CHOIR,emptyParish(),createSocialProfile(),absMinute(7,12,46),'full'),/avanzado/);
assert.match(commitments({...agendaInput,parish:joined.parish}).find(x=>x.kind==='gathering')!.key,/coro-14/);
assert.deepEqual(parseParish(JSON.parse(JSON.stringify(joined.parish))),joined.parish);
const progress={...agendaInput,money:120,wardrobe:[],social:{},fitness:initial.fitness!};
const reviewed=review(startAgenda(),{...agendaInput,position:{location:'district',x:664,y:832}},progress);
assert.ok(reviewed.due.every(x=>x.kind!=='gathering'));
assert.ok(gatheringReservedLooks(absMinute(7,11,20)).length>0,'viaje de ida reservado');
assert.ok(gatheringReservedLooks(absMinute(7,13,45)).length>0,'viaje de vuelta reservado');
for(const i of guestsOf(CHOIR,7))for(let m=11*60+15;m<14*60;m++)assert.ok(!workingAt(IDENTITIES[i].work,absMinute(7,0,m)));
// Esperando dentro desde antes: el coro entra por la puerta, de uno en uno, y a las 12:05 está completo (antes el
// último llegaba hacia las 12:20-12:30; entrando después, ya estaban todos sentados).
for(let day=7;day<=140;day+=7){const p=placeInfo('parish')!,hall=new Crowd(getLocation(p.interior!),p,profileFor('parish')!,seededRng(day));hall.populate({day,hour:11,minute:30},FAR);
 for(let ms=0;ms<35*500;ms+=16){const m=11*60+30+Math.floor(ms/500);hall.update(16,{day,hour:Math.floor(m/60),minute:m%60},FAR);}
 const looks=hall.agents.map(a=>a.look),seated=new Set(hall.agents.filter(a=>a.guest).map(a=>a.look));
 assert.deepEqual(guestsOf(CHOIR,day).filter(l=>!seated.has(l)),[],`día ${day}: a las 12:05 falta gente del coro`);
 assert.equal(new Set(looks).size,looks.length,`día ${day}: una cara dos veces en la parroquia`);}

// Saltos de embarazo y carga: el mismo resultado que siete medianoches, sin nacimientos repetidos.
let preg=resolve({},1).state;
const anchor=structuredClone(preg);
for(let day=2;day<=8;day++)preg=resolve(preg,day).state;
assert.deepEqual(resolve(anchor,8).state,preg);
const future=resolve(anchor,120);
assert.equal(future.events.filter(e=>e.birth).length,3);
assert.equal(resolve(JSON.parse(JSON.stringify(future.state)),120).events.length,0);
usePregnancies(anchor);

// Siete días reproducibles: salarios reales, comida usada, ropa visible, hogar, comunidad y cuentas.
function week(){
 let s=createInitialState();s.job=hire(getJob('decathlon'),1);
 let wallet={money:s.money,inventory:{...s.inventory},cards:{...s.cards}};
 const machine=getCatalog('transport-machine');
 const issued=purchase(wallet,machine.products.find(p=>p.id==='transport-new')!);assert.ok(issued.ok);wallet=issued.wallet;
 const trip=(stop:string)=>destinationsFrom(getStop('vallesco')).find(d=>d.stop.id===stop)!;
 const travel=(stop:string):number=>{
  const d=trip(stop);assert.ok(d);
  for(let leg=0;leg<2;leg++){
   if((wallet.cards.transport??0)<d.fare){const load=purchase(wallet,machine.products.find(p=>p.id==='transport-10')!);assert.ok(load.ok);wallet=load.wallet;}
   const fare=payFare(wallet,d.line.card,d.fare);assert.ok(fare.ok);wallet=fare.wallet;
  }
  return d.minutes*2;
 };
 const rows=[];let blocked=0;
 for(let day=1;day<=7;day++){
  s.household=sync(s.household!,day,rentsOf(s.housing!)).household;
  let now=absMinute(day,8,30),income=0,minutes=0;
  if(scheduled(s.job!,day)){
   const start=absMinute(day,levelOf(s.job!).start,0);
   const shift=work(s.job!,start,situationFor(s.job!,day).choices[0]);
   s.job=shift.progress;income=shift.money;wallet.money+=income;const journey=travel('decathlon');now=start+shift.minutes+journey/2;minutes+=shift.minutes+journey;
  }
  if(day===2){
   const garment=buyGarment(wallet,s.wardrobe,s.appearance?.player??{},'monton','camiseta-mostaza');
   assert.ok(garment.ok);wallet=garment.wallet;s.wardrobe=[...garment.wardrobe];s.appearance={...s.appearance,player:garment.appearance};
   const house=buy(s.housing!,'monstera',wallet.money);assert.ok(house.ok);s.housing=house.housing;wallet.money=house.money;minutes+=80+travel('puerta-central');
  }
  if(day===7){
   const out=attend(CHOIR,s.parish!,s.social?.encarna??createSocialProfile(),absMinute(day,12,0),'full');
   s.parish=out.parish;s.social={...s.social,encarna:out.host};now=absMinute(day,13,30);minutes+=out.minutes+30;
   assert.ok(joinBlocker(CHOIR,s.parish,absMinute(day,12,0)));
  }
  // En domingo la compra se hace antes del cierre; el martes se conserva la alternativa de mañana.
  if(day===2){assert.equal(isOpen(superPlace,day,22,0),false);blocked++;assert.ok(isOpen(superPlace,day+1,9,0));}
  const shopAt=day===7?absMinute(day,14,0):Math.max(now,absMinute(day,18,0));
  assert.ok(isOpen(superPlace,day,Math.floor((shopAt%1440)/60),shopAt%60),'trabajo y compra caben en el día');
  const tx=checkout(wallet,getCatalog('super-rosales'),'groceries',1);assert.ok(tx.ok);wallet=tx.wallet;
  wallet=spend(wallet,'groceries');minutes+=2+perform(getActivity('cook')).minutes+35;
  const snack=checkout(wallet,getCatalog('super-rosales'),'bread',1);assert.ok(snack.ok);
  const eaten=consume(snack.wallet,'bread');assert.ok(eaten.ok);assert.ok(eaten.energy!>0);wallet=eaten.wallet;
  for(const o of unpaid(s.household!).filter(o=>o.due===day)){
   const paid=pay(s.household!,wallet.money,o.bill,o.period,day);assert.ok(paid.ok);wallet.money=paid.money;s.household=paid.household;
  }
  for(let m=360;m<1800;m+=5)for(const def of CHARACTERS){
   const t=absMinute(day,0,m),w=whereabouts(def,t);assert.ok(w.stop);assert.ok(Number.isFinite(w.tx));
   const again=whereabouts(def,t);assert.deepEqual(w,again);assert.equal(characterDay(t),m<1800?day:day+1);
  }
  s={...s,day,hour:21,minute:0,money:Math.round(wallet.money*100)/100,inventory:wallet.inventory,cards:wallet.cards};
  assert.ok(save.save(s));const loaded=save.load()!;
  assert.deepEqual([loaded.money,loaded.inventory,loaded.wardrobe,loaded.housing,loaded.parish],[s.money,s.inventory,s.wardrobe,s.housing,s.parish]);
  s=loaded;assert.ok(s.money>=0);
  rows.push({day,balance:s.money,transportCard:s.cards.transport,income,activityMinutes:minutes,duplicates:0,blocked:day===2?1:0});
 }
 assert.equal(s.parish!.attended.length,1);assert.equal(s.wardrobe.filter(g=>g==='camiseta-mostaza').length,1);
 assert.equal(s.housing!.owned.filter(x=>x==='monstera').length,1);assert.equal(blocked,1);
 return rows;
}
const legacy=createInitialState();legacy.money=71.25;legacy.inventory={bread:2};legacy.wardrobe=['camiseta-mostaza'];
delete legacy.parish;delete legacy.pregnancy;delete legacy.agenda;
const originalLegacy=JSON.stringify(legacy);assert.ok(save.save(structuredClone(legacy)));const migrated=save.load()!;
assert.deepEqual([migrated.money,migrated.inventory,migrated.wardrobe],[71.25,{bread:2},['camiseta-mostaza']]);
assert.deepEqual(migrated.parish,emptyParish());assert.equal(JSON.stringify(legacy),originalLegacy);
const result=week();assert.deepEqual(week(),result,'dos simulaciones producen la misma economía');
console.log(JSON.stringify({test:'CV-07 deterministic seven days (not browser gameplay)',inspected,duplicates,rows:result},null,2));
console.log('check-city-life: schedules, occupancy, work/community priority, revisit, invalid time, old-compatible save and seven-day economy OK');
