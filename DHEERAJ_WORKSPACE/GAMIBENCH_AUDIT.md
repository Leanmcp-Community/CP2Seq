# GamiBench — dataset audit

**Question asked**: does GamiBench ship (a) crease patterns, (b) the terminal `.fold`, and (c) the
folding sequence?

**Answer**: **CP yes — as a PNG only. Terminal `.fold` no. Sequence no.**

| Artifact | Present? | What is actually shipped |
| --- | --- | --- |
| **Crease pattern (CP)** | ⚠️ **Image only** | `<name>_cp.png` — a rendered raster of the CP (red = mountain, blue = valley). No `.fold`, no `.cp`/ORIPA, no SVG, no vertex/edge coordinates. |
| **Terminal `.fold`** | ❌ **No** | The folded result is 1–6 rendered PNG viewpoints (`_top/_bottom/_front/_back/_left/_right`). No mesh, no layer ordering, no geometry of any kind. |
| **Folding sequence** | ❌ **No** | Nothing in the dataset *or* the repo encodes step order. Zero hits for `.fold`, `sequence`, `step` across all 40 `.py` files and 5 docs. The benchmark is single-shot CP → final shape. |

Audited **2026-09-16** against HF revision `79ba412` (last modified 2026-02-18) and GitHub `main`.

- Repo: https://github.com/stvngo/GamiBench · Dataset: https://huggingface.co/datasets/stvngo/GamiBench
- Paper: arXiv:2512.22207 (Spencer, Yaari, Vemavarapu, Yang, Ngo, Sharma) — AAAI 2026 workshops
- **License: MIT** (both) — reuse is unencumbered.

---

## 1. What the dataset physically is

781 files, ~45.5 MB, **777 of them PNGs**. The only non-images are `README.md`, `.gitattributes`,
and two eval config YAMLs. HF tags it `format:imagefolder`, `modality:image`,
`task_categories:visual-question-answering`, `size_categories:n<1K`.

```
data/GamiBench/<name>/
  ├─ <name>_cp.png               # the crease pattern, rendered
  ├─ impossible_<name>_cp.png    # a perturbed CP that cannot fold
  └─ <name>_<viewpoint>.png      # the folded result, rendered, 1–6 of these
```

**186 example folders.** That is the whole dataset — there is no parquet, no JSON, no metadata
table, no split file. The "dataset" is a directory tree that `discovery.py` globs by filename
convention at runtime.

### The images are renders, not photographs

Spot-checked `traditional_crane`: the CP is a flat vector-style render (grey construction grid,
red/blue MV lines, marked vertices — reads as an ORIPA/FOLD-viewer export), and the folded views
are triangulated blue/green-gradient 3D renders that are visually characteristic of **Origami
Simulator** (Ghassaei). The `impossible_` CP is the same CP with several creases re-assigned, plus
cyan lines marking the altered edges.

> **This matters.** A `.fold` almost certainly existed upstream to produce those renders — you
> cannot render a triangulated folded state without one. It was simply **not released**. So the
> geometry is *unrecoverable from the artifact* but *possibly reconstructible from the source CPs*,
> since the folder names are attributions to public designers (Kamiya, Komatsu, Lang, Ku, Imai,
> Tanaka, Shuki, plus `traditional_*` and tessellations).

---

## 2. Task shape: 4-way multiple choice, not a folding task

From `benchmarks/gamibench/` + `configs/experiments/gamibench_single.yaml`:

Three task types per example, all MCQ, all scored by a single letter (`max_tokens: 8`,
`temperature: 0.0`, answer regex `^\s*([A-E])\s*$`):

| Task type | Prompt image | Candidates | Correct answer |
| --- | --- | --- | --- |
| `standard_mcq` | `<name>_cp.png` | 1 true viewpoint + 3 renders of **other origami models** | the true one |
| `alternative_view` | same CP | a **different** viewpoint of the same model + the same 3 distractors | the true one |
| `impossible_fold` | `impossible_<name>_cp.png` | 4 distractors, none correct | always `"E"` |

Two consequences worth naming:

1. **Distractors come from entirely different models** (`_choose_distractors` samples other
   folders). So a model can often win by recognising "that render looks like a crane" — the task
   under-determines actual fold simulation. It is a retrieval/recognition task wearing a geometry
   task's clothes.
2. **Viewpoint Consistency is conditional**: `require_task1_correct_for_task2: true` means task 2 is
   only scored when task 1 was already right. Any VC number from the paper is conditional accuracy,
   not raw accuracy — do not compare it against an unconditional number.

The prompt is a single fixed string (`prompts.py`) with no chain-of-thought — output is capped at
8 tokens, so **no reasoning traces are produced or stored**.

---

## 3. Data-quality problems found (these are real, and they bite)

The README claims *"**186** valid and **186** impossible crease-pattern examples … paired with
corresponding 3D folded outcomes across **6 viewpoints** (top, bottom, front, back, right, left)."*
Applying the shipped loader's own rules (`discovery.py`) to the shipped files:

