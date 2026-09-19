# Where a tool call gets verified

Update, 2026-09-19: the experiment now uses `fold-engine-layers.mjs` through
`FoldSession`. It accepts indexed or arbitrary-angle lines and all/top/bottom
layer selections. Original-sheet connectivity is checked first; `would-tear`,
`direction-impossible`, `nothing-to-move`, and `no-crease` are distinct errors.
Target-CP compatibility is checked only after fold legality succeeds. Failed
actions do not commit state or revisions. Exploded target/current PNGs are now
part of the model inputs. The older source excerpts and line numbers below
describe the September 18 implementation, not the expanded action space.

Every action the model emits passes through four independent checks before it
becomes a score. This file names each one, its file, and its exact failure
modes. Nothing here is a proposal; it documents the code as it stands on
2026-09-18.

## The chain

| # | Layer | File | Entry point |
| --- | --- | --- | --- |
| 1 | Schema and types | `CODEX_HARNESS_TESTING/codex_fold_loop.py` | `validate_action`, line 67 |
| 2 | Tool dispatch and rollback | `DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/fold_tools.js` | `ToolSession.call`, line 30 |
| 3 | **Fold verifier** | `DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/engine.mjs` | `FoldSession.apply`, line 85 |
| 4 | Terminal verifier | `DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/terminal_match.mjs` | `terminalMatch`, line 68 |

Absolute paths:

```
/Users/ddod/LEANMCP/ROBOTICS/FoldOrigami/CODEX_HARNESS_TESTING/codex_fold_loop.py
/Users/ddod/LEANMCP/ROBOTICS/FoldOrigami/DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/fold_tools.js
/Users/ddod/LEANMCP/ROBOTICS/FoldOrigami/DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/engine.mjs
/Users/ddod/LEANMCP/ROBOTICS/FoldOrigami/DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/terminal_match.mjs
```

The Tinker loop, `DHEERAJ_WORKSPACE/EXPERIMENT_SETUP/tinker_fold_loop.py`, is the
peer of layer 1. Both drive the same `fold_tools.js` through the Playwright
session in `capture_fold.py`, so layers 2 to 4 are shared by every backend.

## 1. Schema and types

`codex_fold_loop.py:67`. Rejects malformed JSON before the simulator is touched.

```python
 78      if set(arguments) - set(params["properties"]) or set(params["required"]) - set(arguments):
 79          raise ValueError("Extra or missing action arguments")
```

Caught at `codex_fold_loop.py:196` and returned to the model as:

```python
199   feedback = {"ok": False, "error": str(exc), "instruction": "Return one valid action; nothing executed."}
```

A rejection here does not consume a tool call; `tool_calls` only increments after
validation passes.

## 2. Tool dispatch and rollback

`fold_tools.js:30`. An `add_fold` replays the entire accepted action list into a
fresh session first and commits only on success:

```js
 38        const next = replay(this.cp, this.session.actions);
 39        info = next.apply({tool: 'apply_fold', ...args});
 40        if (!info.ok) return {...info, ...this.state()};
 41        this.commit(next);
```

So a rejected fold can never corrupt live state, and a failed middle
`remove_fold` leaves the session exactly as it was. Every throw becomes a
result rather than an exception:

```js
 57      } catch (e) { return {ok: false, error: e.message, ...this.state()}; }
```

This is why a failed tool call still returns normally. Errors are data.

## 3. The fold verifier

`engine.mjs:85`. This is the layer that produces the errors dominating the runs.

```js
 88      const r = applyFold(this.layers, this.creases, action.angle_index, action.offset, action.move_positive, action.over);
 89      if (!r) return {ok: false, error: 'ENGINE_REJECTED', detail: 'No new crease, line misses paper, or crease-direction conflict'};
 90      if (r.made.some(c => !segmentCovered(c, this.cp))) {
 91        return {ok: false, error: 'OUTSIDE_TARGET_CP', detail: 'Candidate makes a crease segment or M/V assignment absent from the input CP'};
 92      }
```

| Error | Meaning |
| --- | --- |
| `ENGINE_REJECTED` | Geometrically impossible: no new crease, the line misses the paper, or the crease direction conflicts. |
| `OUTSIDE_TARGET_CP` | A legal fold that creases where the target CP has no crease. |

The `OUTSIDE_TARGET_CP` test is `segmentCovered` at `engine.mjs:52`. Each new
crease must be fully covered by collinear CP edges **carrying the same M/V
assignment** (line 58), checked by walking sorted intervals along the segment
(lines 64 to 71). Coverage rather than edge identity, because planarization may
split a crease differently than the CP file does.

### What this layer does not report

