# RelKit documentation

The current application model is domain-first. Revision 3 records the original
POC baseline and is retained as historical design evidence.

## Start here

1. Read `getting-started.md` for the current generated application layout and local workflow.
2. Read `architecture.md`, `testing.md`, and `deployment.md` for current contributor guidance.
3. Use `apps/docs/content/docs/service/organization.mdx` when migrating a layer-first application.
4. Consult `relkit-typescript-poc-technical-spec-v3.md` and its review gates only for the historical POC baseline.

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
export const orderCreated = defineEvent({ id: "orders.created", input: orderSchema });

export default defineEventFunction({
  id: "receipts.on-order-created",
  event: "orders.created",
  delivery: "durable",
  handler: async (input, context) => {
    await sendReceipt.invoke(input);
  },
});
```

The authored event-only function receives independent deliveries through a generated exact-event trigger.
Publishers declare `publishes: ["orders.created"]` and use `context.events["orders.created"].publish(input)`.

## New project

```bash
bunx create-relkit@latest my-app
cd my-app
bun run dev
```

## Deployment

```bash
relkit deploy init --stack development
relkit deploy preview --stack development
relkit deploy up --stack development
```

Deployment also accepts `--backend cloud|local|s3://...|azblob://...|gs://...`,
repeatable `--config name=value` or `--config-secret name=value`, and
`--non-interactive` (`--yes`) for explicitly confirmed CI changes. `refresh`,
`outputs`, and `destroy` use the same explicit stack/backend options.

Pulumi is the sole POC deployment engine. AWS is the first cloud target.
