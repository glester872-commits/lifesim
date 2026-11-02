import type Phaser from 'phaser';
import { PALETTE, TILE } from '../config/constants';
import { make, px, shade, sprinkle, type Ctx } from './paint';
import type { Facing } from '../types/game';

const RED = '#c35043', BLUE = '#476b90', MAT = '#416075';
function canvas(ctx: Ctx): void { px(ctx, MAT, 0, 0, 16, 16); sprinkle(ctx, shade(MAT, 0.08),16,16,31,8); }
function ropes(ctx: Ctx, vertical: boolean): void {
  canvas(ctx);
  for (const [i,c] of [[3,RED],[7,'#e9ddc3'],[11,BLUE]] as const) {
    px(ctx, '#202832', vertical?7:0, vertical?0:i+1, vertical?2:16, vertical?16:2);
    px(ctx, c, vertical?6:0, vertical?0:i, vertical?2:16, vertical?16:2);
  }
}
function bag(ctx: Ctx): void {
  px(ctx,PALETTE.metal,7,0,2,12);px(ctx,'#202631',4,10,8,35);
  px(ctx,RED,3,12,10,30);px(ctx,shade(RED,.18),4,13,2,27);px(ctx,shade(RED,-.3),11,13,2,29);
  px(ctx,'#eee1cc',3,17,10,2);px(ctx,'#eee1cc',3,34,10,2);px(ctx,'#242833',5,41,6,4);
  px(ctx,'#e6d6bd',7,23,2,7);px(ctx,'#e6d6bd',6,25,4,2);
}
function glove(ctx: Ctx,x: number,y: number,color=RED): void {
  px(ctx,shade(color,-.35),x,y,4,5);px(ctx,color,x,y,4,4);px(ctx,shade(color,.24),x,y,2,1);px(ctx,'#ddd3bf',x+1,y+4,2,1);
}
function gloves(ctx: Ctx,dir: Facing,extended: boolean): void {
  if(dir==='left'){ctx.save();ctx.translate(16,0);ctx.scale(-1,1);gloves(ctx,'right',extended);ctx.restore();return;}
  if(dir==='right'){glove(ctx,extended?12:9,extended?10:8);glove(ctx,6,10,BLUE);}
  else {glove(ctx,3,dir==='up'&&extended?5:9);glove(ctx,10,10,BLUE);}
}
const LETTERS: Record<string, string[]> = {
 F:['111','100','110','100','100'],O:['111','101','101','101','111'],R:['110','101','110','101','101'],J:['001','001','001','101','111'],A:['010','101','111','101','101'],
 B:['110','101','110','101','110'],X:['101','101','010','101','101'],E:['111','100','110','100','111'],
};
function sign(ctx: Ctx): void {
  px(ctx,'#202b36',0,0,80,16);px(ctx,RED,0,14,80,2);
  for(const [word,tx] of [['FORJA',8],['BOXEO',44]] as const) [...word].forEach((l,i)=>LETTERS[l].forEach((r,y)=>[...r].forEach((v,x)=>{if(v==='1')px(ctx,'#f0e1c5',tx+i*4+x,5+y,1,1)})));
}
export function buildBoxingTextures(scene: Phaser.Scene): void {
  make(scene,'tile-boxing-canvas-0',TILE,TILE,canvas);
  make(scene,'tile-boxing-ropes-h-0',TILE,TILE,c=>ropes(c,false));make(scene,'tile-boxing-ropes-v-0',TILE,TILE,c=>ropes(c,true));
  make(scene,'prop-boxing-bag',TILE,TILE*3,bag);
  make(scene,'prop-boxing-post',TILE,TILE*2,c=>{px(c,'#202832',5,3,7,29);px(c,BLUE,5,3,6,24);px(c,'#d9d2bd',5,7,6,3);px(c,RED,5,19,6,3);});
  make(scene,'prop-boxing-sign',80,16,sign);
  make(scene,'prop-boxing-rack',48,32,c=>{px(c,PALETTE.metal,1,6,46,3);px(c,PALETTE.metal,1,24,46,3);for(const x of [2,43])px(c,PALETTE.metal, x,3,3,29);for(const x of [7,19,31]){glove(c,x,11);glove(c,x+4,11,BLUE);px(c,'#b5a18b',x,23,6,2);}});
  for(const dir of ['up','down','left','right'] as const)for(const n of [0,1])make(scene,'fx-boxing-'+dir+'-'+n,16,24,c=>gloves(c,dir,n===1));
}
