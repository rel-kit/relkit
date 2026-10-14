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

The example route is `GET /hello?name=RelKit`. The default project needs no
Docker daemon, cloud account, or deployment credentials.

Hello lives in `src/services/hello/`, with its public boundary at `service.ts`
and behavior in `functions/hello.function.ts`. Routes stay in `src/routes/`;
shared configuration belongs in `src/platform/`. Public descriptors and
ordinary handlers remain plain TypeScript.

Creation with installation prepares development automatically. After
`--no-install`, run `bun install` and `bunx --no-install relkit dev --prepare`
before `bun run dev`. Existing flat applications remain supported; additions
preserve their root, and `bun run relkit migrate layout` previews an optional move.
