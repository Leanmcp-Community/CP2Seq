# Two ways to beat the depth wall: what they are, why they should work, what happened

Exhaustive search over the legal-fold enumerator costs `c0·(b·g)^d` — see
`FINDINGS_search_cost.md`. The effective base is 3.9 on easy, 4.6 on mid and 12.4 on hard,
and the reference depths are 6.8, 12.0 and 19.0. Speed cannot close that: depth grows as
`log(work)`, so a 10× speedup buys 0.9 levels at base 12.4 and hard-0001 is 16 levels short.
Closing it by throughput alone needs 3 × 10¹⁷×.

So the only things that help change the *shape* of the search. Two were worth building. This
is what each one is, the reasoning that made it worth trying, and what the measurement said.

---

## 1. Bidirectional search

### What it is

Search forward from the flat sheet and backward from the target at the same time, and stop
when the two frontiers meet. A path of length `d` is then found as two paths of length `d/2`.

### Why it should help

Cost goes from `b^d` to `b_fwd^(d/2) + b_bwd^(d/2)`. The exponent halves, so the saving is
itself exponential — at hard-0001's numbers, 6 × 10²⁰ nodes against 5 × 10¹⁰, about 10¹⁰×.

Two further reasons made it the most promising candidate here rather than merely the
textbook one.

**The backward half looked nearly free.** The backward branching factor is the graph's
in-degree: how many different (state, fold) pairs produce the same state. That can be
measured without implementing anything, by counting the duplicates a forward BFS already
throws away. Measured: forward branching 3.14 on easy-0003 and 3.43 on mid-0001, against a
mean in-degree of 1.33 and 1.20. The fold graph is a tree going forward and close to a chain
going backward, which is the ideal shape for meeting in the middle — predicted 300× and 880×
on those two samples.

**It does not depend on a heuristic.** The saving is structural. That matters because the
heuristics available here are barely better than random (§2), so anything that needs a good
one is on weak ground.

### What it needs

1. **An unfold operator**: given a state, enumerate the states that could have produced it by
   one fold.
2. **The target as an engine state**: faces in original-sheet coordinates with a transform
   each, not just the folded polygons the `.fold` target carries.

### What we built

**The target state.** Half of what is missing is free — flat folding fixes every face's
transform from the M/V assignment alone, by propagating reflections across the face
adjacency graph (verified: `T_g = R(T_f)` on 249 of 249 adjacent pairs). The half that is
not free is which sheet region sits at which layer, which is the flat-folding problem itself
and cannot be derived. It can be recorded, though: replaying the reference sequence
reproduces it, and `FoldSession.observation()` already returns it per layer. It is now
committed as `workspace/provenance/`, and `target_state.mjs` rebuilds the engine state from
the original corpus plus that field. Verified exact on samples up to 512 layers.

**The unfold.** For each candidate fold line, run length and end, un-reflect the moved run,
merge each split face back with its sibling, and check the result by folding it forward and
comparing. Verification makes soundness free; completeness is the hard part, and reached
24/24 along reference paths and 25/25 one step off them.

### What happened

It is correct — it solves what one-directional search solves, and every path it returns is
replayed from the flat sheet and put through `terminalMatch`. It is **not faster**.
easy-0007 takes 115 forward + 97 backward expansions against 115, and 17.9 s against 2.0 s.
The backward frontier dies within two or three levels, so the meet almost never happens and
the search degenerates into the forward one plus the cost of trying.

### Why: the reasoning that explains it

A state is an **ordered** list of layers. Layers that do not overlap — on opposite sides of a
fold line, side by side rather than stacked — have no physically meaningful order between
them.

- **Folding cannot see that order.** Swapping such a pair leaves the fold's result identical,
  measured 20 times out of 20.
- **Unfolding depends on it.** Recovering the previous state requires the layers that moved
  to form a contiguous run at one end of the list, and an interleaving that separates them
  admits no fold at all.

So the unfold rebuilds a state that is the same paper — geometrically identical, same
canonical key — with those layers elsewhere in the list. It folds back correctly and
verifies. One step further back it is a dead end. On easy-0003, two levels back, the true
state has 2 predecessors and the variant the unfold produced has 0.

This also explains why every earlier test passed. States on a reference path, or one step off
it, are **forward-generated**, so their order is the one folding produced. Only states the
unfold itself built fail, and nothing tested those until the search ran.

### What would be needed

Three ways out, and the first two are closed by measurement:

