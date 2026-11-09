# Revisits of abandoned states

Abandoned = on a suffix discarded by a backtrack, or a state reported to have no legal fold. Counted over accepted add_folds after the episode's first backtrack.

| condition | episodes | episodes with a revisit | add_folds after first backtrack | revisits of abandoned states | of which dead ends |
| --- | --- | --- | --- | --- | --- |
| claude-sonnet-5-5 | L+A | text-only | 21 | 7 | 243 | 26 (11%) | 5 |
| gpt-5.6-luna | B | images-only | 23 | 4 | 8 | 6 (75%) | 0 |
| gpt-5.6-luna | B | text-only | 20 | 13 | 51 | 30 (59%) | 0 |
| gpt-5.6-luna | B+A | text+images | 23 | 15 | 67 | 42 (63%) | 0 |
| gpt-5.6-luna | L | text-only | 20 | 14 | 103 | 55 (53%) | 20 |
| gpt-5.6-luna | L+A | text+images | 10 | 8 | 80 | 31 (39%) | 2 |
| gpt-5.6-luna | L+A | text-only | 120 | 77 | 931 | 340 (37%) | 65 |
