# my-app

A small RelKit TypeScript/Bun project with one function and one HTTP route.
Application code uses public RelKit descriptors and ordinary async handlers.

## Commands

```sh
bun install
bun run dev
bun run test
bun run check
bun run typecheck
bun run build
```

The example route is `GET /hello?name=RelKit`. Development uses the local
provider set, tests use deterministic test providers, and production selects
the configured AWS provider set.
