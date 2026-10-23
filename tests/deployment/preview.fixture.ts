/** Supplies the deployment graph, selected integration stubs, JSON captures and bounded cleanup for isolated preview phases. */
import { expect } from "bun:test";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { createPulumiWorkspace } from "../../packages/deploy-pulumi/src/workspace.ts";
import * as pulumiImplementation from "../../packages/deploy-pulumi/src/index.ts";
import { hashGraph, type ApplicationGraph } from "../../packages/graph/src/index.ts";
import type { PreviewState } from "./preview-command.ts";
const fixtureGraph = JSON.parse(
  await readFile(
    join(import.meta.dir, "../compiler/fixtures/valid-minimal/expected.graph.json"),
    "utf8",
  ),
) as ApplicationGraph;
const graph: ApplicationGraph = {
  ...fixtureGraph,
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

/** @param root - Owned temporary project. @param state - Shared command observations. @returns The original check/build/integration/workspace substitutions for deployment preview. */
export function options(root: string, state: PreviewState) {
  return {
    loadIntegrations: async () => fakeIntegrations(),
    check: async () => ({
      ok: true,
      activatable: true,
      projectRoot: root,
      generatedDirectory: join(root, ".relkit", "generated"),
      graphHash: hashGraph(graph),
      diagnostics: [],
      outputs: {
        graph: JSON.stringify(graph),
        manifest: "",
        diagnostics: "[]",
        openapi: "",
        client: "",
      },
    }),
    build: async () => ({
      ok: true,
      projectRoot: root,
      buildDirectory: join(root, ".relkit", "build"),
      diagnostics: [],
      artifacts: [],
      graphHash: hashGraph(graph),
    }),
    createWorkspace: async (workspaceOptions: Parameters<typeof createPulumiWorkspace>[0]) => {
      state.backendKinds.push(workspaceOptions.backend?.kind ?? "cloud");
      return createPulumiWorkspace({ ...workspaceOptions, pulumiCommand: state.command });
    },
  };
}

/** @returns The unchanged selected Pulumi engine/AWS host metadata and implementation fixture. */
export function fakeIntegrations() {
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
      module: {
        ...(role === "engine" ? pulumiImplementation : {}),
        deploymentIntegration: metadata,
      },
    };
  };
  return {
    engine: selected("engine", "pulumi"),
    host: selected("host", "aws"),
    infrastructure: new Map(),
    access: new Map(),
  };
}

/** @returns Original JSON reporter and log captures used for secret-redaction assertions. */
export function capture() {
  const outputs: unknown[] = [];
  const logs: unknown[] = [];
  return {
    outputs,
    logs,
    context: {
      json: true,
      reporter: {
        output: (value: unknown) => outputs.push(value),
        error: (code: string, message: string) => outputs.push({ code, message }),
      },
      log: (level: string, message: string, fields: unknown) =>
        logs.push({ level, message, fields }),
    },
  };
}

/** @param value - Original reporter output. @param create - Expected create count. @param secret - Synthetic secret forbidden in logs. @param same - Expected no-op count. @returns After the unchanged summary/redaction assertions. */
export function assertPreview(value: unknown, create: number, secret: string, same = 0): void {
  const report = (
    value as {
      report: {
        summary: {
          resourceChanges: Record<string, number>;
          diagnostics: { error: number };
        };
        logs: readonly unknown[];
      };
    }
  ).report;
  expect(report.summary.resourceChanges.create ?? 0).toBe(create);
  expect(report.summary.resourceChanges.same ?? 0).toBe(same);
  expect(report.summary.diagnostics.error).toBe(1);
  expect(JSON.stringify(report.logs)).not.toContain(secret);
}

/** @param path - Owned temporary root. @returns After cleanup finishes within the original two-second bound. */
export async function boundedRemove(path: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      rm(path, { recursive: true, force: true }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`cleanup timed out for ${path}`)), 2_000);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
