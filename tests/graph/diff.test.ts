import { describe, expect, test } from "bun:test";
import { diffGraph, type ApplicationGraph } from "../../packages/graph/src/index.ts";

const source = { file: "src/functions.ts", line: 1, column: 1 } as const;

function baseGraph(): ApplicationGraph {
  return {
    contractVersion: 3,
    appId: "orders",
    nodes: [
      {
        kind: "function",
        invocationMode: "callable",
        id: "orders.create",
        source,
        input: { type: "object", required: ["id"] },
        output: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
      },
      {
        kind: "trigger",
        id: "orders.listener",
        source,
        triggerType: "event",
        targetFunctionId: "orders.create",
        config: {
          eventId: "orders.created",
          eventVersion: 1,
          delivery: "durable",
        },
      },
    ],
    edges: [],
  };
}

describe("graph compatibility diff", () => {
  test("reports source moves as informational and output removal as breaking", () => {
    const before = baseGraph();
    const moved = { ...before.nodes[0]!, source: { ...source, file: "src/orders.ts" } };
    const after: ApplicationGraph = {
      ...before,
      nodes: [moved, { ...before.nodes[1]!, source: { ...source, file: "src/orders.ts" } }],
    };
    const movedDiff = diffGraph(before, after);
    expect(movedDiff.changes.every((change) => change.classification === "informational")).toBe(
      true,
    );
    expect(movedDiff.hasBreakingChanges).toBe(false);
    expect(movedDiff.changes.map(({ change }) => change)).toEqual(["source-moved", "source-moved"]);

    const breaking: ApplicationGraph = {
      ...before,
      nodes: [
        {
          ...before.nodes[0]!,
          output: { type: "object", properties: {}, required: [] },
        },
        before.nodes[1]!,
      ],
    };
    const result = diffGraph(before, breaking);
    expect(result.changes).toContainEqual(
      expect.objectContaining({
        id: "orders.create",
        category: "function/error",
        classification: "breaking",
      }),
    );
  });

  test("classifies exact event contract changes as breaking", () => {
    const before = baseGraph();
    const listener = before.nodes[1]!;
    const after: ApplicationGraph = {
      ...before,
      nodes: [
        before.nodes[0]!,
        {
          ...listener,
          config: {
            ...(listener as { config: Record<string, unknown> }).config,
            eventId: "orders.updated",
          },
        },
      ],
    };
    const result = diffGraph(before, after);
    expect(result.changes).toContainEqual(
      expect.objectContaining({
        category: "event",
        fields: ["config"],
        classification: "breaking",
      }),
    );
  });

  test("uses compatible additions and breaking removals", () => {
    const before = baseGraph();
    const addition = {
      kind: "event" as const,
      id: "orders.updated",
      source,
      version: 1,
      payload: { type: "object" },
    };
    const added = diffGraph(before, { ...before, nodes: [...before.nodes, addition] });
    expect(added.changes).toContainEqual(
      expect.objectContaining({ id: "orders.updated", classification: "compatible" }),
    );
    const removed = diffGraph({ ...before, nodes: [...before.nodes, addition] }, before);
    expect(removed.changes).toContainEqual(
      expect.objectContaining({ id: "orders.updated", classification: "breaking" }),
    );
  });

  test("classifies service membership and policy changes", () => {
    const service = {
      kind: "service" as const,
      id: "orders",
      domainId: "orders",
      source,
      title: "Orders",
      functions: [{ name: "create", functionId: "orders.create" }],
      events: [],
    };
    const before: ApplicationGraph = { contractVersion: 3, nodes: [service], edges: [] };
    const metadata = diffGraph(before, {
      ...before,
      nodes: [{ ...service, title: "Order service" }],
    });
    expect(metadata.changes[0]).toMatchObject({
      category: "service",
      classification: "compatible",
    });
    const membership = diffGraph(before, {
      ...before,
      nodes: [
        {
          ...service,
          functions: [...service.functions, { name: "save", functionId: "orders.save" }],
        },
      ],
    });
    expect(membership.changes[0]).toMatchObject({
      category: "service",
      classification: "breaking",
    });
  });

  test("classifies the remaining capability families", () => {
    const before: ApplicationGraph = {
      contractVersion: 3,
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
          return { ...node, config: { ...node.config, path: "/orders/:id" } };
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
