/** Triggers the selected durable task with a stable proof operation identity and returns its actual run ID. */
import { defineFunction } from "@relkit/app/functions";
import { z } from "@relkit/app/schema";
import task from "../tasks/double.task.js";

export default defineFunction({
  id: "probe.submit",
  input: z.object({ value: z.number() }),
  output: z.object({ runId: z.string() }),
  dependencies: { tasks: { probe: task } },
  handler: async (input, context) => {
    const run = await context.tasks.probe.trigger(input, { operationId: "production-proof" });
    return { runId: run.runId };
  },
});
