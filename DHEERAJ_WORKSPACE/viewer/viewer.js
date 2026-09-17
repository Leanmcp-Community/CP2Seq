import * as T from 'three';
import { captureViews, mountCaptureControls } from './capture.js';
import { OrbitControls } from './vendor/OrbitControls.js';
const $ = id => document.getElementById(id);
const scene = new T.Scene(); scene.background = new T.Color('#f4f3ee');
const camera = new T.PerspectiveCamera(38, 1, .001, 1000); camera.up.set(0,0,1);
const renderer = new T.WebGLRenderer({antialias:true}); renderer.setPixelRatio(Math.min(devicePixelRatio,2)); $('stage').append(renderer.domElement);
const orbit = new OrbitControls(camera,renderer.domElement); orbit.enableDamping=true;
scene.add(new T.HemisphereLight(0xffffff,0x536b76,2.8));
const light=new T.DirectionalLight(0xffffff,2);light.position.set(2,-3,5);scene.add(light);
const paper=new T.Group();scene.add(paper);
let run=null, entries=[], position=0,playing=false,last=0,size=1,center=new T.Vector3(),meshes=[],loadId=0;
function pause(){playing=false;$('play').textContent='Play';}
function frame(f){if(!f?.vertices_coords||!f.faces_vertices)throw Error('FOLD frame lacks geometry.');return {polygons:f.faces_vertices.map(face=>face.map(v=>f.vertices_coords[v])),stack:f.baseline_stack_bottom_to_top||f.faces_vertices.map((_,i)=>i)};}
function clear(){for(const m of meshes){paper.remove(m.mesh,m.edges);m.mesh.geometry.dispose();m.mesh.material.dispose();m.edges.geometry.dispose();m.edges.material.dispose();}meshes=[];}
function build(s){clear();s.polygons.forEach(poly=>{const points=poly.map(p=>new T.Vector2(p[0],p[1]));const tri=T.ShapeUtils.triangulateShape(points,[]).flat();const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(poly.flatMap(p=>[p[0],p[1],p[2]||0]),3));g.setIndex(tri);g.computeVertexNormals();const mesh=new T.Mesh(g,new T.MeshStandardMaterial({color:0xeac68c,side:T.DoubleSide,roughness:.85,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}));const eg=new T.BufferGeometry();eg.setAttribute('position',new T.Float32BufferAttribute(new Array(poly.length*6).fill(0),3));const edges=new T.LineSegments(eg,new T.LineBasicMaterial({color:0x42565b}));paper.add(mesh,edges);meshes.push({mesh,edges});});}
function resetCamera(){camera.position.copy(center).add(new T.Vector3(size*1.15,-size*1.6,size*1.7));orbit.target.copy(center);camera.near=size/1000;camera.far=size*100;camera.updateProjectionMatrix();orbit.update();}
function install(data){pause();run=data;const s=data.trace?.nodes?.[0]||data.solution[0];if(s){build(s);const box=new T.Box3();s.polygons.flat().forEach(p=>box.expandByPoint(new T.Vector3(p[0],p[1],p[2]||0)));box.getCenter(center);size=Math.max(box.getSize(new T.Vector3()).length(),.01);resetCamera();}else clear();const r=data.result;$('summary').textContent=`${(r.algorithm||'FOLD').toUpperCase()} · ${r.status||'Snapshot'}\n${r.queries??'—'} attempted moves\n${r.visited??'—'} visited states · depth ${r.max_depth_reached??'—'}\n${r.steps??'—'} solution folds · ${r.elapsed_seconds?.toFixed(2)??'—'} seconds`;
const target = (r.target || 'Unknown target').split(/[\\/]/).at(-1);
$('summary').textContent += `\nTarget: ${target}\nSOLVED means this target snapshot was reached in the baseline model.`;
if (target === 'ladybug_step_04.fold') $('summary').textContent += '\nSmoke test: intermediate Ladybug step 4, not the completed object.';
$('mode').options[1].disabled=!data.trace;$('mode').value=data.trace?'search':'solution';chooseMode();}
function chooseMode(){pause();const search=$('mode').value==='search';entries=search?run.trace.events:run.solution.map((s,i)=>({kind:i?'fold':'initial',node:i}));$('coverage').textContent=search?(run.trace.omitted_events?`Trace shows the first ${run.trace.events.length-1} events (${run.trace.cap_reason}); ${run.trace.omitted_events} later events omitted. Final stop is recorded. Solution remains complete.`:'Complete recorded search, in execution order.'):(run.solution.length?'Saved solution only. Old outputs do not contain exploration history.':'No solution frames were saved. Re-run with --trace-events to inspect exploration.');position=0;$('timeline').max=Math.max(0,entries.length-1);draw();}
function sample(entry){if($('mode').value==='solution'){const i=entry.node;return {to:run.solution[i],from:run.solution[Math.max(0,i-1)],action:i?run.result.actions?.[i-1]:null};}const n=run.trace.nodes[entry.node]||(entry.kind==='stop'?run.trace.nodes.at(-1):null);return {to:n,from:entry.kind==='accepted'?run.trace.nodes[n?.parent]:n,action:entry.kind==='accepted'?n?.action:null};}
// Adapted from the main studio's explicit hinge-rotation approach. Hold face 0
// fixed, matching Problem.apply's canonicalization: if it moves, rotate the
// complement through the inverse motion. No coordinate lerp/shrinking panels.
function pointsFor(from,to,action,t){if(!action||!from||t>=1)return to.polygons;const [nx,ny,d]=action.axis;const moving=new Set(action.moving_faces);const rootMoves=moving.has(0);let signed=0;for(const f of moving)for(const p of from.polygons[f]){const v=nx*p[0]+ny*p[1]-d;if(Math.abs(v)>Math.abs(signed))signed=v;}const theta=Math.PI*(action.direction==='over'?1:-1)*Math.sign(signed)*t*(rootMoves?-1:1);const axis=new T.Vector3(ny,-nx,0),origin=new T.Vector3(nx*d,ny*d,0);return from.polygons.map((poly,f)=>poly.map(p=>{const v=new T.Vector3(p[0],p[1],p[2]||0);if(moving.has(f)!==rootMoves)v.sub(origin).applyAxisAngle(axis,theta).add(origin);return v.toArray();}));}
function draw(){paper.visible=entries.length>0;$('empty').hidden=entries.length>0&&meshes.length>0;if(!entries.length){$('event').textContent='No recorded frames available.';return;}const i=Math.min(Math.ceil(position),entries.length-1),e=entries[i];const s=sample(e);const fraction=position-Math.floor(position);const t=fraction===0?1:fraction*fraction*(3-2*fraction);if(s.to){const polys=pointsFor(s.from,s.to,s.action,t);const rank=new Map(s.to.stack.map((f,k)=>[f,k]));polys.forEach((poly,f)=>{const {mesh,edges}=meshes[f];const a=mesh.geometry.attributes.position,b=edges.geometry.attributes.position;const offset=$('layers').checked?(rank.get(f)||0)*size*.0006:0;poly.forEach((p,j)=>a.setXYZ(j,p[0],p[1],(p[2]||0)+offset));for(let j=0;j<poly.length;j++){const k=(j+1)%poly.length;b.setXYZ(j*2,a.getX(j),a.getY(j),a.getZ(j));b.setXYZ(j*2+1,a.getX(k),a.getY(k),a.getZ(k));}a.needsUpdate=b.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();edges.geometry.computeBoundingSphere();const active=s.action?.moving_faces.includes(f);mesh.material.color.setHex(active?0x75bfa9:0xeac68c);});}
const action=s.action||e.action;const labels={accepted:'Accepted fold',rejected:'Rejected attempt · parent unchanged',duplicate:'Valid transition · already visited at equal or lower depth',select:'Select state from '+(run.result.algorithm==='bfs'?'queue':'stack'),backtrack:'Backtrack to parent · navigation',depth_limit:'Depth cap · branch stops',stop:'Search stopped: '+(e.status||run.result.status),fold:'Solution fold',initial:'Initial crease pattern',root:'Initial crease pattern'};$('event').textContent=`${labels[e.kind]||e.kind}${s.to?.depth!==undefined?' · depth '+s.to.depth:''}${action?' · '+action.direction+' · faces '+action.moving_faces.join(', '):''}`;$('timeline').value=position;$('position').textContent=`${i+1} / ${entries.length}${e.kind==='stop'&&run.trace?.omitted_events?' · jumped over omitted events':''}`;}
$('mode').onchange=()=>run&&chooseMode();$('play').onclick=()=>{if(entries.length<2)return;if(playing){pause();return;}if(position>=entries.length-1)position=0;playing=true;$('play').textContent='Pause';};$('prev').onclick=()=>{pause();position=Math.max(0,Math.ceil(position)-1);draw();};$('next').onclick=()=>{pause();position=Math.min(entries.length-1,Math.floor(position)+1);draw();};$('timeline').oninput=e=>{pause();position=Number(e.target.value);draw();};$('reset').onclick=resetCamera;$('layers').onchange=draw;
new ResizeObserver(()=>{const w=$('stage').clientWidth,h=$('stage').clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();}).observe($('stage'));
resetCamera();renderer.setAnimationLoop(now=>{const dt=Math.min((now-last)/1000,.1);last=now;if(playing){position=Math.min(entries.length-1,position+dt*Number($('speed').value));draw();if(position>=entries.length-1)pause();}orbit.update();renderer.render(scene,camera);});

