# Reference metadata audit

Checked 25 September 2026. This is a metadata correction pass, not certification of
every claim in the manuscript or every unused bibliography entry. Citation keys
were preserved. No additional works were inserted into Related Work.

## Method

Resolve the existing DOI or arXiv identifier; compare title and authors with the
original record; check the publisher's recommended citation for venue, pages and
publication year. For software, use the project's own attribution. A publisher's
issue year can differ from its online-first date or the conference meeting year.
Crossref's publisher-deposited metadata was also checked for the SIGGRAPH poster
and Springer records. Do not infer metadata from repository filenames or another
paper's bibliography.

## Corrections and sources

| Citation key | Correction | Primary source |
|---|---|---|
| origamispace | Expanded authors; retained NeurIPS 2025 venue; corrected the preprint-only instruction in the notes. | [Official conference record](https://neurips.cc/virtual/2025/poster/115182), [arXiv](https://arxiv.org/abs/2511.18450) |
| gamibench | Expanded all authors; added source URL. | [arXiv](https://arxiv.org/abs/2512.22207) |
| learn2fold | Expanded authors in the existing unused entry; not reintroduced into the paper. | [arXiv](https://arxiv.org/abs/2603.29585) |
| foldingagent | Replaced abbreviated title and incomplete author list. | [arXiv](https://arxiv.org/abs/2609.00377) |
| akitaya-hard | Added DOI; existing 580–589 page range confirmed. | [Original article](https://erikdemaine.org/papers/SimpleFolds_JIP/paper.pdf) |
| akitaya-infinite | Completed authors, volume, issue, pages and DOI; used publisher's 2020 issue year, not 2019 online-first year. | [Springer](https://link.springer.com/article/10.1007/s00373-019-02079-2) |
| akitaya-flatfolder | Corrected publication to Origami8, Volume III (2026), pp. 201–219; added editors, publisher and DOI. OSME took place in 2024. | [Springer](https://link.springer.com/chapter/10.1007/978-981-96-6561-7_14) |
| mixed-orthogonal | Added authors; used Thai Journal of Mathematics 21(4), 1025–1046 (2023). Author name follows the author's current publication record. | [Author's record and article](https://erikdemaine.org/papers/MixedSimpleFolds_TJM/) |
| turing | Added Thomas C. Hull and Inna Zakharevich. Retained original preprint year. | [arXiv](https://arxiv.org/abs/2309.07932) |
| layer-algebra | Added all authors, book, editors, publisher, pages and DOI. | [Springer](https://link.springer.com/chapter/10.1007/978-981-96-6561-7_21) |
| flat-folding-graphs | Added David Eppstein; used the 2019 journal reference and DOI supplied by arXiv. | [Author-submitted record](https://arxiv.org/abs/1808.06013) |
| akitaya-cp2seq | Corrected venue to ACM SIGGRAPH 2013 Posters; added publisher, page and DOI. Removed Student Research Competition from venue. | [Original poster paper](https://history.siggraph.org/wp-content/uploads/2023/01/2013-Poster-47-Akitaya_Generating-Folding-Sequences-from-Crease-Patterns-of-Flat-Foldable-Origami.pdf), [Publisher-deposited metadata](https://api.crossref.org/works/10.1145/2503385.2503407) |
| lunnon | Completed volume, issue, pages, DOI and title hyphenation. | [Oxford University Press](https://academic.oup.com/comjnl/article-pdf/14/1/75/1020149/140075.pdf) |
| meanders | Added Stéphane Legendre. | [arXiv](https://arxiv.org/abs/1302.2025) |
| spatial-survey | Added authors and complete title. | [arXiv](https://arxiv.org/abs/2511.15722) |
| vot | Added authors, volume and proceedings URL; confirmed NeurIPS 2024. | [Official proceedings](https://proceedings.neurips.cc/paper_files/paper/2024/hash/a45296e83b19f656392e0130d9e53cb1-Abstract-Conference.html) |
| oripa | Replaced undated software stub with Mitani's 2007 IPSJ Journal article, 48(9), 3309–3317. English title appears in the Japanese original. | [Original article](https://mitani.cs.tsukuba.ac.jp/dl/IPSJ-JNL4809039.pdf) |
| spin-model | Added Chihiro Nakajima; retained arXiv version rather than guessing chapter metadata from a book-level DOI. | [arXiv](https://arxiv.org/abs/2403.07306) |
| random-locally | Added all three authors. | [arXiv](https://arxiv.org/abs/2502.04279) |
| flatfolder | Added Jason S. Ku and full software title. Year 2022 follows the software citation in Computing Flat-Folded States. | [Project](https://github.com/origamimagiro/flat-folder), [paper references](https://link.springer.com/chapter/10.1007/978-981-96-6561-7_14) |
| fold-format | Added the three credited creators; explicitly cited the accessed repository specification. Year 2026 denotes this accessed resource, not invention of the format. | [Project attribution](https://github.com/edemaine/fold) |
| creasy | Credited repository account; removed unsupported maintenance-date statement. Year 2026 denotes the accessed repository, not first release. | [Project](https://github.com/xkevio/Creasy) |

## Follow-up source checks (25 September 2026)

- [PurelandFold's dataset card](https://huggingface.co/datasets/mayaweiz/PurelandFold)
  confirms 27 sequences, 337 annotated keyframes, CC-BY-4.0, and its relationship
  to FoldingAgent. Bibliography and editorial notes updated.
- [OEIS A000136](https://oeis.org/A000136) confirms the listed first ten terms,
  with index starting at one. [Legendre, Section 1](https://arxiv.org/html/1302.2025)
  supplies the Lucas/Lemoine historical attribution and the statement that no closed
  formula was then known. Notes now explicitly attribute these to Legendre rather
  than claim direct inspection of Lucas or current nonexistence of a formula.
- [Nakajima](https://arxiv.org/html/2403.07306) models layer-order constraints;
  [Hull et al., Theorem 2](https://arxiv.org/html/2502.04279) concerns global
  flat-foldability under random locally valid assignments on a square grid.
  Removed the unsupported extrapolation to typical terminal-state multiplicity in CP2Seq.
- [The cited SIGGRAPH poster](https://history.siggraph.org/wp-content/uploads/2023/01/2013-Poster-47-Akitaya_Generating-Folding-Sequences-from-Crease-Patterns-of-Flat-Foldable-Origami.pdf)
  supports graph rewriting and reflection paths but contains neither the quoted
  22,665-node/30-minute experiment nor the claimed future-work heuristic. These
  were removed from rendered notes and preserved only as a rejected editorial claim.
- [Continuous foldability](https://erikdemaine.org/papers/PaperReachability_CCCG2004/)
  concerns well-behaved states and continuous motions, not reachability in this
  benchmark's restricted action set. Notes corrected accordingly.
- [OrigamiBench, Section 2](https://arxiv.org/html/2603.13856) supports 366 designs
  from Flat-Folder and its three metric definitions. Its query efficiency is not
  queries to solution. [COrigami, Section 3.8 and Appendix B](https://arxiv.org/html/2606.26299)
  supports the aesthetic-evaluation and flat-foldability statements now used in notes.
- Codex version, source commit, binary hash, and historical-evidence limits are
  recorded in `SOFTWARE_PROVENANCE.md`; the paper now cites the release.

## Remaining scope

- This pass does not establish that every theorem or experimental claim attributed
  to these works is correct. Reference notes now identify several such checks.
- Flat-Folder's historical checkout is missing; an experimental commit cannot be
  inferred. See `SOFTWARE_PROVENANCE.md`. Historical Codex version evidence is
  likewise weaker than the evidence for the currently installed release.
- No references were added merely to increase bibliography length. Uncited entries
  remain available for editorial work and are not automatically printed.
- Follow-up build: pdflatex, BibTeX, then two pdflatex passes completed successfully;
  the PDF has 27 pages. BibTeX reported no warnings and the final LaTeX pass had
  no undefined references/citations. Overfull-box warnings remain in the layout,
  including the appendix source listings; this was not a full visual-layout audit.
