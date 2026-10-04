import { Effect, Layer, ManagedRuntime } from "effect";
import { defineEnv } from "@relkit/config";
import { z } from "@relkit/schema";
import { createTestRuntime } from "../../src/runtime.js";
import { createTestBucketFake } from "../../src/buckets.js";
import { createTestCacheFake } from "../../src/cache.js";
import { createTestHttpClient } from "../../src/http.js";
import { createTestModel } from "../../src/agents-model.js";
import { TestIdentity, identityLayer } from "../../src/identity.js";
import { TestDeterministicClock, deterministicClockLayer } from "../../src/runtime-clock.js";
import { disposeTestingOwner, testingLoggerLayer } from "../../src/testing-owner.js";
import { createTestApplication, type TestApplicationOptions } from "../../src/application.js";

/**
 * Typechecks native generic inference and exactly-once helper ownership examples.
 * @returns Completion after all sample owners release their resources.
 */
export async function ownedHelpersExample(): Promise<void> {
  const runtime = createTestRuntime({ app: { env: defineEnv({}) } });
  const releases: (() => Promise<void>)[] = [];
  try {
    const bucket = createTestBucketFake({ clock: runtime.clock.currentTimeMs });
    releases.push(() => bucket.close());
    const cache = createTestCacheFake({
      keySchema: z.string(),
      valueSchema: z.object({ count: z.number() }),
      clock: runtime.clock.currentTimeMs,
    });
    releases.push(() => cache.close());
    const http = createTestHttpClient({ fetch: () => Response.json({ ready: true }) });
    releases.push(() => http.close());
    const model = createTestModel({ script: [{ type: "final", output: { ready: true } }] });
    releases.push(() => model.close());
    const value = await runtime.invoke(
      {
        id: "test.example",
        input: z.string(),
        output: z.number(),
        handler: (input: string) => input.length,
      },
      "owned",
    );
    value satisfies number;
    await bucket.seed("example", new Uint8Array([value]));
    await cache.seed("example", { count: value }, { ttlMs: 10 });
    const read = await cache.read("example");
    read?.count satisfies number | undefined;
    await http.get("/");
    model.reset();
  } finally {
    const results = await Promise.allSettled(releases.reverse().map((release) => release()));
    try {
      const failures = results.filter((result) => result.status === "rejected");
      if (failures.length > 0) throw new AggregateError(failures.map((result) => result.reason));
    } finally {
      await runtime.close();
    }
  }
}

/**
 * Typechecks provisioning deterministic services without allocating per-call owners.
 * @returns Completion after the owner releases its merged service Layer.
 */
export async function deterministicServicesExample(): Promise<void> {
  const layer = Layer.mergeAll(identityLayer(), deterministicClockLayer(100)).pipe(
    Layer.provideMerge(testingLoggerLayer()),
  );
  const owner = ManagedRuntime.make(layer);
  try {
    await owner.runPromise(
      Effect.gen(function* () {
        const identity = yield* TestIdentity;
        const clock = yield* TestDeterministicClock;
        yield* identity.next("trace");
        yield* Effect.promise(() => clock.clock.advance(10));
      }),
    );
  } finally {
    await disposeTestingOwner(owner);
  }
}

/**
 * Typechecks the documented application pattern against an explicit source project.
 * @param options Test project root and native dependencies supplied by the caller.
 * @returns Completion after application reverse-order scoped shutdown.
 */
export async function applicationExample(options: TestApplicationOptions): Promise<void> {
  const app = await createTestApplication({ env: defineEnv({}) }, options);
  try {
    await app.http.get("/");
  } finally {
    await app.close();
  }
}
