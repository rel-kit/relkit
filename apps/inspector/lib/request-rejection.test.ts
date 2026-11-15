import { describe, expect, test } from "bun:test";
import { EMPTY_SIGNAL_FILTERS } from "./observability-model";
import {
  listRejectionMessage,
  rejectedField,
  withRejection,
  type FilterRejection,
} from "./request-rejection";

const status: FilterRejection = {
  message: "Observability query status is invalid: expected an HTTP status from 100 to 599",
  parameter: "status",
};

describe("rejectedField", () => {
  test("maps the query parameters the filter form shows to their fields", () => {
    for (const name of [
      "status",
      "method",
      "path",
      "search",
      "outcome",
      "errorId",
      "routeId",
      "functionId",
      "requestId",
      "traceId",
      "serviceId",
      "from",
      "to",
    ])
      expect(rejectedField(name)).toBe(name as never);
  });

  test("returns undefined for parameters the form has no field for", () => {
    expect(rejectedField(undefined)).toBeUndefined();
    expect(rejectedField("cursor")).toBeUndefined();
    expect(rejectedField("limit")).toBeUndefined();
    expect(rejectedField("severity")).toBeUndefined();
    expect(rejectedField("toString")).toBeUndefined();
  });
});

describe("withRejection", () => {
  const applied = { ...EMPTY_SIGNAL_FILTERS, status: "999" };

  test("adds the server's message at the field its parameter names", () => {
    expect(withRejection([], status, applied, applied)).toEqual([
      { field: "status", message: status.message },
    ]);
  });

  test("replaces a client-side message for the same field and keeps the others", () => {
    const own = [
      {
        field: "status",
        message: "Status must be a code from 100 to 599, or a class such as 5xx.",
      },
      { field: "method", message: "Method must be 1 to 16 letters, such as GET." },
    ] as const;
    expect(withRejection(own, status, applied, applied)).toEqual([
      { field: "method", message: own[1].message },
      { field: "status", message: status.message },
    ]);
  });

  test("stops showing the message once the field no longer holds the rejected value", () => {
    expect(withRejection([], status, applied, { ...applied, status: "404" })).toEqual([]);
  });

  test("shows nothing without a rejection, or for a parameter that is not a field", () => {
    expect(withRejection([], undefined, applied, applied)).toEqual([]);
    expect(withRejection([], { message: "x", parameter: "cursor" }, applied, applied)).toEqual([]);
    expect(withRejection([], { message: "x" }, applied, applied)).toEqual([]);
  });
});

describe("listRejectionMessage", () => {
  test("is the server's message when the parameter is not a field", () => {
    expect(listRejectionMessage({ message: "Cursor is not valid.", parameter: "cursor" })).toBe(
      "Cursor is not valid.",
    );
    expect(listRejectionMessage({ message: "Query is not valid." })).toBe("Query is not valid.");
  });

  test("is undefined when a field shows the message, or there is no rejection", () => {
    expect(listRejectionMessage(status)).toBeUndefined();
    expect(listRejectionMessage(undefined)).toBeUndefined();
  });
});
