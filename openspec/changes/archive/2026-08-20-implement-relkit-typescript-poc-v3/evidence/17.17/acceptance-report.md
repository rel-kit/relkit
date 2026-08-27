# Task 17.17 final Section 25 acceptance

Run date: `2026-08-18T23:26:19+03:00`  
Bun: `1.3.10`  
Node: `v24.12.0`  
Platform: `Darwin 24.6.0 arm64`

## Result

All 40 v3 Section 25 criteria passed individually. This unit reused the
existing compiler, engine, inspector, security, generator, and deployment
evidence; it added no product capability and did not fill release-owner
sign-offs.

|   # | Section 25 criterion                                                                                                                          | Evidence                                                                                                                                                                    | Result |
| --: | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
|   1 | Generated projects use the approved directory and suffix conventions.                                                                         | `evidence/17.11/acceptance-report.md`; `tests/generator/option-matrix.test.ts`                                                                                              | pass   |
|   2 | Convention violations warn without removing descriptors.                                                                                      | `tests/compiler/fixtures.test.ts` warning fixtures; `tests/contracts/descriptor-cohort.test.ts`                                                                             | pass   |
|   3 | Functions are the only authored handlers.                                                                                                     | `apps/fixture-commerce/src/authoring-assertions.test.ts`; `tests/agents/source-boundaries.test.ts`                                                                          | pass   |
|   4 | Routes, jobs, event triggers, and tools target functions.                                                                                     | `tests/compiler/fixture-commerce.test.ts`; `tests/integration/fixture-commerce-consistency.test.ts`                                                                         | pass   |
|   5 | Event authoring uses `defineEvent` and `onEvent`.                                                                                             | `packages/events/source-export.test.ts`; `tests/contracts/events.test.ts`                                                                                                   | pass   |
|   6 | Examples use ordinary async TypeScript and Standard Schema.                                                                                   | `bun run test:types`; `tests/schema/schema.test.ts`; `evidence/17.11/acceptance-report.md`                                                                                  | pass   |
|   7 | Public declarations expose no Effect types.                                                                                                   | `bun run scripts/check-public-declarations.ts`; `evidence/17.14/acceptance-report.md`                                                                                       | pass   |
|   8 | One deterministic graph describes all managed concepts.                                                                                       | `tests/integration/fixture-commerce-consistency.test.ts`; `evidence/17.15/acceptance-report.md`                                                                             | pass   |
|   9 | The runtime manifest hash matches the graph hash.                                                                                             | `tests/compiler/manifest.test.ts`; `tests/compiler/fixture-commerce.test.ts`                                                                                                | pass   |
|  10 | Routes and listeners compile to generic trigger nodes.                                                                                        | `tests/compiler/graph-construction.test.ts`; `packages/events/source-export.test.ts`                                                                                        | pass   |
|  11 | Graph JSON contains no executable closures or resolved secrets.                                                                               | `tests/compiler/manifest.test.ts`; `bun run scripts/secret-scan.ts`; `evidence/17.13/acceptance-report.md`                                                                  | pass   |
|  12 | Clean compilations from different roots produce identical outputs.                                                                            | `tests/compiler/determinism.test.ts`; `evidence/17.15/acceptance-report.md`                                                                                                 | pass   |
|  13 | Graph diff identifies breaking contract changes.                                                                                              | `tests/graph/diff.test.ts`                                                                                                                                                  | pass   |
|  14 | All execution paths use the same function engine.                                                                                             | 166-test engine/runtime/recovery matrix; `tests/integration/http/fixture-commerce.test.ts`; `tests/integration/jobs/fixture-commerce.test.ts`                               | pass   |
|  15 | Cancellation reaches `ctx.signal`.                                                                                                            | `packages/runtime-effect/abort.test.ts`; `packages/runtime-hono/middleware.test.ts`; `tests/integration/http/http.test.ts`                                                  | pass   |
|  16 | Declared errors, timeouts, cancellations, provider failures, and defects are distinct.                                                        | `packages/runtime-effect/failure.test.ts`; `packages/runtime-hono/response-mapping.test.ts`; `tests/integration/engine/engine.test.ts`                                      | pass   |
|  17 | Framework terminal logs use the Effect logging sinks.                                                                                         | `packages/runtime-effect/logger.test.ts`; `scripts/check-observability-sinks.ts`                                                                                            | pass   |
|  18 | Global provider selection works for development, test, and production.                                                                        | `tests/integration/engine/providers.test.ts`; `tests/integration/fixture-commerce-consistency.test.ts`                                                                      | pass   |
|  19 | Local jobs and durable listeners recover with documented at-least-once behavior.                                                              | `tests/restart/jobs.test.ts`; `tests/restart/events.test.ts`; `evidence/17.12/acceptance-report.md`                                                                         | pass   |
|  20 | The inspector exposes the required graph, resource, signal, environment, and diagnostic views.                                                | `evidence/17.9/e2e-report.md`; `tests/inspector/fixture-backend.test.ts`; `apps/inspector/lib/*` tests                                                                      | pass   |
|  21 | A request appears live and links to its trace.                                                                                                | `evidence/17.9/e2e-report.md`; `apps/inspector/lib/observability-model.test.ts`; `packages/inspector-api/observability.test.ts`                                             | pass   |
|  22 | Invalid source preserves the last-known-good generation.                                                                                      | `packages/supervisor/candidate.test.ts`; `packages/supervisor/verification.test.ts`; `packages/supervisor/state-machine.test.ts`; `tests/inspector/fixture-backend.test.ts` | pass   |
|  23 | The inspector consumes only versioned APIs.                                                                                                   | `packages/inspector-api` contract matrix; `tests/inspector/inspector-scans.test.ts`; `evidence/17.14/acceptance-report.md`                                                  | pass   |
|  24 | Secret values are not exposed.                                                                                                                | `bun run scripts/secret-scan.ts`; `tests/security`; `evidence/17.13/acceptance-report.md`                                                                                   | pass   |
|  25 | `bunx create-relkit@latest my-app` produces a complete project.                                                                                 | `evidence/17.11/acceptance-report.md`; packed smoke output                                                                                                                  | pass   |
|  26 | The generated project passes install, check, typecheck, test, and build.                                                                      | `evidence/17.11/acceptance-report.md`; `bun run verify` packed-generator stage                                                                                              | pass   |
|  27 | The example route runs and appears in the inspector.                                                                                          | `evidence/17.11/acceptance-report.md`; `evidence/17.9/e2e-report.md`                                                                                                        | pass   |
|  28 | The framework suite covers type, compiler, graph, provider, runtime, restart, browser, generator, deployment, container, and security layers. | Root scripts in `package.json`; `bun run verify`; evidence `17.9`–`17.16`                                                                                                   | pass   |
|  29 | `bun run verify` is deterministic and documented.                                                                                             | `docs/testing.md`; current `bun run verify` exit `0`; `evidence/17.16/acceptance-report.md`                                                                                 | pass   |
|  30 | Pulumi is the deployment engine.                                                                                                              | `tests/deployment/preview.test.ts`; `evidence/17.12/acceptance-report.md`; `evidence/17.14/acceptance-report.md`                                                            | pass   |
|  31 | AWS is the first cloud target.                                                                                                                | `tests/deployment/aws-integration.test.ts`; `evidence/17.12/acceptance-report.md`                                                                                           | pass   |
|  32 | Deployment consumes a provider-neutral graph-derived plan.                                                                                    | `tests/deployment/plan.test.ts`; `tests/deployment/pulumi-mocks.test.ts`                                                                                                    | pass   |
|  33 | Preview, up, outputs, refresh, and destroy use the Automation API path.                                                                       | `tests/deployment/preview.test.ts`; `evidence/17.12/acceptance-report.md`                                                                                                   | pass   |
|  34 | Stable descriptor IDs preserve cloud identity across file moves.                                                                              | `tests/deployment/plan.test.ts`; `tests/deployment/pulumi-mocks.test.ts`; `evidence/17.12/acceptance-report.md`                                                             | pass   |
|  35 | An identical second update is a true no-op.                                                                                                   | `tests/deployment/plan.test.ts`; `tests/deployment/preview.test.ts`; `evidence/17.12/acceptance-report.md`                                                                  | pass   |
|  36 | An isolated acceptance stack is destroyed cleanly.                                                                                            | `evidence/17.12/acceptance-report.md`; `independent-cleanup-verification.json`                                                                                              | pass   |
|  37 | No plugin system or extension marketplace exists.                                                                                             | `evidence/17.14/acceptance-report.md`; scope scan                                                                                                                           | pass   |
|  38 | No alternate infrastructure engine is required.                                                                                               | `evidence/17.14/acceptance-report.md`; scope scan                                                                                                                           | pass   |
|  39 | No Rust component exists.                                                                                                                     | `evidence/17.14/acceptance-report.md`; scope scan                                                                                                                           | pass   |
|  40 | Out-of-scope concerns are absent from graph kinds, generated directories, inspector navigation, and implementation phases.                    | `evidence/17.14/acceptance-report.md`; `tasks.md`; scope and navigation scans                                                                                               | pass   |

