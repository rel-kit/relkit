import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { z } from "@relkit/schema";
import { snapshotDescriptor } from "../../src/discovery/evaluator-snapshot.js";
describe("data-only evaluator snapshots", () => {
  it.effect("marks accessors and cycles without invoking getters", () =>
    Effect.sync(() => {
      let reads = 0;
      const value = {
        kind: "service",
        id: "service:test",
        ref: { kind: "service", id: "service:test" },
        get secret() {
          reads++;
          throw new Error("must never run");
        },
        shared: { value: 1 },
        other: { value: 1 },
      };
      Object.assign(value, { self: value, other: value.shared });
      const snapshot = snapshotDescriptor(value);
      expect(reads).toBe(0);
      expect(snapshot.metadata).toMatchObject({
        secret: { $relkit: "accessor" },
        self: { $relkit: "cycle" },
        shared: { value: 1 },
        other: { value: 1 },
      });
    }),
  );
  it.effect("bounds deep values and non-JSON primitive metadata", () =>
    Effect.sync(() => {
      let nested: unknown = "end";
      for (let depth = 0; depth < 12; depth++) nested = { nested };
      const value = {
        kind: "service",
        id: "s",
        ref: { kind: "service", id: "s" },
        nested,
        infinity: Infinity,
        missing: undefined,
        integer: 1n,
        symbol: Symbol("label"),
      };
      const snapshot = snapshotDescriptor(value);
      expect(snapshot.metadata).toMatchObject({
        infinity: { $relkit: "non-finite-number" },
        missing: { $relkit: "undefined" },
        integer: { $relkit: "bigint" },
        symbol: { $relkit: "symbol", name: "label" },
      });
      expect(JSON.stringify(snapshot)).toContain("depth-limit");
    }),
  );
  it.effect("tracks task executable source without executing it", () =>
    Effect.sync(() => {
      const handler = () => {
        throw new Error("must never run");
      };
      const value = {
        kind: "task",
        id: "t",
        ref: { kind: "task", id: "t" },
        handler,
        onSuccess: handler,
        helper: handler,
      };
      const snapshot = snapshotDescriptor(value);
      expect(snapshot.metadata).toMatchObject({
        handler: {
          $relkit: "function",
          owner: "task",
          role: "handler",
          sourceHash: expect.stringMatching(/^sha256:/),
        },
        onSuccess: { $relkit: "function", owner: "task", role: "hook" },
        helper: { $relkit: "function", name: "handler" },
      });
    }),
  );
  it.effect("retains directional schemas and stable contract hashes", () =>
    Effect.sync(() => {
      const value = {
        kind: "service",
        id: "s",
        ref: { kind: "service", id: "s" },
        schema: z.string(),
      };
      const first = snapshotDescriptor(value);
      expect(first).toEqual(snapshotDescriptor(value));
      expect(first.metadata).toMatchObject({
        schema: {
          $relkit: "schema",
          jsonSchema: { type: "string" },
          inputJsonSchema: { type: "string" },
          outputJsonSchema: { type: "string" },
          contractHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        },
      });
    }),
  );
  it.effect("does not execute Standard Schema accessors or validator string overrides", () =>
    Effect.sync(() => {
      let reads = 0;
      const accessed = {
        "~standard": {
          get version() {
            reads++;
            throw new Error("version accessor");
          },
          get validate() {
            reads++;
            throw new Error("validator accessor");
          },
        },
      };
      const schema = z.string();
      const accessedValidator = {
        "~standard": {
          version: 1,
          get validate() {
            reads++;
            throw new Error("validator accessor");
          },
        },
      };
      Object.defineProperty(schema["~standard"].validate, "toString", {
        value: () => {
          reads++;
          throw new Error("string override");
        },
      });
      const value = {
        kind: "service",
        id: "s",
        ref: { kind: "service", id: "s" },
        accessed,
        accessedValidator,
        schema,
      };
      const snapshot = snapshotDescriptor(value);
      expect(reads).toBe(0);
      expect(snapshot.metadata).toMatchObject({
        accessed: {
          "~standard": { version: { $relkit: "accessor" }, validate: { $relkit: "accessor" } },
        },
        accessedValidator: { "~standard": { version: 1, validate: { $relkit: "accessor" } } },
        schema: { $relkit: "schema", contractHash: expect.stringMatching(/^sha256:/) },
      });
    }),
  );
});
