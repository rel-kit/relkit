# Tasks and jobs

Use a task for work that must outlive its initiating request; a function remains a request- or event-scoped operation.

## `defineTask`

```ts
import { defineTask } from "@relkit/app/tasks";
import { z } from "@relkit/app/schema";

export default defineTask({
  id: "orders.export-orders",
  version: "1",
  execution: "durable",
  input: z.object({ orderIds: z.array(z.string()) }),
  output: z.object({ exported: z.number().int().nonnegative() }),
  progress: z.object({ completed: z.number().int().nonnegative() }),
  handler: async ({ orderIds }, context) => {
    await context.progress.emit({ completed: orderIds.length });
    return { exported: orderIds.length };
  },
});
```

## `defineJob`

Bind the task to a public job name and an explicit client policy in `src/services/orders/jobs/export-orders.job.ts`:

```ts
import { defineJob } from "@relkit/app/jobs";
import exportOrders from "@app/services/orders/tasks/export-orders.task.js";

export default defineJob({
  id: "orders.export-orders-job",
  name: "exportOrders",
  task: exportOrders,
  client: {
    public: true,
    operations: ["trigger", "get", "list", "watch"],
    fields: ["status", "progress", "output"],
  },
});
```

Expose the task and job through the owning service's `tasks` and `jobs` maps. Keep the task ID and version stable; change the version for an intentional incompatible task contract. Make side effects idempotent because work may retry or resume.

The app's `relkit.config.ts` selects a compatible jobs provider. Run `bun run relkit jobs capabilities` to inspect its actual guarantees; a durable task needs a binding that supports durable execution. `relkit add task` and `relkit add job --target <task-id>` scaffold the pair without running a worker or provisioning a provider.

A trigger admits work and returns a run handle, not the task's output. Keep its `runId` and `operationId`, then read or watch the run; a typed client alone does not authorize a caller. A raw HTTP trigger can return the accepted handle with status `202`. Use `bun run relkit local status` to inspect local provider state before exercising a Docker-backed job.
