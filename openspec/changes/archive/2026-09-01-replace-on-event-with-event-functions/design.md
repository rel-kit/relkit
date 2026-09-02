## Context

See `proposal.md` for motivation. The current event contract, generated registry, provider fan-out, delivery recovery, graph trigger, and deployment implementations already satisfy the asynchronous model. `onEvent` currently constructs a hidden function with `z.unknown()` schemas, while publishers are declared through `dependencies.events`; the redesign should expose the real function resource without replacing the transport.

The implementation must preserve strict Standard Schema inference, deterministic JSON-only graph output, provider/client authorization, source-located compilation, the common invocation engine, existing domain/service ownership, and the repository's 200-line implementation-file limit.

## Goals / Non-Goals

**Goals:**

- Make event reactions explicit event-only function descriptors and preserve independent asynchronous delivery.
- Make publication permissions readable, typed, graph-visible, runtime-enforced, and deployable from exact IDs.
- Reuse the current event registry, provider, trigger, retry, replay, and invocation paths.
- Remove the old callback/selector surface completely in one contract revision.

**Non-Goals:**

- Synchronous event results, direct descriptor publication/invocation, wildcard business subscriptions, a new consumer graph kind, or another execution engine.
- Compatibility aliases, codemods, old graph/manifest readers, queue identity migration, or provider-state migration.
- `defineScheduleFunction`, `defineQueueFunction`, or other future trigger-specific constructors.

## Decisions

### Function descriptor construction and invocation modes

Extract the shared immutable descriptor construction used by `defineFunction` into an internal factory with `callable` and `event-only` modes. `defineEventFunction` creates the event-only shape directly: it has the event-derived input schema, void output schema, handler/hooks/errors/dependencies/publications, and no `invoke`, `asTool`, or tool metadata. Calling public `defineFunction` and deleting methods was rejected because forged references and runtime guards would still see a callable descriptor.

The invocation target and graph function contracts gain `invocationMode`, defaulting to `callable` for normal functions. Admission accepts event-only targets only for explicit event delivery or replay sources; target validators independently reject routes, services, jobs/schedules, tools, agents, and nested/direct calls so JavaScript or forged graph input cannot bypass authoring types.

### Registry-driven event contracts and publications

`defineEvent` renames `payload` to `input` and defaults an omitted version to `1`; provider envelopes and parsed output semantics remain unchanged. The generated registry supplies exact event IDs, descriptor input/version types, `publishes` inference, and event-function input inference. If package imports would cycle, the empty registry interface moves to `Relkit.EventRegistry` and the generated declaration augments that global type only.

`FunctionDependencies` drops its `events` category. Both constructors accept `publishes`, copied as a frozen unique string list. The compiler resolves every name against discovered event descriptors and emits the existing `publishes-event` edge. Runtime context construction builds publisher clients only for those resolved IDs and retains the guarded-map failure for undeclared access. The consumed event is not implicitly publishable.

### Event-function lowering

Each event function stays an authored function descriptor/node and normalization creates only `relkit.event.<function-id>.trigger`. The trigger targets the authored function and carries the exact event ID/version plus normalized delivery/profile/retry/concurrency/timeout configuration. Existing event materialization consumes that trigger and imports the authored handler through the ordinary manifest function map. There is no selector expansion and no generated listener function.

The trigger ID is reserved and collision checked. Graph edges remain `targets-function`, `listens-to-event`, and `publishes-event`; Inspector derives consumers by joining the two trigger edges instead of adding a second canonical relationship.

### Delivery context and successful output

The event materializer adapts the accepted envelope into the event-derived handler input and supplies `context.trigger` with separate event, delivery, and trace records. Attempts are one-based and replay is explicit. Event functions use the standard function result/error machinery with void as the successful schema, so declared errors and Effect error channels continue to drive retry classification without allowing application output.

### Breaking removal and contract revision

Delete `onEvent`, selector/listener modules and exports, selector-expansion normalization, callback manifest adapters, and all `dependencies.events` uses. Update repository-owned applications and generated outputs directly. Bump the public contract, graph, manifest, and generator versions because old source and artifacts are intentionally unreadable.

## Risks / Trade-offs

- **Event-only descriptors still use graph kind `function`** → Preserve one execution primitive and make the restriction explicit with `invocationMode` plus admission tests.
- **Generated trigger IDs may collide with authored IDs** → Reserve the deterministic prefix and emit a source-located collision diagnostic before graph output.
- **Runtime sources currently distinguish only `event`** → Carry delivery versus replay as explicit event admission metadata while keeping observability source classification coherent.
- **Removing selectors reduces broad telemetry convenience** → Keep the business API exact-ID only; a separate advanced observability API can be proposed from a demonstrated need.
- **Partial retry defaults can drift across providers** → Normalize once before graph/manifest generation and feed the same complete policy to local and cloud providers.

## Migration Plan

1. Land the new descriptor/type contracts and version bumps together with compiler diagnostics.
2. Switch normalization, manifest generation, runtime admission, and provider materialization to authored event functions and explicit publications.
3. Update Inspector, deployment projections, all repository-owned templates/examples/tests, and documentation; delete legacy modules and exports in the same change.
4. Regenerate deterministic artifacts and run focused then full verification.

There is no compatibility rollout or state migration. Rollback means using the previous package and artifact contract versions with source authored against that version.
