import type { TestJobsAdapterOptions, TestJobsAdapter } from "./test-jobs-adapter.types.js";
export type { TestJobsAdapterOptions, TestJobsAdapter } from "./test-jobs-adapter.types.js";
import { Effect, Layer, ManagedRuntime, Stream } from "effect";
import { runExecutionPromise, runExecutionSync } from "@relkit/contracts/operation";
import { JOBS_ADAPTER_PROTOCOL_VERSION, type JobsAdapterRuntime } from "@relkit/jobs/adapter";

import { TestNativeJobs, nativeJobsLayer } from "./native-jobs-service.js";
import {
  disposeTestingOwner,
  runRetainedTestingQuery,
  testingLoggerLayer,
} from "./testing-owner.js";
import { detachedNativeSnapshot } from "./test-jobs-adapter-support.js";
import { Ref } from "effect";

/**
 * Creates a synchronous compatibility adapter over one deterministic jobs owner.
 * @param options Clock and explicitly injected native write outcomes.
 * @returns Native jobs Promise/iterator operations; close releases this owner once.
 */
export function createDeterministicJobsAdapter(
  options: TestJobsAdapterOptions = {},
): TestJobsAdapter {
  const owner = ManagedRuntime.make(
    nativeJobsLayer(options).pipe(Layer.provideMerge(testingLoggerLayer(options.logger))),
  );
  const service = runExecutionSync(owner, TestNativeJobs);
  const context = runExecutionSync(owner, Effect.context<never>());
  let closing: Promise<void> | undefined;
  const workerContext = {
    signal: new AbortController().signal,
    application: "test",
    environment: "test",
    scope: "test",
    service: options.service ?? "test-jobs",
    serviceGeneration: "test",
  };
  return Object.freeze<TestJobsAdapter>({
    kind: "jobs-adapter-runtime",
    protocolVersion: JOBS_ADAPTER_PROTOCOL_VERSION,
    capabilities: {
      service: options.service ?? "test-jobs",
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
    submit: (...args: Parameters<JobsAdapterRuntime["submit"]>) =>
      closing === undefined
        ? runExecutionPromise(owner, service.submit(...args))
        : Promise.reject(new Error("Test jobs adapter is closed")),
    get: (...args: Parameters<JobsAdapterRuntime["get"]>) =>
      closing === undefined
        ? runExecutionPromise(owner, service.get(...args))
        : runRetainedTestingQuery(context, service.get(...args)),
    list: (...args: Parameters<JobsAdapterRuntime["list"]>) =>
      closing === undefined
        ? runExecutionPromise(owner, service.list(...args))
        : runRetainedTestingQuery(context, service.list(...args)),
    observe: (...args: Parameters<NonNullable<JobsAdapterRuntime["observe"]>>) =>
      Stream.toAsyncIterableWith(service.observe(...args), context),
    cancel: (...args: Parameters<JobsAdapterRuntime["cancel"]>) =>
      closing === undefined
        ? runExecutionPromise(owner, service.cancel(...args))
        : Promise.reject(new Error("Test jobs adapter is closed")),
    retry: (...args: Parameters<NonNullable<JobsAdapterRuntime["retry"]>>) =>
      closing === undefined
        ? runExecutionPromise(owner, service.retry(...args))
        : Promise.reject(new Error("Test jobs adapter is closed")),
    worker: {
      next: (...args: Parameters<NonNullable<JobsAdapterRuntime["worker"]>["next"]>) =>
        closing === undefined
          ? runExecutionPromise(owner, service.worker.next(...args))
          : Promise.resolve(undefined),
      complete: (...args: Parameters<NonNullable<JobsAdapterRuntime["worker"]>["complete"]>) =>
        closing === undefined
          ? runExecutionPromise(owner, service.worker.complete(...args))
          : Promise.resolve(),
      fail: (...args: Parameters<NonNullable<JobsAdapterRuntime["worker"]>["fail"]>) =>
        closing === undefined
          ? runExecutionPromise(owner, service.worker.fail(...args))
          : Promise.resolve(),
    },
    clock: service.clock,
    runNext: () =>
      closing === undefined
        ? runExecutionPromise(owner, service.worker.next(workerContext))
        : Promise.resolve(undefined),
    snapshot: (runId: string) =>
      detachedNativeSnapshot(
        Ref.getUnsafe(service.state),
        runId,
        options.service ?? "test-jobs",
        service.clock,
      ),
    close: () =>
      (closing ??= runExecutionPromise(owner, service.close).finally(() =>
        disposeTestingOwner(owner),
      )),
  });
}

/** @inheritDoc createDeterministicJobsAdapter */
export const createTestJobsAdapter = createDeterministicJobsAdapter;
