# Implementation standards

## Drive domains through Services

- Group related capabilities behind a coherent Context.Service contract and
  typed Effect methods. The domain service composes its logic modules and
  focused subservices; avoid one service per file or an unrelated catch-all.
  Keep pure leaf utilities small. Use named Effect.fn methods and Effect.gen
  workflows; execute effects only at application/framework edges.
- Keep dependency direction visible. Capture shared adapter dependencies during
  Layer acquisition instead of leaking them into every method's requirements.
  Retain genuine request/run services in the method's R channel and supply them
  at execution; never capture the first request in a shared Layer. Producers and
  readers require only their own capabilities. Use Context.Service for required
  dependencies; Context.Reference is only for a meaningful safe ambient default.
  Verify requirement exclusions and per-call isolation when composition changes.
- Supply the same contract through a live Layer and a deterministic test Layer.
  Put each concrete implementation in Context.Service(..., { make: ... }) and
  build its Layer with Layer.effect(Service, Service.make), passing documented
  constructor inputs to make when needed. See the service reference for contract-only
  dependency seams and avoiding circular inference. Typecheck the returned shape.
  Acquire dependencies, Config, shared state/caches, and resources in Layers;
  compose with Layer.provide and reuse named Layer values in the owning graph.
  Verify memoization and finalization against the installed version; a service
  key is not a global singleton and a new Layer factory call is a new identity.
  Build shared application resources once per owning runtime/scope. Test
  Layers substitute dependencies with fakes; Layer.succeed fits built stubs.
  Keep test-only Layers/fixtures under the owner's root tests/<domain>/.
- Keep service workflows interruptible. Scope owned resources and background
  fibers, supervise failures, and finalize on interruption/shutdown. Restrict
  interruption masking to required acquisition/release or atomic sections.
  Propagate AbortSignal/cancellation to capable external APIs; long synchronous
  work needs cooperative yields or an appropriate worker boundary.
- Include relevant operation context, outcomes, durations, and workload
  metrics. Named spans alone do not establish meaningful observability.
  Every service operation and independently callable domain operation must
  remain observable outside an enclosing stage. A Service tag does not add
  instrumentation automatically: reuse shared method instrumentation and give
  each operation a bounded label; compatibility adapters must not count the same
  operation again. Pure leaf helpers and instrumentation utilities can rely
  on their owning operation. Provision exporters/loggers at runtime edges.
- Emit structured Effect logs for meaningful lifecycle, outcome, recovery, and
  failure events using relevant operation/run context. Choose Info for important
  lifecycle/outcomes, Debug for noisy detail, Warn for recoverable problems, and
  Error for unrecovered failures at the owning boundary. Keep interruption
  distinct from failure, avoid duplicate reports, and redact payloads/secrets.
  Verify the configured logger/sink and minimum level: debug-only logs, named
  spans, and persisted telemetry records alone do not prove usable logging.
  Reuse existing logger wiring and respect application log-level configuration.
- Child fibers inherit logging context/configuration. Allow operation/child
  overrides with fiber-local provisioning of the pinned log-level reference
  (for example References.MinimumLogLevel), applied around the child workflow
  before forking. Verify parent/sibling levels stay unchanged and annotations
  propagate; avoid global logger mutation or a new logger per service call.

## Model and handle failures deliberately

- Default new in-process domain/adapter failures to Data.TaggedError with unique,
  stable tags and readonly actionable payloads. Document every payload member
  beside its declaration, including identity, units, meaning, cause provenance,
  and safe disclosure where relevant. Use precise causes and boundary contracts;
  apply the no-unknown rule in the code-style reference. Use Schema.TaggedError when the
  error itself needs runtime validation or an encoding/decoding contract. Preserve
  compatible existing public error constructors, tags, and codecs. This selection
  overrides the underlying Effect skill's blanket Schema.TaggedError default.
