## Why

RELKIT’s current agent runtime is coupled to AI SDK and exposes only part of the execution, state, continuation, and visualization behavior required by LangChain, LangGraph, and DeepAgents applications. Native framework support is needed without sacrificing RELKIT’s schema validation, generated client, transport consistency, persistence safety, or Inspector.

## What Changes

- **BREAKING** Replace AI SDK as the built-in agent runtime with native LangChain/LangGraph execution and remove AI SDK-specific configuration, integration, protocol framing, and scaffold dependencies.
- Accept native LangChain models, tools, middleware, callbacks, stores, checkpointers, and DeepAgents capabilities through RELKIT’s normal authoring APIs without adapter wrappers.
- Add `defineGraphNode`, function `.asGraphNode()` views, and `defineGraph` with registered nodes and typed string edges.
- Add durable checkpoint/memory resources and a unified typed `run(value, { threadId, resume: true })` continuation path.
- Extend the generated client and every transport with validated public state, complete scoped events, replay, and nested execution.
- Extend Inspector with shadcn-based agent chat, schema-driven human input, live middleware state, and React Flow workflow visualization.
- Add executable commerce/template examples and native-versus-RELKIT, driver, restart, transport, security, and browser acceptance coverage.

## Capabilities

### New Capabilities

- `agent-graph-workflows`: LangGraph node authoring, typed topology, native control flow, interrupts, and routing.
- `agent-persistence`: Checkpointer, memory-store, durable continuation, and driver interoperability contracts.
- `typed-agent-client`: Generated execution, resume, public-state, event, and transport contracts.
- `ai-sdk-migration`: Removal of AI SDK runtime/protocol surfaces and migration of templates, examples, and historical data behavior.

### Modified Capabilities

- `tools-agents`: Agents use native LangChain/DeepAgents execution and accept native models, tools, middleware, subagents, skills, memory, and backends.
- `development-inspector`: Inspector adds workflow topology, nested live execution, middleware state, typed human input, and reusable chat presentation.

## Impact

This affects agent/function/tool authoring, compiler graph and manifests, native runtime execution, state providers, generated clients, HTTP iterator/SSE/WebSocket transports, Inspector, commerce examples, templates, documentation, and release contracts. It introduces LangChain and LangGraph as core runtime dependencies while DeepAgents and individual model/database/backend drivers remain optional application dependencies. No paid provider or cloud execution is required for local acceptance.
