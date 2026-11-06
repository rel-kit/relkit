# Services, Context, and Layer ownership

Read before implementing or restructuring a domain service. Implement the graph that executes
the work, not merely declarations around existing orchestration. Keep public
adapters thin and Effect execution at the framework/application edge.

## Decide where each dependency belongs

| Responsibility | Ownership |
| --- | --- |
| Required application capability | `Context.Service` with a stable unique key and a typed implementation |
| Shared database/client/config/cache | Acquire through the implementing Layer; close over it in methods |
| Request/tenant/job identity | Require at method execution or pass explicitly; never capture the first request during shared acquisition |
| Safe ambient default | `Context.Reference`; override locally when needed |
| Optional capability | `Effect.serviceOption` only when absence is valid, not to bypass required wiring |

For `Effect<A, E, R>`, R describes services needed to execute that effect. For
`Layer<Out, E, In>`, In describes construction dependencies and E describes
acquisition failure. Ordinary method requirements should not leak shared adapter
dependencies. Genuine per-call requirements remain explicit; forcing every
method to R = never can erase request isolation or lifetime ownership.

Yield the service key to obtain its implementation. `Service.of` checks a shape;
it does not acquire, provision, instrument or supervise it. Distinct classes with
the same key collide at runtime. Context is a collection of implementations,
not a replacement for scoped acquisition or a global mutable service locator.
Use `Context.make`/`add`/`merge` only for already-built values; verify override
precedence when combining contexts. Capturing a Context does not extend lifetime.

