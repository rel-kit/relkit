/** Retains original bucket assertions for deepagent-bucket, registered by the owning suite. */
import { defineAgent } from "relkit/agents";
import { langchain } from "../../integrations/packages/langchain/src/index.ts";
import { nativeAgentRuntimePackages } from "./native-agent-runtime.fixture.js";
import { expect } from "bun:test";
import { defineBucket } from "relkit/buckets";
import { defineCache } from "relkit/cache";
import { normalizeCompilation } from "../../packages/cli/src/compiler/index.ts";
import { z } from "relkit/schema";
import { limits } from "./deepagent-bucket.fixture.js";
export function case1Bucket() {
  const workspace = defineBucket({ id: "agent.workspace", visibility: "private" });
  const agent = defineAgent({
    id: "research.agent",
    runtime: langchain({ backend: workspace }),
    input: z.string(),
    output: z.string(),
    instructions: "Research safely.",
    tools: [],
    limits,
  });

  const result = normalizeCompilation({
    runtimeIntegrationPackages: nativeAgentRuntimePackages,
    descriptors: [workspace, agent],
  });
  const agentNode = result.graph?.nodes.find((node) => node.id === agent.id);
  const functionId = `relkit.agent.${agent.id}.invoke`;
  const generated = result.graph?.nodes.find((node) => node.id === functionId);

  expect(result.diagnostics).toEqual([]);
  expect(agentNode).toMatchObject({
    kind: "agent",
    backendBucketId: workspace.id,
  });
  expect(generated).toMatchObject({
    kind: "function",
    dependencies: { buckets: { backend: { ref: { kind: "bucket", id: workspace.id } } } },
  });
  expect(result.graph?.edges).toContainEqual({
    kind: "uses-bucket",
    from: agent.id,
    to: workspace.id,
  });
  expect(result.graph?.edges).toContainEqual({
    kind: "uses-bucket",
    from: functionId,
    to: workspace.id,
  });
}

export function case2Bucket() {
  const cache = defineCache({
    id: "agent.cache",
    key: z.string(),
    value: z.string(),
  });
  const agent = defineAgent({
    id: "bad.agent",
    runtime: langchain({ backend: cache }),
    input: z.string(),
    output: z.string(),
    instructions: "Fail compilation.",
    tools: [],
    limits,
  });

  const result = normalizeCompilation({
    runtimeIntegrationPackages: nativeAgentRuntimePackages,
    descriptors: [cache, agent],
  });

  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({
      severity: "error",
      message: "Agent backend descriptor must resolve to a bucket.",
    }),
  );
}
