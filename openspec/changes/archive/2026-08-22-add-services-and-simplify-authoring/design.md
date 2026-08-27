## Context

See [proposal.md](./proposal.md) for motivation. The current authoring factories eagerly require IDs and freeze descriptors before the compiler knows their source/export hierarchy. Discovery evaluates only exported branded descriptors, while the generated runtime manifest imports those source descriptors and registers every function in one hash-matched registry.

The engine already supplies the required validation, Effect lifecycle, errors, deadlines, cancellation, dependency clients, tracing, and observability. Function-to-function calls currently reach it through declared `dependencies.functions` maps and `context.functions`. The Hono adapter already extracts path/query/header values internally, but public `FunctionRequest` omits the structured collections and route inference requires each path name in the target input.

Tools already target functions without owning handlers. Agents instead use a custom `ModelProvider`, custom turn loop, `modelProfile`, and a handwritten OpenAI Chat Completions adapter. Services do not exist. The design must preserve serializable descriptors, controlled discovery, Standard Schema validation, value-free environment references, secret redaction, deterministic graph output, and framework-free public handler types.

## Goals / Non-Goals

**Goals:**

- Make `await descriptor.invoke(input)` the only function-call authoring path while preserving the common engine inside and outside handlers.
- Add services as a small grouping and shared-policy primitive, not another execution model.
- Derive safe identities only where source identity is acceptable and bind them consistently into compiled execution.
- Keep HTTP transport data distinct from reusable business input without sacrificing route/function/tool reuse.
- Replace custom agent/provider machinery with a narrow serializable layer over AI SDK v7.

**Non-Goals:**

- A workflow, saga, service-level handler, service locator, dependency-injection container, transaction manager, or remote-service protocol.
- A complete static TypeScript call graph; dynamic function calls are runtime-observed relationships.
- Inferred IDs for durable infrastructure or public event/job contracts.
- Repeated route slug names, mutable raw requests, shared mutable service context, or automatic HTTP/direct retries.
- A first-class prompt descriptor or arbitrary application-supplied AI provider closures.
- Compatibility shims for `context.functions`, `modelProfile`, or the custom model-provider interface beyond migration documentation.

## Decisions

### 1. Keep transport request and reusable input as separate values

`FunctionRequest` gains immutable `params`, `query`, and normalized header collections while retaining method, URL, body readers, and cloning. Repeated query/header values use readonly arrays; route parameters remain scalar strings or catch-all string arrays. Non-HTTP invocations continue to pass no request rather than fabricating one.

Route inference changes as follows:

1. Materialize the structured request from the matched Hono context.
2. Map a path parameter into function input when a target input property has the same name.
3. Do not diagnose a path parameter that is absent from the business input; it remains available through `request.params`.
4. Infer remaining GET-like fields from query and mutation fields from body as today.
5. Preserve explicit mappings as a complete override for non-routine transports.

OpenAPI continues to describe the transport source, so a mapped `orderId` is a path parameter and never a body property. The compiler retains Next-compatible rejection of repeated dynamic names; nested routes use `orderId` and `productId`.

Removing path values from reusable input entirely was rejected because a function invoked by another function or exposed as an agent tool still needs explicit domain data.

### 2. Extract one dependency-neutral invocation kernel

`@relkit/functions` cannot depend on `@relkit/engine` without creating workspace cycles through app, event, and job packages. The reusable portion of the existing engine invocation path will therefore move into one small internal invocation package consumed by both `@relkit/functions` and `@relkit/engine`. It owns:

- structural invocation-target types;
- Standard Schema input/output and declared-error validation;
- the Effect handler bridge, lifecycle, limits, and default public context;
- an `AsyncLocalStorage` invocation-dispatch scope;
- invocation-chain recursion protection; and
- the standalone direct dispatcher.

The engine remains responsible for generation registries, providers, managed-resource clients, admission, deployment lifecycle, and persistent observability hooks. This is an extraction of the current kernel, not a second implementation.

`FunctionDescriptor.invoke(input)` asks the invocation package to dispatch:

