#!/usr/bin/env bash
#
# gen_figures.sh - draft the paper's figures with the imagegen CLI.
#
#   ./paper/figures/gen_figures.sh --dry-run        # print payloads, no API call, no key needed
#   ./paper/figures/gen_figures.sh                  # generate every AI-suitable figure
#   ./paper/figures/gen_figures.sh 1 4              # generate only figures 1 and 4
#   ./paper/figures/gen_figures.sh --quality high 1 # final-quality pass on one figure
#   ./paper/figures/gen_figures.sh --list           # show what each figure is and how to make it
#
# WHAT THIS IS FOR
#   Rough compositional drafts to trace over in Excalidraw. Nothing this produces
#   goes into the paper as-is. A diffusion model cannot draw an accurate crease
#   pattern, a correct fold line, or a chart with real numbers on it, and the
#   imagegen skill says as much: diagrams are "better produced directly in SVG,
#   HTML/CSS, or canvas". These drafts are for layout and composition only.
#
#   Figures 1 and 4 are conceptual and draft usefully this way.
#   Figures 2 and 5 should start from REAL renders that already exist in this repo
#     (see --list); an invented crease pattern would be a fabricated figure.
#   Figures 3 and 6 are data plots and must be plotted from the corpus and the
#     aggregation output, never generated.
#
# Requires OPENAI_API_KEY and network for real runs. --dry-run needs neither.

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="$REPO/paper/figures/generated"

# The skill ships the CLI under CODEX_HOME; both known install roots are checked.
: "${CODEX_HOME:=$HOME/.codex}"
IMAGE_GEN=""
for c in "$CODEX_HOME/skills/.system/imagegen/scripts/image_gen.py" \
         "$HOME/.claude/skills/.system/imagegen/scripts/image_gen.py"; do
  [[ -f "$c" ]] && { IMAGE_GEN="$c"; break; }
done

QUALITY="low"          # low is right for tracing drafts; high wastes time and money here
SIZE="1536x1024"       # landscape, matches a two-column figure slot
DRY=0
FIGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY=1; shift ;;
    --quality) QUALITY="$2"; shift 2 ;;
    --size)    SIZE="$2"; shift 2 ;;
    --list)    LIST=1; shift ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    [1-6])     FIGS+=("$1"); shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

# ---------------------------------------------------------------- figure briefs
# Each prompt is condensed from paper/figures/figureN.md. Prompts say "diagram",
# "flat vector", "no photorealism" on purpose: the goal is traceable line art.

STYLE="Flat 2D technical diagram, clean vector line-art style, plain white background, \
thin black strokes, one muted accent colour, generous white space, no photorealism, \
no 3D rendering, no shadows, no gradients, no decorative flourish. \
Academic paper figure. Labels in a plain sans-serif font, short and legible."

prompt_for() {
  case "$1" in
    1) echo "$STYLE A left-to-right diagram contrasting two directions of the same task. \
On the left, a plain flat square sheet of paper. On the right, the same square covered in a web of \
crease lines. A wide arrow runs left to right along the top labelled 'generation: one forward pass', \
with four small thumbnails along it showing a paper stack getting thicker. A second arrow runs right \
to left along the bottom labelled 'recovery: NP-hard', drawn not as a single arrow but as a tree of \
branching paths fanning backwards from the crease pattern, where most branches continue and a few end \
in small cross marks, and exactly one highlighted path reaches the flat square. The top arrow should \
look simple and mechanical; the bottom should look expensive and wide. Do not make most branches dead \
ends." ;;
    2) echo "$STYLE A three-panel figure with a labelled divider. Left panel titled INPUT: a square \
crease pattern diagram of straight lines, some solid and some dashed. Centre panel titled INPUT: two \
stacked schematic views of a folded flat paper object, one seen from directly above as overlapping \
translucent outlines, one drawn as an exploded stack of separated flat layers with gaps between them. \
Right panel titled WITHHELD: a horizontal filmstrip of four small square diagrams in sequence, each \
showing a fold line across a shape. A bold dashed vertical divider separates the centre and right \
panels, labelled 'withheld'. LAYOUT MOCKUP ONLY: the geometry is a placeholder to be replaced with \
real renders." ;;
    3) echo "$STYLE A two-dimensional grid heatmap. Horizontal axis labelled 'fold depth', vertical \
axis labelled 'coupling'. Roughly five by four rectangular cells, each shaded a different intensity of \
a single colour and containing a small number. One corner cell, at high depth and low coupling, is \
left blank with diagonal hatching instead of shading, clearly different from the pale cells, with a \
small callout arrow pointing at it labelled 'unreachable without pre-creasing'. LAYOUT MOCKUP ONLY: \
the real cell counts come from the corpus." ;;
    4) echo "$STYLE A left-to-right pipeline diagram of an evaluation loop. On the far left, two \
stacked input boxes labelled 'crease pattern' and 'final folded state'. In the centre, a cycle of two \
large boxes: one labelled 'model proposes a fold', one SINGLE box labelled with both words \
'environment / verifier' on two lines inside the same rectangle. From the environment box two arrows \
leave: one labelled 'new state + views' continuing forward, one labelled 'named refusal' curving back \
to the model box. On the far right, a box labelled 'replay + compare'. A dashed rounded enclosure sits \
below and outside the cycle containing a box labelled 'reference sequence', connected by a single line \
only to the right-hand replay box and never to the cycle, with the enclosure labelled 'withheld during \
the episode'. Critical: environment and verifier must be ONE rectangle, not two." ;;
    5) echo "$STYLE A side-by-side comparison of two nearly identical diagrams. Both show the same \
small square paper stack of two flat layers with a vertical crease down the middle. On the left, a \
horizontal dashed line crosses the top layer, a short bold highlighted segment is marked on the \
vertical middle crease away from that line, and a label reads 'would-tear' with a cross mark. On the \
right, the same stack with a vertical dashed line, the highlighted segment now lying exactly along \
that line, and a label reads 'accepted' with a tick. A caption strip between them reads 'same state, \
same layers, opposite verdicts'. LAYOUT MOCKUP ONLY: replace with a real harness render." ;;
    6) echo "$STYLE A simple line chart. Horizontal axis with three labelled ticks reading 'easy', \
'mid', 'hard'. Vertical axis labelled 'solve rate' from 0 to 100 percent. Four thin solid lines with \
small round markers descending left to right, plus one clearly distinct DASHED line in a different \
weight labelled directly on the plot as 'deterministic search baseline'. Small numbers printed beside \
each marker. Plain legend. LAYOUT MOCKUP ONLY: contains no real data and must be replotted from the \
aggregation output." ;;
  esac
}

