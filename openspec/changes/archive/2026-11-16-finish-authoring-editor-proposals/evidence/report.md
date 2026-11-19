# Evidence: the five follow-ups of the editor survey

Each position is measured by `tests/editor/authoring-editor.test.ts` on TypeScript 5.9.3 (language service) and TypeScript 7.0.2 (language server). "Failed first" means the assertion failed on both compilers with the wanted verdict recorded and the fix not yet made.

## 1. Profile names

Cause: the names are in `relkit.config.ts`; `profile` was `string`.

| Position                                               | Before         | After                                                        |
| ------------------------------------------------------ | -------------- | ------------------------------------------------------------ |
| `defineBucket` `profile`, inside quotes                | no suggestions | `archive`, `uploads`                                         |
| `defineBucket` `profile: "upload"`                     | no error       | 1 error on `profile`, naming `"uploads" \| "archive"`        |
| `defineCache` `profile`, inside quotes (one adapter)   | no suggestions | `default`                                                    |
| `defineEvent` `profile`, inside quotes                 | no suggestions | `local`                                                      |
| `defineEvent` `profile: "locl"`                        | no error       | 1 error: `Type '"locl"' is not assignable to type '"local"'` |
| `defineChannel` `profile`, inside quotes (one adapter) | no suggestions | `default`                                                    |
| `defineChannel` `profile: "main"`                      | no error       | 1 error naming `"default"`                                   |

Failed first: 7 positions on each compiler (14 assertions), among them the two new `defineChannel` positions.

How it works: `relkit dev` and `relkit check` write `type RelkitApplicationProfiles = ApplicationProfilesOf<typeof import("../../relkit.config.js")["default"]>` and `interface ApplicationProfiles extends RelkitApplicationProfiles {}` into the context registry. `profile` is `ProviderProfileName<"bucket">` and so on, which reads that interface and is `string` when it has no entry for the capability or the capability has no provider. `tests/types/config.ts` asserts both: the names of an application, and `string` where no registry declares them.

The fixture's configuration has a `server.onStart` hook that calls a function through `getRelkit()`; that function depends on a bucket with a `profile`. The fixture has no type error, so the registry's reference to the configuration's type does not make the types circular through that path.

## 2. Unknown options

Measured before changing anything: `defineTask` and `defineJob` take a plain options object, and TypeScript's own check already reports an extra key as one error on that key. Probes record that. `defineFunction` and `defineEventFunction` take the options object as a type parameter, so an extra key was accepted.

