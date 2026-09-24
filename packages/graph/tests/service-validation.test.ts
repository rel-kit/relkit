import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import { GraphValidationError } from "../src/index.js";
import { validateId } from "../src/graph-validation-primitives.js";
import { validateServiceNode, validateServiceNodeEffect } from "../src/service-validation.js";
const valid = {
  functions: [{ name: "create", functionId: "orders.create" }],
  events: [{ name: "created", eventId: "orders.created" }],
  tasks: [{ name: "send", taskId: "orders.send" }],
  jobs: [{ name: "refresh", jobId: "orders.refresh" }],
  tags: ["commerce"],
  title: "Orders",
  description: "Order service",
};
function message(value: Record<string, unknown>): string {
  const error = Effect.runSync(Effect.flip(validateServiceNodeEffect(value, 0, validateId)));
  expect(error).toBeInstanceOf(GraphValidationError);
  return error.message;
}
describe("service validation", () => {
  test("accepts all member families in the Effect and synchronous APIs", () => {
    expect(Effect.runSync(validateServiceNodeEffect(valid, 0, validateId))).toBeUndefined();
    expect(() => validateServiceNode(valid, 0, validateId)).not.toThrow();
  });
  test.each([
    [{ ...valid, functions: null }, ".functions must be an array"],
    [{ ...valid, events: null }, ".events must be an array"],
    [{ ...valid, functions: [null] }, ".functions[0] is invalid"],
    [
      { ...valid, functions: [{ name: "", functionId: "orders.create" }] },
      ".functions[0] is invalid",
    ],
    [{ ...valid, functions: [{ name: "create", functionId: "bad/id" }] }, ".functionId is invalid"],
    [
      { ...valid, events: [{ name: "create", eventId: "orders.created" }] },
      ".events[0] is invalid",
    ],
    [{ ...valid, events: [{ name: "created", eventId: "bad/id" }] }, ".eventId is invalid"],
    [{ ...valid, tasks: null }, ".tasks must be an array"],
    [{ ...valid, jobs: [null] }, ".jobs[0] is invalid"],
    [{ ...valid, jobs: [{ name: "refresh", jobId: "bad/id" }] }, ".jobId is invalid"],
    [{ ...valid, tags: [4] }, ".tags is invalid"],
    [{ ...valid, title: 4 }, ".title is invalid"],
    [{ ...valid, description: false }, ".description is invalid"],
  ])("rejects an invalid service projection %#", (value, expected) => {
    expect(message(value)).toContain(expected);
    expect(() => validateServiceNode(value, 0, validateId)).toThrow(TypeError);
  });
});
