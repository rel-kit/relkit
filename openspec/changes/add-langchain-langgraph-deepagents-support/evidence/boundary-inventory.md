# Boundary inventory

Captured before implementation source edits. See `dirty-baseline.md` for all 490 pre-existing dirty file paths (`233` tracked and `257` untracked).

## Authoring and runtime

- `packages/agents/src/define-agent.ts` accepts string model selectors and RELKIT tool references. `define-agent-support.ts` currently strips tools to serialized references.
- `packages/agents/src/runtime-loop.ts` is the single AI SDK execution seam. It constructs `ToolLoopAgent`; `runtime-model.ts`, `runtime-tools.ts`, and `runtime-tool-adapter.ts` use AI SDK types.
- `packages/agents/src/runtime-tool-adapter.ts` is the reusable RELKIT function-engine boundary for validation, policies, progress, tracing, and approval.
- `packages/cli/src/commands/build-server-registration.ts` binds live descriptors from the generated runtime manifest to `invokeAgent`.
- `packages/contracts/src/descriptor.ts` recursively freezes descriptor fields, so opaque native objects require a live non-destructive representation plus serializable inspection metadata.

## Graph and persistence

- No workflow `defineGraph`, `defineGraphNode`, `Command`, `interrupt`, checkpointer, or memory resource exists.
- `packages/functions/src/function-descriptor-factory.ts` is the established non-enumerable `.invoke()` and `.asTool()` pattern for `.asGraphNode()`.
- `packages/agents/src/state-provider.ts` already defines durable journals, receipts, claims, leases, fences, controls, and continuation admission. Local and Redis implementations provide the reusable RELKIT envelope.
- `packages/runtime-hono/src/agent-approval-coordinator.ts` keeps active interruption resolvers in a process-local map, so current continuation cannot survive restart.
- Native checkpointers/stores must remain separate from application Drizzle and RELKIT Redis cache/state clients.

## Events, client, and transports

- Native activity currently flows through `AgentContentSink` into runtime-Hono sinks, `AgentStateProvider.appendJournal`, `agentClientEvents()`, and client/AG-UI projections.
- Existing journal kinds cover messages, progress, approvals, controls, terminal, and interruption, but not public values, custom events, graph tasks, or nested execution.
- `packages/client/src/react/agent-observation.ts` does not derive terminal output; the generated `ClientAgentContract` contains only input, output, controls, and chat.
- `useAgent` and runtime-Hono currently permit hidden/generated thread IDs and expose separate approval APIs.
- HTTP iteration and WebSocket share oRPC; AG-UI SSE is a separate projection from the same journal. `/ai-ui` is the legacy AI SDK deletion seam.

## Inspector, examples, and migration

- Inspector already uses React Flow. Its current deterministic layout is columns-by-kind and its graph contract models application dependencies, not workflow topology.
- Inspector agent UI duplicates client/runtime types and automatically restores thread IDs; it should consume `@relkit/client` after the canonical contract is extended.
- Commerce and the agent template still configure `@relkit/ai-sdk`; the untracked fullstack template currently demonstrates routes only.
- AI SDK removal spans `integrations/packages/ai-sdk`, the integration catalog, package references, compiler/deployment fixtures, scaffold generation, docs, tests, and the lockfile.

## Existing verification seams

- Agent behavior: `packages/agents/runtime.test.ts`, `client-events.test.ts`, `packages/testing/agent-matrix-*.test.ts`.
- Durable runtime: `packages/runtime-hono/agent-rpc.test.ts`, `agent-approval-rpc.test.ts`, `agent-protocol.test.ts`.
- State providers: `packages/providers-local/agent-state.test.ts`, `tests/integration/redis-state-acceptance.ts`.
- Client and transports: `packages/client/agent-observation.test.ts`, runtime-Hono WebSocket/native-stream tests.
- Inspector and generation: `tests/inspector`, `tests/generator`, `scripts/test-inspector-browser.ts`, Playwright tests.

All primary seams overlap pre-existing user changes. Every overlapping file must be diffed immediately before modification.
