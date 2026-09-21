#!/usr/bin/env bash
#
# gen_figures.sh - draft the paper's figures through the Codex CLI.
#
#   ./paper/figures/gen_figures.sh --list       # what each figure is, and how it should REALLY be made
#   ./paper/figures/gen_figures.sh --dry-run    # print the prompts, invoke nothing
#   ./paper/figures/gen_figures.sh              # draft every AI-suitable figure (1 and 4)
#   ./paper/figures/gen_figures.sh 1 4          # draft specific figures
#   ./paper/figures/gen_figures.sh --all        # draft all six, including the ones you shouldn't
#
# HOW IT WORKS
#   Each figure is one `codex exec` call. Codex uses its BUILT-IN image_gen tool,
#   which is the imagegen skill's preferred path and needs NO OPENAI_API_KEY and no
#   direct API access. Codex writes the image under $CODEX_HOME and the prompt tells
#   it to move the final file into paper/figures/generated/.
#
# WHAT THIS IS FOR
#   Rough compositional drafts to trace over in Excalidraw. Nothing this produces
#   goes into the paper as-is. A diffusion model cannot draw an accurate crease
#   pattern, a correct fold line, or a chart with real numbers on it. The imagegen
#   skill says the same: diagrams are "better produced directly in SVG, HTML/CSS,
#   or canvas".
#
#   Figures 1 and 4 are conceptual and draft usefully this way. That is the default.
#   Figures 2 and 5 must start from REAL renders that already exist in this repo.
#   Figures 3 and 6 are data plots and must be plotted, never generated.
#   Run --list before deciding.

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT="$REPO/paper/figures/generated"
REL="paper/figures/generated"

DRY=0
ALL=0
LIST=0
MODEL=""
SANDBOX="workspace-write"
FIGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY=1; shift ;;
    --all)     ALL=1; shift ;;
    --list)    LIST=1; shift ;;
    --model)   MODEL="$2"; shift 2 ;;
    --sandbox) SANDBOX="$2"; shift 2 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    [1-6])     FIGS+=("$1"); shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

# ------------------------------------------------------------------ the briefs
# Condensed from paper/figures/figureN.md. "Flat vector, no photorealism" is
# deliberate: the output is meant to be traced, not admired.

STYLE="Flat 2D technical diagram in a clean vector line-art style. Plain white background, \
thin black strokes, at most one muted accent colour, generous white space. \
No photorealism, no 3D rendering, no shadows, no gradients, no decorative flourish. \
It should look like a figure from an academic paper. Labels in a plain sans-serif font, \
short and legible."

prompt_for() {
  case "$1" in
    1) echo "$STYLE A left-to-right diagram contrasting two directions of the same task. \
On the left, a plain flat square sheet of paper. On the right, the same square covered in a web of \
crease lines. A wide arrow runs left to right along the top labelled 'generation: one forward pass', \
with four small thumbnails along it showing a paper stack getting thicker. A second arrow runs right \
to left along the bottom labelled 'recovery: NP-hard', drawn not as a single arrow but as a tree of \
branching paths fanning backwards from the crease pattern, where most branches continue onward and \
only a few end in small cross marks, and exactly one highlighted path reaches the flat square. The \
top arrow should look simple and mechanical; the bottom should look wide and expensive. Important: \
most branches must NOT be dead ends." ;;
    2) echo "$STYLE A three-panel figure with a labelled divider. Left panel titled INPUT: a square \
crease pattern diagram of straight lines, some solid and some dashed. Centre panel titled INPUT: two \
stacked schematic views of a folded flat paper object, one seen from directly above as overlapping \
translucent outlines, one drawn as an exploded stack of separated flat layers with gaps between them. \
Right panel titled WITHHELD: a horizontal filmstrip of four small square diagrams in sequence, each \
showing a fold line across a shape. A bold dashed vertical divider separates the centre and right \
panels, labelled 'withheld'. This is a LAYOUT MOCKUP: the geometry is a placeholder." ;;
    3) echo "$STYLE A two-dimensional grid heatmap. Horizontal axis labelled 'fold depth', vertical \
axis labelled 'coupling'. Roughly five by four rectangular cells, each shaded a different intensity \
of a single colour and containing a small number. One corner cell, at high depth and low coupling, is \
blank with diagonal hatching instead of shading, clearly distinct from the pale cells, with a small \
callout arrow labelled 'unreachable without pre-creasing'. LAYOUT MOCKUP: cell counts are placeholders." ;;
    4) echo "$STYLE A left-to-right pipeline diagram of an evaluation loop. On the far left, two \
stacked input boxes labelled 'crease pattern' and 'final folded state'. In the centre, a cycle of two \
large boxes: one labelled 'model proposes a fold', and one SINGLE box containing both words \
'environment / verifier' on two lines inside the same rectangle. From that box two arrows leave: one \
labelled 'new state + views' continuing forward, one labelled 'named refusal' curving back to the \
model box. On the far right, a box labelled 'replay + compare'. A dashed rounded enclosure sits below \
and outside the cycle containing a box labelled 'reference sequence', joined by a single line only to \
the right-hand replay box and never to the cycle, the enclosure labelled 'withheld during the \
episode'. Critical: environment and verifier must be ONE rectangle, not two." ;;
    5) echo "$STYLE A side-by-side comparison of two nearly identical diagrams. Both show the same \
small paper stack of two flat layers with a vertical crease down the middle. On the left, a \
horizontal dashed line crosses the top layer, a short bold highlighted segment sits on the vertical \
middle crease away from that line, and a label reads 'would-tear' with a cross mark. On the right, \
the same stack with a vertical dashed line, the highlighted segment now lying exactly along that \
line, and a label reads 'accepted' with a tick. A caption strip between them reads 'same state, same \
layers, opposite verdicts'. LAYOUT MOCKUP: replace with a real harness render." ;;
    6) echo "$STYLE A simple line chart. Horizontal axis with three labelled ticks reading 'easy', \
'mid', 'hard'. Vertical axis labelled 'solve rate' from 0 to 100 percent. Four thin solid lines with \
small round markers descending left to right, plus one clearly distinct DASHED line of different \
weight labelled directly on the plot as 'deterministic search baseline'. Small numbers printed beside \
each marker. Plain legend. LAYOUT MOCKUP: contains no real data." ;;
  esac
}

