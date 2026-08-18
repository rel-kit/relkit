import { Cause } from "effect";
import { describe, expect, test } from "bun:test";
import {
  applicationFailure,
  normalizeFailure,
  providerFailure,
  toPublicEnvelope,
} from "./src/failure.js";
import { toFailureTelemetry } from "./src/failure-telemetry.js";

describe("runtime failure normalization", () => {
  test("maps declared errors to their safe application envelope", () => {
    const error = Object.assign(new Error("Order missing"), {
      name: "DeclaredError",
      id: "orders.not-found",
      ref: { kind: "error", id: "orders.not-found" },
      data: { orderId: "order-1" },
      retry: "never" as const,
      http: { status: 404 },
    });

    expect(toPublicEnvelope(error)).toEqual({
      kind: "application",
      outcome: "declared-error",
      code: "orders.not-found",
      message: "Order missing",
      data: { orderId: "order-1" },
      status: 404,
      retry: "never",
    });
  });

  test("distinguishes provider, timeout, cancellation, and defect causes", () => {
    expect(normalizeFailure(providerFailure(new Error("secret=token"))).kind).toBe("provider");
    expect(normalizeFailure({ _tag: "TimeoutError", name: "TimeoutError" }).kind).toBe("timeout");
    expect(normalizeFailure(Cause.interrupt()).kind).toBe("cancellation");
    expect(normalizeFailure(new Error("bug")).kind).toBe("defect");
  });

  test("keeps raw detail out of public envelopes and redacts development telemetry", () => {
    const cause = new Error("password=super-secret");
    const failure = normalizeFailure(cause);
    expect(failure.kind).toBe("defect");
    expect(toPublicEnvelope(failure)).not.toHaveProperty("internal");
    expect(toFailureTelemetry(failure, { mode: "production" })).not.toHaveProperty("internal");
    expect(toFailureTelemetry(failure, { mode: "development" }).internal?.cause).toEqual({
      message: "password=[REDACTED]",
      name: "Error",
      stack: expect.any(String),
    });
  });

  test("keeps application failures typed internally", () => {
    const failure = applicationFailure({
      id: "orders.failed",
      message: "No",
      data: {},
      retry: "later",
    });
    expect(failure.code).toBe("orders.failed");
    expect(toPublicEnvelope(failure).retry).toBe("later");
  });
});
