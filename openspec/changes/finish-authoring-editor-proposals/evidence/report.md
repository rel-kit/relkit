# Evidence: the five follow-ups of the editor survey

Each position is measured by `tests/editor/authoring-editor.test.ts` on TypeScript 5.9.3 (language service) and TypeScript 7.0.2 (language server). "Failed first" means the assertion failed on both compilers with the wanted verdict recorded and the fix not yet made.

## 1. Profile names

Cause: the names are in `relkit.config.ts`; `profile` was `string`.

| Position | Before | After |
| --- | --- | --- |
| `defineBucket` `profile`, inside quotes | no suggestions | `archive`, `uploads` |
| `defineBucket` `profile: "upload"` | no error | 1 error on `profile`, naming `"uploads" \| "archive"` |
| `defineCache` `profile`, inside quotes (one adapter) | no suggestions | `default` |
| `defineEvent` `profile`, inside quotes | no suggestions | `local` |
| `defineEvent` `profile: "locl"` | no error | 1 error: `Type '"locl"' is not assignable to type '"local"'` |
| `defineChannel` `profile`, inside quotes (one adapter) | no suggestions | `default` |
| `defineChannel` `profile: "main"` | no error | 1 error naming `"default"` |

Failed first: 7 positions on each compiler (14 assertions), among them the two new `defineChannel` positions.

How it works: `relkit dev` and `relkit check` write `type RelkitApplicationProfiles = ApplicationProfilesOf<typeof import("../../relkit.config.js")["default"]>` and `interface ApplicationProfiles extends RelkitApplicationProfiles {}` into the context registry. `profile` is `ProviderProfileName<"bucket">` and so on, which reads that interface and is `string` when it has no entry for the capability or the capability has no provider. `tests/types/config.ts` asserts both: the names of an application, and `string` where no registry declares them.

The fixture's configuration has a `server.onStart` hook that calls a function through `getRelkit()`; that function depends on a bucket with a `profile`. The fixture has no type error, so the registry's reference to the configuration's type does not make the types circular through that path.

## 2. Unknown options

Measured before changing anything: `defineTask` and `defineJob` take a plain options object, and TypeScript's own check already reports an extra key as one error on that key. Probes record that. `defineFunction` and `defineEventFunction` take the options object as a type parameter, so an extra key was accepted.

| Position | Before | After |
| --- | --- | --- |
| `defineFunction` `timeout: 10_000` | no error | 1 error on `timeout`: `Type '10000' is not assignable to type '10000 & UnknownOption<"timeout">'` |
| `defineFunction` `publishes: [event]` | 1 error: `… is not assignable to type 'never'` | 1 error on `publishes`: `… & RemovedOption<"publishes", "dependencies.events">` |
| `defineFunction` option names | `publishes` is suggested | `publishes` is not suggested |
| `defineEventFunction` `timeout: 5` | no error | 1 error on `timeout`, naming `UnknownOption<"timeout">` |
| `defineTask` `retries: 3` | 1 error on `retries` (TypeScript's own) | unchanged |
| `defineJob` `schedule: "daily"` | 1 error on `schedule` (TypeScript's own) | unchanged |

Failed first: the three `defineFunction` positions and the `defineEventFunction` position, on each compiler. The error text repeats the value's own type before the named type, because the key is also part of the captured options object; the second line of the error is the short form.

## 3. One signature

`defineTask` was one signature already. TypeScript 5.9 suggested `durable` only because the `Execution` type parameter defaulted to `"durable"`, and that compiler reads the default while the option is being typed. The parameter now defaults to every form; `TaskForm` resolves a call without `execution` to `durable`.

| Position | Before | After |
| --- | --- | --- |
| `defineTask` `execution`, inside quotes, TypeScript 5.9 | `durable` | `durable`, `retryable` |
| the same on TypeScript 7 | `durable`, `retryable` | unchanged |

Failed first: the position on TypeScript 5.9. `tests/types/task-context.ts` gained tests for the handler's context and the descriptor's `execution` in each form; every earlier `@ts-expect-error` holds.
