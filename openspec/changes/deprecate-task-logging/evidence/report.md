# Evidence: `logging` of `defineTask` is deprecated

## 1. Where the option is declared

`DefineTaskOptions.logging` in `packages/relkit/src/jobs/task-definition.types.ts` is the only place an application can set it. `defineJob` refuses the key (`Jobs cannot own task field logging`). The descriptor and the graph's task policy carry a copy; no code read either.

## 2. Tests that failed first

| Test                                                                                                                          | Before                                                                                                  | After                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/editor/deprecated-options.test.ts`: the option is accepted and marked as deprecated                                    | the suggestion entry `logging` had the modifiers `optional` only (also seen again by disabling the tag) | no type error in a task that sets it; the entry has `deprecated`; the hover tag reads "The option has no effect and will be removed…"; `maxDuration` is not marked                                                     |
| `packages/cli/tests/check-task-options.test.ts`: check warns that logging of a task is deprecated, names the task, and passes | no diagnostic                                                                                           | one warning, `RELKIT_DEPRECATED_TASK_LOGGING`, at `src/hello/tasks/export.task.ts`: `Task "hello.export" sets logging, which is deprecated: the option has no effect and will be removed.`; no error; the check passes |
| `integrations/packages/inngest/policy-defaults.test.ts`: the deprecated logging option does not make Inngest refuse a run     | `Inngest…does not support the task option "logging"`                                                    | the mapping returns no field for it                                                                                                                                                                                    |
| `packages/relkit/tests/jobs/submission-pipeline.test.ts`: the deprecated logging option of a task is not sent to the backend  | the submitted policy had `logging`                                                                      | the submitted policy has `maxDuration` and no `logging`; the descriptor still has `logging`                                                                                                                            |

The first version of the editor test asserted that TypeScript reports the written key as deprecated (`'logging' is deprecated.`). That never happens: TypeScript 5.9 reports a deprecated property where it is read, not where an object literal sets it (measured on a four-line file without RelKit). The test was changed to what an editor shows: the suggestion list and the hover text.

The two Inngest tests of the refusal message used `logging` as the example of an option Inngest cannot map; they now use an unknown key (`priority`).

## 3. What each backend does with `logging` now

|                                  | local                  | Inngest                                                            | Trigger.dev            | Effect MQ              | Postgres               |
| -------------------------------- | ---------------------- | ------------------------------------------------------------------ | ---------------------- | ---------------------- | ---------------------- |
| Before `honour-declared-options` | ignored                | run refused: `Inngest cannot certify task policy field "logging".` | ignored                | ignored                | ignored                |
| After `honour-declared-options`  | ignored                | run refused, with a message that names the backend and the option  | ignored                | ignored                | ignored                |
| Now                              | not sent; run accepted | not sent; run accepted; the mapping also skips the key             | not sent; run accepted | not sent; run accepted | not sent; run accepted |

On every backend the option is reported once per task by `relkit check` as deprecated. The rows other than local and Inngest rest on the one place that builds the submitted policy (`jobs/runtime-selection-value.ts`), tested with a recording adapter, not on a run against those services.

## 4. `maxDuration` on Inngest

The table of `honour-declared-options` says "not enforced; warning at check and at start". That is correct for an application, and this is why:

- `integrations/packages/inngest/src/runtime/task-binding.ts` (`createInngestFunctionConfig`) sets `timeouts.finish` from the `policy.maxDuration` of a worker definition. `integrations/packages/inngest/inngest.test.ts` shows that mapping for a definition that has a policy.
- The generated server builds each worker definition in `nativeTaskDefinition` (`packages/cli/src/commands/build-server-native-worker.ts`) from the task descriptor and copies `task.policy`. A descriptor has `maxDuration` at its top level and no `policy`.
- New test, `the worker definition the server registers carries no task policy, so Inngest sets no finish timeout`: it evaluates `nativeTaskDefinition` from the generated source with a real `defineTask({ maxDuration: "30 seconds" })` descriptor; the definition has no `policy`. It passed when written: it pins the current behaviour, it did not fail first.
- At submission Inngest still checks that `maxDuration` is whole seconds and does nothing else with it.

So no finish timeout reaches Inngest and the warning stands. Not run against an Inngest server. If the policy is passed to the definition later, Inngest must declare `task-max-duration` and that test must change; `timeouts.finish` also limits a whole run after its start, not the active time of one attempt, so the meaning would have to be stated.

## 5. Suites and checks

- `packages/relkit/tests/jobs` (Vitest): 57 files, 182 tests passed. `packages/cli/tests/check-task-options.test.ts`: 6 passed. Inngest policy tests: 17 passed. Editor deprecation test: passed.
- Type checks of `relkit`, `@relkit/cli` and `@relkit/inngest` with their tests, `bun run lint`, `bun run check`, `generate:check`: passed.
