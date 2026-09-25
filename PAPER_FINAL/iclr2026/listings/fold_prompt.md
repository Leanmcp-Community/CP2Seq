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

For arbitrary line angles, supply angle_degrees instead of angle_index, never
both. With theta counterclockwise from +x, the line is
-sin(theta)*x + cos(theta)*y = offset; offset is signed perpendicular distance.
move_positive selects the greater-than side. The folding motion remains 180 degrees.
selection_mode is all (default), top, or bottom. Top/bottom requires layer_count;
omit layer_count for all. Top must fold over; bottom must fold under.
The engine tracks original-sheet connectivity. A partial fold returns would-tear
if selected paper is attached to stationary paper away from the proposed hinge.
For example, selecting three of four layers may tear a paired flap. This check
runs before target-CP checking and leaves state unchanged on rejection. Inspect
sheet_polygon coordinates and exploded views when choosing a connected run.

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
Initial images include the target's exploded view; feedback images include the
current state's exploded view after edits.

Try to reproduce both the CP and the supplied target, including face orientation
and layer order. Terminal matching accepts any global translation and any rotation
angle, including 30 degrees. It also accepts turning the whole model upside down:
reflect the geometry, reverse the bottom-to-top stack, and flip every face parity.
These operations can be combined. One common rigid transformation must match all
layers; arbitrary layer rearrangements, scaling, or independently moving layers
do not count. CP matching still uses the supplied original-sheet coordinates and
mountain/valley assignments. Call finish when you are done. This ends the episode and evaluates your
current sequence; it does not automatically claim success.
