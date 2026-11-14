import { describe, expect, test } from "bun:test";
import { InspectorApiError } from "./api-types";
import { actionAnswer, actionCause } from "./action-answer";

function refused(
  code: string,
  status: number,
  body: Record<string, unknown> = {},
): InspectorApiError {
  return new InspectorApiError(code, code, status, "http", { error: code, ...body });
}

describe("the application's answer to a refused action", () => {
  test("reads the cause from the rejected body", () => {
    const error = refused("RELKIT_INSPECTOR_ACTION_FAILED", 409, {
      cause: { status: 401, code: "unauthenticated" },
    });
    expect(actionCause(error)).toEqual({ status: 401, code: "unauthenticated" });
    expect(actionCause(new Error("x"))).toBeUndefined();
    expect(actionCause(refused("RELKIT_INSPECTOR_ACTION_NOT_FOUND", 404))).toBeUndefined();
  });

  test("says that a 401 means no session is attached", () => {
    const answer = actionAnswer(
      refused("RELKIT_INSPECTOR_ACTION_FAILED", 409, {
        cause: { status: 401, code: "unauthenticated" },
      }),
      "function",
    );
    expect(answer.noSession).toBe(true);
    expect(answer.text).toContain("The application refused this call (401)");
    expect(answer.text).toContain("no user session is attached");
    expect(answer.text).toContain("can only be invoked through the application");
  });

  test("says that a 403 was an access decision made without a session", () => {
    const answer = actionAnswer(
      refused("RELKIT_INSPECTOR_ACTION_FAILED", 409, {
        cause: { status: 403, code: "access-denied" },
      }),
      "function",
    );
    expect(answer.noSession).toBe(true);
    expect(answer.text).toContain("(403)");
    expect(answer.text).toContain("without a user session");
  });

  test("names a declared error so the page can link to its contract", () => {
    const answer = actionAnswer(
      refused("RELKIT_INSPECTOR_ACTION_FAILED", 409, {
        cause: { status: 409, code: "orders.out-of-stock" },
      }),
      "function",
    );
    expect(answer.errorId).toBe("orders.out-of-stock");
    expect(answer.text).toBe("The application ended this call with its declared error (409).");
  });

  test("lists the fields of a validation failure by dotted path", () => {
    const answer = actionAnswer(
      refused("RELKIT_INSPECTOR_ACTION_FAILED", 422, {
        cause: {
          status: 422,
          code: "validation",
          issues: [
            { path: ["vehicle", "plate"], code: "invalid_type" },
            { path: ["stops", 0, "city"], code: "too_small" },
            { path: [], code: "custom" },
          ],
        },
      }),
      "function",
    );
    expect(answer.text).toBe("The input does not satisfy the function's input schema (422).");
    expect(answer.issues).toEqual([
      { path: "vehicle.plate", code: "invalid_type" },
      { path: "stops.0.city", code: "too_small" },
      { path: "", code: "custom" },
    ]);
  });

  test("words an event payload failure for the event", () => {
    const answer = actionAnswer(
      refused("RELKIT_EVENT_PAYLOAD_VALIDATION", 422, {
        cause: { status: 422, code: "validation", issues: [{ path: ["id"], code: "missing" }] },
      }),
      "event",
    );
    expect(answer.text).toBe("The payload does not satisfy the event's schema (422).");
    expect(answer.issues).toEqual([{ path: "id", code: "missing" }]);
  });

  test("words provider failures, cancellations and internal failures", () => {
    const text = (code: string, status: number) =>
      actionAnswer(refused("X", 409, { cause: { status, code } }), "function").text;
    expect(text("provider-failure", 502)).toBe(
      "A provider the function depends on failed (502). Open the request in Requests to see the cause.",
    );
    expect(text("timeout", 504)).toBe("The function did not finish in time (504).");
    expect(text("cancelled", 499)).toBe("The call was cancelled before the function finished.");
    expect(text("internal-error", 500)).toBe(
      "The function failed with an unexpected error (500). Open the request in Requests to see the cause.",
    );
  });

  test("explains failures that are the Inspector's own", () => {
    expect(actionAnswer(refused("RELKIT_INSPECTOR_ACTION_NOT_FOUND", 404), "event").text).toBe(
      "The active generation has no such event or publication (404).",
    );
    expect(
      actionAnswer(refused("RELKIT_INSPECTOR_ACTION_STATE_INELIGIBLE", 409), "event").text,
    ).toBe("The delivery's current state does not allow this action (409).");
    expect(
      actionAnswer(refused("RELKIT_INSPECTOR_ACTION_UNSUPPORTED", 501), "event", {
        unsupported: "This provider cannot retry a delivery.",
      }).text,
    ).toBe("This provider cannot retry a delivery.");
    expect(actionAnswer(refused("RELKIT_INSPECTOR_ACTION_UNSUPPORTED", 501), "event").text).toBe(
      "The active provider does not support this action (RELKIT_INSPECTOR_ACTION_UNSUPPORTED).",
    );
    expect(
      actionAnswer(
        new InspectorApiError("down", "RELKIT_INSPECTOR_DISCONNECTED", undefined, "network"),
        "function",
      ).text,
    ).toBe("The Inspector cannot reach the application. Start it and try again.");
    expect(actionAnswer(refused("RELKIT_INSPECTOR_ACTION_FAILED", 409), "function").text).toBe(
      "The Inspector could not complete the action (RELKIT_INSPECTOR_ACTION_FAILED).",
    );
  });
});
