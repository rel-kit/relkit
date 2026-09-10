# Realtime and Typed Client Compatibility Record

This record supports the consolidated implementation specification at baseline
`602b54ddd84b65b1bdfd2098adfa6876b2abc1ba`. It records tested package contracts;
it does not create a second normative specification.

| Boundary       | Pinned version | Verified behavior                                                                       |
| -------------- | -------------: | --------------------------------------------------------------------------------------- |
| Bun            |         1.3.10 | Hono-hosted oRPC iterator delivery, cancellation, and native stream bodies              |
| Hono           |         4.13.5 | Native SSE terminal events and text/byte connection failure behavior                    |
| oRPC           |  2.0.0-beta.31 | Finite procedures, HTTP iterators, route-ID aliases, and method/path aliases            |
| TanStack Query |        5.102.3 | Query, mutation, infinite, suspense, cache utilities, selection, and cancellation types |
| React          |         19.2.8 | Provider, Strict Mode-safe observer mounting, and conditional hook surfaces             |
| LangChain      |         1.5.10 | Native agent models, tools, middleware, and v3 event collection                         |
| LangGraph      |         1.4.14 | Graph scheduling, state, checkpoints, commands, and interruption                        |
| DeepAgents     |         1.13.3 | Optional subagents, skills, memory files, and backend execution                         |
| AG-UI core     |         0.0.59 | Run, text, tool, terminal, and interrupt event schema validation                        |

## Supported profiles

- Relkit client identity document version 1.
- Relkit public client contract and generator version 7.
- Relkit graph and runtime manifest version 10.
- Existing Relkit API v1 and oRPC/Hono transport ownership.
- AG-UI event schemas from `@ag-ui/core@0.0.59`.
- Canonical RelKit agent events over HTTP iteration, AG-UI SSE, and WebSocket.

## Executable evidence

- `packages/runtime-hono/rpc.test.ts` and `native-stream.test.ts` exercise the real
  Hono Fetch transport, iterator cancellation, terminal SSE events, and post-header
  failures.
- `packages/runtime-hono/agent-protocol.test.ts` parses emitted AG-UI events with
  the pinned external package and verifies the native agent event profile.
- `tests/types/client-react.ts` verifies finite, stream, presence, and conditional
  agent hook inference, including negative fixtures.
- `packages/runtime-hono/realtime-rpc.test.ts` verifies retained channel delivery
  through the managed iterator transport.
- `packages/runtime-hono/agent-rpc.test.ts` verifies durable run acceptance,
  same-thread reuse, and cross-generation control admission/consumption.

No Pi package is installed. Pi-derived behavior is represented only by Relkit-owned
contracts and tests. WebSocket upgrades and Redis-backed multi-process guarantees
remain release gates and must not be inferred from the HTTP iterator evidence.
