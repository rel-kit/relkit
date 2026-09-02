# my-app

A RelKit TypeScript/Bun project with the minimal HTTP example and a bounded
agent backed by a function-derived read-only tool. Tests use a deterministic
scripted model, while production resolves the selected AI SDK profile.

The agent may omit `model` to use the configured default profile. OpenAI and
Anthropic credentials remain named binding-local values.

## Commands

```sh
bun install
bun run dev
bun run test
bun run check
bun run typecheck
bun run build
```

The example route is `GET /hello?name=RelKit`. Agent prompt and result content
are not captured by default.
