# DFS / BFS / IDDFS baseline for CP → folding sequence

The uninformed-search baseline the query-efficiency claim gets measured against. Closes the
`implement DFS, BFS baseline details` action item in `BASELINE_REPRODUCTION.md` §5.

```bash
node DHEERAJ_WORKSPACE/baseline/run.mjs                        # mixed dev set, 400k queries
node DHEERAJ_WORKSPACE/baseline/run.mjs --set=synthetic        # one group
node DHEERAJ_WORKSPACE/baseline/run.mjs --budget=2000000 --depth=24
node DHEERAJ_WORKSPACE/baseline/verify.mjs 009_ku_Unassigned_Triangle_Pleat.fold dfs
```

Corpus (41 MB, gitignored) — re-fetch with:

```bash
mkdir -p DHEERAJ_WORKSPACE/data && cd DHEERAJ_WORKSPACE/data
curl -sL https://github.com/origamimagiro/flat-folder/archive/refs/heads/main.tar.gz -o ff.tar.gz
tar -xzf ff.tar.gz --strip-components=2 flat-folder-main/examples && rm ff.tar.gz
```

---

## What the problem is, stated precisely

**Given a CP, find an ordered list of all-layers simple folds that turns the flat square into
exactly that CP.** The search runs **forward from the square**, using the CP as the goal test.
It does not run backward from a folded state — see below for why it cannot.

A state is a stack of layers, each carrying its polygon in the current plane, the isometry back
to original-square coordinates, and an orientation parity. One fold splits every layer along a
line, reflects the moving half, and flips its parity; the chord it cuts in each layer, pulled
back to square coordinates, is a crease. **One fold makes many creases at once** — that non-local
coupling is what makes the problem hard.

The branching factor is kept finite by a necessary condition: every crease a fold creates must
already be in the target CP, in the right place, with a consistent M/V. So candidate lines are
drawn from the images of the CP's own crease lines, not from the continuum.

## ⚠️ Two corrections to the framing this task started from

**1. "From the CP to the final `.fold` state" — there is no final `.fold` state.** All 366
instagram files carry exactly `vertices_coords` / `edges_vertices` / `edges_assignment` /
`faces_vertices`. `faceOrders`, `edges_foldAngle` and `file_frames` are absent in **0/366**.
These are crease patterns only (`DATASET.md` already calls this bucket C).

**2. Even if you computed one, "the" final state is not well defined.** Flat-Folder's own
`instagram_data.csv` counts valid terminal states per CP:

| | |
| --- | --- |
| unique terminal state | 56 / 366 |
| **many** terminal states | **310 / 366** |
| median | **256** |
| Kamiya *Ryujin 2.1* | **1.45 × 10⁸⁶** |

So the search cannot target a folded state. It targets **the CP**, which is unique. That is why
this is a forward search with a crease-coverage goal test, and it is the right formulation
regardless.

## What "instagram" is

Not scraped from Instagram. It is **Jason S. Ku**'s (MIT, `origamimagiro`) curated example set
inside Flat-Folder — the CPs featured on the [@flat_folder](https://www.instagram.com/flat_folder/)
account, contributed with their designers' authorization (Kamiya, Imai, Komatsu, Lang, Ku,
Tanaka, `traditional_*`). MIT licensed. "instagram" names the venue, not the collection method.

---

## The three searches

All three share one instrumented `expand()`, the same move ordering (most-creases-covered
first), and the same geometry — `buildTarget` / `applyFold` / `candidates` / `boundaryLoop` are
**imported** from `workspace/probe-c/stage2.mjs`, not rewritten. That file already had three
geometry bugs found and fixed the hard way; reimplementing them was the surest route to
confident wrong numbers.

| | guarantee | memory | fails when |
| --- | --- | --- | --- |
| **DFS** | none — first solution wins | O(depth) | returns needlessly long sequences |
| **BFS** | shortest | O(frontier) — holds every layer-stack at a level | frontier explodes |
| **IDDFS** | shortest | O(depth) | re-expansion cost buries deep solutions |

**The one structural change vs `stage2.mjs`:** stage2 tracks crease coverage by mutating a
`covered` flag on target segments. That is fine for a single DFS path but impossible for BFS,
where thousands of partial sequences are alive at once, each with its own coverage. Here
coverage is a per-node set of segment indices, and the dedup key is **state + coverage** rather
than state alone — two paths can reach the same geometry having creased different parts of the
CP, and pruning one would be unsound for a search whose `EXHAUSTED` means *proven unfoldable*.

## Two gates run before any number is printed

1. **Round trip.** Generate CPs *by folding a square forward*, hand them back to each search.
   Solvable by construction, so anything but `SOLVED` is a solver bug. Currently 36/36.
