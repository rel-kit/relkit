import type { NativeStack } from "./native-stack.ts";
import { waitFor } from "./native-stack.ts";
import { createNativeWorker, type Observation } from "./inngest-native-worker.ts";

type NativeWorker = ReturnType<typeof createNativeWorker>;

const sync = async (port: number) => {
  const response = await fetch(`http://127.0.0.1:${port}/api/inngest`, { method: "PUT" });
  return { ok: response.ok, status: response.status, body: await response.text() };
};

export async function runNativeVersionChecks(options: {
  readonly stack: NativeStack;
  readonly worker: NativeWorker;
  readonly workerPort: number;
  readonly observerUrl: string;
  readonly observations: Observation[];
  readonly waitForRun: (runId: string) => Promise<{ readonly status: string }>;
}) {
  const { stack, worker, workerPort, observerUrl, observations, waitForRun } = options;
  const eventId = `${stack.namespace}-versioned-sleep`;
  const receipt = await worker.client.send({
    name: worker.sleepEvent,
    id: eventId,
    data: { key: "versioned-sleep" },
  });
  const oldBefore = await waitFor("old build sleep", async () =>
    observations.find((entry) => entry.eventId === eventId && entry.stage === "before-one"),
  );
  await Bun.sleep(1_000);
  worker.stop();
  const replacement = createNativeWorker({
    namespace: stack.namespace,
    baseUrl: stack.baseUrl,
    eventKey: stack.eventKey,
    signingKey: stack.signingKey,
    observerUrl,
    workerPort,
    appVersion: "build-new",
    workerLabel: "replacement",
    includeProbeFunctions: true,
  });
  replacement.start();
  const registration = await sync(workerPort);
  let resumed: Observation | undefined;
  if (registration.ok) {
    resumed = await waitFor("versioned sleep resume", async () =>
      observations.find(
        (entry) =>
          entry.runId === oldBefore.runId &&
          entry.stage === "after-one" &&
          entry.workerVersion === "build-new",
      ),
    ).catch(() => undefined);
  }
  const terminal = resumed ? await waitForRun(oldBefore.runId).catch(() => undefined) : undefined;
  const newReceipt = registration.ok
    ? await replacement.client.send({
        name: replacement.acceptanceEvent,
        id: `${stack.namespace}-new-build`,
        data: { key: "new-build" },
      })
    : undefined;
  const newSubmission = newReceipt
    ? await waitFor("new build submission", async () =>
        observations.find(
          (entry) => entry.eventId === `${stack.namespace}-new-build` && entry.stage === "accepted",
        ),
      ).catch(() => undefined)
    : undefined;
  return {
    registration: { ok: registration.ok, status: registration.status },
    oldRunId: oldBefore.runId,
    oldBuild: oldBefore.workerVersion,
    resumedBuild: resumed?.workerVersion,
    oldBuildResume: resumed?.workerVersion === oldBefore.workerVersion,
    resumedStatus: terminal?.status,
    newSubmissionBuild: newSubmission?.workerVersion,
    locatorKeyRotation:
      "not-tested; the pinned local server exposes one signing key and no rotation API",
    retirement: "unsafe unless the old build and signing key remain routable for retained runs",
    replacement,
  };
}
