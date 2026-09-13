import { docker, waitFor, type NativeStack } from "./native-stack.ts";
import type { Observation } from "./inngest-native-worker.ts";

type JsonRecord = Record<string, unknown>;
type NativeApi = (path: string) => Promise<JsonRecord>;

const record = (value: unknown): JsonRecord =>
  typeof value === "object" && value !== null ? (value as JsonRecord) : {};

const strings = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (typeof value !== "object" || value === null) return [];
  return Object.values(value).flatMap(strings);
};

const functionId = (value: JsonRecord): string | undefined => {
  for (const key of ["id", "function_id", "functionId"]) {
    if (typeof value[key] === "string") return value[key];
  }
  return undefined;
};

async function listFunctions(api: NativeApi) {
  try {
    const body = await api("/v1/functions");
    const data = record(body.data);
    const values = Array.isArray(body.data)
      ? body.data
      : Array.isArray(data.functions)
        ? data.functions
        : [];
    return {
      status: "available" as const,
      functions: values
        .filter((value): value is JsonRecord => typeof value === "object" && value !== null)
        .map(record),
    };
  } catch (error) {
    return { status: "unsupported" as const, reason: String(error), functions: [] };
  }
}

export async function runNativeScheduleChecks(options: {
  readonly stack: NativeStack;
  readonly api: NativeApi;
  readonly sync: () => Promise<{ readonly ok: boolean; readonly status: number }>;
  readonly observations: readonly Observation[];
  readonly scheduledFunctionId: string;
  readonly scheduleCron: string;
  readonly workerVersion: string;
}) {
  const scheduled = () =>
    options.observations.filter(
      (entry) => entry.functionId === "schedule" && entry.stage === "fired",
    );
  const beforeSync = await listFunctions(options.api);
  const syncs = [await options.sync(), await options.sync()];
  const afterSync = await listFunctions(options.api);
  const owned = afterSync.functions.filter(
    (value) => functionId(value) === options.scheduledFunctionId,
  );
  const ownership = {
    syncStatuses: syncs.map((value) => value.status),
    listing: afterSync.status,
    ownedFunctionCount: owned.length,
    idempotent: syncs.every((value) => value.ok) && owned.length === 1,
    diagnostic:
      afterSync.status === "available"
        ? undefined
        : "The pinned local server did not expose a function listing to verify ownership.",
  };

  const first = await waitFor(
    "scheduled function after registration",
    async () => scheduled().at(-1),
    75_000,
  );
  const downtime = {
    status: "not-tested" as "passed" | "not-tested",
    stoppedAt: undefined as number | undefined,
    restartedAt: undefined as number | undefined,
    durationMs: undefined as number | undefined,
    observationsDuringDowntime: 0,
    firstObservationAfterRestart: undefined as number | undefined,
    misfirePolicy: "unverified; the native run does not expose a scheduledFor value here",
  };
  if (first !== undefined) {
    const countBeforeStop = scheduled().length;
    downtime.stoppedAt = Date.now();
    await docker(["stop", "-t", "2", options.stack.inngest]);
    try {
      await Bun.sleep(65_000);
    } finally {
      await docker(["start", options.stack.inngest]);
    }
    await waitFor(
      "Inngest health after schedule downtime",
      async () => (await fetch(`${options.stack.baseUrl}/health`)).ok,
    );
    downtime.restartedAt = Date.now();
    downtime.durationMs = downtime.restartedAt - downtime.stoppedAt;
    await options.sync();
    const afterRestart = await waitFor(
      "scheduled function after downtime",
      async () => (scheduled().length > countBeforeStop ? scheduled().at(-1) : false),
      75_000,
    ).catch(() => undefined);
    downtime.firstObservationAfterRestart = afterRestart?.recordedAt;
    downtime.status = afterRestart === undefined ? "not-tested" : "passed";
    downtime.observationsDuringDowntime = scheduled().filter(
      (entry) =>
        entry.recordedAt >= (downtime.stoppedAt ?? 0) &&
        entry.recordedAt <= (downtime.restartedAt ?? Number.MAX_SAFE_INTEGER),
    ).length;
  }

  const registeredCron = strings(owned[0]).find((value) => value.includes("* * * * *"));
  return {
    ownership: {
      ...ownership,
      initialListing: beforeSync.status,
      registeredCron,
    },
    recurrence: {
      cron: options.scheduleCron,
      timezonePrefixAccepted: options.scheduleCron.startsWith("TZ="),
      dst: "not-tested; no native clock/transition control in the pinned Docker server",
      firstRunId: first?.runId,
      firstWorkerVersion: first?.workerVersion,
      postRestartWorkerVersion: scheduled().at(-1)?.workerVersion,
      workerVersionTarget:
        first?.workerVersion === options.workerVersion ||
        scheduled().at(-1)?.workerVersion === options.workerVersion
          ? "current registration observed"
          : "unverified",
    },
    overlap: {
      status: "unsupported",
      diagnostic:
        "The pinned Inngest cron trigger has no portable overlap/misfire option; function concurrency is a separate native control.",
    },
    downtime,
    nativeUnsupported: [
      "portable overlap=skip|allow mapping",
      "portable misfire=skip|latest|all mapping",
      "DST transition replay under a controllable native clock",
    ],
  };
}
