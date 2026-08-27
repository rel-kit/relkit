> Rebrand note (2026-08-27): This archived record was mechanically rebranded for RelKit. Commit `7178a4b1d` remains the byte-authoritative pre-rebrand record; external artifact and image digests remain historical values.

## Why

The repository is still a generic Turborepo starter and does not implement the approved RelKit TypeScript POC v3 baseline. This change turns the approved technical specification and its 17 review gates into an executable, reviewable implementation contract for a Bun/TypeScript framework whose public developer experience remains plain TypeScript while Effect, Hono, Next.js, Pulumi, and AWS stay behind framework boundaries.

## What Changes

- **BREAKING**: Replace the starter `apps/web`, `apps/docs`, and `@repo/*` example topology with the v3 RelKit monorepo package/app/template topology and strict dependency-boundary checks.
- Add Standard Schema-compatible schemas, value-free environment declarations, stable IDs/references, structured diagnostics, and immutable public descriptors for apps, functions, routes/function-backed middleware, jobs, events/listeners, buckets, cache, tools, and agents.
- Add isolated descriptor discovery, deterministic normalization and validation, a canonical serializable graph, a hash-matched executable runtime manifest, compatibility diffing, OpenAPI 3.1, and a generated TypeScript HTTP client.
- Add one internal Effect-based function engine used by direct, HTTP, job, event, tool, and generated-agent invocations, while keeping Effect types and APIs out of application-facing contracts.
- Add graph-driven Hono HTTP materialization, global environment/profile-based providers, local bucket/cache/job/event/model providers, durable at-least-once jobs and event listeners, bounded agents, and the public Promise-based context bridge.
- Add correlated and secret-redacted request records, logs, traces, local retention/query APIs, SSE streaming, safe candidate activation, and a Next.js inspector that consumes only versioned APIs.
- Add the `relkit` CLI, atomic `create-relkit` scaffolder, generated project templates/tests, provider-neutral deployment planning, Pulumi Automation API commands, and the first AWS runtime/resource mapping.
- Add deterministic test, recovery, browser, generator, container, security, Pulumi, and release-acceptance workflows that map implementation phases 0–16 to review gates 0–16 with durable fresh-task handoffs.
- Enforce v3 scope exclusions: no persistence/identity/workflow/knowledge-store framework primitives, plugin/marketplace, separate subscription primitive, alternate infrastructure engine, or Rust component.

## Capabilities

### New Capabilities

- `workspace-foundation`: Reproducible Bun/TypeScript workspace, package ownership, dependency boundaries, CI, and architectural scope guardrails.
- `public-authoring`: Standard Schema and environment contracts, immutable descriptors, typed references/context, convention warnings, and global logical provider configuration.
- `compiler-graph`: Isolated discovery, semantic diagnostics, deterministic canonical graph/hash, executable manifest, generated artifacts, and compatibility diffing.
- `function-runtime`: Internal Effect lifecycle and logging kernel, common function invocation engine, cancellation, validation, concurrency, declared dependencies, and deterministic test harness.
- `http-runtime`: Graph-driven Hono routes, request/response mapping, health and versioned internal endpoints, OpenAPI 3.1, generated client, and HTTP testing.
- `managed-resources`: Global providers plus typed bucket and cache contracts, local implementations, readiness/lifecycle behavior, and reusable provider conformance suites.
- `jobs-events`: Typed jobs, schedules, versioned event publication, generic `onEvent` trigger bindings, ephemeral/durable delivery, retry, leases, dead-lettering, and restart recovery.
- `tools-agents`: Function-backed tools, approval policy, bounded agents, logical model profiles, generated agent functions, deterministic fake models, and safe telemetry.
- `observability`: Correlated request/log/span records, redaction-before-sink, bounded local storage, query protocols, body-capture policy, and cursor-based SSE.
- `development-inspector`: Last-known-good development supervisor, atomic generation switching/draining, protected versioned inspector APIs, and the complete Next.js inspector UI.
- `cli-scaffolding`: RelKit CLI commands, environment/doctor workflows, atomic `create-relkit` generation, templates, and packed-project acceptance.
- `pulumi-aws-deployment`: Provider-neutral deployment plans, Pulumi Automation API lifecycle, stable AWS resource identities, runtime mappings, security, and cleanup verification.
- `acceptance-verification`: Layered tests, deterministic verification, secret and boundary scans, performance baselines, documentation verification, and release-gate evidence.

### Modified Capabilities

None. The repository has no existing OpenSpec capability specifications.

## Impact

- **Code and ownership**: replaces the starter workspace with `apps/inspector`, `apps/fixture-commerce`, the package set defined by v3 Section 6, root acceptance tests/scripts, and `templates/default`.
- **Public APIs**: introduces `@relkit/app`, `@relkit/schema`, `@relkit/config`, descriptor capability packages, `@relkit/testing`, the `relkit` binary, and `create-relkit`; applications author ordinary sync/async TypeScript handlers and Standard Schema-compatible contracts.
- **Internal systems**: introduces compiler/evaluator processes, graph and manifest generation, Effect runtime services, Hono materialization, local durable state, observability storage, supervisor proxying, Next.js inspector, deployment planning, and Pulumi/AWS integrations.
- **Dependencies**: adds the v3-approved dependencies only, including Effect, Hono, a supported schema implementation, Next.js/React, Playwright, Pulumi packages, selected AWS integrations, and an internally wrapped cron parser where required.
- **Generated/runtime data**: adds deterministic `.relkit/generated` and `.relkit/build` outputs plus ignored local `.relkit/state` and `.relkit/observability` data; graph artifacts never contain resolved secrets or executable closures.
- **Delivery**: each checkbox runs in a fresh Luna (max) task with durable change notes on the visible change branch; implementation proceeds strictly through phases and gates 0–16, and a later phase cannot start until its prerequisite committed candidate and gate evidence are reproducible from a clean worktree and merged.
