# Experiments — tool-assisted VLM folding (CP → sequence)

Updated 2026-09-17.

**Owns: how the experiment runs** — task, action interface, feedback conditions,
validation, metrics, and protocol. Data inventory lives in `DATASET.md`; decisions
awaiting confirmation live in `notes/plan/experiment-spec-checklist.md`.

## 1. Dataset and task

### 1.1 Objective

Measure whether simulator feedback and rendered views help a VLM produce a legal
folding sequence that reaches a specified target. Use an off-the-shelf VLM; no
training or fine-tuning is part of this experiment.

Each scored item contains an initial sheet, a crease pattern (CP), a target folded
state, and a declared action space. Freeze whether the target is shown to the model
and in what representation; use the same task input in every condition. The target
used for final scoring is not a substitute for checking the intervening actions.

### 1.2 Admission and scope

Start with a small set carrying at least one independently replay-checked reference
sequence under the chosen simulator rules. Synthetic data is useful for this
purpose, but generator success alone is not independent validation. Real examples
require the same admission checks. Missing reference actions or uncertain geometry
are data-quality issues, not labels of physical impossibility.

Freeze the supported moves (all layers or selected layers, direction, unfolding,
pre-creasing), geometric precision, and target tolerance before scoring. Restrictions
must follow the task and validated simulator capabilities, not preserve an old
search result. Do not label an item impossible merely because a search timed out
or exhausted its restricted candidate graph.

Probe A/B/C are archived investigations, not admission gates, difficulty labels,
selected baselines, or reasons to exclude a corpus. Their historical scope is
recorded in `notes/probes/`. No new probe sweep is required for this experiment.

### 1.3 Available annotations

| Data | Permitted use |
| --- | --- |
| CP + target + replay-checked actions | Primary scored pilot; reference is a feasible route, not a unique or shortest answer |
| CP + target + state snapshots | Derive and validate transitions before treating them as action ground truth |
| CP only | Exploration; not a scored target-reaching item until the target and admission evidence are supplied |

PurelandFold supplies state trajectories without explicit action labels. Existing
synthetic artifacts and exporters are inventoried in `DATASET.md`. Neither requires
matching a BFS/DFS sequence for acceptance.

## 2. Model and action interface

Freeze model/version, prompt, sampling parameters, and context policy. The same
model is used across conditions; any second model is a separate replication.

The VLM proposes a structured action: fold line in a declared coordinate frame,
movement direction, and selected layers when applicable, or a `done` declaration.
The simulator computes the successor state. A model-authored `.fold` snapshot alone
does not establish that the transition from the previous state is legal.

## 3. Tools and verification

### 3.1 Surface simulator

Existing implementation entry points are `workspace/tools/surface-sim.mjs` and
`workspace/tools/fold-loop.mjs`. Their presence does not establish that all protocol
requirements below are implemented or validated.

For each action, check schema and supported-move constraints, compute the transition,
and return the resulting state or a structured refusal. Invalid proposals must not
mutate the accepted state. Render views from the accepted simulator state.

Document exactly which properties are checked: sheet connectivity/tearing, layer
selection and ordering, geometric consistency, and collision during motion. A flat
terminal-state check is not a continuous-motion collision check. Any property
claimed to hold by construction needs a scoped justification and tests; unsupported
physics must remain an explicit limitation of reported success.

Current implementation documents refusals such as `would-tear`, `no-crease`,
`nothing-to-move`, and `direction-impossible`. Audit those paths before freezing
an error taxonomy; do not assume Flat-Folder's terminal constraint classes are
already the simulator's step errors.

### 3.2 Final evaluator

Replay every submitted sequence from the initial sheet without relying on the
model's claimed states or success flag. Check each transition and compare the
replayed target against a predeclared equivalence rule. Freeze coordinate alignment,
tolerances, crease coverage, assignment requirements, and allowed symmetries.
Rotation, reflection, and layer-order differences are not automatically equivalent;
allow only those justified by the task.

Use an evaluator independent of candidate generation and feedback claims. If it
shares geometry code with the simulator, record that dependency and supplement it
with independently specified fixtures or cross-checks; replay alone does not remove
shared implementation bugs. Every condition uses the same final evaluator.

### 3.3 Optional ordering tool

