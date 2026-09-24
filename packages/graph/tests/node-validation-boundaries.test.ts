import { Effect } from "effect";
import { expect, test } from "vitest";
import { GraphValidationError, validateGraphShapeEffect } from "../src/index.js";
import { functionNode, graph, httpTrigger, serviceNode, source } from "./graph-fixtures.js";

test.each([
  ["invalid domain ID", functionNode({ domainId: "bad/id" }), ".domainId"],
  ["invalid generated marker", functionNode({ generated: "agent" }), ".generated is invalid"],
  [
    "invalid job profile",
    {
      kind: "job",
      id: "orders.job",
      source,
      executionModel: "task",
      name: "send",
      jobId: "orders.job",
      taskId: "orders.send",
      taskVersion: "1",
      profile: "",
      implicit: false,
      default: true,
    },
    ".profile is invalid",
  ],
  ["missing agent tool IDs", { kind: "agent", id: "orders.agent", source }, ".toolIds is invalid"],
  [
    "invalid task version in job binding",
    {
      kind: "job",
      id: "orders.job",
      source,
      executionModel: "task",
      name: "send",
      jobId: "orders.job",
      taskId: "orders.send",
      taskVersion: "",
      profile: "default",
      implicit: false,
      default: true,
    },
    ".taskVersion is invalid",
  ],
  [
    "invalid event exposure",
    { kind: "event", id: "orders.created", source, exposure: "secret" },
    ".exposure is invalid",
  ],
  [
    "invalid service member",
    serviceNode({ functions: [{ name: "create", functionId: "bad/id" }] }),
    ".functionId",
  ],
  ["invalid service task list", serviceNode({ tasks: "invalid" }), ".tasks must be an array"],
  [
    "invalid HTTP middleware identity",
    httpTrigger({
      config: { middleware: [{ id: "bad/id", path: "/", order: 0, match: "always" }] },
    }),
    ".middleware[0].id",
  ],
])("rejects %s through the Effect graph validator", (_label, node, expected) => {
  const error = Effect.runSync(Effect.flip(validateGraphShapeEffect(graph([node]))));
  expect(error).toBeInstanceOf(GraphValidationError);
  expect(error.message).toContain(expected);
});

test.each([null, {}])("accepts an HTTP trigger without optional identity lists in %j", (config) => {
  expect(
    Effect.runSync(validateGraphShapeEffect(graph([httpTrigger({ config })]))),
  ).toBeUndefined();
});

test("accepts service task and job references", () => {
  const service = serviceNode({
    tasks: [{ name: "send", taskId: "orders.send" }],
    jobs: [{ name: "refresh", jobId: "orders.refresh" }],
  });
  expect(Effect.runSync(validateGraphShapeEffect(graph([service])))).toBeUndefined();
});
