# my-app

This maintained fullstack candidate is exercised internally. Public fullstack creation
remains disabled until its exact native and readiness certification passes.

A Relkit backend and Next.js typed client. The example includes an offline
native LangChain agent with typed todo/tool state, a LangGraph interrupt and
resume flow, explicit application-owned thread IDs, and selectable SSE or
WebSocket streaming. `bun run dev` serves the API on port 3000 and the web app on
port 3001. Inspection is disabled unless explicitly selected; install and run
`@relkit/inspector` separately for its UI (default 3210) and history. Enabling
`inspector: { enabled: true }` starts only the private application bridge.

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
mean the Next.js page has finished starting. The optional Inspector has its own
Bun/Node prerequisites and separate launch command.

Backend services live in `src/services/hello/`; backend routes and shared
configuration stay in `src/routes/` and `src/platform/`. The frontend remains
under `web/`. Keep backend descriptors and native agent handlers in ordinary
TypeScript. Existing flat backends remain compatible, with optional migration
preview through `relkit migrate layout`.
