## Why

Event consumption currently uses `onEvent`, which hides a generated function behind a second callback abstraction, while event publication is buried in generic dependency maps. RELKIT can make both relationships explicit and typed without weakening asynchronous fan-out, independent delivery, or provider enforcement.

## What Changes

- Add `defineEventFunction` for explicitly authored, event-only functions with exact event triggers, delivery policy, ordinary managed dependencies, declared errors, hooks, and follow-up publication capabilities.
- Add `publishes` to normal and event functions, use generated event IDs to narrow `context.events`, and derive graph/IAM publication relationships from that declaration.
- Simplify `defineEvent` to an `input` contract with an optional version defaulting to `1`, while preserving validation, envelopes, receipts, providers, replay, and independent consumer delivery.
- **BREAKING** Remove `onEvent`, event selectors, listener callback/options/types, selector expansion, hidden listener functions, and `dependencies.events` with no aliases or compatibility readers.
- Mark event functions as `event-only`, generate one exact event trigger for each, and reject every non-event invocation or target path in types, compilation, and runtime enforcement.
- Update graph/manifest contracts, Inspector projections, deployment permissions/resources, templates, examples, tests, and documentation to the new model.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `public-authoring`: Introduce `defineEventFunction`, `publishes`, contract-only events, and remove the listener/selector APIs.
- `function-runtime`: Add event-only function descriptors, narrowed publication clients, event delivery context, and non-event invocation rejection.
- `jobs-events`: Preserve asynchronous fan-out while binding exact event deliveries to authored event functions.
- `compiler-graph`: Normalize event functions into authored function plus generated trigger nodes and validate publication/target restrictions.
- `development-inspector`: Present authored event functions as consumers while retaining runtime delivery, replay, and dead-letter state.
- `pulumi-aws-deployment`: Derive exact event publication permissions and durable trigger resources from the new graph.
- `cli-scaffolding`: Generate only the new event contracts, publisher declarations, and event functions.
- `developer-documentation`: Replace listener/selector guidance and generated API references with event-function authoring.
- `acceptance-verification`: Verify type, runtime, graph, provider, Inspector, deployment, and generated-project behavior for the breaking API.

## Impact

This changes public event/function exports and types, compiler normalization and diagnostics, graph/manifest/generator versions, invocation admission, provider client declarations, Inspector projections, deployment planning/IAM, all repository-owned examples/templates, and their tests and documentation. Existing event transport providers and cloud delivery resources remain; no new dependency or compatibility layer is introduced.