- With an active asynchronous scope, the engine resolves the descriptor's canonical ID in the current generation and creates a normal child invocation with inherited trace, deadline, cancellation, providers, hooks, and service policy.
- Without an active scope, the standalone dispatcher executes the descriptor through the same validation/lifecycle kernel with a local structured logger, clock, and signal. It never borrows an arbitrary running application. A provider-backed dependency fails clearly unless a test or explicit standalone runtime supplied it.

The descriptor handler is never called as the fallback. Multiple app/test runtimes remain isolated because dispatch state is asynchronous-scope state, not a mutable global default.

The active chain tracks resolved function identity and, before identity binding, descriptor object identity. Re-entering a target already in the chain fails before admission. Every nested call emits an observed `calls-function` edge; no `dependencies.functions` declaration or canonical call edge is required.

Alternatives rejected:

- A process-global default runtime is ambiguous with concurrent apps and tests.
- Directly calling `handler` loses validation, errors, service policy, telemetry, cancellation, and limits.
- Static call-graph analysis cannot soundly cover aliases, higher-order code, or runtime branching and would restore compiler ceremony.

### 3. Descriptor methods are runtime capabilities, not graph data

Function descriptors gain non-enumerable frozen `invoke` and `asTool` methods. Tool descriptors gain non-enumerable frozen `invoke`. Discovery snapshots and canonical metadata explicitly ignore these methods, just as the graph never serializes handlers.

`asTool(options)` constructs the existing function-targeted tool descriptor. It copies no handler and accepts optional `id`, required description/side-effect/approval metadata, and optional timeout. `asTool()` without arguments is legal only when `defineFunction` already supplied complete `tool` metadata. Its inferred identity is based on the resolved function identity plus a tool segment unless an explicit tool ID overrides it.

`tool.invoke(input, options?)` enters the tool runtime first and then the function engine with source `tool`. Invalid input fails before approval. Required approval without an active resolver fails closed; a direct method call is not silently treated as human approval.

`defineTool({ target })` remains supported because it is useful when tool metadata belongs in a separate module.

### 4. Compiler-derived IDs use a narrow deterministic algorithm

Only functions, routes, services, tools, agents, errors, middleware, and transforms may omit IDs. Apps, events, jobs, buckets, and caches retain explicit IDs because their identity can outlive a source location or control external state.

The compiler extends its existing TypeScript source-fact pass to identify eligible direct factory bindings, exports, route operations, and service members. Derivation uses these rules:

- Strip `src`, the conventional kind directory, extensions, conventional suffixes, and a terminal `index`.
- Normalize hierarchy and ordinary binding/member segments to filesystem-safe kebab segments joined by dots.
- For a named export, use its binding; for a default export, use its file stem.
- For a service-owned ID-less function, use `<service-id>.<member-name>`.
- Preserve a declared-error const binding such as `InvalidError` as the final segment so the requested identity is `orders.InvalidError`.
- For routes, use `route.<method>.<path>`, encoding dynamic segments as `by-<name>`, catch-alls distinctly, and the root path as `root`; keep `GET /orders/{orderId}` as display metadata rather than putting slashes/colons in the stable ID.
- An explicit ID always wins and is validated with the existing stable-ID grammar.

The evaluator snapshot and normalizer carry source identity facts rather than asking runtime JavaScript to discover a variable name, which JavaScript cannot do reliably. The generated manifest emits identity-binding wrappers for imported descriptors and nested declared errors before registry creation. Runtime lookup, error instances, descriptor invocation, logs, and traces consult the bound canonical identity.

A direct uncompiled standalone invocation of an ID-less descriptor uses a process-local non-persisted diagnostic identity until a RELKIT compiler/test loader binds it. It still validates and executes, but only compiled output claims canonical stable identity.

Moving a descriptor with an inferred ID is an identity change and compatibility diff reports it. Moving a descriptor with an explicit ID is source-metadata-only. Ambiguous inference and collisions fail compilation with all origins and an explicit-ID suggestion.

