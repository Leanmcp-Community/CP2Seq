// Offline CP insertion/deletion distance. No dependencies or model calls.
import fs from 'node:fs';
import path from 'node:path';
import {creaseGeometry, TOL} from './corpus/crease-compare.mjs';
import {replay} from '../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/engine.mjs';
const args=process.argv.slice(2);
const opt=(k,d)=>{const i=args.indexOf(k);return i<0?d:args[i+1];};
const roots=opt('--runs','CODEX_HARNESS_TESTING/runs').split(',').map(p=>path.resolve(p));
const out=path.resolve(opt('--out','workspace/RESULTS/cp-distance'));
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const exists=p=>fs.existsSync(p);
const parse=s=>{const [key,lo,hi]=s.split('|');return {key,lo:+lo,hi:+hi};};
export function distance(candidate,target){
 const a=creaseGeometry(candidate).map(parse),b=creaseGeometry(target).map(parse);
 const buckets=new Map(); b.forEach((x,j)=>{if(!buckets.has(x.key))buckets.set(x.key,[]);buckets.get(x.key).push(j);});
 const edges=a.map(x=>(buckets.get(x.key)||[]).filter(j=>Math.abs(x.lo-b[j].lo)<=TOL&&Math.abs(x.hi-b[j].hi)<=TOL));
 // Maximum bipartite matching avoids dependence on greedy matching order.
 const owner=new Array(b.length).fill(-1);
 function augment(i,seen){for(const j of edges[i]){if(seen.has(j))continue;seen.add(j);if(owner[j]<0||augment(owner[j],seen)){owner[j]=i;return true;}}return false;}
 let matched=0;for(let i=0;i<a.length;i++)if(augment(i,new Set()))matched++;
 const missing=b.length-matched,extra=a.length-matched,raw=missing+extra;
 return {target_creases:b.length,candidate_creases:a.length,matched,missing,extra,edit_distance:raw,
 normalized_edit_distance:b.length?raw/b.length:null};
}
function foldFromSegments(segments){const vertices_coords=[],edges_vertices=[],edges_assignment=[];
 for(const c of segments){if(!Array.isArray(c.P)||!Array.isArray(c.Q)||!['M','V'].includes(c.assignment??c.a))throw Error('Malformed recorded crease');
 const i=vertices_coords.length;vertices_coords.push(c.P,c.Q);edges_vertices.push([i,i+1]);edges_assignment.push(c.assignment??c.a);}
 return {vertices_coords,edges_vertices,edges_assignment};}
function recover(dir,cp){
 const seqPath=path.join(dir,'seq.json');
 if(exists(seqPath)){const seq=read(seqPath),folds=seq.folds??(Array.isArray(seq)?seq:null);
  if(!Array.isArray(folds))throw Error('Unrecognized seq.json schema');
  if(folds.every(f=>Array.isArray(f.creases)))return {cp:foldFromSegments(folds.flatMap(f=>f.creases)),source:seqPath,recovery:'recorded_final_sequence',steps:folds.length};
  const session=replay(cp,folds);return {cp:foldFromSegments(session.creases),source:seqPath,recovery:'replayed_final_sequence',steps:folds.length};
 }
 const turns=fs.readdirSync(dir).filter(n=>/^turn-\d+$/.test(n)).sort().reverse();
 for(const turn of turns){const p=path.join(dir,turn,'tool.json');if(!exists(p))continue;
  const r=read(p).result;if(!Array.isArray(r?.sequence))continue;
  const session=replay(cp,r.sequence);return {cp:foldFromSegments(session.creases),source:p,recovery:'last_recorded_sequence_snapshot',steps:r.sequence.length};
 }
 throw Error('No recoverable sequence; final.fold is folded geometry, not an original-sheet CP');
}
const attempts=new Map();
function discover(dir){const files=fs.readdirSync(dir,{withFileTypes:true});const names=new Set(files.map(f=>f.name));
 if(names.has('result.json')||names.has('cp.fold')&&names.has('seq.json')){if(!attempts.has(dir))attempts.set(dir,{});return;}
 if(names.has('results.json')){const rows=read(path.join(dir,'results.json'));if(Array.isArray(rows))for(const r of rows){if(typeof r.sample_id==='string'){const p=path.resolve(dir,r.sample_id);if(p.startsWith(dir+path.sep))attempts.set(p,r);}}}
 for(const f of files)if(f.isDirectory()&&!f.name.startsWith('turn-')&&!['initial','final','feedback-images'].includes(f.name))discover(path.join(dir,f.name));
}
for(const root of roots){if(!exists(root))throw Error(`Missing runs root: ${root}`);discover(root);}
const rows=[];fs.mkdirSync(out,{recursive:true});
for(const [dir,fallback] of [...attempts].sort(([a],[b])=>a.localeCompare(b))){
 let row={attempt:dir,status:'unscored'};
 try{const r=exists(path.join(dir,'result.json'))?read(path.join(dir,'result.json')):fallback;
  Object.assign(row,{sample:r.sample_id??path.basename(dir),model:r.model_requested??r.model??r.backend??'unknown',tools:r.tools??'unknown',effort:r.reasoning_effort??'unknown',termination:r.termination??'unknown',solved:r.solved??null});
  row.stratum=/^(easy|mid|hard)-/.exec(row.sample)?.[1]??'other';
  const cp=read(path.join(dir,'cp.fold')),state=recover(dir,cp);
  Object.assign(row,distance(state.cp,cp),{status:'scored',source:state.source,recovery:state.recovery,steps:state.steps});
 }catch(e){row.error=e.message;}
 rows.push(row);
}
function stats(rs){const ok=rs.filter(r=>r.status==='scored'),norm=ok.filter(r=>r.normalized_edit_distance!==null);const mean=(r,k)=>r.length?r.reduce((s,x)=>s+x[k],0)/r.length:null;
 return {attempts:rs.length,scored:ok.length,unscored:rs.length-ok.length,mean_edit_distance:mean(ok,'edit_distance'),mean_normalized_edit_distance:mean(norm,'normalized_edit_distance'),normalized_count:norm.length};}
