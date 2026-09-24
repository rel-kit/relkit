import { describe, expect, test } from "vitest";
import { GRAPH_VERSION } from "@relkit/contracts";
import { validateGraphShape } from "../src/graph-validation.js";
import { graphId, isTaskBackedJob } from "../src/graph-ids.js";

const source = { file: "src/orders/tasks/send.task.ts", line: 1, column: 1 } as const;

describe("task and job graph contracts", () => {
  test("validates task-backed jobs, task hooks, and target edges", () => {
    const graph = {
      contractVersion: GRAPH_VERSION,
      nodes: [
        {
          kind: "task",
          id: "task.orders.send",
          source,
          taskId: "orders.send",
          version: "1",
          execution: "durable",
          input: {},
          output: {},
        },
        {
          kind: "job",
          id: "job.orders.send",
          source,
          executionModel: "task",
          name: "sendEmail",
          jobId: "orders.send",
          taskId: "orders.send",
          taskVersion: "1",
          profile: "default",
          implicit: true,
          default: true,
          input: {},
        },
        {
          kind: "hook",
          id: "task.orders.send.start",
          source,
          ownerId: "task.orders.send",
          ownerKind: "task",
          phase: "start",
        },
      ],
      edges: [
        { kind: "targets-task", from: "job.orders.send", to: "task.orders.send", role: "primary" },
        {
          kind: "uses-hook",
          from: "task.orders.send",
          to: "task.orders.send.start",
          phase: "start",
        },
      ],
    };
    expect(() => validateGraphShape(graph)).not.toThrow();
  });

  test("keeps legacy IDs raw and task-backed IDs graph-only", () => {
    expect(graphId("task", "orders.send")).toBe("task.orders.send");
    expect(graphId("job", "orders.send", { taskBackedJob: true })).toBe("job.orders.send");
    expect(graphId("job", "orders.legacy")).toBe("orders.legacy");
    expect(isTaskBackedJob({ task: { ref: { kind: "task", id: "orders.send" } } })).toBe(true);
  });

  test("requires hook edges to match their hook owner and phase", () => {
    const graph = {
      contractVersion: GRAPH_VERSION,
      nodes: [
        {
          kind: "task",
          id: "task.orders.send",
          source,
          taskId: "orders.send",
          version: "1",
          execution: "durable",
          input: {},
          output: {},
        },
        {
          kind: "hook",
          id: "task.orders.send.start",
          source,
          ownerId: "task.orders.send",
          ownerKind: "task",
          phase: "start",
        },
      ],
      edges: [
        {
          kind: "uses-hook",
          from: "task.orders.send",
          to: "task.orders.send.start",
          phase: "success",
        },
      ],
    };

    expect(() => validateGraphShape(graph)).toThrow("phase does not match");
  });
});
