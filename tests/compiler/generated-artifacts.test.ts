import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createGeneratedOutputExtension,
  GENERATED_ARTIFACT_FILES,
  GENERATED_EXTENSION_VERSIONS,
  invalidateWatchDependencies,
  writeGeneratedArtifacts,
  createWatchDependencyIndex,
  type GeneratedOutputs,
} from "../../packages/compiler/src/index.ts";

const outputs: GeneratedOutputs = {
  graph: '{"contractVersion":1}\n',
  manifest: 'export const manifestGraphHash = "sha256:test";\n',
  diagnostics: "[]\n",
  openapi: "",
  client: "",
  contract: "export const contract = {};\n",
  clientContract: '{"protocol":"relkit.client-contract"}\n',
};

function descriptor(id: string, file: string, value: Record<string, unknown> = {}) {
  return {
    kind: "function",
    id,
    source: { file, line: 1, column: 1 },
    exportName: id,
    exportKind: "named" as const,
    value: { kind: "function", id, ...value },
  };
}

describe("compiler generated artifacts", () => {
  test("writes core bytes once and preserves unchanged modification state", async () => {
    const directory = await mkdtemp(join(tmpdir(), "relkit-artifacts-"));
    try {
      const first = await writeGeneratedArtifacts(outputs, { directory });
      expect(first.changed).toBe(true);
      expect(first.writes.map(({ fileName }) => fileName)).toEqual([
        GENERATED_ARTIFACT_FILES.graph,
        GENERATED_ARTIFACT_FILES.clientContract,
        GENERATED_ARTIFACT_FILES.contract,
        GENERATED_ARTIFACT_FILES.diagnostics,
        GENERATED_ARTIFACT_FILES.manifest,
      ]);
      const before = await stat(join(directory, GENERATED_ARTIFACT_FILES.graph));
      const second = await writeGeneratedArtifacts(outputs, { directory });
      const after = await stat(join(directory, GENERATED_ARTIFACT_FILES.graph));
      expect(second.writes.every(({ changed }) => !changed)).toBe(true);
      expect(after.mtimeNs).toBe(before.mtimeNs);
      expect(await readFile(join(directory, GENERATED_ARTIFACT_FILES.graph), "utf8")).toBe(
        outputs.graph,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("accepts only versioned future artifact extensions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "relkit-artifacts-"));
    try {
      const report = await writeGeneratedArtifacts(outputs, {
        directory,
        extensions: [
          createGeneratedOutputExtension("openapi", '{"openapi":"3.1.0"}\n'),
          createGeneratedOutputExtension("client", "export const client = true;\n"),
          createGeneratedOutputExtension("deploymentPlan", '{"graphHash":"sha256:test"}\n'),
        ],
      });
      expect(report.writes.map(({ fileName }) => fileName)).toEqual([
        "application.graph.json",
        "client-contract.json",
        "client.ts",
        "contract.ts",
        "deployment.plan.json",
        "diagnostics.json",
        "openapi.json",
        "runtime.manifest.ts",
      ]);
      expect(GENERATED_EXTENSION_VERSIONS.deploymentPlan.version).toBe(1);
      await expect(
        writeGeneratedArtifacts(outputs, {
          directory,
          extensions: [{ kind: "client", version: 2, content: "bad" }],
        }),
      ).rejects.toThrow("unsupported");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("invalidates changed descriptors and transitive dependants deterministically", () => {
    const index = createWatchDependencyIndex([
      descriptor("orders.route", "src/routes.ts", {
        target: { ref: { kind: "function", id: "orders.get" } },
      }),
      descriptor("orders.page", "src/page.ts", {
        route: { ref: { kind: "route", id: "orders.route" } },
      }),
      descriptor("orders.get", "src/functions.ts"),
      descriptor("orders.job", "src/jobs.ts", {
        target: { ref: { kind: "function", id: "orders.get" } },
      }),
    ]);

    const result = invalidateWatchDependencies(index, [".\\src\\functions.ts"]);
    expect(result.changedDescriptorIds).toEqual(["orders.get"]);
    expect(result.affectedDescriptorIds).toEqual([
      "orders.get",
      "orders.job",
      "orders.page",
      "orders.route",
    ]);
    expect(result.affectedFiles).toEqual([
      "src/functions.ts",
      "src/jobs.ts",
      "src/page.ts",
      "src/routes.ts",
    ]);
    expect(result.invalidatedArtifacts).toHaveLength(3);
    expect(invalidateWatchDependencies(index, ["src/unchanged.ts"]).affectedDescriptorIds).toEqual(
      [],
    );
  });
});