| Position                              | Before                                         | After                                                                                             |
| ------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `defineFunction` `timeout: 10_000`    | no error                                       | 1 error on `timeout`: `Type '10000' is not assignable to type '10000 & UnknownOption<"timeout">'` |
| `defineFunction` `publishes: [event]` | 1 error: `… is not assignable to type 'never'` | 1 error on `publishes`: `… & RemovedOption<"publishes", "dependencies.events">`                   |
| `defineFunction` option names         | `publishes` is suggested                       | `publishes` is not suggested                                                                      |
| `defineEventFunction` `timeout: 5`    | no error                                       | 1 error on `timeout`, naming `UnknownOption<"timeout">`                                           |
| `defineTask` `retries: 3`             | 1 error on `retries` (TypeScript's own)        | unchanged                                                                                         |
| `defineJob` `schedule: "daily"`       | 1 error on `schedule` (TypeScript's own)       | unchanged                                                                                         |

Failed first: the three `defineFunction` positions and the `defineEventFunction` position, on each compiler. The error text repeats the value's own type before the named type, because the key is also part of the captured options object; the second line of the error is the short form.

## 3. One signature

`defineTask` was one signature already. TypeScript 5.9 suggested `durable` only because the `Execution` type parameter defaulted to `"durable"`, and that compiler reads the default while the option is being typed. The parameter now defaults to every form; `TaskForm` resolves a call without `execution` to `durable`.

| Position                                                | Before                 | After                  |
| ------------------------------------------------------- | ---------------------- | ---------------------- |
| `defineTask` `execution`, inside quotes, TypeScript 5.9 | `durable`              | `durable`, `retryable` |
| the same on TypeScript 7                                | `durable`, `retryable` | unchanged              |

Failed first: the position on TypeScript 5.9. `tests/types/task-context.ts` gained tests for the handler's context and the descriptor's `execution` in each form; every earlier `@ts-expect-error` holds.

`defineRoute` was two overloads, one for a raw handler and one for a function target. It is one signature now: the `Target` type parameter decides the form of the options and of the returned descriptor.

| Position                                                   | Before                                                                                   | After                                                                          |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `defineRoute` `successStatus: "200"`, TypeScript 5.9       | 1 error on `defineRoute`: "No overload matches this call", first describing the raw form | 1 error on `successStatus`: `Type 'string' is not assignable to type 'number'` |
| `defineRoute` unknown option `cache: true`, TypeScript 5.9 | 1 error on `defineRoute`, as above                                                       | 1 error on `cache`: `'cache' does not exist in type 'FunctionRouteOptions<…>'` |
| the same two on TypeScript 7                               | on the option, as "No overload matches this call. The last overload gave …"              | on the option, the plain error                                                 |

Failed first: both positions on TypeScript 5.9; the probes check where the error is. `tests/types/route-forms.ts` covers both forms, the parameter type of a raw handler, and the rejected combinations. The first version of the change typed the handler through `Extract`, and the commerce example failed to type-check: a raw handler written with a parameter lost its parameter type. The handler parameter is now constrained to the handler type and the test file has that case.

Still overloaded, and left so: `defineMiddleware`, whose two forms differ in the kind of the second argument (a handler function or an options object) and not in an option, and `defineBetterAuthService`, whose second form is the deprecated options form.

## 4. Descriptions

`bun tests/editor/inventory.ts`: 241 options in 27 option objects; 0 have no description. Before this change: 134 of 242. Each description was written from the code that reads the option. Four rest on weaker evidence, because little or no runtime code reads the option: `maxDuration`, `maxElapsed` and `logging` of `defineTask`, and `context` of `createTestApplication`.

Found while writing them, not changed here:

- `createTestApplication` overwrites the `context` option with its own object, so the option has an effect only in `createTestRuntime`.
- `sensitiveFields` of `defineEvent` is validated, stored and shown in the Inspector; nothing redacts by it.
- No reader of a task's `logging` was found, and only the Inngest adapter maps `maxDuration`.
- Options typed `never` to forbid them (`handler` and `output` of `defineEvent`; `input`, `output`, `tool` and `trigger` of `defineEventFunction`; `handler` or `target` of the other route form) are still suggested. Each now says why it is not allowed.

## 5. API pages

A type that a module re-exports was printed as `declare const ServerConfig: ServerConfig;`. The generator replaces such an entry with the entry of the declaration from the same page. On `app.mdx` the entries of `ServerConfig`, `InspectorConfig` and `ApiDocsConfig` under `define-app.types.ts` list their members. `InspectorConfig` and `AppTelemetryConfig` declare their members themselves, so their blocks show them, and `DefineAppOptions` lists the seven provider options. The inventory's "not on the page" column is empty for `inspector` and `telemetry`.

## Proof on the logistics application

A plain folder copy of the application's committed files (`git archive main`), outside both repositories. Before: RelKit 0.9.1 from npm. After: the packages of this change, packed and installed from a local registry with an empty cache (14,025 files of 11 packages compared with the archives, 0 differ). TypeScript 5.9.3, the application's own language service, in `src/services/documents/buckets/files.bucket.ts`.

| `profile`     | Before (0.9.1)                                              | After                                                                      |
| ------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| Empty value   | 229 suggestions, the whole scope; `local` is not among them | 230 suggestions; `"local"` is the first                                    |
| Inside quotes | 0 suggestions                                               | 1 suggestion: `local`                                                      |
| `"wrong"`     | 0 errors                                                    | 1 error on `profile`: `Type '"wrong"' is not assignable to type '"local"'` |

The application's `tsc --noEmit` passes twice without a source change: after the install with the registry it had (no profile or access names, so both stay `string`), and after `relkit check` added four lines to `.relkit/generated/context-registry.d.ts` (the aliases and interfaces `ApplicationProfiles` and `ApplicationAccess`). No server and no database were started. The copy and the caches were deleted.

## Not verified

- An editor itself; the language service and the language server are what it runs.
- Linux; every run was on macOS.
- A library package that defines buckets or events without an application: the type tests assert that `profile` is `string` where no registry declares names, but no such package was built.
