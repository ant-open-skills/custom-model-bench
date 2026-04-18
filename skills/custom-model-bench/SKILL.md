---
name: custom-model-bench
description: Benchmark a custom Claude agent or prompted workflow against a dataset and rubric. Use when the user wants to evaluate, score, or compare the quality of an agent's outputs — especially for agentic tool-use tasks where tool-call traces are part of the signal.
---

# custom-model-bench

Scaffolding — the evaluation workflow is not yet implemented.

This skill is part of Phase 0 of the `custom-model-bench` plugin. In later phases it will guide the user through:

1. **Setup** — choose a dataset, rubric, and candidate to benchmark.
2. **Run** — execute the candidate against the dataset and capture tool-call traces.
3. **Judge** — score each run against the rubric.
4. **Report** — render an HTML report summarizing results.

For now, invoking this skill should simply confirm the plugin installed correctly. If you're seeing this message, the two-command install worked:

```
claude plugin marketplace add ant-open-skills/custom-model-bench
claude plugin install custom-model-bench@ant-open-skills
```
