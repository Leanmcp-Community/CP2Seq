// Where a path on the command line is measured from.
//
// Every script here defaulted its corpus directory to "out/release" resolved against the SCRIPT's
// own directory, which is right for the default -- `node verify-exact.mjs` then works from
// anywhere. The bug was applying the same rule to a path the user TYPED: from the repo root,
// `node workspace/corpus/verify-state.mjs workspace/corpus/out/release` resolved to
// workspace/corpus/workspace/corpus/out/release and died on a confusing ENOENT.
//
// The rule, and it needs no existence check to decide: a DEFAULT belongs to the script, so it
// resolves against the script; an ARGUMENT was typed by a person standing somewhere, so it
// resolves against the working directory. Standing in workspace/corpus the two agree, which is
// why this went unnoticed for as long as everything was run from there.
import path from "path";

/**
 * @param {string} here    the calling script's directory (path.dirname(fileURLToPath(import.meta.url)))
 * @param {string|undefined} arg   the path as typed, if any
 * @param {string} fallback  the script-relative default
 */
export function resolvePath(here, arg, fallback) {
    return arg ? path.resolve(process.cwd(), arg) : path.resolve(here, fallback);
}

// The first argument that is a PATH rather than a flag or a flag's value.
//
// /!\ `argv.find(a => !a.startsWith("--"))` IS NOT THAT, and every script here used it. With
// `--limit 2` it returns "2", with `--ulp 8` it returns "8": the value of a flag gets read as the
// corpus directory, and the run dies on ENOENT pointing at a directory named after a number.
// Latent for as long as nobody passed a valued flag without also passing a path.
//
// @param {string[]} argv
// @param {string[]} valueFlags  flags that consume the token after them, e.g. ["--out", "--limit"]
export function positional(argv, valueFlags = []) {
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.startsWith("--")) { if (valueFlags.includes(a)) i++; continue; }
        return a;
    }
    return undefined;
}
