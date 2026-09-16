# CP → sequence: mathematics and BFS/DFS reference

## 1. Task and inputs

**Input:** an unfolded crease pattern (CP) and one target folded-state snapshot.
**Output:** a sequence of fold actions taking the flat sheet to that target.

For Pureland, the terminal `cp.fold` supplies both: material-coordinate geometry
defines the CP; fold angles and face orders describe the target. The search does
not receive the human's intermediate frames. A recovered sequence need not equal
the human demonstration.

## 2. Terminology

| Term / symbol | Meaning |
|---|---|
| CP | Subdivision of the original unfolded sheet by crease segments |
| Vertex, \(V\) | A mesh point: corner, crease endpoint, or intersection |
| Edge, \(E\) | A mesh segment joining two vertices; includes boundary edges |
| Boundary segment, \(B\) | An edge along the sheet boundary |
| Crease segment, \(C\) | An internal CP edge; not necessarily a whole straight crease line |
| Face, \(F\) | A polygonal piece of paper between edges; excludes the exterior |
| Assignment | Mountain (`M`), valley (`V`), flat (`F`), boundary (`B`), unassigned (`U`), or artificial join (`J`) |
| Snapshot / keyframe, \(K\) | A recorded configuration; may repeat another or represent a pose change |
| Fold action | One permitted move of selected faces about a hinge line |
| Sequence length, \(L\) | Number of actions in a path; also its search depth |
| History label, \(H\) | Set of crease IDs folded at least once; does not record order, direction, or current shape |
| Full state, \(s\) | Face geometry, layer order, and crease history |
| Reachable state | A state obtainable from the initial sheet using permitted actions |
| Goal state | A state satisfying the target and crease-coverage checks |
| Successor | A state produced by one accepted action |
| Branching factor, \(b(s)\) | Number of outgoing permitted actions at state \(s\) |
| Frontier | Discovered search nodes still awaiting exploration |
| State key | Representation used to recognize and deduplicate states |
| Query | One attempted fold simulation, including rejected and duplicate outcomes; not an LLM call |

The symbol \(F\) for a face count is different from assignment `F` for a flat edge.
A CP edge, a whole crease line, and a fold action are three different things.

## 3. Three graphs, with different purposes

| Graph | Nodes | Edges | Purpose |
|---|---|---|---|
| CP mesh | Material vertices | Boundary / crease segments | Describe sheet geometry |
| Face-adjacency graph | Paper faces | Shared mesh edges | Find connected flaps |
| Search graph | Whole-sheet states | Accepted fold actions | Find a sequence |

The search graph is generated on demand, not built completely beforehand.

```text
CP mesh + target snapshot
          ↓
flat-sheet state ── fold A ──► state 1 ── fold C ──► target
          └─────── fold B ──► state 2 ── ...
```

## 4. What the code stores

The CP is FOLD JSON containing `vertices_coords`, `edges_vertices`,
`faces_vertices`, and `edges_assignment`. The target additionally supplies
assignments/angles and `faceOrders`. Input mesh IDs must align.

The solver state is

\[
s=(T_1,\ldots,T_F,\pi,H).
\]

- \(T_i\): rigid planar transform locating face \(i\), including reflections.
- \(\pi\): total bottom-to-top ordering of all faces.
- \(H\): set of crease segments used so far.

Each transform stores six numbers:

\[
x'=ax+by+t_x,\qquad y'=cx+dy+t_y.
\]

Initially, transforms are identities and \(H=\varnothing\). The final CP's face
subdivision is present from the start, but its hinges have not yet been creased.
An initial stack order is bookkeeping for the nonoverlapping flat faces.

```text
State  = (face_transforms, stack_bottom_to_top, crease_history)
Action = (hinge_line, moving_face_IDs, over_or_under, hinge_edge_IDs)
Node   = (state, parent_node, incoming_action, depth)
```

The action's line is \(n_xx+n_yy=d\). All current actions are 180-degree moves.
The sequence is the parent-linked path to a goal, reversed into forward order:

\[
s_0\xrightarrow{a_1}s_1\xrightarrow{a_2}\cdots\xrightarrow{a_L}s_L.
\]

## 5. History labels versus full states

For one crease, these four states have only two history labels:

| Configuration | History label | Current assignment |
|---|---|---|
| Untouched flat sheet | \(\varnothing\) | Flat |
| Mountain-folded | \(\{1\}\) | Mountain |
| Valley-folded | \(\{1\}\) | Valley |
| Folded, then unfolded | \(\{1\}\) | Flat |

