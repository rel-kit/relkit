/** Verifies generated-module loading against Bun's native imports, identity and cache behavior. */
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { GRAPH_VERSION } from "../../packages/contracts/src/index.js";
import { hashGraph } from "../../packages/graph/src/index.js";
import { loadTestApplicationArtifacts } from "../../packages/testing/src/application-registry.js";
import { runtimeCohort } from "./runtime-cohort.js";

/** Acquires ordinary fixture modules, retaining every failed source tree for diagnosis. */
async function withArtifacts(run: (root: string, directory: string) => Promise<void>) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "relkit-generated-imports-")));
  let passed = false;
  try {
    const directory = join(root, ".relkit/generated");
    await mkdir(directory, { recursive: true });
    const graph = { contractVersion: GRAPH_VERSION, nodes: [], edges: [] };
    await writeFile(join(directory, "application.graph.json"), JSON.stringify(graph));
    await writeFile(join(directory, "client-contract.json"), "{}");
    await writeFile(
      join(directory, "runtime.manifest.ts"),
      `export const runtimeManifest = ${JSON.stringify({ ...runtimeCohort(hashGraph(graph)), functions: {}, targets: {} })};`,
    );
    await writeFile(
      join(directory, "relative.ts"),
      'export const marker = "relative"; export const sentinel = new Error("owned generated failure");',
    );
    await run(root, directory);
    passed = true;
  } finally {
    if (passed) await rm(root, { recursive: true, force: true });
    else console.error("Retained failed generated import fixture", { root });
  }
}

/** Represents generated source with ordinary relative and installed package dependencies. */
function integrationSource(directory: string, generation: string): string {
  return `import type { Missing } from "missing-type-only-package";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { Database } from "bun:sqlite";
if ((await import("node:url")).fileURLToPath !== fileURLToPath) throw new Error("Changed native builtin");
if ((await import("bun:sqlite")).Database !== Database) throw new Error("Changed Bun builtin");
const relative = await import("./relative.ts");
const installed = await import("fixture-owned-generation");
if (fileURLToPath(new URL(".", import.meta.url)) !== ${JSON.stringify(`${directory}/`)}) throw new Error("Wrong native module ancestry");
if ("import.meta.url" !== ["import", "meta", "url"].join(".")) throw new Error("Changed source string");
await writeFile(new URL("./observed.txt", import.meta.url), relative.marker + "/" + installed.marker + "/" + ${JSON.stringify(generation)});
export const runtimeIntegrationModules = [];
`;
}

test("loads builtins and native relative/package imports with fresh same-path generated content", () =>
  withArtifacts(async (root, directory) => {
    const installed = join(root, "node_modules/fixture-owned-generation");
    await mkdir(installed, { recursive: true });
    await writeFile(
      join(installed, "package.json"),
      JSON.stringify({ name: "fixture-owned-generation", type: "module", exports: "./index.ts" }),
    );
    await writeFile(join(installed, "index.ts"), 'export const marker = "installed";');
    for (const generation of ["first", "second"]) {
      await writeFile(
        join(directory, "runtime-integrations.ts"),
        integrationSource(directory, generation),
      );
      expect((await loadTestApplicationArtifacts(root))?.runtimeIntegrationModules).toEqual([]);
      expect(await readFile(join(directory, "observed.txt"), "utf8")).toBe(
        `relative/installed/${generation}`,
      );
    }
  }));

test("keeps literal dynamic resolution after preceding guards and preserves the thrown cause", () =>
  withArtifacts(async (root, directory) => {
    const dependency = await import(pathToFileURL(join(directory, "relative.ts")).href);
    await writeFile(
      join(directory, "runtime-integrations.ts"),
      'import { sentinel } from "./relative.ts"; throw sentinel; export const runtimeIntegrationModules = [await import("missing-after-preflight")];',
    );
    await expect(loadTestApplicationArtifacts(root)).rejects.toBe(dependency.sentinel);
  }));

test("preserves invalid output and native missing-module errors", () =>
  withArtifacts(async (root, directory) => {
    const generated = join(directory, "runtime-integrations.ts");
    await writeFile(generated, "export const runtimeIntegrationModules = 42;");
    await expect(loadTestApplicationArtifacts(root)).rejects.toThrow(
      "Generated runtime integration modules are invalid.",
    );
    await writeFile(
      generated,
      'export const runtimeIntegrationModules = [await import("missing-owned-runtime")];',
    );
    await expect(loadTestApplicationArtifacts(root)).rejects.toMatchObject({
      name: "ResolveMessage",
      code: "ERR_MODULE_NOT_FOUND",
      message: `Cannot find package 'missing-owned-runtime' from '${directory}'`,
    });
    await rm(generated);
    expect((await loadTestApplicationArtifacts(root))?.runtimeIntegrationModules).toEqual([]);
    await rm(join(directory, "runtime.manifest.ts"));
    expect(await loadTestApplicationArtifacts(root)).toBeUndefined();
  }));
