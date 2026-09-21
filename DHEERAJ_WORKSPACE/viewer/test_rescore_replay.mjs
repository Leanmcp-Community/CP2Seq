import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {CASES,targetFor} from './verification-cases.mjs';

test('dry-run replays legal and tearing sequences and leaves saved scores untouched',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'origami-rescore-'));
  try {
    for(const id of ['legal-pair','tear-three']) {
      const fixture=CASES.find(c=>c.id===id), dir=path.join(root,'run',id);
      fs.mkdirSync(dir,{recursive:true});
      const data={'cp.fold':fixture.cp,'target.fold':targetFor(fixture),'seq.json':{folds:fixture.candidate},
        'result.json':{sample_id:id,termination:'finished',cp_match:true,terminal_reference_match:true,solved:true}};
      for(const [name,value]of Object.entries(data))fs.writeFileSync(path.join(dir,name),JSON.stringify(value));
    }
    const script=fileURLToPath(new URL('../../workspace/rescore_runs.mjs',import.meta.url));
    const output=execFileSync(process.execPath,[script,'--root',root,'--dry-run'],{encoding:'utf8'});
    assert.match(output,/Solved after: 1/);
    assert.match(output,/Replay failures: 1/);
    assert.match(output,/step 3: would-tear/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root,'run','tear-three','result.json'))).solved,true);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