- Keep expected failures in E: Effect.fail or return yield* a tagged error inside
  a generator. Convert throwing/rejecting foreign APIs once at their adapter
  boundary with Effect.try/tryPromise and retain a safe cause. Do not throw an
  expected error inside Effect.sync/gen or convert it to a defect to erase E.
- Use selective typed recovery where a valid response exists. Distinguish
  expected failure, defect, and interruption; preserve unmatched and mixed Causes.
  Choose fallback, matching, retry, timeout, and accumulation policies from the
  error guide. Keep startup Layer errors distinct from service method errors.

## Implement together

- Make the normal workflow readable top to bottom. Separate decoding, domain
  policy, failure classification, and telemetry decisions into named operations
  only where they each express a real responsibility. Avoid nested ternaries,
  compound conditionals selecting callable implementations, boolean mode flags,
  and chains that hide branching or ownership. Use explicit guards, switch, or
  Effect Match when it clarifies actual variants. A single simple value ternary
  is acceptable only when easier to read; do not use ternaries to choose log
  functions or other side-effect handlers. See code-style for the general rule.

- Combine Effect changes, type/schema extraction, documentation, and spacing
  in one implementation pass using the domain service boundary above.
- Apply [Effect code style](effect-code-style.md) for runtime boundaries, explicit
  callbacks, dual APIs, brands, matching and readable control flow.
- Define composable named Effect.fn domain operations and Effect.gen workflows.
  Keep required synchronous/Promise interfaces as thin compatibility adapters.
- Read [concurrency and coordination](concurrency-and-coordination.md) for
  execution order, fibers, Deferred, Queue, PubSub, Semaphore and Latch selection.
  Actively adopt bounded concurrency for independent work and the matching
  coordination primitive instead of custom bookkeeping. Preserve justified
  sequencing and all existing contracts.
- Review loops, array callbacks, Promise batches, and async iterators. Use
  Effect.forEach/all/filter for effectful collection work; preserve ordering,
  early exit, failure policy, and laziness. Keep state-dependent work sequential;
  bound concurrency for independent work and use discard when results are unused.
  Use Array/Iterable modules from effect for suitable pure collection transformations.
  Keep custom Effect control flow where traversal cannot preserve break/while
  semantics. Do not manufacture effects for trivial predicates or CPU parallelism.
- Own asynchronous work with structured concurrency. Effect traversal already
  manages child fibers when concurrent; explicit forks serve background workers,
  listeners, subscriptions, and independently supervised tasks. Use forkScoped,
  forkIn, FiberSet/Map as appropriate, with failure supervision, join/interruption,
  and shutdown finalization. Replace detached Promises and ad hoc lifecycle
  bookkeeping where supported; layer acquisition must finish. A fork is not
  proof that an external Promise/SDK actually supports cancellation.
- Follow the Effect skill for Schema-derived domain contracts, Data variants,
  configuration, and scoped resources, using this skill's error selection and
  Context ownership rules. Preserve defects and interruption; retry only proven
  idempotent operations.
- Consider all requested families together: Service, Schema, Tagged Errors,
  Error Management, Data, observability, metrics, tracing, logs, fibers,
  PubSub, Queue, Stream, Clocks, concurrency, caching, scheduling, Scope,
  RcMap, AcquireRelease, testing, traits, Refs, Configs, and Platform Logger.
  Adopt every applicable capability using established project patterns.
  Do not manufacture unrelated features merely to introduce an API.
- Small leaf calculations may remain direct inside Effect-owned workflows.
  This does not exempt domain stages, validation, models, or failures.
- Keep every new or edited authored function body strictly below 50 code lines
  (maximum 49), including methods, callbacks, generators, and Effect.fn bodies.
  Count formatted nonblank, non-comment lines inside the body; nested definitions
  also count toward the enclosing body. Split larger bodies into focused named
  helpers by responsibility. Preserve laziness, E/R inference, context ownership,
  operation instrumentation, ordering, and cleanup. Do not compress statements,
  move work outside the effect, or add artificial services to meet the limit.
