import { Effect, Fiber } from "effect";
import { expect, test } from "vitest";
import { createJobClient } from "../src/client.ts";

test("interrupting enqueueEffect aborts provider work", async () => {
  let started!: () => void;
  const began = new Promise<void>((resolve) => {
    started = resolve;
  });
  let providerSignal: AbortSignal | undefined;
  let stopped = false;
  const client = createJobClient({
    ownerId: "orders.create",
    jobId: "orders.send",
    source: {
      enqueue: (_input, _options, context) => {
        providerSignal = context.signal;
        return new Promise((resolve) => {
          context.signal.addEventListener(
            "abort",
            () => {
              stopped = true;
              resolve({ instanceId: "cancelled", accepted: false });
            },
            { once: true },
          );
          started();
        });
      },
    },
  });
  const fiber = Effect.runFork(client.enqueueEffect("value"));
  await began;
  await Effect.runPromise(Fiber.interrupt(fiber));
  expect(providerSignal?.aborted).toBe(true);
  expect(stopped).toBe(true);
});
