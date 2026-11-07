# Passed-through audit (oracle-stop on existing trajectories)

Each episode's visited accepted states are replayed and checked with CP match + E_id.
"Reached, not submitted" = some visited state matched the target but the episode is not scored solved.
"Oracle-stop solves" = submitted solves + reached-not-submitted: what an automatic stop rule would score on these trajectories.

| model | effort | tools | geometry | episodes | submitted solved | reached, not submitted | oracle-stop solves | solved but no match on replay | from final seq only | errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gpt-5.6-luna | low | base | images-only | 3 | 1 | 0 | 1 | 0 | 0 | 0 |
| gpt-5.6-luna | low | base | json | 39 | 3 | 0 | 3 | 0 | 0 | 0 |
| gpt-5.6-luna | low | base+auto | json | 3 | 1 | 0 | 1 | 0 | 0 | 0 |
| gpt-5.6-luna | low | legal-folds | json | 39 | 7 | 2 | 9 | 2 | 0 | 0 |
| gpt-5.6-luna | low | legal-folds+auto | json | 59 | 15 | 0 | 15 | 1 | 0 | 0 |

## Reached the target but not scored solved

- codex-20260925T075530762587Z easy-0006 (gpt-5.6-luna | low | legal-folds | json): first match at turn 15, depth 5
- codex-20260925T111956187964Z layers-0008 (gpt-5.6-luna | low | legal-folds | json): first match at turn 10, depth 5
