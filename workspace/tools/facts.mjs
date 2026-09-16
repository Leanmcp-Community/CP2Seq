// Recompute every number the write-up is allowed to quote, straight from the probe outputs.
//
// The problem this solves: a result gets copied by hand into six markdown files, one of them
// is missed on the next revision, and now the repo states two different numbers with equal
// confidence. That has happened here more than once.
//
// So: numbers live HERE, derived from the artefacts the probes actually wrote. Docs cite them
// by key with an invisible tag, and doccheck.mjs verifies every citation. A number nobody can
// derive is marked `manual` and carries its source, so at least it is auditable.
//
//   node workspace/tools/facts.mjs        refresh notes/facts.json
import fs from "fs"; import path from "path";

const R = path.join(path.dirname(new URL(import.meta.url).pathname), "../..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(R, p), "utf8"));
const pct = (n, d) => +(100 * n / d).toFixed(1);

const v = read("workspace/probe-c/stage1-verdicts.json");
const s2 = read("workspace/probe-c/stage2-results.json");
// A corpus run is gitignored (95 MB, rebuilds from its seed), so the numbers come from the
// small summary that is committed alongside it -- `node workspace/corpus/summarize.mjs`.
const cs = read("workspace/corpus/corpus-summary.json");
// Whether PurelandFold is inside the frozen action space at all. It was assumed to be, and
// called the reality anchor, for a month before anyone ran the check.
const ac = read("workspace/corpus/anchor-check.json");

const total = v.length;
const screenFail = v.filter(x => x.stage1 === "NOT_FOLDABLE_SCREEN").length;
const preCrease  = v.filter(x => x.stage1 === "NOT_FOLDABLE_PRECREASE").length;
const inPlay     = v.filter(x => x.stage1 === "IN_PLAY").length;
const st = (k) => s2.filter(r => r.status === k).length;
const exhausted = st("EXHAUSTED"), timeout = st("TIMEOUT"), solved = st("SOLVED");
const provenNot = screenFail + preCrease + exhausted;

const facts = {
  _generated: new Date().toISOString().slice(0, 10),
  _how: "node workspace/tools/facts.mjs — derived from workspace/probe-c/*.json",

  "corpus.instagram.total":        { v: total,  src: "derived" },
  "probeC.screenFail":             { v: screenFail, src: "derived" },
  "probeC.screenFailPct":          { v: pct(screenFail, total), unit: "%", src: "derived" },
  "probeC.passScreen":             { v: total - screenFail, src: "derived" },
  "probeC.passScreenPct":          { v: pct(total - screenFail, total), unit: "%", src: "derived" },
  "probeC.preCrease":              { v: preCrease, src: "derived" },
  "probeC.preCreasePct":           { v: pct(preCrease, total), unit: "%", src: "derived" },
  "probeC.inPlay":                 { v: inPlay, src: "derived" },
  "probeC.exhausted":              { v: exhausted, src: "derived" },
  "probeC.exhaustedPct":           { v: pct(exhausted, total), unit: "%", src: "derived" },
  "probeC.timeout":                { v: timeout, src: "derived" },
  "probeC.timeoutPct":             { v: pct(timeout, total), unit: "%", src: "derived" },
  "probeC.solved":                 { v: solved, src: "derived" },
  "probeC.solvedPct":              { v: pct(solved, total), unit: "%", src: "derived" },
  "probeC.provenNot":              { v: provenNot, src: "derived" },
  "probeC.provenNotPct":           { v: pct(provenNot, total), unit: "%", src: "derived" },
  "probeC.stage1Ceiling":          { v: total - screenFail - preCrease, src: "derived: the ceiling after stage 1 only, kept so each layer stays traceable" },
  "probeC.stage1CeilingPct":       { v: pct(total - screenFail - preCrease, total), unit: "%", src: "derived" },
  "probeC.ceiling":                { v: solved + timeout, src: "derived" },
  "probeC.ceilingPct":             { v: pct(solved + timeout, total), unit: "%", src: "derived" },

  "corpus.synth.run":              { v: cs.run, src: "derived" },
  "corpus.synth.samples":          { v: cs.samples, src: "derived" },
  "corpus.synth.quota":            { v: cs.quota_total, src: "derived" },
  "corpus.synth.cellsFilled":      { v: cs.cells_filled, src: "derived" },
  "corpus.synth.cellsTotal":       { v: cs.cells_total, src: "derived" },
  "corpus.synth.uniqueCPs":        { v: cs.unique_cp_hashes, src: "derived" },
  "corpus.synth.stepMin":          { v: cs.steps.min, src: "derived" },
  "corpus.synth.stepMax":          { v: cs.steps.max, src: "derived" },
  // one decimal, because this figure only ever appears beside PurelandFold's 0.7
  "corpus.synth.couplingP50":      { v: +cs.coupling_mean.p50.toFixed(1), src: "derived: mean creases per fold, per sample, median over the corpus" },
  "corpus.synth.couplingMax":      { v: cs.coupling_max.max, src: "derived" },
  "corpus.synth.creaseP50":        { v: cs.crease_edges.p50, src: "derived" },
  "corpus.synth.degeneratePct":    { v: pct(cs.degenerate, cs.samples), unit: "%", src: "derived: recorded, never filtered" },
  "corpus.synth.lLocalHits":       { v: (cs.cells.find(c => c.name === "l-local") || {}).n ?? 0, src: "derived: the long/low-coupling cell" },

  // Run the all-layers solver over each real model's final CP. EXHAUSTED on a model a person
  // demonstrably folded means their sequence is not expressible in our action space.
  "anchor.total":                  { v: ac.length, src: "derived: check-anchor.mjs" },
  "anchor.exhausted":              { v: ac.filter(r => r.status === "EXHAUSTED").length, src: "derived" },
  "anchor.exhaustedPct":           { v: pct(ac.filter(r => r.status === "EXHAUSTED").length, ac.length), unit: "%", src: "derived" },
  "anchor.solved":                 { v: ac.filter(r => r.status === "SOLVED").length, src: "derived" },
  "anchor.timeout":                { v: ac.filter(r => r.status === "TIMEOUT").length, src: "derived" },
  // the subset where pre-creasing cannot be the explanation, so only the layer rule is left
  "anchor.noF":                    { v: ac.filter(r => r.F === 0).length, src: "derived: models with no F edge at all" },
  "anchor.noFExhausted":           { v: ac.filter(r => r.F === 0 && r.status === "EXHAUSTED").length, src: "derived" },

  "purelandfold.sequences":        { v: 27,  src: "manual: HF dataset mayaweiz/PurelandFold" },
  "purelandfold.frames":           { v: 337, src: "manual: same" },
  "purelandfold.skippedRows":      { v: 74,  src: "manual: variables=0 rows; 27 are step-1, the rest are pre-crease steps" },
  // Answered 2026-09-16 by workspace/data/export_purelandfold_models.py. Kept `manual` because
  // its output (workspace/purelandfold/models/) is a gitignored re-export of the HF dataset,
  // so there is nothing committed to derive from -- but the script reprints every number here.
  "purelandfold.precreaseFrames":  { v: 47,  src: "manual: export_purelandfold_models.py — variables=0 past step 1" },
  "purelandfold.effStepMin":       { v: 4,   src: "manual: same — pre-crease frames merged into the step they precede" },
  "purelandfold.effStepMax":       { v: 19,  src: "manual: same" },
  "purelandfold.effTertileLo":     { v: 10,  src: "manual: same — the synthetic step strata are cut here" },
  "purelandfold.effTertileHi":     { v: 13,  src: "manual: same" },

  // Retired values. Any of these appearing in a doc WITHOUT a fact tag is flagged: it is
  // probably a number that was right last month. Tagging it with its real key clears the flag,
  // which makes "I meant this one" an explicit act rather than an assumption.
  _retired: [
    { value: "65.8%", was: "the foldability ceiling before stage 2", now: "probeC.ceilingPct (10.7%); 65.8% is only the screen pass rate" },
    { value: "34.2%", was: "the headline 'proven not foldable'",     now: "probeC.provenNotPct (89.3%); 34.2% is only the screen's share" },
    { value: "40.2%", was: "proven-not-foldable mid-revision",       now: "probeC.provenNotPct" },
    { value: "46.7%", was: "proven-not-foldable mid-revision",       now: "probeC.provenNotPct" },
    { value: "59.8%", was: "a ceiling mid-revision",                 now: "probeC.ceilingPct" },
    { value: "53.3%", was: "a ceiling mid-revision",                 now: "probeC.ceilingPct" },
  ],
};

fs.writeFileSync(path.join(R, "notes/facts.json"), JSON.stringify(facts, null, 1) + "\n");
const n = Object.keys(facts).filter(k => !k.startsWith("_")).length;
console.log(`notes/facts.json: ${n} facts`);
console.log(`  proven not foldable ${provenNot}/${total} = ${pct(provenNot, total)}%   ceiling ${pct(solved + timeout, total)}%   confirmed ${pct(solved, total)}%`);