Source: [services](https://effect.website/docs/v4/requirements-management/services).

## Defaults and local overrides

Clock, ConfigProvider, Console, Random and Tracer have built-in defaults through
Context references; their ordinary use does not add mandatory R requirements.
Use the installed override APIs for tests and local policy, such as
`Effect.provideService` or `Random.withSeed`. Do not wrap default services in new
application tags without a domain reason, mutate global defaults, or recreate
loggers per call. Required credentials, persistence and authorization have no
safe ambient fallback. Test parent/sibling isolation for local overrides.

Source: [default services](https://effect.website/docs/v4/requirements-management/default-services).

## Compose implementations and own their resources

- Concrete services own their implementation through
  `Context.Service<Self, Shape>()("Key", { make: Effect.gen(...) })`.
  Acquire shared dependencies inside make, define named Effect.fn operations,
  and return the checked service shape. Use
  `Layer.effect(Service, Service.make)` for the corresponding Layer.
  When construction needs an explicit SDK/config argument, make may be a named
  effect-returning constructor and the Layer uses `Service.make(argument)`.
  A contract-only key supplied by callers (for example request context) needs no
  fabricated make. Alternative test implementations still use the same key.
- Keep domain work in callable methods when it should happen per invocation.
  A make effect returning a value runs during Layer acquisition and the value is
  then shared. Do not relocate request validation, randomness, sleeps, or report
  execution into construction solely to imitate an example; that would change
  timing, acquisition errors, and memoization semantics.
- Prefer `Service.of` when safely referencing an initialized service. Inside a
  class initializer, self-references can cause circular TypeScript inference;
  use a precise return annotation or `satisfies Shape` for the implementation
  rather than a cast. Verify the pinned make overload and the inferred E/R.
  This rule overrides the prerequisite skill's detached implementation example.
- `Layer.succeed` fits a built stub, `Layer.sync` lazy synchronous construction,
  and `effectContext` an acquisition intentionally supplying several keys.
  The make member constructs an implementation; it does not create a Layer.
- `ConsumerLive.pipe(Layer.provide(DependencyLive))` supplies its construction
  requirements and exposes the consumer. `provideMerge` also exposes the
  dependency. `merge`/`mergeAll` combine outputs but do not feed sibling outputs
  into sibling inputs. Wire those edges explicitly and preserve remaining In.
- Acquire scoped resources with `acquireRelease` inside construction. Layer owns
  that scope. Fork long-lived workers into it so acquisition returns; supervise
  outcomes and await shutdown before releasing dependencies.
- Handle acquisition failure with Layer-level operators only when startup has a
  valid fallback. Method recovery cannot repair a Layer that failed to build.
  Verify finalization after partially successful graph acquisition.

Source: [layers](https://effect.website/docs/v4/requirements-management/layers).

## Reuse layer values without assuming global singletons

Memoization keys on Layer object identity in the relevant MemoMap, not service
key or identical factory arguments. Reuse one named Layer value across a shared
graph. A new factory call creates a new layer. `Layer.fresh` deliberately opts
out of sharing; use it for actual isolation.

Read the installed `Effect.provide` implementation before interpreting “local”
provisioning. In 4.0.1, `{ local: true }` requests a fresh build and default
provisioning can share through the active memoization context. Separate scopes,
completed lifetimes and independent runtimes must not be assumed to share one
resource forever. Use an owning `ManagedRuntime` for repeated framework calls,
dispose it on shutdown, and test acquisition/release counts. Manual
`Layer.makeMemoMap` / `buildWithMemoMap` is for explicit build ownership; retain
the associated Scope until all consumers finish.

Source: [layer memoization](https://effect.website/docs/v4/requirements-management/layer-memoization);
verify version-sensitive details in installed `Layer.ts` and `internal/layer.ts`.

## Checked composition example

This focused example implements lookup and missing-record policy, captures a
shared source, and reads tenant context per call. It demonstrates architecture,
not a complete production adapter: add the owning application's shared method
instrumentation and actual SDK/persistence Layer. Runtime error classes remain
in runtime modules; named interface/type aliases, if extracted, belong in the
usual `.types.ts` companions. The test stub belongs under root `tests/`.

```ts
/**
 * Resolves tenant-scoped document bodies and distinguishes absence from source failure.
 * Documents captures DocumentSource during construction and reads RequestContext
 * per call; the application supplies both and owns the source resource lifetime.
 */
import { Context, Data, Effect, Layer } from "effect"

/** The selected tenant supplied by the request execution boundary. */
export class RequestContext extends Context.Service<RequestContext, {
  readonly tenant: string
}>()("example/Documents/RequestContext") {}

/** A source failure that callers must not mistake for a missing document. */
export class SourceUnavailable extends Data.TaggedError("Documents.SourceUnavailable")<{
  /** Normalized source failure; its cause preserves the foreign rejection. */
  readonly cause: Error
}> {}

/** The requested identifier is absent within the selected tenant. */
export class DocumentNotFound extends Data.TaggedError("Documents.NotFound")<{
  /** Requested document identity within the current tenant. */
  readonly id: string
}> {}

/** Adapter seam whose shared dependencies are supplied at construction. */
export class DocumentSource extends Context.Service<DocumentSource, {
  /**
   * Reads within a tenant.
   * @param tenant - Tenant selected by the caller's execution context.
   * @param id - Document identifier within that tenant.
   * @returns A lazy optional body, or SourceUnavailable on operational failure.
   */
  readonly read: (tenant: string, id: string) => Effect.Effect<string | undefined, SourceUnavailable>
}>()("example/Documents/Source") {}

/**
 * Looks up document bodies using a shared source and the active request tenant.
 * Construction captures the source; each get call resolves identity and missing
 * records. The source owner controls connection lifetime; this service owns no
 * connection and does not run lookups during Layer acquisition.
 */
export class Documents extends Context.Service<Documents, {
  /**
   * Loads the requested document under the current tenant.
   * @param id - Identifier within the current tenant.
   * @returns A lazy body lookup; fails with NotFound or SourceUnavailable.
   * @remarks Requires RequestContext at execution, not at Layer construction.
   * @example With a provided documents instance and active RequestContext:
   * ```ts
   * const body = yield* documents.get("known")
   * ```
   */
  readonly get: (id: string) => Effect.Effect<string, DocumentNotFound | SourceUnavailable, RequestContext>
}>()("example/Documents", {
  make: Effect.gen(function* () {
    const source = yield* DocumentSource

    /**
     * Resolves a lookup without capturing identity in the shared constructor.
     * @param id - Tenant-local document identifier.
     * @returns A lazy body lookup with missing/source failures and RequestContext.
     */
    const get = Effect.fn("Documents.get")(function* (id: string) {
      const { tenant } = yield* RequestContext
      const body = yield* source.read(tenant, id)
      if (body === undefined) return yield* new DocumentNotFound({ id })
      return body
    })

    return { get }
  })
}) {}

/** Supplies the implementation constructed by Documents.make. */
export const DocumentsLive = Layer.effect(Documents, Documents.make)
```

Provide the adapter through the same construction seam used in production:

```ts
const DocumentSourceTest = Layer.succeed(DocumentSource, DocumentSource.of({
  read: (tenant, id) => Effect.succeed(id === "known" ? `${tenant}:body` : undefined)
}))

const DocumentsTest = DocumentsLive.pipe(Layer.provide(DocumentSourceTest))

const lookup = Effect.gen(function* () {
  const documents = yield* Documents
  return yield* documents.get("missing")
}).pipe(
  Effect.catchTag("Documents.NotFound", () => Effect.succeed("No document")),
  Effect.provideService(RequestContext, { tenant: "tenant-a" }),
  Effect.provide(DocumentsTest)
)

// Application/test boundary only; SourceUnavailable is still a possible failure.
const result = await Effect.runPromise(lookup)
```

Validate this example against the installed version. Verify missing and
successful lookups, source-failure propagation, selected-tag narrowing, and two
tenants using one acquired Documents instance. A deterministic fake alone does
not validate a real database or SDK. For changed resource ownership, additionally
verify shared acquisition, intentional isolation, and cleanup on all outcomes.

Inspect `Context.ts`, `Layer.ts`, `ManagedRuntime.ts`, `Effect.ts`, their delegates,
and relevant tests/examples using the source fallback in the main skill. For
callbacks or workers that outlive registration, also read
[lifecycle and durability](lifecycle-and-durability.md).
