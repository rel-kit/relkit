import { describe, expect, test } from "bun:test";
import { issueProblem, requestFailure, validationSummary } from "./request-failure";

const at = "2026-01-01T00:00:00.000Z";

describe("validation issues from span event attributes", () => {
  test("lists the code and path of each recorded issue", () => {
    expect(
      validationSummary({
        "relkit.validation.issue_count": 2,
        "relkit.validation.issues.0.code": "missing",
        "relkit.validation.issues.0.path": "id",
        "relkit.validation.issues.1.code": "invalid_type",
        "relkit.validation.issues.1.path": "vehicle.plate",
      }),
    ).toEqual({
      count: 2,
      issues: [
        { code: "missing", path: "id" },
        { code: "invalid_type", path: "vehicle.plate" },
      ],
      more: 0,
    });
  });

  test("says how many issues were not listed", () => {
    const attributes: Record<string, string | number> = { "relkit.validation.issue_count": 14 };
    for (let index = 0; index < 10; index += 1) {
      attributes[`relkit.validation.issues.${index}.code`] = "missing";
      attributes[`relkit.validation.issues.${index}.path`] = `field${index}`;
    }
    const summary = validationSummary(attributes);
    expect(summary?.issues).toHaveLength(10);
    expect(summary?.more).toBe(4);
  });

  test("keeps issues in index order and skips a gap", () => {
    const summary = validationSummary({
      "relkit.validation.issue_count": 3,
      "relkit.validation.issues.2.code": "missing",
      "relkit.validation.issues.2.path": "c",
      "relkit.validation.issues.0.code": "missing",
      "relkit.validation.issues.0.path": "a",
    });
    expect(summary?.issues.map((issue) => issue.path)).toEqual(["a", "c"]);
    expect(summary?.more).toBe(1);
  });

  test("is absent when the event has no count", () => {
    expect(validationSummary({})).toBeUndefined();
    expect(validationSummary(undefined)).toBeUndefined();
  });

  test("describes known codes in plain words and passes schema codes through", () => {
    expect(issueProblem("missing")).toBe("Missing");
    expect(issueProblem("malformed-json")).toBe("Body is not valid JSON");
    expect(issueProblem("content-type")).toBe("Content type is not accepted");
    expect(issueProblem("body-too-large")).toBe("Body is too large");
    expect(issueProblem("body-not-object")).toBe("Body is not an object");
    expect(issueProblem("too_small")).toBe("too_small");
  });
});

describe("what a failed request recorded", () => {
  const request = { requestId: "request-1", traceId: "t", outcome: "declared-error" };

  test("reads the declared error from the request record", () => {
    expect(requestFailure({ ...request, errorId: "fleet.plate-taken" }, [], []).errorId).toBe(
      "fleet.plate-taken",
    );
  });

  test("falls back to the relkit.error.id attribute of a span", () => {
    const spans = [
      {
        spanId: "s1",
        signal: "span",
        attributes: { "relkit.error.id": "fleet.plate-taken" },
      },
    ];
    expect(requestFailure(request, spans, []).errorId).toBe("fleet.plate-taken");
  });

  test("reads the validation issues from the http.validation.failed event", () => {
    const spans = [
      {
        spanId: "s1",
        signal: "span",
        events: [
          { name: "http.request.received", timestamp: at },
          {
            name: "http.validation.failed",
            timestamp: at,
            attributes: {
              "relkit.validation.issue_count": 1,
              "relkit.validation.issues.0.code": "missing",
              "relkit.validation.issues.0.path": "plate",
            },
          },
        ],
      },
    ];
    expect(requestFailure(request, spans, []).validation).toEqual({
      count: 1,
      issues: [{ code: "missing", path: "plate" }],
      more: 0,
    });
  });

  test("reads the recorded cause with its message and stack", () => {
    const spans = [
      {
        spanId: "s1",
        signal: "span",
        events: [
          {
            name: "exception",
            timestamp: at,
            attributes: {
              "exception.type": "DatabaseError",
              "exception.message": "Failed query: insert ... params: [REDACTED]",
              "exception.stacktrace": "DatabaseError: boom\n    at insert (db.ts:1:1)",
            },
          },
        ],
      },
    ];
    expect(requestFailure({ ...request, outcome: "defect" }, spans, []).cause).toEqual({
      type: "DatabaseError",
      message: "Failed query: insert ... params: [REDACTED]",
      stack: "DatabaseError: boom\n    at insert (db.ts:1:1)",
    });
  });

  test("prefers the event that carries a message over one with only a type", () => {
    const spans = [
      {
        spanId: "invocation",
        signal: "span",
        events: [{ name: "exception", timestamp: at, attributes: { "exception.type": "Defect" } }],
      },
      {
        spanId: "request",
        signal: "span",
        events: [
          {
            name: "exception",
            timestamp: at,
            attributes: { "exception.type": "Defect", "exception.message": "boom" },
          },
        ],
      },
    ];
    expect(requestFailure(request, spans, []).cause?.message).toBe("boom");
  });

  test("a type alone is a cause recorded without detail", () => {
    const spans = [
      {
        spanId: "s",
        signal: "span",
        events: [
          {
            name: "exception",
            timestamp: at,
            attributes: { "exception.type": "UnexpectedDefect" },
          },
        ],
      },
    ];
    expect(requestFailure(request, spans, []).cause).toEqual({ type: "UnexpectedDefect" });
  });

  test("falls back to the correlated error log and adds its error code", () => {
    const logs = [
      {
        signal: "log",
        level: "error",
        fields: {
          "exception.type": "DatabaseError",
          "exception.message": "boom",
          "relkit.error.code": "RELKIT_UNEXPECTED_DEFECT",
          "relkit.error.kind": "defect",
        },
      },
    ];
    expect(requestFailure(request, [], logs).cause).toEqual({
      type: "DatabaseError",
      message: "boom",
      code: "RELKIT_UNEXPECTED_DEFECT",
    });
  });

  test("a request that succeeded has nothing to explain", () => {
    expect(requestFailure({ requestId: "r", outcome: "success" }, [], [])).toEqual({});
  });
});
