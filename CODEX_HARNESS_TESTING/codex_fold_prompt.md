Recover a folding sequence from the supplied crease pattern (CP) and final folded
state. The sequence starts empty. Use one tool call at a time, then inspect its
result before proposing the next fold. Do not return an entire sequence in prose.
The environment writes your accepted actions into seq.json.

You receive only geometry and images of the CP, final target, and current state.
No reference folding sequence is supplied. All folds are flat 180-degree simple
folds. Select all layers (default), or a contiguous run from the top or bottom.

Coordinates are x right, y up. Fold axes are in CURRENT folded coordinates:

| angle_index | fold line | positive side |
| --- | --- | --- |
| 0 | y = offset | y > offset |
| 1 | y = x + offset | y - x > offset |
| 2 | x = offset | x > offset |
| 3 | x + y = offset | x + y > offset |

For an arbitrary line, supply angle_degrees instead of angle_index (never both).
The angle is counterclockwise from +x: at 35 degrees the line satisfies
-sin(35°)*x + cos(35°)*y = offset. In this form offset is signed perpendicular
distance, and move_positive selects the greater-than side. This is the crease
line's angle; the folding motion still ends at 180 degrees.

selection_mode is all, top, or bottom. For top/bottom, supply layer_count counting
from that end of the current bottom-to-top face stack; omit layer_count for all.
Top folds must use over=true; bottom folds must use over=false. Arbitrary internal
subsets are unavailable. The engine tracks original-sheet connections: selecting
three of four layers can tear a paired flap if its attached partner stays still
and their shared connection is away from the fold line. Such a move is rejected
as would-tear before checking target-CP compatibility. Use sheet_polygon geometry
and exploded views to reason about connectivity, not just overlapping outlines.

move_positive selects which half-plane moves. over=true puts the reflected moving
stack above the stationary stack; false puts it below. A flipped stack reverses
its internal order. Offset is not a normalized distance for diagonal axes.
The tool rejects extra creases or incompatible mountain/valley assignments and
leaves the state unchanged on error. This is a zero-thickness geometric engine;
it does not check continuous collisions during motion.

add_fold appends ONE fold. remove_fold removes a 1-based fold and replays the
remaining actions; an invalid replay leaves the sequence unchanged. go_to_step
keeps the first N folds (0 empties the sequence). restore_revision restores a
previous tool state, even after changing branches; revision 0 is the empty sheet.
These editing operations create new revision IDs. get_state returns your current
sequence and geometry. get_images returns PNG views of any completed step in the
current branch without changing it. Use the returned revision IDs when backtracking.

Images: CP red = mountain, blue = valley, dark boundary = paper edge. Top and
two oblique views show paper shape with a small illustrative layer separation.
Oblique views look down from opposite directions, never exactly edge-on. X-ray
is a top projection: more overlapping layers produce darker pixels. Each view
is fitted independently; use geometry for coordinates and scale, not pixel size.
Exploded views separate layers upward for inspection: layer 1 is the bottom,
and p0/p1 labels give face parity. Separation is illustrative, not paper thickness.
The first turn includes the initial sheet and the target's exploded view. The
target views stay attached; after each successful edit, the next turn includes
an exploded view of the updated state alongside the other feedback views.

Try to reproduce both the CP and the supplied target, including face orientation
and layer order. Terminal matching accepts any global translation and any rotation
angle, including 30 degrees. It also accepts turning the whole model upside down:
reflect the geometry, reverse the bottom-to-top stack, and flip every face parity.
These operations can be combined. One common rigid transformation must match all
layers; arbitrary layer rearrangements, scaling, or independently moving layers
do not count. CP matching still uses the supplied original-sheet coordinates and
mountain/valley assignments. Call finish when you are done. This ends the episode and evaluates your
current sequence; it does not automatically claim success.

Planning and recovery:
Before proposing a fold, check its consistency with the current state:

1. Treat the supplied CP as geometry in the original sheet coordinates.
   Fold axes are specified in CURRENT folded coordinates. Account for earlier
   reflections when relating a current fold line to the CP.
2. A fold affects the selected run on the chosen side. Check the crease
   implications for all affected layers, including their orientations and
   mountain/valley assignments.
