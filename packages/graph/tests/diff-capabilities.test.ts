import { describe, expect, test } from "vitest";
import { GRAPH_VERSION, type JsonValue } from "@relkit/contracts";
import { diffGraph, type ApplicationGraph } from "../src/index.js";
const source = { file: "src/functions.ts", line: 1, column: 1 } as const;
describe("graph capability compatibility", () => {
  test("classifies the remaining capability families", () => {
    const before: ApplicationGraph = {
      contractVersion: GRAPH_VERSION,
      nodes: [
        {
          kind: "trigger",
          id: "orders.route",
          source,
          triggerType: "http",
          targetFunctionId: "orders.create",
          config: {
            method: "GET",
            path: "/orders",
            request: {},
            responses: [],
            middleware: [],
            transforms: [],
          },
        },
        {
          kind: "job",
          id: "orders.job",
          source,
          input: {},
          targetFunctionId: "orders.create",
          profile: "default",
          retry: { maxAttempts: 1 },
        },
        { kind: "bucket", id: "orders.bucket", source, profile: "default", visibility: "private" },
        { kind: "cache", id: "orders.cache", source, key: {}, value: {}, profile: "default" },
        {
          kind: "tool",
          id: "orders.tool",
          source,
          targetFunctionId: "orders.create",
          description: "read",
          sideEffect: "read",
          approval: "never",
          mcp: false,
        },
        {
          kind: "agent",
          id: "orders.agent",
          source,
          input: {},
          output: {},
          model: "default",
          instructions: "help",
          toolIds: [],
          limits: { maxSteps: 1 },
          profile: "default",
          generatedFunction: {
            generated: true,
            generatedBy: "agent",
            agentId: "orders.agent",
            functionId: "orders.agent.fn",
          },
        },
        {
          kind: "provider",
          id: "provider.job.default",
          source,
          profile: "default",
          capability: "job",
          adapter: {
            integrationId: "aws",
            adapterId: "sqs",
            protocolVersion: 1,
            behavior: {},
            connectionContract: {},
            connection: {},
            features: [],
          },
          providerSource: { kind: "connected" },
          namedValues: [],
          deploymentRoles: [],
        },
      ],
      edges: [],
    };
    const after: ApplicationGraph = {
      ...before,
      nodes: before.nodes.map((node) => {
        if (node.kind === "trigger")
          return {
            ...node,
            config: { ...(node.config as Record<string, JsonValue>), path: "/orders/:id" },
          };
        if (node.kind === "job") return { ...node, retry: { maxAttempts: 2 } };
        if (node.kind === "bucket") return { ...node, profile: "archive" };
        if (node.kind === "cache") return { ...node, profile: "archive" };
        if (node.kind === "tool") return { ...node, approval: "always" as const };
        if (node.kind === "agent") return { ...node, model: "fast" };
        if (node.kind === "provider")
          return { ...node, adapter: { ...node.adapter, adapterId: "memory" } };
        return node;
      }),
    };
    const result = diffGraph(before, after);
    expect(result.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "route", classification: "breaking" }),
        expect.objectContaining({ category: "job", classification: "potentially-breaking" }),
        expect.objectContaining({
          category: "bucket/cache",
          id: "orders.bucket",
          classification: "potentially-breaking",
        }),
        expect.objectContaining({
          category: "bucket/cache",
          id: "orders.cache",
          classification: "potentially-breaking",
        }),
        expect.objectContaining({ category: "tool", classification: "potentially-breaking" }),
        expect.objectContaining({ category: "agent", classification: "potentially-breaking" }),
        expect.objectContaining({ category: "profile", classification: "potentially-breaking" }),
      ]),
    );
  });
});
