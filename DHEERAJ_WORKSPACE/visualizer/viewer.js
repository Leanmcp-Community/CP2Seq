const $ = id => document.getElementById(id);
const fileURL = p => '/files/' + p.split('/').map(encodeURIComponent).join('/');
async function read(p) {
  const r = await fetch(p.startsWith('/api/') ? p : fileURL(p));
  if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
  return r.json();
}
let samples = [], active, frames = [], patterns = [], images = [], actions, metadata;
let position = 0, timer, revision = 0;
const ns = 'http://www.w3.org/2000/svg';
function element(tag, attrs = {}) {
  const e = document.createElementNS(ns, tag);
  for (const [k,v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}
function drawing(frame, crease = false) {
  const points = frame?.vertices_coords;
  if (!points?.length) { const p = document.createElement('p'); p.textContent = 'No geometry stored'; return p; }
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (const p of points) {
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) throw new Error('Invalid vertex coordinates');
    xmin = Math.min(xmin,p[0]); ymin = Math.min(ymin,p[1]); xmax = Math.max(xmax,p[0]); ymax = Math.max(ymax,p[1]);
  }
  const size = Math.max(xmax-xmin,ymax-ymin,1e-8)*1.16;
  const cx = (xmin+xmax)/2, cy = (ymin+ymax)/2;
  const svg = element('svg', { viewBox:`${cx-size/2} ${cy-size/2} ${size} ${size}`, role:'img', 'aria-label':crease ? 'Crease pattern' : 'Recorded folded state' });
  const g = element('g', {transform:`translate(0,${2*cy}) scale(1,-1)`}); svg.append(g);
  const faces = frame.faces_vertices || [];
  if (!crease) {
    const order = frame['fo:faces_layer'] || faces.map((_,i) => i);
    for (const i of order) {
      if (!faces[i]) continue;
      g.append(element('polygon', {points:faces[i].map(v => points[v].slice(0,2).join(',')).join(' '),
        fill:frame['fo:faces_parity']?.[i] ? '#b0caeb' : '#f5e7ce',
        'fill-opacity':$('xray').checked ? '.28' : '1', stroke:'#526781', 'stroke-width':size*.003}));
    }
  }
  // Face outlines suffice in folded view: drawing every edge over filled faces would expose hidden edges.
  if (crease || !faces.length || $('xray').checked) for (const [i,[a,b]] of (frame.edges_vertices || []).entries()) {
    const assignment = frame.edges_assignment?.[i];
    const p = points[a], q = points[b];
    g.append(element('line', {x1:p[0],y1:p[1],x2:q[0],y2:q[1],
      stroke:assignment === 'M' ? '#c34e43' : assignment === 'V' ? '#327aca' : '#64748b',
      'stroke-width':size*.004, 'stroke-dasharray':assignment === 'V' ? `${size*.018} ${size*.012}` : 'none'}));
  }
  return svg;
}
function resolveFrames(doc) {
  const {file_frames = [], ...root} = doc;
  const raw = [root,...file_frames], resolved = [];
  for (let i=0;i<raw.length;i++) {
    const f = raw[i];
    if (f.frame_inherit) {
      const parent = f.frame_parent ?? 0;
      if (parent >= i || parent < 0 || !Number.isInteger(parent)) throw new Error('Invalid FOLD frame parent');
      resolved.push({...resolved[parent],...f});
    } else resolved.push(f);
  }
  return resolved;
}
function stop() { clearInterval(timer); timer = null; $('play').textContent = 'Play'; }
function links(items) {
  $('links').replaceChildren();
  for (const [name,p] of items.filter(([,p]) => p)) {
    const a = document.createElement('a'); a.href = fileURL(p); a.textContent = name; a.target='_blank'; a.rel='noopener'; $('links').append(a);
  }
}
function render() {
  const current = frames[position], last = frames.at(-1);
  $('cp').replaceChildren(drawing(patterns[position] || patterns[0], true));
  $('current').replaceChildren(drawing(current)); $('final').replaceChildren(drawing(last));
  $('step').value = position;
  $('frameLabel').textContent = frames.length ? `${current.frame_title || `Frame ${position+1}`} · ${position+1} / ${frames.length}` : 'No saved sequence frames';
  $('prev').disabled = !frames.length || position === 0;
  $('next').disabled = !frames.length || position === frames.length-1;
  $('play').disabled = frames.length < 2; $('step').disabled = !frames.length;
  $('reference').hidden = !images[position];
  if (images[position]) $('instruction').src = fileURL(images[position]); else $('instruction').removeAttribute('src');
  const actionList = actions?.folds || actions?.actions;
  $('metadata').textContent = JSON.stringify({action:actionList?.[position-1] ?? null, metadata, result: active?.kind === 'run' ? actions : undefined}, null, 2);
  for (const [i,b] of [...$('strip').children].entries()) b.classList.toggle('selected',i===position);
  links([['Crease pattern',active?.cp || active?.steps?.[position]?.fold], ['Sequence',active?.sequence],
    ['Actions / result',active?.actions], ['Metadata',active?.meta], ['Compiled reference',active?.viz], ['Instruction image',images[position]]);
}
function thumbnails() {
  $('strip').replaceChildren();
  frames.forEach((f,i) => {
    const b = document.createElement('button'); b.append(drawing(f),document.createTextNode(f.frame_title || `Frame ${i+1}`));
    b.onclick = () => { stop(); position=i; render(); }; $('strip').append(b);
  });
}
async function open(s) {
  stop(); const ticket = ++revision;
  active=s; frames=[]; patterns=[]; images=[]; actions=null; metadata=null; position=0;
  $('title').textContent = s.name; $('status').textContent = 'Loading…';
  $('cpTitle').textContent = s.kind === 'pureland' ? 'Crease pattern at selected step' : 'Crease pattern';
  $('finalTitle').textContent = s.kind === 'run' ? 'Final solver state' : s.kind === 'pureland' ? 'Final compiled reference state' : 'Final ground-truth state';
  $('currentTitle').textContent = s.kind === 'run' ? 'Solver sequence' : s.kind === 'pureland' ? 'Compiled reference sequence' : 'Ground-truth sequence';
  $('step').max=0; thumbnails(); render(); list();
  try {
    let loadedFrames=[], loadedPatterns=[], loadedImages=[], note='';
    const [a,m] = await Promise.all([s.actions ? read(s.actions) : null, s.meta ? read(s.meta) : null]);
    if (s.kind === 'pureland') {
      const [viz, cps] = await Promise.all([s.viz ? read(s.viz) : null, Promise.all(s.steps.map(f => read(f.fold)))]);
      loadedPatterns=cps; loadedImages=s.steps.map(f => f.image);
      loadedFrames=s.steps.map((entry,i) => {
        const number = Number(entry.fold.match(/step_(\d+)/)[1]);
        const v=viz?.steps?.find(v => v.step === number);
        return {frame_title:`Step ${number}`, ...(v?.compiled && v.Vf ? {
          vertices_coords:v.Vf, faces_vertices:v.faces, edges_vertices:v.EV, edges_assignment:v.EA,
          'fo:faces_layer':(v.faces || []).map((_,j)=>j).sort((a,b)=>(v.depth?.[a] ?? a)-(v.depth?.[b] ?? b)),
          'fo:faces_parity':v.Ff
        } : {})};
      });
      note='Pureland source instructions with precompiled flat states. These are per-step compilations, not a verified continuous folding trajectory. Missing compilations are left blank.';
    } else if (s.sequence) {
      const [doc,cp] = await Promise.all([read(s.sequence),s.cp ? read(s.cp) : null]);
      const all=resolveFrames(doc);
      // Synthetic steps.fold stores CP at root and a flat-sheet frame followed by the folds.
      loadedFrames=s.kind === 'generated' ? all.slice(1) : all.filter(f => !f.frame_classes?.includes('creasePattern'));
      loadedPatterns=cp ? [cp] : [];
      note=s.kind === 'generated' ? 'Recorded generator ground truth. Frame 0 is the initial sheet.' : `Solver output · ${s.status || 'unknown status'}. Ground truth is available in the dataset sets; this output is not a reference sequence.`;
    } else note=`${s.status || 'Unknown status'} · This run contains results but no saved sequence.fold. No geometry is inferred from actions.`;
    if (ticket !== revision) return;
    frames=loadedFrames; patterns=loadedPatterns; images=loadedImages; actions=a; metadata=m;
    $('status').textContent=`${s.id}\n${note}`;
    $('step').max=Math.max(0,frames.length-1); thumbnails(); render();
  } catch(e) { if(ticket===revision) {stop(); $('status').textContent=`Could not load sample: ${e.message}`;} }
}
function list() {
  const query=$('search').value.toLowerCase(), set=$('sets').value;
  const filtered=samples.filter(s => (!set || s.set===set) && s.id.toLowerCase().includes(query));
  $('count').textContent=`${filtered.length} samples`; $('samples').replaceChildren();
  for (const s of filtered) {
    const b=document.createElement('button'); b.textContent=s.name+(s.kind==='run' ? ` · ${s.status || 'unknown'}` : '');
    b.title=s.id; b.classList.toggle('selected',active?.id===s.id); b.onclick=()=>open(s); $('samples').append(b);
  }
}
$('sets').onchange=list; $('search').oninput=list;
$('prev').onclick=()=>{stop(); position=Math.max(0,position-1); render();};
$('next').onclick=()=>{stop(); position=Math.min(frames.length-1,position+1); render();};
$('step').oninput=()=>{stop();position=Number($('step').value);render();};
$('xray').onchange=()=>{thumbnails();render();};
$('play').onclick=()=>{
  if(timer) {stop();return;} if(position===frames.length-1) position=0;
  render(); $('play').textContent='Pause';
  timer=setInterval(()=>{position++;render();if(position>=frames.length-1) stop();},800);
};
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
$('instruction').onerror=()=>{$('instruction').alt='Instruction image unavailable';};
try {
  const catalog=await read('/api/catalog'); samples=catalog.samples;
  const sets=[...new Set(samples.map(s=>s.set))];
  for(const name of ['',...sets]) {const o=document.createElement('option');o.value=name;o.textContent=name || 'All sets';$('sets').append(o);}
  list();
  $('status').textContent=samples.length ? 'Choose a dataset and sample.' : 'No supported datasets found.';
  if(catalog.warnings.length) $('status').textContent+='\n'+catalog.warnings.join('\n');
  // Prefer the published generated corpus rather than a solver output.
  const first=samples.find(s=>s.set==='workspace/corpus/out/release/all-layers') || samples[0];
  if(first) {$('sets').value=first.set; await open(first);}
} catch(e) {$('status').textContent=`Cannot load catalog: ${e.message}. Start serve.mjs and open its localhost URL.`;}
