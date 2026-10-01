import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { z } from "@relkit/schema";
import { snapshotDescriptorEffect } from "../../src/discovery/evaluator-snapshot.js";

describe("snapshot capability accessor boundaries", () => {
  it.effect("snapshots array accessors and sparse entries without evaluating them", () =>
    Effect.gen(function* () {
      let reads = 0;
      const values = new Array<unknown>(3);
      Object.defineProperty(values, "0", {
        get: () => {
          reads++;
          throw new Error("array accessor executed");
        },
      });
      values[2] = "data";
      const snapshot = yield* snapshotDescriptorEffect({
        kind: "service",
        id: "s",
        ref: { kind: "service", id: "s" },
        ...{ values },
      });
      expect(reads).toBe(0);
      expect(snapshot.metadata).toMatchObject({
        values: [{ $relkit: "accessor" }, { $relkit: "undefined" }, "data"],
      });
    }),
  );

  it.effect("inspects function names and error identity without executing getters", () =>
    Effect.gen(function* () {
      let reads = 0;
      const callback = () => undefined;
      for (const key of ["kind", "name"])
        Object.defineProperty(callback, key, {
          get: () => {
            reads++;
            throw new Error("accessor executed");
          },
          configurable: true,
        });
      const snapshot = yield* snapshotDescriptorEffect({
        kind: "service",
        id: "s",
        ref: { kind: "service", id: "s" },
        ...{ callback },
      });
      expect(reads).toBe(0);
      expect(snapshot.metadata).toMatchObject({ callback: { $relkit: "function", name: "" } });
    }),
  );
  it.effect("marks schemas with unsafe projection metadata instead of invoking accessors", () =>
    Effect.gen(function* () {
      let reads = 0;
      for (const key of [Symbol.for("relkit.schema.metadata"), "relkit"]) {
        const schema = z.string();
        Object.defineProperty(schema, key, {
          get: () => {
            reads++;
            throw new Error("schema accessor executed");
          },
          configurable: true,
        });
        const snapshot = yield* snapshotDescriptorEffect({
          kind: "service",
          id: "s",
          ref: { kind: "service", id: "s" },
          ...{ schema },
        });
        expect(snapshot.metadata).toMatchObject({ schema: { $relkit: "schema-unavailable" } });
        const functionMetadata = () => undefined;
        Object.defineProperty(functionMetadata, "jsonSchema", {
          get: () => {
            reads++;
            throw new Error("projection getter");
          },
        });
        const functionSchema = z.string();
        Object.defineProperty(functionSchema, key, { value: functionMetadata, configurable: true });
        const functionSnapshot = yield* snapshotDescriptorEffect({
          kind: "service",
          id: "s",
          ref: { kind: "service", id: "s" },
          ...{ schema: functionSchema },
        });
        expect(functionSnapshot.metadata).toMatchObject({
          schema: { $relkit: "schema-unavailable" },
        });
      }
      expect(reads).toBe(0);
    }),
  );
  it.effect(
    "rejects inherited projection getters while retaining plain metadata getters as markers",
    () =>
      Effect.gen(function* () {
        let reads = 0;
        const prototype = Object.defineProperty({}, "input", {
          get: () => {
            reads++;
            return {};
          },
        });
        const jsonSchema = Object.create(prototype);
        const schema = {
          "~standard": { version: 1, validate: () => ({ value: "ok" }), jsonSchema },
        };
        const snapshot = yield* snapshotDescriptorEffect({
          kind: "service",
          id: "s",
          ref: { kind: "service", id: "s" },
          ...{ schema },
        });
        expect(reads).toBe(0);
        expect(snapshot.metadata).toMatchObject({ schema: { $relkit: "schema-unavailable" } });
      }),
  );
});
