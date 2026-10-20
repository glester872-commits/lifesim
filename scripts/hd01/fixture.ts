// Sólo la página de revisión local carga este punto de entrada. Nunca el juego normal.
import {createInitialState,SaveSystem} from '../../src/systems/SaveSystem';
import {getLocation} from '../../src/systems/LocationSystem';
import {forceWeather} from '../../src/systems/Weather';
import {ESTADIO_HALCON} from '../../src/data/stadium';
import {nextFixture,buyTicket,admit} from '../../src/systems/Tickets';
const q=new URLSearchParams(location.search),name=q.get('hd01')||'residential';
const nativeDpr=window.devicePixelRatio, dpr=Number(q.get('dpr')||nativeDpr);
if([1,1.25,2].includes(dpr)) Object.defineProperty(window,'devicePixelRatio',{value:dpr,configurable:true});
Object.assign(window,{hd01Dpr:{native:nativeDpr,emulated:dpr}});
let seed=103;Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const x=createInitialState();x.agenda!.tour='done';x.day=6;x.hour=name==='night'?22:14;x.minute=0;
const spots:Record<string,[string,number,number]>={residential:['district',41,49],commercial:['district',41,17],interior:['home',10,10],metro:['vallesco-station',11,8],stadium:['ar-estadio',12,17],pitch:['ar-estadio',12,8],night:['district',41,49],rain:['district',41,17]};
if(name==='stadium'||name==='pitch'){
 const f=nextFixture(ESTADIO_HALCON,{day:6,hour:10,minute:0})!;
 const now={day:f.day,hour:10,minute:0};const bought=buyTicket(ESTADIO_HALCON,100,[],now);
 const clock={day:f.day,hour:Math.floor(f.kickoff/60),minute:f.kickoff%60};
 Object.assign(x,clock);x.tickets=admit(ESTADIO_HALCON,bought.tickets,clock).tickets;
}
const [id,tx,ty]=spots[name]||spots.residential;getLocation(id);x.locationId=id;x.position={x:tx*16+8,y:ty*16+16};x.facing='down';
forceWeather({rain:name==='rain'?0.8:0,celsius:19});if(q.get('restore')!=='1')new SaveSystem().save(x);
await import('../../src/main');
