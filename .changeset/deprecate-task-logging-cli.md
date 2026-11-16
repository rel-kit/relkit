---
"@relkit/cli": patch
---

Added: `relkit check` warns with `RELKIT_DEPRECATED_TASK_LOGGING` for each task that sets the
deprecated `logging` option, naming the task. The check still passes.
