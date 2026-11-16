---
"@relkit/cli": patch
---

Fixed: `relkit check` names a provider profile that a descriptor names and the application does not
have (`Provider profile "x" does not provide event.`). Before, it reported the use as unqualified.

Added: `relkit check` warns with `RELKIT_JOB_TASK_OPTION_UNSUPPORTED` for each `maxDuration` or
`maxElapsed` of a task whose jobs backend does not enforce it, naming the task, the option, the
backend and the profile. The server logs the same warnings when it starts. The check still passes.

Changed: a check that passes prints its warnings above the `Checked` line. Before, the warnings of
a passing check were only in `--json`. The exit code does not change.
