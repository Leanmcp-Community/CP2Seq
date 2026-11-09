# Backtracking analysis

Generated 2026-11-09T22:33:43.261Z. Groups: easy, layers. Local-repair search: prefixes from-1..from-3, depth limit reference+2-prefix, node cap 4000, success = CP match + E_id.

## By condition

| condition | episodes | with backtrack | backtracks | to step 0 | mean jump | after dead end | local repair existed (of decidable) | to step 0 although local repair existed | rebuilt discarded folds (jump>=2) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| claude-sonnet-5-5 | low | L+A | text-only | 21 | 15 | 82 | 16/82 (20%) | 2.9 | 5/82 (6%) | 44/82 (54%) | 8/44 (18%) | 2/58 (3%) |
| gpt-5.6-luna | low | B | images-only | 23 | 4 | 6 | 4/6 (67%) | 1.0 | 0/6 (0%) | 6/6 (100%) | 4/6 (67%) | 0/0 |
| gpt-5.6-luna | low | B | text-only | 20 | 13 | 24 | 11/24 (46%) | 1.4 | 0/24 (0%) | 23/24 (96%) | 11/23 (48%) | 4/6 (67%) |
| gpt-5.6-luna | low | B+A | text+images | 23 | 16 | 35 | 15/35 (43%) | 1.5 | 0/35 (0%) | 34/35 (97%) | 15/34 (44%) | 11/14 (79%) |
| gpt-5.6-luna | low | L | text-only | 20 | 16 | 39 | 7/39 (18%) | 2.7 | 8/39 (21%) | 24/39 (62%) | 4/24 (17%) | 12/32 (38%) |
| gpt-5.6-luna | low | L+A | text+images | 10 | 8 | 39 | 6/39 (15%) | 2.2 | 1/39 (3%) | 19/39 (49%) | 5/19 (26%) | 6/24 (25%) |
| gpt-5.6-luna | low | L+A | text-only | 120 | 94 | 384 | 104/384 (27%) | 2.6 | 27/384 (7%) | 232/384 (60%) | 71/232 (31%) | 70/293 (24%) |

## Near-target restarts (feedback conditions)

Backtracks to step 0 taken when the last comparison had the right layer count or at least half the compared layers matching.

| run | sample | turn | from | layers now/target | matching/compared | diagnosis | dead end | local repair at |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| claude-20261107T175727765597Z | easy-0002 | 64 | 7 | 24/24 | 6/24 | order | false | none |
| claude-20261107T183345423404Z | easy-0005 | 15 | 4 | 12/12 | 0/12 | shape | false | 2 |
| claude-20261107T183345423404Z | easy-0005 | 29 | 6 | 12/12 | 0/12 | shape | false | 3 |
| claude-20261107T183345423404Z | easy-0005 | 40 | 6 | 12/12 | 8/12 | order | false | none |
| claude-20261107T232254743781Z | layers-0003 | 10 | 4 | 8/9 | 6/8 | layer_count | true | none |
| claude-20261108T175644588326Z | layers-0007 | 20 | 5 | 12/12 | 3/12 | order | false | 2 |
| codex-20260921T085459155281Z | easy-0005 | 18 | 5 | 12/12 | 0/12 | shape | false | none |
| codex-20260921T085459155281Z | easy-0005 | 28 | 5 | 12/12 | 0/12 | shape | false | 2 |
| codex-20260921T085459155281Z | easy-0006 | 28 | 2 | 23/23 | 21/23 | order | false | 0 |
| codex-20260925T075532843255Z | easy-0002 | 13 | 6 | 24/24 | 7/24 | order | false | none |
| codex-20260925T122742800548Z | layers-0003 | 10 | 4 | 8/9 | 6/8 | layer_count | false | none |
| codex-20260925T122742800548Z | layers-0003 | 22 | 4 | 8/9 | 6/8 | layer_count | false | 1 |
| codex-20261106T235355009576Z | easy-0001 | 24 | 4 | 9/9 | 0/9 | shape | false | 1 |
| codex-20261106T235355009576Z | easy-0003 | 10 | 1 | 2/48 | 1/2 | layer_count | false | 0 |
| codex-20261106T235355009576Z | easy-0003 | 18 | 1 | 2/48 | 1/2 | layer_count | false | 0 |
| codex-20261106T235355009576Z | easy-0003 | 21 | 1 | 2/48 | 1/2 | layer_count | false | 0 |
| codex-20261107T175431422982Z | easy-0001 | 9 | 4 | 9/9 | 0/9 | shape | false | 1 |
| codex-20261107T175431422982Z | easy-0001 | 49 | 1 | 2/9 | 1/2 | layer_count | false | 0 |
| codex-20261107T175431422982Z | easy-0002 | 13 | 6 | 24/24 | 7/24 | order | false | none |
| codex-20261107T175431422982Z | easy-0005 | 14 | 5 | 12/12 | 0/12 | shape | false | 2 |
| codex-20261107T175431422982Z | easy-0005 | 37 | 5 | 12/12 | 0/12 | shape | false | 2 |
| codex-20261107T175431422982Z | easy-0005 | 53 | 6 | 12/12 | 0/12 | shape | false | 3 |
| codex-20261107T183433007248Z | layers-0003 | 15 | 4 | 8/9 | 6/8 | layer_count | false | none |
| codex-20261107T192735624427Z | easy-0002 | 12 | 6 | 24/24 | 7/24 | order | false | none |
| codex-20261107T224002250939Z | layers-0003 | 10 | 4 | 8/9 | 6/8 | layer_count | false | none |
| codex-20261107T224002250939Z | layers-0003 | 19 | 4 | 8/9 | 6/8 | layer_count | false | none |
| codex-20261107T230335798303Z | easy-0001 | 9 | 4 | 9/9 | 0/9 | shape | false | 1 |
| codex-20261107T230335798303Z | easy-0005 | 14 | 5 | 12/12 | 0/12 | shape | false | 2 |
| codex-20261107T234643119568Z | layers-0003 | 10 | 4 | 8/9 | 6/8 | layer_count | false | none |
| codex-20261107T234643119568Z | layers-0003 | 19 | 4 | 8/9 | 6/8 | layer_count | false | 1 |
| codex-20261108T001708228873Z | easy-0001 | 18 | 4 | 9/9 | 0/9 | shape | false | 1 |
| codex-20261108T001708228873Z | easy-0001 | 32 | 4 | 9/9 | 0/9 | shape | false | 1 |
| codex-20261108T001708228873Z | easy-0002 | 24 | 4 | 24/24 | 7/24 | order | false | none |
| codex-20261108T041710532854Z | layers-0001 | 30 | 5 | 11/11 | 9/11 | order | false | none |
| codex-20261108T041710532854Z | layers-0003 | 10 | 4 | 8/9 | 6/8 | layer_count | false | none |
| codex-20261108T044203106784Z | easy-0001 | 11 | 4 | 9/9 | 0/9 | shape | false | 1 |
| codex-20261108T044203106784Z | easy-0002 | 12 | 6 | 24/24 | 7/24 | order | false | none |
| codex-20261108T070055011072Z | layers-0003 | 26 | 4 | 8/9 | 6/8 | layer_count | false | 1 |
