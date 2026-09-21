// Fixtures only. All geometry transitions and scoring use experiment modules.
import {planarize} from '../../workspace/corpus/planarize.mjs';
import {replay} from '../EXPERIMENT_SETUP/engine.mjs';

const square = [[0,0],[1,0],[1,1],[0,1]];
const boundary = square.map((P,i) => ({P,Q:square[(i+1)%4],assignment:'B'}));
const cpFor = segments => planarize([...boundary, ...segments]).fold;
const vertical = (x, assignment) => ({P:[x,0],Q:[x,1],assignment});
const half = {angle_index:2,offset:.5,move_positive:true,over:true};
const prefix = [half,{...half,offset:.25}];
const pair = {...half,offset:.125,move_positive:false,selection_mode:'top',layer_count:2};
const cpCross = cpFor([vertical(.5,'V'),
  {P:[0,.5],Q:[.5,.5],assignment:'V'}, {P:[.5,.5],Q:[1,.5],assignment:'M'}]);
const horizontal = {angle_index:0,offset:.5,move_positive:true,over:true};
const cpFour = cpFor([[.25,'V'],[.375,'M'],[.5,'V'],[.625,'V'],[.75,'M']].map(([x,a]) => vertical(x,a)));
const theta = 35*Math.PI/180;
const cpOblique = cpFor([{P:[0,.1],Q:[1,Math.tan(theta)+.1],assignment:'V'}]);
const oblique = {angle_degrees:35,offset:.1*Math.cos(theta),move_positive:true,over:true};
const accepted = {error:null,cp_match:true,terminal_reference_match:true,pilot_match:true};
const rejected = error => ({error,cp_match:false,terminal_reference_match:false,pilot_match:false});

export const CASES = [
  {id:'tear-three',name:'Three of four leaves · tearing', group:'Connectivity', cp:cpFour,
    description:'First make a four-leaf stack. Then select its top three leaves and try a 35° crease. One selected leaf is connected to the stationary fourth away from that hinge.',
    reference:[...prefix,pair], candidate:[...prefix,{angle_degrees:35,offset:.3,move_positive:true,over:true,selection_mode:'top',layer_count:3}],
    expected:rejected('would-tear')},
  {id:'legal-pair',name:'Connected top pair · legal fold',group:'Connectivity', cp:cpFour,
    description:'The same four-leaf stack, but the top two connected leaves move together about a vertical hinge. Compare this with the tearing case.',
    reference:[...prefix,pair], candidate:[...prefix,pair],expected:accepted},
  {id:'tear-single',name:'One attached leaf · tearing',group:'Connectivity',cp:cpFour,
    description:'Select only the top leaf of the four-leaf stack. The proposed half-fold would pull it away from its attached neighbour.',
    reference:[...prefix,pair],candidate:[...prefix,{...pair,layer_count:1}],expected:rejected('would-tear')},
  {id:'direction',name:'Top pair folded under · rejected',group:'Legality',cp:cpFour,
    description:'A selected top run is asked to fold underneath the remaining stack. The standard verifier rejects the direction.',
    reference:[...prefix,pair],candidate:[...prefix,{...pair,over:false}],expected:rejected('direction-impossible')},
  {id:'off-target',name:'Legal movement, wrong crease',group:'Legality',cp:cpFour,
    description:'Connectivity is valid, but the crease at x=0.1 is absent from the target CP. This distinguishes target mismatch from tearing.',
    reference:[...prefix,pair],candidate:[...prefix,{...pair,offset:.1}],expected:rejected('OUTSIDE_TARGET_CP')},
  {id:'two-sequences',name:'Different sequences, equivalent result',group:'Scoring',cp:cpCross,
    description:'Two two-fold sequences: A folds right-to-left, then top-down over. B folds left-to-right, then bottom-up under. Both reproduce the same M/V crease pattern and an equivalent four-layer stack in different positions.',
    reference:[half,horizontal],candidate:[{...half,move_positive:false},{...horizontal,move_positive:false,over:false}],expected:accepted},
  {id:'turnover',name:'30° rotation, translation, upside down',group:'Scoring',cp:cpOblique,
    description:'The reference target is turned upside down, rotated 30°, and translated. Its layer order and every parity are transformed together.',
    reference:[oblique],candidate:[oblique],transform:'turnover',expected:accepted},
  {id:'wrong-stack',name:'Same silhouette, wrong stack',group:'Scoring',cp:cpOblique,
    description:'Only the target layer order is reversed. Its outline is unchanged, but this is not a physical turnover and must fail terminal matching.',
    reference:[oblique],candidate:[oblique],transform:'wrong-stack',expected:{...accepted,terminal_reference_match:false,pilot_match:false}},
  {id:'oblique',name:'35° crease · legal full-sheet fold',group:'Legality',cp:cpOblique,
    description:'An oblique crease alone is not illegal. This full-sheet fold preserves connectivity and matches the specified CP and target.',
    reference:[oblique],candidate:[oblique],expected:accepted},
];

export function targetFor(example) {
  const target = structuredClone(replay(example.cp, example.reference.map(a => ({tool:'apply_fold',...a}))).sequence().file_frames.at(-1));
  if (example.transform === 'wrong-stack' || example.transform === 'turnover') {
    const count = target.faces_vertices.length;
    target['fo:faces_layer'] = target['fo:faces_layer'].map(rank => count - 1 - rank);
  }
  if (example.transform === 'turnover') {
    const c = Math.cos(Math.PI/6), s = Math.sin(Math.PI/6);
    target.vertices_coords = target.vertices_coords.map(([x,y]) => [c*x+s*y+2.5,s*x-c*y-1.25]);
    target['fo:faces_parity'] = target['fo:faces_parity'].map(p => 1-p);
  }
  return target;
}
