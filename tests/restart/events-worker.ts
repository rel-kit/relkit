import { access, appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defineEventFunction } from "../../packages/events/src/index.ts";
import { z } from "../../packages/schema/src/index.ts";
import { createTestEvent } from "../../packages/testing/src/index.ts";

type EventWorkerMode =
  "after-lease" | "after-ack" | "recover" | "ephemeral-loss" | "ephemeral-recover" | "fanout";

const mode = process.argv[2] as EventWorkerMode | undefined;
const stateRoot = process.argv[3];
const startTimeMs = Number(process.argv[4]);
const modes: readonly EventWorkerMode[] = [
  "after-lease",
  "after-ack",
  "recover",
  "ephemeral-loss",
  "ephemeral-recover",
  "fanout",
];
if (
  mode === undefined ||
  !modes.includes(mode) ||
  stateRoot === undefined ||
  !Number.isSafeInteger(startTimeMs)
) {
  throw new Error("Usage: events-worker.ts <mode> <state-root> <time>");
}

const retry = {
  maxAttempts: 1,
  initialDelayMs: 0,
  maxDelayMs: 0,
  multiplier: 1,
  jitter: "none" as const,
};
const payloadSchema = z.object({ orderId: z.string() });

await run();

async function run(): Promise<void> {
  if (mode === "ephemeral-recover") {
    const event = await createEvent({
      delivery: "ephemeral",
      target: createTarget("ephemeral", "complete"),
    });
    await writeResult({
      acceptedEnvelopes: event.envelopes.length,
      completed: event.completed(),
      deliveryRootExists: await exists(join(stateRoot, "deliveries")),
      deliveries: event.deliveries.length,
      pending: event.pending(),
    });
    await event.close();
    return;
  }

  if (mode === "fanout") {
    const event = await createEvent({
      triggers: [
        {
          id: "orders.bad-listener",
          target: createTarget("bad-listener", "fail"),
          delivery: "durable",
          retry,
        },
        {
          id: "orders.good-listener",
          target: createTarget("good-listener", "complete"),
          delivery: "durable",
          retry,
        },
      ],
    });
    await event.publish({ orderId: "order-1" });
    const results = await event.drain();
    await writeResult({
      completed: event.completed(),
      listeners: results.map(({ triggerId, status, state, attempt }) => ({
        id: triggerId,
        status,
        state,
        attempt,
      })),
    });
    await event.close();
    return;
  }

  const event = await createEvent({
    delivery: mode === "ephemeral-loss" ? "ephemeral" : "durable",
    target: createTarget(
      mode === "ephemeral-loss" ? "ephemeral" : "receipt",
      mode === "after-lease" || mode === "ephemeral-loss" ? "kill" : "complete",
    ),
  });
  if (mode === "after-ack") {
    event.failures.failAt("event.after-handler-success-before-ack", new Error("ack gap"));
  }
  if (mode === "recover") {
    const result = await event.runNext();
    if (result?.state !== "completed") throw new Error("Restarted event did not complete");
    await writeResult({
      attempt: result.attempt,
      duplicate: result.duplicate,
      state: result.state,
      status: result.status,
    });
    await event.close();
    return;
  }

  await event.publish({ orderId: "order-1" });
  try {
    await event.runNext();
    if (mode === "after-ack") throw new Error("Worker did not stop at the acknowledgement gap");
  } catch (cause) {
    if (mode !== "after-ack" || !(cause instanceof Error) || cause.message !== "ack gap") {
      throw cause;
    }
    // The handler has succeeded and the durable lease is still unacknowledged.
    process.kill(process.pid, "SIGKILL");
  }
}

function createTarget(listener: string, behavior: "complete" | "fail" | "kill") {
  return defineEventFunction({
    id: `tests.restart.events.${listener}`,
    event: "orders.created" as never,
    handler: async (_, context) => {
      await appendFile(
        join(stateRoot, "invocations.ndjson"),
        `${JSON.stringify({ listener, instanceId: context.trigger.event.instanceId })}\n`,
      );
      if (behavior === "kill") {
        // SIGKILL models process loss after durable lease acquisition or ephemeral admission.
        process.kill(process.pid, "SIGKILL");
        throw new Error("unreachable");
      }
      if (behavior === "fail") throw new Error("listener failed");
    },
  });
}

async function createEvent(options: {
  readonly delivery?: "ephemeral" | "durable";
  readonly target?: ReturnType<typeof createTarget>;
  readonly triggers?: readonly {
    readonly id: string;
    readonly target: ReturnType<typeof createTarget>;
    readonly delivery: "ephemeral" | "durable";
    readonly retry?: typeof retry;
  }[];
}) {
  return createTestEvent({
    eventId: "orders.created",
    version: 1,
    payloadSchema,
    stateRoot,
    startTimeMs,
    leaseDurationMs: 10,
    retry,
    ...(options.target === undefined
      ? { triggers: options.triggers }
      : { target: options.target, delivery: options.delivery }),
  });
}

async function writeResult(value: unknown): Promise<void> {
  await writeFile(join(stateRoot, "result.json"), JSON.stringify(value));
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
