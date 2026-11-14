import { describe, expect, test } from "bun:test";
import { routeOutcome } from "./route-status";

describe("the status line of a sent route request", () => {
  test("a 2xx completed", () => {
    expect(routeOutcome({ status: 200, body: {} })).toEqual({
      tone: "success",
      text: "Request completed (200).",
    });
    expect(routeOutcome({ status: 204, body: null }).text).toBe("Request completed (204).");
  });

  test("a 401 says no session is attached and that this browser's session would be used", () => {
    const outcome = routeOutcome({
      status: 401,
      body: { status: 401, code: "unauthenticated", detail: "Sign in" },
    });
    expect(outcome.tone).toBe("danger");
    expect(outcome.text).toContain("The application refused this request (401)");
    expect(outcome.text).toContain("no user session is attached");
    expect(outcome.text).toContain("signed in to the application in this browser");
  });

  test("a 403 says the application denied the caller", () => {
    expect(routeOutcome({ status: 403, body: { code: "access-denied" } }).text).toContain(
      "The application refused this request (403)",
    );
  });

  test("other failures name the status and the problem code from the body", () => {
    expect(
      routeOutcome({ status: 422, body: { status: 422, code: "validation", detail: "x" } }).text,
    ).toBe("The application answered 422 with the problem code validation.");
    expect(routeOutcome({ status: 500, body: { code: "internal-error" } })).toEqual({
      tone: "danger",
      text: "The application answered 500 with the problem code internal-error.",
    });
  });

  test("a failure without a problem body names only the status", () => {
    expect(routeOutcome({ status: 502, body: "Bad gateway" }).text).toBe(
      "The application answered 502.",
    );
    expect(routeOutcome({ status: 404, body: { code: 12 } }).text).toBe(
      "The application answered 404.",
    );
  });

  test("a redirect is reported as one", () => {
    expect(routeOutcome({ status: 302, body: null })).toEqual({
      tone: "neutral",
      text: "The application answered with a redirect (302).",
    });
  });
});
