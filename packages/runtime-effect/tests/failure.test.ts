import { Cause } from "effect";
import { describe, expect, test } from "vitest";
import {
  applicationFailure,
  normalizeFailure,
  providerFailure,
  toPublicEnvelope,
} from "../src/failure.js";
import { toFailureTelemetry } from "../src/failure-telemetry.js";
import { redactFailureDetail } from "../src/failure-redaction.js";

describe("runtime failure normalization", () => {
  test("redaction avoids error and array getters and isolates inaccessible proxies", () => {
    let getters = 0;
    const error = new Error("secret=hidden");
    Object.defineProperty(error, "name", {
      get: () => {
        getters += 1;
        throw new Error("getter");
      },
    });
    const array: unknown[] = ["value"];
    Object.defineProperty(array, "0", {
      get: () => {
        getters += 1;
        return "password=hidden";
      },
    });
    expect(redactFailureDetail(error)).toEqual({
      name: "[unavailable]",
      message: "secret=[REDACTED]",
    });
    expect(redactFailureDetail(array)).toEqual(["[unavailable]"]);
    const customStack = new Error("password=hidden");
    Object.defineProperty(customStack, "stack", {
      get: () => {
        getters += 1;
        throw new Error("stack getter");
      },
    });
    expect(redactFailureDetail(customStack)).toEqual({
      name: "Error",
      message: "password=[REDACTED]",
    });
    expect(
      redactFailureDetail(
        new Proxy(
          {},
          {
            ownKeys: () => {
              throw new Error("proxy");
            },
          },
        ),
      ),
    ).toBe("[unavailable]");
    expect(getters).toBe(0);
  });

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
