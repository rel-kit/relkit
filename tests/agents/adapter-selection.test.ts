/** The compiler and generated server load an agent adapter's runtime only for agents that select it. */
import { expect, test } from "bun:test";

test("the generated server imports the AI SDK runtime only for agents that select it", async () => {
  const { serverAgentSource } =
    await import("../../packages/cli/src/commands/build-server-agents.ts");
  const agent = (runtime?: { integrationId: string; adapterId: string }) =>
    ({ kind: "agent", id: "a", ...(runtime === undefined ? {} : { runtime }) }) as never;
  const langchainOnly = serverAgentSource({
    nodes: [agent({ integrationId: "langchain", adapterId: "langchain" })],
  } as never);
  expect(langchainOnly.imports).toContain("@relkit/langchain/runtime");
  expect(langchainOnly.imports).not.toContain("ai-sdk");
  const mixed = serverAgentSource({
    nodes: [agent({ integrationId: "ai-sdk", adapterId: "ai-sdk" })],
  } as never);
  expect(mixed.imports).toContain("@relkit/ai-sdk/runtime");
  expect(mixed.imports).not.toContain("@relkit/langchain/runtime");
});

test("runtime requirements select the AI SDK integration only for its agents", async () => {
  const { graphIntegrationRequirements } =
    await import("../../packages/cli/src/compiler/runtime-integration-requirements.ts");
  const graph = (integrationId: string) => ({
    nodes: [{ kind: "agent", id: "a", runtime: { integrationId, adapterId: integrationId } }],
    edges: [],
  });
  expect(
    graphIntegrationRequirements(graph("langchain")).map((entry) => entry.integrationId),
  ).toEqual(["langchain"]);
  expect(graphIntegrationRequirements(graph("ai-sdk")).map((entry) => entry.integrationId)).toEqual(
    ["ai-sdk"],
  );
});
