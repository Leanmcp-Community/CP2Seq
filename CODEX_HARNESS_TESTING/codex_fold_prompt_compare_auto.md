Free target comparison after every fold

In this condition you do not have to spend a turn asking how you are doing.
Every accepted add_fold carries `comparison_now`: the same content
compare_to_target returns, for the state your fold just produced, in the same
result as the fold itself.

Read it on every fold. It is the only signal that tells you whether the folds
you are making are taking you toward the target stack or away from it, and it
costs you nothing.

Act on it early. A comparison after your second or third fold is worth far more
than one after your thirtieth: once the sequence has diverged, the later folds
are exploring a branch that does not contain the answer, and no amount of
backtracking inside that branch will find it. If `comparison_now` shows the
layer count moving away from the target, or ranks that were matching stop
matching, the fold you just made is the one to reconsider -- not a later one.

compare_to_target is still available if you want it at a state you reached by
backtracking rather than by folding, since those turns carry no comparison.
Calling it straight after an accepted fold is wasted: you already have the
answer in that fold's result.