const groups=new Map();for(const r of rows){const k=JSON.stringify([r.model,r.tools,r.effort,r.stratum]);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}
const summary={metric:'CP merged-interval insertion/deletion distance v1',costs:{insertion:1,deletion:1,substitution:2},endpoint_tolerance:TOL,line_quantization:1/4096,merge_gap:1e-5,boundaries:'excluded',normalization:'raw / target merged M/V interval count; may exceed 1; null for zero target creases',aggregation:'attempt-weighted; missing states excluded and counted explicitly',roots,overall:stats(rows),groups:[...groups].map(([k,v])=>({configuration:JSON.parse(k),...stats(v)}))};
fs.writeFileSync(path.join(out,'attempts.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');
fs.writeFileSync(path.join(out,'attempts.json'),JSON.stringify(rows,null,2)+'\n');
// Separate files, with an index linking each filename to its original attempt directory.
const perAttempt=path.join(out,'per-attempt');fs.mkdirSync(perAttempt,{recursive:true});
const index=rows.map((row,i)=>{
 const filename=`attempt-${String(i+1).padStart(6,'0')}.json`;
 fs.writeFileSync(path.join(perAttempt,filename),JSON.stringify(row,null,2)+'\n');
 return {file:`per-attempt/${filename}`,attempt:row.attempt,status:row.status};
});
fs.writeFileSync(path.join(out,'index.json'),JSON.stringify(index,null,2)+'\n');
const texEscape=s=>String(s).replace(/[\\{}_$%&#~^]/g,c=>({'\\':'\\textbackslash{}','~':'\\textasciitilde{}','^':'\\textasciicircum{}'}[c]??`\\${c}`));
const fmt=x=>x===null?'--':x.toFixed(3);
const modelGroups=new Map();for(const r of rows){const k=r.model??'unknown';if(!modelGroups.has(k))modelGroups.set(k,[]);modelGroups.get(k).push(r);}
let tex='\\begin{table}[t]\n\\centering\n\\small\n\\caption{CP insertion/deletion distance over saved attempts. Means exclude unscored attempts. Normalization divides each distance by its target merged crease count before averaging.}\n\\label{tab:cp-distance}\n\\begin{tabular}{lrrrr}\n\\hline\nModel & Attempts & Scored & Mean distance & Mean normalized \\\\\n\\hline\n';
for(const [model,rs] of [...modelGroups].sort(([a],[b])=>a.localeCompare(b))){const s=stats(rs);tex+=`${texEscape(model)} & ${s.attempts} & ${s.scored} & ${fmt(s.mean_edit_distance)} & ${fmt(s.mean_normalized_edit_distance)} \\\\\n`;}
const s=summary.overall;
tex+=`\\hline\nAll attempts & ${s.attempts} & ${s.scored} & ${fmt(s.mean_edit_distance)} & ${fmt(s.mean_normalized_edit_distance)} \\\\\n\\hline\n\\end{tabular}\n\\end{table}\n`;
tex+='These attempt-weighted averages pool saved configurations and repeated samples; they are descriptive and do not constitute matched model comparisons. The CP-distance scan may cover more runs than the earlier solve-rate snapshot.\n';
fs.writeFileSync(path.join(out,'paper-table.tex'),tex);
console.log(JSON.stringify(summary.overall,null,2));console.log(`Saved ${out}`);
