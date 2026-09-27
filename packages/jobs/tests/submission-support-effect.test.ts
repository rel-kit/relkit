import { expect, test } from "vitest";
import { Effect, Layer, Result } from "effect";
import {
  boundedKey,
  currentCorrelation,
  currentTaskRunId,
  explicitOrDerivedKey,
  explicitOrDerivedKeyEffect,
  hashWireEffect,
  isRecord,
  isUnknown,
  normalizeReceipt,
  normalizeReceiptEffect,
  normalizeSubmissionError,
  propagationFor,
  scheduledTime,
  submissionDigestLayer,
  SubmissionSupportFailure,
  validatedEnvelope,
} from "../src/submission-support.ts";
import { JobsTelemetry } from "../src/jobs-observability.ts";
import type { JobsRuntimeBinding } from "../src/runtime.ts";
test("submission helpers expose typed receipt errors and injectable digest IO", async () => {
  const seen: string[] = [];
  const layer = Layer.mergeAll(
    submissionDigestLayer(async () => new ArrayBuffer(32)),
    Layer.succeed(
      JobsTelemetry,
      JobsTelemetry.of({
        observe: (operation, effect) => {
          seen.push(operation);
          return effect;
        },
      }),
    ),
  );
  const binding = { jobId: "job", taskId: "task", taskVersion: "1" } as JobsRuntimeBinding;
  const metadata = { operationId: "op" };
  const receipt = Effect.runSync(
    Effect.provide(
      normalizeReceiptEffect(
        {
          accepted: true,
          runId: "run",
          jobId: "job",
          taskId: "task",
          taskVersion: "1",
          acceptedAt: "2026-01-01T00:00:00.000Z",
        },
        binding,
        metadata,
      ),
      layer,
    ),
  );
  expect(receipt.runId).toBe("run");
  const key = Effect.runSync(
    Effect.provide(
      explicitOrDerivedKeyEffect({ admission: { idempotency: { key: "tenantId" } } }, {} as never, {
        tenantId: "one",
      }),
      layer,
    ),
  );
  expect(key).toMatch(/^[^\s]+$/);
  await expect(
    Effect.runPromise(Effect.provide(hashWireEffect({ version: 1, kind: "void" }), layer)),
  ).resolves.toBe(`sha256:${"00".repeat(32)}`);
  const invalid = Effect.runSync(
    Effect.result(
      Effect.provide(normalizeReceiptEffect({ accepted: false }, binding, metadata), layer),
    ),
  );
  expect(Result.isFailure(invalid)).toBe(true);
  if (Result.isFailure(invalid)) expect(invalid.failure).toBeInstanceOf(SubmissionSupportFailure);
  expect(seen).toContain("submissionSupport.hashWire");
  expect(seen).toContain("submissionSupport.receipt");
});

test("compatibility helpers preserve idempotency, time, and receipt boundaries", () => {
  const job = { admission: { idempotency: { key: "tenantId" } } };
  const derived = explicitOrDerivedKey(job, {} as never, { tenantId: "one" });
  expect(derived).toBeDefined();
  expect(explicitOrDerivedKey(undefined, { idempotencyKey: "fixed" } as never, undefined)).toBe(
    "fixed",
  );
  expect(() =>
    explicitOrDerivedKey(job, { idempotencyKey: "wrong" } as never, { tenantId: "one" }),
  ).toThrow("must match");
  expect(() => boundedKey("x".repeat(257))).toThrow("too long");
  expect(scheduledTime({ delay: "1 second" } as never, 0)).toBe("1970-01-01T00:00:01.000Z");
  expect(scheduledTime({ at: "2026-01-01T00:00:00.000Z" } as never, 0)).toBe(
    "2026-01-01T00:00:00.000Z",
  );
  expect(currentCorrelation()).toBeUndefined();
  expect(currentTaskRunId()).toBeUndefined();
  expect(propagationFor(undefined)).toBeUndefined();
  expect(validatedEnvelope({ canonicalInput: undefined } as never)).toEqual({
    version: 1,
    kind: "void",
  });
  expect(isRecord([])).toBe(false);
  expect(isRecord({})).toBe(true);
  expect(isUnknown({ outcome: "unknown" })).toBe(false);
  expect(normalizeSubmissionError("provider rejected", { operationId: "op" })).toBeInstanceOf(
    Error,
  );
  const binding = { jobId: "job", taskId: "task", taskVersion: "1" } as JobsRuntimeBinding;
  expect(
    normalizeReceipt(
      {
        accepted: true,
        runId: "run",
        jobId: "job",
        taskId: "task",
        taskVersion: "1",
        acceptedAt: "2026-01-01T00:00:00.000Z",
      },
      binding,
      { operationId: "op" },
    ).runId,
  ).toBe("run");
});
