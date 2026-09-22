#!/bin/sh
# Reverse deterministic search arm. Same corpus, same tools, same replay, same viewer -- the
# search runs the other way round: it starts at the finished model and unfolds it back to the
# flat sheet, then the recovered sequence is replayed forward through the real add_fold.
#
# WHY IT IS A SEPARATE SCRIPT AND NOT A FLAG YOU HAVE TO REMEMBER
# The only difference from run_deterministic.sh is --strategy reverse, and everything else --
# sample selection, budget, corpus, image options -- has to behave identically or the two arms
# are not comparable. So this delegates rather than duplicating: run_deterministic.sh stays the
# one place that knows how to start a deterministic run, and passes unknown flags straight to
# deterministic_fold_loop.py.
#
# HOW IT DIFFERS FROM THE FORWARD ARM, IN PRACTICE
#   * Every state it visits is inside the target CP by construction, because unfolding only
#     removes creases. It never spends budget on OUTSIDE_TARGET_CP.
#   * A fold makes at least one crease, so it splits at least one face, so unfolding strictly
#     reduces the layer count. Depth is bounded by the target's own stack, which is why an
#     `exhausted` verdict here is a proof rather than a budget running out.
#   * It is NOT uniformly cheaper. Folding is many-to-one on stacking order: a face that moves
#     without being creased leaves no record of where it sat, so every interleaving of it with
#     the stationary layers is a distinct legal predecessor. Measured on easy-0003 step 10 --
#     48 layers, 24 faces moved wholly -- that is 6.3e10 predecessors for ONE line and run,
#     against a forward branching factor of 3.51. Reverse wins on shallow, few-layer samples
#     and loses badly once many faces move uncreased.
#
# So keep the budget small and read `search_status` in result.json rather than assuming a
# timeout means "nearly had it".
#
#   bash CODEX_HARNESS_TESTING/run_reverse_deterministic.sh --easy
#   SECONDS_PER_SAMPLE=30 bash CODEX_HARNESS_TESTING/run_reverse_deterministic.sh --samples easy-0001
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec sh "$script_dir/run_deterministic.sh" "$@" --strategy reverse
