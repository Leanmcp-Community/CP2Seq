Additional action: list_legal_folds

This condition gives you one extra action. It is read-only: it never changes the
sequence, the state, or the revision, and it costs a turn like any other action.

list_legal_folds enumerates every fold that is legal from the current state and
compatible with the supplied CP. It is computed by the same verifier add_fold
uses, so while state_id is unchanged, any listed action is accepted verbatim by
add_fold. A fold that is absent from the list would be rejected by add_fold now;
it may become available after other folds change the stack.

Arguments, all optional:
- max_results, a positive integer, default 40. The list is truncated, not
  filtered, when there are more; `truncated` and `distinct_legal_folds` say so.
- selection_filter, one of any (default), all, top, bottom. Restricts the
  enumeration to that selection_mode.
- include_rejected, boolean, default false. When true, rejected_summary carries
  an example rejection message per error code as well as the count.

The result arrives under `enumeration`:
- legal_folds: each entry has `action`, the exact arguments to pass to add_fold;
  `creates`, the crease segments the fold would make, in original sheet
  coordinates with their M/V assignment; `new_crease_length`, how much of that
  crease the sequence has not already laid down; and `layers_after`, the
  resulting stack size.
- Entries are deduplicated by result. Several argument combinations can reach
  the same paper in the same stacking order, differing only by where the model
  ends up sitting in the plane or by being turned over; those are one entry.
  `equivalent_actions` lists up to four of the merged alternatives and
  `equivalent_action_count` gives the total. Any of them may be passed to
  add_fold; they differ in placement, not in what they fold.
- Entries are ordered by new_crease_length descending, then by fewest resulting
  layers. That ordering is a heuristic about progress, not a recommendation: a
  fold that lays a lot of new crease can still be the wrong fold for the target.
- candidate_lines, actions_evaluated, distinct_legal_folds, returned, truncated
  describe the enumeration itself.
- rejected_summary counts the candidates that failed, by error code. A large
  OUTSIDE_TARGET_CP count is normal; it is most of the search space.

How to use it well:
- Legal is not correct. Every listed fold is reproducible on paper and stays
  inside the CP, but only some of them lie on a path to the target's layer
  order and face orientation. Choose using the target geometry and images, not
  by taking the first entry.
- Two entries that create the same creases can still differ in over/under and
  in move_positive, and those choices decide the final stack. Read `action` in
  full before copying it.
- An empty list means no legal on-target fold exists here. The prefix is a dead
  end: use restore_revision, go_to_step, or remove_fold to back out.
- Do not call list_legal_folds twice at the same state_id. The answer cannot
  have changed, and it costs a turn out of your budget.
