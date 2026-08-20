## Why

ZSYS currently makes reusable functions feel less like ordinary TypeScript by conflating HTTP transport data with invocation input, requiring repeated IDs and function dependency declarations, and wrapping function logic again for tools. Domain services and AI agents also lack a cohesive grouping and provider model, so related functions cannot share policy, documentation, context, and observability without manual repetition.

## What Changes

- Add first-class services that group named functions, expose members such as `OrderService.getOrder`, apply invocation-wide middleware and scoped context enrichment, and group operations in the graph, logs, traces, OpenAPI, and Scalar.
- Separate immutable HTTP request parameters, query values, headers, and body metadata from reusable function input while retaining automatic route-to-input mapping for matching business fields.
- **BREAKING** Replace declared function-client calls through `context.functions` with normal `await target.invoke(input)` calls. Calls use the active ZSYS engine automatically, fall back to the standalone engine outside an application invocation, retain validation/lifecycle/telemetry, and record observed call edges without a duplicate dependency declaration.
- Add `FunctionDescriptor.asTool(...)`; functions remain the only owner of business handlers, and tool safety metadata remains mandatory unless already declared by the function.
- Add standalone `.invoke(...)` to function and tool descriptors while preserving tool validation, timeout, side-effect, and approval enforcement.
- Make IDs optional for source-scoped functions, routes, services, tools, agents, errors, middleware, and transforms; infer filesystem-safe hierarchical IDs from source/export/member structure and keep explicit overrides. Durable application, event, job, bucket, and cache IDs remain mandatory.
- Make declared-error retry optional with a safe non-retryable default and support a retry-later minimum delay using `afterMs`.
- **BREAKING** Replace the custom agent model-provider loop, `modelProfile`, and handwritten OpenAI protocol adapter with AI SDK v7 agents, tools, provider registry, and test doubles. Configure both `defaultProvider` and `defaultModel`; agents may omit `model`, select a provider default, or use an AI SDK registry model ID.
- Update generated templates so the agent example derives a tool from a function and the API example demonstrates one event independently fanning out to useful service listeners.

## Capabilities

### New Capabilities

- `service-orchestration`: First-class service membership, shared invocation middleware, scoped context, inherited metadata, documentation grouping, and service-aware observability.

### Modified Capabilities

- `public-authoring`: Structured request data, optional inferred source-scoped IDs, direct function invocation, function-derived tools, optional error retry metadata, and explicit durable-ID boundaries.
- `function-runtime`: Ambient and standalone descriptor invocation, dynamic child invocation, runtime cycle protection, observed call edges, and service middleware execution through the common engine.
- `compiler-graph`: Deterministic hierarchical ID derivation, collision diagnostics, service nodes and membership, service metadata propagation, and removal of mandatory declared function-call edges.
- `http-runtime`: Structured route request parameters, reusable input mapping, distinct OpenAPI parameter/body projection, and service-based OpenAPI/Scalar grouping.
- `tools-agents`: Function/tool invocation ergonomics, function-derived tool safety, AI SDK v7 execution, provider/default-model resolution, and official deterministic model testing.
- `jobs-events`: Retryable declared-error delay hints and a clear independent event-fan-out contract exercised by generated examples.
- `observability`: Service identity and dynamically observed function-call relationships on logs, spans, and invocation records.
- `cli-scaffolding`: Generated service, function-derived agent tool, multi-provider model configuration, and useful event fan-out examples.
- `acceptance-verification`: Type, compiler, runtime, HTTP, service, AI, retry, template, migration, and packaged-product coverage for the revised authoring model.

## Impact

- Affects public APIs in `@zsys/functions`, `@zsys/routes`, `@zsys/tools`, `@zsys/agents`, `@zsys/app`, and a new service authoring surface, plus compiler discovery/normalization, graph contracts, the common engine, Hono/OpenAPI materialization, observability, templates, documentation, and tests.
- Adds AI SDK v7 and official provider packages in place of the custom model protocol and direct OpenAI HTTP adapter; application descriptors continue to store only serializable configuration and environment references.
- Removes the function-to-function portion of declared dependency maps; jobs, events, buckets, caches, agents, and other provider-backed capabilities remain explicit dependencies.
- Requires a pre-1.0 migration for `context.functions`, `modelProfile`, custom model providers, and affected generated agent projects. Existing explicit descriptor IDs and `defineTool({ target })` remain supported.
