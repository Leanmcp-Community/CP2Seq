import {CASES, targetFor} from './verification-cases.mjs';
import {ToolSession} from '../EXPERIMENT_SETUP/fold_tools.js';
import {frameLayers} from './trace-playback.mjs';
import {PaperStage} from './paper-stage.js';
import {verifiedMotion} from './verified-motion.mjs';
import {actionLine} from '../EXPERIMENT_SETUP/engine.mjs';

const $ = id => document.getElementById(id), pretty = value => JSON.stringify(value,null,2);
let selected = CASES[0], session, target, attempted = 0, lastResult = null;
let playing=false, position=0, lastTime=0, transitions=[], animationFrame;
let candidateStage, targetStage, sheetStage;
const checked = new Map();
function el(tag,text,parent) { const n=document.createElement(tag); if(text!==undefined)n.textContent=text; parent?.append(n); return n; }
function stop() { playing=false; $('case-play').textContent='▶ Play'; }
function failure(error) { stop(); $('verification-error').hidden=false; $('verification-error').textContent=error.message; }
function list() {
  const parent=$('cases'); parent.replaceChildren();
  for(const group of ['Connectivity','Legality','Scoring']) {
    el('h3',group,parent);
    for(const c of CASES.filter(c=>c.group===group)) {
      const button=el('button',c.name,parent); button.className='row-item'; button.setAttribute('aria-current',String(c.id===selected.id));
      if(checked.has(c.id)) { const badge=el('span',checked.get(c.id)?'Expected outcome':'Unexpected outcome',button); badge.className='badge '+(checked.get(c.id)?'ok':'bad'); }
      button.onclick=()=>{try{select(c);}catch(e){failure(e);}};
    }
  }
}
function select(example) {
  stop(); selected=example; target=targetFor(example); checked.delete(example.id);
  $('verification-error').hidden=true;
  $('case-title').textContent=example.name; $('case-description').textContent=example.description;
  $('reference-actions').textContent=pretty(example.reference); $('candidate-actions').textContent=pretty(example.candidate);
  const probe=new ToolSession(example.cp,target); transitions=[];
  for(const action of example.candidate) {
    const before=probe.session.paper, result=probe.call('add_fold',action), after=probe.session.paper;
    transitions.push({action,result,motion:result.ok?verifiedMotion(before,after,action):null});
  }
  $('case-timeline').max=example.candidate.length;
  seek(0); list(); candidateStage.fit();targetStage.fit();sheetStage.fit();
  if($('case-view').value==='top'){candidateStage.reset(true);targetStage.reset(true);}
}
function seek(count) {
  session=new ToolSession(selected.cp,target); attempted=0; lastResult=null;
  while(attempted<count) next(false);
  position=count; render();
}
function next(redraw=true) {
  if(attempted>=selected.candidate.length){stop();return;}
  lastResult=session.call('add_fold',selected.candidate[attempted++]);
  if(redraw)render();
  if(attempted>=selected.candidate.length)stop();
}
function actualVerdict(active,last) {
  const evaluation=active.evaluate();
  return {error:last?.ok===false?last.error:null,cp_match:evaluation.cp_match,
    terminal_reference_match:evaluation.terminal_reference_match,pilot_match:evaluation.pilot_match};
}
function render() {
  const state=session.state(), layers=state.layers_bottom_to_top;
  const action=lastResult?.ok===false?selected.candidate[attempted-1]:selected.candidate[attempted];
  const mode=action?.selection_mode??'all', k=action?.layer_count??layers.length;
  const selectedRanks=layers.flatMap((_,i)=>mode==='all'||mode==='top'&&i>=layers.length-k||mode==='bottom'&&i<k?[i]:[]);
  const highlighted=layers.map((l,i)=>({...l,highlight:action?(selectedRanks.includes(i)?'selected':'held'):undefined}));
  const pieces=(ls,spacing)=>ls.map((l,i)=>({par:l.parity,highlight:l.highlight,pts:l.polygon.map(([x,y])=>[x,y,i*spacing])}));
  candidateStage.show(pieces(highlighted,gap()));
  targetStage.show(pieces(frameLayers(target),gap()));
  sheetStage.show(pieces(highlighted.map(l=>({...l,polygon:l.sheet_polygon})),0));
  candidateStage.setHinge(action?actionLine(action):null,selectedRanks,gap(),lastResult?.ok===false);
  $('current-caption').textContent=`Candidate · ${state.sequence.length} accepted folds · ${layers.length} layers`;
  const steps=$('case-steps'); steps.replaceChildren();
  for(let i=0;i<=selected.candidate.length;i++) {
    const b=el('button',i?`Attempt ${i}`:'Initial sheet',steps); b.setAttribute('aria-current',String(i===attempted));
    b.onclick=()=>{stop();try{seek(i);}catch(e){failure(e);}};
  }
  $('case-prev').disabled=attempted===0; $('case-next').disabled=attempted===selected.candidate.length;
  $('case-status').classList.toggle('rejected',lastResult?.ok===false);
  $('case-status').textContent=lastResult?.ok===false?`${lastResult.error}: ${(lastResult.detail || 'Rejected').replace(/[.\s]+$/,'')}. Paper unchanged.`
    :attempted?`Attempt ${attempted} accepted. ${state.sequence.length} folds in the current sequence.`:'Initial sheet. Play or step forward to inspect each attempted fold.';
  $('case-result').textContent=lastResult?pretty(lastResult):'No tool called yet.';
  $('case-evaluation').textContent=pretty(session.evaluate());
  const actual=actualVerdict(session,lastResult), complete=attempted===selected.candidate.length;
  const verdict=$('verdict'); verdict.replaceChildren();
  const table=el('table',undefined,verdict), head=el('tr',undefined,el('thead',undefined,table));
  ['Check','Expected at end','Actual now'].forEach(t=>el('th',t,head));
  const body=el('tbody',undefined,table);
  for(const [key,expected] of Object.entries(selected.expected)) {
    const row=el('tr',undefined,body); el('td',key,row); el('td',String(expected??'none'),row);
    el('td',`${String(actual[key]??'none')}${complete?(actual[key]===expected?' ✓':' ✕'):''}`,row);
  }
  if(complete) { checked.set(selected.id,Object.entries(selected.expected).every(([key,value])=>actual[key]===value)); list(); }
  $('case-timeline').value=position;
}
function gap(){return $('case-view').value==='exploded' ? .11 : .004;}
function drawPosition(value,force=false) {
  const k=Math.min(Math.floor(value),selected.candidate.length),t=value-k;
  if(k!==attempted)seek(k);else if(force)render();
  position=value; $('case-timeline').value=value;
  if(t>0&&k<transitions.length) {
    const transition=transitions[k];
    if(transition.motion) {
      const eased=t*t*(3-2*t);
      candidateStage.show(transition.motion(eased,gap()));
      $('current-caption').textContent=`Candidate · folding attempt ${k+1} · ${Math.round(eased*180)}°`;
      $('case-status').textContent=`Folding attempt ${k+1} around its crease. The verdict below describes the preceding completed state.`;
    } else {
      const line=actionLine(transition.action),layers=session.state().layers_bottom_to_top;
      const mode=transition.action.selection_mode??'all',count=transition.action.layer_count??layers.length;
      const ranks=layers.flatMap((_,i)=>mode==='all'||mode==='top'&&i>=layers.length-count||mode==='bottom'&&i<count?[i]:[]);
      candidateStage.setHinge(line,ranks,gap(),true);
      $('case-status').classList.add('rejected');
      $('case-status').textContent=`Attempt ${k+1}: ${transition.result.error}. Paper stays unchanged; the rejected crease is red.`;
    }
  }
}
$('case-next').onclick=()=>{stop();try{seek(Math.min(selected.candidate.length,Math.floor(position)+1));}catch(e){failure(e);}};
$('case-prev').onclick=()=>{stop();try{seek(Math.max(0,attempted-1));}catch(e){failure(e);}};
$('case-reset').onclick=()=>{stop();try{seek(0);}catch(e){failure(e);}};
$('case-finish').onclick=()=>{stop();try{seek(selected.candidate.length);}catch(e){failure(e);}};
$('case-view').onchange=()=>{
  const mode=$('case-view').value;
  candidateStage.xray(mode==='xray');targetStage.xray(mode==='xray');
  drawPosition(position,true);candidateStage.fit();targetStage.fit();
  if(mode==='top'){candidateStage.reset(true);targetStage.reset(true);}
};
$('case-camera').onclick=()=>{candidateStage.fit();targetStage.fit();sheetStage.fit();};
$('case-timeline').oninput=()=>{stop();try{drawPosition(Number($('case-timeline').value),true);}catch(e){failure(e);}};
$('case-play').onclick=()=>{
  if(playing){stop();return;} if(position>=selected.candidate.length)seek(0);
  playing=true; $('case-play').textContent='Ⅱ Pause';
};
$('check-all').onclick=()=>{
  stop(); try {
    for(const example of CASES) {
      const active=new ToolSession(example.cp,targetFor(example)); let result;
      for(const action of example.candidate)result=active.call('add_fold',action);
      const actual=actualVerdict(active,result);
      checked.set(example.id,Object.entries(example.expected).every(([key,value])=>actual[key]===value));
    }
    const passing=[...checked.values()].filter(Boolean).length;
    $('suite-status').textContent=`${passing}/${CASES.length} cases match their expected outcomes.`; list();
  } catch(error){failure(error);}
};
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
function animate(now){
  const dt=Math.min((now-lastTime)/1000,.1);lastTime=now;
  if(playing)try{
    drawPosition(Math.min(selected.candidate.length,position+dt*Number($('case-speed').value)*.65));
    if(position>=selected.candidate.length)stop();
  }catch(error){failure(error);}
  animationFrame=requestAnimationFrame(animate);
}
try{
  candidateStage=new PaperStage($('candidate-view'));targetStage=new PaperStage($('target-view'));sheetStage=new PaperStage($('sheet-view'));
  select(selected);animationFrame=requestAnimationFrame(animate);
}catch(error){failure(error);}
window.addEventListener('pagehide',()=>{stop();cancelAnimationFrame(animationFrame);for(const stage of [candidateStage,targetStage,sheetStage])stage?.dispose();});
