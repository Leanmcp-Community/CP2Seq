import {CASES, targetFor} from './verification-cases.mjs';
import {ToolSession} from '../EXPERIMENT_SETUP/fold_tools.js';
import {drawLayers, frameLayers} from './trace-playback.mjs';

const $ = id => document.getElementById(id), pretty = value => JSON.stringify(value,null,2);
let selected = CASES[0], session, target, attempted = 0, lastResult = null, timer = null;
const checked = new Map();
function el(tag,text,parent) { const n=document.createElement(tag); if(text!==undefined)n.textContent=text; parent?.append(n); return n; }
function stop() { clearInterval(timer); timer=null; $('case-play').textContent='▶ Play'; }
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
  seek(0); list();
}
function seek(count) {
  session=new ToolSession(selected.cp,target); attempted=0; lastResult=null;
  while(attempted<count) next(false);
  render();
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
  const highlighted=layers.map((l,i)=>({...l,highlight:action?(mode==='all'||mode==='top'&&i>=layers.length-k||mode==='bottom'&&i<k?'#e9b16b':'#a9c8dc'):undefined}));
  drawLayers($('candidate-view'),highlighted,$('case-view').value);
  drawLayers($('target-view'),frameLayers(target),$('case-view').value);
  drawLayers($('sheet-view'),highlighted.map(l=>({...l,polygon:l.sheet_polygon})),'top');
  $('current-caption').textContent=`Candidate · ${state.sequence.length} accepted folds · ${layers.length} layers`;
  const steps=$('case-steps'); steps.replaceChildren();
  for(let i=0;i<=selected.candidate.length;i++) {
    const b=el('button',i?`Attempt ${i}`:'Initial sheet',steps); b.setAttribute('aria-current',String(i===attempted));
    b.onclick=()=>{stop();try{seek(i);}catch(e){failure(e);}};
  }
  $('case-prev').disabled=attempted===0; $('case-next').disabled=attempted===selected.candidate.length;
  $('case-status').classList.toggle('rejected',lastResult?.ok===false);
  $('case-status').textContent=lastResult?.ok===false?`${lastResult.error}: ${lastResult.detail || 'Rejected'}. Paper unchanged.`
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
}
$('case-next').onclick=()=>{stop();try{next();}catch(e){failure(e);}};
$('case-prev').onclick=()=>{stop();try{seek(Math.max(0,attempted-1));}catch(e){failure(e);}};
$('case-reset').onclick=()=>{stop();try{seek(0);}catch(e){failure(e);}};
$('case-finish').onclick=()=>{stop();try{seek(selected.candidate.length);}catch(e){failure(e);}};
$('case-view').onchange=render;
$('case-play').onclick=()=>{
  if(timer){stop();return;} if(attempted===selected.candidate.length)seek(0);
  $('case-play').textContent='Ⅱ Pause'; timer=setInterval(()=>{try{next();}catch(e){failure(e);}},1200);
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
try{select(selected);}catch(error){failure(error);}
