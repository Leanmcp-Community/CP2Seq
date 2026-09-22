// Run from the repository root. Uses existing renderer; no packages required.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {render} from '../../../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/render.mjs';
import {frameLayers} from '../../../DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/terminal_match.mjs';
const root = new URL('../../../', import.meta.url);
const out = new URL('./dataset/', import.meta.url); mkdirSync(out, {recursive:true});
const read = p => JSON.parse(readFileSync(new URL(p,root),'utf8'));
const manifest = read('workspace/corpus/out/release/manifest.json');
const samples = [manifest.samples.find(s=>s.id==='all-layers/easy-0001'),
 manifest.samples.find(s=>s.id.startsWith('all-layers/mid-') && s.layers<=64),
 manifest.samples.find(s=>s.tier==='some-layers' && s.partial_folds>0 && s.layers<=20),
 ...['hard-0004','hard-0005','hard-0006'].map(id=>manifest.samples.find(s=>s.id===`all-layers/${id}`))];
if(samples.some(s=>!s)) throw Error('Missing representative sample');
let gallery='', sequences='';
for (const [i,s] of samples.entries()) {
 const base=`workspace/corpus/out/release/${s.path}/`;
 const cp=read(base+'cp.fold'), frames=read(base+'steps.fold').file_frames;
 const valid=frames.filter(f=>f.faces_vertices?.length && f.vertices_coords?.length);
 if(!valid.length) throw Error(`No complete frames: ${s.id}`);
 const label=`${s.id.replaceAll('_','\\_')} (${s.tier}, ${s.folds} reference folds)`;
 writeFileSync(new URL(`sample-${i+1}.png`,out),render(cp,frameLayers(valid.at(-1))));
 gallery+=`\\noindent ${label}\\par\n\\includegraphics[width=\\linewidth]{figures/dataset/sample-${i+1}.png}\\par\\medskip\n`;
 if(i<3 || process.argv.includes('--full-sequences')) {
 sequences+=`\\paragraph{${label}}\n`;
 valid.forEach((f,k)=>{
  const name=`sample-${i+1}-state-${k}.png`;
  writeFileSync(new URL(name,out),render(cp,frameLayers(f)));
  sequences+=`\\noindent Stored state ${k}\\par\n\\includegraphics[width=.72\\linewidth]{figures/dataset/${name}}\\par\n`;
 });
 }
}
writeFileSync(new URL('gallery.tex',out),gallery);
writeFileSync(new URL('sequences.tex',out),sequences);
writeFileSync(new URL('selected-samples.json',out),JSON.stringify(samples,null,2));
console.log(`Wrote gallery and sequence renders to ${fileURLToPath(out)}. Inspect before publication.`);
