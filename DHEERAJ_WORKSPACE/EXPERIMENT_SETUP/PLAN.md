# EXPERIMENT_SETUP — first VLM loop

2026-09-17. **Planning only; no runner or viewer extension is implemented by this document.**

This is the current first-run section of [the operational spec](../../EXPERIMENTS_SETUP.md).
It owns the pilot procedure below; the root spec retains the deferred research design.
[DATASET.md](../../DATASET.md) owns data provenance, the
[decision checklist](../../notes/plan/experiment-spec-checklist.md) owns freeze status,
and the [workflow](../../notes/plan/research-workflow.md) owns phase status.
[OPEN_SOURCE_VLMS.md](OPEN_SOURCE_VLMS.md) owns model candidates and availability.

## 1. Objective and scope

Find which available VLMs can read our CP and rendered fold states, propose a structured
next fold, consume tool feedback, and finish a sequence that we can inspect step by step.
Use **exactly 10 distinct existing easy examples**, the same set for every model.
One episode per example per model, one sequential proposal → validation → render → feedback
loop. Ten examples does not mean ten folds or ten total API calls. With M models there are
10 × M episodes. Additional models reuse these examples; expanding the dataset is later work.

This pilot has one condition: vision plus the fold tool. Training, ablations, search trees,
Hamiltonian tools, hard examples, and SAM integration are deferred. Start with one model,
then run further candidates through the same loop. No new corpus generation is needed.
The folder name is exactly `DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/`.

## 2. Existing examples

Selection inspected from `workspace/corpus/out/release/index.json`: filter `tier=all-layers`,
`band=easy`, `replay=ok`; sort ascending by `(folds, creases, id)`; take the first 10.
All files `cp.fold`, `seq.json`, `steps.fold`, and `meta.json` exist for these rows.
The index's replay labels are existing metadata, not a new replay performed for this plan.

| Pilot ID | Existing sample ID | Recorded folds | CP crease edges |
| --- | --- | ---: | ---: |
| easy-01 | easy-0194 | 4 | 4 |
| easy-02 | easy-0016 | 4 | 6 |
| easy-03 | easy-0052 | 4 | 8 |
| easy-04 | easy-0058 | 4 | 8 |
| easy-05 | easy-0061 | 4 | 8 |
| easy-06 | easy-0143 | 4 | 8 |
| easy-07 | easy-0001 | 4 | 9 |
| easy-08 | easy-0082 | 4 | 9 |
| easy-09 | easy-0100 | 4 | 9 |
| easy-10 | easy-0139 | 4 | 9 |

Each sample is under `workspace/corpus/out/release/all-layers/samples/<existing sample ID>/`.
This deliberately simple selection includes degeneracy flags; for example, easy-0194 has
`no_coupling=true` and `degenerate=true`. Retain and display those flags. They do not establish
corrupt data, and this pilot is not a representative difficulty benchmark.
Before execution, record source hashes and check unique CP hashes and frame compatibility.
Do not silently replace failures or select examples based on model success.

The model receives an anonymous CP, its rendered diagram, the current sheet state and fixed
camera views, instructions, and past exchanges. Start from the unfolded sheet.
Reference actions (`seq.json`), intermediate ground-truth frames, generation seeds, and
reference step counts stay evaluator-only. The terminal reference also stays evaluator-only:
this pilot tests CP → sequence, without a target image in the model prompt.

## 3. One loop

1. Load the CP and initial state; render a CP diagram and current-state views.
2. Send the instructions, action schema, CP, images, and complete episode history to the VLM.
3. Receive exactly one `apply_fold` action or `finish`. Preserve the raw response before parsing.
4. Validate the action schema and apply the candidate using the transition engine. An invalid
   proposal returns a structured error and leaves the state unchanged.
5. For an accepted fold, save the action and new state, render new images, and append the tool
   result to the conversation. Repeat from step 2. Rejections also return through step 2.
6. On `finish`, replay the proposed sequence and evaluate it. A model claiming completion is
   not sufficient for success. Budget exhaustion records its own terminal outcome.

Proposed action contract: `apply_fold(axis=[nx,ny,d], moving_face_ids=[...],
hinge_edge_ids=[...], direction="over"|"under")`; the normalized line is
`nx*x + ny*y = d` in the preceding saved state's coordinates. IDs refer to the supplied CP.
For this pilot the moving faces must comprise all layers on the selected side. The engine,
not the VLM, computes output coordinates and checks legality. `finish` has no geometry payload.
Native function calls and validated JSON text may be normalized to this contract; record
which transport was used. Never repair a proposed fold silently or substitute a BFS solution.

Existing integration points are `baseline_python/model.py` (`actions`, `apply`) and the
viewer frame format. These are candidates for reuse, not confirmed drop-in adapters.
The Python baseline supports a broader flap action model and different input conventions;
implementation must verify the generated corpus's topology, M/V signs, layer orders, frame
inheritance, and all-layers restriction before accepting compatibility.
The existing viewer's hinge animation is illustrative, not continuous collision validation.
Use actual engine errors; do not invent Flat-Folder constraint diagnoses it does not return.

