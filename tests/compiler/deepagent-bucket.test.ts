import { describe, expect, test } from "bun:test";
import { defineAgent } from "../../packages/agents/src/index.ts";
import { defineBucket } from "../../packages/buckets/src/index.ts";
import { defineCache } from "../../packages/cache/src/index.ts";
import { normalizeCompilation } from "../../packages/compiler/src/index.ts";
import { z } from "../../packages/schema/src/index.ts";

const limits = { maxSteps: 2, maxToolCalls: 1, timeoutMs: 1_000 };

describe("DeepAgents bucket compilation", () => {
  test("declares the bucket on the agent and its generated function", () => {
    const workspace = defineBucket({ id: "agent.workspace", visibility: "private" });
    const agent = defineAgent({
      id: "research.agent",
      input: z.string(),
      output: z.string(),
      instructions: "Research safely.",
      tools: [],
      limits,
      backend: workspace,
    });

    const result = normalizeCompilation({ descriptors: [workspace, agent] });
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
  });

  test("rejects a RELKIT cache descriptor as a filesystem backend", () => {
    const cache = defineCache({
      id: "agent.cache",
      key: z.string(),
      value: z.string(),
    });
    const agent = defineAgent({
      id: "bad.agent",
      input: z.string(),
      output: z.string(),
      instructions: "Fail compilation.",
      tools: [],
      limits,
      backend: cache,
    });

    const result = normalizeCompilation({ descriptors: [cache, agent] });

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: "error",
        message: "Agent backend descriptor must resolve to a bucket.",
      }),
    );
  });
});
