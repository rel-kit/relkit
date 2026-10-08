import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  canonicalJson,
  CONTRACT_VERSION,
  GENERATOR_VERSION,
  GRAPH_VERSION,
  MANIFEST_VERSION,
  RUNTIME_ACTIVATION_FILE,
  RUNTIME_INTEGRATION_PLAN_FILE,
  RUNTIME_INTEGRATION_PLAN_VERSION,
} from "@relkit/contracts";
import { createRuntimeActivationFingerprint } from "@relkit/compiler";
import { hashGraph, type ApplicationGraph } from "@relkit/graph";

/**
 * Writes a complete current build cohort with a native health/shutdown process.
 * @param root - Test-owned project root.
 * @returns The selected build directory; callers own removal after child cleanup.
 */
export async function nativeStartFixture(root: string): Promise<string> {
  const directory = join(root, ".relkit/build");
  await mkdir(join(directory, "server"), { recursive: true });
  const graph = {
    contractVersion: GRAPH_VERSION,
    appId: "start-scope",
    nodes: [],
    edges: [],
  } satisfies ApplicationGraph;
  const graphHash = hashGraph(graph);
  const runtimeManifest = `export const manifestGraphHash = ${JSON.stringify(graphHash)} as const;\n`;
  const integrations = canonicalJson({
    version: RUNTIME_INTEGRATION_PLAN_VERSION,
    graphHash,
    integrations: [],
  });
  const activation = createRuntimeActivationFingerprint({
    graphHash,
    manifestSource: runtimeManifest,
    runtimeIntegrationsPlanSource: integrations,
  });
  const manifest = {
    contractVersion: CONTRACT_VERSION,
    generatorVersion: GENERATOR_VERSION,
    graphVersion: GRAPH_VERSION,
    manifestVersion: MANIFEST_VERSION,
    graphHash,
    activationFingerprint: activation,
    entrypoint: "server/index.ts",
    containerEntrypoint: "server/index.js",
    runtimeManifestFile: "server/runtime.manifest.ts",
    runtimeActivationFile: `server/${RUNTIME_ACTIVATION_FILE}`,
    runtimeIntegrationsPlanFile: `server/${RUNTIME_INTEGRATION_PLAN_FILE}`,
  };
  const source = `const server = Bun.serve({ hostname: "127.0.0.1", port: Number(process.env.PORT), fetch: () => Response.json({ ok: true }) });
process.stdout.write("owned-output");
process.stderr.write("owned-error-output");
process.on("SIGTERM", async () => { await server.stop(true); process.exit(0); });
`;
  await Promise.all([
    writeFile(join(directory, "application.graph.json"), canonicalJson(graph)),
    writeFile(join(directory, "manifest.json"), canonicalJson(manifest)),
    writeFile(join(directory, "server/index.ts"), source),
    writeFile(join(directory, "server/index.js"), source),
    writeFile(join(directory, "server/runtime.manifest.ts"), runtimeManifest),
    writeFile(join(directory, "server", RUNTIME_ACTIVATION_FILE), canonicalJson(activation)),
    writeFile(join(directory, "server", RUNTIME_INTEGRATION_PLAN_FILE), integrations),
  ]);
  return directory;
}
