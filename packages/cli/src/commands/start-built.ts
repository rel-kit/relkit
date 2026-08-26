import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CONTRACT_VERSION,
  GENERATOR_VERSION,
  GRAPH_VERSION,
  MANIFEST_VERSION,
} from "@zsys/contracts";
import { assertProductionGraph, hashGraph, type ApplicationGraph } from "@zsys/graph";

export interface BuiltManifest {
  readonly contractVersion: number;
  readonly generatorVersion: number;
  readonly graphVersion: number;
  readonly manifestVersion: number;
  readonly graphHash: string;
  readonly entrypoint: string;
  readonly containerEntrypoint: string;
  readonly runtimeManifestFile: string;
  readonly server?: { readonly port?: number };
}

export async function readBuilt(
  buildDirectory: string,
): Promise<{ readonly graphHash: string; readonly manifest: BuiltManifest }> {
  const graph = JSON.parse(
    await readFile(join(buildDirectory, "application.graph.json"), "utf8"),
  ) as ApplicationGraph;
  assertProductionGraph(graph);
  const manifest = JSON.parse(
    await readFile(join(buildDirectory, "manifest.json"), "utf8"),
  ) as BuiltManifest;
  if (
    graph.contractVersion !== GRAPH_VERSION ||
    manifest.contractVersion !== CONTRACT_VERSION ||
    manifest.graphVersion !== GRAPH_VERSION ||
    manifest.manifestVersion !== MANIFEST_VERSION ||
    manifest.generatorVersion !== GENERATOR_VERSION
  ) {
    throw new Error("Built graph or manifest version is unsupported.");
  }
  const graphHash = hashGraph(graph);
  if (manifest.graphHash !== graphHash) {
    throw new Error("Built graph and manifest hashes do not match.");
  }
  if (
    manifest.entrypoint !== "server/index.ts" ||
    manifest.containerEntrypoint !== "server/index.js" ||
    manifest.runtimeManifestFile !== "server/runtime.manifest.ts"
  ) {
    throw new Error("Built manifest paths are invalid.");
  }
  await access(join(buildDirectory, manifest.entrypoint));
  await access(join(buildDirectory, manifest.containerEntrypoint));
  const runtimeManifest = await readFile(
    join(buildDirectory, manifest.runtimeManifestFile),
    "utf8",
  );
  if (!runtimeManifest.includes(`manifestGraphHash = ${JSON.stringify(graphHash)}`)) {
    throw new Error("Built runtime manifest hash does not match the graph.");
  }
  return { graphHash, manifest };
}
