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

Creating an order publishes `orders.created`. Its confirmation and audit
listeners are independent durable, at-least-once deliveries: one listener can
fail without rolling back the other, and delivery is not a transaction or a
promise of simultaneous execution.
