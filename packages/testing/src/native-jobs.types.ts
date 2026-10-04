import type { Deferred, Effect, Ref, Stream } from "effect";
import type { JobsAdapterRuntime } from "@relkit/jobs/adapter";
import type { RunSnapshot, RunWatchFrame } from "@relkit/contracts/jobs";
import type { TestClock } from "./runtime.js";
import type { TestNativeRun } from "./test-jobs-adapter-support.js";

/** Owner-local deterministic run, worker, cursor and observation admission state. */
export interface NativeJobsState {
  readonly runs: Map<string, TestNativeRun>;
  readonly keys: Map<string, string>;
  readonly cancelReceipts: Map<string, Awaited<ReturnType<JobsAdapterRuntime["cancel"]>>>;
  readonly retryReceipts: Map<
    string,
    Awaited<ReturnType<NonNullable<JobsAdapterRuntime["retry"]>>>
  >;
  sequence: number;
  closed: boolean;
  changed: Deferred.Deferred<void>;
}

/** Effect native jobs adapter decisions with owned worker and observation lifetimes. */
export interface NativeJobsService {
  readonly state: Ref.Ref<NativeJobsState>;
  readonly clock: TestClock;
  readonly submit: (
    ...args: Parameters<JobsAdapterRuntime["submit"]>
  ) => Effect.Effect<Awaited<ReturnType<JobsAdapterRuntime["submit"]>>, unknown>;
  readonly get: (
    ...args: Parameters<JobsAdapterRuntime["get"]>
  ) => Effect.Effect<RunSnapshot, unknown>;
  readonly list: (
    ...args: Parameters<JobsAdapterRuntime["list"]>
  ) => Effect.Effect<Awaited<ReturnType<JobsAdapterRuntime["list"]>>, unknown>;
  readonly cancel: (
    ...args: Parameters<JobsAdapterRuntime["cancel"]>
  ) => Effect.Effect<Awaited<ReturnType<JobsAdapterRuntime["cancel"]>>, unknown>;
  readonly retry: (
    ...args: Parameters<NonNullable<JobsAdapterRuntime["retry"]>>
  ) => Effect.Effect<Awaited<ReturnType<NonNullable<JobsAdapterRuntime["retry"]>>>, unknown>;
  readonly worker: {
    readonly next: (
      ...args: Parameters<NonNullable<JobsAdapterRuntime["worker"]>["next"]>
    ) => Effect.Effect<
      Awaited<ReturnType<NonNullable<JobsAdapterRuntime["worker"]>["next"]>>,
      unknown
    >;
    readonly complete: (
      ...args: Parameters<NonNullable<JobsAdapterRuntime["worker"]>["complete"]>
    ) => Effect.Effect<void, unknown>;
    readonly fail: (
      ...args: Parameters<NonNullable<JobsAdapterRuntime["worker"]>["fail"]>
    ) => Effect.Effect<void, unknown>;
  };
  readonly observe: (
    ...args: Parameters<NonNullable<JobsAdapterRuntime["observe"]>>
  ) => Stream.Stream<RunWatchFrame<RunSnapshot>, unknown>;
  readonly snapshot: (runId: string) => Effect.Effect<RunSnapshot, unknown>;
  readonly close: Effect.Effect<void>;
}
