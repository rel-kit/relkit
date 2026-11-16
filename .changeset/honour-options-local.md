---
"@relkit/local": patch
---

The local jobs backend declares that it enforces `maxDuration` and `maxElapsed` of a task (the
adapter features `task-max-duration` and `task-max-elapsed`), so `relkit check` does not report
those limits for tasks that run on it.
