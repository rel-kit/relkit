/**
 * Source files the newcomer deploy test adds to the `api` template: a `probe` service whose task
 * runs from an HTTP trigger, a schedule that fires every minute, and an event consumer. The test
 * reads the outcomes from the Postgres backend's own tables, so the probe needs no storage of its own.
 */

/** Project-relative path to file content. */
export const PROBE_FILES: Readonly<Record<string, string>> = {
  "src/services/probe/tasks/record.task.ts": `/** Records one probe; its run row in Postgres is the evidence the deploy test reads. */
import { defineTask } from "relkit/tasks";
import { z } from "zod";

export default defineTask({
  id: "probe.record",
  version: "1",
  execution: "retryable",
  input: z.object({ kind: z.enum(["job", "event", "schedule"]), key: z.string() }),
  output: z.object({ key: z.string() }),
  handler: async ({ kind, key }, context) => {
    context.log.info("probe recorded", { kind, key });
    return { key };
  },
});
`,
  "src/services/probe/jobs/record.job.ts": `/** Runs the probe task on demand and once a minute. */
import { defineJob } from "relkit/jobs";
import record from "@app/services/probe/tasks/record.task.js";

export default defineJob({
  id: "probe.record-job",
  name: "record",
  task: record,
  schedules: [
    {
      id: "everyMinute",
      cron: "* * * * *",
      timezone: "UTC",
      input: { kind: "schedule", key: "tick" },
    },
  ],
});
`,
  "src/services/probe/events/pinged.event.ts": `/** The fact the probe publishes and consumes. */
import { defineEvent } from "relkit/events";
import { z } from "zod";

export default defineEvent({
  id: "probe.pinged",
  version: 1,
  input: z.object({ key: z.string() }),
});
`,
  "src/services/probe/functions/submit.function.ts": `/** Triggers the probe task; the key is also the operation ID, so a retry never doubles it. */
import { defineFunction } from "relkit/functions";
import { z } from "zod";
import record from "@app/services/probe/tasks/record.task.js";

export default defineFunction({
  id: "probe.submit",
  input: z.object({ key: z.string() }),
  output: z.object({ runId: z.string() }),
  dependencies: { tasks: { record } },
  handler: async ({ key }, context) => {
    const run = await context.tasks.record.trigger({ kind: "job", key }, { operationId: key });
    return { runId: run.runId };
  },
});
`,
  "src/services/probe/functions/ping.function.ts": `/** Publishes the probe event. */
import { defineFunction } from "relkit/functions";
import { z } from "zod";
import pinged from "@app/services/probe/events/pinged.event.js";

export default defineFunction({
  id: "probe.ping",
  input: z.object({ key: z.string() }),
  output: z.object({ key: z.string() }),
  dependencies: { events: { pinged } },
  handler: async ({ key }, context) => {
    await context.events.pinged.publish({ key });
    return { key };
  },
});
`,
  "src/services/probe/functions/on-pinged.function.ts": `/** Consumes the probe event and records it through the task. */
import { defineEventFunction } from "relkit/events";
import record from "@app/services/probe/tasks/record.task.js";

export default defineEventFunction({
  id: "probe.on-pinged",
  event: "probe.pinged",
  profile: "postgres",
  dependencies: { tasks: { record } },
  handler: async ({ key }, context) => {
    await context.tasks.record.trigger({ kind: "event", key }, { operationId: "event-" + key });
  },
});
`,
  "src/services/probe/service.ts": `/** Declares the probe service the deploy test drives. */
import { defineService } from "relkit/services";
import pinged from "@app/services/probe/events/pinged.event.js";
import ping from "@app/services/probe/functions/ping.function.js";
import submit from "@app/services/probe/functions/submit.function.js";
import recordJob from "@app/services/probe/jobs/record.job.js";
import record from "@app/services/probe/tasks/record.task.js";

export default defineService({
  functions: { submit, ping },
  events: { pinged },
  tasks: { record },
  jobs: { recordJob },
});
`,
  "src/routes/probe/jobs/route.ts": `/** POST /probe/jobs triggers the probe task. */
import { defineRoute } from "relkit/routes";
import probe from "@app/services/probe/service.js";

export const POST = defineRoute({ target: probe.submit });
`,
  "src/routes/probe/events/route.ts": `/** POST /probe/events publishes the probe event. */
import { defineRoute } from "relkit/routes";
import probe from "@app/services/probe/service.js";

export const POST = defineRoute({ target: probe.ping });
`,
};
