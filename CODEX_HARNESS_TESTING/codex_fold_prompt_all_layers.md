## This run allows whole-stack folds only

Every fold you make moves the entire stack. `selection_mode` and `layer_count` are not part
of the action schema in this run, and `add_fold` refuses a partial top or bottom run.
`list_legal_folds` will not list one either.

This is not a restriction you have to work around. Every reference solution for this corpus
is built from whole-stack folds, so a correct sequence exists inside this action space for
every sample. `over` is free on every fold, since nothing is left behind.