History alone cannot tell where a flap lies or whether another layer blocks it.
Geometry and layer order determine possible next moves; history distinguishes
an unused crease from a crease that has been made and subsequently unfolded.

If \(n(H)\) is the number of reachable geometry-and-layer configurations with
history \(H\), then

\[
\#\text{reachable histories}\le 2^C,
\qquad
\#\text{reachable full states}=\sum_{H\subseteq\{1,\ldots,C\}}n(H).
\]

Some \(n(H)=0\); others exceed one. Therefore **\(2^C\) does not bound the full
state count**, and reachable histories need not be *strictly* fewer than \(2^C\).

## 6. Counting relationships and bounds

For the extracted Pureland meshes, all internal edges are M/V/flat segments:

\[
E=B+C.
\]

For a connected planar subdivision of a disk, with exterior face excluded:

\[
V-E+F=1,\qquad F=E-V+1.
\]

Artificial joins/cuts or different topology require adjusting these relations.
Euler's count alone does not validate geometry.

For a demonstration with \(K\) snapshots:

\[
\text{recorded transitions}=K-1.
\]

In general, \(L\ne C\) and \(L\ne K-1\): one action can crease many segments,
creases can be reused, and snapshots are not action labels.

### Ten-crease example

| Representation | Independent choices per crease | Combinations for \(C=10\) |
|---|---|---:|
| History only | Never used / used | \(2^{10}=1,024\) |
| Current status only | Flat / mountain / valley | \(3^{10}=59,049\) |
| Status plus history | Unused flat / used flat / mountain / valley | \(4^{10}=1,048,576\) |

These count labels, not physically reachable configurations. Likewise,
\(2^{25}=33,554,432\) counts possible history subsets for 25 creases only.

For an **idealized exact flat-fold model**, assuming connected rigid faces,
fixed global pose, resolved flat/M/V statuses determining face geometry, and
a total stack of \(F\) faces, a loose full-state bound is

\[
N_{\text{states}}\le 4^C F!.
\]

Most combinations violate geometry or layering constraints; some stack orders
describe the same physical configuration. This is not a practical size estimate.
Evaluate it using the actual face count, not just the crease count. It is not
a bound for continuous-angle origami, nor a verified bound on the current
floating-point implementation's distinct state keys.

## 7. Counting possible sequences

For a finite, well-defined search graph, let \(A_{ij}\) count actions taking
state \(i\) to state \(j\). With start \(s_0\) and goal set \(\mathcal G\):

\[
N_L=\sum_{g\in\mathcal G}(A^L)_{s_0,g},
\qquad N_{\le D}=\sum_{L=0}^{D}N_L.
\]

These count action walks ending at a goal, allowing repeated states. To count
only first-arrival solutions, stop paths at their first goal. Without a depth
limit, repeatable fold/unfold cycles on a route to a goal can give infinitely
many sequences even when the state graph is finite.

With constant branching \(b>1\), an unmerged search tree through depth \(D\) has

\[
1+b+\cdots+b^D=\frac{b^{D+1}-1}{b-1}.
\]

This explains search growth; actual branching varies and deduplication merges
paths. **Neither \(C!\) nor \(2^C\) is the number of origami folding sequences.**

## 8. How candidate folding works

```text
SUCCESSORS(state):
    find current images of CP hinge lines
    for each line:
        remove adjacency connections across hinges on the line
        find connected face components
        for each nonempty union of components on one side:
            for direction in [OVER, UNDER]:
                count one attempted-move query
                check hinge connections and layer exposure
                reflect moving faces; reverse their internal stacking
                place them above/below the stationary stack
                add affected hinges to crease history
                normalize global pose by fixing face 0
                reject if shared vertices separate beyond tolerance
                otherwise yield action and successor state
```

This permits selected flaps, groups of flaps, folds, unfolds, and refolds. It is
a restricted zero-thickness model: no partial-angle poses, new creases through
face interiors, general pocket insertion, or simultaneous multi-axis folding.
A global stack cannot represent cyclic local layer order.

## 9. BFS and DFS pseudocode

Both algorithms use the same move generator, target checks, and state key.
Resource limits can stop either algorithm before an answer is found.

