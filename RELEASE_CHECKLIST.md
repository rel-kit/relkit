# ZSys Gate 16 Release Checklist

Use this checklist for the release candidate described by [Gate 16](docs/zsys-typescript-poc-review-gates-v3.md#gate-16--final-release-acceptance). Every evidence slot must name a reproducible command output, artifact path, checksum, or review record. An empty slot or `NOT RUN` result is not approval.

## Candidate record

| Field                    | Value                                       |
| ------------------------ | ------------------------------------------- |
| Release/version          |                                             |
| Base commit              |                                             |
| Candidate commit         |                                             |
| Verification environment |                                             |
| Prepared by / date       |                                             |
| Gate status              | `[ ] pending` `[ ] rejected` `[ ] approved` |

## Required Gate 16 evidence

| Required item                                   | Command or source                                         | Evidence slot | Result / reviewer |
| ----------------------------------------------- | --------------------------------------------------------- | ------------- | ----------------- |
| Clean frozen install                            | `bun install --frozen-lockfile`                           |               |                   |
| Full verification output                        | `bun run verify`                                          |               |                   |
| Playwright/browser output                       | `bun run test:e2e`                                        |               |                   |
| Container lifecycle output                      | `bun run test:container`                                  |               |                   |
| Packed `create-zsys` smoke output               | `bun run scripts/pack-and-smoke-create-zsys.ts`           |               |                   |
| Performance baseline and environment            | `bun run scripts/performance.ts`                          |               |                   |
| Recursive synthetic-secret scan                 | Gate 16 security scan record                              |               |                   |
| Public declaration scan                         | `bun run scripts/check-public-declarations.ts`            |               |                   |
| Generated artifact checksum list                | Release artifact/checksum record                          |               |                   |
| Isolated AWS acceptance and destroy report      | `bun run test:deployment` plus release-gated AWS evidence |               |                   |
| Reviewed [`RELEASE_NOTES.md`](RELEASE_NOTES.md) | Package/template/checksum release output                  |               |                   |
| Completed checklist                             | This file, including all criteria and signatures          |               |                   |

## Gate 16 reproduction commands

Record the exact transcript, exit code, duration, and generated-output/no-diff result for each command.

|   # | Reproduction command                                                                | Evidence slot | Exit code / reviewer |
| --: | ----------------------------------------------------------------------------------- | ------------- | -------------------- |
|   1 | `bun install --frozen-lockfile`                                                     |               |                      |
|   2 | `bun run verify`                                                                    |               |                      |
|   3 | `bun run test:e2e`                                                                  |               |                      |
|   4 | `bun run test:container`                                                            |               |                      |
|   5 | `bun run scripts/pack-and-smoke-create-zsys.ts`                                     |               |                      |
|   6 | `bun run test:deployment`                                                           |               |                      |
|   7 | Release-gated AWS integration, smoke, destroy, and independent cleanup verification |               |                      |

## Final reviewer questions

|   # | Acceptance question                                                       | Evidence slot | Answer / reviewer |
| --: | ------------------------------------------------------------------------- | ------------- | ----------------- |
|   1 | Can a new developer create and run a project using only the docs?         |               |                   |
|   2 | Does every execution source converge on the function engine?              |               |                   |
|   3 | Does the inspector show exactly the active graph?                         |               |                   |
|   4 | Can request logs and traces be previewed live?                            |               |                   |
|   5 | Are event listeners modeled as triggers rather than a separate primitive? |               |                   |
|   6 | Is Effect fully internal to the public developer experience?              |               |                   |
|   7 | Is Pulumi the only deployment engine?                                     |               |                   |
|   8 | Do file moves preserve stable graph/cloud identity?                       |               |                   |
|   9 | Can durable jobs/events recover with documented duplicate semantics?      |               |                   |
|  10 | Did recursive secret scans pass?                                          |               |                   |
|  11 | Can the cloud acceptance stack be destroyed cleanly?                      |               |                   |

## Final POC acceptance criteria

### 25.1 Authoring

| Check | Criterion                                                                   | Evidence slot | Reviewer / result |
| ----- | --------------------------------------------------------------------------- | ------------- | ----------------- |
| `[ ]` | A generated project uses the directory and suffix conventions in Section 5. |               |                   |
| `[ ]` | Convention violations produce warnings and do not remove descriptors.       |               |                   |
| `[ ]` | Functions are the only authored handlers.                                   |               |                   |
| `[ ]` | Routes, jobs, event triggers, and tools target functions.                   |               |                   |
| `[ ]` | Event authoring uses `defineEvent` and `onEvent`.                           |               |                   |
| `[ ]` | Application examples use normal async TypeScript and Standard Schema.       |               |                   |
| `[ ]` | Public declarations expose no Effect types.                                 |               |                   |

### 25.2 Compilation and graph

| Check | Criterion                                                              | Evidence slot | Reviewer / result |
| ----- | ---------------------------------------------------------------------- | ------------- | ----------------- |
| `[ ]` | One deterministic graph describes all managed concepts.                |               |                   |
| `[ ]` | The runtime manifest hash matches the graph hash.                      |               |                   |
| `[ ]` | Routes and event listeners compile to generic trigger nodes.           |               |                   |
| `[ ]` | No executable closure or resolved secret appears in graph JSON.        |               |                   |
| `[ ]` | Two clean compilations from different paths produce identical outputs. |               |                   |
| `[ ]` | Graph diff identifies breaking contract changes.                       |               |                   |

### 25.3 Runtime

| Check | Criterion                                                                                            | Evidence slot | Reviewer / result |
| ----- | ---------------------------------------------------------------------------------------------------- | ------------- | ----------------- |
| `[ ]` | All execution paths use the same function engine.                                                    |               |                   |
| `[ ]` | Cancellation reaches `ctx.signal`.                                                                   |               |                   |
| `[ ]` | Declared errors, timeouts, cancellations, provider failures, and defects are distinguished.          |               |                   |
| `[ ]` | All framework terminal logs use Effect logging sinks.                                                |               |                   |
| `[ ]` | Global provider selection works for development, test, and production.                               |               |                   |
| `[ ]` | Local jobs and durable event listeners recover after restart with documented at-least-once behavior. |               |                   |

### 25.4 Inspector

| Check | Criterion                                                                                                                                                                   | Evidence slot | Reviewer / result |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------- |
| `[ ]` | The Next.js inspector shows graph, routes, functions, jobs, events/listeners, buckets, cache, tools, agents, requests, logs, traces, environment metadata, and diagnostics. |               |                   |
| `[ ]` | A request appears live and links to its trace.                                                                                                                              |               |                   |
| `[ ]` | Invalid source does not stop the last valid generation.                                                                                                                     |               |                   |
| `[ ]` | The inspector consumes only versioned APIs.                                                                                                                                 |               |                   |
| `[ ]` | Secret values are not exposed.                                                                                                                                              |               |                   |

### 25.5 Project creation and testing

| Check | Criterion                                                                                                                                          | Evidence slot | Reviewer / result |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------- |
| `[ ]` | `bunx create-zsys@latest my-app` produces a complete project.                                                                                      |               |                   |
| `[ ]` | The generated project passes install, check, typecheck, test, and build.                                                                           |               |                   |
| `[ ]` | The example route runs and appears in the inspector.                                                                                               |               |                   |
| `[ ]` | The framework test suite covers type, compiler, graph, provider, runtime, restart, browser, generator, deployment, container, and security layers. |               |                   |
| `[ ]` | `bun run verify` is deterministic and documented.                                                                                                  |               |                   |

### 25.6 Deployment

| Check | Criterion                                                                 | Evidence slot | Reviewer / result |
| ----- | ------------------------------------------------------------------------- | ------------- | ----------------- |
| `[ ]` | Pulumi is the deployment engine.                                          |               |                   |
| `[ ]` | AWS is the first cloud target.                                            |               |                   |
| `[ ]` | Deployment consumes a provider-neutral plan derived from the graph.       |               |                   |
| `[ ]` | Preview, up, outputs, refresh, and destroy work through Automation API.   |               |                   |
| `[ ]` | Stable descriptor IDs preserve cloud resource identity across file moves. |               |                   |
| `[ ]` | A no-op update is actually a no-op.                                       |               |                   |
| `[ ]` | An isolated acceptance stack can be destroyed cleanly.                    |               |                   |

### 25.7 Scope integrity

| Check | Criterion                                                                                                                                           | Evidence slot | Reviewer / result |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------- |
| `[ ]` | No plugin system or extension marketplace exists in the POC.                                                                                        |               |                   |
| `[ ]` | No alternate infrastructure engine is required.                                                                                                     |               |                   |
| `[ ]` | No Rust component exists.                                                                                                                           |               |                   |
| `[ ]` | Out-of-scope application concerns do not appear as graph node kinds, generated project directories, inspector navigation, or implementation phases. |               |                   |

## Owner sign-off

Each role must sign after reviewing the evidence. If one person covers multiple roles, each applicable row still requires a separate recorded approval.

| Owner role                   | Name | Signature / approval | Date | Evidence reviewed |
| ---------------------------- | ---- | -------------------- | ---- | ----------------- |
| Compiler/graph owner         |      |                      |      |                   |
| Runtime/reliability owner    |      |                      |      |                   |
| Developer-experience owner   |      |                      |      |                   |
| Observability/security owner |      |                      |      |                   |
| Inspector/frontend owner     |      |                      |      |                   |
| Cloud/deployment owner       |      |                      |      |                   |
| Release owner                |      |                      |      |                   |

## Gate decision

Approve Gate 16 only when every required evidence item, acceptance criterion, checksum, documentation run, and owner sign-off is complete. Reject the candidate for any missing result or for a new developer workflow failure, execution path that bypasses the engine, inspector/graph mismatch, secret leak, subscription primitive, public Effect leak, non-Pulumi deployment path, unstable file-move identity, unproven durable recovery/duplicate behavior, or incomplete cloud cleanup.

| Decision              | Name | Signature / approval | Date | Notes / evidence |
| --------------------- | ---- | -------------------- | ---- | ---------------- |
| `[ ]` Approve Gate 16 |      |                      |      |                  |
| `[ ]` Reject Gate 16  |      |                      |      |                  |
