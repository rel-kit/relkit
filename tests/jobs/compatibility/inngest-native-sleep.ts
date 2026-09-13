import assert from "node:assert/strict";
import type { Inngest } from "inngest";
import { waitFor } from "./native-stack.ts";
import type { NativeRun, NativeSleep } from "./inngest-native-api.ts";
import type { createNativeWorker, Observation } from "./inngest-native-worker.ts";

type NativeWorker = ReturnType<typeof createNativeWorker>;

const dueAt = (record: NativeSleep) =>
  Date.parse((JSON.parse(record.sleep) as { until: string }).until);

const createdAt = (record: NativeSleep) =>
  Date.parse(record.createdAt.endsWith("Z") ? record.createdAt : `${record.createdAt}Z`);

export async function runSleepChecks(options: {
  readonly client: Inngest;
  readonly sleepEvent: string;
  readonly nativeWorker: NativeWorker;
  readonly observations: Observation[];
  readonly sleepHistory: (runId: string) => Promise<NativeSleep[]>;
  readonly waitForRun: (runId: string) => Promise<NativeRun>;
}) {
  const { client, sleepEvent, nativeWorker, observations, sleepHistory, waitForRun } = options;
  const sleepEventId = `sleep-replay-${Date.now()}`;
  const sleepReceipt = await client.send({
    name: sleepEvent,
    id: sleepEventId,
    data: { key: "sleep-replay" },
  });
  assert(sleepReceipt.ids[0]);
  const firstBefore = await waitFor("first native wait", async () =>
    observations.find((entry) => entry.eventId === sleepEventId && entry.stage === "before-one"),
  );
  const sleepRunId = firstBefore.runId;
  const firstSleep = await waitFor("first persisted sleep", async () =>
    (await sleepHistory(sleepRunId)).find((entry) => entry.stepName === "wait-one"),
  );
  const firstDueAt = dueAt(firstSleep);
  assert(Number.isFinite(firstDueAt));
  const firstObservationIndex = observations.length;
  await Bun.sleep(2_000);
  const firstRowsBeforeRestart = await sleepHistory(sleepRunId);
  assert.equal(firstRowsBeforeRestart.filter((entry) => entry.stepName === "wait-one").length, 1);
  assert.equal(firstRowsBeforeRestart.filter((entry) => entry.stepName === "wait-two").length, 0);
  nativeWorker.stop();
  const firstRestartAt = Date.now();
  nativeWorker.start();
  const firstReplay = await waitFor("first wait replay", async () => {
    const waitTwo = (await sleepHistory(sleepRunId)).find((entry) => entry.stepName === "wait-two");
    const entry = waitTwo
      ? observations
          .slice(firstObservationIndex)
          .find(
            (value) =>
              value.runId === sleepRunId &&
              value.stage === "after-one" &&
              value.recordedAt >= firstRestartAt &&
              value.recordedAt <= createdAt(waitTwo) + 1_000,
          )
      : undefined;
    return waitTwo && entry ? { entry, waitTwo } : false;
  });
  assert(firstReplay.entry.recordedAt >= firstDueAt);
  assert(firstReplay.entry.recordedAt - firstDueAt < 3_000, "first sleep due time was reset");
  assert(createdAt(firstReplay.waitTwo) - firstDueAt < 3_000, "first wake time was reset");
  const firstSleepAfter = await waitFor("first sleep retention", async () =>
    (await sleepHistory(sleepRunId)).find((entry) => entry.stepName === "wait-one"),
  );
  assert.equal(firstSleepAfter.sleep, firstSleep.sleep);

  await waitFor("second native wait", async () =>
    observations.some((entry) => entry.runId === sleepRunId && entry.stage === "before-two"),
  );
  const secondSleep = await waitFor("second persisted sleep", async () =>
    (await sleepHistory(sleepRunId)).find((entry) => entry.stepName === "wait-two"),
  );
  const secondDueAt = dueAt(secondSleep);
  assert(Number.isFinite(secondDueAt));
  assert(firstDueAt < secondDueAt);
  const secondObservationIndex = observations.length;
  await Bun.sleep(2_000);
  const secondRowsBeforeRestart = await sleepHistory(sleepRunId);
  assert.equal(secondRowsBeforeRestart.filter((entry) => entry.stepName === "wait-one").length, 1);
  assert.equal(secondRowsBeforeRestart.filter((entry) => entry.stepName === "wait-two").length, 1);
  nativeWorker.stop();
  const secondRestartAt = Date.now();
  nativeWorker.start();
  const secondAfter = await waitFor("second wait replay", async () => {
    const entry = observations
      .slice(secondObservationIndex)
      .find((value) => value.runId === sleepRunId && value.stage === "after-two");
    return entry && entry.recordedAt >= secondRestartAt ? entry : false;
  });
  assert(secondAfter.recordedAt >= secondDueAt);
  assert(secondAfter.recordedAt - secondDueAt < 3_000, "second sleep due time was reset");
  const rows = await waitFor("sleep history", async () => {
    const value = await sleepHistory(sleepRunId);
    return value.filter((entry) => ["wait-one", "wait-two"].includes(entry.stepName)).length === 2
      ? value
      : false;
  });
  assert.equal(rows.filter((entry) => entry.stepName === "wait-one").length, 1);
  assert.equal(rows.filter((entry) => entry.stepName === "wait-two").length, 1);
  assert.equal(rows.find((entry) => entry.stepName === "wait-two")?.sleep, secondSleep.sleep);
  const stages = observations
    .filter((entry) => entry.runId === sleepRunId)
    .map((entry) => entry.stage);
  assert(stages.indexOf("before-one") < stages.indexOf("after-one"));
  assert(stages.indexOf("after-one") < stages.indexOf("before-two"));
  assert(stages.indexOf("before-two") < stages.indexOf("after-two"));
  const waitAttempts = [
    ...new Set(
      observations.filter((entry) => entry.runId === sleepRunId).map((entry) => entry.attempt),
    ),
  ];
  assert.deepEqual(waitAttempts, [0]);
  assert.equal((await waitForRun(sleepRunId)).status, "Completed");
  return {
    runId: sleepRunId,
    waits: ["wait-one", "wait-two"],
    dueTimes: [new Date(firstDueAt).toISOString(), new Date(secondDueAt).toISOString()],
    firstWaitRestartMs: firstReplay.entry.recordedAt - firstRestartAt,
    secondWaitRestartMs: secondAfter.recordedAt - secondRestartAt,
    waitAttempts,
  };
}
