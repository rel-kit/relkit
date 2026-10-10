# my-app

A Relkit backend and Next.js typed client. The example includes an offline
native LangChain agent with typed todo/tool state, a LangGraph interrupt and
resume flow, explicit application-owned thread IDs, and selectable SSE or
WebSocket streaming. `bun run dev` serves the API on port 3000, the web app on
port 3001, and the Inspector on port 3210.

```sh
bun install
bunx --no-install relkit dev --prepare
bun run dev
bun run test
bun run typecheck
bun run build
```

Creation with installation prepares the backend automatically. If installation
was skipped, the finite preparation command above validates and prepares it after
`bun install`. The API and Next.js commands start independently; `bun run dev:api`
and `bun run dev:web` can also be used separately. Backend readiness does not
mean the Next.js page or Inspector has finished starting.
