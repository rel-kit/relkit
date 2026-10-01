import { describe, expect, it } from "@effect/vitest";
import { Cause, Effect, Exit } from "effect";
import {
  normalizeCompilation,
  normalizeCompilationEffect,
  VALIDATION_PASSES,
  type NormalizeInput,
} from "../src/normalize.js";
import { rewriteIdentityValues } from "../src/normalize-identity-rewrite.js";

describe("normalization workflow", () => {
  it.effect("is lazy and allocates a separate workspace for every execution", () =>
    Effect.gen(function* () {
      const observed: string[] = [];
      const workflow = normalizeCompilationEffect({
        onPass: (pass, index) => observed.push(`${index}:${pass}`),
      });
      expect(observed).toEqual([]);
      const first = yield* workflow;
      const second = yield* workflow;
      expect(first.passOrder).toEqual(VALIDATION_PASSES);
      expect(second).toEqual(first);
      expect(second.references).not.toBe(first.references);
      const expected = VALIDATION_PASSES.map((pass, index) => `${index + 1}:${pass}`);
      expect(observed).toEqual([...expected, ...expected]);
      expect(normalizeCompilation()).toEqual(first);
    }),
  );

  it.effect("retains a pass exception as a diagnostic and completes later passes", () =>
    Effect.gen(function* () {
      const descriptor = {
        kind: "function",
        get id(): string {
          throw new Error("descriptor unavailable");
        },
      };
      const result = yield* normalizeCompilationEffect({ descriptors: [descriptor] });
      expect(result.passOrder).toEqual(VALIDATION_PASSES);
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({
          code: "RELKIT_NORMALIZATION_FAILED",
          severity: "error",
          message: "extract descriptor values failed: descriptor unavailable",
        }),
      );
      expect(result.activatable).toBe(false);
      expect(result.outputs.graph).not.toBe("");
      expect(result.outputs.manifest).toBe("");
      expect(result.outputs.runtimeActivation).toBe("");
    }),
  );

  it.effect("preserves observer defects and their original synchronous thrown value", () =>
    Effect.gen(function* () {
      const defect = new Error("observer failed");
      const visited: number[] = [];
      const input: NormalizeInput = {
        onPass: (_pass, index) => {
          visited.push(index);
          if (index === 2) throw defect;
        },
      };
      const exit = yield* normalizeCompilationEffect(input).pipe(Effect.exit);
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(Cause.hasDies(exit.cause)).toBe(true);
        expect(Cause.squash(exit.cause)).toBe(defect);
      }
      expect(visited).toEqual([1, 2]);
      expect(() => normalizeCompilation(input)).toThrow(defect);
    }),
  );
});

describe("identity rewriting", () => {
  it.effect(
    "retains cyclic arrays without recursion failure and rewrites neighboring identities",
    () =>
      Effect.sync(() => {
        const values: unknown[] = [];
        values.push(values, { id: "unbound.fn" });
        const result = rewriteIdentityValues(
          values,
          new Map([["unbound.fn", "orders.create"]]),
          new Set(),
        );
        expect(Array.isArray(result)).toBe(true);
        if (Array.isArray(result)) {
          expect(result[0]).toBe(values);
          expect(result[1]).toEqual({ id: "orders.create" });
        }
        expect(rewriteIdentityValues(values, new Map(), new Set())).toBe(values);
      }),
  );
});
