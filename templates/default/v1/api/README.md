# my-app

This maintained API candidate is exercised internally. Public API creation remains
disabled until its exact native and readiness certification passes.

A RelKit TypeScript/Bun API project with greeting, echo, and order routes.
Functions own the application handlers; routes describe transport mapping and
responses. Source-scoped IDs are inferred where safe, the order route targets a
small service, and nested calls use descriptor `invoke`.

## Commands

```sh
bun install
bun run dev
bun run test
bun run check
bun run typecheck
bun run build
```

The example routes are `GET /hello?name=RelKit`, `POST /echo` with a JSON
`message` field, and `POST /orders` with `{ orderId, sku, quantity }`.

The default project needs no Docker daemon, cloud account, or deployment
credentials.

Each service owns `src/services/<name>/service.ts` and its local implementations.
Routes live in `src/routes/`, and configuration support lives in `src/platform/`.
Keep public descriptors and async handlers in ordinary TypeScript. When installation
is skipped, install dependencies and run `bunx --no-install relkit dev --prepare`
before development. Use `relkit migrate layout` to preview a move of an existing
flat application; additions otherwise preserve its detected root.
