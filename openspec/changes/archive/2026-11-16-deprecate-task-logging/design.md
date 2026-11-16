# Design

## Context

`defineTask` accepts `logging: { level, redact }`, copies it onto the descriptor and into the graph's task policy, and nothing else reads it. `defineJob` refuses the key (`Jobs cannot own task field logging`), so `defineTask` is the only API that accepts it.

## Decisions

### D1: A `@deprecated` tag on the option, nothing removed

The option of `DefineTaskOptions` carries a `@deprecated` tag that says it has no effect and will be removed. The descriptor's own `logging` field keeps its type without the tag: it is what the graph and the Inspector read, and internal reads of it would otherwise be flagged.

What an editor shows, measured with TypeScript 5.9's language service: the entry `logging` in the suggestion list has the `deprecated` modifier (drawn struck through), and its hover text carries the tag. TypeScript does not mark a key that is already written in an object literal; it marks deprecated names where they are read (`task.logging`). So a task that already sets the option shows no strike-through on the key itself. The check warning covers that case.

### D2: The check warning comes from the graph, with a catalogued deprecation code

The existing mechanism for a deprecated API is `deprecated()` from `relkit/diagnostics`: a `RELKIT_DEPRECATED_*` code in the catalog with an error page, a warning in the log, and a warning diagnostic in `relkit check`. It reports each code once per process and names the module that was being imported, not a descriptor, so it cannot name each task. The warning therefore uses the same catalog (`RELKIT_DEPRECATED_TASK_LOGGING` in `diagnostics/codes/deprecated.ts`, so it has an error page and the same code family) and is produced by `relkit check` from the compiled graph: one warning per task node whose policy has `logging`, at the task's source location, naming the task. `deprecated()` is not also called at definition time, because the check would then print a second, unnamed warning for the same option.

The server does not log the warning when it starts. The check is where a deprecation is reported, and the option changes nothing at run time.

### D3: The option stays in the graph and is not sent to a backend

The graph's task node keeps `policy.logging`, so the graph, the Inspector and the jobs manifest show what the task declares, and no build identity changes. The policy a run is submitted with is assembled in one place (`jobs/runtime-selection-value.ts`), from the manifest's task policy or from the job's task; `logging` is left out there. Inngest's policy mapping also skips the key, so a caller that hands it a policy with `logging` (a worker definition, or code that calls the adapter directly) is not refused either.

### D4: `maxDuration` on Inngest stays reported

Inngest's adapter can map a `maxDuration` to `timeouts.finish`, but only from the `policy` of a worker definition. The generated server builds each definition from the task descriptor, which has `maxDuration` and no `policy`, so no finish timeout is set: the warning that Inngest does not enforce `maxDuration` is correct. A test now pins this. Passing the policy is not done here: it would also change retries and concurrency on Inngest, `timeouts.finish` limits a whole run after its start and not the active time of one attempt, and neither can be verified without an Inngest server.
