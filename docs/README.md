# ZSys TypeScript POC — Revision 3 Documentation

Revision 3 is the approved implementation baseline.

## Start here

1. Read `zsys-typescript-poc-technical-spec-v3.md` for the complete architecture, public APIs, runtime behavior, project generator, deployment, testing handbook, and 17 implementation phases.
2. Use `zsys-typescript-poc-review-gates-v3.md` to approve each phase.
3. Read `zsys-typescript-poc-v2-to-v3-change-log.md` for the exact refinement from Revision 2.

## Final architecture at a glance

```text
plain TypeScript descriptors
          ↓
compiler
          ↓
canonical graph + runtime manifest
          ↓
planner and materializers
          ↓
internal Effect function engine
          ↓
Hono / jobs / events / buckets / cache / tools / agents
          ↓
request logs, traces, Next.js inspector
          ↓
provider-neutral deployment plan
          ↓
Pulumi → AWS
```

## Public developer experience

```ts
export const hello = defineFunction({
  id: "hello",
  input: z.object({ name: z.string() }),
  output: z.object({ message: z.string() }),
  handler: async ({ name }, context) => {
    context.log.info("hello", { name });
    return { message: `Hello, ${name}!` };
  },
});
```

No application Effect imports are required.

## Event model

```ts
export const orderCreated = defineEvent({ ... });

export default onEvent(orderCreated, {
  id: "receipts.on-order-created",
  target: sendReceipt,
  delivery: "durable",
});
```

The listener is a generic trigger binding, not a separate application subscription primitive.

## New project

```bash
bunx create-zsys@latest my-app
cd my-app
bun run dev
```

## Deployment

```bash
zsys deploy init --stack development
zsys deploy preview --stack development
zsys deploy up --stack development
```

Deployment also accepts `--backend cloud|local|s3://...|azblob://...|gs://...`,
repeatable `--config name=value` or `--config-secret name=value`, and
`--non-interactive` (`--yes`) for explicitly confirmed CI changes. `refresh`,
`outputs`, and `destroy` use the same explicit stack/backend options.

Pulumi is the sole POC deployment engine. AWS is the first cloud target.
