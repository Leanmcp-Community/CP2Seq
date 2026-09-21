#!/usr/bin/env bash
#
# genpdf.sh — build the ICLR 2026 PDF from LaTeX source.
#
# Usage:
#   ./genpdf.sh                        # build iclr2026_conference.pdf
#   ./genpdf.sh SomeOther              # build a different .tex (with or without extension)
#   ./genpdf.sh --open                 # build, then open the PDF (macOS)
#   ./genpdf.sh --clean                # delete build artifacts and exit
#
# Notes:
#   - Runs in the directory this script lives in, no matter where you call it from.
#   - latexmk is not installed on this machine, so the pdflatex/bibtex passes are
#     spelled out explicitly.
#   - Uses nonstopmode + halt-on-error so it never hangs at the "Enter file name:"
#     prompt; on failure it prints the actual LaTeX errors.
#   - This helper is NOT part of the paper — exclude it from the final ICLR ZIP.

set -uo pipefail

cd "$(dirname "$0")"

JOB="iclr2026_conference"
OPEN=0

for arg in "$@"; do
  case "$arg" in
    --clean)
      rm -f ./*.aux ./*.bbl ./*.blg ./*.log ./*.out ./*.toc ./*.brf ./*.synctex.gz
      echo "Cleaned build artifacts (kept .tex, .bib, .pdf)."
      exit 0
      ;;
    --open) OPEN=1 ;;
    -*)     echo "Unknown flag: $arg" >&2; exit 2 ;;
    *)      JOB="${arg%.tex}" ;;   # allow "name" or "name.tex"
  esac
done

if [[ ! -f "$JOB.tex" ]]; then
  echo "ERROR: $JOB.tex not found in $(pwd)" >&2
  exit 1
fi

# Preflight: the ICLR style pulls in times/natbib; fail early with the fix.
for sty in times.sty natbib.sty; do
  if ! kpsewhich "$sty" >/dev/null 2>&1 && [[ ! -f "$sty" ]]; then
    echo "ERROR: '$sty' is missing (required by iclr2026_conference.sty)." >&2
    echo "Install it, then re-run this script:" >&2
    echo "    sudo tlmgr update --self && sudo tlmgr install psnfss natbib" >&2
    exit 1
  fi
done

run_pdflatex() {
  local label="$1"
  echo "==> pdflatex ($label)"
  if ! pdflatex -interaction=nonstopmode -halt-on-error -file-line-error "$JOB" >/dev/null 2>&1; then
    echo "" >&2
    echo "pdflatex FAILED on $label. First errors:" >&2
    grep -nE '^(.*:[0-9]+:|! )' "$JOB.log" | head -n 40 >&2 || true
    echo "" >&2
    echo "Full log: $(pwd)/$JOB.log" >&2
    exit 1
  fi
}

run_pdflatex "pass 1/3"

echo "==> bibtex"
if ! bibtex "$JOB" >/dev/null 2>&1; then
  echo "Note: bibtex reported problems (often just warnings) — see $JOB.blg" >&2
fi

run_pdflatex "pass 2/3"
run_pdflatex "pass 3/3"

echo ""
echo "Build OK  ->  $(pwd)/$JOB.pdf"

# Surface things worth a look, without failing the build.
if grep -q 'Overfull \\hbox' "$JOB.log" 2>/dev/null; then
  n=$(grep -c 'Overfull \\hbox' "$JOB.log")
  echo "Warning: $n overfull hbox(es) — content may spill toward the margin."
fi
if grep -q 'Citation.*undefined' "$JOB.log" 2>/dev/null; then
  echo "Warning: undefined citation(s):"
  grep -o 'Citation `[^'"'"']*' "$JOB.log" | sort -u | head -n 20
fi
if grep -q 'There were undefined references' "$JOB.log" 2>/dev/null; then
  echo "Warning: undefined references — a \\ref or \\label may be missing."
fi

if [[ "$OPEN" == "1" ]]; then
  open "$JOB.pdf" 2>/dev/null || true
fi
