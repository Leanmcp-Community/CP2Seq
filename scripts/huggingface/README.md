---
pretty_name: CP2Seq
tags:
  - origami
  - geometry
  - spatial-reasoning
  - synthetic
---

# CP2Seq

Synthetic origami crease patterns and reference folding sequences from
**[Leanmcp.com](https://leanmcp.com)**.

Authors: **Dheeraj Mohandas Pai and Lu Xian**.

Paper: *Origami as a Spatial and Geometric Reasoning Benchmark*.
Code, environment, and evaluation tools:
[Leanmcp-Community/CP2Seq](https://github.com/Leanmcp-Community/CP2Seq).

## Files

`data/` preserves the contents and relative paths of
`workspace/corpus/out/release/` in the source repository.
The release contains 600 samples across five batches:

| Batch | Samples |
| --- | ---: |
| all-layers | 400 |
| some-generated-d5 | 50 |
| some-generated-d6 | 50 |
| some-verified-d3 | 50 |
| some-verified-d4 | 50 |

Each sample directory contains `cp.fold`, `steps.fold`, `seq.json`, and
`meta.json`. The root `manifest.json` and `index.json` describe the release;
the check JSON files contain previously saved verification results.
The `verified` batch names refer to bounded search checks, not separate
training or test partitions. Reference sequences are not necessarily shortest.

This is a file-based geometry dataset, not a single tabular JSON dataset.
Download the original files with:

```sh
hf download leanmcp/cp2seq --repo-type dataset --local-dir cp2seq
```

To use tools that expect the original repository layout, place the contents
of `cp2seq/data/` under `workspace/corpus/out/release/` in the code checkout.
