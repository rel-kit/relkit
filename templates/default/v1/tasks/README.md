# my-app

This maintained task/provider candidate is exercised internally. Public jobs
creation remains disabled until exact native and readiness certification passes.

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

The example task is `orders.export-orders`; its fake export writes no external data.
Its boundary, task, job and function live in `src/services/orders/`; routes remain
in `src/routes/`, and shared configuration lives in Platform. Public descriptors
remain ordinary TypeScript. Additions preserve an existing flat application's
root; `relkit migrate layout` previews an optional coordinated move.
