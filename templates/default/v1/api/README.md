# my-app

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