function showError(message) {
  $('load-error').hidden = !message;
  $('load-error').textContent = message;
  if (message) {
    $('event').textContent = message;
    $('empty').hidden = false;
    $('empty').textContent = message;
  }
}
async function api(path) {
  const response = await fetch(path, {cache: 'no-store', signal: AbortSignal.timeout(20000)});
  const type = response.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw Error('Start viewer/server.py instead of python -m http.server, then open http://127.0.0.1:8000/.');
  const data = await response.json();
  if (!response.ok) throw Error(data.error || `Request failed (${response.status})`);
  return data;
}
async function loadRun(id) {
  const token = ++loadId;
  pause();
  showError('');
  clear();
  run = null;
  entries = [];
  $('empty').hidden = false;
  $('empty').textContent = 'Loading paper and search history…';
  $('summary').textContent = 'Loading ' + id;
  try {
    const data = await api('/api/run?id=' + encodeURIComponent(id));
    if (token !== loadId) return;
    if (data.trace && data.trace.version !== 1) throw Error('Unsupported trace version.');
    const solution = data.seq ? [data.seq, ...(data.seq.file_frames || [])].map(frame) : [];
    install({result: data.result, trace: data.trace, solution});
    $('empty').hidden = meshes.length > 0 && entries.length > 0;
    if (!$('empty').hidden) $('empty').textContent = 'This run has no saved geometry. Re-run with --trace-events 20000 to record exploration.';
  } catch (error) {
    if (token === loadId) {
      $('summary').textContent = 'Run could not be loaded';
      showError(error.message);
    }
  }
}
let refreshId = 0;
async function refreshRuns(reload = true) {
  const token = ++refreshId;
  const selected = $('runs').value;
  $('refresh').disabled = true;
  showError('');
  try {
    const library = await api('/api/runs');
    if (token !== refreshId) return;
    $('runs').replaceChildren();
    for (const row of library.runs) {
      const option = document.createElement('option');
      option.value = row.id;
      option.textContent = `${row.id} · ${row.status}${row.trace ? ' · trace' : ''}`;
      $('runs').append(option);
    }
    $('runs').disabled = !library.runs.length;
    $('connection').textContent = `${library.runs.length} runs · ${library.root}${library.truncated ? ' · listing capped; choose a narrower --exports folder' : ''}`;
    if (library.errors.length) $('connection').textContent += ` · ${library.errors.length} unreadable results skipped`;
    if (!library.runs.length) {
      pause(); clear(); entries=[]; run=null;
      $('summary').textContent = 'No exported runs found.';
      $('empty').hidden = false;
      $('empty').textContent = 'Run a search. Completed experiments appear here automatically.';
      return;
    }
    $('runs').value = library.runs.some(r => r.id === selected) ? selected : library.runs[0].id;
    if (reload || !run || $('runs').value !== selected) await loadRun($('runs').value);
  } catch (error) {
    if (token === refreshId) {
      $('connection').textContent = 'Local run library unavailable';
      showError(error.message);
    }
  } finally {
    if (token === refreshId) $('refresh').disabled = false;
  }
}
window.captureFoldStep = (step = Math.floor(position)) => {
  pause();
  if (!Number.isInteger(step) || step < 0 || step >= entries.length) throw Error('Select a valid playback step first');
  const state = sample(entries[step]).to;
  if (!state?.polygons?.length) throw Error('No geometry at this step');
  const ranks = new Map(state.stack.map((f, i) => [f, i]));
  return captureViews(state.polygons.map((poly, i) => ({par: 0,
    pts: poly.map(p => [p[0], p[1], (p[2] || 0) + (ranks.get(i) || 0) * size * .0006])})), `Step ${step}`);
};
mountCaptureControls(() => window.captureFoldStep());
$('runs').onchange = () => loadRun($('runs').value);
$('refresh').onclick = () => refreshRuns();
refreshRuns();
setInterval(() => {
  if (!document.hidden && !$('refresh').disabled) refreshRuns(false);
}, 10000);
