// THE LOOP — EXPERIMENTS_SETUP.md §4.
//
//   (CP, target) → prompt → model → candidate fold → surface simulator
//                    ↑                                   │
//                    └──────── views, or a structured error
//
// until the model declares the sequence complete, then ACCEPT / REJECT.
//
// The model box is stateless per call; what grows is the prompt. That is the shape §4 specifies
// and it is also what makes the two experimental arms comparable — the only thing that differs
// between them is what comes back from the simulator.
//
// ============================================================================================
// /!\ THE VISION CHANNEL IS NOT WIRED, AND THIS IS THE HONEST REASON
// ============================================================================================
// surface-sim renders SVG. The Messages API accepts image blocks as PNG / JPEG / GIF / WebP —
// not SVG. So sending the model a picture needs a rasteriser, which needs a dependency this
// repo does not have. Rather than pretend, the loop ships with two feedback channels:
//
//   text     the state described in words and numbers: silhouette, layer count, stack, creases
//            made so far. This is the NO-VISION CONTROL of §5, a condition we want to run
//            anyway, not a placeholder.
//   images   present in the interface, refused at run time until a rasteriser is configured.
//            The failure is loud on purpose: a silent fallback to text would produce a "vision"
//            arm whose numbers are actually the control's, and nobody would notice.
//
// ============================================================================================
// /!\ HOW ACCEPT IS DECIDED, AND WHERE THIS DEPARTS FROM §4
// ============================================================================================
// §4 compares the final state to the stored FINAL RESULT and warns that a CP has many valid
// terminal states, so byte equality marks correct answers wrong. That warning was written when
// the data was bucket B — final states without sequences.
//
// Our corpus is bucket A, so there is a better comparison available: replay the model's own
// sequence and check the CREASE PATTERN it produces equals the target. A crease pattern has no
// layer-order ambiguity, so the equivalence-class problem does not arise; and it is the thing
// the task is actually stated over. Square symmetry is still allowed for, because a CP folded
// from a rotated sheet is the same CP.
//
// The cost of this choice, stated: a sequence that reaches the right pattern by a different
// route is ACCEPTED, including one shorter than the recorded one. That is correct — 30 samples
// in the release corpus have a shorter solution than the sequence that built them (DATASET.md)
// — but it means ACCEPT does not mean "reproduced the demonstration".
//
//   node fold-loop.mjs --sample out/release/all-verified/samples/v3-0001 --model oracle
//   node fold-loop.mjs --sample <dir> --model claude --feedback text --max-steps 12
//   node fold-loop.mjs --sample <dir> --model claude --no-tools     (§5 ablation)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { newSession, step, encodeState, decodeState, creasePattern } from "./surface-sim.mjs";
import { currentPolys } from "../corpus/fold-engine-layers.mjs";
import { creaseGeometry, pairsUp } from "../corpus/crease-compare.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MODEL_ID = "claude-opus-5";

/* ---------- describing a state in words ---------------------------------------------------- */
// The no-vision channel. It carries what a fold has to be chosen against: where the paper is,
// how thick the stack is, and which layer is where. Numbers are rounded for readability -- the
// model proposes lines, it does not do the arithmetic, and the engine works from full precision.
function describe(st, madeSoFar) {
    const r = (v) => Math.round(v * 1e4) / 1e4;
    const polys = currentPolys(st);
    const all = polys.flatMap(p => p.poly);
    const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
    const lines = [
        `The paper now occupies x ∈ [${r(Math.min(...xs))}, ${r(Math.max(...xs))}], ` +
        `y ∈ [${r(Math.min(...ys))}, ${r(Math.max(...ys))}], in ${polys.length} layers.`,
        `Layers, bottom of the stack first:`,
        ...polys.map((p, i) => `  ${i}: ${p.poly.map(q => `(${r(q[0])},${r(q[1])})`).join(" ")}`),
    ];
    if (madeSoFar.length) {
        lines.push(`Creases made so far, in the flat sheet's coordinates:`);
        for (const c of madeSoFar)
            lines.push(`  ${c.a} (${r(c.P[0])},${r(c.P[1])}) – (${r(c.Q[0])},${r(c.Q[1])})`);
    } else lines.push(`No creases yet.`);
    return lines.join("\n");
}

