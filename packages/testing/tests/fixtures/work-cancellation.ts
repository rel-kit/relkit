import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { z } from "@relkit/schema";
import { defineEventFunction } from "@relkit/events";
import { createTestJob } from "../../src/jobs.js";
import { createTestEvent } from "../../src/events.js";

/**
 * Records actual native admission and rejects only when the provided signal aborts.
 * @returns A cancellation-aware native handler and an explicit admission notification.
 */
function blockedWork() {
  let admitted!: () => void;
  const started = new Promise<void>((resolve) => {
    admitted = resolve;
  });
  let aborted = false;
  return {
    started,
    isAborted: () => aborted,
    run: (signal: AbortSignal): Promise<void> =>
      new Promise((_resolve, reject) => {
        const cancel = () => {
          aborted = true;
          reject(signal.reason);
        };
        admitted();
        if (signal.aborted) cancel();
        else signal.addEventListener("abort", cancel, { once: true });
      }),
  };
}

const jobWork = blockedWork();
const job = await createTestJob({
  target: {
    id: "test.blocked-job",
    input: z.object({}),
    output: z.void(),
    handler: (_input, context) => jobWork.run(context.signal),
  },
});
try {
  await job.enqueue({});
  const pending = job.runNext();
  const settled = Promise.allSettled([pending]);
  await jobWork.started;
  await job.restart();
  assert.equal(jobWork.isAborted(), true);
  await settled;
  await job.close();
  await assert.rejects(job.enqueue({}), /closed/);
  assert.equal(existsSync(job.stateRoot), false);
} finally {
  await job.close();
}

const eventWork = blockedWork();
const target = defineEventFunction({
  id: "test.blocked-event-handler",
  event: "test.blocked-event" as never,
  handler: (_input, context) => eventWork.run(context.signal),
});
const event = await createTestEvent({ eventId: "test.blocked-event", target });
try {
  await event.publish({});
  const settled = Promise.allSettled([event.runNext()]);
  await eventWork.started;
  await event.close();
  assert.equal(eventWork.isAborted(), true);
  await settled;
  await assert.rejects(event.publish({}), /Test event is closed/);
  assert.equal(existsSync(event.stateRoot), false);
} finally {
  await event.close();
}
console.log("RELKIT_NATIVE_WORK_CANCELLATION_OK");