2. **Agreement with `stage2.mjs`.** The new IDDFS must match stage2's own `solve()` — same
   verdict, same sequence length — on the two CPs probe C proved solvable. Query counts may
   differ, because the dedup key changed; that is an algorithmic difference, not a discrepancy.

`run.mjs` exits non-zero without reporting if either gate fails. Probe C's first run reported
155 "proven unfoldable" verdicts that were **all wrong**, and the numbers looked entirely
plausible — that is the failure mode these gates exist to catch.

---

## Results — mixed dev set, 400,000 queries/instance, depth 16

Both gates passed. One query = one simulated fold, the unit probe C budgeted in.

### Synthetic (n=10, solvable by construction, true length known)

| algo | solved | median queries | median peak | shortest found |
| --- | --- | --- | --- | --- |
| DFS | 10/10 | **162** | **4** | 9/10 |
| BFS | 10/10 | 390 | 26 | 10/10 |
| IDDFS | 10/10 | 736 | **4** | 10/10 |

The textbook trade-off, reproduced cleanly: DFS is ~4.5× cheaper than IDDFS in queries and pays
for it in optimality; BFS buys the shortest sequence with frontier memory; IDDFS buys the same
guarantee with re-expansion instead.

### Real anchors (n=2, known solvable)

| instance | algo | queries | peak | steps | vs shortest |
| --- | --- | --- | --- | --- | --- |
| `012_ku_4x4_Grid_Unassigned` | DFS | **100** | 6 | 6 | **+2** |
| | BFS | 3,228 | 216 | 4 | 0 |
| | IDDFS | 5,940 | 6 | 4 | 0 |
| `301_boxhard_Assigned_Crossover` | DFS | **592** | 8 | 8 | 0 |
| | BFS | 42,304 | **1,000** | 8 | 0 |
| | IDDFS | 256,480 | 8 | 8 | 0 |

IDDFS reproduces probe C's recorded 5,940 / 256,480 exactly. On `012`, DFS finds *a* sequence
**59× cheaper** than IDDFS finds *the shortest* one — and it is 6 folds where 4 suffice.

### Real instagram CPs (n=10, smallest still in play after stage 1)

| algo | solved | exhausted | timeout |
| --- | --- | --- | --- |
| DFS | **1** | 8 | 1 |
| BFS | 0 | 8 | 2 |
| IDDFS | 0 | 8 | 2 |

As expected from probe C: 8 of 10 close out as *proven not simple-foldable* in under 25k
queries. **This group measures the action space, not the search.** It is reported because it is
the honest result, but two searches failing identically cannot rank them.

---

## The finding worth keeping

**`009_ku_Unassigned_Triangle_Pleat` is simple-foldable in 9 folds, and 9 is optimal.** Probe C
recorded it as `TIMEOUT` at a 2,000,000-query budget — status unknown. Plain DFS solves it in
**9,928 queries**.

Raising IDDFS to an 8,000,000-query budget confirms both halves: `SOLVED`, 9 steps, at
**2,697,660 queries**. IDDFS returns the shortest sequence, so **9 is optimal** — and probe C's
2,000,000 budget missed the answer by roughly 700,000 queries. Nothing was wrong with that run;
the budget was just under the cliff.

| | queries to solve `009` | |
| --- | --- | --- |
| **DFS** | **9,928** | — |
| IDDFS | 2,697,660 | **272× more** |
| probe C's budget | 2,000,000 | not enough |

Verified independently by replay (`verify.mjs`): every fold legal from the flat square, and the
9 creases produced cover the CP exactly. Since `applyFold` rejects any fold creating a crease
the CP lacks, a legal replay that also covers everything means the crease sets are *equal*, not
merely overlapping. The sequence is also physically coherent — nine folds sharing the normal
`(1,0)` at decreasing offsets, layers climbing 2→10. That is an accordion pleat, on a CP named
`Triangle_Pleat`.

**Why DFS won and IDDFS lost:** the solution is 9 folds deep. IDDFS must exhaust depths 1–8
before it can reach depth 9, and at this branching factor that re-expansion costs ~2.7M queries.
DFS dives straight there for 9,928. This is the classic IDDFS failure mode, and it matters here
specifically: **PurelandFold's real sequences are 5–21 steps**, which is exactly the depth range
where the re-expansion overhead becomes fatal.

Consequences for the recorded numbers:

- probe C's confirmed-foldable count goes **2 → 3**; the TIMEOUT bucket goes **37 → 36**.
- It is direct evidence for what `notes/probes/probe-c-screen.md` already suspected: *"37 个
  TIMEOUT 里很可能有可折的"*. One of them demonstrably is.
- The 89.3% proven-not-foldable lower bound is **unaffected** — it comes from the EXHAUSTED and
  screened sets, not from the timeouts.

