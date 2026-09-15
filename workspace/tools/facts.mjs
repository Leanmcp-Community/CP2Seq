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

  "purelandfold.sequences":        { v: 27,  src: "manual: HF dataset mayaweiz/PurelandFold" },
  "purelandfold.frames":           { v: 337, src: "manual: same" },
  "purelandfold.skippedRows":      { v: 74,  src: "manual: variables=0 rows, still unexplained" },

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
