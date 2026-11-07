# Instance-clustered statistics for the Luna ablations

Identity audit flips applied: 3. Bootstrap: 10000 cluster resamples of instances, seed 1.

## Cells (solved/total, Wilson 95%)

| model | effort | tools | E_plane | E_id | E_id 95% CI |
| --- | --- | --- | --- | --- | --- |
| gpt-5.6-luna | low | A | 10/40 | 10/40 | 0.14-0.40 |
| gpt-5.6-luna | low | B | 2/40 | 2/40 | 0.01-0.17 |
| gpt-5.6-luna | low | L | 6/40 | 6/40 | 0.07-0.29 |
| gpt-6-luna | high | A | 11/40 | 11/40 | 0.16-0.43 |
| gpt-6-luna | high | B | 6/40 | 6/40 | 0.07-0.29 |
| gpt-6-luna | high | L | 10/40 | 10/40 | 0.14-0.40 |
| gpt-6-luna | low | A | 8/40 | 8/40 | 0.10-0.35 |
| gpt-6-luna | low | B | 0/40 | 0/40 | 0.00-0.09 |
| gpt-6-luna | low | L | 2/40 | 2/40 | 0.01-0.17 |

## Reasoning effort, GPT-6 Luna high minus low (paired by instance and tool condition)

| subset | relation | diff in solve rate | cluster-bootstrap 95% CI | sign-flip p | instances (nonzero) |
| --- | --- | --- | --- | --- | --- |
| all 40 | E_plane | +0.142 | +0.067 to +0.217 | 0.0012 | 40 (14) |
| all 40 | E_id | +0.142 | +0.067 to +0.217 | 0.0012 | 40 (14) |
| some-layers | E_plane | +0.400 | +0.233 to +0.533 | 0.0078 | 10 (8) |
| some-layers | E_id | +0.400 | +0.233 to +0.567 | 0.0078 | 10 (8) |
| easy | E_plane | +0.167 | +0.000 to +0.333 | 0.1875 | 10 (6) |
| easy | E_id | +0.167 | +0.000 to +0.333 | 0.1875 | 10 (6) |

## Tool conditions, pooled over the three model settings (paired by instance)

| contrast | relation | diff | cluster-bootstrap 95% CI | sign-flip p |
| --- | --- | --- | --- | --- |
| L - B | E_plane | +0.083 | +0.017 to +0.158 | 0.0510 |
| L - B | E_id | +0.083 | +0.017 to +0.158 | 0.0510 |
| A - L | E_plane | +0.092 | +0.017 to +0.167 | 0.0415 |
| A - L | E_id | +0.092 | +0.017 to +0.167 | 0.0415 |
| A - B | E_plane | +0.175 | +0.083 to +0.275 | 0.0010 |
| A - B | E_id | +0.175 | +0.083 to +0.275 | 0.0010 |
