/**
 * Exercises graph-selected dependency ownership before executable imports.
 * Ordinary backend graphs require no agent integration; agent/deep markers select
 * distinct registrations and only their declared requirement capabilities.
 */
import { expect, it } from "vitest";
import { generateRuntimeIntegrationPlan } from "../src/runtime-integration-plan.js";
import { generateRuntimeIntegrationImports } from "../src/runtime-integration-imports.js";
import type { RuntimeIntegrationPackage } from "../src/normalize-types.js";

const native: RuntimeIntegrationPackage = {
  integrationId: "langchain",
  packageName: "@relkit/langchain",
  packageVersion: "0.1.0",
  exportName: "./runtime",
  registrations: [
    { capability: "agent-execution", adapterId: "langchain", protocolVersion: 1 },
    { capability: "agent-deep", adapterId: "deepagents", protocolVersion: 1 },
  ],
  requirements: [
    {
      package: "langchain",
      supportedRange: "1.5.10",
      installSection: "dependencies",
      capabilities: ["agent-execution"],
      phases: ["check", "build", "runtime"],
    },
    {
      package: "deepagents",
      supportedRange: "1.13.3",
      installSection: "dependencies",
      capabilities: ["agent-deep"],
      phases: ["check", "build", "runtime"],
    },
  ],
};

it("non-agent graphs do not select installed agent metadata", () => {
  expect(
    generateRuntimeIntegrationPlan(
      { nodes: [{ id: "health", kind: "function" }], edges: [] },
      "hash",
      [native],
    ).integrations,
  ).toEqual([]);
});

it("ordinary agents require native execution without DeepAgents", () => {
  const plan = generateRuntimeIntegrationPlan(
    { nodes: [{ id: "assistant", kind: "agent" }], edges: [] },
    "hash",
    [native],
  );
  expect(plan.integrations.map((entry) => entry.capability)).toEqual(["agent-execution"]);
  expect(
    plan.integrations.flatMap((entry) => entry.requirements ?? []).map((entry) => entry.package),
  ).toEqual(["langchain"]);
});

it("deep markers select their own requirement and missing native metadata rejects", () => {
  const graph = {
    nodes: [{ id: "assistant", kind: "agent", requiresDeepAgents: true as const }],
    edges: [],
  };
  expect(
    generateRuntimeIntegrationPlan(graph, "hash", [native]).integrations.map(
      (entry) => entry.capability,
    ),
  ).toEqual(["agent-deep", "agent-execution"]);
  expect(() => generateRuntimeIntegrationPlan(graph, "hash", [])).toThrow("langchain");
});

it("preflight is emitted before statically traceable executable imports", () => {
  const plan = generateRuntimeIntegrationPlan(
    { nodes: [{ id: "assistant", kind: "agent" }], edges: [] },
    "hash",
    [native],
  );
  const source = generateRuntimeIntegrationImports(plan);
  expect(source).toContain('from "@relkit/app/internal/runtime";');
  expect(source).not.toContain('from "@relkit/provider/');
  expect(source.indexOf("checkIntegrationDependencies")).toBeLessThan(
    source.indexOf('await import("@relkit/langchain/runtime")'),
  );
  expect(source).not.toContain("import * as __relkit_runtime");
});
