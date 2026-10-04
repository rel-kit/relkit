import { expect, it } from "@effect/vitest";
import { Cause, Effect, Exit, Layer } from "effect";
import { existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BucketClient } from "@relkit/buckets";
import { z } from "@relkit/schema";
import { TestRuntimeExecution, testRuntimeLayer } from "../../src/runtime-execution.js";
import { testingLoggerLayer } from "../../src/testing-owner.js";
import { invokeFunction } from "../../src/invoke-function.js";
import type { DetachedInvocationContext } from "./acquisition.types.js";

it.live("releases acquired runtime roots when service construction fails", () =>
  Effect.gen(function* () {
    const before = new Set(readdirSync(tmpdir()));
    const acquired: string[] = [];
    const sentinel = new Error("context acquisition");
    const result = yield* Effect.exit(
      TestRuntimeExecution.pipe(
        Effect.provide(
          testRuntimeLayer({
            get context(): Readonly<Record<string, unknown>> {
              acquired.push(
                ...readdirSync(tmpdir())
                  .filter((name) => name.startsWith("relkit-test-") && !before.has(name))
                  .map((name) => join(tmpdir(), name)),
              );
              throw sentinel;
            },
          }).pipe(Layer.provideMerge(testingLoggerLayer())),
        ),
      ),
    );
    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result)) expect(Cause.squash(result.cause)).toBe(sentinel);
    expect(acquired.length).toBeGreaterThan(0);
    expect(acquired.every((path) => !existsSync(path))).toBe(true);
  }),
);

it.live.each([false, true])(
  "closes implicitly acquired native storage after invocation failure=%s",
  (failed) =>
    Effect.gen(function* () {
      const sentinel = new Error("native handler");
      let retained: BucketClient | undefined;
      const target = {
        id: "testing.owned-storage",
        input: z.string(),
        output: z.string(),
        dependencies: {
          buckets: { assets: { ref: { kind: "bucket", id: "testing.assets" } } },
        },
        handler: async (input: string, context: DetachedInvocationContext) => {
          retained = context.buckets.assets;
          await retained.put("first", new TextEncoder().encode(input));
          if (failed) throw sentinel;
          return input;
        },
      };
      if (failed) {
        yield* Effect.promise(() =>
          expect(invokeFunction(target, "value")).rejects.toMatchObject({
            code: "RELKIT_UNEXPECTED_DEFECT",
            kind: "defect",
          }),
        );
      } else {
        expect(yield* Effect.promise(() => invokeFunction(target, "value"))).toBe("value");
      }
      expect(retained).toBeDefined();
      yield* Effect.promise(() =>
        expect(retained!.put("after", new Uint8Array([1]))).rejects.toMatchObject({
          code: "RELKIT_PROVIDER_FAILURE",
          kind: "provider",
        }),
      );
    }),
);

it.live("preserves synchronous setup failure while releasing its acquired fake prefix", () =>
  Effect.gen(function* () {
    const before = new Set(readdirSync(tmpdir()));
    const acquired: string[] = [];
    const sentinel = new Error("native env getter");
    const target = {
      id: "testing.failed-setup",
      input: z.string(),
      output: z.string(),
      dependencies: {
        buckets: { assets: { ref: { kind: "bucket", id: "testing.assets" } } },
      },
      handler: (input: string) => input,
    };
    expect(() =>
      invokeFunction(target, "value", {
        get env(): Readonly<Record<string, unknown>> {
          acquired.push(
            ...readdirSync(tmpdir())
              .filter((name) => name.startsWith("relkit-test-") && !before.has(name))
              .map((name) => join(tmpdir(), name)),
          );
          throw sentinel;
        },
      }),
    ).toThrow(sentinel);
    // One host completion turn drains the scheduled owner release; this is not a poll.
    yield* Effect.promise(() => new Promise<void>((resolve) => setImmediate(resolve)));
    expect(acquired.length).toBeGreaterThan(0);
    expect(acquired.every((path) => !existsSync(path))).toBe(true);
  }),
);