```text
BFS(initial):
    queue ← [Node(initial)]
    visited ← {KEY(initial)}
    while queue is not empty:
        node ← remove oldest node
        if GOAL(node.state): return parent path
        if at depth limit: record cutoff; continue
        for action, state in SUCCESSORS(node.state):
            enforce query, time, and state limits
            if KEY(state) is new:
                mark visited
                enqueue Node(state, parent=node, action=action)
    return DEPTH_LIMIT if cutoff occurred, else EXHAUSTED_MODEL
```

```text
DFS(node):
    if GOAL(node.state): return parent path
    if at depth limit: record cutoff; return
    for action, state in SUCCESSORS(node.state):
        enforce query, time, and state limits
        depth ← node.depth + 1
        if KEY(state) was reached at an equal or smaller depth: continue
        best_depth[KEY(state)] ← depth
        answer ← DFS(Node(state, parent=node, action=action))
        if answer exists: return answer
```

Initialize DFS's `best_depth` with the initial key at depth zero. The actual
implementation uses explicit iterator stacks rather than Python recursion.
Reopening a shallower visit prevents an earlier deep visit from suppressing a
path that fits within the depth limit.

| Algorithm | Useful for | Main cost / limitation |
|---|---|---|
| BFS | Fewest unit-cost actions in a well-defined search graph | Large frontier memory |
| DFS | Finding a first solution without breadth-first expansion | Can pursue long unproductive paths; not shortest |

Both implementations retain visited-state information. DFS's live traversal
stack is depth-sized, but its **total memory is not just O(depth)**.

## 10. Verification and status meanings

| Check | What is checked |
|---|---|
| Input | Mesh topology, supported flat angles, target geometry closure, compatible layer constraints |
| Each move | Same-side motion, permitted hinges, exposure relative to stationary layers, shared-vertex continuity |
| Goal | All required creases used; target M/V/flat assignments, resolved geometry, and supplied layer orders match |
| Replay | Reapply returned actions from the flat sheet and recheck the goal |

The geometry target is reconstructed from target angles on the face-adjacency
graph. Pureland material coordinates are not mistaken for folded coordinates.
The loader distinguishes Pureland's world layer-order convention from standard
FOLD's normal-relative convention. `U` without a resolved angle leaves constraints
unspecified; such a target need not determine a unique state.

Replay uses the **same simulator**, not an independent physics verifier. It
does not compare the predicted path with the human's intermediate trajectory.

| Status | Meaning |
|---|---|
| `SOLVED` | Target reached and replay passed in the implemented model |
| `EXHAUSTED_MODEL` | Implementation ran out of unexplored states without a solution |
| `STATE_LIMIT` | Unique-key cap reached, or allocation failed |
| `QUERY_LIMIT` | Attempted-move cap reached |
| `TIME_LIMIT` | Search time cap reached at a checkpoint |
| `DEPTH_LIMIT` | Search ended with branches cut off by the depth cap |
| `UNSUPPORTED_INPUT` | Input failed the implementation's validation |

None of the failure statuses proves the physical model is impossible.

**Unresolved numerical issue:** keys contain rounded face coordinates,
orientation signs, total stack, and history, while transitions use unrounded
transforms. Near tolerances, equivalent keys may not give equivalent successors;
different paths may also accumulate different numerical geometry. The observed
BFS/DFS discrepancy needs diagnosis. Do not interpret current visited counts as
stable counts of physical states or claim exhaustive reachability certification.

## 11. Measured Pureland counts

Counted from local extracted data on 2026-09-16: **27 models, 337 snapshots**.
The following statistics use one terminal CP per model, matching benchmark input.

| Quantity | Total | Mean per model | Minimum–maximum |
|---|---:|---:|---:|
| Vertices | 583 | 21.59 | 7–39 |
| All edge segments | 1,035 | 38.33 | 14–74 |
| Boundary segments | 364 | 13.48 | 4–24 |
| Internal crease segments | 671 | 24.85 | 7–54 |
| Faces | 479 | 17.74 | 6–36 |
| Target M/V segments | 542 | 20.07 | 6–46 |
| Recorded snapshots | 337 | 12.48 | 5–21 |
| Recorded transitions | 310 | 11.48 | 4–20 |

The remaining 129 internal segments are flat at the target. Human fold-action
counts are not explicitly labeled. All 337 snapshots satisfy \(V-E+F=1\).
Across *all snapshots*, including early flat sheets, mean counts are instead
12.00 vertices, 19.65 edges, 10.85 crease segments, and 8.65 faces.