| Claim | Reality |
| --- | --- |
| 186 valid CPs | **184.** `tanaka_notitle` and `winston_cardinal` have no file matching `<name>_cp.png` (the latter's is `winston_cardinal_tetra_CP.png`). |
| 186 impossible CPs | **81 usable.** 182 `impossible_*` files exist, but only 81 match the loader's required `impossible_<name>_cp.png`. **101 are named `impossible_<name>.png`** (no `_cp`) and are silently dropped — `_resolve_case_insensitive_file` returns `None`, `_build_impossible_task` returns `None`, no warning. 4 examples have no impossible file at all. |
| 6 viewpoints each | **174 of 186 have exactly 2.** Histogram: 1 view ×1, **2 views ×174**, 3 ×1, 5 ×2, 6 ×8. Most common pairs are bottom (103) / top (95) / back (72). |

Plus: `komatsu_dolphin_cp(1).png` and `ku_quad_overlap_cp(1).png` are duplicate CP files that the
loader treats as **viewpoints** (the filter only excludes names ending exactly `_cp.png`), so a
crease pattern can be served as a candidate *answer image*.

**Net**: running the shipped pipeline as-is yields roughly 184 + 185 + 81 ≈ **450 scored items**, not
the ~558 the README implies, with ~55% of the impossible-fold task missing. Anyone reproducing the
paper's IFSR number should check this first.

---

## 4. Verdict for our project

**Bucket: metric definitions only. Not a data source.** This closes the open audit item in
`DATASET.md` §3 / action item 3.

- ❌ **Cannot supply `(CP, final result)` pairs.** "Final result" here is a PNG from an arbitrary
  camera angle. Our terminal-state ground truth needs `.fold` with layer ordering (per `DATASET.md`,
  that role is filled by Flat-Folder). An IoU or any geometric similarity against a render is not
  computable.
- ❌ **Cannot supply `(CP, sequence)` pairs.** There is no sequence. PurelandFold remains the only
  source with per-step ground truth.
- ❌ **Not a baseline method.** It is a benchmark of off-the-shelf MLLMs, with no folding agent to
  compare against.
- ✅ **Reusable idea 1 — the impossible-fold distractor.** Perturbing a valid CP's MV assignment to
  make it unfoldable is a cheap negative-example generator, and we can do it *properly*: build the
  perturbation in `.fold` and let Flat-Folder certify unfoldability, rather than asserting it.
  That turns their qualitative IFSR into a verified metric.
- ✅ **Reusable idea 2 — the CP roster.** The 186 folder names are a curated list of real-world
  designer CPs. That population overlaps the "hard real CP" regime probe-c measured (89.3% of real
  CPs fall outside simple-fold scope). If we ever want to *widen* the corpus beyond Flat-Folder's
  366 `examples/instagram/` files, this is a ready-made list of sources to chase — but we would have
  to obtain each `.fold` ourselves from the original designers/ORIPA collections. The PNGs do not
  help.
- ⚠️ **Related-work framing.** GamiBench evaluates *recognition* of a folded outcome from a CP.
  We evaluate *construction* of a sequence. Cite it as evidence that the CP→3D direction is hard for
  MLLMs; do not put it in the results table.

### Suggested edits to existing docs

- `DATASET.md` §3: replace the TBD ground-truth/bucket rows with the table at the top of this file;
  mark bucket as **"metric ideas only — images, no geometry"**.
- `DATASET.md` action item 3: tick, pointing here.

---

## Appendix — reproducing this audit

Everything below is read-only and needs no API key.

```bash
# 1. File manifest (781 entries) and per-example structure
curl -s "https://huggingface.co/api/datasets/stvngo/GamiBench" -o gami.json
python3 - <<'PY'
import json, collections
sib=[s['rfilename'] for s in json.load(open('gami.json'))['siblings']]
ex=collections.defaultdict(list)
for f in sib:
    p=f.split('/')
    if f.startswith('data/GamiBench/') and len(p)>3: ex[p[2]].append(p[3])
print('examples:', len(ex), 'files:', len(sib))
strict=sum(f'impossible_{n.lower()}_cp.png' in {x.lower() for x in fs} for n,fs in ex.items())
loose =sum(any(x.lower().startswith('impossible') for x in fs) for fs in ex.values())
print('impossible CPs — loader-visible:', strict, '/ files present:', loose)
PY

# 2. Total size  ->  {"path":"/","size":45458349}
curl -s "https://huggingface.co/api/datasets/stvngo/GamiBench/treesize/main"

# 3. Confirm no sequence/geometry anywhere in the code
curl -s "https://api.github.com/repos/stvngo/GamiBench/git/trees/main?recursive=1" \
  | python3 -c "import json,sys; print('\n'.join(x['path'] for x in json.load(sys.stdin)['tree']))"
# 57 blobs: 40 .py, 5 .md, 5 .yaml, 2 .png (assets), 1 .svg, 1 .ipynb, 1 .txt — no .fold, no data.

# 4. The three files that define the task
#    benchmarks/gamibench/{discovery,task_builder,prompts}.py
```