function describeTarget(cp) {
    const r = (v) => Math.round(v * 1e4) / 1e4;
    const out = [];
    for (const [i, [u, w]] of cp.edges_vertices.entries()) {
        const a = cp.edges_assignment[i];
        if (a !== "M" && a !== "V") continue;
        const A = cp.vertices_coords[u], B = cp.vertices_coords[w];
        out.push(`  ${a} (${r(A[0])},${r(A[1])}) – (${r(B[0])},${r(B[1])})`);
    }
    return out.join("\n");
}

/* ---------- the prompt --------------------------------------------------------------------- */
const SYSTEM = `You recover the folding sequence that produced a crease pattern.

The sheet starts flat and square, corners (0,0) (1,0) (1,1) (0,1). You fold it one fold at a
time. Each fold picks a straight line and moves the paper on one side of it across to the other.

You may move the WHOLE stack, or a contiguous run of layers taken from the top or the bottom —
nothing from the middle. A run taken from the top folds over; one from the bottom folds under.
You may not unfold, and you may not pre-crease.

State each fold as JSON on a line of its own:

  {"fold": {"through": [[x1,y1],[x2,y2]], "moving": [x,y], "selection": {"mode":"all"}}}

  through    two points the fold line passes through, in the CURRENT view of the paper
  moving     any point on the side that MOVES — this is how you say which half folds over
  selection  {"mode":"all"} for the whole stack, or {"mode":"top","k":N} / {"mode":"bottom","k":N}

When the creases you have made match the target pattern, reply with:

  {"final": true}

Every fold is simulated before it is accepted. If it is illegal you get a named reason and the
paper does not move — read the reason and propose a different fold. Think before each fold, but
end every reply with exactly one JSON object.`;

const taskMessage = (cp, tier) =>
    `Recover a folding sequence that produces this crease pattern.\n\n` +
    `M = mountain, V = valley, coordinates in the flat sheet:\n${describeTarget(cp)}\n\n` +
    `Action space: ${tier === "all-layers"
        ? "every fold moves the WHOLE stack. Do not use top/bottom selections."
        : "folds may move the whole stack, or a run of layers from the top or bottom."}`;

/* ---------- model adapters ------------------------------------------------------------------ */
// An adapter takes the running transcript and returns {fold} or {final:true}. Keeping this
// narrow is what lets the oracle and a real model run through identical loop code -- if the
// harness only ever ran with a live model, a harness bug and a model failure would look the same.

// ORACLE: replays the recorded sequence. It exists to test the LOOP, never to produce a result.
// Any number it generates is a statement about the harness.
function oracleAdapter(seqPath) {
    const folds = JSON.parse(fs.readFileSync(seqPath, "utf8")).folds ?? [];
    let i = 0;
    return async () => {
        if (i >= folds.length) return { final: true, raw: "(oracle: sequence exhausted)" };
        const f = folds[i++];
        const line = f.line ?? (f.normal ? { n: f.normal, d: f.offset } : null);
        if (!line) throw new Error("oracle: this sample records folds by angle index; " +
                                   "use --model oracle only on some-layers samples");
        return { fold: { line, movePositive: f.move_positive ?? f.movePositive,
                         selection: f.selection ?? { mode: "all" }, over: f.over },
                 raw: `(oracle step ${i})` };
    };
}

