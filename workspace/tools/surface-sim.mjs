// SURFACE SIMULATOR — the tool the VLM calls, one candidate fold at a time.
//
// EXPERIMENTS_SETUP.md §3.1 asks for this and it has been the blocking item: a model proposes a
// fold, the tool either shows it what the paper now looks like, or refuses with a structured
// reason it can act on. Both halves already existed and neither was reachable from a model --
// the legality check lives in workspace/corpus/fold-engine-layers.mjs, and 3D rendering lives in
// the separate Fold Studio repo. This joins the first half to a renderer and gives it a stateless
// call/response shape, which is what a tool-calling loop needs.
//
// ============================================================================================
// /!\ ONE PLACE THIS DIVERGES FROM §3.1, AND IT IS NOT AN OVERSIGHT
// ============================================================================================
// The spec says a candidate fold is illegal "because the paper would have to pass through itself
// (penetrate)". This tool NEVER returns that error, because in the some-layers action space
// penetration is UNREPRESENTABLE: a fold may only move a contiguous run of layers taken from the
// top (folded over) or the bottom (folded under), and such a move cannot drive paper through the
// layers it left behind. Self-intersection is excluded by construction rather than detected by a
// test (fold-engine-layers.mjs header).
//
// So the refusals a model will actually see are different, and they are the ones that matter in
// this action space:
//
//   would-tear            the moving layers are joined to stationary ones off the fold line, so
//                         the sheet would come apart. This is THE constraint of the tier, and it
//                         is decidable only in original-sheet coordinates -- which is why the
//                         engine tracks them.
//   no-crease             the fold moves layers without creasing anything, i.e. it tears them
//                         free of the sheet rather than folding them
//   nothing-to-move       the line misses the selected layers entirely
//   direction-impossible  a run taken from the bottom was asked to fold over, or vice versa
//
// A model that is told "would-tear" can do something with that. A model told "illegal" cannot.
// That is the whole reason the errors are named rather than collapsed to a boolean.
//
// ============================================================================================
// WHAT THIS RETURNS, AND WHAT IT DOES NOT
// ============================================================================================
// Views are SVG, because this repo has no dependencies and rasterising needs one. A VLM API that
// wants PNG must rasterise these -- with a headless browser, or Fold Studio, or a converter. That
// boundary is stated rather than hidden: this file renders, it does not encode images.
//
// The views are TOP-DOWN with X-ray layering, not the "3-4 camera angles" of §3.1. For a flat
// folded state that is not a shortcut: every intermediate state here is flat, so a second camera
// angle shows the same silhouette from a different rotation and adds nothing. What does add
// information is layer structure, so the second view is an exploded stack rather than a rotation.
// If the tier ever admits non-flat intermediate states, this is the part that has to change.
//
//   node surface-sim.mjs --new                          -> a fresh flat-sheet session
//   node surface-sim.mjs --state s.json --fold f.json   -> apply one fold
//   echo '{"state":…,"fold":…}' | node surface-sim.mjs  -> same, over stdin
import fs from "fs";
import { foldLayers, currentPolys, paperArea, layerCount } from "../corpus/fold-engine-layers.mjs";
import { planarize, foldedState } from "../corpus/planarize.mjs";
import { ID, inv, lineOf } from "../probe-c/stage2.mjs";

const SQUARE = [[0, 0], [1, 0], [1, 1], [0, 1]];

/* ---------- state, over the wire -------------------------------------------------------- */
// The loop is stateless: every call carries the whole state back. So the state has to survive a
// JSON round trip exactly -- a transform rebuilt from rounded numbers would drift a little per
// fold, and twenty folds later the paper would be in the wrong place for reasons nobody could
// trace. Numbers go out at full precision, and `inv` is recomputed rather than transmitted.
export const encodeState = (st) => ({
    faces: st.faces.map(f => ({ poly: f.poly, T: f.T, par: f.par })),
    order: st.order,
});
export const decodeState = (s) => ({
    faces: s.faces.map(f => ({ poly: f.poly, T: f.T, inv: inv(f.T), par: f.par })),
    order: s.order,
});

export function newSession(sheet = SQUARE) {
    return { faces: [{ poly: sheet, T: ID, inv: ID, par: 0 }], order: [0] };
}