Proposed pilot limits, to record in the run config before execution: 20 VLM requests including
retries, 20 attempted fold-tool calls, 10 accepted folds, and 10 minutes per episode.
Use temperature 0 where supported, record seed support, and cap output at 4,096 tokens per
request including reasoning where the backend allows that control. Record effective settings
and unsupported controls. Never drop history silently; context overflow is a visible error.
Use fixed image resolution and camera poses across models; the precise render settings,
backend, and timeouts remain pre-run configuration decisions in the checklist.

## 4. Extend the existing viewer

Extend `DHEERAJ_WORKSPACE/viewer/server.py` and its frontend in a later implementation.
Proposed new page: **`http://127.0.0.1:8000/llm`**. It does not exist yet.
Keep the current `/` saved-search browser available.

The new page should let the user select model → example → episode and inspect:

| Panel | What it shows |
| --- | --- |
| Fold playback | CP, current 3D state, accepted fold animation, previous/next/play/scrub controls |
| Input | Exact system/user/history messages, tool schemas, and the actual images sent to the model |
| Output | Raw response, parsed action or finish, parsing errors, finish reason |
| Reasoning | Model-returned reasoning when exposed; otherwise “not provided by this model/backend” |
| Tools | Tool name, call ID, arguments, result/error, duration, before/after state links |
| Timeline | Every request, response, tool call, rejection, retry, accepted fold, and terminal outcome |
| Episode summary | Completion status, call counts, tokens, elapsed time, evaluation and trace completeness |

Selecting a timeline event must select its matching state and conversation turn. Rejected
folds remain on the prior state and display the rejection. Show model reasoning verbatim only
when returned by the backend; label any requested short explanation as an explanation, not
as hidden internal reasoning. No reasoning content should be invented to fill an empty panel.
Reference playback may be available as a separately labelled evaluator view after the run;
it must never be confused with the model's proposed sequence or fed into its prompt.

## 5. Recording contract

Planned artifacts live under `EXPERIMENT_SETUP/runs/<run-id>/` (not created yet):
`config.json`, append-only `events.jsonl`, `transcripts.jsonl`, `metrics.jsonl`, an episode
index and summaries, and per-episode images, states, actions, and `sequence.fold`.
Keep the existing viewer export fields where compatible; add an explicit VLM loader rather
than assuming its current `result.json` / `trace.json` / `sequence.fold` loader reads JSONL.
The server must explicitly add the new run root; its current roots are `experiments` and `exports`.

Each record needs run/model/example/episode/turn IDs, UTC time, a global event counter, and
an episode counter. Link tool calls to responses with call IDs and states with stable IDs.
Store exact request payloads and raw response bodies, image files with hashes and dimensions,
parsed actions, tool results, returned reasoning, retries, token usage, and latency.
Authentication headers and credentials are excluded. Missing provider usage is null, not zero.
Config captures source hashes, model revision, backend/version, quantization, prompt/schema
versions, decoding settings, image settings, budgets, and code revision.
Flush after each event so interrupted runs remain inspectable. Page large traces, preserve
full on-disk records, and visibly report any recording failure or incomplete trace.

## 6. What “works” means

Separate compatibility from folding performance. For each model record whether it accepts
our images, returns a parseable action, consumes a tool result on the next turn, and produces
a complete inspectable trace. Mark all of these **untested** until actually exercised.

Report a row for each of the 10 examples: engine-valid replay, CP crease coverage, terminal
comparison, accepted/rejected folds, schema failures, model/tool calls, tokens, latency,
and stop reason. Report successful episodes out of 10, with failures retained.
Proposed outcomes: `SOLVED_MODEL`, `FINISHED_INVALID`, `BUDGET_LIMIT`, `MODEL_ERROR`,
`UNSUPPORTED_INPUT`, and `TRACE_ERROR`.

`SOLVED_MODEL` requires replay, required crease coverage, and the declared terminal comparison
under the implemented engine. Before execution, specify coordinate tolerance, pose alignment,
M/V and layer-order comparison, and allowed symmetries. Do not accept a screenshot resemblance
or a byte comparison as a geometric verdict. A reference mismatch is not proof that a different
folding is physically invalid; report it separately. Record step count against the reference as
a diagnostic; the stored sequence is not known to be shortest. Continuous physical validity
and a general equivalence-class evaluator are outside this pilot's demonstrated capabilities.

## 7. Implementation order for later

1. Confirm corpus-to-engine compatibility and resolve pre-run decisions in the checklist.
2. Implement one model adapter and the single loop, with recording enabled from its first call.
3. Add the `/llm` page and synchronize fold playback with conversations and tool events.
4. User runs the first model on the 10 examples and inspects all episode traces.
5. Reuse the same examples, prompt, tools, and budgets for additional candidate models.

This change only creates planning Markdown. Python/Node installations, scripts, tests, model
calls, and server startup are left to the user. Exact execution commands should be supplied
when the corresponding implementation exists; there is no pilot command to run today.
