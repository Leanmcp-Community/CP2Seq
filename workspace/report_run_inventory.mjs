// Read-only run audit; generates Markdown and JSON. No dependencies or model calls.
import fs from 'node:fs';
import path from 'node:path';
const args=process.argv.slice(2);
const option=(name,fallback)=>{const i=args.indexOf(name);if(i<0)return fallback;if(!args[i+1])throw Error(`Missing value: ${name}`);return args[i+1];};
const root=path.resolve(option('--runs','CODEX_HARNESS_TESTING/runs'));
const out=path.resolve(option('--out','workspace/RESULTS/run-inventory'));
const since=option('--since','20260923T034343');
const warnings=[], attempts=[];
function read(file){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){warnings.push({file,error:e.message});return null;}}
function condition(c){const tools=c.tools??'base',tier=c.compare_tier??0;
 if(tools==='base'&&!tier&&!c.compare_auto)return 'basic';
 if(tools==='legal-folds'&&!tier&&!c.compare_auto)return 'legal';
 if(tools==='legal-folds'&&tier)return `${c.compare_auto?'auto':'on-demand'}-tier-${tier}`;
 return `${tools}/tier-${tier}/auto-${Boolean(c.compare_auto)}`;
}
for(const entry of fs.readdirSync(root,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
 if(!entry.isDirectory()||!entry.name.startsWith('codex-'))continue;
 const dir=path.join(root,entry.name),configFile=path.join(dir,'config.json');
 if(!fs.existsSync(configFile)){warnings.push({file:configFile,error:'Missing configuration; run excluded'});continue;}
 const c=read(configFile);if(!c)continue;
 const aggregateFile=path.join(dir,'results.json');
 const aggregate=fs.existsSync(aggregateFile)?read(aggregateFile):[];
 const fallback=new Map((Array.isArray(aggregate)?aggregate:[]).filter(r=>r.sample_id).map(r=>[r.sample_id,r]));
 const samples=new Set([...(c.samples??[]),...fallback.keys()]);
 for(const d of fs.readdirSync(dir,{withFileTypes:true}))if(d.isDirectory()&&fs.existsSync(path.join(dir,d.name,'result.json')))samples.add(d.name);
 for(const sample of samples){
  const file=path.join(dir,sample,'result.json'),errorFile=path.join(dir,sample,'error.json');
  const r=fs.existsSync(file)?read(file):fallback.get(sample)??(fs.existsSync(errorFile)?read(errorFile):null);
  const complete=typeof r?.solved==='boolean'&&r.termination!=='error';
  attempts.push({run:entry.name,sample,model:c.model??r?.model_requested??'unknown',effort:c.reasoning_effort??'unknown',
   condition:condition(c),corpus:c.corpus??'unknown',recent:entry.name.slice(6)>=since,
   complete,solved:complete?r.solved:null,termination:r?.termination??'no_result',error:r?.error??null,
   source:fs.existsSync(file)?file:aggregateFile,config:c});
 }
}
const key=r=>JSON.stringify([r.corpus,r.sample]);
const groups=new Map();
for(const r of attempts.filter(r=>r.complete)){const k=JSON.stringify([r.model,r.effort,r.condition]);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}
const inventory=[...groups].map(([k,rows])=>{const [model,effort,condition]=JSON.parse(k);return {model,effort,condition,
 earlier:rows.filter(r=>!r.recent).length,recent:rows.filter(r=>r.recent).length,completed:rows.length,
 unique_samples:new Set(rows.map(key)).size,solved:rows.filter(r=>r.solved).length};});
const ablations=[];
for(const [model,effort] of [['gpt-5.6-luna','low'],['gpt-6-luna','low'],['gpt-6-luna','high']]){
 for(const condition of ['basic','legal','auto-tier-3']){
  const eligible=attempts.filter(r=>{const c=r.config;return r.recent&&r.model===model&&r.effort===effort&&r.condition===condition&&
   c.max_turns===80&&c.timeout===300&&c.image_history==='all'&&c.cycle_limit===3&&c.revisit_limit===15&&c.stuck_limit===5;});
  const strata=[];
  for(const [group,suffix,action] of [['easy','/release/all-layers/samples','all-layers'],['mid','/release/all-layers/samples','all-layers'],['hard','/release/all-layers/samples','all-layers'],['layers','/release/some-generated-d5/samples','any']]){
   const selected=[],missing=[];
   for(let i=1;i<=10;i++){
    const sample=`${group}-${String(i).padStart(4,'0')}`;
    const matches=eligible.filter(r=>r.sample===sample&&r.corpus.replace(/\/$/,'').endsWith(suffix)&&r.config.action_space===action);
    const completed=matches.filter(r=>r.complete);
    // First completed attempt avoids selecting retries according to their outcome.
    if(completed.length){selected.push(completed[0]);if(completed.length>1)warnings.push({model,effort,condition,sample,error:'Multiple completed attempts; first used in ablation table'});}
    else missing.push({sample,recorded_errors:matches.filter(r=>r.error).map(r=>({run:r.run,error:r.error}))});
   }
   strata.push({group,completed:selected.length,solved:selected.filter(r=>r.solved).length,expected:10,missing,
    selected_attempts:selected.map(r=>({sample:r.sample,run:r.run,solved:r.solved}))});
  }
  const completed=strata.reduce((n,s)=>n+s.completed,0),solved=strata.reduce((n,s)=>n+s.solved,0);
  ablations.push({model,effort,condition,completed,solved,expected:40,missing_count:40-completed,solve_rate:completed?solved/completed:null,strata});
 }
}
const report={generated_at:new Date().toISOString(),runs_root:root,recent_since:since,
 definitions:{inventory:'All completed Codex attempts, including repeats and differing budgets. Unique samples use corpus path plus sample ID.',
 ablations:'First completed attempt per sample and condition, recent runs only, reference IDs 0001–0010, 80 turns, 300s timeout, all image history, matched action spaces and stopping settings.',
 missing:'No completed result. May be intentionally skipped, interrupted, errored, running, or unstarted; not counted as a model failure.',
 legacy:'Missing tools/compare settings interpreted as base/no comparison, matching historical defaults.'},inventory,ablations,warnings,
 attempts:attempts.map(({config,...r})=>r)};
const esc=v=>String(v).replaceAll('|','\\|').replaceAll('\n',' ');
function table(headers,rows){return [headers,headers.map(()=>'---'),...rows].map(r=>'| '+r.map(esc).join(' | ')+' |').join('\n');}
let md=`# Run inventory and ablations\n\nGenerated: ${report.generated_at}\n\nRecent cohort starts at run timestamp ${since}.\n\n## Inventory\n\n${report.definitions.inventory}\n\n`;
md+=table(['Model','Effort','Condition','Earlier','Recent','Completed','Unique samples','Solved'],inventory.map(r=>[r.model,r.effort,r.condition,r.earlier,r.recent,r.completed,r.unique_samples,r.solved]));
md+='\n\n`basic`: editing/observation tools without legal enumeration. `legal`: legal enumeration without target comparison. `on-demand-tier-3`: model-requested comparison. `auto-tier-3`: automatically attached comparison.\n\n## Recent Luna ablations\n\n'+report.definitions.ablations+' Cells show solved/completed, with 10 intended samples per group.\n\n';
md+=table(['Model','Effort','Condition','Easy','Medium','Hard','Some-layers','Solved / completed','Missing'],ablations.map(r=>[r.model,r.effort,r.condition,...r.strata.map(s=>`${s.solved}/${s.completed}`),`${r.solved}/${r.completed}`,r.missing_count]));
md+='\n\nMissing attempts are not failures. Unequal coverage means these are descriptive summaries, not fully matched performance comparisons.\n\n## Missing ablation results\n\n';
for(const r of ablations){const ids=r.strata.flatMap(s=>s.missing.map(x=>x.sample));if(ids.length)md+=`- ${r.model}, ${r.effort}, ${r.condition}: ${ids.join(', ')}\n`;}
md+=`\n## Audit notes\n\n${warnings.length} warnings; details and per-attempt provenance are in report.json. Missing results are not assumed to be intentional exclusions.\n`;
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(out,'report.md'),md);
console.log(`Saved ${out}/report.md and report.json (${warnings.length} audit warnings)`);