A Hamiltonian-path/crease-ordering tool remains a separate proposal. Specify its
input, output, and relation to executable folds before including it. It must not
block the minimal simulator experiment and is not a folding verifier.

## 4. Interaction loop

1. Give the VLM the fixed task input and condition-specific tool description.
2. Parse its proposed action; apply it through the simulator where tools are enabled.
3. Return only the feedback permitted by that condition.
4. Continue until `done` or a fixed budget is reached.
5. Independently replay and score the submitted sequence.

In the no-tools condition, collect a complete action sequence without online
simulator feedback, then evaluate it offline. Invalid actions, parse errors,
timeouts, tool failures, and evaluator failures must be distinguishable in logs.
Freeze whether the model may retry, undo, or branch, and how those operations cost
budget. A timeout reports an unfinished attempt, not an impossible task.

## 5. Experiment conditions and protocol

| Condition | Online feedback |
| --- | --- |
| Full feedback | Simulator state, structured errors, and rendered views |
| No vision | Same state/error information, without rendered views |
| Verifier only | Action accepted/rejected only, without state detail or images |
| No tools | No online simulator feedback; final offline evaluation remains identical |

Keep the action space, initial input, model, and final acceptance rule fixed. For
the full/no-vision contrast, use identical text feedback and add images only to the
full condition. The existing text/images implementation must be checked for this
before claiming a visual-feedback effect. Add optional tools in a separate ablation.

Freeze before running:

- Dataset version, splits, anonymization, and held-out items. Strip names and metadata
  that reveal an answer. Do not expose reference actions to scored model runs.
- Common model-call and token limits (with separate image-token accounting), action
  limits, and wall-time limit; tool-call counts are reported separately. Equal tool
  budgets alone cannot make a no-tools comparison fair.
- Repeats, seeds where supported, model version, retry policy, and context truncation.
- Sampling strata based on recorded task features, with the sampled distribution
  reported. Reference length is not a certified minimum or a proven difficulty score.
- Evaluation tolerances, allowed symmetries, and handling of infrastructure failures.

This comparison measures the benefit of tools and feedback. It does not by itself
separate reasoning from memorization; that requires additional exposure controls.

## 6. Metrics

**Primary:** fraction of attempts whose complete replayed sequence is legal under
the declared model and reaches the target equivalence class within budget. Report
counts and uncertainty across items/repeats. Do not substitute terminal validity
alone for sequence validity.

**Secondary:** invalid proposal rate (with its denominator), parse-error rate,
timeout rate, model/tool calls, token use, wall time, and length of valid successful
sequences. Report all-attempt resource use and failures, with success-only summaries
clearly labelled. Paired per-item comparisons make the feedback effect assessable.

A CP may have many valid sequences. Edit distance to one reference is descriptive,
not a correctness score. A length ratio compares against that reference route;
without a separate optimality certificate it is not a shortest-path ratio.
BFS/DFS are not selected experimental baselines or verifiers. Search-generated
candidates, if used for development, face the same replay checks as any other route.

## 7. Error analysis

Separate malformed actions, unsupported actions, transition refusals, legal but
wrong targets, budget exhaustion, and infrastructure/evaluator errors. Attribute
failures to the checks actually performed. Log the accepted state, proposed action,
feedback, budget counters, and evaluator outcome so a failure can be reproduced.
Do not infer a need for subset-of-layers folds from an unsuccessful search alone.

## 8. Execution order

1. Freeze the action schema and simulator's tested scope.
2. Validate legal/illegal transition fixtures and the independent final evaluator.
3. Admit a small replay-checked dataset and inspect target renderings.
4. Smoke-test logging and each feedback condition; confirm no reference leakage.
5. Freeze budgets and scoring, then run the paired pilot under user control.
6. Inspect failures, fix implementation defects, version the changes, and rerun
   affected pilot cases before scaling to the held-out experiment.

Existing generators, replay tools, and loop code may be reused after this audit.
The presence of an implementation is not a completed experimental result.

## 9. Outputs

Deliver the frozen protocol, dataset manifest, versioned prompts and tools,
anonymized per-attempt logs, validity/success and resource metrics for each condition,
and error analysis. Claims concern measured tool and visual-feedback effects under
the declared simulator model. They do not include a general real-origami
impossibility percentage, search optimality, or untested physical feasibility.