/* ---------- how a model may state a fold ------------------------------------------------- */
// Three spellings are accepted, because a tool that only takes the one the code happens to use
// makes the model translate, and a translation step is a place to be wrong.
//
//   { through: [[x1,y1],[x2,y2]], moving: [x,y] }   the diagram's phrasing: fold along the line
//                                                   through two points, moving THIS side
//   { normal: [nx,ny], offset: d, movePositive }    the sampler's phrasing
//   { line: { n, d }, movePositive }                the solver's phrasing
//
// `through` + `moving` is the one to prefer in prompts: naming the side that moves cannot be got
// backwards, while `movePositive` silently flips when the two points are written in the other
// order -- a real defect that cost several wrong models in models.mjs.
export function parseFold(f) {
    if (f.through) {
        const [P, Q] = f.through;
        const l = lineOf(P, Q);
        if (!l) return { error: "bad-line", detail: "the two points are the same" };
        if (!f.moving) return { error: "bad-line", detail: "`through` also needs `moving`: a point on the side that moves" };
        const side = l.n[0] * f.moving[0] + l.n[1] * f.moving[1] - l.d;
        if (Math.abs(side) < 1e-9)
            return { error: "bad-line", detail: "`moving` lies on the fold line, so it names no side" };
        return { line: { n: l.n, d: l.d }, movePositive: side > 0 };
    }
    const line = f.line ?? (f.normal ? { n: f.normal, d: f.offset } : null);
    if (!line) return { error: "bad-line", detail: "give `through`+`moving`, or `normal`+`offset`, or `line`" };
    if (f.movePositive === undefined && f.move_positive === undefined)
        return { error: "bad-line", detail: "`movePositive` is required with `normal`/`line`" };
    return { line, movePositive: f.movePositive ?? f.move_positive };
}

const HINTS = {
    "would-tear": "the moving layers are joined to stationary paper away from the fold line. " +
                  "Move the side carrying the FREE edge, or select fewer layers.",
    "no-crease": "this fold creases nothing -- it lifts whole layers off the sheet. " +
                 "Put the line where it crosses the paper you are moving.",
    "nothing-to-move": "the line misses the selected layers. Check the offset against the " +
                       "current silhouette in the view.",
    "direction-impossible": "a run taken from the bottom can only fold UNDER, one from the top " +
                            "only OVER. Swap `over`, or take the run from the other end.",
    "bad-line": "the fold was not stated in a form this tool can read.",
};

/* ---------- one step --------------------------------------------------------------------- */
/**
 * @param st   a decoded state
 * @param f    the candidate fold: a line spelling, plus optional
 *             `selection` ({mode:"all"} | {mode:"top",k} | {mode:"bottom",k}) and `over`
 * @returns { ok: true, state, made, metrics, views } | { ok: false, error, hint, detail }
 */
export function step(st, f) {
    const p = parseFold(f);
    if (p.error) return { ok: false, error: p.error, hint: HINTS[p.error], detail: p.detail };

    const sel = f.selection ?? { mode: "all" };
    // For a partial run the direction is forced by physics, so it is filled in rather than
    // demanded from the caller -- asking a model for a value that has exactly one legal answer
    // just creates a way for it to be wrong.
    const over = sel.mode === "all" ? (f.over ?? true) : (sel.mode === "top");

    const r = foldLayers(st, p.line, p.movePositive, sel, over);
    if (r.error)
        return { ok: false, error: r.error, hint: HINTS[r.error] ?? "",
                 detail: r.between ? `between faces ${r.between.join(" and ")}` : undefined };

    const next = r.state;
    return {
        ok: true,
        state: encodeState(next),
        made: r.made,                       // creases in ORIGINAL sheet coordinates, with M/V
        metrics: {
            layers: layerCount(next), faces: next.faces.length,
            layers_moved: r.moved, creases_made: r.made.length, over: r.over,
            // Paper is conserved by every legal fold. It is reported on every call rather than
            // asserted once, because a drift here is the first sign the state was mangled in
            // transit -- which is the failure mode a stateless tool actually has.
            paper_area: +paperArea(next).toFixed(9),
        },
        views: views(next),
    };
}

/* ---------- views ------------------------------------------------------------------------ */
function bbox(pts, pad = 0.07) {
    let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
    for (const p of pts) { a = Math.min(a, p[0]); b = Math.min(b, p[1]); c = Math.max(c, p[0]); d = Math.max(d, p[1]); }
    const w = c - a || 1, h = d - b || 1, s = Math.max(w, h), m = s * pad;
    return [a - (s - w) / 2 - m, b - (s - h) / 2 - m, s + 2 * m, s + 2 * m];
}
// SVG y grows downward and paper coordinates grow upward; flipping once here keeps every
// downstream coordinate in the paper's own frame.
const flip = (vb) => `<g transform="translate(0,${2 * vb[1] + vb[3]}) scale(1,-1)">`;

// X-RAY, the view §3.1 asks for by name. Each layer is drawn as a translucent polygon in stack
// order, so overlapping paper reads darker -- for n sheets at opacity a the result is
// 1-(1-a)^n, which is the same visual idea Flat-Folder and Fold Studio use. It shows where the
// paper IS and how thick it is, which is what a next fold has to be chosen against.
function xray(st) {
    const polys = currentPolys(st);
    const vb = bbox(polys.flatMap(p => p.poly));
    const sw = vb[2] * 0.004;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(" ")}" width="420" height="420">`;
    s += `<rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="#ffffff"/>` + flip(vb);
    for (const { poly } of polys)
        s += `<polygon points="${poly.map(p => p.join(",")).join(" ")}" fill="#1b4d8f" fill-opacity="0.22" stroke="#1b1d21" stroke-opacity="0.55" stroke-width="${sw}" stroke-linejoin="round"/>`;
    return s + "</g></svg>";
}

