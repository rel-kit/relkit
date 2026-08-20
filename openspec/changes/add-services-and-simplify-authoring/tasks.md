## 1. Contract and Baseline

- [ ] 1.1 Strictly validate the proposal, design, and all ten capability deltas; resolve every schema, delta-operation, and scenario error before implementation
- [ ] 1.2 Run the existing function-engine, compiler, HTTP, tools/agents, jobs/events, observability, generator, commerce, and phase-zero focused suites and record any pre-existing failures without modifying unrelated dirty work
- [ ] 1.3 Read the repository structural-export guidance, map the package dependency changes, and update workspace/TypeScript/Turborepo boundaries for one dependency-neutral invocation package and `@zsys/services` without introducing cycles

## 2. Shared Invocation and Function Calls

- [ ] 2.1 Extract the existing validation, Effect handler lifecycle, failure normalization, default context, and structural invocation contracts into the shared invocation package with parity tests before changing public behavior
- [ ] 2.2 Add the `AsyncLocalStorage` dispatcher scope, isolated standalone dispatcher, local structured context, and explicit unconfigured-managed-dependency failure without a process-global default runtime
- [ ] 2.3 Add canonical descriptor identity binding, process-local unbound identities, invocation-chain tracking, and safe direct/dynamic-cycle rejection in the shared kernel
- [ ] 2.4 Rewire `@zsys/engine` through the shared kernel while preserving generation registry verification, provider clients, admission, deadlines, cancellation, hooks, parent identity, and current invocation outcomes
- [ ] 2.5 Add typed non-enumerable frozen `FunctionDescriptor.invoke(input)` and ensure active calls resolve through the current generation while standalone calls use the isolated kernel
- [ ] 2.6 Emit correlated child invocation records and observed `calls-function` edges for descriptor calls without mutating the canonical graph
- [ ] 2.7 Migrate repository handlers from `context.functions` to descriptor `invoke`, then remove function entries from public dependency maps/clients and remove compiler reliance on declared function-call cycles while retaining managed-resource dependency enforcement
- [ ] 2.8 Add focused type/runtime tests for standalone calls, nested calls, concurrent runtime isolation, inherited trace/deadline/cancellation, invalid input/output/errors, provider absence, recursion, dynamic cycles, and cleanup

## 3. Service and Tool Authoring

- [ ] 3.1 Add the `@zsys/services` package, public exports, strict descriptor/ref/type guards, reserved-member validation, deep-freeze behavior, and `@zsys/app` re-export
- [ ] 3.2 Implement `defineService({ functions, middleware })` with a non-empty typed function map and direct service-member facades that reuse original schemas, errors, targets, and handlers
- [ ] 3.3 Implement `defineServiceMiddleware` with a non-business policy callback, exactly-once `Promise<void>` continuation, immutable per-invocation context patches, around-`next` cleanup, declared rejection normalization, and single-service ownership validation
- [ ] 3.4 Add optional function tool metadata and typed `FunctionDescriptor.asTool(options?)` over the existing function-targeted tool contract, including zero-argument metadata checks and inferred/explicit tool identity
- [ ] 3.5 Add typed non-enumerable frozen `ToolDescriptor.invoke(input, options?)` through the tool runtime with input validation, timeout, source attribution, and fail-closed approval resolution
- [ ] 3.6 Add public type and descriptor-cohort tests for service members, middleware, `invoke`, `asTool`, direct tool invocation, invalid members, incomplete metadata, approval absence, and immutable declarations

## 4. Inferred Identity, Compiler, and Graph

- [ ] 4.1 Extend TypeScript discovery facts to identify optional-ID factory bindings, default/named exports, route operations, service members, and direct local `defineError` const bindings without evaluating additional modules
- [ ] 4.2 Implement the deterministic source hierarchy, export/member, declared-error binding, and route method/path ID encoders with explicit-ID precedence and the existing filesystem-safe grammar
- [ ] 4.3 Make eligible authoring factories accept omitted IDs with internal unbound identity while keeping app, event, job, bucket, and cache IDs mandatory in types and runtime validation
- [ ] 4.4 Normalize inferred identities before reference validation, report ambiguous inference and mixed explicit/inferred collisions with every source location, and classify inferred source moves versus explicit-ID moves correctly
- [ ] 4.5 Generate identity-binding runtime wrappers for exported descriptors and nested errors so registry targets, error instances, service facades, tool views, logs, and traces use canonical IDs
- [ ] 4.6 Add service graph nodes, ordered membership/middleware relationships, source metadata, registration-plan entries, compatibility diffing, and inspector-safe projections while keeping function calls out of declared canonical edges
- [ ] 4.7 Bump graph/manifest contracts together and update canonicalization, validation, generated manifest typing, boundary rules, and stale-version rejection for the new service/identity shapes
- [ ] 4.8 Add deterministic compiler fixtures for all eligible kinds, root/dynamic/catch-all routes, service-member IDs, `InvalidError`, explicit overrides, ambiguity, collisions, shuffled roots/order, manifest binding, and graph-hash stability

## 5. Service Runtime, HTTP, and Observability

