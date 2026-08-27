# Better Auth + Drizzle showcase

Run `bun run check`, `bun test`, then `bun run dev` and open `http://127.0.0.1:3000`. Better Auth owns login/logout cookies; RELKIT routes share the registered session through `ctx.auth.getSession()`. `src/browser-client.ts` also shows live bearer-header mutation for non-cookie APIs.
