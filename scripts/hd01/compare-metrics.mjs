import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const root=process.argv[2]||process.env.HD01_EVIDENCE;
if(!root)throw Error('Indica el directorio de evidencias como argumento o HD01_EVIDENCE');
const scenes=['residential','commercial','interior','metro','stadium','night','rain'];
const rows=[];
for(const scene of scenes){
 const read=async phase=>JSON.parse(await readFile(path.join(root,`${phase}-${scene}-high-1100.json`),'utf8'));
 const b=await read('before'),a=await read('after');
 for(const key of ['viewport','dpr','zoom','camera','clock','seed','quality'])assert.deepEqual(a[key],b[key],`${scene}: deriva de ${key}`);
 const old=new Map(b.textureInventory.filter(t=>t.alpha).map(t=>[t.key,t]));
 const next=new Map(a.textureInventory.filter(t=>t.alpha).map(t=>[t.key,t]));
 let checked=0,changed=0,players=0;
 for(const [key,was]of old){const now=next.get(key);if(!now)continue;checked++;
  assert.deepEqual([now.w,now.h,now.alpha],[was.w,was.h,was.alpha],`${scene}/${key}: tamaño o alfa`);
  if(now.rgb!==was.rgb)changed++;
  if(key.startsWith('player-')){players++;assert.equal(now.rgb,was.rgb,`${scene}/${key}: jugador alterado`)}
 }
 assert.ok(checked>1500&&players>20,'Inventario insuficiente');
 assert.equal(a.textureBytesEstimated,b.textureBytesEstimated,`${scene}: bytes extra de textura`);
 rows.push({scene,checked,changed,players,estimatedMiB:+(a.textureBytesEstimated/2**20).toFixed(2),before:b.cpuFrameWorkMs,after:a.cpuFrameWorkMs});
}
await writeFile(path.join(root,'comparison.json'),JSON.stringify(rows,null,2));
console.log(JSON.stringify(rows,null,2));
