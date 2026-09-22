import type { RunSnapshot } from "@relkit/contracts/jobs";
import type { TestClock } from "./runtime.js";
import { createDeterministicClock } from "./runtime-clock.js";
import {
  JOBS_ADAPTER_PROTOCOL_VERSION,
  type JobsAdapterRuntime,
  type NativeControlReceipt,
  type NativeTaskWork,
} from "@relkit/jobs/adapter";
import { cancel, retry, unknown } from "./test-jobs-adapter-controls.js";
import {
  createRun,
  complete,
  fail,
  handle,
  list,
  next,
  observe,
} from "./test-jobs-adapter-work.js";
import { requestKey, snapshotOf, type TestNativeRun } from "./test-jobs-adapter-support.js";

export interface TestJobsAdapterOptions {
  readonly clock?: TestClock;
  readonly startTimeMs?: number;
  readonly service?: string;
  readonly unknown?: Partial<Record<"submit" | "cancel" | "retry", boolean>>;
}

export interface TestJobsAdapter extends JobsAdapterRuntime {
  readonly clock: TestClock;
  readonly runNext: () => Promise<NativeTaskWork | undefined>;
  readonly snapshot: (runId: string) => RunSnapshot;
}

export function createDeterministicJobsAdapter(
  options: TestJobsAdapterOptions = {},
): TestJobsAdapter {
  const deterministic =
    options.clock === undefined ? createDeterministicClock(options.startTimeMs ?? 0) : undefined;
  const clock = options.clock ?? deterministic!.clock;
  const service = options.service ?? "test-jobs";
  const runs = new Map<string, TestNativeRun>();
  const keys = new Map<string, string>();
  const cancelReceipts = new Map<string, NativeControlReceipt>();
  const retryReceipts = new Map<string, NativeControlReceipt>();
  let sequence = 0;
  let closed = false;
  const adapter: TestJobsAdapter = {
    kind: "jobs-adapter-runtime",
    protocolVersion: JOBS_ADAPTER_PROTOCOL_VERSION,
    capabilities: {
      service,
      provider: "test",
      adapterId: "test-jobs",
      protocolVersion: 1,
      features: {
        submission: true,
        read: true,
        list: true,
        observation: true,
        cancel: true,
        retry: true,
      },
    },
    submit: async (request) => {
      ensureOpen();
      if (options.unknown?.submit === true)
        return unknown(
          "RELKIT_JOB_SUBMISSION_UNKNOWN",
          request.operationId,
          request.idempotencyKey,
        );
      const key = requestKey(request);
      const existing = key === undefined ? undefined : keys.get(key);
      if (existing !== undefined) return { ...handle(runs.get(existing)!), duplicate: true };
      const run = createRun(request, `test-run-${++sequence}`, undefined, clock);
      runs.set(run.runId, run);
      if (key !== undefined) keys.set(key, run.runId);
      return handle(run);
    },
    get: async (locator) => {
      const run = runs.get(locator);
      if (run === undefined) throw new Error("Test run was not found");
      return snapshotOf(run, service);
    },
    list: async (query) => list(runs, query, service),
    observe: (request, context) => observe(runs, request, context, service),
    cancel: async (request) =>
      cancel(runs, cancelReceipts, request, options.unknown?.cancel === true, service),
    retry: async (request) =>
      retry(runs, retryReceipts, request, options.unknown?.retry === true, service, clock),
    worker: {
      next: async (context) => next(runs, context, service),
      complete: async (runId, output) => complete(runs.get(runId), output, clock),
      fail: async (runId, error) => fail(runs.get(runId), error, clock),
    },
    close: async () => {
      closed = true;
    },
    clock,
    runNext: async () =>
      next(
        runs,
        {
          signal: new AbortController().signal,
          application: "test",
          environment: "test",
          scope: "test",
          service,
          serviceGeneration: "test",
        },
        service,
      ),
    snapshot: (runId) => {
      const run = runs.get(runId);
      if (run === undefined) throw new Error("Test run was not found");
      return snapshotOf(run, service);
    },
  };
  return Object.freeze(adapter);

  function ensureOpen(): void {
    if (closed) throw new Error("Test jobs adapter is closed");
  }
}

export const createTestJobsAdapter = createDeterministicJobsAdapter;
