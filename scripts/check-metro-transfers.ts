import assert from 'node:assert/strict';
import { STOPS, LINES, TRANSFERS, type TransitStop } from '../src/data/transit.ts';
import { METRO_CONFIG } from '../src/config/metro.ts';
import { SAVE_VERSION, TILE } from '../src/config/constants.ts';
import { BUDGETS } from '../src/config/budgets.ts';
import { getLocation, isWalkable, spawnToWorld, validate } from '../src/systems/LocationSystem.ts';
import { getStop, destinationsFrom, prepareRide, routeBetween, visitable, parseMetroJourney, journeyAfterPortal } from '../src/systems/Transit.ts';
import { createInitialState, inspectRaw, restore, SaveSystem } from '../src/systems/SaveSystem.ts';
import { travel } from '../src/systems/World.ts';
import type { GameStateData } from '../src/types/game.ts';

assert.equal(LINES.length, 2, 'exactamente dos líneas');
assert.ok(LINES.every(l => l.hours[0] === 0 && l.hours[1] === 24));
assert.equal(STOPS.filter(s => s.line === 'L3').length, 2);
assert.equal(destinationsFrom(getStop('puerta-central')).find(d => d.stop.id === 'decathlon')!.minutes, 75, 'L2 conserva su recorrido');
assert.equal(routeBetween('puerta-central', 'decathlon-l3')!.minutes, 17, '2 min de pasillo + 15 min exprés');
assert.equal(routeBetween('arena', 'decathlon-l3')!.minutes, 32, '15 L2 + 2 pasillo + 15 L3');
assert.equal(routeBetween('decathlon-l3', 'arena')!.minutes, 32, 'recorrido inverso');
assert.equal(routeBetween('arena', 'decathlon-l3')!.fare, 2);
assert.equal(routeBetween('missing', 'arena'), null);
assert.equal(travel('luna', 'vallesco').mode, 'metro', 'de Luna a Vallesco se va en metro');
assert.equal(travel('puerta-central', 'poligono-norte').mode, 'metro');

