import { expect, test } from "bun:test";
import { canonicalJson } from "@zsys/contracts";
import { OBSERVABILITY_MODEL_VERSION, REQUEST_OUTCOMES, type RequestRecord } from "./src/index.ts";

test("model records are versioned, correlated, and JSON-safe", () => {
  const record = {
    version: OBSERVABILITY_MODEL_VERSION,
    signal: "request",
    requestId: "request-1",
    traceId: "trace-1",
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
    timeline: [{ kind: "accepted", at: "2026-08-16T00:00:00.000Z" }],
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