// CLAUDE: the real arm. Loaded lazily so the rest of this file, and every other tool here, keeps
// working in a checkout with no node_modules.
async function claudeAdapter(opts) {
    let Anthropic;
    try { ({ default: Anthropic } = await import("@anthropic-ai/sdk")); }
    catch {
        throw new Error("@anthropic-ai/sdk is not installed. `npm install` in the repo root, " +
                        "or use --model oracle to exercise the loop without a model.");
    }
    const client = new Anthropic();
    return async (messages) => {
        const res = await client.messages.create({
            model: MODEL_ID,
            max_tokens: 16000,
            system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
            thinking: { type: "adaptive" },
            output_config: { effort: opts.effort ?? "high" },
            messages,
        });
        // stop_details is populated only on a refusal, so it is checked before content is read.
        if (res.stop_reason === "refusal")
            return { error: "refusal", raw: JSON.stringify(res.stop_details) };
        const text = res.content.filter(b => b.type === "text").map(b => b.text).join("\n");
        return { ...parseReply(text), raw: text, usage: res.usage };
    };
}

// The model's reply is prose plus one JSON object. The LAST balanced object is taken, not the
// first: a model that reasons in the open often writes a rejected candidate before its answer,
// and taking the first would act on the one it talked itself out of.
export function parseReply(text) {
    const objs = [];
    for (let i = 0; i < text.length; i++) {
        if (text[i] !== "{") continue;
        let depth = 0, inStr = false, esc = false;
        for (let j = i; j < text.length; j++) {
            const c = text[j];
            if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
            if (c === '"') inStr = true;
            else if (c === "{") depth++;
            else if (c === "}" && --depth === 0) { objs.push(text.slice(i, j + 1)); i = j; break; }
        }
    }
    for (const s of objs.reverse()) {
        let o; try { o = JSON.parse(s); } catch { continue; }
        if (o.final === true) return { final: true };
        if (o.fold) return { fold: o.fold };
    }
    return { error: "no-json", detail: "the reply contained no {\"fold\":…} or {\"final\":true}" };
}

/* ---------- scoring -------------------------------------------------------------------------- */
// The eight symmetries of the square: a pattern folded from a sheet held the other way round is
// the same pattern. Anything beyond these would start accepting different patterns as equal.
const SYMS = [
    (p) => [p[0], p[1]], (p) => [1 - p[0], p[1]], (p) => [p[0], 1 - p[1]], (p) => [1 - p[0], 1 - p[1]],
    (p) => [p[1], p[0]], (p) => [1 - p[1], p[0]], (p) => [p[1], 1 - p[0]], (p) => [1 - p[1], 1 - p[0]],
];
export function accepts(builtCP, targetCP) {
    const want = creaseGeometry(targetCP);
    for (const S of SYMS) {
        const moved = { ...builtCP, vertices_coords: builtCP.vertices_coords.map(S) };
        const got = creaseGeometry(moved);
        if (got.length === want.length && pairsUp(got, want)) return true;
    }
    return false;
}

