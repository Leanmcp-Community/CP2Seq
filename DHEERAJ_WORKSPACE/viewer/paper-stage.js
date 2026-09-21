// Interactive paper presentation, matching corpus.js and viewer.js.
import * as T from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';

export class PaperStage {
  constructor(host) {
    this.host=host; host.dataset.renderer='threejs';
    this.scene=new T.Scene(); this.scene.background=new T.Color('#f4f3ee');
    this.camera=new T.PerspectiveCamera(38,1,.001,1000); this.camera.up.set(0,0,1);
    this.renderer=new T.WebGLRenderer({antialias:true}); this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    host.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label',host.getAttribute('aria-label')||'Interactive folded paper');
    this.orbit=new OrbitControls(this.camera,this.renderer.domElement); this.orbit.enableDamping=true;
    this.scene.add(new T.HemisphereLight(0xffffff,0x536b76,2.6));
    const light=new T.DirectionalLight(0xffffff,1.9); light.position.set(2,-3,5); this.scene.add(light);
    this.paper=new T.Group(); this.scene.add(this.paper);
    this.materials=[0xf0d9a8,0xc9a06a,0xe9b16b,0xa9c8dc].map(color=>new T.MeshStandardMaterial({color,
      side:T.DoubleSide,roughness:.88,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}));
    this.wire=new T.LineBasicMaterial({color:0x42565b});
    this.hingeMaterial=new T.LineBasicMaterial({color:0x237c69,depthTest:false});
    this.hinge=new T.LineSegments(new T.BufferGeometry(),this.hingeMaterial); this.hinge.renderOrder=100; this.scene.add(this.hinge);
    this.center=new T.Vector3(); this.size=1.5;
    this.resize=new ResizeObserver(()=>{
      const w=host.clientWidth,h=host.clientHeight; if(!w||!h)return;
      this.renderer.setSize(w,h); this.camera.aspect=w/h; this.camera.updateProjectionMatrix();
    }); this.resize.observe(host);
    this.reset();
    this.renderer.setAnimationLoop(()=>{this.orbit.update();this.renderer.render(this.scene,this.camera);});
  }
  show(pieces) {
    for(const object of [...this.paper.children]) {object.geometry.dispose();this.paper.remove(object);}
    for(const p of pieces) {
      // Triangulate material coordinates, which stay non-degenerate while the
      // moving polygon passes vertically through its 90-degree pose.
      const flat=p.flat||p.pts;
      const geometry=new T.BufferGeometry();
      geometry.setAttribute('position',new T.Float32BufferAttribute(p.pts.flat(),3));
      geometry.setIndex(T.ShapeUtils.triangulateShape(flat.map(v=>new T.Vector2(v[0],v[1])),[]).flat());
      geometry.computeVertexNormals();
      const material=this.materials[p.highlight==='selected'?2:p.highlight==='held'?3:p.par?1:0];
      this.paper.add(new T.Mesh(geometry,material));
      const edges=new T.BufferGeometry().setFromPoints([...p.pts,p.pts[0]].map(v=>new T.Vector3(...v)));
      this.paper.add(new T.Line(edges,this.wire));
    }
  }
  setHinge(line,ranks=[],gap=0,rejected=false) {
    const vertices=[];
    if(line) {
      const length=Math.hypot(...line.n), nx=line.n[0]/length,ny=line.n[1]/length,d=line.d/length;
      for(const rank of ranks)for(const sign of [-1,1])vertices.push(nx*d-sign*ny*this.size,ny*d+sign*nx*this.size,rank*gap+.001);
    }
    this.hinge.geometry.dispose(); this.hinge.geometry=new T.BufferGeometry();
    this.hinge.geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
    this.hingeMaterial.color.setHex(rejected?0xc52e3a:0x237c69);
  }
  fit() {
    const box=new T.Box3().setFromObject(this.paper);
    if(!box.isEmpty()){box.getCenter(this.center);this.size=Math.max(box.getSize(new T.Vector3()).length(),.1);}
    this.reset();
  }
  reset(top=false) {
    this.camera.position.copy(this.center).add(new T.Vector3(...(top?[0,0,this.size*2.4]:[this.size*.7,-this.size*1.4,this.size*1.4])));
    this.camera.up.set(0,top?1:0,top?0:1); this.orbit.target.copy(this.center);
    this.camera.near=this.size/1000;this.camera.far=this.size*100;this.camera.updateProjectionMatrix();this.orbit.update();
  }
  xray(on) {for(const m of this.materials){m.transparent=on;m.opacity=on ? .32 : 1;m.depthWrite=!on;m.needsUpdate=true;}}
  dispose(){this.renderer.setAnimationLoop(null);this.resize.disconnect();this.orbit.dispose();
    for(const o of this.paper.children)o.geometry.dispose();this.hinge.geometry.dispose();this.hingeMaterial.dispose();
    for(const m of this.materials)m.dispose();this.wire.dispose();this.renderer.dispose();}
}
