import { describe, expect, test } from "bun:test";
import { defineError } from "../../packages/functions/src/index.ts";
import {
  bindDescriptorIdentity,
  normalizeFailure,
  toPublicEnvelope,
} from "../../packages/invocation/dist/index.js";
import { z } from "../../packages/schema/src/index.ts";

const data = z.object({ reason: z.string() });

describe("declared error retry metadata", () => {
  test("normalizes omission and legacy strings while retaining delay hints", () => {
    const omitted = defineError({ data, message: "Invalid" });
    const legacy = defineError({ data, message: "Retry", retry: "later" });
    const delayed = defineError({
      data,
      message: "Retry later",
      retry: { kind: "later", afterMs: 1_500 },
    });

    expect(omitted.retry).toBe("never");
    expect(legacy.retry).toBe("later");
    expect(delayed.retry).toBe("later");
    expect(delayed.afterMs).toBe(1_500);
    expect(delayed.create({ reason: "busy" })).toMatchObject({
      retry: "later",
      afterMs: 1_500,
    });
  });

  test("rejects invalid delay hints", () => {
    for (const afterMs of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        defineError({ data, message: "Retry later", retry: { kind: "later", afterMs } }),
      ).toThrow("afterMs");
    }
    expect(() =>
      defineError({ data, message: "Invalid", retry: { kind: "never" } as never }),
    ).toThrow("retry");
  });

  test("binds inferred IDs into instances and safe envelopes", () => {
    const error = defineError({
      data,
      message: "Retry later",
      retry: { kind: "later", afterMs: 1_500 },
    });
    bindDescriptorIdentity(error, "orders.retryable");

    const envelope = toPublicEnvelope(normalizeFailure(error.create({ reason: "busy" })));
    expect(envelope).toEqual({
      kind: "application",
      outcome: "declared-error",
      code: "orders.retryable",
      message: "Retry later",
      data: { reason: "busy" },
      retry: "later",
      afterMs: 1_500,
    });
  });
});