let state: GameStateData = { ...createInitialState(), locationId: 'arena-station', cards: { transport: 4 }, hour: 23, minute: 50 };
state.position = spawnToWorld(getLocation(state.locationId).spawns.entry);
const records = new Map<string,string>();
const saves = new SaveSystem({read:k=>records.get(k)??null, write:(k,v)=>void records.set(k,v), remove:k=>void records.delete(k)});
let checkpoints = 0;
function reload(label: string) {
  assert.ok(saves.save(state), label + ': guardar');
  const loaded = saves.load()!;
  const expected = restore(loaded);
  for(let n=0;n<3;n++) {
    const again = restore(expected);
    assert.deepEqual(again, expected, label + ': restauración idempotente');
    assert.deepEqual(again.cards, state.cards, label + ': saldo');
    assert.deepEqual([again.day,again.hour,again.minute,again.events.rides], [state.day,state.hour,state.minute,state.events.rides], label + ': reloj/memoria');
    assert.equal(again.metroJourney?.station, state.metroJourney?.station);
  }
  state = expected;
  checkpoints++;
}
function advance(minutes: number) {
  const t=(state.day-1)*1440+state.hour*60+state.minute+minutes;
  state.day=Math.floor(t/1440)+1; state.hour=Math.floor(t%1440/60); state.minute=t%60;
}
function ride(from: string, to: string) {
  const result=prepareRide({money:state.money, cards:state.cards, inventory:state.inventory},state.metroJourney??null,getStop(from),getStop(to),state.hour);
  assert.ok(result.ok);
  state.cards=result.wallet.cards; state.metroJourney=result.journey; advance(result.minutes); state.events.rides++;
  state.locationId=result.station; state.position=spawnToWorld(getLocation(result.station).spawns.train);
  reload('llegada confirmada antes del fundido ' + to);
}
function transfer(to: string) {
  const portal=getLocation(state.locationId).portals.find(p=>p.id==='transfer'&&p.to.location===to)!;
  assert.ok(portal, 'pasillo físico');
  state.metroJourney=journeyAfterPortal(state.metroJourney??null,state.locationId,to);
  advance(portal.minutes!); state.locationId=to; state.position=spawnToWorld(getLocation(to).spawns[portal.to.spawn]);
  reload('pasillo ' + to);
}
reload('entrada sin validar / elección / espera');
ride('arena','puerta-central');
assert.equal(state.cards.transport,2);
transfer('puerta-central-l3-station');
ride('puerta-central-l3','decathlon-l3');
assert.equal(state.cards.transport,2,'transbordo no vuelve a cobrar');
assert.deepEqual([state.day,state.hour,state.minute],[2,0,22], 'medianoche y 32 minutos exactos, sin espera');
state.metroJourney=journeyAfterPortal(state.metroJourney??null,state.locationId,'poligono-norte');
state.locationId='poligono-norte'; state.position=spawnToWorld(getLocation(state.locationId).spawns['pn-metro']);
assert.equal(state.metroJourney,null,'salir termina la validación'); reload('salida a destino jugable');
// La misma boca de calle entra a L2; el pasillo permite elegir L3 sin pagar hasta subir.
state.locationId='decathlon-station'; state.position=spawnToWorld(getLocation(state.locationId).spawns.entry); reload('entrada de vuelta');
transfer('decathlon-l3-station');
assert.equal(state.metroJourney,null,'no se inventa validación al cambiar de andén');
ride('decathlon-l3','puerta-central-l3');
assert.equal(state.cards.transport,0,'la vuelta cuesta otros 2 euros');
transfer('puerta-central-station'); ride('puerta-central','arena');
assert.equal(state.cards.transport,0,'transbordo con saldo cero y billete validado');
assert.deepEqual([state.day,state.hour,state.minute],[2,0,56], 'ida y vuelta: 66 minutos incluyendo acceso a L3 de vuelta');
assert.equal(state.events.rides,4,'sólo tramos en tren cuentan como viajes');
const wallet={money:20,cards:{transport:1},inventory:{}};
assert.equal(prepareRide(wallet,null,getStop('arena'),getStop('puerta-central'),12).ok,false,'saldo insuficiente');
assert.deepEqual(wallet.cards,{transport:1},'rechazo no muta saldo');
assert.equal(prepareRide({money:20,cards:{},inventory:{}},null,getStop('arena'),getStop('puerta-central'),12).ok,false,'sin tarjeta');
const off: TransitStop={id:'future',name:'Sin mapa',line:'L2',order:99,offMap:'future'};
assert.equal(visitable(off),false); assert.equal(prepareRide(wallet,null,getStop('arena'),off,12).ok,false);
assert.equal(prepareRide(wallet,null,getStop('arena'),getStop('decathlon-l3'),12).ok,false,'no salta directamente de línea');
for(const bad of [undefined,null,{}, {version:2,phase:'platform',station:'arena-station'}, {version:1,phase:'riding',station:'arena-station'}, {version:1,phase:'platform',station:'orphan'}, {version:1,phase:'platform',station:'puerta-central-station'}]) assert.equal(parseMetroJourney(bad,'arena-station'),null);
for(const version of [1,2]) {
  const old=inspectRaw(JSON.stringify({version,state:{...state,metroJourney:{version:1,phase:'platform',station:state.locationId}}}));
  assert.equal(old.status,'ok'); if(old.status==='ok') assert.equal(old.state.metroJourney,null,'migración no inventa un billete pagado');
}
assert.equal(SAVE_VERSION,3);
for(const stop of STOPS) {
  assert.ok(visitable(stop)); const loc=getLocation(stop.station!); validate(loc);
  for(const spawn of Object.values(loc.spawns)) assert.ok(isWalkable(loc,spawn.tx,spawn.ty)&&spawn.ty>=loc.metro!.edgeRow);
  const repaired=restore({...state,locationId:loc.id,metroJourney:{version:1,phase:'platform',station:loc.id},position:{x:80,y:3*TILE}});
  assert.ok(repaired.position.y>=(loc.metro!.walkRow+1)*TILE,'recuperación fuera de vías/borde');
  for(const g of loc.metro!.guards) for(const p of [g.post,...g.patrol]) assert.ok(p.ty>=loc.metro!.walkRow&&isWalkable(loc,p.tx,p.ty));
  for(const p of loc.metro!.waitingSpots) assert.ok(p.ty>=loc.metro!.walkRow&&isWalkable(loc,p.tx,p.ty));
}
for(const t of TRANSFERS) for(const [a,b] of [[t.from,t.to],[t.to,t.from]]) {
  const loc=getLocation(getStop(a).station!), dest=getLocation(getStop(b).station!);
  const p=loc.portals.find(p=>p.id==='transfer'&&p.to.location===dest.id)!;
  assert.equal(p.minutes,t.minutes); assert.ok(isWalkable(loc,p.tx,p.ty));
}
assert.ok(METRO_CONFIG.passengerPool+METRO_CONFIG.securityCount<BUDGETS.low.agents,'un solo pool por escena, dentro del presupuesto móvil');
console.log('LV-07 PASS: red L2/L3, ida-vuelta, '+checkpoints+' fases guardadas, tarifa única, saldo cero, medianoche, migración, corrupción, vías, puertas/portales y presupuesto.');