| Example | Vertices | Edges | Crease segments | Faces | Snapshots |
|---|---:|---:|---:|---:|---:|
| bird | 11 | 18 | 10 | 8 | 7 |
| cup | 11 | 20 | 12 | 10 | 10 |
| fox_head | 7 | 14 | 10 | 8 | 8 |
| ladybug | 37 | 68 | 52 | 32 | 13 |
| girl | 39 | 74 | 54 | 36 | 21 |
| yacht | 9 | 14 | 7 | 6 | 5 |

There are **27 recorded demonstrations**, not a known total of all possible
sequences. The 337 snapshot entries need not be distinct physical states.

The inspected `python-pureland-large-run1` report used depth 1000, 10 million
queries, 20,000 state keys, and 1800 seconds per algorithm/model:

| Algorithm | Models searched | Mean visited keys | Outcomes |
|---|---:|---:|---|
| BFS | 25 | 15,129.20 | 1 solved, 18 state-limited, 6 exhausted |
| DFS | 25 | 19,201.64 | 0 solved, 24 state-limited, 1 exhausted |

Two models failed input validation. BFS returned three actions for `yacht`.
These are implementation measurements, not validated physical reachability
counts; most runs were capped and the numerical discrepancy remains unresolved.

## 12. Which quantities are most useful?

- **Input complexity:** report terminal \(C\) and \(F\), together with \(V,E\).
  Faces determine how much geometry and layering each state must store.
- **Baseline performance:** report solved fraction, solution length, queries,
  elapsed time, visited keys, peak frontier, and all resource-limit outcomes.
- **Solution quality:** verify the endpoint and moves; use BFS shortest-path
  claims only within a consistent unit-cost graph. Human keyframes are not an
  optimal-action count.
- **History counts \(2^C\):** useful for understanding the coverage component,
  not for predicting full-state memory or runtime.
- **Bounds \(4^CF!\) and \(b^D\):** illustrate combinatorial growth, not measured
  dataset size or the expected number of states searched.
- **Next correctness priority:** make state equivalence and transitions
  consistent, then validate moves independently before scaling search budgets.

## 13. All Pureland models: measured search size versus a loose bound

**Read “depth / states” as maximum path length reached / distinct keys visited
in the recorded run.** Depth is not the number of simulated moves (queries),
nor a solution length. Human transitions are snapshots minus one, not verified
fold counts. V/E/C/F count the terminal CP's vertices/edges/crease segments/faces.

**L** = state limit; **E** = implementation exhausted; **S** = solved.
Both algorithms had depth cap **1,000** and state cap **20,000**.
Only yacht/BFS returned a solution here: **3 actions**. All other solution
lengths are unknown. Unsupported rows were rejected for a zero-length edge.

