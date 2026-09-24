import { GRAPH_VERSION } from "@relkit/contracts";
import type { ApplicationGraph, GraphNode } from "../src/index.js";
export const source = { file: "src/app.ts", line: 1, column: 1 } as const;
export function graph(
  nodes: readonly unknown[] = [],
  edges: readonly unknown[] = [],
): ApplicationGraph {
  return {
    contractVersion: GRAPH_VERSION,
    appId: "orders",
    nodes: nodes as readonly GraphNode[],
    edges: edges as ApplicationGraph["edges"],
  };
}
export function functionNode(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "function",
    id: "orders.create",
    source,
    invocationMode: "callable",
    input: {},
    output: {},
    ...overrides,
  };
}
export function appNode(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { kind: "app", id: "orders", source, ...overrides };
}
export function providerNode(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "provider",
    id: "provider.cache.default",
    source,
    capability: "cache",
    profile: "default",
    adapter: {
      integrationId: "redis",
      adapterId: "redis",
      protocolVersion: 1,
      behavior: {},
      connectionContract: {},
      connection: {},
      features: [],
    },
    providerSource: { kind: "connected" },
    namedValues: [],
    deploymentRoles: [],
    ...overrides,
  };
}
export function serviceNode(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "service",
    id: "orders.service",
    source,
    functions: [{ name: "create", functionId: "orders.create" }],
    events: [],
    ...overrides,
  };
}
export function httpTrigger(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
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
    ...overrides,
  };
}
