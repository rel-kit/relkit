# my-app

A small RelKit task and job project. The selected `--jobs` provider runs account-free
through Docker and keeps task code in a domain-owned worker.

```sh
bun install
bun run check
bun run relkit local up --detach
bun run dev
```

In a second terminal, trigger the generated Orders task and inspect its run:

```sh
bun run jobs:trigger
bun run relkit jobs runs get --run-id <runId>
```

Use the `runId` from the trigger command. Other project checks are:

```sh
bun run test
bun run build
```

The example task is `orders.exportOrders`; its fake export writes no external data.
