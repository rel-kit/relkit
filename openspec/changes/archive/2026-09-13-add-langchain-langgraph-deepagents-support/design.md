## Context

See `proposal.md` for motivation and `specs/` for behavioral contracts. RELKIT already has strict schema descriptors, a common function/tool engine, durable agent journals and claims, generated clients, HTTP iterator/SSE/WebSocket transports, AG-UI types, React Flow, and an Inspector chat surface. The current agent loop and model integration use AI SDK, approvals are partly process-local, the client can select hidden thread IDs, and Inspector represents dependency topology rather than native workflow execution.

The checkout contains extensive uncommitted current implementation. All changes are user-owned; implementation must inspect overlapping diffs and preserve them. Bun 1.3.10, strict TypeScript, existing package boundaries, and the 200-line implementation-file limit remain mandatory.

## Goals / Non-Goals

**Goals:**

- Make supported native LangChain/LangGraph execution the only built-in agent runtime while retaining RELKIT’s authoring, policy, validation, durability, generated client, and Inspector strengths.
- Offer one intuitive agent API and a graph-specific API without public conversion or runtime-adapter plumbing.
- Preserve native semantics and make unsupported/dynamic capabilities explicit.
- Prove behavior through deterministic native execution, real local drivers/transports, failure injection, generated projects, and browser acceptance.

**Non-Goals:**

- Reimplement LangChain, LangGraph, DeepAgents, their schedulers, middleware, savers, stores, or model providers.
- Bundle every optional driver or DeepAgents into RELKIT core.
- Support Python-only APIs, LangSmith Agent Server, or Mastra in this change.
- Run paid provider or cloud acceptance without separate authorization.
- Redesign general Drizzle service selection or promise exactly-once arbitrary external effects.

## Decisions

### Native dependency boundary

`langchain` and `@langchain/langgraph` are the built-in execution dependencies. `@langchain/core` compatibility follows their supported peer cohort. `deepagents`, model packages, checkpoint/store drivers, and backend implementations are optional application dependencies loaded only when declared capabilities need them.

Initial certified cohort:

- `langchain@1.5.10`
- `@langchain/core@1.2.9`
- `@langchain/langgraph@1.4.14`
- `deepagents@1.13.3`
- existing `@ag-ui/core@0.0.59`

Alternative rejected: a public `@relkit/langchain` adapter and `defineApp.langchain()` wrapper. LangChain is the default implementation, so adapter plumbing would expose internal architecture and create two configuration paths.

### Models, tools, and middleware

Application model profiles accept a compatible native model instance or a lazy factory receiving validated server environment. Resolution is explicit agent selection, inherited parent selection, then application default. Instances and credentials never enter compiler or browser artifacts.

RELKIT function-backed tools directly satisfy the supported native tool contract while delegating execution through the existing function engine. Native tools are accepted in `defineAgent.tools`. `defineTool` remains the place to attach RELKIT policies or missing output metadata. There are no public `toLangChainTool`/`fromLangChainTool` helpers.

`defineAgent.middleware` accepts native middleware directly. Compiler metadata extracts contributed state schemas and tools without executing lazy runtime factories. `client.state` is a typed public-state key allowlist. Missing selection exposes no additional native `values`; messages, tools, and custom events retain their separate exposure policies.

The real native `todoListMiddleware()` is the vertical acceptance fixture. It contributes `write_todos` and a typed `todos` state channel. Its `Command` reaches the native scheduler unchanged, so list replacement and parallel-write rejection remain upstream behavior.

Alternative rejected: a RELKIT todo implementation or middleware wrapper. It would prove RELKIT behavior rather than native compatibility.

### One agent declaration

`defineAgent` handles ordinary and deep agents. Ordinary capabilities use native `createAgent`; declarations with subagents, skills, memory files, or backends use native `createDeepAgent`. Explicit model → parent model → application default is the inheritance order. Native factory adoption remains available for already-compiled/advanced agents with required schema metadata.

Subagents share the developer-supplied root thread and use native checkpoint namespaces. Aggregate limits and root cancellation include children. Independent child business execution requires another explicit thread ID. Arbitrary structured agents require an explicit delegation mapping rather than guessed message conversion.

### Graph-specific authoring

`defineFunction` stays unchanged. `defineGraphNode` owns state updates, `interrupt`, `Command`, `resume`, and `ends`. Callable functions gain a non-enumerable handler-free `.asGraphNode({ id? })` view modeled on `.asTool()`. The view preserves the target function identity relationship and uses the common engine; it does not copy handlers or gain hidden control flow.

`defineGraph` accepts:

