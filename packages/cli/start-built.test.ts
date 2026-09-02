import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CONTRACT_VERSION,
  GENERATOR_VERSION,
  GRAPH_VERSION,
  MANIFEST_VERSION,
  RUNTIME_ACTIVATION_FILE,
  RUNTIME_INTEGRATION_PLAN_FILE,
  RUNTIME_INTEGRATION_PLAN_VERSION,
  canonicalJson,
} from "@relkit/contracts";
import { createRuntimeActivationFingerprint } from "@relkit/compiler";
import { hashGraph, type ApplicationGraph } from "@relkit/graph";
import { readBuilt } from "./src/commands/start-built.js";

const roots: string[] = [];

test("accepts only the current complete built artifact cohort", async () => {
  const root = await mkdtemp(join(process.cwd(), ".relkit-built-cohort-"));
  roots.push(root);
  const graph = {
    contractVersion: GRAPH_VERSION,
    appId: "cohort-test",
    nodes: [],
    edges: [],
  } satisfies ApplicationGraph;
  const graphHash = hashGraph(graph);
  const runtimeManifest = `export const manifestGraphHash = ${JSON.stringify(graphHash)} as const;\n`;
  const runtimeIntegrations = `${canonicalJson({
    version: RUNTIME_INTEGRATION_PLAN_VERSION,
    graphHash,
    integrations: [],
  })}\n`;
  const activationFingerprint = createRuntimeActivationFingerprint({
    graphHash,
    manifestSource: runtimeManifest,
    runtimeIntegrationsPlanSource: runtimeIntegrations,
  });
  const manifest = {
    contractVersion: CONTRACT_VERSION,
    generatorVersion: GENERATOR_VERSION,
    graphVersion: GRAPH_VERSION,
    manifestVersion: MANIFEST_VERSION,
    graphHash,
    activationFingerprint,
    graphFile: "application.graph.json",
    runtimeManifestFile: "server/runtime.manifest.ts",
    runtimeActivationFile: `server/${RUNTIME_ACTIVATION_FILE}`,
    runtimeIntegrationsPlanFile: `server/${RUNTIME_INTEGRATION_PLAN_FILE}`,
    entrypoint: "server/index.ts",
    containerEntrypoint: "server/index.js",
  };
  await mkdir(join(root, "server"));
  await Promise.all([
    writeFile(join(root, "application.graph.json"), `${canonicalJson(graph)}\n`),
    writeFile(join(root, "manifest.json"), `${canonicalJson(manifest)}\n`),
    writeFile(join(root, "server/index.ts"), "\n"),
    writeFile(join(root, "server/index.js"), "\n"),
    writeFile(join(root, "server/runtime.manifest.ts"), runtimeManifest),
    writeFile(
      join(root, "server", RUNTIME_ACTIVATION_FILE),
      `${canonicalJson(activationFingerprint)}\n`,
    ),
    writeFile(join(root, "server", RUNTIME_INTEGRATION_PLAN_FILE), runtimeIntegrations),
  ]);

  await expect(readBuilt(root)).resolves.toMatchObject({ graphHash });

  await writeFile(
    join(root, "server", RUNTIME_INTEGRATION_PLAN_FILE),
    `${canonicalJson({ version: 0, graphHash, integrations: [] })}\n`,
  );
  await expect(readBuilt(root)).rejects.toThrow(
    "Built runtime-integration plan version 0 is unsupported; expected 1. Rebuild with `relkit build`.",
  );

  await rm(join(root, "server", RUNTIME_INTEGRATION_PLAN_FILE));
  await expect(readBuilt(root)).rejects.toThrow(
    "Built runtime-integration plan is missing; rebuild with `relkit build`.",
  );

  await writeFile(
    join(root, "manifest.json"),
    `${canonicalJson({ ...manifest, graphVersion: GRAPH_VERSION - 1 })}\n`,
  );
  await expect(readBuilt(root)).rejects.toThrow(
    "Built graph manifest version 7 is unsupported; expected 8. Rebuild with `relkit build`.",
  );
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
