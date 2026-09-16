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

## 4. Running DFS / BFS / IDDFS on it

`node DHEERAJ_WORKSPACE/baseline/pureland.mjs --budget=300000 --depth=24`, targeting each
sequence's final CP:

| algo | solved | exhausted | timeout | median queries |
| --- | --- | --- | --- | --- |
| **DFS** | **4** / 27 | 21 | 2 | 1,148 |
| **BFS** | **4** / 27 | 23 | 0 | 884 |
| IDDFS | 1 / 27 | 21 | 5 | 1,586 |

Solved and **independently verified by replay** (`verify.mjs` — every fold legal from the flat
square, and the crease sets equal, not merely overlapping):

| sequence | search | human keyframes | |
| --- | --- | --- | --- |
| `fox_head` | **3 folds** | 7 transitions | −4 |
| `gift_card_holder` | **8 folds** | 16 | −8 |
| `girl` | **8 folds** | 20 | −12 |
| `shield` | **8 folds** | 14 | −6 |

### Two findings from that table

**(a) The search's sequences are far shorter than the human's, and both are correct.**
`girl` has 36 crease segments; the search reaches all of them in 8 all-layers folds, layers
climbing 2→21. An all-layers fold creases *every* layer it crosses at once — one fold covered 6
creases — whereas a person folds a few layers at a time. Same CP, radically different procedure.
This is the clearest evidence yet for the project's own *states ≠ sequences* note: **the CP
massively under-determines the sequence.** ⚠️ It also means our 8-fold route almost certainly
reaches a *different layer ordering* than the human's — same crease pattern, different finished
object. Worth checking against the stored `faceOrders` before leaning on this.

**(b) 21/27 exhaust almost immediately** — `walrus` closes out in 66 queries against 34 creases.
The search finds no legal first fold at all. That is the all-layers restriction: **Pureland folds
a subset of the layers; our action space folds all of them.** These are different action spaces,
and no budget fixes that.

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

1. **3-decimal coordinates.** Coarser than the 1e-7 epsilon the geometry runs at. This biases
   toward false `EXHAUSTED` (a real crease gets rejected as not-in-target), never toward false
   `SOLVED` — so the 4 solved are trustworthy and the 21 exhausted deserve a re-run at relaxed
   epsilon before being quoted as proof.
2. **Keyframes ≠ folds.** 34 of 211 transitions are flips. "Human took 20 steps" over-counts.
3. **No action labels** (§1) — any step-level metric needs a derivation we define ourselves.
4. **n = 27.** Too small for tiered difficulty claims on its own.
