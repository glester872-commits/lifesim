import { createServer } from 'vite';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const evidence=process.env.HD01_EVIDENCE || path.join(process.env.TEMP,'lifesim-hd01');
await mkdir(evidence,{recursive:true});
const server=await createServer({server:{host:'127.0.0.1',port:5197,strictPort:true},plugins:[{
 name:'hd01-local-evidence',
 transformIndexHtml(html,ctx){return ctx.originalUrl?.includes('hd01=')?html.replace('/src/main.ts','/scripts/hd01/fixture.ts'):html},
 configureServer(s){s.middlewares.use('/__hd01',async(req,res)=>{try{
  const url=new URL(req.url,'http://127.0.0.1');const name=url.pathname.slice(1);
  if(!/^[a-z0-9_-]+\.(png|json)$/.test(name)){res.statusCode=400;res.end('Invalid evidence name');return}
  const file=path.join(evidence,name);
  if(req.method==='POST'){if(name.startsWith('before-')){let exists=false;try{await access(file);exists=true}catch{}if(exists){res.statusCode=409;res.end('Referencia original protegida: elige after o usa otro directorio para una nueva base.');return}}let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>24*1024*1024)throw Error('Evidence too large');chunks.push(chunk)}await writeFile(file,Buffer.concat(chunks));res.end('saved');}
  else{res.setHeader('Content-Type',name.endsWith('.png')?'image/png':'application/json');res.end(await readFile(file));}
 }catch(e){res.statusCode=404;res.end(String(e.message))}})}
}]});await server.listen();console.log('HD01 preview: http://127.0.0.1:5197/scripts/hd01/preview.html');console.log('Evidence:',evidence);
