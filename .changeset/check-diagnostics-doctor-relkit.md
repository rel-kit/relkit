---
"relkit": patch
---

New diagnostic code `RELKIT_EVALUATOR_BUN_RUNTIME_REQUIRED` for an application import of a
Bun-only module evaluated on Node. The next step of `RELKIT_PROVIDER_RELEASE_SOURCE_REQUIRED` now
names a connected adapter with binding values or an infrastructure source, and
`RELKIT_GRAPH_NOT_FOUND` explains that the graph is written only when `relkit check` passes.
