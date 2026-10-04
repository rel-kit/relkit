import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer, ManagedRuntime } from "effect";
import { createObservabilityStream } from "@relkit/observability";
import {
  InspectorQueries,
  inspectorQueriesLayer,
  inspectorNativeJobsLayer,
  inspectorControlsLayer,
  InspectorNativeJobs,
  InspectorObservability,
  inspectorObservabilityLayer,
  streamResponse,
} from "../../src/index.js";

describe("checked Inspector ownership examples", () => {
  it("provisions the documented query dependency and retires the owner", async () => {
    const runtime = ManagedRuntime.make(
      inspectorQueriesLayer({ authorize: () => true }).pipe(
        Layer.provide(inspectorNativeJobsLayer),
      ),
    );
    try {
      const access = await runtime.runPromise(
        Effect.flatMap(InspectorQueries, (queries) =>
          queries.access(new Request("http://localhost"), false),
        ),
      );
      assert.deepStrictEqual(access, { allowed: true, generation: undefined });
    } finally {
      await runtime.dispose();
    }
  });

  it("acquires and releases the documented control owner", async () => {
    const owner = ManagedRuntime.make(inspectorControlsLayer);
    try {
      await owner.context();
    } finally {
      await owner.dispose();
    }
  });

  it("cancels the documented response-owned live feed", async () => {
    const source = createObservabilityStream();
    const response = streamResponse(source, new Request("http://localhost"), 1);
    try {
      assert.strictEqual(source.stats().subscribers, 1);
      await response.body!.cancel();
      assert.strictEqual(source.stats().subscribers, 0);
    } finally {
      source.close();
    }
  });

  it.effect("provides the documented finite native traversal layer", () => {
    const health = Effect.flatMap(InspectorNativeJobs, (jobs) => jobs.healthPages([]));
    return health.pipe(
      Effect.provide(inspectorNativeJobsLayer),
      Effect.tap((result) => Effect.sync(() => assert.deepStrictEqual(result, []))),
    );
  });

  it("keeps the observation layer alive while its response retires", async () => {
    const source = createObservabilityStream();
    const owner = ManagedRuntime.make(inspectorObservabilityLayer(undefined, source));
    try {
      const response = await owner.runPromise(
        Effect.flatMap(InspectorObservability, (observation) =>
          observation.response(new Request("http://localhost"), 1),
        ),
      );
      await response.body!.cancel();
      assert.strictEqual(source.stats().subscribers, 0);
      await owner.context();
    } finally {
      source.close();
      await owner.dispose();
    }
  });

  it.effect("substitutes native traversal and observation through their live contracts", () =>
    Effect.gen(function* () {
      const jobs = yield* InspectorNativeJobs;
      const observation = yield* InspectorObservability;
      assert.deepStrictEqual(yield* jobs.healthPages([]), []);
      assert.deepStrictEqual(yield* observation.list("requests", {}), { fixture: true });
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(
            InspectorNativeJobs,
            InspectorNativeJobs.of({
              healthPages: () => Effect.succeed([]),
              runPages: () => Effect.succeed([]),
              schedulePages: () => Effect.succeed([]),
            }),
          ),
          Layer.succeed(
            InspectorObservability,
            InspectorObservability.of({
              list: () => Effect.succeed({ fixture: true }),
              detail: () => Effect.succeed(undefined),
              response: () => Effect.succeed(new Response("fixture")),
            }),
          ),
        ),
      ),
    ),
  );
});
