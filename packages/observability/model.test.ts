import { expect, test } from "bun:test";
import { canonicalJson } from "@relkit/contracts";
import { OBSERVABILITY_MODEL_VERSION, REQUEST_OUTCOMES, type RequestRecord } from "./src/index.ts";

test("model records are versioned, correlated, and JSON-safe", () => {
  const record = {
    version: OBSERVABILITY_MODEL_VERSION,
    signal: "request",
    phase: "completed",
    requestId: "request-1",
    originRequestId: "request-1",
    traceId: "10000000000000000000000000000001",
    generationId: "generation-1",
    graphHash: "sha256:graph",
    invocationId: "invocation-1",
    startedAt: "2026-08-16T00:00:00.000Z",
    completedAt: "2026-08-16T00:00:00.001Z",
    durationMs: 1,
    method: "GET",
    rawPath: "/health",
    normalizedRoute: "/health",
    routeId: "health",
    functionId: "health.check",
    status: 200,
    outcome: "success",
  } satisfies RequestRecord;

  expect(JSON.parse(canonicalJson(record))).toMatchObject({
    signal: "request",
    outcome: "success",
  });
  expect(REQUEST_OUTCOMES).toEqual([
    "success",
    "declared-error",
    "validation-error",
    "timeout",
    "cancelled",
    "defect",
  ]);
});