### 5. Services are structural descriptors with service-scoped member facades

Add `@relkit/services`, re-exported from `@relkit/app`, with the approved shape:

```ts
export const OrderService = defineService({
  functions: { getOrder, addOrder, deleteOrder },
  middleware: [orderContext],
});

export const GET = defineRoute({ target: OrderService.getOrder });
```

The returned frozen service descriptor keeps the original `functions` map and exposes typed direct member facades. A facade retains the original schemas/errors/handler target and adds service identity/policy for routes, `invoke`, and `asTool`; it does not clone the handler. Reserved descriptor property names cannot be member names. One function may have only one owning service, avoiding ambiguous middleware and documentation identity; ordinary functions may still invoke any service member.

Service middleware uses one explicit non-business policy primitive:

```ts
export const orderContext = defineServiceMiddleware({
  handler: async ({ input, request, context }, next) => {
    context.log.debug("orders invocation", { source: context.invocation.source });
    await next({ actorId: request?.headers.get("x-actor-id") ?? "system" });
  },
});
```

Its optional ID follows the normal middleware inference rules. The frozen middleware owns only this policy callback and is not independently invokable. It receives validated readonly member input, the optional framework-neutral request, and the base public context. `next(patch?)` returns `Promise<void>`, may be called exactly once, and merges a frozen record into downstream `context.service`; because it never returns the member result, middleware cannot replace business input or output. It can use `try/finally` around `await next(...)` for cleanup and can reject by throwing. Returning without `next` or calling it twice is a safe policy defect.

Middleware is stored in declaration order and runs inside the common engine after input validation/admission and before the member handler. Patches are merged into a service-scoped readonly context, never into the raw request or shared base context. The member's output passes normal validation after the stack unwinds.

HTTP route middleware remains transport policy and runs before route mapping. The effective HTTP order is route middleware, request parsing/mapping, input validation/admission, service middleware, member handler, output validation, and response mapping.

The graph adds a service node plus structural membership and ordered middleware relationships. Function call edges remain observed. OpenAPI emits top-level service tags and operation tags; Scalar receives grouping from that document. Runtime records add `serviceId` but do not automatically capture service-context values.

Defaults for timeout, concurrency, resource dependencies, base paths, versions, transactions, and lifecycle hooks are intentionally excluded. They can be added only when a concrete use case cannot be expressed by member functions and middleware.

### 6. Retry metadata normalizes once at the error boundary

The public compatibility forms are:

```ts
retry?: "never" | "later" | { kind: "later"; afterMs?: number };
```

Omission normalizes to non-retryable. `afterMs` is a finite non-negative integer and is a minimum hint, not an exact schedule. Public failure envelopes carry only the safe normalized classification/hint.

HTTP invokes once and, for a mapped retryable error with a hint, emits `Retry-After` rounded up to seconds. Job and durable event runtimes schedule the next eligible attempt after `max(policyDelay, afterMs)`, still bounded by attempts, cancellation, and deadline. Direct calls and tools do not retry automatically.

Keeping the existing string forms makes this additive for current errors while allowing `retry` and `id` to be omitted.

### 7. AI SDK v7 replaces the custom model protocol behind serializable descriptors

Add the pinned AI SDK v7 core plus official OpenAI and Anthropic provider adapters. Remove the public custom `ModelProvider`, custom turn protocol/loop, and handwritten OpenAI request adapter after their callers migrate. RELKIT keeps its bounded agent descriptor and generated-function boundary; the runtime implements it with AI SDK's provider registry, `ToolLoopAgent`, tool contracts, and version-matched `ai/test` models.

Each environment provider recipe accepts serializable model configuration shaped conceptually as:

```ts
modelProviders: {
  defaultProvider: "openai",
  defaultModel: "gpt-5-mini",
  openai: { apiKey: env.OPENAI_API_KEY },
  anthropic: {
    apiKey: env.ANTHROPIC_API_KEY,
    defaultModel: "claude-sonnet-4-5",
  },
}
```