## Focused verification

| Command                                                       | Result                                                                               |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| authoring/compiler/graph matrix                               | exit `0`; 26 tests, 374 assertions                                                   |
| engine/runtime/recovery matrix                                | exit `0`; 166 tests, 709 assertions                                                  |
| inspector/security/observability matrix                       | exit `0`; 64 tests, 433 assertions                                                   |
| `RELKIT_AWS_INTEGRATION=0 bun run test:deployment`              | exit `0`; 14 passed, 1 release-gated test skipped, 108 assertions                    |
| `bun run test:types`                                          | exit `0`                                                                             |
| `bun run scripts/secret-scan.ts`                              | exit `0`; 2,585 files, 339,269,125 bytes, zero matches                               |
| `bun run scripts/check-public-declarations.ts`                | exit `0`; 14 packages                                                                |
| `bun run check`                                               | exit `0`; 34 roots, 768 TypeScript files                                             |
| `bun run typecheck`                                           | exit `0`                                                                             |
| `bun run verify`                                              | exit `0`; fixed fail-fast pipeline passed; known Konsistent findings remain advisory |
| `openspec validate implement-relkit-typescript-poc-v3 --strict` | exit `0`                                                                             |
| focused Prettier and `git diff --check`                       | exit `0`                                                                             |

The first broad inspector run exposed a stale assertion that read the event
frame before consuming the stream's required `: connected` preamble. The
read-only contract test now consumes and asserts that preamble; no runtime
behavior changed. The isolated inspector matrix then passed 64/64.

The local deployment suite was run with the documented cloud opt-out. The
release-gated AWS lifecycle remains covered by `evidence/17.12/`: 66 resources
created, zero-change no-op, zero replacements after source move, 66 destroyed,
and zero live resources in independent cleanup verification.

The protected v3 source documents remain unchanged with checksums:

- technical spec: `d69f37f1ff0d157876d624e73bcf163162a73f531b3144e03ef566c672cbb183`
- review gates: `9f3d0225794ba7de12a5e7835a2f61ca2bc03ce4add8833cfdf21c2970aba464`

Owner signatures and Gate 16 approval remain intentionally blank for 17.18
and 17.20. No 17.18, 17.19, or 17.20 work was implemented.
