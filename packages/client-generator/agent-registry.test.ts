import { expect, test } from "bun:test";
import { GRAPH_VERSION } from "@relkit/contracts";
import type { ApplicationGraph } from "@relkit/graph";
import {
  agentProcedureEntriesFromDocument,
  generateContract,
  generateClientContractDocument,
  generateClientRegistry,
  generateClientRegistryFromDocument,
  generateContractFromDocument,
} from "./src/index.ts";

test("generates a recursive union of graph continuation replies", () => {
  const graph = graphWithInterrupts();
  const expected =
    'ClientAgentContract<{ "orderId": string }, { "done": boolean }, "stop", false, boolean | { "reason": string }, { readonly kind: "tool"; readonly id: "lookup"; readonly input: { "id": string }; readonly output: { "found": boolean } }, { readonly "todos": readonly { "content": string; "status": "pending" | "completed" }[] }, { readonly kind: "custom"; readonly name: "notice"; readonly data: { "message": string } }';

  expect(generateClientRegistry(graph)).toContain(expected);

  const document = generateClientContractDocument(graph, "sha256:graph");
  const parsed = JSON.parse(document);
  expect(parsed.capabilities.agentStream).toMatchObject({
    protocol: "relkit.agent-stream",
    version: 2,
  });
  expect(parsed.agents[0].workflow).toBeDefined();
  expect(generateClientRegistryFromDocument(parsed)).toContain(expected);
  expect(
    generateContractFromDocument([], agentProcedureEntriesFromDocument(parsed.agents)),
  ).toContain('readonly agentId: "orders.review"');
  expect(generateClientRegistry(graph)).not.toContain("langchain");

  const contract = generateContract(graph);
  expect(contract).toContain('"relkit.agent.run"');
  expect(contract).toContain('readonly agentId: "orders.review"');
  expect(contract).toContain("readonly resume: true");
  expect(contract).toContain('readonly kind: "stop"');
});

function graphWithInterrupts(): ApplicationGraph {
  const workflow = {
    version: 1,
    start: "__start__",
    end: "__end__",
    nodes: [
      {
        id: "approve",
        kind: "node",
        input: { type: "object" },
        output: { type: "object" },
        resume: { type: "boolean" },
        ends: [],
      },
      {
        id: "child",
        kind: "subgraph",
        input: { type: "object" },
        output: { type: "object" },
        ends: [],
        workflow: {
          version: 1,
          start: "__start__",
          end: "__end__",
          nodes: [
            {
              id: "revise",
              kind: "node",
              input: { type: "object" },
              output: { type: "object" },
              resume: {
                type: "object",
                required: ["reason"],
                properties: { reason: { type: "string" } },
              },
              ends: [],
            },
          ],
          edges: [],
        },
      },
    ],
    edges: [],
  };
  return {
    contractVersion: GRAPH_VERSION,
    nodes: [
      {
        kind: "agent",
        id: "orders.review",
        client: "protected",
        execution: "graph",
        input: {
          type: "object",
          required: ["orderId"],
          properties: { orderId: { type: "string" } },
        },
        output: {
          type: "object",
          required: ["done"],
          properties: { done: { type: "boolean" } },
        },
        controls: ["stop"],
        workflow,
        clientContract: {
          tools: [
            {
              id: "lookup",
              input: {
                type: "object",
                required: ["id"],
                properties: { id: { type: "string" } },
              },
              output: {
                type: "object",
                required: ["found"],
                properties: { found: { type: "boolean" } },
              },
            },
          ],
          state: [
            {
              name: "todos",
              schema: {
                type: "array",
                items: {
                  type: "object",
                  required: ["content", "status"],
                  properties: {
                    content: { type: "string" },
                    status: { enum: ["pending", "completed"] },
                  },
                },
              },
            },
          ],
          events: [
            {
              name: "notice",
              schema: {
                type: "object",
                required: ["message"],
                properties: { message: { type: "string" } },
              },
            },
          ],
          scopes: [
            { kind: "agent", id: "orders.review" },
            { kind: "node", id: "approve" },
            { kind: "node", id: "child" },
            { kind: "node", id: "revise" },
          ],
          waiting: [
            { scope: { kind: "node", id: "approve" }, response: { type: "boolean" } },
            {
              scope: { kind: "node", id: "revise" },
              response: {
                type: "object",
                required: ["reason"],
                properties: { reason: { type: "string" } },
              },
            },
          ],
        },
      },
    ],
    edges: [],
  } as unknown as ApplicationGraph;
}
