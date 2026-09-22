# GCP GPU capacity for this project

Project `meta-chalice-499205-b0`, region `us-central1`. Decoded from
`gcloud compute regions describe us-central1`, 2026-09-21. The raw output prints metric names
and limits as two parallel arrays, so the pairs below come from matching them by position.

## Quota granted

| GPU | on-demand | preemptible / spot | CUD ceiling | in use |
| --- | --- | --- | --- | --- |
| **L4** | **32** | **32** | 8 | 0 |
| A100 80GB | 8 | 8 | 0 | 0 |
| A100 40GB | 1 | 16 | 0 | 0 |
| T4 | 4 | 4 | 0 | 0 |
| T4 vWS | 2 | 2 | — | 0 |
| V100 | 1 | 1 | 0 | 0 |
| P100 | 1 | 1 | 0 | 0 |
| P100 vWS | 1 | 1 | — | 0 |
| P4 | 1 | 1 | 0 | 0 |
| P4 vWS | 1 | 1 | — | 0 |
| K80 | 8 | 1 | 0 | 0 |

Every column is a **quota ceiling, not a holding**. "CUD ceiling" is how many of that GPU this
project is permitted to put under a Committed Use Discount -- a 1 or 3 year contract billed
whether or not the capacity runs. Nothing is committed: usage is 0 on every one of those
metrics, and `COMMITMENTS` itself has limit 0, so no commitment can even be created in this
region without an increase. Everything here would be plain on-demand or spot.

**No quota at all** for H100, H200, B200, GB200 or RTX PRO 6000 — those metrics are absent from
the region's quota list, which means zero until a quota increase is approved. The accelerator
types are offered in the region (see below); being offered and being grantable are different
things.

Supporting CPU quota: `A2_CPUS` 200, `C2_CPUS` 100, `N2_CPUS` 200, `CPUS` 200, `PREEMPTIBLE_CPUS`
128. There is no `A3_CPUS` line, which is the other reason H100 is not reachable today.

Nothing is currently running: every GPU usage figure is 0, and total `INSTANCES` usage is 6.

## Offered in us-central1, by zone

| GPU | a | b | c | f |
| --- | --- | --- | --- | --- |
| L4 / L4 vWS | yes | yes | yes | — |
| T4 / T4 vWS | yes | yes | yes | yes |
| V100 | yes | yes | yes | yes |
| A100 40GB | yes | yes | yes | yes |
| A100 80GB | yes | — | yes | — |
| H100 80GB / MEGA | yes | yes | yes | — |
| H200 141GB | — | yes | — | — |
| B200 180GB | — | yes | — | — |
| GB200 192GB | yes | yes | — | — |
| RTX PRO 6000 (+vWS) | — | yes | yes | yes |
| P100 / P4 (+vWS) | P4 only | — | both | both |

So the earlier claim that GCP carries only datacenter parts was wrong on two counts: the **vWS**
variants (same silicon, NVIDIA RTX Virtual Workstation licence bundled, billed on top) and
**RTX PRO 6000**, a professional Blackwell card. What remains true is that no GeForce part is
offered — an RTX 4090 cannot be rented here, because NVIDIA's EULA excludes GeForce from
datacenter deployment. Professional RTX cards are not excluded, which is why PRO 6000 appears.

## Rough on-demand price, per GPU-hour, us-central1

| GPU | ~$/hr |
| --- | --- |
| T4 | 0.54 |
| L4 | 0.70 |
| A100 40GB | 3.67 |
| A100 80GB | 5.03 |
| H100 80GB | 10.98 |

Spot runs 60-91% cheaper, and the Dynamic Workload Scheduler queues batch work for reduced-rate
capacity without spot's eviction risk. Treat these as orders of magnitude; they move by region
and over time, and the vWS licence is an extra per-GPU charge on top.

## What an L4 would do for the fold search: nothing

Worth being blunt, because the quota is there and the temptation is obvious.

The search spends its time in `enumerateLegalFolds` — polygon clipping, an O(faces²) tearing
check, and interval tests against the CP. That is branchy scalar float work on small ragged
arrays. It runs on CUDA cores, badly, because divergent lanes idle; the Tensor Cores that make
an L4 worth renting would sit completely unused. There is no matmul anywhere in `tryFold`.

Measured on the 8-core laptop: 18 nodes/second for BFS, 2.6 for A*, with per-node cost rising
from ~360 candidate evaluations on a 6-layer stack to ~5,900 on a 40-layer one.

### What would actually speed it up

**More CPU cores.** The search parallelises perfectly across samples and the harness already
shards that way, capped at 8 workers by the laptop. A `c3-standard-88` is 88 vCPUs — roughly
11x the parallel throughput — and costs a few dollars an hour, less on spot. That is the single
biggest available win and needs no code change beyond `WORKERS`.

**Then the hot spots**, which are algorithmic rather than hardware:
- `parseAction(JSON.stringify(action))` runs on every `tryFold`, a full serialise-and-validate
  round trip per candidate.
- `collinearEdges` scans every CP edge per created crease: fine at easy's 23 edges, brutal at
  hard's 5,468. Bucketing edges by canonical line key makes it a hash lookup.
- The tearing check recomputes face adjacency per candidate when it only changes per state.

Note the CPU quota above caps this: `CPUS` 200 and `PREEMPTIBLE_CPUS` 128 in this region, so a
single 88-vCPU machine fits but a fleet of them does not without an increase.

### Where a GPU does belong

Training a learned heuristic to order the search frontier. A network is matmul, so the Tensor
Cores finally do something, and the verifier stays the single JS implementation that both the
models and the search are judged by. That workload is small and latency-bound, so the L4 quota
of 32 is ample and nothing larger is needed.
