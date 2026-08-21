# my-app

A ZSys TypeScript/Bun project with the minimal HTTP example and a bounded
agent backed by a function-derived read-only tool. Tests use deterministic AI
SDK test models, while production uses the configured AWS provider set.

The agent may omit `model` to use the configured `defaultProvider` and
`defaultModel`; production keeps OpenAI and Anthropic credentials as
environment references in `modelProviders`.

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
