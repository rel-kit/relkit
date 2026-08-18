# my-app

A ZSys TypeScript/Bun project with the minimal HTTP example and a bounded
agent backed by a read-only tool. The model profile is logical metadata; local
and test runs use the scripted provider, while production uses the configured
AWS provider set.

## Commands

```sh
bun install
bun run dev
bun run test
bun run check
bun run typecheck
bun run build
```

The example route is `GET /hello?name=ZSys`. Agent prompt and result content
are not captured by default.
