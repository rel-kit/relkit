import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { dependencyClosureEffect, stableValueEffect } from "../src/jobs/build-id-values.js";
import { inputWork } from "../src/jobs/manifest-build.js";

describe("job hashing review regressions", () => {
  it.effect(
    "traverses cyclic dependency objects and arrays once without losing neighboring references",
    () =>
      Effect.gen(function* () {
        const dependencies: Record<string, unknown> = {};
        const array: unknown[] = [dependencies, { ref: { kind: "function", id: "orders.create" } }];
        array.push(array);
        dependencies.self = dependencies;
        dependencies.functions = array;
        const work = inputWork({ graphHash: "hash", descriptors: [] });
        const result = yield* dependencyClosureEffect(work, dependencies);
        expect(result).toEqual([{ id: "orders.create", kind: "function", version: "" }]);
        const projection = yield* stableValueEffect(dependencies);
        expect(projection).toMatchObject({ self: { $relkit: "cycle" } });
      }),
  );
});
