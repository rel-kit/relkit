import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import type { InvocationContext } from "../../packages/engine/src/index.ts";
import { z } from "../../packages/schema/src/index.ts";
import { createTestJob } from "../../packages/testing/src/index.ts";
import { resolveRestartStateRoot } from "./state-root.ts";

const [mode, requestedStateRoot, startTimeText] = process.argv.slice(2);
const startTimeMs = Number(startTimeText);
if (
  (mode !== "after-lease" && mode !== "after-ack" && mode !== "recover") ||
  requestedStateRoot === undefined ||
  !Number.isSafeInteger(startTimeMs)
) {
  throw new Error("Usage: jobs-worker.ts <after-lease|after-ack|recover> <state-root> <time>");
}
const stateRoot = resolveRestartStateRoot(requestedStateRoot);

const input = z.object({ orderId: z.string() });
const output = z.object({ processed: z.boolean() });
const invocationPath = join(stateRoot, "invocations.ndjson");
const target = {
  id: "tests.restart.jobs.target",
  input,
  output,
  handler: async (
    value: { readonly orderId: string },
    context: InvocationContext,
  ): Promise<{ readonly processed: true }> => {
    await appendFile(
      invocationPath,
      `${JSON.stringify({ orderId: value.orderId, attempt: context.invocation.attempt })}\n`,
    );
    return { processed: true };
  },
};

await run();

async function run(): Promise<void> {
  const job = await createTestJob({
    jobId: "tests.restart.jobs",
    target,
    stateRoot,
    startTimeMs,
    leaseDurationMs: 10,
  });

  if (mode === "recover") {
    const result = await job.runNext();
    if (result?.state !== "completed") throw new Error("Restarted job did not complete");
    await job.close();
    return;
  }

  await job.enqueue({ orderId: "order-1" });
  const failurePoint =
    mode === "after-lease" ? "job.after-lease" : "job.after-handler-success-before-ack";
  job.failures.once(failurePoint);
  try {
    await job.runNext();
    throw new Error(`Worker did not stop at ${failurePoint}`);
  } catch (cause) {
    if (!(cause instanceof Error) || !cause.message.includes(failurePoint)) throw cause;
    // SIGKILL models a lost worker; the durable lease/handler boundary has already completed.
    process.kill(process.pid, "SIGKILL");
  }
}
