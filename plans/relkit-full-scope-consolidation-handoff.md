# Relkit — Full-Scope Consolidation Handoff

## Decision

Keep the approved architecture and the latest lifecycle corrections. The attachment titled **Relkit Realtime and Typed Client — Final Implementation Plan** is a lifecycle-hardening amendment, not a complete standalone specification for the original feature request.

Its opening instruction is to amend `plans/relkit-realtime-client-plan-v3.md` in place. That is a valid amendment workflow, but referencing the baseline is not evidence that the baseline's feature requirements have actually been incorporated into the final document. Do not treat the amendment's abbreviated slice list as an exhaustive scope list.

Produce one authoritative, consolidated Markdown implementation plan. Preserve original capabilities except where a later decision explicitly changes or defers them. Incorporate the latest lifecycle contracts into their relevant sections rather than publishing another corrective addendum.

This handoff evaluates document coverage. It does not verify a repository merge, current implementation, or test execution.

## 1. Inputs and precedence

Use the sources in this conversation in this order:

1. The user's original request: streaming, realtime/WebSockets, native SSE, routes/functions/agents/services, Inspector agent/tool chat, generated typed clients, React/Next.js examples, and implementable Markdown steps.
2. The subsequent user requirements: Pusher-style backend trigger/client subscribe-bind; `RelkitClientProvider`; no feature-level generated imports; name-inferred hooks; offline/refresh behavior; public/protected channels; joiner counts; TanStack/oRPC route hooks; Pi capability review; existing streaming protocol compatibility; documentation coverage.
3. The approved repository-aligned API and architecture decisions. These supersede obsolete variants in the early drafts.
4. The latest completion, interruption, control, generation, identity, timeout, and deployment corrections. These refine runtime semantics; they are not permission to drop unrelated features.

Consult the full early streaming plan and v3 for omitted requirements and examples, but do not copy obsolete API names or architectures blindly. In particular, preserve the currently approved split between `useRoute` and `useRouteMutation`, native SSE versus managed `http-stream`, current presence field names, and the prohibition on service-membership extensions.

## 2. Mandatory requirement traceability

Add a table to the consolidated plan with these columns:

`Requirement ID | Capability | Status | Normative section | Implementation slice | Files | Acceptance test | Executable example/docs`

Allowed statuses are `required`, `explicitly deferred`, and `superseded by <decision>`. A requirement is not covered merely because a slice name mentions it. Each required capability needs an observable acceptance result and a concrete implementation home. Explain every deferral or supersession.

| ID | Capability that must be accounted for | Coverage concern in the latest attachment |
|---|---|---|
| STR-01 | Generic streaming function authoring, `streamOf`, item inference and graph projection | Function deadlines are mentioned, but the generic authoring and execution contract is not restated. |
| STR-02 | Common engine lifecycle, nested invocation, validation, cancellation, backpressure, cleanup | Agent journals and claims do not define arbitrary function-stream behavior. |
| STR-03 | Function progress and function-backed tool progress | Final outputs, stream items, and progress need separate contracts. |
| HTTP-01 | Typed oRPC HTTP iterator routes through Hono | Transport ownership is named; the complete binding and policy-parity requirements must be restored. |
| HTTP-02 | Native Hono SSE, text and bytes | Error limitations are retained, but route authoring, item constraints and framing need normative sections. |
| HTTP-03 | User-owned Hono integration/escape hatch | The earliest draft proposed an embedding adapter. Explicitly retain or defer that proposal; runtime ownership alone is not a public integration contract. |
| RT-01 | Channel descriptors, backend trigger, client subscribe/bind | Slice 2 names the feature without the full public shape and behavior. |
| RT-02 | Internal, public and protected exposure | Preserve exact descriptor union, policy validation, replay/presence protection and lifecycle rules. |
| RT-03 | Replay, resynchronization, fallback and overload | Journal/control observation is detailed; channel-specific guarantees must also be present. |
| RT-04 | Connection count, member count, leases and presence APIs | Public conditional types are retained; descriptor, imperative access and hook examples need consolidation. |
| CLI-01 | Provider setup and all public hooks | Basic provider and `useRoute` are named; remaining hooks must have work and tests. |
| CLI-02 | TanStack queries, mutations, infinite queries, suspense and utilities | Mutation/infinite/suspense/key/invalidation contracts are not enumerated in the latest slices. |
| CLI-03 | Automatic type registry, contract artifact, build adapters and drift checks | Fingerprinting alone does not provide all type-generation and linking behavior. |
| CLI-04 | SSR, hydration, identity isolation and existing-client compatibility | Preserve the approved full key and compatibility contracts, not only a hydration sentence. |
| AG-01 | Agent text/parts, tool input, execution progress and final results | Lifecycle reliability is detailed; the complete content/event pipeline is not. |
| AG-02 | Threads, runs, completion, claims, controls and generation routing | This is the strongest and most explicit part of the latest attachment; retain it. |
| AG-03 | Pi-derived applicable capabilities and scoped deferrals | Restore the feature/action/test matrix, not a Pi dependency. |
| AG-04 | AG-UI and optional AI SDK interoperability | Protocol names are not a substitute for pinned mapping and external-client conformance. |
| SVC-01 | Use from existing services and server-side composition | No service-membership extension is an approved architecture decision, not a removal of service compatibility. |
| INS-01 | Inspector catalogs, chat, tools, approvals, realtime/presence and route exploration | Inspector appears as preserved machinery/security, not a deliverable UI workstream. |
| EX-01 | Executable backend, React and Next.js examples | No explicit example delivery workstream appears in the latest slice list. |
| DOC-01 | Tutorials, reference pages, navigation and troubleshooting | Deployment wording and verification commands do not cover the documentation requirement. |
| BUILD-01 | Compiler, graph, manifest, exports, scaffolding and generated-app lifecycle | Recover explicit tasks, diagnostics and compatibility requirements from the fuller baseline. |
| OPS-01 | Local/shared providers, deployment, limits, observability and release | Keep the latest runtime guarantees and restore the complete end-to-end operational/support matrix. |

