import assert from "node:assert/strict";
import { Inngest, RetryAfterError } from "inngest";
import { waitFor, type NativeStack } from "./native-stack.ts";
import type { NativeRun } from "./inngest-native-api.ts";
import type { Observation } from "./inngest-native-worker.ts";

type PolicyWorker = {
  readonly client: Inngest;
  readonly retryPolicyEvent: string;
  readonly timeoutEvent: string;
  readonly concurrencyEvent: string;
};

export async function runNativePolicyChecks(options: {
  readonly stack: NativeStack;
  readonly worker: PolicyWorker;
  readonly observations: Observation[];
  readonly waitForRun: (runId: string) => Promise<NativeRun>;
}) {
  const { stack, worker, observations, waitForRun } = options;
  const retryEventId = `${stack.namespace}-retry-policy`;
  const retryReceipt = await worker.client.send({
    name: worker.retryPolicyEvent,
    id: retryEventId,
    data: { key: "retry-policy" },
  });
  assert(retryReceipt.ids[0]);
  const retryAttempts = await waitFor("RetryAfterError attempts", async () => {
    const values = observations.filter(
      (entry) => entry.eventId === retryEventId && entry.stage === "attempt",
    );
    return values.length >= 2 ? values : false;
  });
  const retryRunId = retryAttempts[0].runId;
  assert.equal((await waitForRun(retryRunId)).status, "Completed");
  const retryAfterDelayMs = retryAttempts[1].recordedAt - retryAttempts[0].recordedAt;
  assert(
    retryAfterDelayMs >= 500,
    `retry-after retry was effectively immediate: ${retryAfterDelayMs}`,
  );
  const retryAfterConversion = {
    milliseconds: new RetryAfterError("probe", 1_500).retryAfter,
    string: new RetryAfterError("probe", "1500ms").retryAfter,
    date: new RetryAfterError("probe", new Date(1_700_000_000_000)).retryAfter,
  };

  const acceptedAt = Date.now();
  const timeoutEventId = `${stack.namespace}-timeout`;
  const timeoutReceipt = await worker.client.send({
    name: worker.timeoutEvent,
    id: timeoutEventId,
    data: { key: "timeout" },
  });
  assert(timeoutReceipt.ids[0]);
  const timeoutStarted = await waitFor("finish-timeout start", async () =>
    observations.find((entry) => entry.eventId === timeoutEventId && entry.stage === "started"),
  );
  const timeoutRun = await waitForRun(timeoutStarted.runId);
  assert.notEqual(timeoutRun.status, "Completed");

  const concurrencyEventIds = [
    `${stack.namespace}-concurrency-one`,
    `${stack.namespace}-concurrency-two`,
  ];
  const concurrencyReceipt = await Promise.all(
    concurrencyEventIds.map((id) =>
      worker.client.send({
        name: worker.concurrencyEvent,
        id,
        data: { key: id },
      }),
    ),
  );
  assert.equal(concurrencyReceipt.length, concurrencyEventIds.length);
  const concurrencyObservations = await waitFor(
    "distributed concurrency observations",
    async () => {
      const values = observations.filter(
        (entry) =>
          concurrencyEventIds.includes(entry.eventId) &&
          ["entered", "exited"].includes(entry.stage),
      );
      return values.filter((entry) => entry.stage === "exited").length === 2 ? values : false;
    },
    30_000,
  );
  const intervals = [...new Set(concurrencyObservations.map((entry) => entry.runId))].map(
    (runId) => {
      const values = concurrencyObservations.filter((entry) => entry.runId === runId);
      return {
        runId,
        enteredAt: values.find((entry) => entry.stage === "entered")?.recordedAt,
        exitedAt: values.find((entry) => entry.stage === "exited")?.recordedAt,
      };
    },
  );
  assert.equal(intervals.length, 2);
  const ordered = intervals.sort((left, right) => (left.enteredAt ?? 0) - (right.enteredAt ?? 0));
  assert((ordered[0].exitedAt ?? 0) <= (ordered[1].enteredAt ?? 0));

  return {
    retry: {
      runId: retryRunId,
      totalAttempts: retryAttempts.length,
      retryAfterInput: "2s",
      observedDelayMs: retryAfterDelayMs,
      retryAfterConversion,
      defaultBackoff: "not configurable in the Inngest 4.20.0 SDK function options",
      maximumDelayHorizon: "not observable from the pinned local server/SDK",
    },
    deadlines: {
      acceptedAt,
      startedAt: timeoutStarted.recordedAt,
      acceptanceToStartMs: timeoutStarted.recordedAt - acceptedAt,
      finishTimeout: "2s",
      terminalStatus: timeoutRun.status,
      semantics:
        "native finish timeout starts at the first successful function request, not acceptance",
    },
    concurrency: {
      functionLimit: 1,
      intervals,
      singleSelfHostedService: true,
      replicasAndVersions: "not-tested; this fixture uses one SDK endpoint",
    },
    resources: {
      status: "not-tested",
      reason: "the fixture worker runs as a host Bun process without a declared CPU/memory cgroup",
    },
  };
}