| | verdict |
| --- | --- |
| Normalise the layer order everywhere, so both directions agree | **Closed.** Normalising each forward state and asking whether the moved run is still contiguous: 7 of 30 folds lose it. Normalisation breaks the property the unfold needs. |
| Drop the contiguity requirement, let the unfold consider any subset on one side | **Closed.** The candidate set goes from ~2N to 2^N. |
| Change the simulator so it stops imposing an arbitrary order between non-overlapping layers | Open. A partial order, or a canonical form that folding preserves. |

The third is a change to the engine, not to the search, and it would want its own
justification: it touches every consumer of the state, including `terminalMatch`, which
compares layer *i* against target layer *i* and so currently distinguishes exactly the
orderings a partial order would merge.

---

## 2. Best-first search on a distance-to-target heuristic

### What it is

Instead of expanding the frontier breadth-first, expand the state that looks closest to the
target first, scored by `compare_to_target` — which reads the target state only and never the
reference sequence, so a search using it stays inside what the benchmark gives a solver.

### Why it should help

A heuristic does not make each node cheaper; it changes how many of them get expanded.
Informally, if the correct next fold consistently ranks near the top of the ordering, the
search behaves as though the branching factor were that rank rather than the true `b`. Since
cost is `b^d`, dropping the effective branching from 7 to 2 at depth 19 is `7^19` against
`2^19` — fourteen orders of magnitude, enough to matter.

### How to measure it before building it

The useful question is not whether the score correlates with distance in general. It is
sharper, and directly measurable:

> At each state along a known solution, sort the legal folds by the heuristic. **Where does
> the correct one rank?**

If it ranks first, a greedy walk solves the sample with no search at all. If it ranks third
out of twenty, best-first behaves like branching 3 rather than 20. That rank *is* the
effective branching factor, and it can be read off the reference sequences without writing a
search.

The comparison that matters is against **random ordering**, not against blind BFS. With no
information the expected rank is `(n+1)/2`, and any ordering beats a large `n` trivially.

### What happened

| sample | random expectation | v1 (counting) | v2 (geometric) | better than random |
| --- | --- | --- | --- | --- |
| easy-0003 | 2.65 | 2.40 | 1.50 | 1.10× / 1.77× |
| mid-0001 | 2.86 | 2.36 | 2.55 | 1.21× / 1.13× |
| mid-0003 | 4.04 | 3.85 | 4.23 | 1.05× / **0.95×** |
| mid-0005 | 4.29 | 3.08 | 3.25 | 1.39× / 1.32× |
| **mean** | **3.46** | **2.92** | **2.88** | **1.18× / 1.20×** |

**Both versions are 18-20% better than no information at all**, and on mid-0003 v1 is worse
than blind search. Two scores built on completely different principles — a discrete count and
a continuous geometric distance — landed in the same place, which is the signal that the
problem is not the implementation.

A second pattern: the heuristic is weakest **early** and only picks up near the goal, in 3 of
4 samples. That is the worst possible shape, because the top of the tree is where pruning
compounds.

### Why: the reasoning that explains it

v1 scores layers short of the target plus the **number** of mismatched ranks. Early in a
search every candidate has the same layer count and almost every rank mismatches, so the
score saturates and the ordering between candidates is noise. That much is an implementation
problem, and v2 replaced the count with a continuous geometric distance — per-rank area
difference and centroid distance — which fixed easy-0003 and made the three mid samples
slightly worse.

The deeper reason is about origami rather than about the score. **How far a partial folding
is from the target is not a function of how it looks now.** It depends on which folds remain
available, and two geometrically similar intermediate states can be three folds apart and
unreachable respectively. Unlike a maze or a sliding puzzle, position does not carry
distance-to-go.

### What would be needed

A distance built from **CP-side** information rather than target-state similarity: how much
of the crease pattern is still unmade, and whether those creases are still reachable given
what has been folded. That is a reachability question, not a geometric one, and it is the
same idea as the feasibility lookahead in `probe_search_strategies.mjs` that has not been
built.

One by-product is worth keeping regardless. `ceil(log2(target_layers / current_layers))` is a
**lower bound on the folds remaining** — each fold at most doubles the layers — so it is
admissible for A\*, verified never to exceed the true remaining depth on any sample or depth
tested. It only counts layers, so it is far too weak alone, but it is free and sound as a
floor term.

---

## Reproducing

```sh
node workspace/probe_search_strategies.mjs --probe 1 easy-0003 mid-0001   # in-degree
node workspace/probe_search_strategies.mjs --probe 2 --heuristic 1 mid-0001
node workspace/probe_search_strategies.mjs --probe 2 --heuristic 2 mid-0001
node workspace/check_unfold.mjs easy-0001 easy-0003                        # unfold completeness
node workspace/search_bidirectional.mjs --compare --seconds 60 easy-0001 easy-0007
node workspace/diagnose_unfold.mjs easy-0003                               # which stage fails
```
