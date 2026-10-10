# Initial creation inventory

Both `create-relkit` and `relkit create` resolve through `resolveCreateOptionsDetailsEffect`, normalize through `normalizeCreateOptions`, and run the same staged `generateEffect`. The initial source inventory uses the current resolver, not the smaller existing smoke matrix.

| Axis     | Current values                                         | Runtime effect                                                         |
| -------- | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| Template | minimal, api, agent, fullstack                         | Backend source/dependencies; fullstack also starts Next                |
| Jobs     | none, inngest-docker, effect-mq-docker, trigger-docker | Selected provider and tasks starter                                    |
| Cloud    | none, aws                                              | Optional package/import                                                |
| Deploy   | none, pulumi                                           | Optional package/import; deployment declaration when combined with AWS |
| Examples | true, false                                            | Removed example source/routes/tests                                    |

The parser currently accepts 128 normalized runtime-affecting tuples (4 × 4 × 2 × 2 × 2). It does not enforce cloud/deploy coupling or native certification at resolution. This is the candidate inventory, not a statement that every tuple is valid or certified. Preparation/functional/native/timing evidence determines the supported table; rejected tuples must remain explicit in results.

When jobs is selected, `generateEffect` copies `tasks` regardless of the selected template. Thus 96 tuples use that source family and currently do not generate fullstack web files or `/hello`. The functional contract must explicitly reject or correct those combinations; they cannot inherit fullstack evidence. The tasks safe route is `/health` with body `{"ok":true}`. Ordinary templates use `/hello?name=RelKit`, returning `{"message":"Hello, RelKit!"}`. Without examples, readiness must prove the active graph through the protected backend control endpoint.

Git, JSON, name and directory affect presentation, identity or publication rather than startup work; they require equivalence/relocation tests. Installation changes snapshot availability and requires separate post-install preparation. Force-empty-directory affects prepublication ownership only. None can justify omitting a distinct runtime tuple.

Existing job specs require native certification; Trigger is explicitly deferred/not-tested in current acceptance specifications. Performance measurements cannot promote it as native certified.

## Effect/source inventory

New baseline modules own native process/HTTP/report adapters, measured policy, and precise companion contracts under `scripts/dev-readiness`; deterministic fixtures belong under `scripts/tests/dev-readiness`. Runtime work will extend CLI development commands/services, generator workflows/templates, graph/executable output and support telemetry. Each changed source file requires the use-effect contract and final EOF audit.

Current pins: Bun 1.3.10, Effect 4.0.1, TypeScript 5.9.3. The host reports Apple M1 Pro and arm64.

The read-only `repos/effect` checkout contains selected platform/HTTP/SQL/AI sources and examples but lacks core Context, Layer, Clock, Data, Effect implementation/test files, `.agents/AGENTS.md`, and `LLMS.md`. Installed `node_modules/effect/src` supplies authoritative 4.0.1 signatures, implementations and embedded examples. This gap remains explicit; project behavioral tests supplement the unavailable upstream core tests.

Verified baseline patterns: Context.Service's service-owned make overload (`Context.ts:201–405`), Layer.effect ownership, Clock.monotonicTimeNanos (`Clock.ts:310–326`), lazy cancellable tryPromise (`internal/effect.ts:1094–1170`), acquireRelease ownership masking (`internal/effect.ts:4134–4175`), forkScoped delegation to forkIn (`internal/effect.ts:5639–5685`), Effect.repeat's until/schedule contract (`Effect.ts:14950–15200`), Schedule.spaced, and Data.TaggedError. Runtime patterns are researched before their edits and added to this evidence as used. Wall-clock currentTimeNanos is not used for elapsed measurement.
