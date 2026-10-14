# my-app

This maintained agent candidate is exercised internally. Public agent creation remains
disabled until its exact native and readiness certification passes.

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

Hello's boundary, functions, tools and agents live in `src/services/hello/`.
Routes stay in `src/routes/`, and Platform owns shared configuration. Public
descriptors use ordinary TypeScript and the native model APIs. After skipped
installation, install dependencies and run `bunx --no-install relkit dev --prepare`.
Existing flat additions preserve their root; `relkit migrate layout` previews a move.