label_for() {
  case "$1" in
    1) echo "the asymmetry (AI draft is useful)" ;;
    2) echo "one dataset sample (USE REAL RENDERS)" ;;
    3) echo "difficulty grid (PLOT FROM CORPUS)" ;;
    4) echo "evaluation pipeline (AI draft is useful)" ;;
    5) echo "a refusal (USE REAL RENDERS)" ;;
    6) echo "main result (PLOT FROM AGGREGATION)" ;;
  esac
}

if [[ "${LIST:-0}" == "1" ]]; then
  cat <<'EOF'
Figure  What it is                     How it should actually be made
------  -----------------------------  ----------------------------------------------------------
  1     The asymmetry                  AI draft, then trace in Excalidraw. Conceptual, no real data.
  2     One dataset sample             REAL RENDERS. Every sample already has them, e.g.
                                         CODEX_HARNESS_TESTING/runs/<run>/easy-0001/initial/cp.png
                                         CODEX_HARNESS_TESTING/runs/<run>/easy-0001/final/top.png
                                         CODEX_HARNESS_TESTING/runs/<run>/easy-0001/final/exploded.png
                                       Compose those; an invented crease pattern would be fabricated.
  3     Difficulty grid                PLOT from workspace/corpus/out/release/manifest.json.
  4     Evaluation pipeline            AI draft, then trace in Excalidraw. Conceptual, no real data.
  5     A refusal                      REAL RENDERS of the two-fold tearing pair, plus the actual
                                       refusal string the environment emits.
  6     Main result per stratum        PLOT from workspace/RESULTS/results.json. Never generated.

AI drafts are for composition only. Figures 2, 3, 5 and 6 carry data or geometry and
must not ship as generated images.
EOF
  exit 0
fi

[[ ${#FIGS[@]} -eq 0 ]] && FIGS=(1 2 3 4 5 6)

if [[ -z "$IMAGE_GEN" ]]; then
  echo "ERROR: imagegen CLI not found. Looked in:" >&2
  echo "  \$CODEX_HOME/skills/.system/imagegen/scripts/image_gen.py  (CODEX_HOME=$CODEX_HOME)" >&2
  echo "  ~/.claude/skills/.system/imagegen/scripts/image_gen.py" >&2
  exit 1
fi

if [[ "$DRY" == "0" && -z "${OPENAI_API_KEY:-}" ]]; then
  echo "ERROR: OPENAI_API_KEY is not set. Export it, or re-run with --dry-run." >&2
  exit 1
fi

mkdir -p "$OUT"
echo "CLI:     $IMAGE_GEN"
echo "Out:     $OUT"
echo "Quality: $QUALITY   Size: $SIZE   Figures: ${FIGS[*]}"
echo

rc=0
for n in "${FIGS[@]}"; do
  dest="$OUT/figure${n}-draft.png"
  # Never clobber a draft you may already have traced from.
  if [[ -e "$dest" ]]; then
    i=2; while [[ -e "$OUT/figure${n}-draft-v${i}.png" ]]; do i=$((i+1)); done
    dest="$OUT/figure${n}-draft-v${i}.png"
  fi
  echo "==> figure $n: $(label_for "$n")"
  args=(generate --prompt "$(prompt_for "$n")" --size "$SIZE" --quality "$QUALITY" --out "$dest")
  [[ "$DRY" == "1" ]] && args+=(--dry-run)
  if python3 "$IMAGE_GEN" "${args[@]}"; then
    echo "    -> $dest"
  else
    echo "    FAILED on figure $n" >&2
    rc=1
  fi
  echo
done

cat <<EOF
Done. Drafts are in $OUT

These are tracing references, not paper figures. Before any of them ships:
  - figure 2 and 5 must be rebuilt from real renders (./paper/figures/gen_figures.sh --list)
  - figure 3 and 6 must be plotted from real data
  - every figure must be checked against its brief in paper/figures/figureN.md,
    especially the "What it must not show" section
EOF
exit $rc
