import assert from 'node:assert/strict';
import { BOXING_PROFILE } from '../src/data/boxing.ts';
import { STATIONS } from '../src/data/stations.ts';
import { getLocation, isWalkable, validate } from '../src/systems/LocationSystem.ts';
import { tilePath } from '../src/systems/Navigation.ts';
import { Crowd } from '../src/systems/Crowd.ts';
import { placeInfo } from '../src/systems/Places.ts';
import { seededRng } from '../src/systems/MetroDaily.ts';
import { START_FITNESS, parseFitness, quote, train } from '../src/systems/Fitness.ts';
import { SaveSystem, createInitialState, restore } from '../src/systems/SaveSystem.ts';
import { mapPositionOf } from '../src/systems/WorldMap.ts';

const loc = getLocation('boxing'); validate(loc);
const gym = getLocation('gym');
assert.ok(gym.portals.some(p=>p.to.location===loc.id));
assert.ok(loc.portals.some(p=>p.to.location===gym.id&&gym.spawns[p.to.spawn]));
assert.equal(mapPositionOf(loc.id,{x:232,y:288})!.mapId,'district');
assert.equal(placeInfo('boxing')!.hours![0],8);
const names=['boxing-guard','boxing-footwork','boxing-bag','boxing-coordination','boxing-resistance'] as const;
for(const name of names){
 assert.ok(STATIONS[name].training);
 const q=quote(START_FITNESS,name,'normal',100,{money:100,hour:18,minute:0});
 assert.equal(q.fee,6);assert.equal(q.wait,0);assert.equal(q.blocked,null);
 assert.ok(quote(START_FITNESS,name,'normal',100,{money:5,hour:18,minute:0}).blocked);
 const late=quote(START_FITNESS,name,'soft',100,{money:10,hour:18,minute:11});
 assert.equal(late.wait,19);assert.ok(late.blocked);
 assert.ok(quote(START_FITNESS,name,'normal',100,{money:10,hour:22,minute:0}).blocked);
 assert.ok(quote(START_FITNESS,name,'normal',0,{money:10,hour:18,minute:0}).blocked);
 const out=train(START_FITNESS,name,'normal',1,600,1,100);
 assert.ok(out.next.boxing!>0);assert.equal(out.next.total,1);
 assert.equal(train(START_FITNESS,name,'normal',0,600,1,100).next.boxing,undefined);
}
assert.equal(parseFitness({...START_FITNESS,boxing:500}).boxing,100);
assert.equal(parseFitness({...START_FITNESS,boxing:-5}).boxing,0);
assert.equal(parseFitness({...START_FITNESS,boxing:NaN}).boxing,0);
assert.deepEqual(parseFitness(START_FITNESS),START_FITNESS,'guardados anteriores no cambian de forma');
for(const [id,p] of Object.entries(loc.points!)){
 if(!p.use)continue;
 const path=tilePath(loc,loc.spawns.entry,p);
 assert.ok(path,id+' sin ruta');
 assert.ok(path.every(t=>isWalkable(loc,t.tx,t.ty)),id+' atraviesa cuerdas o sacos');
 if(id==='BOX_GUARD_01'||id==='BOX_FEET_01') assert.ok(path.some(t=>t.tx===7&&t.ty===12),id+' no usa entrada del ring');
}
for(const bag of loc.props.filter(p=>p.kind==='boxing-bag'))assert.equal(isWalkable(loc,bag.tx,bag.ty),false,'saco sólido');
for(let x=2;x<=12;x++)assert.equal(isWalkable(loc,x,4),false,'cuerdas norte sólidas');

let uses=0;const used=new Set<string>();
for(const day of [1,6]){
 const crowd=new Crowd(loc,placeInfo('boxing')!,BOXING_PROFILE,seededRng(day*19));
 let t=16*60;const clock=()=>({day,hour:Math.floor(t/60),minute:Math.floor(t%60)});
 crowd.populate(clock(),{tx:14,ty:17});
 for(let step=0;step<1800;step++){
  crowd.update(100,clock(),{tx:14,ty:17});t+=0.2;
  const owners=new Map<string,number>();
  for(const a of crowd.agents){
   assert.ok(isWalkable(loc,Math.round(a.x),Math.round(a.y)),a.state+' atraviesa equipo/cuerda '+a.x+','+a.y);
   if(a.point?.startsWith('BOX_')&&a.kind==='visitor'&&!a.moving){
    assert.ok(!owners.has(a.point)||owners.get(a.point)===a.id,'puesto duplicado');owners.set(a.point,a.id);
    if(loc.points![a.point]?.use?.startsWith('boxing-')){uses++;used.add(a.point);}
   }
  }
 }
}
assert.ok(uses>0&&used.size>=3,'alumnos sin entrenamiento real');
const memory=new Map<string,string>();
const saves=new SaveSystem({read:k=>memory.get(k)??null,write:(k,v)=>void memory.set(k,v),remove:k=>void memory.delete(k)});
const trained=train(START_FITNESS,'boxing-bag','normal',1,720,1,100);
const state={...createInitialState(),money:114,hour:12,minute:0,locationId:'boxing',position:{x:232,y:288},fitness:trained.next};
assert.ok(saves.save(state));let loaded=restore(saves.load());
for(let i=0;i<4;i++){assert.equal(loaded.money,114);assert.equal(loaded.fitness!.boxing,trained.next.boxing);assert.equal(loaded.fitness!.total,1);assert.ok(saves.save(loaded));loaded=restore(saves.load());}
assert.ok(saves.save({...loaded,locationId:'gym',position:{x:328,y:208}}));
assert.equal(saves.load()!.fitness!.boxing,trained.next.boxing,'salir no pierde progreso');
console.log('Boxeo PASS: 5 ejercicios, coste/horario/espera, técnica y forma física, guardados idempotentes, ring/sacos sólidos y '+uses+' usos NPC en '+used.size+' puestos.');
