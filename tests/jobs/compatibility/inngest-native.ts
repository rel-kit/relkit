import assert from "node:assert/strict";
import { reservePort, startNativeStack, waitFor, type NativeStack } from "./native-stack.ts";
import { runAcceptanceChecks } from "./inngest-native-acceptance.ts";
import { createNativeApi } from "./inngest-native-api.ts";
import { runSleepChecks } from "./inngest-native-sleep.ts";
import { createNativeWorker, type Observation } from "./inngest-native-worker.ts";

const observations: Observation[] = [];
const observer = Bun.serve({
  port: 0,
  async fetch(request) {
    if (new URL(request.url).pathname !== "/observe" || request.method !== "POST") {
      return new Response("not found", { status: 404 });
    }
    observations.push((await request.json()) as Observation);
    return new Response("ok");
  },
});

const workerPort = await reservePort();
let stack: NativeStack | undefined;
let nativeWorker: ReturnType<typeof createNativeWorker> | undefined;

try {
  stack = await startNativeStack(workerPort, { healthTimeoutMs: 120_000 });
  const observerUrl = `http://127.0.0.1:${observer.port}/observe`;
  nativeWorker = createNativeWorker({
    namespace: stack.namespace,
    baseUrl: stack.baseUrl,
    eventKey: stack.eventKey,
    signingKey: stack.signingKey,
    observerUrl,
    workerPort,
  });
  nativeWorker.start();
  const syncResponse = await fetch(`http://127.0.0.1:${workerPort}/api/inngest`, {
    method: "PUT",
  });
  if (!syncResponse.ok) {
    throw new Error(`Inngest SDK sync failed: ${syncResponse.status} ${await syncResponse.text()}`);
  }
  const { client, acceptanceEvent, sleepEvent } = nativeWorker;
  const { eventRuns, sleepHistory, waitForRun } = createNativeApi(stack);

  const acceptanceResult = await runAcceptanceChecks({
    stack,
    client,
    eventName: acceptanceEvent,
    observations,
    eventRuns,
    waitForRun,
  });

  const sleepResult = await runSleepChecks({
    client,
    sleepEvent,
    nativeWorker,
    observations,
    sleepHistory,
    waitForRun,
  });
  const sleepRunId = sleepResult.runId;

  const retryEventId = `${stack.namespace}-retry-attempts`;
  const retryReceipt = await client.send({
    name: sleepEvent,
    id: retryEventId,
    data: { key: "retry-attempts", failBefore: true, failAfter: true },
  });
  const retryRuns = await waitFor("retry native run", async () => {
    const value = await eventRuns(retryReceipt.ids[0]);
    return value.length ? value : false;
  });
  const retryRunId = String(retryRuns[0].run_id);
  const retryAttempts = await waitFor(
    "application attempt replay",
    async () => {
      const values = [
        ...new Set(
          observations
            .filter((entry) => entry.runId === retryRunId && entry.stage === "attempt")
            .map((entry) => entry.attempt),
        ),
      ];
      return values.length >= 3 ? values : false;
    },
    60_000,
  );
  assert.deepEqual(
    retryAttempts.sort((left, right) => left - right),
    [0, 1, 2],
  );
  const retryObservations = observations.filter((entry) => entry.runId === retryRunId);
  assert(
    retryObservations.some((entry) => entry.stage === "fail-before-one" && entry.attempt === 0),
  );
  assert(
    retryObservations.some((entry) => entry.stage === "fail-after-two" && entry.attempt === 1),
  );
  assert(retryObservations.some((entry) => entry.stage === "completed" && entry.attempt === 2));
  assert.equal((await waitForRun(retryRunId)).status, "Completed");

  const tableCount = Number(
    await stack.queryPostgres(
      "select count(*) from information_schema.tables where table_schema = 'public'",
    ),
  );
  assert(tableCount > 0);
  await stack.restartInngest();
  const retained = await waitForRun(acceptanceResult.sameRun.run_id);
  assert.equal(retained.run_id, acceptanceResult.sameRun.run_id);
  const retainedTableCount = Number(
    await stack.queryPostgres(
      "select count(*) from information_schema.tables where table_schema = 'public'",
    ),
  );
  assert.equal(retainedTableCount, tableCount);
  console.log(
    JSON.stringify(
      {
        provider: "inngest",
        image:
          "inngest/inngest:v1.44.0@sha256:d5365a31f8bf504dc2d54ddd114fcdc1a0413f8b57a450365c095ab6234ad8c2",
        acceptance: {
          sameKeyRunId: acceptanceResult.sameRun.run_id,
          sameKeyEventId: acceptanceResult.sameEventId,
          lostResponseRunId: acceptanceResult.lostRunId,
          lostResponseRecovered: true,
        },
        sleep: {
          ...sleepResult,
          retryAttempts,
        },
        postgres: { tableCount, retainedTableCount, restarted: true },
        limits: {
          unknownSubmission:
            "response loss is unknown until the original event id is queried or retried",
          retention: "provider default; exact TTL is not exposed by the SDK",
        },
      },
      null,
      2,
    ),
  );
} finally {
  nativeWorker?.stop();
  observer.stop(true);
  await stack?.close();
}