/* ---------- the loop -------------------------------------------------------------------------- */
export async function runEpisode({ sampleDir, model, feedback = "text", maxSteps = 16, noTools = false }) {
    const cp = JSON.parse(fs.readFileSync(path.join(sampleDir, "cp.fold"), "utf8"));
    const meta = JSON.parse(fs.readFileSync(path.join(sampleDir, "meta.json"), "utf8"));
    const tier = meta.tier ?? (meta.stratum ? "all-layers" : "some-layers");

    if (feedback === "images")
        throw new Error("the image channel needs a rasteriser: surface-sim renders SVG and the " +
                        "Messages API takes PNG/JPEG/GIF/WebP. Run --feedback text (the §5 " +
                        "no-vision control) until one is configured. Refusing rather than " +
                        "silently falling back, which would mislabel the control as the vision arm.");

    let st = newSession();
    const made = [];
    const messages = [{ role: "user", content: taskMessage(cp, tier) }];
    const trace = [];
    let toolCalls = 0, illegal = 0, accepted = false, stop = "max-steps";

    for (let n = 0; n < maxSteps; n++) {
        const reply = await model(messages, { state: encodeState(st), made });
        messages.push({ role: "assistant", content: reply.raw || "(no text)" });
        trace.push({ n, kind: reply.final ? "final" : reply.fold ? "fold" : "unparsed",
                     raw: reply.raw, usage: reply.usage });

        if (reply.error === "refusal") { stop = "model-refusal"; break; }
        if (reply.final) { stop = "model-said-final"; break; }
        if (!reply.fold) {
            messages.push({ role: "user", content:
                `That reply had no fold in it. End your reply with exactly one JSON object: ` +
                `{"fold": …} or {"final": true}.` });
            continue;
        }

        toolCalls++;
        const r = step(st, reply.fold);
        if (!r.ok) {
            illegal++;
            trace[trace.length - 1].result = { error: r.error, detail: r.detail };
            // THE FEEDBACK THE EXPERIMENT IS ABOUT. Under --no-tools the model is told only that
            // the fold was refused; with tools it gets the named reason and the hint. The
            // difference between those two runs is the whole ablation, so it is the ONLY thing
            // that differs between the arms.
            messages.push({ role: "user", content: noTools
                ? `That fold was refused. Propose a different one.`
                : `That fold was refused: ${r.error}. ${r.hint ?? ""}` +
                  `${r.detail ? ` (${r.detail})` : ""}\nThe paper has not moved.\n\n${describe(st, made)}` });
            continue;
        }

        st = decodeState(r.state);
        made.push(...r.made);
        trace[trace.length - 1].result = { ok: true, metrics: r.metrics, made: r.made };
        messages.push({ role: "user", content: noTools
            ? `Fold accepted. Propose the next one, or {"final": true}.`
            : `Fold accepted: ${r.metrics.creases_made} crease(s), ` +
              `${r.metrics.layers_moved} layer(s) moved, now ${r.metrics.layers} layers.\n\n` +
              `${describe(st, made)}\n\nPropose the next fold, or {"final": true}.` });
    }

    // Scored on what the model actually built, whether or not it said it was finished -- a model
    // that runs out of steps having built the right pattern has solved it, and one that declares
    // victory early has not.
    const built = creasePattern(made);
    accepted = made.length > 0 && accepts(built, cp);

    return {
        sample: path.basename(sampleDir), dir: sampleDir, tier,
        folds_recorded: meta.steps ?? meta.metrics?.steps,
        solver_queries: meta.pure_search?.queries ?? null,
        accepted, stop, tool_calls: toolCalls, illegal_folds: illegal,
        folds_made: made.length ? trace.filter(t => t.result?.ok).length : 0,
        creases_built: creaseGeometry(built).length,
        creases_target: creaseGeometry(cp).length,
        feedback: noTools ? "none" : feedback,
        trace,
    };
}

/* ---------- CLI ------------------------------------------------------------------------------- */
const IS_MAIN = process.argv[1] && path.basename(process.argv[1]) === "fold-loop.mjs";
if (IS_MAIN) {
    const argv = process.argv.slice(2);
    const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
    const sample = arg("sample");
    if (!sample) { console.error("usage: node fold-loop.mjs --sample <dir> [--model oracle|claude] " +
                                 "[--feedback text] [--max-steps 16] [--no-tools] [--out r.json]"); process.exit(1); }
    const dir = path.resolve(HERE, "../corpus", sample);
    const which = arg("model", "oracle");
    const model = which === "oracle"
        ? oracleAdapter(path.join(dir, "seq.json"))
        : await claudeAdapter({ effort: arg("effort", "high") });

    const r = await runEpisode({ sampleDir: dir, model, feedback: arg("feedback", "text"),
                                 maxSteps: Number(arg("max-steps", 16)),
                                 noTools: argv.includes("--no-tools") });
    console.log(`${r.sample}  ${r.accepted ? "ACCEPT" : "REJECT"}  (${r.stop})`);
    console.log(`  tool calls ${r.tool_calls}, of which illegal ${r.illegal_folds}` +
                (r.solver_queries ? `   —  exhaustive search needed ${r.solver_queries.toLocaleString()} queries` : ""));
    console.log(`  creases built ${r.creases_built} / ${r.creases_target} in the target`);
    const out = arg("out");
    if (out) { fs.writeFileSync(out, JSON.stringify(r, null, 1)); console.log(`\n-> ${out}`); }
}