The returned object carries `ok`, `error`, `detail` and the layer state. It does
not carry how far the offset was from a real crease, which CP edge was nearest,
or whether the geometry or the M/V assignment was the thing that failed. Line 58
rejects a geometrically perfect crease whose assignment is flipped and reports it
identically to a crease in entirely the wrong place.

Measured on `CODEX_HARNESS_TESTING/runs/codex-20260917T160831299664Z`:

```
OUTSIDE_TARGET_CP   414
ENGINE_REJECTED      36
accepted              76
```

86 percent of tool calls rejected, with a binary signal. Episodes end at
`turn_budget` or `repetition_detected` having laid 1 to 5 of the 7 to 10 creases
needed. This is the open problem; no fix is implemented yet.

## 4. The terminal verifier

`terminal_match.mjs`, called from `fold_tools.js:22`. Runs only on `finish` and
decides `solved`.

```js
 22      const cp = this.session.evaluate(), terminal = terminalMatch(this.session.layers, this.target);
 23      return {...cp, terminal_reference_match: terminal, pilot_match: cp.cp_match && terminal,
```

Three fields, tightening:

- `cp_match` — `engine.mjs:107`. Planarized crease geometry and M/V assignments
  equal the target CP.
- `terminal_reference_match` — `terminal_match.mjs:68`. The final layer stack
  equals the reference stack.
- `pilot_match` — both of the above. `solved` additionally requires an explicit
  `finish` call: `codex_fold_loop.py:240`.

### The isometry quotient

`terminalMatch` compares the stack **up to a single plane isometry**: translation,
rotation at any angle, or physical turnover. Rotations preserve layer order and
parity; reflections reverse the entire stack and flip every parity. One transform
must carry every layer polygon onto its reference counterpart. Candidate
transforms come from every alignment of the corresponding first layer's vertex
cycle, in both turnover branches; a candidate counts only if it carries all
layers. The metric does not compare original-sheet face identity. Historical
results below predate this turnover correction and are not new validation.

This replaced a fixed-coordinate comparison. `move_positive` decides which half
of the sheet travels, so a correct sequence routinely reproduces the reference
object elsewhere in the plane. Three `easy-0001` episodes had reproduced the
reference stack exactly, under a 180 degree rotation, with identical face count,
parity array and layer order, and were scored unsolved. Re-scoring the 39 saved
episodes under the new metric moved `solved` from 0 to 3; no other row changed,
because every other episode failed on `cp_match`, not on placement.

The old metric is kept as `strictTerminalMatch` and recorded per row as
`terminal_match_fixed_coordinates`, so it stays possible to see which episodes
pass only because of the quotient.

The quotient stops at isometries. Repartitioned faces and equivalent layer
orders from the `EXPERIMENTS_SETUP.md` specification are still not implemented, so
a differently partitioned but valid solution can still fail. The zero-thickness
engine does not verify continuous-motion collisions. Neither metric is the full
paper's ACCEPT criterion.

Regression tests: `test_fold_pipeline.py`,
`test_reference_matches_when_the_target_is_moved_or_mirrored` and
`test_terminal_match_still_rejects_a_different_stack`.

## What the model sees

`codex_fold_loop.py:222` and `:224` pass each result through `model_view`
(`codex_fold_loop.py:34`), which only rounds floats, maximum absolute error
5e-11, well under the 2e-6 terminal tolerance. Integers, booleans and non-numeric
values pass through untouched. The model therefore receives the verifier's
`{ok, error, detail}` verbatim.

## Where the evidence lands on disk

| Path | Contents |
| --- | --- |
| `<run>/<sample>/turn-NNN/tool.json` | The action and the full verifier result |
| `<run>/<sample>/turn-NNN/model-feedback.json` | Exactly what went into the next prompt |
| `<run>/<sample>/history.json` | Every accepted action, rewritten each turn |
| `<run>/<sample>/seq.json` | The candidate sequence. Not the reference |
| `<run>/<sample>/final.fold`, `target.fold` | The two stacks layer 4 compares |
| `<run>/<sample>/result.json`, `<run>/results.json` | Scores |

The reference sequence lives in the corpus, not the run:
`workspace/corpus/out/release/all-layers/samples/<sample>/seq.json`. It is read
only after the final model call, at `codex_fold_loop.py:235`, and never enters a
prompt.

## Re-scoring saved runs

`node workspace/rescore_runs.mjs` recomputes layer 4 from each episode's saved
`final.fold` and `target.fold`, calling no model and re-running nothing. It
rewrites `result.json` and `results.json` in place and writes
`workspace/RESCORE_REPORT.md`. `--dry-run` reports without writing.