## 3. Required restoration: generic streaming

Create a dedicated normative section and end-to-end slice for generic streaming before requiring the complete agent-state subsystem.

Specify the approved `streamOf` location, allowed producer/consumer types, per-item validation, invocation return typing, and graph representation. Define single-consumer behavior, `next`/`return`/cancellation ownership, scope retention, inherited context/deadline/generation, exactly-once cleanup and error normalization. Bound buffers and define slow-consumer behavior; never persist or JSON-serialize a live iterator as an ordinary function result.

Keep `progress` separate from stream items and final output. A progress-enabled function's tool view must inherit the schema and continue to execute through the common function engine.

The same business function must be usable through:

- Direct backend invocation, including an existing service's exposed function.
- A typed oRPC HTTP route.
- Native Hono SSE; matching text/byte variants where their schemas permit them.
- A generated typed `useStream` consumer.

Do not imply that generic request-bound streams automatically receive run-backed agent persistence. State their respective disconnect, cancellation, replay and restart guarantees.

Acceptance must cover failure before the first item, invalid later items, consumer break, explicit abort, disconnected clients, shutdown, bounded queues and cleanup. Include native post-header failures and healthy streams longer than the finite request timeout.

## 4. Required restoration: frontend APIs and automatic types

Write the complete public surface once, with final consistent names:

`RelkitClientProvider`, `useRelkitClient`, `useRoute`, `useRouteMutation`, `useInfiniteRoute`, `useSuspenseRoute`, `useRouteUtils`, `useStream`, `useRealtime`, `useChannel`, and `useAgent`.

For each API specify inputs, inferred outputs/errors, return values, cache/store ownership, cancellation, lifecycle, identity reset and offline behavior. Retain actual TanStack semantics and the existing oRPC integration instead of implementing a parallel caching abstraction.

Restore method/path selector generation, existing route-ID compatibility, middleware/rate-limit policy parity, automatic registry inclusion, frontend build metadata, pull/check behavior, missing-registry errors, drift tests and server-only dependency exclusion.

Type declaration loading and runtime fingerprint injection are separate requirements. Both must work without imports from generated files in feature components. Demonstrate setup for a generated application and for a separately built frontend.

The React/Next.js examples must use one shared or application-supplied QueryClient and request-scoped server state. Test native TanStack usage alongside Relkit hooks.

## 5. Required restoration: agents, tools and protocols

Keep the latest reliable completion, interruption, fenced claim, durable control and generation-routing contracts unchanged except for genuine contradictions discovered during consolidation.

Restore the complete agent content pipeline: stable message/part/tool IDs, incremental assistant output, draft versus validated tool arguments, tool execution progress, final validated tool output, usage, terminal/interrupted states and bounded observer behavior.

Restore a Pi-derived applicability table covering lifecycle stages, argument truncation safety, parallel completion versus transcript ordering, context preparation, steering/follow-up boundaries and graceful stopping. Mark advanced features explicitly deferred where that is the accepted decision.

Keep AG-UI and AI SDK framing distinct from generic native SSE and oRPC framing. Specify pinned profiles, standard versus namespaced events, approval continuation, and external-client/parser conformance. Managed replay must not be presented as a guarantee automatically available to every external protocol client.

## 6. Required restoration: service compatibility

Do not restore `defineService({ channels, agents })` or any other service-membership extension that the repository-aligned plan explicitly rejected.

Instead demonstrate existing service functions calling channel descriptors through ordinary imports, consuming generic streams, and invoking agents/tools through the common execution path. A route targeting a service-exposed streaming function must retain the same context, policy, validation, generation and cancellation rules as direct invocation.

This satisfies the original service-integration capability without changing the service model.

## 7. Required restoration: Inspector

Add file-scoped work and UI acceptance tests for:

