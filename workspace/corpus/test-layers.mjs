// Tests for the some-layers engine.
//
// The tearing rule is the whole reason this engine exists, so the tests are built around a
// pair that differs ONLY in which side of the line moves. Same paper, same line, same selected
// layer: one direction is an ordinary fold, the other would rip the sheet. If the engine gets
// that pair right it has understood the constraint; if it accepts both, it is the old engine
// wearing a costume.
import { initSheet, foldLayers, layerCount, paperArea } from "./fold-engine-layers.mjs";

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
    if (cond) { pass++; console.log(`  ok    ${name}`); }
    else { fail++; console.log(`  FAIL  ${name}${detail ? "   " + detail : ""}`); }
};

const V = (x) => ({ n: [1, 0], d: x });          // vertical line x = c
const H = (y) => ({ n: [0, 1], d: y });          // horizontal line y = c

console.log("all-layers still behaves like the core engine");
{
    let st = initSheet();
    const r = foldLayers(st, V(0.5), true, { mode: "all" });
    check("halving the square gives 2 layers", !r.error && layerCount(r.state) === 2,
          r.error || `got ${r.error ? "-" : layerCount(r.state)}`);
    check("one crease is made", !r.error && r.made.length === 1);
    check("paper is conserved", !r.error && Math.abs(paperArea(r.state) - 1) < 1e-9,
          r.error || `area ${paperArea(r.state)}`);
}

console.log("\nfolding only the top layer");
let halved = null;
{
    const r0 = foldLayers(initSheet(), V(0.5), true, { mode: "all" });
    halved = r0.state;                                   // 2 layers over x in [0, 0.5]

    // the free edge side: the moving part touches the other layer nowhere
    const ok = foldLayers(halved, V(0.25), false, { mode: "top", k: 1 });
    check("top layer alone can be folded at its free end", !ok.error, ok.error || "");
    check("that makes 3 layers", !ok.error && layerCount(ok.state) === 3,
          ok.error || `got ${ok.error ? "-" : layerCount(ok.state)}`);
    check("paper is still conserved", !ok.error && Math.abs(paperArea(ok.state) - 1) < 1e-9);
    check("exactly one new crease", !ok.error && ok.made.length === 1);

    // THE SAME LINE, THE OTHER SIDE. Now the moving part carries the spine at x = 0.5, where
    // the top layer is joined to the layer below. Moving it would tear the sheet there.
    const bad = foldLayers(halved, V(0.25), true, { mode: "top", k: 1 });
    check("the same fold the other way is refused as a tear",
          bad.error === "would-tear", `got ${bad.error ?? "accepted"}`);
}

console.log("\nselection bounds");
{
    const none = foldLayers(halved, V(0.25), false, { mode: "top", k: 0 });
    check("selecting zero layers is refused", none.error === "nothing-to-move",
          `got ${none.error ?? "accepted"}`);

    // Not "the line misses the paper" -- it puts ALL the paper on the moving side, so the top
    // layer would travel without being creased anywhere, i.e. be torn free of the sheet.
    const whole = foldLayers(halved, V(0.9), false, { mode: "top", k: 1 });
    check("moving a whole layer with no crease is refused", whole.error === "no-crease",
          `got ${whole.error ?? "accepted"}`);

    const both = foldLayers(halved, V(0.25), false, { mode: "top", k: 2 });
    check("selecting both layers folds both", !both.error && layerCount(both.state) === 4,
          both.error || `got ${both.error ? "-" : layerCount(both.state)}`);
}

console.log("\nthe shape all-layers folding cannot make: an asymmetric one");
{
    // Halve, then turn ONE layer's free corner in. The result is asymmetric -- the two layers
    // no longer have the same outline -- which is exactly what all-layers folding can never
    // do, and why every sample in the core corpus looks like a grid.
    //
    // The corner has to be at a FREE edge. Anything whose moving part reaches the spine is
    // attached to the layer below and tears, which the engine refuses and real paper does too.
    const r0 = foldLayers(initSheet(), V(0.5), true, { mode: "all" });   // spine at x = 0.5
    const r1 = foldLayers(r0.state, { n: [1, 1], d: 0.3 }, false, { mode: "top", k: 1 });
    check("a one-layer corner fold succeeds", !r1.error, r1.error || "");
    if (!r1.error) {
        const polys = r1.state.order.map(i => r1.state.faces[i]);
        const widths = polys.map(f => {
            const xs = f.poly.map(p => p[0]);
            return +(Math.max(...xs) - Math.min(...xs)).toFixed(3);
        });
        check("the layers now have different outlines", new Set(widths).size > 1,
              `widths ${widths.join(", ")}`);
    }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
