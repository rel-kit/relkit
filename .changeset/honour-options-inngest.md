---
"@relkit/inngest": patch
---

Changed: a run of a task that declares `maxElapsed` is accepted. Before, the submission failed with
`Inngest cannot certify task policy field "maxElapsed".` Inngest does not enforce the limit;
`relkit check` and the server's start now report that with `RELKIT_JOB_TASK_OPTION_UNSUPPORTED`.

The error for a task option Inngest cannot map names the backend and the option: `The inngest jobs
backend does not support the task option "logging". Remove it from the task.`
