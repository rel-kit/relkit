import { randomUUID } from "node:crypto";
import {
  type FailureControls,
  type FixtureHarness,
  type FixtureStorage,
  type NativeFixtureApi,
  type NativeObservation,
  type NativeReceipt,
  type RunSnapshot,
  type StoredRun,
  type SubmitRequest,
} from "./types.ts";

export { UnknownAcceptanceError } from "./types.ts";
export type {
  FailureControls,
  FixtureHarness,
  FixtureStatus,
  FixtureStorage,
  NativeFixtureApi,
  NativeObservation,
  NativeReceipt,
  RunSnapshot,
  StoredRun,
  StoredWait,
  SubmitRequest,
} from "./types.ts";

/** Local contract model only; native adapters must provide certification evidence. */
export function createCompatibilityHarness(
  options: {
    readonly namespace?: string;
    readonly storage?: FixtureStorage;
    readonly now?: () => number;
  } = {},
): FixtureHarness {
  const namespace = options.namespace ?? `compat-${randomUUID().replaceAll("-", "")}`;
  const storage: FixtureStorage = options.storage ?? {
    runs: new Map(),
    keys: new Map(),
    events: new Map(),
  };
  const now = options.now ?? Date.now;
  const workers = new Set<string>();
  const waiters = new Set<() => void>();
  let closed = false;
  const configured = new Map<string, unknown>();
  const failures: FailureControls = Object.freeze({
    once: (point: string, cause: unknown) => configured.set(point, cause),
    check: (point: string) => {
      const cause = configured.get(point);
      if (cause === undefined) return;
      configured.delete(point);
      throw cause instanceof Error ? cause : new Error(String(cause));
    },
  });

  const native: NativeFixtureApi = Object.freeze({
    submit: async (request: SubmitRequest): Promise<NativeReceipt> => {
      if (request.key.trim() === "" || request.buildId.trim() === "")
        throw new TypeError("Fixture submissions require a key and build ID.");
      const priorId = storage.keys.get(request.key);
      if (priorId !== undefined) {
        const prior = snapshot(requireRun(priorId));
        return { accepted: true, runId: prior.runId, nativeId: prior.nativeId, duplicate: true };
      }
      const runId = `${namespace}/run/${randomUUID()}`;
      const acceptedAt = now();
      const run: StoredRun = {
        runId,
        nativeId: `native-${randomUUID()}`,
        key: request.key,
        buildId: request.buildId,
        status: "queued",
        attempt: 0,
        acceptedAt,
        retentionExpiresAt: acceptedAt + 3_600_000,
        waits: new Map(),
      };
      storage.runs.set(runId, run);
      storage.keys.set(request.key, runId);
      emit(run, "snapshot");
      failures.check("submit.response");
      return { accepted: true, runId, nativeId: run.nativeId };
    },
    routeEvent: (eventId: string, buildId: string) =>
      native.submit({ key: `event:${eventId}`, buildId, operationId: `event:${eventId}` }),
    get: async (runId: string): Promise<RunSnapshot> => snapshot(requireRun(runId)),
    beginAttempt: (runId: string) =>
      update(runId, (run) => {
        run.attempt += 1;
        run.status = "running";
      }),
    failAttempt: (runId: string) =>
      update(runId, (run) => {
        if (run.status === "completed") throw new Error("Completed run cannot fail.");
        run.status = "queued";
      }),
    commitWait: (runId: string, key: string, dueAt: number) =>
      update(runId, (run) => {
        if (!Number.isSafeInteger(dueAt) || dueAt < run.acceptedAt)
          throw new RangeError("Fixture wait due time must be a safe future timestamp.");
        const prior = run.waits.get(key);
        if (prior !== undefined) {
          if (prior.dueAt !== dueAt) throw new Error(`Wait key ${key} changed its due time.`);
          if (prior.completed) return;
        } else run.waits.set(key, { key, dueAt, completed: false });
        run.status = "sleeping";
      }),
    completeWait: (runId: string, key: string) =>
      update(runId, (run) => {
        const wait = run.waits.get(key);
        if (wait === undefined) throw new Error(`Unknown wait key ${key}.`);
        wait.completed = true;
        run.status = "running";
      }),
    resume: (runId: string) =>
      update(runId, (run) => {
        if (run.status === "sleeping") run.status = "running";
      }),
    complete: (runId: string) =>
      update(runId, (run) => {
        run.status = "completed";
      }),
    observe: (runId: string) => watch(runId),
  });

  return Object.freeze({
    namespace,
    storage,
    workers: Object.freeze({
      get active() {
        return new Set(workers);
      },
      start: (id: string) => workers.add(id),
      stop: (id: string) => workers.delete(id),
    }),
    failures,
    native,
    close: async () => {
      closed = true;
      for (const resolve of waiters) resolve();
      waiters.clear();
      workers.clear();
    },
    cleanup: async () => {
      closed = true;
      for (const resolve of waiters) resolve();
      waiters.clear();
      workers.clear();
      storage.runs.clear();
      storage.keys.clear();
      storage.events.clear();
    },
  });

  function requireRun(runId: string): StoredRun {
    const run = storage.runs.get(runId);
    if (run === undefined) throw new Error(`Unknown fixture run ${runId}.`);
    return run;
  }

  function update(runId: string, apply: (run: StoredRun) => void): RunSnapshot {
    const run = requireRun(runId);
    apply(run);
    emit(run, "update");
    return snapshot(run);
  }

  function snapshot(run: StoredRun): RunSnapshot {
    return Object.freeze({
      ...run,
      waits: Object.freeze([...run.waits.values()].map((wait) => Object.freeze({ ...wait }))),
    });
  }

  function emit(run: StoredRun, kind: NativeObservation["kind"]): void {
    const events = storage.events.get(run.runId) ?? [];
    storage.events.set(run.runId, events);
    events.push(Object.freeze({ kind, sequence: events.length, run: snapshot(run) }));
    for (const resolve of waiters) resolve();
    waiters.clear();
  }

  async function* watch(runId: string): AsyncGenerator<NativeObservation> {
    requireRun(runId);
    let cursor = 0;
    while (!closed) {
      const events = storage.events.get(runId) ?? [];
      if (cursor < events.length) {
        yield events[cursor++]!;
        continue;
      }
      if (requireRun(runId).status === "completed") return;
      await new Promise<void>((resolve) => waiters.add(resolve));
    }
  }
}