3. Choose move_positive and over using both crease compatibility and the final
   target. A locally accepted fold does not establish that the sequence can
   reach the target.

Use rejection feedback to change your plan:
- A rejected action leaves the state unchanged.
- Do not repeat an identical rejected action at the same revision.
- OUTSIDE_TARGET_CP means the proposed action introduces an incompatible
  crease segment or mountain/valley assignment. The rejection names the offence:
  `off_target_creases` lists each proposed crease the CP does not contain, in
  original sheet coordinates, with `problem` one of `assignment_conflict` (the
  line is right, the M/V is wrong: flip over or move the other side),
  `mixed_assignment` (the CP has M on part of this crease and V on another part,
  so no choice of over or moving side fixes it: fold fewer layers or a different
  line), `absent` (no CP crease lies on this line at all), or `partly_missing`
  (the CP crease covers only part of this fold, so it would crease unfolded paper).
  `uncovered` gives the exact sub-spans and `cp_creases_on_this_line` gives what
  the CP does have there. `proposed_creases` lists every crease the fold makes.
- would-tear means moving and stationary faces share a connection away from the
  hinge. Change the selected run or crease; the paper state remains unchanged.
  `diagnostic` names the two layer ranks and the join itself:
  `join_current_coords` and `join_sheet_coords` are its endpoints, and
  `join_distance_from_fold_line` its signed distance from the proposed hinge.
- direction-impossible means top must fold over or bottom must fold under;
  `diagnostic.required_over` gives the only legal value for this selection.
- nothing-to-move / no-crease mean the chosen line and side do not move selected
  paper or do not create a crease. `diagnostic.offsets_that_cut_the_selection`
  gives the offset interval, in your own offset units along the same normal,
  that would cross the selected layers. invalid-selection means too many layers;
  it reports `stack_size`.
- After three consecutive rejected add_fold actions without progress, reconsider
  the accepted prefix. Use restore_revision, go_to_step, or remove_fold to explore
  a different branch. If the sequence is empty, reconsider the first fold instead.
- Track rejected actions by revision. Returning to the same revision does not
  make a previously rejected action valid. Restoring an identical sequence under
  a new revision also does not make its rejected actions valid.

Before calling finish, compare the current geometry, face orientations, and
bottom-to-top layer order with the target. Reproducing the CP alone is
insufficient. First account for a common rotation/translation or physical turnover;
if the target still differs, reconsider fold
order, moving side, and over/under choices.

Return exactly one action in the existing JSON schema.

Codex CLI response protocol:
Geometry and numeric history are displayed to 10 decimal places to suppress
floating-point arithmetic noise. Treat last-digit coordinate differences as
numeric noise, not extra creases. Terminal polygon matching uses a 2e-6
coordinate tolerance. Infer fold offsets from the crease geometry; do not
perturb an offset merely to imitate long decimal artifacts.
Return exactly one JSON object matching the supplied output schema. For example:
{"action":{"name":"add_fold","arguments":{"angle_index":0,"angle_degrees":null,"selection_mode":"all","layer_count":null,"offset":0.5,"move_positive":true,"over":true}}}
For a proposed top-three 35-degree fold (legality depends on the current sheet):
{"action":{"name":"add_fold","arguments":{"angle_index":null,"angle_degrees":35,"selection_mode":"top","layer_count":3,"offset":0.1,"move_positive":true,"over":true}}}
To finish: {"action":{"name":"finish","arguments":{}}}.
For get_images, use step=null for the latest step, or an integer for a specific
step. The controller executes the action after your response and sends its
result in the next invocation. These actions are JSON decisions, not installed
Codex tools. Never execute shell commands, run scripts, inspect repository files,
use MCP tools, search the web, or look for reference actions. Use only the
supplied geometry, action history, simulator feedback, and attached images.
Each invocation is fresh; the controller supplies the previous action history.
Image names are listed in attachment order. Initial views remain attached;
current-* views show the most recent requested or automatically rendered state.
When all image history is enabled, turn-NNN-* views contain each earlier turn's
visual feedback; use the turn number to pair them with the textual history.
