# my-app

A small ZSys TypeScript/Bun project with one function and one HTTP route.
Application code uses public ZSys descriptors and ordinary async handlers.

## Commands

```sh
bun install
bun run dev
bun run test
bun run check
bun run typecheck
bun run build
```

The example route is `GET /hello?name=ZSys`. Development uses the local
provider set, tests use deterministic test providers, and production selects
the configured AWS provider set.
