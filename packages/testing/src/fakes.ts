import { assertFailurePoint, assertName, lazyRecords } from "./fake-utils.js";
import { Context, Effect, Layer, ManagedRuntime, Ref } from "effect";
import { observeExecution, runExecutionSync } from "@relkit/contracts/operation";
import { disposeTestingOwner, testingLoggerLayer } from "./testing-owner.js";
import type { TestFailureControls, TestFakesOptions, TestFakes } from "./fakes.types.js";
export type { TestFailureControls, TestFakesOptions, TestFakes } from "./fakes.types.js";
import type { DependencyCategory, DependencyClientSources } from "@relkit/engine";
import {
  createTestBucketFake,
  type TestBucketFake,
  type TestBucketFakeOptions,
} from "./buckets.js";
import { createTestCacheFake, type TestCacheFake, type TestCacheFakeOptions } from "./cache.js";
import { copyTestProviderReplacements } from "./provider-replacements.js";

/**
 * Creates fresh dependency sources and failure controls for one test runtime.
 * @param stateRoot - Native stateRoot supplied to this owner.
 * @param options - Explicit configuration and native dependencies for this test owner.
 * @returns Fake native providers whose complete close releases all acquired storage.
 */
function createFakeState(stateRoot: string, options: TestFakesOptions = {}): TestFakes {
  if (stateRoot.length === 0) throw new TypeError("Test fake state root must not be empty");
  const providers = copyTestProviderReplacements(options.providers);
  const clients = Object.fromEntries(
    ["jobs", "events", "buckets", "cache", "agents"].map((category) => [
      category,
      Object.create(null) as Record<string, unknown>,
    ]),
  ) as Record<DependencyCategory, Record<string, unknown>>;
  const state = Ref.makeUnsafe({
    closed: false,
    configuredFailures: new Map<string, { readonly cause: unknown; readonly once: boolean }>(),
    eventSequence: 0,
    jobSequence: 0,
  });
  const configuredFailures = Ref.getUnsafe(state).configuredFailures;

  const failures: TestFailureControls = Object.freeze({
    failAt: (point: string, cause?: unknown) => {
      assertFailurePoint(point);
      configuredFailures.set(point, {
        cause: cause ?? new Error(`Injected test failure: ${point}`),
        once: false,
      });
    },
    once: (point: string, cause?: unknown) => {
      assertFailurePoint(point);
      configuredFailures.set(point, {
        cause: cause ?? new Error(`Injected test failure: ${point}`),
        once: true,
      });
    },
    clear: (point?: string) => {
      if (point === undefined) configuredFailures.clear();
      else configuredFailures.delete(point);
    },
    check: (point: string) => {
      const failure = configuredFailures.get(point);
      if (failure === undefined) return;
      if (failure.once) configuredFailures.delete(point);
      throw failure.cause instanceof Error
        ? failure.cause
        : new Error(`Injected test failure: ${point}`);
    },
  });

  const bucketRecords = Object.create(null) as Record<string, TestBucketFake>;
  const cacheRecords = Object.create(null) as Record<string, TestCacheFake<unknown, unknown>>;
  /**
   * Acquires each named native bucket at most once within this fake owner.
   * @param id Declared bucket dependency identity.
   * @param fakeOptions Per-bucket native policy; owner clock and root are shared.
   * @returns The retained bucket facade, rejecting acquisition after close.
   */
  const createBucket = (
    id: string,
    fakeOptions: Omit<TestBucketFakeOptions, "bucketId" | "stateRoot" | "failures" | "clock"> = {},
  ) => {
    if (Ref.getUnsafe(state).closed) throw new Error("Test fakes are closed");
    const existing = bucketRecords[id];
    if (existing !== undefined) return existing;
    const fake = createTestBucketFake({
      ...fakeOptions,
      bucketId: id,
      stateRoot,
      failures,
      ...(options.logger === undefined ? {} : { logger: options.logger }),
      ...(options.clock === undefined ? {} : { clock: options.clock }),
    });
    bucketRecords[id] = fake;
    return fake;
  };
  /**
   * Acquires each named writable cache at most once within this fake owner.
   * @param id Declared cache dependency identity.
   * @param fakeOptions Per-cache schema/TTL policy; owner clock and root are shared.
   * @returns The retained cache facade, rejecting acquisition after close.
   */
  const createCache = (
    id: string,
    fakeOptions: Omit<TestCacheFakeOptions, "cacheId" | "stateRoot" | "failures" | "clock"> = {},
  ) => {
    if (Ref.getUnsafe(state).closed) throw new Error("Test fakes are closed");
    const existing = cacheRecords[id];
    if (existing !== undefined) return existing;
    const fake = createTestCacheFake({
      ...fakeOptions,
      cacheId: id,
      stateRoot,
      failures,
      ...(options.logger === undefined ? {} : { logger: options.logger }),
      ...(options.clock === undefined ? {} : { clock: options.clock }),
    });
    cacheRecords[id] = fake as TestCacheFake<unknown, unknown>;
    return cacheRecords[id]!;
  };
  const buckets = lazyRecords(bucketRecords, createBucket);
  const cache = lazyRecords(cacheRecords, createCache);
  clients.buckets = lazyRecords(
    Object.create(null) as Record<string, unknown>,
    (id) => createBucket(id).provider,
  );
  clients.cache = lazyRecords(
    Object.create(null) as Record<string, unknown>,
    (id) => createCache(id).provider,
  );
  clients.events = lazyRecords(clients.events!, (id) =>
    Object.freeze({
      publish: async (_payload: unknown, _options: unknown, context: { signal: AbortSignal }) => {
        if (Ref.getUnsafe(state).closed) throw new Error("Test fakes are closed");
        if (context.signal.aborted) throw context.signal.reason ?? new Error("Event cancelled");
        failures.check("event.publish");
        return {
          accepted: true,
          instanceId: `test-event-${id}-${++Ref.getUnsafe(state).eventSequence}`,
        };
      },
    }),
  );
  clients.jobs = lazyRecords(clients.jobs!, (id) =>
    Object.freeze({
      enqueue: async (_input: unknown, _options: unknown, context: { signal: AbortSignal }) => {
        if (Ref.getUnsafe(state).closed) throw new Error("Test fakes are closed");
        if (context.signal.aborted) throw context.signal.reason ?? new Error("Job cancelled");
        failures.check("job.enqueue");
        return {
          accepted: true,
          instanceId: `test-job-${id}-${++Ref.getUnsafe(state).jobSequence}`,
        };
      },
    }),
  );

  return Object.freeze({
    stateRoot,
    clients: clients as DependencyClientSources,
    buckets,
    cache,
    providers,
    createBucket,
    createCache,
    setClient: (category: DependencyCategory, name: string, client: unknown) => {
      assertName(name);
      clients[category]![name] = client;
    },
    removeClient: (category: DependencyCategory, name: string) => {
      assertName(name);
      delete clients[category]![name];
    },
    failures,
    close: async () => {
      const current = Ref.getUnsafe(state);
      if (current.closed) return;
      current.closed = true;
      const results = await Promise.allSettled(
        [...Object.values(bucketRecords), ...Object.values(cacheRecords)].map((fake) =>
          fake.close(),
        ),
      );
      const failures = results.filter((result) => result.status === "rejected");
      if (failures.length > 0)
        throw new AggregateError(
          failures.map((result) => result.reason),
          "Test fake cleanup failed",
        );
    },
  });
}

