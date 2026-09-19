// Animation adapter only: before/after states come from the actual verifier.
// Reuse the corpus viewer's hinge rotation; this module makes no legality decisions.
import {swing} from './fold-replay.mjs';
import {ap} from '../../workspace/corpus/geom.mjs';
import {actionLine} from '../EXPERIMENT_SETUP/engine.mjs';

function contains(poly,[x,y]) {
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++) {
    const [ax,ay]=poly[i],[bx,by]=poly[j];
    if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
  }
  return inside;
}
export function verifiedMotion(before,after,action) {
  const line=actionLine(action),length=Math.hypot(...line.n);
  const n=line.n.map(v=>v/length),uv={n,d:line.d/length,dir:[-n[1],n[0]]};
  const sigma=(action.move_positive?1:-1)*(action.over?1:-1);
  const pieces=after.order.map((id,r1)=>{
    const face=after.faces[id];
    const center=face.poly.reduce((c,p)=>[c[0]+p[0]/face.poly.length,c[1]+p[1]/face.poly.length],[0,0]);
    const parent=id<before.faces.length?id:before.faces.findIndex(f=>contains(f.poly,center));
    if(parent<0)throw Error('Cannot map animated face back to the verified sheet');
    const old=before.faces[parent];
    return {flat:face.poly,pre:face.poly.map(p=>ap(old.T,p)),post:face.poly.map(p=>ap(face.T,p)),
      par0:old.par,par1:face.par,moving:old.par!==face.par,r0:before.order.indexOf(parent),r1};
  });
  return (t,gap=0)=>pieces.map(p=>({flat:p.flat,par:t<1?p.par0:p.par1,
    highlight:t>0&&t<1&&p.moving?'selected':undefined,
    pts:(t>=1?p.post.map(q=>[...q,0]):p.pre.map(q=>p.moving?swing(q,uv,sigma*Math.PI*t):[...q,0]))
      .map(([x,y,z])=>[x,y,z+(p.r0+(p.r1-p.r0)*t)*gap])}));
}
