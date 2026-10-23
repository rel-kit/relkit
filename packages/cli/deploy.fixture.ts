/** Supplies the selected deployment engine and test-owned stack, planning and reporting adapters. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DeploymentPlan } from "@relkit/deploy";
import * as pulumi from "@relkit/deploy-pulumi";
import { GRAPH_VERSION } from "@relkit/contracts";
import { hashGraph, type ApplicationGraph } from "@relkit/graph";
import { loadConfig } from "@relkit/compiler";
import { emptyCheckOutputs } from "./src/commands/check-support.js";
import type { CheckResult } from "./src/commands/check.js";
import type { DeployCommandOptions } from "./src/commands/deploy-support.types.js";

const fixtureGraph = JSON.parse(
  await readFile(
    join(process.cwd(), "tests/compiler/fixtures/valid-minimal/expected.graph.json"),
    "utf8",
  ),
) as ApplicationGraph;
const graph: ApplicationGraph = {
  ...fixtureGraph,
  contractVersion: GRAPH_VERSION,
  nodes: fixtureGraph.nodes.map((node) =>
    node.kind === "app"
      ? {
          ...node,
          deploymentRoles: [
            { role: "engine", integrationId: "pulumi", protocolVersion: 1, configuration: {} },
            { role: "host", integrationId: "aws", protocolVersion: 1, configuration: {} },
          ],
        }
      : node,
  ),
};
const graphHash = hashGraph(graph);

/** Keeps program/workspace authority observable while selecting the real engine namespace. */
export function fakes(root: string, state: ReturnType<typeof fakeState>): DeployCommandOptions {
  return {
    loadIntegrations: async () => fakeIntegrations(),
    check: async () => fakeCheck(root),
    build: async () => ({
      ok: true,
      projectRoot: root,
      buildDirectory: join(root, ".relkit", "build"),
      diagnostics: [],
      artifacts: [],
      graphHash,
    }),
    writeProgram: async (plan: DeploymentPlan) => {
      state.plan = plan;
      return {
        directory: join(root, ".relkit", "generated", "pulumi"),
        projectName: "minimal-app",
        stackName: "development",
        pulumiYaml: "",
        indexTs: "",
        planJson: "{}\n",
      };
    },
    createWorkspace: async (workspaceOptions: unknown) => {
      state.workspaceOptions = workspaceOptions;
      return {
        workspace: {},
        stack: state.stack,
        projectName: "minimal-app",
        stackName: "development",
        workDir: root,
        backend: { kind: "local", url: "file:///tmp/pulumi" },
      } as never;
    },
  };
}

function fakeIntegrations() {
  const selected = (role: "engine" | "host", integrationId: string) => {
    const metadata = {
      kind: "deployment-integration" as const,
      protocolVersion: 1 as const,
      integrationId,
      role,
    };
    return {
      metadata,
      packageName: `@relkit/${integrationId}`,
      packageVersion: "0.1.0",
      exportName: role === "engine" ? "./engine" : "./host",
      resolvedPath: `/test/${integrationId}/${role}.js`,
      module: { ...(role === "engine" ? pulumi : {}), deploymentIntegration: metadata },
    };
  };
  return {
    engine: selected("engine", "pulumi"),
    host: selected("host", "aws"),
    infrastructure: new Map(),
    access: new Map(),
  };
}

/** Records every native stack mutation without creating a Pulumi workspace. */
export function fakeState(changeSummary: Record<string, number>) {
  const calls: string[] = [];
  const stack = {
    preview: async () => {
      calls.push("preview");
      return { stdout: "", stderr: "", changeSummary };
    },
    up: async () => {
      calls.push("up");
      return { stdout: "", stderr: "", outputs: {}, summary: { resourceChanges: changeSummary } };
    },
    previewDestroy: async () => {
      calls.push("previewDestroy");
      return { stdout: "", stderr: "", changeSummary };
    },
    destroy: async () => {
      calls.push("destroy");
      return { stdout: "", stderr: "", summary: { resourceChanges: changeSummary } };
    },
    refresh: async () => {
      calls.push("refresh");
      return { stdout: "", stderr: "", summary: { resourceChanges: changeSummary } };
    },
    outputs: async () => ({}),
  };
  return {
    calls,
    stack,
    workspaceOptions: undefined as unknown,
    plan: undefined as DeploymentPlan | undefined,
  };
}

/** Captures reports so private config and output values can be checked. */
export function capture() {
  const outputs: unknown[] = [];
  return {
    outputs,
    context: {
      json: true,
      reporter: {
        output: (value: unknown) => outputs.push(value),
        error: (code: string, message: string) =>
          outputs.push({ ok: false, error: { code, message } }),
      },
    },
  };
}

/** Returns the retained checked graph and HTTP settings supplied to deployment planning. */
function fakeCheck(root: string): CheckResult {
  return {
    ok: true,
    activatable: true,
    projectRoot: root,
    generatedDirectory: join(root, ".relkit", "generated"),
    graphHash,
    diagnostics: [],
    outputs: {
      ...emptyCheckOutputs([]),
      graph: JSON.stringify(graph),
      manifest: "manifest",
      diagnostics: "[]",
      openapi: "",
      client: "",
    },
    config: loadConfig({ server: { port: 4321 } }, root),
  };
}
