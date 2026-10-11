/**
 * Builds complete content-addressed test cohorts without importing executable
 * application code. The file Layer supplies explicit bytes and project paths;
 * tests can change either independently to model source edits and cache tampering.
 */
import { GRAPH_VERSION, canonicalJson } from "@relkit/contracts";
import { hashGraph } from "@relkit/graph";
import { Effect, Layer } from "effect";
import { SnapshotFiles } from "../../src/dev-snapshot/snapshot-files.service.js";
import { DevSnapshotIoError } from "../../src/dev-snapshot/snapshot-error.js";
import {
  snapshotDigest,
  snapshotFingerprint,
} from "../../src/dev-snapshot/snapshot-fingerprint.js";
import type { DevSnapshot, SnapshotTools } from "../../src/dev-snapshot/snapshot.types.js";
import type { SnapshotFileOperations } from "../../src/dev-snapshot/snapshot-files.types.js";
import { fixtureObservations } from "./validation-observations.js";

export const tools: SnapshotTools = {
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
  const read = (directory: string, path: string, limit: number) =>
    Effect.suspend(() => {
      const content = bytes.get(`${directory}/${path}`);
      if (content === undefined || Buffer.byteLength(content) > limit)
        return Effect.fail(
          new DevSnapshotIoError({
            operation: "test.read",
            cause: new Error("Fixture member absent or oversized"),
          }),
        );
      return Effect.succeed(Buffer.from(content));
    });
  const operations: SnapshotFileOperations = {
    observations: (root, queries) => fixtureObservations(bytes, root, queries),
    read,
    identities: (directory, paths, limit) =>
      Effect.forEach(paths, (path) =>
        read(directory, path, limit).pipe(
          Effect.map((content) => ({
            path,
            bytes: content.length,
            hash: snapshotDigest(content),
          })),
        ),
      ),
    mismatch: (directory, members, limit) =>
      Effect.forEach(members, (member) => read(directory, member.path, limit)).pipe(
        Effect.map((contents) => {
          const index = members.findIndex(
            (member, offset) =>
              member.bytes !== contents[offset]?.length ||
              member.hash !== snapshotDigest(contents[offset] ?? new Uint8Array()),
          );
          return index < 0 ? undefined : index;
        }),
      ),
    projectPaths: () => Effect.sync(() => [...paths]),
  };
  const layer = Layer.succeed(SnapshotFiles, decorate(operations));
  return { receipt, bytes, paths, root, capsuleRoot, layer };
}
