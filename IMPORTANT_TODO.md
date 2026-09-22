# Important paper TODOs

1. **Data generation tool and framework.** Explicitly name and describe the tool and framework we developed to generate the data. Explain what we release, how the generation process works, and how it supports reproducibility.

2. **Experiment tiers and tooling tiers.** Describe the different tiers of experimentation and the different levels of tool assistance. State what inputs, tools, feedback, and budgets are available in each condition, and what each comparison is intended to measure.

3. **Geometric reasoning and edit distance.** Explain which aspects of geometric reasoning the benchmark measures and why they matter. Justify using edit distance rather than reporting accuracy alone, including what partial progress or errors the distance captures and what it cannot distinguish.

4. **Why CP-Distance makes sense.** Define CP-Distance and explain why it is a meaningful measure for this task. Provide examples showing how its values relate to relevant geometric differences, and discuss its limitations.

5. **Evaluation pipeline and Codex harness.** Describe how we used the Codex harness to run the experiments. Explain the capabilities it provided beyond our direct API setup, with concrete examples of what it enabled us to execute or scale. Support the comparison with implementation details or measurements rather than a general claim.

6. **Additional Luna ablations.** Decide whether to run more ablations with Luna. Identify the unresolved questions, the proposed conditions, and the controls and budgets needed for each comparison. Distinguish proposed experiments from completed results in the paper.

7. **BFS baseline under matched tools.** Present breadth-first search explicitly as a baseline using the exact same set of tools and available actions as the model. Report what BFS achieves within a 30-second budget, including success rate, evaluated subset, hardware, and timing definition. Verify that tools, information access, and constraints are actually matched before making this claim.

8. **Transformations and isometry.** Explain why transformations and isometry matter when comparing folded states. Specify which translations, rotations, and reflections count as equivalent, how alignment and numerical tolerances are handled, and why these equivalences are appropriate for the task. Illustrate how an equivalent solution could otherwise be marked incorrect, while clarifying which geometric or layer-order differences must still count as errors.

9. **AI usage disclosure.** Mention how AI was used in the project and paper, including implementation, literature research, writing or editing, and figure generation where applicable. Distinguish these uses from the models evaluated in the experiments, and check the target venue's disclosure requirements before submission.
