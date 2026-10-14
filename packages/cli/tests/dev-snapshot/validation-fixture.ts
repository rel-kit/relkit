/**
 * Builds complete content-addressed test cohorts without importing executable
 * application code. The file Layer supplies explicit bytes and project paths;
 * tests can change either independently to model source edits and cache tampering.
 */
import { GRAPH_VERSION, APPLICATION_LAYOUT_VERSION, canonicalJson } from "@relkit/contracts";
import { hashGraph } from "@relkit/graph";
import { Layer } from "effect";
import { SnapshotFiles } from "../../src/dev-snapshot/snapshot-files.service.js";
import {
  snapshotDigest,
  snapshotFingerprint,
} from "../../src/dev-snapshot/snapshot-fingerprint.js";
import type { DevSnapshot, SnapshotTools } from "../../src/dev-snapshot/snapshot.types.js";
import type { SnapshotFileOperations } from "../../src/dev-snapshot/snapshot-files.types.js";
import { validationFileOperations } from "./validation-file-operations.js";

export const tools: SnapshotTools = {
  layout: APPLICATION_LAYOUT_VERSION,
  bun: "1.3.10",
  effect: "4.0.1",
  typescript: "5.9.3",
  relkit: "0.7.2",
  platform: "darwin-arm64",
};

/**
 * Builds portable metadata from verified test documents in a deterministic order.
 * @returns Fixture receipt, capsule documents and unchanged source content.
 */
function documents() {
  const graph = { contractVersion: GRAPH_VERSION, nodes: [], edges: [] };
  const graphHash = hashGraph(graph);
  const integrations = canonicalJson({ version: 1, graphHash, integrations: [] });
  const manifest = `export const manifestGraphHash = ${JSON.stringify(graphHash)} as const;`;
  const activation = {
    graphHash,
    manifestHash: snapshotDigest(manifest),
    runtimeIntegrationsPlanHash: snapshotDigest(integrations),
  };
  const routeImports: DevSnapshot["routeImports"] = [];
  const capsule = new Map([
    ["graph.json", canonicalJson(graph)],
    ["activation.json", canonicalJson(activation)],
    ["manifest.ts", manifest],
    ["integrations.json", integrations],
    ["server.js", "validated runnable fixture"],
    ["deferred.js", "validated deferred fixture"],
    ["imports.json", canonicalJson(routeImports)],
    ["dependencies/runtime/index.js", "dependency"],
  ]);
  const inputs = [{ path: "src/app.ts", hash: snapshotDigest("source"), bytes: 6 }];
  const dependencies = fixtureDependencies();
  const typecheckInputs = { files: inputs, observations: [] };
  const receipt: DevSnapshot = {
    version: 1,
    fingerprint: snapshotFingerprint({ tools, inputs, dependencies, typecheckInputs }),
    graphHash,
    graphFile: "graph.json",
    activationFile: "activation.json",
    manifestFile: "manifest.ts",
    runtimeIntegrationsFile: "integrations.json",
    entrypoint: "server.js",
    importIndex: "imports.json",
    activation,
    tools,
    inputs,
    typecheckInputs,
    dependencies,
    artifacts: [...capsule].map(([path, source]) => ({
      path,
      hash: snapshotDigest(source),
      bytes: Buffer.byteLength(source),
    })),
    routeImports,
    readiness: { kind: "graph", routeTableHash: snapshotDigest(canonicalJson([])) },
  };
  return { receipt, capsule };
}

/**
 * Supplies a same-version mutable dependency with known executable bytes.
 * @returns Its complete relative test member index.
 */
function fixtureDependencies() {
  return [
    {
      name: "runtime",
      version: "1.0.0",
      root: "dependencies/runtime",
      members: [{ path: "index.js", hash: snapshotDigest("dependency"), bytes: 10 }],
    },
  ];
}

/**
 * Supplies one relocatable, mutable test storage authority.
 * @param root - Physical test root; metadata and fingerprints contain none of it.
 * @param decorate - Optional controlled I/O barriers over the same complete byte authority.
 * @returns The Layer plus explicit maps/indexes for independent fault injection.
 */
export function validationFixture(
  root = "/project",
  decorate: (operations: SnapshotFileOperations) => SnapshotFileOperations = (value) => value,
) {
  const { receipt, capsule } = documents();
  const source = canonicalJson(receipt);
  const generation = snapshotDigest(source);
  const capsuleRoot = `${root}/.relkit/dev/generations/${generation.slice(7)}`;
  const bytes = new Map(
    [...capsule].map(([path, contents]) => [`${capsuleRoot}/${path}`, contents]),
  );
  bytes.set(`${capsuleRoot}/receipt.json`, source);
  bytes.set(`${root}/.relkit/dev/current.json`, canonicalJson({ version: 1, generation }));
  bytes.set(`${root}/src/app.ts`, "source");
  const paths = new Set(["src/app.ts"]);
  const operations = validationFileOperations(bytes, paths);
  const layer = Layer.succeed(SnapshotFiles, decorate(operations));
  return { receipt, bytes, paths, root, capsuleRoot, layer };
}
