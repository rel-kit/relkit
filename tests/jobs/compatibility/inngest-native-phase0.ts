import assert from "node:assert/strict";
import { reservePort, startNativeStack, waitFor, type NativeStack } from "./native-stack.ts";
import { createNativeApi } from "./inngest-native-api.ts";
import { runNativeObservationChecks } from "./inngest-native-observation.ts";
import { runNativePolicyChecks } from "./inngest-native-policy.ts";
import { runNativeQueryChecks } from "./inngest-native-query.ts";
import { runNativeScheduleChecks } from "./inngest-native-schedules.ts";
import { createNativeWorker, type Observation } from "./inngest-native-worker.ts";
import { runNativeVersionChecks } from "./inngest-native-version.ts";

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

const sync = async (port: number) => {
  const response = await fetch(`http://127.0.0.1:${port}/api/inngest`, { method: "PUT" });
  return { ok: response.ok, status: response.status, body: await response.text() };
};

const workerPort = await reservePort();
const observerUrl = `http://127.0.0.1:${observer.port}/observe`;
let stack: NativeStack | undefined;
let activeWorker: ReturnType<typeof createNativeWorker> | undefined;

try {
  stack = await startNativeStack(workerPort, { healthTimeoutMs: 120_000 });
  activeWorker = createNativeWorker({
    namespace: stack.namespace,
    baseUrl: stack.baseUrl,
    eventKey: stack.eventKey,
    signingKey: stack.signingKey,
    observerUrl,
    workerPort,
    appVersion: "build-old",
    workerLabel: "initial",
    includeProbeFunctions: true,
    scheduleCron: "TZ=America/New_York * * * * *",
  });
  activeWorker.start();
  const initialSync = await sync(workerPort);
  assert(initialSync.ok, `Inngest SDK sync failed: ${initialSync.status} ${initialSync.body}`);
  const api = createNativeApi(stack);
  const baselineEventId = `${stack.namespace}-phase0-baseline`;
  const baselineReceipt = await activeWorker.client.send({
    name: activeWorker.acceptanceEvent,
    id: baselineEventId,
    data: { key: "phase0-baseline" },
  });
  const baseline = await waitFor("baseline native run", async () =>
    observations.find((entry) => entry.eventId === baselineEventId && entry.stage === "accepted"),
  );
  const baselineRuns = await waitFor("baseline receipt query", async () => {
    const values = await api.eventRuns(baselineReceipt.ids[0]);
    return values.length ? values : false;
  });
  assert.equal(baselineRuns[0].run_id, baseline.runId);
  const baselineRun = await api.waitForRun(baseline.runId);
  const policy = await runNativePolicyChecks({
    stack,
    worker: activeWorker,
    observations,
    waitForRun: api.waitForRun,
  });
  const query = await runNativeQueryChecks({
    stack,
    eventId: baselineReceipt.ids[0],
    runId: baseline.runId,
    eventRuns: api.eventRuns,
    run: api.run,
  });
  const observation = await runNativeObservationChecks({ stack, client: activeWorker.client });
  const version = await runNativeVersionChecks({
    stack,
    worker: activeWorker,
    workerPort,
    observerUrl,
    observations,
    waitForRun: api.waitForRun,
  });
  activeWorker = version.replacement;
  const { replacement: _, ...versionEvidence } = version;
  const schedule = await runNativeScheduleChecks({
    stack,
    api: api.api,
    sync: () => sync(workerPort),
    observations,
    scheduledFunctionId: activeWorker.scheduledFunctionId,
    scheduleCron: "TZ=America/New_York * * * * *",
    workerVersion: "build-new",
  });
  await stack.restartInngest();
  const retained = await api.waitForRun(baseline.runId);
  assert.equal(retained.run_id, baseline.runId);
  console.log(
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        command: "bun tests/jobs/compatibility/inngest-native-phase0.ts",
        provider: "inngest",
        profile: "self-hosted",
        server: {
          image: "inngest/inngest:v1.44.0",
          digest: "sha256:169c1d84801db304ca3c2c267810c67141c8f17bf7c01557b024a9a02fe67e57",
          platform: "linux/arm64",
        },
        persistence: { baselineStatus: baselineRun.status, restartRetainedRun: true },
        policy,
        query,
        observation,
        version: versionEvidence,
        schedule,
        limits: {
          noFullScan: true,
          managedCloud: "not-tested; no account or cloud credential was used",
          triggerDocker: "see trigger-docker.ts; not-tested",
          effectMqPostgres: "see effect-mq-native.ts; passed on the pinned PostgreSQL fixture",
        },
      },
      null,
      2,
    ),
  );
} finally {
  activeWorker?.stop();
  observer.stop(true);
  await stack?.close();
}