⚠️ **Caveat, state it when citing:** `009`'s creases are all `U`, so M/V is a wildcard and the
consistency check never bites. Two of the three confirmed-foldable CPs (`009`, `012`) are
unassigned for this reason. Only `301_boxhard_Assigned_Crossover` is fully assigned.

---

## What this says for the method

The pitch is that an LLM earns its keep through **pruning** and **backtracking**
(`notes/tools/flat-folder-capabilities.md`). This baseline sharpens the target:

- **The baseline to beat is plain DFS, not IDDFS.** DFS is cheaper on every instance here and
  is the only one of the three that reaches a deep solution within budget. Quoting IDDFS's
  256,480 as "what pure search costs" would be picking a weak opponent.
- **But DFS returns bad sequences** (+2 folds on `012`). So the honest framing is two-column:
  *queries to any solution* (DFS wins) and *queries to the shortest* (IDDFS/BFS). A method that
  gets IDDFS-quality sequences at DFS-quality cost is the actual claim.
- **BFS is a non-starter on real CPs** — 1,000-node frontier on an 8-fold anchor, 8,684 on a
  timeout. Report it for completeness; it is not the baseline to beat.
- **Depth is the wall, not breadth.** Everything that failed, failed by not getting deep enough
  within budget. That is where a heuristic has room to pay for itself.

## ⚠️ Correction: a precision bug in the PurelandFold run

The first PurelandFold run reported 21/27 `EXHAUSTED` and I attributed it to the action-space
mismatch. The attribution was right; **the run that produced it was not.**

PurelandFold stores vertices at 3 decimals. A crease subdivided into collinear fragments then
computes normals ~5e-6 radians apart, and `stage2.mjs`'s `lkey()` rounds normals at 1e-6 — so
one crease shattered into several unrelated "lines". `walrus`'s full diagonal (span 1.414)
appeared as 33 stubs of length ≤ 0.476, and the search refused every fold for a reason that was
about rounding, not folding.

Fixed in `tolerant.mjs` by making the *lookup* tolerant rather than altering the geometry —
`buildTarget`'s `lines` Map is only used via `.get()` and `.values()`, so a clustered stand-in
drops in without `applyFold`, `candidates` or any search knowing. **Opt-in, off by default**;
instagram is full precision and probe C's verdicts depend on exact keys. Regression-checked:
instagram anchors unchanged at 5,940 / 256,480, round trip 36/36.

After the fix the solved count is **unchanged at 4/27** — the bug was real but was not the
blocker. Details and the corrected table: `../pureland/ANALYSIS.md` §4–5.

**Why DFS and BFS can "fail" at all**, since both are complete: `EXHAUSTED` is not the search
giving up. It is the search graph closing — a *proof* that no sequence exists **in this action
space**. The human's sequence exists but uses subset-of-layers folds, so it was never a path in
this graph. `TIMEOUT` is the only verdict meaning "ran out of budget", reported separately for
exactly that reason. `diagnose.mjs <file.fold>` prints, for any CP, every candidate first fold
and why it was refused.

## Files

| | |
| --- | --- |
| `search.mjs` | the three searches + shared instrumented `expand()` |
| `run.mjs` | dev sets, both gates, the report |
| `verify.mjs` | independent replay check for a found sequence |
| `tolerant.mjs` | clustered target for low-precision corpora (see correction above) |
| `diagnose.mjs` | why a search closed: every first-fold candidate and its rejection reason |
| `pureland.mjs` | the 27 PurelandFold sequences |
| `results.json` | per-run rows (gitignored) |

## Not done yet

- [ ] Run the full 366 with a fixed budget, now that DFS is known to reach depths IDDFS cannot.
      Specifically **re-run the 36 remaining TIMEOUT CPs with plain DFS** — `009` suggests more
      of them are solvable.
- [ ] Decide and freeze the reported budget. These numbers use 400k; probe C used 2M; `009`
      needs 2.7M for IDDFS and 10k for DFS. **Budget choice is now known to flip verdicts**, so
      it has to be fixed — and reported — before anything is quoted.
- [ ] **Propagate `009` into the fact-checked docs.** `notes/probes/probe-c-screen.md` and
      `DATASET.md` quote `probeC.solved = 2` and `probeC.timeout = 37` through tagged citations
      driven by `notes/facts.json` / `workspace/tools/doccheck.mjs`. Those become 3 and 36.
      Left untouched here deliberately — it needs a `facts.json` edit plus `doccheck --fix` in
      one commit, not a hand edit of the prose.
- [ ] Synthetic instances here are 2–6 folds. Extend to 8–21 to match PurelandFold's real range
      — that is where the DFS/IDDFS gap becomes the headline rather than a footnote.
