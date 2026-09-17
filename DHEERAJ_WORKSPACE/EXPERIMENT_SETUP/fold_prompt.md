Recover a folding sequence from the supplied crease pattern (CP) and final folded
state. The sequence starts empty. Use one tool call at a time, then inspect its
result before proposing the next fold. Do not return an entire sequence in prose.
The environment writes your accepted actions into seq.json.

You receive only geometry and images of the CP, final target, and current state.
No reference folding sequence is supplied. All folds are simple, all-layers,
180-degree folds. Every layer on the chosen side moves together.

Coordinates are x right, y up. Fold axes are in CURRENT folded coordinates:

| angle_index | fold line | positive side |
| --- | --- | --- |
| 0 | y = offset | y > offset |
| 1 | y = x + offset | y - x > offset |
| 2 | x = offset | x > offset |
| 3 | x + y = offset | x + y > offset |

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

Try to reproduce both the CP and the supplied target, including face orientation
and layer order. The pilot reports strict terminal matching in the supplied
coordinates; it does not equate rotated/mirrored targets or alternative layer
orders. Call finish when you are done. This ends the episode and evaluates your
current sequence; it does not automatically claim success.