`defaultProvider` and `defaultModel` are both required. Provider names are reserved separately from those keys during normalization. Environment references remain unresolved and secret in graph metadata. Initially supported live adapters are OpenAI and Anthropic; an unknown configured provider fails with a safe readiness diagnostic rather than accepting executable provider code.

Agent `model` resolution is deterministic:

1. Omitted: `<defaultProvider>:<defaultModel>`.
2. A configured provider name: that entry's `defaultModel`, otherwise a configuration failure.
3. `provider:model`: the exact AI SDK registry ID after provider validation.

Agent descriptors continue to store only strings, schemas, instructions/messages, tools, limits, and safe metadata. No first-class prompt descriptor is added. Existing RELKIT step/tool/time limits, output validation, cancellation, redaction, and telemetry wrap the AI SDK loop.

Each RELKIT tool becomes an AI SDK tool using the projected input schema, an execution callback into the RELKIT tool runtime, and approval mapping that fails closed. RELKIT remains authoritative for side-effect policy and engine invocation. Tests use official AI SDK test models and never live network providers.

### 8. Templates demonstrate one concept each

The minimal template stays a single function/route. The API template adds the smallest useful service plus an `order.created` event with two independent listeners, such as confirmation and audit, and deterministic delivery tests. The agent template replaces its explicit wrapper tool with a function-derived tool and shows both model defaults with scripted development/test configuration and environment-backed production credentials.

The examples explain that event fan-out creates independent deliveries, not a transaction or guaranteed simultaneous execution.

## Risks / Trade-offs

- **Async context can be lost by unsupported callback boundaries** → Centralize dispatcher scope in the invocation kernel, test timers/promises/provider callbacks, and allow internal explicit scope binding where platform propagation is insufficient.
- **Standalone calls cannot infer application providers** → Never choose a global app; provide an isolated kernel and fail clearly when a managed dependency is unconfigured.
- **Uncompiled ID-less descriptors lack canonical source identity** → Use non-persisted diagnostic identity until compiler/test-loader binding and never write durable state under it.
- **Source-derived IDs make moves breaking by default** → Keep explicit overrides, emit compatibility changes, and document explicit IDs for identities that must survive refactors.
- **The canonical graph no longer predicts every function call** → Keep all current functions in the generation registry, record observed edges, enforce cycles at runtime, and avoid claiming a complete static call graph.
- **Service middleware could leak request-specific state** → Freeze patches, scope them per invocation, prohibit raw/shared mutation, and exclude context values from default telemetry.
- **AI SDK and provider packages evolve quickly** → Pin compatible major/minor versions in the lockfile and keep RELKIT-facing contracts covered by provider, tool, limit, privacy, and offline test matrices.
- **Approval semantics could differ between AI SDK and RELKIT** → Treat RELKIT policy as authoritative and fail closed when either layer requires approval.
- **Graph/manifest shapes change** → Bump their contract versions together and retain fail-fast hash/version checks so mixed artifacts never activate.

## Migration Plan

1. Introduce the shared invocation kernel and descriptor identity binding while existing explicit-ID applications still compile.
2. Add descriptor `invoke`/`asTool`, service contracts, graph/runtime support, and tests; migrate internal examples from `context.functions`, then remove function dependencies from the public context and compiler cycle graph.
3. Extend structured requests and route/OpenAPI inference, preserving explicit request mappings.
4. Add optional error IDs/retry metadata and propagate normalized retry hints through HTTP, jobs, and events.
5. Introduce AI SDK v7 provider configuration and runtime adapters, migrate templates/examples/tests, then remove `modelProfile`, custom provider types, and the handwritten OpenAI adapter.
6. Regenerate public API/CLI references and migration documentation and run focused suites followed by repository verification and packed-template acceptance.

Rollback requires reverting graph/manifest contract versions and all generated artifacts together. Existing explicit IDs, `defineTool({ target })`, and string error retry forms remain valid; removed function-client and custom-model APIs require source migration rather than runtime dual paths.
