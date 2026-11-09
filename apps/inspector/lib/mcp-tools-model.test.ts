import { expect, test } from "bun:test";
import type { InspectorGraph } from "./api-types";
import { callableWithoutApproval, mcpToolViews } from "./mcp-tools-model";

const graph = {
  protocol: "relkit.inspector",
  version: 1,
  nodes: [
    { kind: "function", id: "orders.get", input: { type: "object" } },
    {
      kind: "tool",
      id: "orders.get.tool",
      targetFunctionId: "orders.get",
      description: "Read one order",
      sideEffect: "read",
      approval: "never",
      mcp: true,
    },
    { kind: "tool", id: "orders.hidden", targetFunctionId: "orders.get", mcp: false },
    {
      kind: "tool",
      id: "email.send",
      targetFunctionId: "email.send",
      sideEffect: "external",
      approval: "always",
      mcp: true,
    },
  ],
} as unknown as InspectorGraph;

test("lists only MCP-exposed tools with their target function's schema", () => {
  const tools = mcpToolViews(graph);
  expect(tools.map((tool) => tool.id)).toEqual(["email.send", "orders.get.tool"]);
  expect(tools[1]).toMatchObject({ targetFunctionId: "orders.get", input: { type: "object" } });
});

test("a tool that needs approval cannot be called from the page", () => {
  const [email, orders] = mcpToolViews(graph);
  expect(callableWithoutApproval(orders!)).toBe(true);
  expect(callableWithoutApproval(email!)).toBe(false);
});
