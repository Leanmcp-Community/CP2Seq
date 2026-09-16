# PurelandFold — where the sequence lives, and what the search does with it

Audited 2026-09-16 against HF revision of 2026-09-01. **27 sequences · 337 keyframes · 32.6 MB
parquet · CC-BY-4.0.** Source: [`mayaweiz/PurelandFold`](https://huggingface.co/datasets/mayaweiz/PurelandFold),
the ground-truth benchmark from **FoldingAgent** (Moriya, Raab, Vinker, Dekel — Weizmann / MIT).

```bash
curl -L "https://huggingface.co/datasets/mayaweiz/PurelandFold/resolve/main/data/train-00000-of-00001.parquet?download=true" \
  -o DHEERAJ_WORKSPACE/data/pureland/train.parquet
python3 DHEERAJ_WORKSPACE/pureland/extract.py
node DHEERAJ_WORKSPACE/baseline/pureland.mjs
```

---

## 1. Where is the sequence? Not in any `.fold` file.

**The sequence is carried relationally by the parquet, not inside the FOLD files.** The table has
one row per `(sequence, step)`:

| column | what it is |
| --- | --- |
| `sequence` | model name — `cup`, `ladybug`, `girl`, … (27 distinct) |
| `step` | keyframe index, **1 = the flat square** |
| `image` | the real photograph of that keyframe |
| `cp.svg` | rendered crease pattern |
| `cp.fold` | FOLD JSON — the **state** at this keyframe |
| `flat_folder` | Flat-Folder's compile output for that state |

Each `cp.fold` carries `vertices_coords`, `edges_vertices`, `edges_assignment`,
`edges_foldAngle`, `faces_vertices` and **`faceOrders`**. It has **no** `step`, `action`,
`sequence` or ordering field of any kind — I checked all 337.

> **So: each row is a snapshot, never a move.** Ordering the rows by `step` gives you the
> sequence of *states*. The **action is never stated anywhere** — "valley-fold along this line,
> through these layers" exists only as the difference between two consecutive frames. Recovering
> actions from states is itself an inference problem, and it is the one FoldingAgent's paper is
> about.

This is the opposite shape from the instagram corpus, and the two are complementary:

| | instagram (366) | PurelandFold (27) |
| --- | --- | --- |
| crease pattern | ✅ | ✅ |
| **terminal folded state** | ❌ none stored | ✅ `faceOrders` per step |
| **intermediate states** | ❌ | ✅ 5–21 per sequence |
| **fold actions** | ❌ | ❌ **must be diffed out of the states** |
| bucket (`DATASET.md`) | C | **B+, not quite A** |

`DATASET.md` calls PurelandFold bucket A. On this audit it is **not** A in the strict sense —
it has the full state trajectory, but not the action labels. For step-level P/R/F1 against
predicted *actions*, the actions have to be derived first, and that derivation is a modelling
choice we would be making, not a label the dataset ships.

## 2. Step counts

5–21 keyframes, mean 12.5. `yacht` is shortest at 5, `girl` and `snake` longest at 21.

```
 5 yacht      7 bird       9 cat        10 cup            12 dog      13 penguin   14 rocket    15 shield
 6 sloth      7 tulip      9 tulip_stem 10 rabbit_head_v2 13 car      13 pig       14 sunflower 17 gift_card_holder
 8 fox_head  11 paper_bird 11 walrus    13 ladybug        13 santa_hat 14 rabbit_head_v1 15 cat_face  17 heart
19 horse_head  21 girl  21 snake
```

## 3. Does the corpus fit the search's assumptions?

The forward search assumes creases only ever accumulate and that every crease ever made survives
into the final CP. Measured with a 6e-3 tolerance — **PurelandFold stores coordinates rounded to
3 decimals** (`0.414` for `0.41421356…`), so exact matching produces false mismatches:

| | result |
| --- | --- |
| **monotone** — no crease ever disappears | **27/27** ✅ |
| every intermediate crease is in the final CP | **27/27** ✅ |
| zero vanishing segments across all 211 transitions | ✅ |

Both core assumptions hold on every sequence. **Using the final keyframe's CP as the search
target is therefore sound.**

### The M/V question, answered carefully

A naive check says 26/27 sequences reverse a crease's M/V versus the final CP — which would
gut the search, whose stated restriction is that it *never* creases a line against its final
direction. That number is wrong, and the reason matters: **Pureland permits `flip`, and turning
the model over inverts every crease at once.** Classifying each of the 211 transitions by what
fraction of shared creases invert:

| transition type | count |
| --- | --- |
| ordinary fold — nothing inverts | **168** / 211 |
| **whole model flipped over** — ~all invert | **34** / 211 |
| **genuine re-fold** against the prior direction | **9** / 211, in 6 sequences |

So the restriction bites on **9 transitions, not 1,679**. The honest statement is *6 of 27
sequences contain a fold that reverses an existing crease*, and those six are out of the
search's reach by construction.

## 4. ⚠️ A precision bug that had to be fixed first

The first run of this reported **21/27 EXHAUSTED**, several closing in under 70 queries, and I
wrote it up as "Pureland folds a subset of layers, we fold all of them". **The number was right
for the wrong reason, and the reason was a bug in our tooling.**

`walrus`'s final CP has its main diagonal creased end to end, all mountain, as six collinear
fragments:

```
(0,0)-(.25,.25)  (.25,.25)-(.346,.346)  (.346,.346)-(.5,.5)
(.5,.5)-(.654,.654)  (.654,.654)-(.75,.75)  (.75,.75)-(1,1)
```

Because vertices are stored at 3 decimals, those fragments compute normals of **−45.0002°,
−45.0000° and −44.9999°** — about 5e-6 radians apart. `stage2.mjs`'s `lkey()` rounds normals at
**1e-6**, so six pieces of one crease landed in six different line buckets. The search saw stubs
of length ≤ 0.476 instead of one crease of length 1.414, refused every candidate fold with *"the
chord extends past the CP's creases on this line"*, and reported `EXHAUSTED` — which reads
exactly like *proven not foldable* but actually meant *the coordinates were rounded*.

| walrus, 34 creases | lines | longest run |
| --- | --- | --- |
| exact 1e-6 key | 33 | 0.476 |
| **clustered at 4e-3** | **19** | **1.414** ← the first fold |

**The fix** is `baseline/tolerant.mjs`. I first tried repairing the data — re-fit each line by
total least squares, move each vertex to the least-squares meet of the lines through it. That
leaves a residual around 1e-6, because a shared vertex is a compromise between several lines,
which is precisely the scale `lkey` rounds at. Repairing the coordinates cannot beat the key.

So the geometry is left alone and the **lookup** is made tolerant instead. `buildTarget` returns
`{ lines: Map, total }`, and `lines` is only ever used as `.get(lkey(line))` by `demand()` and
`.values()` by `candidates()`. `tolerantTarget` clusters the exact buckets into real lines and
returns an object with those two methods, where `get()` resolves to the nearest cluster within
tolerance. `applyFold`, `candidates` and all three searches are untouched and never learn about
it. Opt-in via `opts.tolerance`; **off by default**, because the instagram corpus is full
precision and probe C's EXHAUSTED verdicts depend on exact keys. Regression-checked: instagram
anchors still return 5,940 and 256,480 queries exactly, round trip still 36/36.

## 5. Results, after the fix

`node DHEERAJ_WORKSPACE/baseline/pureland.mjs --budget=400000 --depth=24` (add `--exact` to
reproduce the broken run):

| algo | solved | exhausted | timeout | median queries |
| --- | --- | --- | --- | --- |
| **DFS** | **4** / 27 | 22 | 1 | 2,178 |
| **BFS** | **4** / 27 | 23 | 0 | 2,064 |
| IDDFS | 1 / 27 | 22 | 4 | 4,796 |

**The solved count did not change.** The precision bug was real and had to be fixed, but it was
not what was blocking the other 23. Query counts roughly doubled (median 1,148 → 2,178) because
the search now actually explores instead of dying at the root.

Solved and **verified by replay**:

| sequence | search | human keyframes | |
| --- | --- | --- | --- |
| `fox_head` | **3 folds** | 7 transitions | −4 |
| `gift_card_holder` | **8 folds** | 16 | −8 |
| `girl` | **8 folds** | 20 | −12 |
| `shield` | **8 folds** | 14 | −6 |

### Why the other 23 close — now properly established

`walrus` **does** have a legal first fold now (the diagonal, covering 6 of its 34 creases). It
still exhausts, and the depth it reaches before closing is the whole story:

| sequence | creases | depth reached | queries |
| --- | --- | --- | --- |
| `bird` | 10 | **1** | 12 |
| `sloth` | 11 | **1** | 14 |
| `walrus` | 34 | **2** | 186 |
| `ladybug` | 46 | **2** | 202 |
| `horse_head` | 28 | 3 | 752 |
| `cup` | 10 | 4 | 2,178 |

The search makes one to four all-layers folds and then has **no legal move left**, with 30–46
creases still uncovered. That is the action-space mismatch, and the mechanism is concrete: after
two all-layers folds the stack has four layers, and the human's next fold turns only one or two
of them. An all-layers fold there creases all four, producing creases the CP does not contain —
so it is refused. No budget fixes this; the sequence is not in the search graph.

> **This is what `EXHAUSTED` means, and why it is not a failure of DFS or BFS.** Both are
> complete: they find a path whenever one exists *in the graph they are searching*. `EXHAUSTED`
> is the search graph closing — a **proof that no all-layers simple-fold sequence produces this
> CP**. The human's sequence exists, but it uses a different action space, so it was never a
> path in this graph to begin with. `TIMEOUT` is the only verdict that means "we ran out of
> budget", and it is reported separately for exactly this reason.

## 5. What this corpus is actually good for

- ❌ **Not a CP→sequence benchmark for this action space.** 21/27 are unreachable for a
  structural reason, not a search-effort reason.
- ✅ **The best available scope measurement.** It quantifies exactly how far all-layers simple
  folding sits from what people do — with real sequences, not a proxy.
- ✅ **The only source of intermediate states.** For a *surface simulator* that judges whether a
  proposed step is legal (`notes/tools/flat-folder-capabilities.md`: "Flat-Folder can't give you
  steps — you have to build that"), these 337 verified states are the validation set.
- ✅ **Ground truth for the layer-order question**, via `faceOrders` on every state.

## 6. Limitations to carry

1. **3-decimal coordinates — handled, see §4.** Mitigated by `tolerantTarget` at 4e-3. The
   remaining bias still runs toward false `EXHAUSTED`, never false `SOLVED`, so the 4 solved are
   trustworthy. Worth a sensitivity sweep over the tolerance before the 22 exhausted are quoted
   as proof.
2. **Keyframes ≠ folds.** 34 of 211 transitions are flips. "Human took 20 steps" over-counts.
3. **No action labels** (§1) — any step-level metric needs a derivation we define ourselves.
4. **n = 27.** Too small for tiered difficulty claims on its own.
