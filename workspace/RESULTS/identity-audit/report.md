# Identity audit (E_plane vs E_id)

Generated 2026-11-06T19:45:16.231Z; seed 1.

## A. Accepted solutions

Solved episodes replayed: 25 (replay errors: 0).
Pass CP+E_plane on replay: 25.
Pass CP+E_id on replay: 22.
Accepted under E_plane but rejected under strict E_id (no CP symmetry): 3.
Accepted under E_plane but rejected under E_id modulo CP symmetries: **3**.

- codex-20260921T085459155281Z easy-0004 E_id mismatch
- codex-20260925T075530762587Z easy-0003 E_id mismatch
- codex-20260925T075530762587Z easy-0004 E_id mismatch

## B. Random legal rollouts at reference depth

| sample | depth | completed | CP match | CP+E_plane | CP+E_id | counterexamples | s |
| --- | --- | --- | --- | --- | --- | --- | --- |
| easy-0001 | 4 | 195 | 11 | 4 | 4 | 0 | 0.5 |
| easy-0002 | 7 | 197 | 19 | 2 | 2 | 0 | 8.2 |
| easy-0003 | 10 | 126 | 1 | 1 | 0 | 1 | 11.0 |
| easy-0004 | 5 | 59 | 20 | 20 | 20 | 0 | 2.4 |
| easy-0005 | 5 | 186 | 7 | 6 | 6 | 0 | 1.1 |
| easy-0006 | 5 | 90 | 65 | 65 | 65 | 0 | 1.6 |
| easy-0007 | 8 | 34 | 15 | 15 | 8 | 7 | 12.2 |
| easy-0008 | 7 | 114 | 38 | 15 | 15 | 0 | 2.8 |
| easy-0009 | 5 | 200 | 92 | 92 | 92 | 0 | 3.0 |
| easy-0010 | 6 | 90 | 68 | 13 | 13 | 0 | 2.1 |
| mid-0001 | 11 | 9 | 0 | 0 | 0 | 0 | 23.0 |
| mid-0002 | 12 | 16 | 0 | 0 | 0 | 0 | 15.4 |
| mid-0003 | 13 | 0 | 0 | 0 | 0 | 0 | 8.7 |
| mid-0004 | 11 | 133 | 2 | 0 | 0 | 0 | 15.5 |
| mid-0005 | 12 | 5 | 0 | 0 | 0 | 0 | 20.8 |
| mid-0006 | 13 | 33 | 0 | 0 | 0 | 0 | 237.8 |
| mid-0007 | 11 | 3 | 0 | 0 | 0 | 0 | 14.2 |
| mid-0008 | 13 | 7 | 0 | 0 | 0 | 0 | 29.3 |
| mid-0009 | 11 | 9 | 0 | 0 | 0 | 0 | 9.9 |
| mid-0010 | 12 | 3 | 1 | 0 | 0 | 0 | 7.1 |
| hard-0001 | 19 | 7 | 0 | 0 | 0 | 0 | 2757.6 |
| hard-0002 | 19 | 0 | 0 | 0 | 0 | 0 | 135.5 |
| hard-0003 | 19 | 12 | 0 | 0 | 0 | 0 | 2009.1 |
| hard-0004 | 15 | 2 | 1 | 0 | 0 | 0 | 42.9 |
| hard-0005 | 15 | 8 | 0 | 0 | 0 | 0 | 59.1 |
| hard-0006 | 15 | 38 | 0 | 0 | 0 | 0 | 307.5 |
| hard-0007 | 16 | 0 | 0 | 0 | 0 | 0 | 44.3 |
| hard-0008 | 17 | 1 | 0 | 0 | 0 | 0 | 344.3 |
| hard-0009 | 15 | 7 | 0 | 0 | 0 | 0 | 35.5 |
| hard-0010 | 14 | 0 | 0 | 0 | 0 | 0 | 23.0 |
| layers-0001 | 5 | 137 | 137 | 35 | 35 | 0 | 11.0 |
| layers-0002 | 5 | 186 | 39 | 12 | 12 | 0 | 11.6 |
| layers-0003 | 5 | 105 | 105 | 105 | 105 | 0 | 6.3 |
| layers-0004 | 5 | 187 | 63 | 51 | 51 | 0 | 12.0 |
| layers-0005 | 5 | 184 | 184 | 184 | 184 | 0 | 2.8 |
| layers-0006 | 5 | 180 | 5 | 5 | 5 | 0 | 3.3 |
| layers-0007 | 5 | 200 | 200 | 194 | 194 | 0 | 10.4 |
| layers-0008 | 5 | 200 | 200 | 200 | 200 | 0 | 9.5 |
| layers-0009 | 5 | 139 | 139 | 139 | 139 | 0 | 5.9 |
| layers-0010 | 5 | 124 | 124 | 52 | 52 | 0 | 12.9 |
| **total** | | 3226 | 1536 | 1210 | 1202 | 8 | |
