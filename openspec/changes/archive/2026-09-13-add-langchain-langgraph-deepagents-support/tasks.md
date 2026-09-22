## 1. Change baseline and native agent contracts

- [x] 1.1 Validate the OpenSpec artifacts, record the pre-existing dirty-path baseline, and inventory the current agent, client, transport, persistence, generator, and Inspector boundaries.
- [x] 1.2 Add the supported LangChain, LangGraph, and optional DeepAgents dependency cohort and enforce package boundaries without exposing public adapter wrappers.
- [x] 1.3 Extend `defineAgent` to accept native models, RELKIT or native tools, native middleware, and schema-selected `client.state` while preserving RELKIT function execution.
- [x] 1.4 Replace the AI SDK execution loop with one native LangChain event collector that journals every model, message, tool, middleware-state, nested-scope, control, output, error, and cancellation transition exactly once.
- [x] 1.5 Add a deterministic native-model todo agent using the real `todoListMiddleware()` and verify replacement, status transitions, incremental typed values, tool execution, final output, and no duplicate execution.

## 2. LangGraph authoring and control flow

- [x] 2.1 Add `defineGraphNode` with typed partial state updates, `interrupt()`, `Command`, `resume`, declared `ends`, and runtime destination validation.
- [x] 2.2 Add handler-free `defineFunction(...).asGraphNode()` views without changing ordinary function invocation or tool behavior.
- [x] 2.3 Add `defineGraph({ state, input, output, nodes, edges })` with string endpoint inference from `nodes`, sentinel validation, duplicate rejection, and inspectable static topology.
- [x] 2.4 Compile sequential, parallel/join, conditional, loop, `Send`, subgraph, `Command.PARENT`, update-and-goto, and schema-selected output behavior through native LangGraph.
- [x] 2.5 Verify boolean, text, and structured interruptions, pause and resume, node re-entry, dynamic movement, invalid commands, stale destinations, parallel routing, subgraphs, and direct-native parity.

## 3. Persistence and unified continuation

- [x] 3.1 Add independent lazy `defineCheckpointerDb` and `defineMemoryDb` resources with explicit owned and borrowed lifecycle behavior.
- [x] 3.2 Support documented memory, SQLite, PostgreSQL, MongoDB, Redis, shallow Redis, native, and custom protocol-compatible checkpointer and store implementations without implicit setup or migration.
- [x] 3.3 Require caller-supplied `threadId` for run, observe, stop, and resume across runtime RPC, generated clients, React hooks, and all transports.
- [x] 3.4 Implement `agent.run(reply, { threadId, resume: true })` from the persisted waiting snapshot's exact response schema and expose the typed waiting state without client-side interrupt discovery.
- [x] 3.5 Add revision binding, idempotent continuation receipts, lease fencing, stale or foreign reply rejection, and external-effect idempotency boundaries.
- [x] 3.6 Verify restart recovery, competing workers, cross-process resume, injected failures around checkpoints, journals, waiting publication, receipts, claims, resume, and terminal output.
- [x] 3.7 Verify real driver lifecycle and isolation, including that dedicated AI databases cannot mutate application Drizzle tables and borrowed clients are never closed by RELKIT.

## 4. DeepAgents and resources

- [x] 4.1 Select native DeepAgents behavior from the same `defineAgent` API when subagents, skills, memory files, or backends are configured, with model inheritance and explicit overrides.
- [x] 4.2 Support native DeepAgents backends and implement its backend contract over compatible RELKIT bucket resources while keeping Redis savers and stores distinct from cache clients.
- [x] 4.3 Normalize nested scopes, aggregate limits, cancellation, failures, tools, skills, memory, backend activity, and human input into the canonical journal without leaking native frontend dependencies.
- [x] 4.4 Verify native and RELKIT backends, nested tools and events, skills, memory, parent-child state isolation, aggregate limits, human input, and direct-native parity.

## 5. Typed client and transport parity

- [x] 5.1 Generate exact initial-input, output, resume-input, tool, public-state, custom-event, scope, waiting, and control types for agents and graphs.
- [x] 5.2 Expose canonical `values`, output, messages, tools, progress, waiting state, nested execution, and terminal status through generated clients and React hooks.
- [x] 5.3 Deliver identical canonical snapshots and ordered events through HTTP iteration, AG-UI SSE, and WebSocket with replay, reconnect, cancellation, cursor-gap, and redaction behavior.
- [x] 5.4 Capture real network frames and prove every native todo middleware update reaches the generated typed client before final completion over HTTP iteration, SSE, and WebSocket.
- [x] 5.5 Verify typed run, observe, stop, resume, custom events, tool results, terminal output, reconnect, and history behavior without frontend LangChain dependencies.

## 6. Examples and Inspector

- [x] 6.1 Add executable commerce backend and frontend examples for agents, tools, middleware state, memory, skills, subagents, graphs, interrupts, resume, SSE, and WebSocket.
- [x] 6.2 Update generated agent and fullstack templates so their generated clients compile and their examples run with explicit thread identity.
- [x] 6.3 Expose `defineGraph` metadata and runtime overlays as a first-class graph catalog, separate from agents and the application dependency graph, with start/end, registered nodes, conditional routes, parallel joins, loops, subgraphs, retries, and safe state schemas.
- [x] 6.4 Add `Graphs` to the main sidebar and render each selected graph as a deterministic top-to-bottom ELK React Flow hierarchy from `START` to `END`, preserving conditional labels, parallel branches/joins, and loops without converting todo prose into graph nodes.
- [x] 6.5 Use shadcn `Message`, `Bubble`, and `MessageScroller` presentation while preserving the RELKIT client, Streamdown, thread history, composer, tool activity, typed human-input forms, and live todo state.
- [x] 6.6 Add Inspector browser acceptance for incremental messages and todos, first-class graph navigation, top-to-bottom graph layout, conditional and parallel topology, interrupts, resume, thread restore, tools, redaction, accessibility, and responsive behavior.

## 7. Migration, documentation, and release completion

- [x] 7.1 Remove the AI SDK runtime, integration catalog and package entries, configuration, scaffold dependencies, `/ai-ui`, framing, and migrated dead code.
- [x] 7.2 Migrate commerce, templates, generated contracts, API examples, and documentation to native LangChain, LangGraph, and DeepAgents APIs.
- [x] 7.3 Bump affected contract and manifest versions, add capability negotiation, and keep historical AI SDK runs read-only without resumable-checkpoint claims.
- [x] 7.4 Document supported native versions, optional dependency errors, dynamic typing boundaries, database initialization, ownership, thread identity, middleware state, event semantics, and limitations.
- [x] 7.5 Run focused type, package, compiler, contract, integration, restart, generator, examples, docs, Inspector, browser, security, and local-driver verification and resolve all regressions.
- [x] 7.6 Run `bun run check`, `bun run typecheck`, `bun run test:all`, `bun run build`, `bun run verify`, `bun run test:examples`, `bun run test:docs`, `bun run test:inspector:browser`, `bun run test:e2e`, `bun run test:scaffold`, `bun run test:container`, `bun run test:local-docker`, `bun run test:deployment`, and `bun run prepush` with Docker available; report credential-gated paid or cloud tests as intentionally skipped.