- [ ] 5.1 Materialize service policy in the engine for HTTP, direct, job, event, tool, and agent sources with input-validation/admission-before-middleware and output-validation-after-unwind ordering
- [ ] 5.2 Enforce immutable isolated service context, raw-request protection, concurrent invocation separation, middleware short-circuit/failure behavior, and service attribution during standalone invocation
- [ ] 5.3 Extend the framework-neutral `FunctionRequest` and Hono request materialization with immutable params, repeated query/header values, and transport metadata while leaving non-HTTP requests absent
- [ ] 5.4 Change route inference to map matching path fields into reusable input, retain unmatched parameters only on the request, preserve explicit mappings, and keep Next-compatible duplicate dynamic-name rejection
- [ ] 5.5 Propagate service identity through graph planning, invocation/log/span records, query/SSE/inspector contracts, and redaction so context values are not captured by default
- [ ] 5.6 Emit deterministic OpenAPI top-level service tags and operation tags, distinct path/query/header/body schemas, Scalar grouping, and matching generated-client types
- [ ] 5.7 Add focused HTTP/service tests for nested parameters, unmatched input fields, repeated query values, immutability, middleware order across sources, context leakage, OpenAPI/runtime parity, Scalar tags, and observed child calls

## 6. Declared Error Retry Semantics

- [ ] 6.1 Make declared-error `id` and `retry` optional, normalize omission and legacy strings, validate `{ kind: "later", afterMs }`, and bind inferred IDs into created error instances and safe envelopes
- [ ] 6.2 Map retryable HTTP errors with `afterMs` to rounded-up `Retry-After` headers without repeating the function invocation
- [ ] 6.3 Update job and durable event retry decisions so non-retryable declared application errors stop and retryable delays use `max(policyDelay, afterMs)` within attempts/deadline/cancellation bounds
- [ ] 6.4 Add deterministic clock tests for omitted retry, legacy forms, both delay orderings, exhausted attempts, HTTP one-shot behavior, and direct/tool non-retry behavior

## 7. AI SDK v7 Agents and Providers

- [ ] 7.1 Add pinned AI SDK v7 core plus official OpenAI and Anthropic adapters, update dependency/boundary metadata, and add serializable per-environment `modelProviders` with required `defaultProvider` and `defaultModel`
- [ ] 7.2 Validate model-provider names/defaults/environment references without resolving secrets during discovery, and construct the active AI SDK provider registry only after environment resolution
- [ ] 7.3 Replace agent `modelProfile` with optional serializable `model` and implement omitted, provider-default, and exact `provider:model` resolution with compile/readiness diagnostics
- [ ] 7.4 Replace the custom agent turn loop with `ToolLoopAgent` while preserving ZSYS step/tool/time bounds, cancellation, output validation, safe failures, redaction, generated function identity, and correlated telemetry
- [ ] 7.5 Adapt ZSYS tools and Standard Schema projections to AI SDK tool contracts, route execution through `tool.invoke` and the common engine, and keep ZSYS side-effect/approval policy authoritative and fail-closed
- [ ] 7.6 Replace scripted custom model providers with the version-matched `ai/test` surface and add offline OpenAI/Anthropic default/model selection, tool, approval, invalid-output, cancellation, privacy, and limit matrices
- [ ] 7.7 Remove the public custom `ModelProvider`, custom turn protocol/runtime, handwritten OpenAI HTTP adapter, `modelProfile` paths, and obsolete tests only after all callers and generated artifacts migrate

## 8. Examples, Templates, and Documentation

- [ ] 8.1 Migrate the canonical commerce example to inferred source-scoped IDs where appropriate, service grouping, descriptor calls, function-derived tools, structured request params, retry hints, and AI SDK configuration while preserving every acceptance flow
- [ ] 8.2 Keep the minimal template minimal, and update the API template with one small service plus an `order.created` event whose confirmation and audit listeners prove independent fan-out and deterministic delivery
- [ ] 8.3 Replace the agent template's wrapper tool with `function.asTool`, configure both model defaults and named providers, use offline AI SDK test models, and keep production credentials as environment references
- [ ] 8.4 Update guides, JSDoc, package READMEs, API/CLI references, event explanation, and the pre-1.0 migration guide for request/input separation, ID inference, services, `invoke`, `asTool`, retry hints, and AI SDK model configuration
- [ ] 8.5 Regenerate documentation outputs and run isolated packed-CLI generation/check/test/build acceptance for minimal, API, and agent templates without network model calls or cloud cost

## 9. Verification and Handoff

- [ ] 9.1 Run formatting, structural consistency, lint, type/type-fixture, compiler, function/runtime, HTTP, tools/agents, jobs/events, observability, examples, generator, documentation, security, restart, and phase-zero focused gates and fix only regressions introduced by this change
- [ ] 9.2 Run `bun run check`, `bun run typecheck`, `bun run test:all`, `bun run build`, and `bun run verify` locally without enabling cloud acceptance; report any unavailable authorized-cloud evidence honestly
- [ ] 9.3 Re-run strict OpenSpec validation, map every acceptance scenario to runnable evidence, confirm no legacy public pattern remains, and leave the completed change ready for review and archive