| Model | V | E | C | F | Human transitions | BFS depth / states | DFS depth / states | Ideal bound U ≈ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| bird | 11 | 18 | 10 | 8 | 6 | 13 / 1,553 E | 57 / 20,000 L | 4.23e+10 |
| car | 16 | 26 | 13 | 11 | 12 | 6 / 20,000 L | 55 / 20,000 L | 2.68e+15 |
| cat | 15 | 26 | 14 | 12 | 8 | 6 / 20,000 L | 59 / 20,000 L | 1.29e+17 |
| cat_face | 30 | 55 | 39 | 26 | 14 | 5 / 20,000 L | 55 / 20,000 L | 1.22e+50 |
| cup | 11 | 20 | 12 | 10 | 9 | 9 / 20,000 L | 59 / 20,000 L | 6.09e+13 |
| dog | 23 | 42 | 30 | 20 | 11 | 7 / 20,000 L | 56 / 20,000 L | 2.80e+36 |
| fox_head | 7 | 14 | 10 | 8 | 7 | 11 / 1,817 E | 56 / 20,000 L | 4.23e+10 |
| gift_card_holder | 20 | 35 | 21 | 16 | 16 | 5 / 20,000 L | 57 / 20,000 L | 9.20e+25 |
| girl | 39 | 74 | 54 | 36 | 20 | 5 / 20,000 L | 161 / 20,000 L | 1.21e+74 |
| heart | 27 | 48 | 30 | 22 | 16 | 5 / 20,000 L | 59 / 20,000 L | 1.30e+39 |
| horse_head | 29 | 52 | 36 | 24 | 18 | 5 / 20,000 L | 56 / 20,000 L | 2.93e+45 |
| ladybug | 37 | 68 | 52 | 32 | 12 | 8 / 20,000 L | 55 / 20,000 L | 5.34e+66 |
| paper_bird | 21 | 36 | 24 | 16 | 10 | 6 / 20,000 L | 54 / 20,000 L | 5.89e+27 |
| penguin | 17 | 30 | 20 | 14 | 12 | 8 / 20,000 L | 55 / 20,000 L | 9.59e+22 |
| pig | 28 | 49 | 35 | 22 | 12 | unsupported | unsupported | 1.33e+42 |
| rabbit_head_v1 | 23 | 42 | 26 | 20 | 13 | unsupported | unsupported | 1.10e+34 |
| rabbit_head_v2 | 23 | 42 | 26 | 20 | 9 | 5 / 20,000 L | 56 / 20,000 L | 1.10e+34 |
| rocket | 24 | 39 | 21 | 16 | 13 | 6 / 20,000 L | 58 / 20,000 L | 9.20e+25 |
| santa_hat | 31 | 54 | 32 | 24 | 12 | 5 / 20,000 L | 57 / 20,000 L | 1.14e+43 |
| shield | 35 | 58 | 34 | 24 | 14 | 4 / 20,000 L | 1000 / 20,000 L | 1.83e+44 |
| sloth | 14 | 21 | 11 | 8 | 5 | 13 / 1,221 E | 58 / 20,000 L | 1.69e+11 |
| snake | 35 | 66 | 46 | 32 | 20 | 4 / 20,000 L | 57 / 20,000 L | 1.30e+63 |
| sunflower | 17 | 28 | 12 | 12 | 13 | 4 / 20,000 L | 56 / 20,000 L | 8.04e+15 |
| tulip | 9 | 16 | 8 | 8 | 6 | 14 / 13,353 E | 58 / 20,000 L | 2.64e+9 |
| tulip_stem | 9 | 16 | 10 | 8 | 8 | 6 / 221 E | 55 / 20,000 L | 4.23e+10 |
| walrus | 23 | 46 | 38 | 24 | 10 | 5 / 41 E | 29 / 41 E | 4.69e+46 |
| yacht | 9 | 14 | 7 | 6 | 4 | 3 / 24 S | 56 / 20,000 L | 1.18e+7 |

The last column is the approximate scientific-notation value of
\(U=4^C F!\), under the exact-model assumptions in §6. It is the **same
combinatorial bound for BFS and DFS**, not the measured reachable-state count.
For invalid/unsupported meshes it is only an arithmetic label-space comparison;
applicability of the geometric bound is not established.

### What can “maximum steps” mean?

- **Configured maximum path length:** 1,000 for every search above.
- **Observed maximum path length:** the depth column; this can describe a failed
  branch, not a successful folding procedure.
- **Shortest solution length:** unknown except the current model's reported
  three-action BFS solution for yacht; numerical consistency remains unverified.
- **Maximum sequence length with repetitions:** no finite bound when repeatable
  cycles lie on a route to the target.
- **Cycle-free solution length in an exact finite graph:** at most \(N-1\),
  where \(N\) is the reachable-state count, hence at most \(U-1\) if that bound
  applies. This is a bound, not a claim that either algorithm takes that many steps.
- **Total search effort:** queries/expansions, not path depth. In an exact graph,
  BFS expands each visited state at most once; this depth-limited DFS can reopen
  shallower visits. Neither algorithm's actual effort follows from C and F alone.

**Is 20,000 “nothing”?** It is tiny compared with these loose combinatorial
bounds, but that does not establish it is tiny compared with the reachable graph.
For yacht, BFS already succeeded after 24 visited keys. Conversely, 18 BFS runs
and 24 DFS runs hit the cap: those runs were truncated, and their remaining search
size is unknown. The bounds do not justify assuming all models need more RAM.
Resolve the numerical/model discrepancies before interpreting larger searches.

## Sources in this repository

- [Python implementation and usage](../baseline_python/README.md)
- [State, action, transition, and goal definitions](../baseline_python/model.py)
- [BFS and DFS](../baseline_python/search.py)
- [Pureland audit](../pureland/ANALYSIS.md)
- [Extracted dataset index](../data/pureland/index.json)
- [Inspected benchmark report](../data/python-pureland-large-run1/benchmark.json)

The data and result paths are local, gitignored artifacts. Counts above are from
direct JSON inspection; no new Python benchmark was executed to write this note.
