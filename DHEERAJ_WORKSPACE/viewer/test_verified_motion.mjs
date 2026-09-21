import test from 'node:test';
import assert from 'node:assert/strict';
import {CASES} from './verification-cases.mjs';
import {FoldSession} from '../EXPERIMENT_SETUP/engine.mjs';
import {verifiedMotion} from './verified-motion.mjs';
import {ap} from '../../workspace/corpus/geom.mjs';

for(const example of CASES)test(`3D motion lands on verified states: ${example.name}`,()=>{
  const session=new FoldSession(example.cp);
  for(const action of example.candidate){
    const before=session.paper;
    const result=session.apply({tool:'apply_fold',...action});
    if(!result.ok){assert.equal(session.paper,before);continue;}
    const after=session.paper,motion=verifiedMotion(before,after,action);
    const end=motion(1,0),start=motion(0,0),middle=motion(.5,0);
    assert.equal(end.length,after.order.length);
    after.order.forEach((faceId,i)=>{
      const face=after.faces[faceId];
      assert.equal(end[i].par,face.par);
      face.poly.forEach((p,j)=>{
        const expected=ap(face.T,p);
        assert.ok(Math.hypot(end[i].pts[j][0]-expected[0],end[i].pts[j][1]-expected[1],end[i].pts[j][2])<1e-9);
      });
      // A hinge rotation must preserve edges instead of shrinking polygons
      // through a linear interpolation of the two flat endpoint poses.
      for(let j=0;j<face.poly.length;j++){
        const k=(j+1)%face.poly.length;
        const distance=pts=>Math.hypot(...pts[j].map((v,axis)=>v-pts[k][axis]));
        assert.ok(Math.abs(distance(start[i].pts)-distance(middle[i].pts))<1e-9);
      }
    });
    assert.ok(middle.some(p=>p.pts.some(v=>Math.abs(v[2])>1e-6)),'accepted fold must lift paper out of plane');
  }
});