```typescript
defineGraph({
  id,
  state,
  input,
  output,
  nodes: [lookup, risk, review],
  edges: (graph) =>
    graph.addEdge(START, "lookup").addEdge(START, "risk").addEdge(["lookup", "risk"], "review"),
  checkpointer,
  store,
});
```

The literal node-ID union comes only from `nodes`; edge arguments must not widen it. Descriptor endpoints are rejected. Runtime/compiler also reject duplicates, invalid sentinel placement, missing destinations, and stale `ends`. RELKIT registers nodes and compiles the native graph internally.

Object node inputs project declared fields from graph state and validate them. Object outputs are validated partial updates. Scalar/renamed transformations require an explicit node. Native reducers, conditional edges, `Send`, `Command`, loops, subgraphs, retry/pending-write behavior, and `Command.PARENT` remain upstream scheduling.

Commands from RELKIT nodes validate updates against node and graph writable schemas and destinations against registered nodes. Commands from native middleware/tools use their native contributed state contracts. Interrupts and commands bypass ordinary failure/result normalization only inside supported native graph execution.

Graph output schemas select and validate final public output. Public state streaming is separately projected through `client.state`; native output selection alone does not redact state streams. Computed/renamed output uses a final graph node, not `mapOutput`.

### Persistence and database safety

Add lazy `defineCheckpointerDb` and `defineMemoryDb` resources. Compatible native instances are borrowed by default; factory-created resources are owned and use explicit disposal. Borrowed pools are never closed. Resources retain driver-native history, shallow retention, TTL, serializers, and semantic-search capability rather than a false common feature set.

Dedicated AI databases are the default. Shared physical databases require explicit compatible underlying clients, isolated schemas, restricted roles, and Drizzle filters. Compilation, inspection, activation, and requests never call migrations, `drizzle-kit push`, native `.setup()`, or table/index/extension creation. Setup is an explicit application/infrastructure action.

RELKIT Redis cache clients are not cast as native Redis savers/stores. RELKIT buckets implement the actual DeepAgents backend protocol internally, including path safety, pagination, errors, and cancellation; they are not treated as S3 SDK clients.

### Unified thread and continuation API

The hook takes only the generated definition selector. Every operation supplies the application-owned thread ID:

```typescript
const review = useAgent("order-review");
await review.run({ orderId }, { threadId: `order:${orderId}` });
await review.run(true, { threadId: `order:${orderId}`, resume: true });
await review.observe({ threadId: `order:${orderId}` });
await review.stop({ threadId: `order:${orderId}` });
```

There is no generated, remembered, input-derived, or UUID-only fallback. Internal operation/run/task IDs remain separate.

Before exposing a pause, runtime persists the native checkpoint, exact response schema, safe prompt/snapshot, binding metadata, and revision, closes the segment, then releases the worker. Resume validates scope, authorization, thread, active waiting state, exact response schema, revision, action/arguments/policy hash, expiry, and idempotent receipt before a fenced worker resumes the same native checkpoint in a new segment.

RELKIT automatically handles native interrupt IDs, action ordering, checkpoint references, receipts, and `Command({ resume })`. It never interprets `"yes"` as boolean approval. Parallel replies are a stable schema-described batch mapped to native IDs/order and bound to one revision. Browser clients cannot choose arbitrary `goto` destinations.

### Canonical event and state pipeline

One native execution feeds a collector using the pinned native v3 stream channels plus callbacks only for missing categories. Ownership/correlation rules deduplicate overlapping projections. The authorized, redacted public projection becomes AG-UI events plus versioned RELKIT metadata, is journaled durably, and feeds all transports, snapshots/replay, generated clients, and Inspector through one reducer.

Coverage includes execution segments, messages/content blocks/multimodal data, model lifecycle/usage, tool arguments and lifecycle, nodes/tasks/attempts, branches/joins/loops/fan-out, subgraphs/subagents, checkpoints, public state, partial/final structured output, waiting/resume, custom events, cancellation, and failures. Logical operation, segment, parent, node, task, attempt, message, tool, and cursor scopes remain distinguishable.

Authoritative post-reducer public values become AG-UI state snapshots/deltas. Raw updates, tool fragments, commands, checkpoints, hidden reasoning, system prompts, credentials, and private native state are never exposed. Disconnecting an observer does not cancel execution.

### Generated client and transports

Registry/codegen captures initial input, final output, declared resume input, tools, public state, custom events, execution scopes, and controls. Generated clients contain no backend native dependencies. Known contracts remain precise; opaque native payloads use an explicit dynamic discriminator with `unknown` data.

`agent.values` is selected validated state, `agent.output` is validated final output, and messages/tools/progress/waiting/events remain distinct. Values are undefined until an authorized snapshot/event supplies them.

