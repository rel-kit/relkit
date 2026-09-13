import assert from "node:assert/strict";
import { Inngest } from "inngest";
import { waitFor, type NativeStack } from "./native-stack.ts";
import type { NativeRun } from "./inngest-native-api.ts";
import type { Observation } from "./inngest-native-worker.ts";

export async function runAcceptanceChecks(options: {
  readonly stack: NativeStack;
  readonly client: Inngest;
  readonly eventName: string;
  readonly observations: readonly Observation[];
  readonly eventRuns: (eventId: string) => Promise<NativeRun[]>;
  readonly waitForRun: (runId: string) => Promise<NativeRun>;
}) {
  const { stack, client, eventName, observations, eventRuns, waitForRun } = options;
  const sameReceipts = await Promise.all([
    client.send({
      name: eventName,
      id: `${stack.namespace}-same-key-one`,
      data: { key: "same-key" },
    }),
    client.send({
      name: eventName,
      id: `${stack.namespace}-same-key-two`,
      data: { key: "same-key" },
    }),
  ]);
  const nativeEventIds = sameReceipts.map((receipt) => receipt.ids[0]);
  assert.ok(nativeEventIds[0]);
  assert.ok(nativeEventIds[1]);
  assert.notEqual(nativeEventIds[0], nativeEventIds[1]);
  const sameResult = await waitFor("same-key native run", async () => {
    const values = await Promise.all(nativeEventIds.map((eventId) => eventRuns(eventId)));
    const eventIndex = values.findIndex((value) => value.length > 0);
    return eventIndex < 0
      ? false
      : { eventId: nativeEventIds[eventIndex], runs: values[eventIndex] };
  });
  const sameRuns = sameResult.runs;
  assert.equal(sameRuns.length, 1);
  const sameRun = await waitForRun(sameRuns[0].run_id);
  await Bun.sleep(1_000);
  const sameRunValues = await Promise.all(nativeEventIds.map((eventId) => eventRuns(eventId)));
  const sameRunIds = new Set(sameRunValues.flat().map((entry) => entry.run_id));
  assert.equal(sameRunIds.size, 1);
  const sameObserved = observations.filter((entry) => entry.key === "same-key");
  assert.equal(new Set(sameObserved.map((entry) => entry.runId)).size, 1);

  const lostEventId = `${stack.namespace}-lost-response`;
  let lostResponse = false;
  let lostResponseEventId: string | undefined;
  const unknownClient = new Inngest({
    id: client.id,
    eventKey: stack.eventKey,
    signingKey: stack.signingKey,
    baseUrl: stack.baseUrl,
    isDev: false,
    fetch: (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const response = await fetch(input, init);
      if (typeof init?.body === "string" && init.body.includes(lostEventId)) {
        const body = (await response.clone().json()) as { ids?: string[] };
        lostResponseEventId = body.ids?.[0];
        lostResponse = true;
        throw new Error("simulated response loss after native acceptance");
      }
      return response;
    }) as typeof fetch,
  });
  await assert.rejects(() =>
    unknownClient.send({ name: eventName, id: lostEventId, data: { key: "lost-key" } }),
  );
  assert.equal(lostResponse, true);
  assert.ok(lostResponseEventId);
  const originalEventId = lostResponseEventId;
  const recoveredReceipt = await client.send({
    name: eventName,
    id: lostEventId,
    data: { key: "lost-key" },
  });
  const recoveredEventId = recoveredReceipt.ids[0];
  assert.ok(recoveredEventId);
  const lostRuns = await waitFor("lost-response native run", async () => {
    const value = await eventRuns(originalEventId);
    return value.length ? value : false;
  });
  assert.equal(lostRuns.length, 1);
  const lostRunId = lostRuns[0].run_id;
  assert.notEqual(lostRunId, sameRun.run_id);
  assert.equal((await eventRuns(recoveredEventId)).length, 0);
  await waitForRun(lostRunId);
  return { sameRun, sameEventId: sameResult.eventId, lostRunId };
}
