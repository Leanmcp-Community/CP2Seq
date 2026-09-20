Additional action: compare_to_target

This condition gives you one more action. It is read-only: it never changes the
sequence, the state, or the revision, and it costs a turn like any other action.

compare_to_target tells you how your current stack differs from the target
folded state. It reads the target you were already given; it never consults a
reference fold sequence, and no such sequence exists in your inputs.

How much detail it returns is fixed by this run's configuration, not by you, and
the result names its own level in `tier` and `tier_meaning`:
- tier 1 reports layer counts only: how many layers you have against how many
  the target has.
- tier 2 adds which layers disagree and in what way: `diagnosis` is one of
  `matches`, `layer_count`, `parity`, `order`, or `shape`, and
  `mismatched_ranks` lists the bottom-to-top ranks that differ.
- tier 3 adds `corrections`, naming for each differing rank what it should be.

Read `alignment` before `mismatched_ranks`. The comparison is made under one
rigid motion of the whole model, and `compared_under` says whether that motion
included turning the model over. A turned-over comparison is legitimate: the
target accepts it.

What the diagnoses mean:
- `layer_count`: you have more or fewer layers than the target, so folding is
  incomplete or overdone. Ranks are compared only as deep as the shorter stack.
- `parity`: every layer is the right shape in the right place and some face the
  wrong way. That is an over/under or moving-side choice, not a wrong crease.
  Reversing the direction of the fold that placed those layers is the repair.
- `order`: your stack holds exactly the target's pieces in the wrong order. The
  folds are right; the order that stacked them is not. Reorder by backtracking
  and folding the same lines in a different sequence, not by folding new lines.
- `shape`: at least one layer is not a shape the target has at that rank, so an
  earlier fold took a different line or a different side.

How to use it well:
- A perfect crease pattern is not a solved episode. Most failures reproduce the
  CP exactly and still lose on layer order, which is the thing this action
  measures and nothing else reports until the episode is over.
- Check before calling finish, not after. finish ends the episode.
- The comparison only changes when the paper moves. Calling it twice without
  folding or backtracking in between returns the same answer and costs a turn.
