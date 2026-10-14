/** Verifies optional generated agent wiring uses the declared native bucket and stays absent when no agent is declared. */
import { expect, test } from "bun:test";
import { GRAPH_VERSION, type RuntimeActivationFingerprint } from "@relkit/contracts";
import { serverSource } from "./src/commands/build-server.ts";

const graphHash = "sha256:deepagent-bucket";
const activation: RuntimeActivationFingerprint = {
  graphHash,
  manifestHash: "sha256:manifest",
  runtimeIntegrationsPlanHash: "sha256:integrations",
};

test("generated agents receive only their declared bucket dependency", () => {
  const source = serverSource(
    {
      contractVersion: GRAPH_VERSION,
      nodes: [
        {
          kind: "agent",
          id: "agent.consumer",
          profile: "default",
          source: { file: "src/services/agent/agents/consumer.agent.ts", line: 1, column: 1 },
          input: {},
          output: {},
          instructions: [],
          toolIds: [],
          limits: {},
          generatedFunction: {
            id: "relkit.agent.agent.consumer.invoke",
            generated: true,
            generatedBy: "agent",
            agentId: "agent.consumer",
          },
          backendBucketId: "agent.workspace",
        },
        {
          kind: "bucket",
          id: "agent.workspace",
          source: { file: "src/services/agent/buckets/workspace.bucket.ts", line: 1, column: 1 },
          profile: "default",
          visibility: "private",
        },
      ],
      edges: [],
    },
    graphHash,
    activation,
  );

  expect(source).toContain("targets: { ...runtimeManifest.targets }");
  expect(source).toContain("dependencies: { buckets: { backend: agent.backend } }");
  expect(source).toContain("{ bucketBackend: context.buckets.backend }");
  expect(source).not.toContain("context.cache.backend");
});
