# Deprecate `logging` of `defineTask`

## Why

`honour-declared-options` found that `logging` of a task (`level`, `redact`) has no defined meaning: no specification says what it does and no code reads it. Every jobs backend ignored it, except Inngest, which refused a run of a task that set it. The owner decided to deprecate the option instead of defining it.

## What Changes

- **The option is marked deprecated in its type.** It is still accepted by the type checker and at run time, and the graph and the Inspector still show what a task declares. Nothing is removed.
- **`relkit check` warns for each task that sets it,** with `RELKIT_DEPRECATED_TASK_LOGGING`, naming the task. The check still passes.
- **No backend receives it and none fails because of it.** The option is left out of the policy a run is submitted with, and Inngest's policy mapping no longer refuses it.

## Capabilities

### Modified Capabilities

- `task-runtime`: the deprecated `logging` option of a task.

## Impact

- Packages: `relkit` (type comment, the policy sent with a run, the diagnostics catalog), `@relkit/cli` (check warning), `@relkit/inngest` (policy mapping).
- Documentation: the option's description, the task API page, the execution policy guide, a new error page.
