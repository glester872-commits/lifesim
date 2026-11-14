#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
const mission=process.argv.slice(2).join(' ').trim();
const report={mission,cycles:[],status:'BLOCKED'};
function run(bin,args,timeout=180000){const r=spawnSync(bin,args,{encoding:'utf8',timeout,maxBuffer:4000000,shell:false});return {ok:!r.error&&r.status===0,stdout:(r.stdout||'').slice(-12000),stderr:(r.stderr||String(r.error||'')).slice(-2500)};}
function save(){mkdirSync('.agent-runs',{recursive:true});writeFileSync('.agent-runs/last-run.json',JSON.stringify(report,null,2));}
function stop(reason){report.reason=reason;save();console.error(reason);process.exit(1);}
if(!mission||!existsSync('CLAUDE.md')){console.error('Usage: node scripts/agent-harness.mjs "narrow mission"');process.exit(2);}
const branch=run('git',['branch','--show-current']);if(!branch.ok||['main','master',''].includes(branch.stdout.trim()))stop('Use a dedicated non-main branch');
const dirty=run('git',['status','--porcelain']);if(!dirty.ok||dirty.stdout.trim())stop('Working tree must be clean to protect existing work');
if(!run('claude',['--version'],15000).ok)stop('Claude Code CLI unavailable');
function agent(name,prompt,tools,turns){
 const r=run('claude',['-p',prompt,'--agent',name,'--output-format','json','--max-turns',String(turns),'--permission-mode','dontAsk','--tools',tools]);
 if(!r.ok)throw Error(name+' failed: '+r.stderr+' '+r.stdout.slice(-500));
 const env=JSON.parse(r.stdout);if(env.is_error||env.subtype==='error_max_turns')throw Error(name+' CLI error');
 return JSON.parse(env.result);
}
function checks(){return [['npm',['run','build']],['node',['scripts/check-seats.ts']],['npm',['run','test:regression']]].map(([bin,args])=>{const r=run(bin,args);return {cmd:[bin,...args].join(' '),pass:r.ok,output:r.stdout.slice(-1500),error:r.stderr.slice(-800)};});}
try{
 const plan=agent('lifesim-planner','MISSION: '+mission+'. Inspect the code and return the specified JSON plan. No edits.','Read,Grep,Glob',10);
 if(plan.blocked||!plan.nextPrompt||!Array.isArray(plan.acceptance))stop('Planner blocked or invalid');
 report.baseline=checks();save();if(report.baseline.some(x=>!x.pass))stop('Baseline checks failed; investigate before editing');
 let next=plan.nextPrompt;
 for(let i=1;i<=3;i++){
  const builder=agent('lifesim-builder','MISSION: '+mission+'; ACCEPTANCE: '+JSON.stringify(plan.acceptance)+'; DYNAMIC NEXT TASK: '+next,'Read,Grep,Glob,Edit,Write',24);
  if(builder.status==='BLOCKED')stop('Builder blocked: '+builder.summary);
  const tests=checks(),changes=run('git',['status','--porcelain']);
  const step={round:i,prompt:next,builder,tests,changes:changes.stdout};report.cycles.push(step);save();
  if(!changes.ok)stop('Git inspection failed');
  const evaluation=agent('lifesim-evaluator','MISSION: '+mission+'; ACCEPTANCE: '+JSON.stringify(plan.acceptance)+'; VISUAL_REVIEW: '+!!plan.requiresVisualReview+'; BUILDER: '+JSON.stringify(builder)+'; FILE CHANGES: '+changes.stdout+'; REAL TESTS: '+JSON.stringify(tests)+'; Evaluate and return NEW nextPrompt when RETRY.','Read,Grep,Glob',12);
  step.evaluation=evaluation;save();
  if(evaluation.verdict==='PASS'&&tests.every(x=>x.pass)&&!plan.requiresVisualReview){report.status='PASS';save();console.log('PASS: review changes before commit. Report: .agent-runs/last-run.json');process.exit(0);}
  if(evaluation.verdict!=='RETRY'||!evaluation.nextPrompt||plan.requiresVisualReview){report.status='REVIEW_REQUIRED';save();console.log('Review required. Report: .agent-runs/last-run.json');process.exit(1);}
  next=evaluation.nextPrompt;
 }
 report.status='MAX_ROUNDS';save();console.log('Cycle limit reached');process.exit(1);
}catch(e){stop(String(e.message||e));}