// The stack, pulled apart. A top-down view cannot show which layer is where, and the selection a
// partial fold needs ("the top two") is exactly that. Bottom of the stack at the bottom.
function exploded(st) {
    const polys = currentPolys(st);
    const n = polys.length;
    const vb0 = bbox(polys.flatMap(p => p.poly));
    const dy = vb0[3] * 0.34;
    const H = vb0[3] + dy * (n - 1);
    const vb = [vb0[0], vb0[1], vb0[2], H];
    const sw = vb0[2] * 0.005;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(" ")}" width="300" height="${Math.round(300 * H / vb0[2])}">`;
    s += `<rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="#ffffff"/>` + flip(vb);
    polys.forEach(({ poly }, k) => {
        const off = dy * k;
        s += `<g transform="translate(0,${off})">` +
             `<polygon points="${poly.map(p => p.join(",")).join(" ")}" fill="#1b4d8f" fill-opacity="0.18" stroke="#1b1d21" stroke-opacity="0.7" stroke-width="${sw}" stroke-linejoin="round"/></g>`;
    });
    return s + "</g></svg>";
}

// The creases made so far, back in the flat sheet. This is the half of the problem the model is
// actually being scored on -- the target is a crease pattern -- so it should be able to see how
// far the pattern it has built is from the one it was given.
function creasesView(st, made) {
    const vb = bbox(SQUARE);
    const sw = vb[2] * 0.006;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(" ")}" width="300" height="300">`;
    s += `<rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="#ffffff"/>` + flip(vb);
    s += `<polygon points="${SQUARE.map(p => p.join(",")).join(" ")}" fill="none" stroke="#9aa0a6" stroke-width="${sw}"/>`;
    for (const c of made) {
        const col = c.a === "M" ? "#b8402b" : "#2f5fa8";
        const dash = c.a === "V" ? `stroke-dasharray="${sw * 4} ${sw * 3}"` : "";
        s += `<line x1="${c.P[0]}" y1="${c.P[1]}" x2="${c.Q[0]}" y2="${c.Q[1]}" stroke="${col}" stroke-width="${sw * 1.2}" ${dash} stroke-linecap="round"/>`;
    }
    return s + "</g></svg>";
}

export function views(st, madeSoFar = []) {
    return [
        { name: "xray", format: "svg", caption: "top view, overlapping layers darker", content: xray(st) },
        { name: "exploded", format: "svg", caption: "the stack pulled apart, bottom layer first", content: exploded(st) },
        ...(madeSoFar.length
            ? [{ name: "creases", format: "svg", caption: "creases made so far, in the flat sheet", content: creasesView(st, madeSoFar) }]
            : []),
    ];
}

/* ---------- the crease pattern built so far, as FOLD ------------------------------------- */
// For the end of an episode: the model says "done", and this is what gets compared to the target.
export function creasePattern(madeSoFar, sheet = SQUARE) {
    const segs = [
        ...sheet.map((p, i) => ({ P: p, Q: sheet[(i + 1) % sheet.length], assignment: "B" })),
        ...madeSoFar.map(c => ({ P: c.P, Q: c.Q, assignment: c.a })),
    ];
    return planarize(segs).fold;
}
export const foldedForm = (st) => foldedState(currentPolys(st));

/* ---------- CLI --------------------------------------------------------------------------- */
const IS_MAIN = process.argv[1] && process.argv[1].endsWith("surface-sim.mjs");
if (IS_MAIN) {
    const argv = process.argv.slice(2);
    const arg = (k) => { const i = argv.indexOf(`--${k}`); return i < 0 ? null : argv[i + 1]; };
    const readJSON = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

    if (argv.includes("--new")) {
        const st = newSession();
        process.stdout.write(JSON.stringify(
            { ok: true, state: encodeState(st), metrics: { layers: 1, faces: 1, paper_area: 1 },
              views: views(st) }, null, 1));
    } else {
        let payload;
        if (arg("state") && arg("fold")) payload = { state: readJSON(arg("state")), fold: readJSON(arg("fold")) };
        else payload = JSON.parse(fs.readFileSync(0, "utf8"));
        if (!payload.state || !payload.fold) {
            process.stderr.write("need {state, fold} — or --new for a fresh sheet\n");
            process.exit(1);
        }
        process.stdout.write(JSON.stringify(step(decodeState(payload.state), payload.fold), null, 1));
    }
}
