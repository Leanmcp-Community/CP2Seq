// Catch the four ways this repo's docs go wrong, before a reader does.
//
//   node workspace/tools/doccheck.mjs          report
//   node workspace/tools/doccheck.mjs --fix    rewrite tagged numbers to match facts.json
//
// 1. STALE CITATION  a number tagged `89.3%<!--fact:probeC.provenNotPct-->` that no longer
//    matches notes/facts.json. --fix rewrites it. This is the one that kept biting.
// 2. RETIRED NUMBER  an old value ("65.8%") sitting untagged in prose. Tagging it with its
//    real key clears the flag, so "yes, I mean the screen pass rate" becomes an explicit act.
// 3. BROKEN LINK     a path that moved when notes/ was reorganised.
// 4. UNOWNED FILE    a planning doc with no "Owns" line, i.e. no stated scope -- which is how
//    two files start describing the same thing.
import fs from "fs"; import path from "path";

const R = path.join(path.dirname(new URL(import.meta.url).pathname), "../..");
const facts = JSON.parse(fs.readFileSync(path.join(R, "notes/facts.json"), "utf8"));
const FIX = process.argv.includes("--fix");

const docs = [];
(function walk(d) {
    for (const e of fs.readdirSync(path.join(R, d), { withFileTypes: true })) {
        const p = d ? `${d}/${e.name}` : e.name;
        if (e.isDirectory()) { if (!/^(\.git|node_modules|Sim-FAST-PY|workspace)$/.test(e.name)) walk(p); }
        else if (e.name.endsWith(".md")) docs.push(p);
    }
})("");

// planning docs must declare what they own; probe results and reading notes need not
const MUST_DECLARE = [
    "EXPERIMENTS_SETUP.md", "DATASET.md", "BASELINE_REPRODUCTION.md",
    "notes/plan/experiment-spec-checklist.md", "notes/plan/research-workflow.md",
];

const val = (k) => { const f = facts[k]; return f === undefined ? null : `${f.v}${f.unit ?? ""}`; };
let stale = 0, retired = 0, broken = 0, unowned = 0, cited = 0, fixed = 0;

for (const d of docs) {
    const full = path.join(R, d);
    let s = fs.readFileSync(full, "utf8");
    const before = s;
    const say = (kind, msg) => console.log(`  ${kind.padEnd(9)} ${d}: ${msg}`);

    // 1 — tagged citations
    // the value may be wrapped in markdown emphasis before the tag: **89.3%**<!--fact:...-->
    s = s.replace(/([0-9][0-9.,]*%?)([*_\s]*)<!--\s*fact:([A-Za-z0-9_.]+)\s*-->/g, (m, got, sp, key) => {
        cited++;
        const want = val(key);
        if (want === null) { say("NO-SUCH", `fact:${key} is not in facts.json`); stale++; return m; }
        if (got === want) return m;
        if (FIX) { fixed++; return `${want}${sp}<!--fact:${key}-->`; }
        say("STALE", `${got} tagged fact:${key}, but facts.json says ${want}`);
        stale++;
        return m;
    });

    // 2 — retired values sitting untagged
    const tagged = new Set([...s.matchAll(/([0-9][0-9.,]*%?)\s*<!--\s*fact:/g)].map(m => m.index));
    for (const r of facts._retired ?? []) {
        for (const m of s.matchAll(new RegExp(r.value.replace(".", "\\."), "g"))) {
            const after = s.slice(m.index + r.value.length, m.index + r.value.length + 14);
            if (/^[*_\s]*<!--\s*fact:/.test(after)) continue;     // explicitly acknowledged
            say("RETIRED", `"${r.value}" (${r.was}) — now ${r.now}`);
            retired++;
        }
    }

    // 3 — links
    const dir = path.dirname(d);
    for (const m of s.matchAll(/`((?:\.\.\/|notes\/|workspace\/)[A-Za-z0-9._/-]+\.[a-z]{2,4})`/g)) {
        const rel = m[1].startsWith("..") ? path.join(dir, m[1]) : m[1];
        if (!fs.existsSync(path.join(R, rel))) { say("BROKEN", m[1]); broken++; }
    }

    // 4 — ownership
    if (MUST_DECLARE.includes(d) && !/\*\*(Owns|只负责|owns)\b|\| Owns \||只负责/.test(s)) {
        say("UNOWNED", "no scope line — say what this file owns, and what it does not");
        unowned++;
    }

    if (FIX && s !== before) fs.writeFileSync(full, s);
}

console.log(`\n${docs.length} docs, ${cited} tagged citations`);
const bad = stale + retired + broken + unowned;
if (FIX) console.log(`${fixed} citations rewritten`);
console.log(bad === 0 ? "clean" : `${stale} stale · ${retired} retired · ${broken} broken links · ${unowned} unowned`);
process.exit(bad && !FIX ? 1 : 0);
