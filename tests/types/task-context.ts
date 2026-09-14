import { defineJob, defineTask } from "@relkit/jobs";
import { z } from "@relkit/schema";

const durable = defineTask({
  id: "types.task-context",
  version: "1",
  input: z.object({ id: z.string() }),
  output: z.object({ ok: z.literal(true) }),
  progress: z.number(),
  streams: { text: z.string() },
  handler: async (_input, context) => {
    const runId: string = context.run.runId;
    const database = context.database;
    const session = context.auth.getSession;
    await context.progress.emit(1);
    await context.streams.text.emit("ready");
    await context.sleep("1 second", { key: "wait" });
    // @ts-expect-error task contexts expose declared task clients, not functions
    context.functions;
    // @ts-expect-error undeclared published events are not available
    context.events.missing;
    void runId;
    void database;
    void session;
    return { ok: true as const };
  },
  onStart: async (input, context) => {
    const id: string = input.id;
    // @ts-expect-error hooks cannot park durable work
    context.sleep;
    void id;
  },
});

defineTask({
  id: "types.retryable-task",
  version: "1",
  execution: "retryable",
  input: z.string(),
  output: z.string(),
  handler: async (input, context) => {
    // @ts-expect-error retryable tasks do not expose durable sleep
    await context.sleep("1 second", { key: "wait" });
    return input;
  },
  onFailure: async (_error, context) => {
    // @ts-expect-error hooks do not expose durable sleep in any mode
    context.sleep;
  },
});

void durable;
void defineJob({ name: "contextTask", task: durable });

defineTask({
  id: "types.invalid-task-dependencies",
  version: "1",
  input: z.string(),
  output: z.string(),
  // @ts-expect-error task dependencies cannot declare functions or events
  dependencies: { events: {} },
  handler: (input) => input,
});
