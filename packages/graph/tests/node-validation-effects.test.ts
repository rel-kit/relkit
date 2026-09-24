import { describe, expect, test } from "vitest";
import { Effect } from "effect";
import { GraphValidationError, validateGraphShapeEffect } from "../src/index.js";
import { appNode, functionNode, graph, source } from "./graph-fixtures.js";
function validationMessage(value: unknown): string {
  const error = Effect.runSync(Effect.flip(validateGraphShapeEffect(value)));
  expect(error).toBeInstanceOf(GraphValidationError);
  return error.message;
}
describe("typed graph node validation", () => {
  test.each([
    ["invalid kind", { kind: "route", id: "orders.route", source }, "invalid kind"],
    [
      "invalid source",
      functionNode({ source: { file: "../outside.ts", line: 1, column: 1 } }),
      ".source is invalid",
    ],
    ["invalid invocation", functionNode({ invocationMode: "inline" }), "invocationMode"],
    ["invalid exposure", functionNode({ exposure: "private" }), ".exposure"],
    [
      "invalid generated ID",
      functionNode({ generated: { agentId: "bad/id" } }),
      ".generated.agentId",
    ],
    [
      "invalid task version",
      {
        kind: "task",
        id: "orders.send",
        source,
        taskId: "orders.send",
        version: "",
        execution: "durable",
      },
      "requires a version",
    ],
    [
      "invalid task execution",
      {
        kind: "task",
        id: "orders.send",
        source,
        taskId: "orders.send",
        version: "1",
        execution: "inline",
      },
      "execution is invalid",
    ],
    [
      "invalid job name",
      {
        kind: "job",
        id: "orders.job",
        source,
        executionModel: "task",
        name: "",
        jobId: "orders.job",
        taskId: "orders.send",
        taskVersion: "1",
        profile: "default",
        implicit: false,
        default: true,
      },
      ".name is invalid",
    ],
    [
      "invalid job flags",
      {
        kind: "job",
        id: "orders.job",
        source,
        executionModel: "task",
        name: "send",
        jobId: "orders.job",
        taskId: "orders.send",
        taskVersion: "1",
        profile: "default",
        implicit: "no",
        default: true,
      },
      "binding flags",
    ],
    [
      "invalid execution model",
      { kind: "job", id: "orders.job", source, executionModel: "unknown" },
      "executionModel",
    ],
    [
      "invalid agent tool",
      { kind: "agent", id: "orders.agent", source, toolIds: ["bad/id"], generatedFunction: null },
      ".toolIds[0]",
    ],
    [
      "invalid agent bucket",
      {
        kind: "agent",
        id: "orders.agent",
        source,
        toolIds: [],
        generatedFunction: null,
        backendBucketId: "bad/id",
      },
      ".backendBucketId",
    ],
    ["legacy app metadata", appNode({ providerBindings: [] }), "legacy provider data"],
    [
      "invalid middleware",
      { kind: "middleware", id: "orders.auth", source, path: 4, order: 0 },
      "middleware metadata",
    ],
    [
      "invalid hook phase",
      {
        kind: "hook",
        id: "orders.hook",
        source,
        ownerId: "orders.send",
        ownerKind: "task",
        phase: "before",
      },
      ".phase",
    ],
    [
      "invalid hook owner",
      {
        kind: "hook",
        id: "orders.hook",
        source,
        ownerId: "orders.send",
        ownerKind: "agent",
        phase: "before",
      },
      ".ownerKind",
    ],
  ])("rejects %s", (_label, node, expected) => {
    expect(validationMessage(graph([node]))).toContain(expected);
  });
});