/** Native dependency sources and their storage release share a single test owner. */
export class TestFakeProviders extends Context.Service<TestFakeProviders, TestFakes>()(
  "relkit/testing/FakeProviders",
) {}

/**
 * Acquires synchronous fake dependencies and scopes all storage created lazily later.
 * @param stateRoot Explicit runtime-owned persistence root.
 * @param options Injected clock and explicit provider replacements.
 * @returns A scoped, substitutable fake-provider Layer.
 */
export function fakeProvidersLayer(stateRoot: string, options: TestFakesOptions = {}) {
  return Layer.effect(
    TestFakeProviders,
    Effect.acquireRelease(
      observeExecution(
        "testing",
        "fakes.acquire",
        Effect.sync(() => TestFakeProviders.of(createFakeState(stateRoot, options))),
      ),
      (value) => Effect.promise(() => value.close()),
    ),
  );
}

/**
 * Creates fresh native dependency sources with an owned Effect lifetime.
 * @param stateRoot Explicit persistence root owned by the parent runtime.
 * @param options Injected clock and explicit native replacements.
 * @returns Synchronously ready fake providers; close releases all child storage.
 */
export function createTestFakes(stateRoot: string, options: TestFakesOptions = {}): TestFakes {
  const owner = ManagedRuntime.make(
    fakeProvidersLayer(stateRoot, options).pipe(
      Layer.provideMerge(testingLoggerLayer(options.logger)),
    ),
  );
  let value;
  try {
    value = runExecutionSync(owner, TestFakeProviders);
  } catch (error) {
    void disposeTestingOwner(owner).catch(() => undefined);
    throw error;
  }
  let closing: Promise<void> | undefined;
  return Object.freeze({ ...value, close: () => (closing ??= disposeTestingOwner(owner)) });
}
