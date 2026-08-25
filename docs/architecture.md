# Architecture

ZSys has one source model: TypeScript descriptors are compiled into a
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
                                      |             |
                                      v             v
                         runtime manifest     OpenAPI/client/diagnostics
                                      |
                                      v
                         shared function engine
                                      |
                  +-------------------+-------------------+
                  |                   |                   |
               dev server          tests             Pulumi plan
```

`zsys check` is the compilation boundary. It discovers source descriptors,
validates schemas and references, sorts the graph canonically, computes its
hash, and writes `.zsys/generated/application.graph.json`,
`runtime.manifest.ts`, `openapi.json`, `client.ts`, and `diagnostics.json`.
Errors do not produce an activatable manifest. Convention warnings can still
produce a graph when compilation remains valid.

The runtime manifest contains executable references resolved from the graph;
the graph itself contains serializable metadata only. The same graph hash is
checked at development activation, build/start, inspector access, and
deployment planning.

## Authoring boundary

The executable primitive is a function. Routes, jobs, event triggers, tools,
and agents reference function descriptors. Mapping and event selectors are
serializable descriptor data, not arbitrary callbacks. Event handling uses the
generic `onEvent` trigger model; there is no separate subscription primitive.

Providers are selected by logical profile (`development`, `test`, or
`production`) and supplied through the handler context. Application code does
not import AWS SDK types, Pulumi types, or the internal Effect runtime. Effect
is an implementation detail of the engine and runtime packages.

## Development supervisor

`zsys dev` compiles a candidate, verifies its graph and health, and activates
it behind a stable development server. If a later compile or candidate
startup fails, the last known good candidate remains active and the diagnostic
is reported. Candidate activation drains the old server before shutdown and
flushes telemetry within bounded time.

The backend serves the versioned inspector protocol under `/_zsys/v1`. The
graph endpoint is:

```text
GET /_zsys/v1/graph
```

Inspector views must read the active graph, runtime state, requests, logs,
traces, jobs, events, and actions through that protocol. They must not infer
resources from source files or maintain a competing graph. The generated
configuration reserves port `3210` for inspector connectivity; the active
backend port is the source of truth for a running development session.

## Build and start

`zsys build` checks the project, emits deterministic files under
`.zsys/build`, and writes a production Dockerfile based on Bun `1.3.10`. The
image runs as a non-root user, excludes `.env` and local state, exposes health
endpoints, and handles `SIGTERM` by stopping new traffic, draining or
cancelling in-flight work, flushing telemetry, and exiting within its bound.

`zsys start` starts the built server only after validating the graph and
manifest hash. The health endpoints are:

```text
GET /_zsys/v1/health/live
GET /_zsys/v1/health/ready
```

Liveness means the process is running. Readiness also requires every graph-required
capability/profile binding to be ready; unused bindings are not instantiated.

## Deployment boundary

Deployment converts the checked graph to a pure deployment plan and then
executes the generated program through the Pulumi Automation API. Pulumi
state is the deployment state system. Resource names and identities use
stable descriptor IDs, so a source-file move does not replace an unchanged
resource and an unchanged graph produces a no-op update.

The deployment plan is data first: it contains managed resource metadata, dependency
edges, health, environment references, and IAM decisions, but not raw secret
values or Pulumi output objects. External bindings are omitted from provisioning
and IAM. AWS capability and configuration failures are reported before an apply.

## Observability and security

The runtime emits structured logs, metrics, traces, request records, and
durable job/event records through the configured provider and observability
interfaces. Body capture is off by default in generated projects. Diagnostic,
inspector, deployment, and generated artifacts redact secret values and keep
only safe environment status.

The graph, manifest, OpenAPI document, inspector API, and deployment plan are
cross-checked by their graph hash. A mismatch is a failure to diagnose, not a
reason to activate a partially compiled candidate.
