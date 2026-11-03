/** Defines the immutable retryable task whose doubled output proves selected production worker execution. */
import { defineTask } from "relkit/tasks";
import { z } from "relkit/schema";

export default defineTask({
  id: "probe.double",
  version: "1",
  execution: "retryable",
  input: z.object({ value: z.number() }),
  output: z.object({ doubled: z.number() }),
  handler: async ({ value }) => ({ doubled: value * 2 }),
});
