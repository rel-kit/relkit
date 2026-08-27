import type { DependencyCategory, DependencyClientSources } from "@relkit/engine";
import {
  createTestBucketFake,
  type TestBucketFake,
  type TestBucketFakeOptions,
} from "./buckets.js";
import { createTestCacheFake, type TestCacheFake, type TestCacheFakeOptions } from "./cache.js";

export interface TestFailureControls {
  readonly failAt: (point: string, cause?: unknown) => void;
  readonly once?: (point: string, cause?: unknown) => void;
  readonly clear: (point?: string) => void;
  readonly check: (point: string) => void;
}

export interface TestFakesOptions {
  readonly clock?: () => number;
}

export interface TestFakes {
  readonly stateRoot: string;
  readonly clients: DependencyClientSources;
  readonly buckets: Readonly<Record<string, TestBucketFake>>;
  readonly cache: Readonly<Record<string, TestCacheFake<unknown, unknown>>>;
  readonly createBucket: (
    id: string,
    options?: Omit<TestBucketFakeOptions, "bucketId" | "stateRoot" | "failures" | "clock">,
  ) => TestBucketFake;
  readonly createCache: (
    id: string,
    options?: Omit<TestCacheFakeOptions, "cacheId" | "stateRoot" | "failures" | "clock">,
  ) => TestCacheFake<unknown, unknown>;
  readonly setClient: (category: DependencyCategory, name: string, client: unknown) => void;
  readonly removeClient: (category: DependencyCategory, name: string) => void;
  readonly failures: TestFailureControls;
}

/** Creates fresh dependency sources and failure controls for one test runtime. */
export function createTestFakes(stateRoot: string, options: TestFakesOptions = {}): TestFakes {
  if (stateRoot.length === 0) throw new TypeError("Test fake state root must not be empty");
  const clients = Object.fromEntries(
    ["jobs", "events", "buckets", "cache", "agents"].map((category) => [
      category,
      Object.create(null) as Record<string, unknown>,
    ]),
  ) as Record<DependencyCategory, Record<string, unknown>>;
  const configuredFailures = new Map<string, { readonly cause: unknown; readonly once: boolean }>();
  let eventSequence = 0;
  let jobSequence = 0;

  const failures: TestFailureControls = Object.freeze({
    failAt: (point: string, cause?: unknown) => {
      assertPoint(point);
      configuredFailures.set(point, {
        cause: cause ?? new Error(`Injected test failure: ${point}`),
        once: false,
      });
    },
    once: (point: string, cause?: unknown) => {
      assertPoint(point);
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
  const createBucket = (
    id: string,
    fakeOptions: Omit<TestBucketFakeOptions, "bucketId" | "stateRoot" | "failures" | "clock"> = {},
  ) => {
    const existing = bucketRecords[id];
    if (existing !== undefined) return existing;
    const fake = createTestBucketFake({
      ...fakeOptions,
      bucketId: id,
      stateRoot,
      failures,
      ...(options.clock === undefined ? {} : { clock: options.clock }),
    });
    bucketRecords[id] = fake;
    return fake;
  };
  const createCache = (
    id: string,
    fakeOptions: Omit<TestCacheFakeOptions, "cacheId" | "stateRoot" | "failures" | "clock"> = {},
  ) => {
    const existing = cacheRecords[id];
    if (existing !== undefined) return existing;
    const fake = createTestCacheFake({
      ...fakeOptions,
      cacheId: id,
      stateRoot,
      failures,
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
        if (context.signal.aborted) throw context.signal.reason ?? new Error("Event cancelled");
        failures.check("event.publish");
        return { accepted: true, instanceId: `test-event-${id}-${++eventSequence}` };
      },
    }),
  );
  clients.jobs = lazyRecords(clients.jobs!, (id) =>
    Object.freeze({
      enqueue: async (_input: unknown, _options: unknown, context: { signal: AbortSignal }) => {
        if (context.signal.aborted) throw context.signal.reason ?? new Error("Job cancelled");
        failures.check("job.enqueue");
        return { accepted: true, instanceId: `test-job-${id}-${++jobSequence}` };
      },
    }),
  );

  return Object.freeze({
    stateRoot,
    clients: clients as DependencyClientSources,
    buckets,
    cache,
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
  });
}

function lazyRecords<T>(records: Record<string, T>, create: (id: string) => T): Record<string, T> {
  return new Proxy(records, {
    get(target, property, receiver) {
      if (typeof property !== "string") return Reflect.get(target, property, receiver);
      if (target[property] !== undefined) return target[property];
      const created = create(property);
      return (target[property] ??= created);
    },
  });
}

function assertPoint(point: string): void {
  if (point.length === 0) throw new TypeError("Failure point must not be empty");
}

function assertName(name: string): void {
  if (name.length === 0) throw new TypeError("Fake client name must not be empty");
}