- Agent catalog: inputs/outputs, tools, limits, supported controls and chat capability.
- Agent chat: existing-thread restoration, streamed response, steps/progress, tool cards and safe structured results.
- Approval controls: decisions, pending aggregation, denial, stop, steering and follow-up where supported.
- Run diagnostics: segment identities, statuses, usage, journal/recovery information and uncertainty.
- Channel catalog/detail: exposure, trigger/subscription diagnostics, replay/gaps and presence freshness.
- Route explorer: method/path selectors, generated hook examples and generic streaming results.

Use the existing privileged Inspector authorization, generation checks, audit and production restrictions. Do not expose private application resources merely to make them visible in Inspector. A production-disablement test is necessary but does not prove that the chat or tool UI exists.

## 8. Required restoration: examples, docs and scaffolding

Ship executable backend plus React/Next.js journeys, not pseudocode-only examples:

1. Public announcement trigger and anonymous subscription.
2. Protected order updates, access denial and authoritative query invalidation.
3. Count/member presence across shared components and multiple tabs.
4. A service-backed generic stream through oRPC and native Hono formats.
5. Named agent chat with streamed tools, approval and refresh reattachment.
6. Offline, replay-gap, identity-change and uncertain-worker UI states.

Name exact fixture directories, README commands and expected outputs in the consolidated plan. Provide deterministic auth/model fixtures so normal acceptance does not depend on paid providers.

Restore concrete documentation groups under `apps/docs/content/docs`: `client/`, `realtime/`, `http/streaming.mdx`, relevant `ai/` and `operations/` pages, Inspector guides and generated API references. Name page files, source examples, navigation edits and validation commands.

Include new-project scaffolding, client build/registry setup, package exports/declarations, compiled templates and generated-project smoke tests. The normal generated application must demonstrate the advertised client setup without manual generated-file imports.

## 9. Consolidated document structure

The authoritative document should contain:

1. Scope, decisions, compatibility baseline and requirement traceability.
2. Public API overview and app setup.
3. Common stream/progress execution.
4. oRPC and Hono/native route integration.
5. Channels, exposure, trigger and subscriptions.
6. Presence.
7. Typed React client, TanStack and automatic generation.
8. React/Next.js SSR and examples.
9. Agent/tool execution and protocol mapping.
10. Thread/run storage, controls and lifecycle hardening.
11. Offline, refresh, identity and generation recovery.
12. Existing-service composition.
13. Inspector.
14. Providers, security, limits, deployment and observability.
15. Compiler, graph, manifests, exports and scaffolding.
16. Documentation deliverables.
17. File-scoped implementation slices and test/release gates.

A short overview may link to committed normative sections in the same repository. No essential behavior may be defined only by a previous chat message or by "existing approved operations..." without a concrete reference.

## 10. Implementation sequence and acceptance

Preserve end-to-end delivery. Use the following as a coverage-complete sequence, merging adjacent slices where sensible without dropping their acceptance conditions:

| Slice | End-to-end proof |
|---|---|
| Contracts and scope | All requirements mapped; final public types, provider interfaces and protocol fixtures frozen. |
| Finite typed client | GET and mutation through oRPC/TanStack, automatic registry, identity/bootstrap and fresh SSR hydration. |
| Generic streams | One service-backed function through direct invocation, oRPC, native Hono and `useStream`; cancellation/cleanup proven. |
| Public realtime | Backend trigger reaches typed subscribe/bind and `useChannel`; replay and gaps tested. |
| Protected realtime | Resource policies, identity transitions, renewal and fallback cannot bypass authorization. |
| Presence | Shared components, tabs, counts, member projections, expiry and reconnect snapshots. |
| Agent content/protocol | Real incremental text/tool progress and independent AG-UI/AI SDK decoding. |
| Agent lifecycle/control | Latest completion/interruption/claim/control/generation contracts with refresh and failure tests. |
| Inspector | Developer chats with a discovered agent, sees tools and decisions, and inspects routes/channels. |
| Shared operations | Independent Redis providers, two gateways, restart/epoch loss, admission and deployment behavior. |
| Complete app/release | New project and React/Next.js examples work, docs build, packages typecheck, all required journeys pass. |

Implement small Inspector/example/docs fixtures alongside the relevant slices. Their dedicated acceptance gate validates completeness; it must not be their first implementation.

For every slice list exact files, dependencies, inputs/outputs, failure behavior, tests, docs and review criteria. Freeze interface contracts before their consumers are implemented.

## Final instruction

Do not produce another lifecycle-only revision. Merge the original feature scope, the approved simpler client API and repository constraints, and the latest runtime corrections into one authoritative implementation specification. Account for every requirement above. A passed lifecycle test suite alone is not acceptance of streaming, frontend hooks, Inspector chat, examples or documentation.

## Source basis

This handoff is based on the user's original and subsequent requirements; the attached **Final Implementation Plan**; the earlier attached **Implementation Specification**, **Final Implementation Specification**, and **Repository-Aligned Realtime and Typed Client Implementation**; and the previously delivered `relkit-streaming-realtime-sse-plan.md` and `relkit-realtime-client-plan-v3.md`.

New slice organization and the requirement IDs in this handoff are review recommendations, not claims that those structures already exist in the attached plan or repository.
