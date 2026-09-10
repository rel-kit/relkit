# my-app

A RelKit TypeScript/Bun project with a bounded native LangChain agent and a
native LangGraph review workflow. The starter uses LangChain's deterministic
model plus local realtime and thread-state providers, so it runs without an API
key. Replace the model when connecting a production provider.

## Commands

```sh
bun install
bun run dev
bun run test
bun run check
bun run typecheck
bun run build
```

The example route is `GET /hello?name=RelKit`. The assistant exposes typed todo
state and both native and function-derived tools. The review graph demonstrates
a typed interrupt and resume on an application-owned `threadId`.