HTTP iterator, AG-UI SSE, and WebSocket carry the same events and reducer behavior. SSE uses actual AG-UI objects and cursor IDs, not the existing iterator or AI SDK `[DONE]` framing. Auto/fallback never hides authentication or contract mismatch. Replay is idempotent with bounded buffers and explicit cursor-gap recovery.

### Inspector and examples

Inspector retains API-only isolation. Static workflow metadata comes from registered nodes/edges/`ends` or native builder metadata; observed dynamic tasks/transitions enrich run views without executing predicates/models. React Flow remains the canvas and ELK supplies deterministic layered/compound layout off the main thread.

`Graphs` is a first-class main-sidebar catalog of `defineGraph` declarations. Its detail canvas contains the graph definition itself, not an agent wrapper or the workspace dependency graph, and uses a top-to-bottom hierarchy from `START` to `END`. Parallel branches share a layer, joins converge visibly, conditional edges retain route labels, and loops remain explicit. Graph state and safe node schemas accompany the topology. Definition nodes and task attempts are distinct, and an accessible relationship fallback exposes equivalent topology.

Agents and deep agents remain under `Agents`; their chat surface does not own graph-definition navigation. Agent, tool, subagent, and resource relationships may appear only when they are part of a selected graph's declared topology or execution overlay.

Chat uses copied shadcn `Message`, `Bubble`, `MessageScroller`, and markers with the existing Radix styling, Streamdown renderer, composer, history, tool accordion, and activity panels. RELKIT remains the state/transport owner; no AI SDK or CopilotKit runtime is introduced. Todo lists remain execution state beside the graph, not invented topology.

Commerce backend/frontend and agent/fullstack templates contain executable examples for agents, native/RELKIT tools, middleware todo streaming, deep agents, skills/memory, graphs, interrupts/resume, persistence, SSE, WebSocket, and Inspector.

### Testing and work coordination

The OpenSpec task file is the single progress ledger. The root implementer owns shared interfaces and integration. Subagents may work only on bounded non-overlapping paths or independent verification after interfaces are fixed; the root reviews their diffs and alone marks tasks complete.

Every milestone starts with focused type/unit/contract tests and ends with its integration gate. The todo fixture uses real `todoListMiddleware()` and native commands with a deterministic model. Test barriers hold subsequent model steps after each committed update so assertions prove live streaming before final output without sleeps or synthetic reducer events.

Direct-native differential tests compare final output, interrupt/resume, routes, parallel scheduling, state transitions, expected effects, and causal events on isolated fixtures. Real local acceptance uses Bun HTTP/WebSocket, SQLite, PostgreSQL, MongoDB, Redis modules, MinIO, generated applications, and the browser Inspector.

## Risks / Trade-offs

- [Upstream native APIs evolve] → Pin/certify an initial cohort, isolate native compatibility internals, publish a tested matrix, and fail unsupported versions explicitly.
- [Existing dirty changes overlap core packages] → Inventory baseline paths, inspect every overlap, make surgical patches, and never reset/stage/commit user work.
- [Native stream channels overlap callbacks] → Define event ownership and stable correlation/deduplication tests before broad event coverage.
- [Journal and checkpoint databases cannot share a transaction] → Persist in a fixed order, reconcile crash windows, fence workers, and test every boundary.
- [Interrupted nodes re-enter from the beginning] → Document idempotency, approve before effects, and add replay/failure-injection tests.
- [Native drivers have different setup/capabilities] → Preserve native contracts, prohibit implicit setup, and test real drivers rather than claiming equivalence.
- [Large typed unions harm compiler/client performance] → Measure generated-client size/typecheck and keep dynamic native content explicitly bounded rather than widening known members.
- [Inspector graph complexity causes UI instability] → Use deterministic worker layout, stable IDs, bounded live overlays, nested collapse, and accessibility fallback.

## Migration Plan

1. Land native contracts and a vertical agent/todo stream while existing current changes remain intact.
2. Add graph authoring/control, then persistence/resume, then DeepAgents/resources.
3. Complete client transports, examples, and Inspector against the native runtime.
4. Remove AI SDK runtime/integration/protocol surfaces only after native acceptance covers the same required behavior.
5. Bump contract/graph/manifest capabilities, regenerate applications/templates, and keep historical AI SDK runs read-only.
6. Run all local deterministic, container, browser, scaffold, build, verification, and prepush gates. Paid/cloud acceptance remains separately authorized.

Rollback before release is the prior published version; historical data is not destructively migrated. Within the dirty checkout, no reset or destructive rollback is permitted—failed work is corrected surgically while preserving user changes.
