# my-app

A small RelKit task and job project. The selected `--jobs` provider runs account-free
through Docker and keeps task code in a domain-owned worker.

```sh
bun install
bun run dev
bun run jobs:trigger
bun run test
bun run check
bun run build
```

The example task is `orders.exportOrders`; its fake export writes no external data.
