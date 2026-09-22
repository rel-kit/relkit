## Why

RELKIT's current jobs enqueue function targets, while durable background work needs its own executable, replay contract, native lifecycle, and typed observation. This change makes tasks and jobs a complete, independently implementable contract, incorporating every requirement of the supplied v1.1 brief and resolving its assumptions against repository commit `ebae8ff03ef6fb306d7384eef69eba2d3ec3838a`.

## What Changes

### Current completion scope

The implementation and public catalog continue to contain the three provider adapters described below. For this change's completion gate, certification is intentionally limited to the account-free local Inngest and PostgreSQL-backed effect-mq Docker paths. Trigger native/Docker evidence is deferred by an explicit implementation decision, and Pulumi, AWS, and managed-cloud evidence are deferred as well. Deferred modes remain labeled not-tested; this scope decision does not claim support or remove their implementation.

- **BREAKING:** Add `defineTask` with explicit stable ID/version, schemas, handler, durable/retryable context, readable durations, retries, resources, concurrency, progress, streams, and observational hooks. Change `defineJob` to bind a task with required literal camelCase `name`, optional durable `id`, `service`, schedules, and explicit client policy.
- **BREAKING:** Author services with `jobs` / `defaults.jobs` and submit with `.trigger()`. Keep a one-release, explicitly enabled legacy path for function-target jobs and their unchanged `.enqueue()` receipts; preserve historical executions and require migration diagnostics.
- Resolve implicit/default bindings deterministically. Preserve distinct API name, durable task/job IDs, graph identity, semantic version, immutable build, and service generation.
- Implement exactly three new integrations: `@relkit/inngest`, `@relkit/trigger`, and `@relkit/effect-mq`. Certify each SDK/backend/deployment variant separately. Require account-free durable tasks and native scheduling with `docker(inngest())`; provide PostgreSQL-backed retryable `docker(effectMq())` and separately certified `docker(trigger())`.
- Add native acceptance/query/control/scheduling, immutable routable run handles, ambiguous-write recovery, replay-safe execution, worker publication, historical-build draining, and compatible composite Docker recipes.
- Extend the existing oRPC contract with `client.jobs.exportOrders.*`, a browser-safe `JobRegistry`, an imperative watch controller, and TanStack hooks. Enforce trusted scope and projection before reads, pagination, or streaming.
- Extend the existing Inspector Jobs area with separate definitions, runs, schedules, and services; bounded native filtering and pagination; live detail; partial-service results; and authorized controls.
- Deliver package/export boundaries, CLI and scaffold integration, migration, executable docs/examples, and native fault/conformance evidence as release requirements.
- Close the reviewed integration details: actual generated-server activation, schema identity and canonical-value reuse, suspension/error handling, policy edge cases, stable idempotency and unknown-write recovery, watch ownership, trusted scheduled scope, lossless bounded pagination and schedule reconciliation. The design's RG01–RG13 checklist maps these refinements to implementation tasks and required regressions.
- Exclude public workflows, checkpoints/steps, joins, signals, cross-provider in-flight migration, and any mandatory second jobs state store or universal run journal. Existing agents, graph checkpoints, event delivery, and non-jobs integrations retain their owners.

## Capabilities

### New Capabilities

- `task-runtime`: Task authoring, canonical payloads, shared triggering, native execution semantics, policies, replay, and versioned identity.
- `typed-job-client`: Private-by-default job exposure, generated procedures/types, authorization, projections, watch lifecycle, named streams, and React integration.
- `jobs-provider-integrations`: Native SPI and deployment-specific certification for Inngest, Trigger.dev, and effect-mq.

### Modified Capabilities

- `public-authoring`: Distinct task handlers, task-target jobs, named APIs, configuration, and source conventions.
- `jobs-events`: Replace new-job function/queue semantics, retries and scheduling while preserving legacy jobs and event delivery.
- `compiler-graph`: Task discovery, kind-aware identity, job binding, deterministic manifests, graph edges, and capability validation.
- `function-runtime`: Shared scoped triggering and worker-safe context without converting functions into tasks.
- `service-orchestration`: Identity-preserving task/job domain members.
- `domain-services`: Task/job membership and domain boundaries.
- `provider-bindings`: Public plural jobs configuration over the existing singular `job` capability.
- `local-provider-services`: Versioned composite recipes, owned workers, persistent recovery, and safe reset.
- `development-inspector`: Task/job definition and native run workflows, filters, controls, and bounded observation.
- `observability`: Detached task execution, native lifecycle evidence, redaction, and bounded metrics.
- `http-runtime`: Secure jobs RPC dispatch and contract negotiation within existing transports.
- `cli-scaffolding`: Jobs commands, native Docker choices, and generated task applications.
- `developer-documentation`: Full task/job guides, reference generation, migration, and executable examples.
- `pulumi-aws-deployment`: Native worker publication, activation ordering, rollout/rollback, and retained bindings through existing Pulumi ownership.
- `acceptance-verification`: TJ-001–TJ-045, F01–F28, package/type/browser/native gates and evidence.
- `workspace-foundation`: Optional integration packages and cycle-free/browser-safe contract ownership.

## Impact

Core changes span `packages/jobs`, `contracts`, `schema`, `app`, `functions`, `invocation`, `engine`, `runtime-effect`, `compiler`, `graph`, `provider`, `services`, `local-service`, `runtime-hono`, `client-generator`, `client`, `inspector-api`, `testing`, `deploy`, `deploy-pulumi`, `cli`, and `create-relkit`. Integration work stays under `integrations/packages/{inngest,trigger,effect-mq,local,docker}` and `integrations/catalog`; product work extends `apps/inspector`, `apps/docs`, `examples/commerce`, templates, scripts, and CI.

The change's `design.md`, delta specs, and `tasks.md` are the implementation source of truth. They contain the complete contract and traceability; the original plan is provenance only and is not an implementation dependency. All ten phases remain inside this one change. Native feasibility is an explicit first implementation gate, not a claim that any provider mode has already passed. No implementation, installation, provider provisioning, or release publication is performed by this proposal.
