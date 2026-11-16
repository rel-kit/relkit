---
"relkit": patch
---

Deprecated: the `logging` option of `defineTask`. It never had an effect: no jobs backend read its
`level` or its `redact` list. The option is still accepted and shown in the graph, the editor marks
it as deprecated, and it will be removed in a later version. It is no longer sent to a jobs backend
with a run. Remove it from the task.

Added: the diagnostic `RELKIT_DEPRECATED_TASK_LOGGING`.