label_for() {
  case "$1" in
    1) echo "the asymmetry" ;;
    2) echo "one dataset sample" ;;
    3) echo "difficulty grid" ;;
    4) echo "evaluation pipeline" ;;
    5) echo "a refusal" ;;
    6) echo "main result" ;;
  esac
}

if [[ "$LIST" == "1" ]]; then
  cat <<'EOF'
Figure  What it is                 How it should ACTUALLY be made
------  -------------------------  -----------------------------------------------------------
  1     The asymmetry              AI draft, then trace in Excalidraw. Conceptual, no real data.
  4     Evaluation pipeline        AI draft, then trace in Excalidraw. Conceptual, no real data.

  2     One dataset sample         REAL RENDERS. Every sample already has them:
                                     CODEX_HARNESS_TESTING/runs/<run>/easy-0001/initial/cp.png
                                     CODEX_HARNESS_TESTING/runs/<run>/easy-0001/final/top.png
                                     CODEX_HARNESS_TESTING/runs/<run>/easy-0001/final/exploded.png
                                   Compose those. An invented crease pattern would be fabricated.
  5     A refusal                  REAL RENDERS of the two-fold tearing pair, plus the actual
                                   refusal string the environment emits.
  3     Difficulty grid            PLOT from workspace/corpus/out/release/manifest.json.
  6     Main result per stratum    PLOT from workspace/RESULTS/results.json.

Default run drafts only 1 and 4. Pass --all to override, or name figures explicitly.
Figures 2, 3, 5 and 6 carry data or geometry and must not ship as generated images.
EOF
  exit 0
fi

if [[ ${#FIGS[@]} -eq 0 ]]; then
  if [[ "$ALL" == "1" ]]; then FIGS=(1 2 3 4 5 6); else FIGS=(1 4); fi
fi

command -v codex >/dev/null || { echo "ERROR: codex CLI not on PATH." >&2; exit 1; }

mkdir -p "$OUT"
echo "codex:   $(command -v codex) ($(codex --version 2>/dev/null))"
echo "out:     $OUT"
echo "sandbox: $SANDBOX   figures: ${FIGS[*]}"
echo

rc=0
for n in "${FIGS[@]}"; do
  base="figure${n}-draft"
  # Never clobber a draft that may already have been traced from.
  dest="$OUT/$base.png"
  if [[ -e "$dest" ]]; then
    i=2; while [[ -e "$OUT/$base-v$i.png" ]]; do i=$((i+1)); done
    base="$base-v$i"; dest="$OUT/$base.png"
  fi

  read -r -d '' TASK <<EOF
Use the imagegen skill in its default built-in image_gen tool mode. Do not use the
scripts/image_gen.py CLI fallback and do not use an OPENAI_API_KEY.

Generate ONE image from the description below, then move the final generated file to
$REL/$base.png inside this repository. Report the final path when done.
Do not modify any other file in the repository, and do not ask follow-up questions.

Image description:
$(prompt_for "$n")
EOF

  echo "==> figure $n: $(label_for "$n")  ->  $REL/$base.png"
  if [[ "$DRY" == "1" ]]; then
    printf '%s\n\n' "--- prompt ---"; printf '%s\n\n' "$TASK"
    continue
  fi

  cmd=(codex exec --cd "$REPO" --sandbox "$SANDBOX")
  [[ -n "$MODEL" ]] && cmd+=(--model "$MODEL")
  cmd+=("$TASK")

  if "${cmd[@]}"; then
    if [[ -f "$dest" ]]; then
      echo "    ok -> $dest"
    else
      echo "    codex finished but $dest is missing." >&2
      echo "    Check \$CODEX_HOME/generated_images/ and move the file by hand." >&2
      rc=1
    fi
  else
    echo "    FAILED on figure $n" >&2
    rc=1
  fi
  echo
done

[[ "$DRY" == "1" ]] && { echo "Dry run: nothing was invoked."; exit 0; }

cat <<EOF
Done. Drafts are in $OUT

These are DRAFT IMAGES and tracing references, not paper figures. Before any ships:
  - figures 2 and 5 rebuilt from real renders  (see --list)
  - figures 3 and 6 plotted from real data
  - each checked against paper/figures/figureN.md, especially "What it must not show"
The DRAFT IMAGE banner stays in the PDF until a human-authored figure replaces it.
EOF
exit $rc
