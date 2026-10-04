import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer, Schema } from "effect";
import { InspectorQueries, inspectorQueriesLayer } from "../../src/query.service.js";
import { inspectorNativeJobsLayer } from "../../src/jobs/native.service.js";
import { InspectorActionIdentity } from "../../src/actions.schemas.js";
import { generation } from "../fixtures/services.js";
import { getTaskDefinitionEffect, listJobDefinitionsEffect } from "../../src/jobs/definitions.js";

describe("Inspector query owner", () => {
  it.effect("rejects unauthorized requests before generation access", () => {
    let reads = 0;
    const layer = inspectorQueriesLayer({
      authorize: () => false,
      getActiveGeneration: () => {
        reads++;
        throw new Error("must not read");
      },
    }).pipe(Layer.provide(inspectorNativeJobsLayer));
    return Effect.gen(function* () {
      const queries = yield* InspectorQueries;
      assert.deepStrictEqual(yield* queries.access(new Request("http://localhost"), true), {
        allowed: false,
      });
      assert.strictEqual(reads, 0);
    }).pipe(Effect.provide(layer));
  });

  it.effect("selects public graph fields without invoking poisoned private getters", () => {
    const node = { id: "function.orders", kind: "function", name: "orders" };
    let privateReads = 0;
    for (const key of ["handler", "schema", "provider", "input", "source"])
      Object.defineProperty(node, key, {
        enumerable: true,
        get: () => {
          privateReads++;
          throw new Error("private getter");
        },
      });
    const active = generation({ graph: { nodes: [node], edges: [] } });
    return Effect.gen(function* () {
      const queries = yield* InspectorQueries;
      const result = yield* queries.project(active, {
        kind: "graph-list",
        collection: "functions",
        request: new Request("http://localhost?limit=1"),
      });
      assert.strictEqual(privateReads, 0);
      assert.include(JSON.stringify(result), "function.orders");
      assert.notInclude(JSON.stringify(result), "handler");
    }).pipe(
      Effect.provide(
        inspectorQueriesLayer({ authorize: () => true }).pipe(
          Layer.provide(inspectorNativeJobsLayer),
        ),
      ),
    );
  });

  it.effect("redacts stored task metadata before spreading its public envelope", () => {
    const task = { kind: "task", id: "task.orders", taskId: "orders", version: "1" };
    let privateReads = 0;
    for (const key of ["handler", "input", "onStart"])
      Object.defineProperty(task, key, {
        enumerable: true,
        get: () => {
          privateReads++;
          throw new Error("private task behavior");
        },
      });
    const active = generation({
      graph: {
        nodes: [
          task,
          {
            kind: "job",
            id: "job.orders",
            taskId: "orders",
            executionModel: "task",
          },
        ],
        edges: [],
      },
    });
    return Effect.gen(function* () {
      const result = yield* getTaskDefinitionEffect(active, "orders");
      assert.strictEqual(privateReads, 0);
      assert.include(JSON.stringify(result), '"versions":["1"]');
      const definitions = yield* listJobDefinitionsEffect(active, new Request("http://localhost"));
      assert.strictEqual(privateReads, 0);
      assert.include(JSON.stringify(definitions), "job.orders");
    }).pipe(Effect.provide(inspectorNativeJobsLayer));
  });

  it.effect("projects native resource pages before admitting private accessors", () => {
    const page = { items: [{ key: "public-object" }] };
    let privateReads = 0;
    Object.defineProperty(page, "provider", {
      enumerable: true,
      get: () => {
        privateReads++;
        throw new Error("private native provider");
      },
    });
    const active = generation({
      resources: {
        buckets: {
          supports: () => true,
          list: () => page,
          preview: () => undefined,
        },
      },
    });
    return Effect.gen(function* () {
      const queries = yield* InspectorQueries;
      const result = yield* queries.project(active, {
        kind: "bucket-objects",
        id: "bucket.orders",
        request: new Request("http://localhost?limit=1"),
      });
      assert.strictEqual(privateReads, 0);
      assert.include(JSON.stringify(result), "public-object");
    }).pipe(
      Effect.provide(
        inspectorQueriesLayer({ authorize: () => true }).pipe(
          Layer.provide(inspectorNativeJobsLayer),
        ),
      ),
    );
  });

  it.effect("validates projected action identities without decoding an entire body", () =>
    Effect.gen(function* () {
      const value = yield* Schema.decodeUnknownEffect(InspectorActionIdentity)({
        generationId: " one ",
        graphHash: " hash ",
        idempotencyKey: " key ",
      });
      assert.deepStrictEqual(value, {
        generationId: "one",
        graphHash: "hash",
        idempotencyKey: "key",
      });
      assert.isTrue(
        yield* Schema.decodeUnknownEffect(InspectorActionIdentity)({
          generationId: "",
          graphHash: "hash",
          idempotencyKey: "key",
        }).pipe(Effect.isFailure),
      );
    }),
  );

  it.effect("can replace query behavior using Service.of and a test layer", () =>
    Effect.gen(function* () {
      const queries = yield* InspectorQueries;
      assert.deepStrictEqual(yield* queries.project(generation(), { kind: "graph" }), {
        fixture: true,
      });
    }).pipe(
      Effect.provide(
        Layer.succeed(
          InspectorQueries,
          InspectorQueries.of({
            access: () => Effect.succeed({ allowed: false }),
            project: () => Effect.succeed({ fixture: true }),
          }),
        ),
      ),
    ),
  );
});
