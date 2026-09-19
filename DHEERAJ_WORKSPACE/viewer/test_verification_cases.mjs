import test from 'node:test';
import assert from 'node:assert/strict';
import {CASES,targetFor} from './verification-cases.mjs';
import {FoldSession,actionFromFold} from '../EXPERIMENT_SETUP/engine.mjs';
import {evaluateSession} from '../EXPERIMENT_SETUP/evaluation.mjs';
import {frameLayers} from '../EXPERIMENT_SETUP/terminal_match.mjs';

for(const example of CASES) test(example.name,()=>{
  const session=new FoldSession(example.cp); let result;
  for(const action of example.candidate) {
    const before=JSON.stringify(session);
    result=session.apply(actionFromFold(action));
    if(!result.ok)assert.equal(JSON.stringify(session),before,'rejection must not change paper or history');
  }
  const evaluation=evaluateSession(session,frameLayers(targetFor(example)));
  const actual={error:result?.ok===false?result.error:null,cp_match:evaluation.cp_match,
    terminal_reference_match:evaluation.terminal_reference_match,pilot_match:evaluation.pilot_match};
  assert.deepEqual(actual,example.expected);
});
