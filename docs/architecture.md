# Architecture

RelKit has one source model: TypeScript descriptors are compiled into a
canonical application graph and a runtime manifest. Development, tests, the
inspector, and deployment consume those outputs instead of rebuilding a
second model.

## Compile and run

```text
source descriptors
        |
        v
isolated discovery and evaluation
        |
        v
normalized descriptors -> canonical graph -> graph hash
                 |                 |                  |
                 v                 v                  v
       runtime manifest   integration/local plans   OpenAPI/client/diagnostics
                 |                 |
                 +--------+--------+
                          v
               shared function engine
                                      |
                  +-------------------+-------------------+
                  |                   |                   |
               dev server          tests             Pulumi plan
```

`relkit check` is the compilation boundary. It discovers source descriptors,
validates schemas and references, sorts the graph canonically, computes its
hash, and writes `.relkit/generated/application.graph.json`,
`runtime.manifest.ts`, runtime-integration and local-service plans, `openapi.json`,
`client.ts`, and `diagnostics.json`.
Errors do not produce an activatable manifest. Convention warnings can still
produce a graph when compilation remains valid.

The runtime manifest contains executable references resolved from the graph;
the graph itself contains serializable metadata only. A composite activation
fingerprint covers the graph, manifest, runtime-integration plan, local-service
plan, and provider overrides. Development, build/start, and the Inspector reject
stale or mismatched members before activation.

## Authoring boundary

The executable primitive is a function. Routes, jobs, event triggers, tools,
and agents reference callable function descriptors. `defineEventFunction` authors
an event-only function plus a generated exact-event trigger. Event contracts stay
handler-free; `publishes` declares exact publication capabilities. Delivery and
replay are the only allowed invocation sources for event-only functions.

`defineApp` binds singular capabilities to direct adapters or named physical
profiles. Source forms are connected, local-only, local overlays such as
`docker(redis())`, or infrastructure wrappers such as `aws(s3())`. Logical
profile selection is independent of environment names. Tests supply explicit
capability/profile replacements.

Named provider connection values are distinct from `defineEnv` and never become
handler-visible `ctx.env`. Application code does not import AWS SDK types,
Pulumi types, or the internal Effect runtime. Effect is an implementation detail
of the engine and runtime packages.

## Development supervisor

`relkit dev` compiles a candidate, verifies its graph and health, and activates
it behind a stable development server. If a later compile or candidate
startup fails, the last known good candidate remains active and the diagnostic
is reported. Candidate activation drains the old server before shutdown and
flushes telemetry within bounded time.

Compilation writes local recipe data without probing Docker. Development
reconciles only graph-required recipes, scopes containers and volumes to the
canonical project identity, and waits for health before readiness. `--local=off`
disables recipes and requires normal binding values instead.

The backend serves the versioned inspector protocol under `/_relkit/v1`. The
graph endpoint is:

```text
GET /_relkit/v1/graph
```

Inspector views must read the active graph, runtime state, requests, logs,
traces, jobs, events, and actions through that protocol. They must not infer
resources from source files or maintain a competing graph. The generated
configuration reserves port `3210` for inspector connectivity; the active
backend port is the source of truth for a running development session.

## Build and start

`relkit build` checks the project, emits deterministic files under
`.relkit/build`, and writes a production Dockerfile based on Bun `1.3.10`. The
image runs as a non-root user, excludes `.env` and local state, exposes health
endpoints, and handles `SIGTERM` by stopping new traffic, draining or
cancelling in-flight work, flushing telemetry, and exiting within its bound.

`relkit start` starts the built server only after validating the graph and
manifest hash. The health endpoints are:

```text
GET /_relkit/v1/health/live
GET /_relkit/v1/health/ready
```

Liveness means the process is running. Readiness also requires every graph-required
capability/profile binding to be ready; unused bindings are not instantiated.

## Deployment boundary

Deployment converts the checked graph to a pure deployment plan and then
executes the generated program through the Pulumi Automation API. Pulumi
state is the deployment state system. Resource names and identities use
stable descriptor IDs, so a source-file move does not replace an unchanged
resource and an unchanged graph produces a no-op update.

The deployment plan is data first and separates engine, host, connected wiring,
infrastructure operations, and access operations. It contains no raw secret values
or Pulumi output objects. Connected bindings create no lifecycle or implicit access;
only an infrastructure wrapper can emit those operations. Docker recipes never
participate in deployment.

Pulumi consumes generic deployment operations. AWS independently implements ECS
hosting, S3 and Redis/Valkey infrastructure, least-privilege access, and CloudWatch
stdout routing. Unsupported role or adapter combinations fail before preview.

## Observability and security

The runtime emits structured logs, metrics, traces, request records, and durable
job/event records. Capture and redaction precede bounded local Inspector
persistence; root-consistent trace sampling and minimum log severity apply only
to external exporter fan-out. Sentry and OTLP fail independently, and exporter
failures become redacted local-only diagnostics. AWS routes redacted stdout to
CloudWatch as a host concern rather than an application exporter.

The graph, manifest, OpenAPI document, inspector API, and deployment plan are
cross-checked by their graph hash. A mismatch is a failure to diagnose, not a
reason to activate a partially compiled candidate.
