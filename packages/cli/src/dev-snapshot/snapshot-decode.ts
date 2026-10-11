/**
 * Decodes bounded receipt bytes and checks references within its declared cohort.
 * It rejects duplicate members, orphan route partitions and runtime path aliases
 * before native I/O. The validation service additionally verifies actual bytes,
 * current inputs, tool compatibility and the graph's owning semantic validator.
 */
import { Effect, Schema } from "effect";
import { DevSnapshot as SnapshotSchema } from "./snapshot.schemas.js";
import { DevSnapshotRejected } from "./snapshot-error.js";
import type { DevSnapshot } from "./snapshot.types.js";

export const MAX_SNAPSHOT_RECEIPT_BYTES = 8_388_608;

/**
 * Promotes bounded JSON bytes to a self-consistent receipt, without importing code.
 * @param source - UTF-8 receipt bytes supplied by the bounded filesystem adapter.
 * @returns Lazy decoded data or typed rejection; execution authority is not granted.
 */
export const decodeSnapshotEffect = Effect.fn("DevSnapshot.decode")((source: string) =>
  Effect.try({
    try: () => {
      if (Buffer.byteLength(source) > MAX_SNAPSHOT_RECEIPT_BYTES)
        throw new Error("Receipt exceeds bound");
      const receipt = Schema.decodeUnknownSync(SnapshotSchema)(JSON.parse(source));
      assertReceiptReferences(receipt);
      return receipt;
    },
    catch: () => new DevSnapshotRejected({ reason: "malformed", operation: "receipt.decode" }),
  }),
);

/**
 * Verifies indexes identify one complete cohort and never mutable environment input.
 * @param receipt - Schema-decoded data with bounded paths and hashes.
 * @returns Completion when all references resolve uniquely inside the artifact index.
 * @throws Error for duplicate, escaped or inconsistent cohort references.
 */
function assertReceiptReferences(receipt: DevSnapshot): void {
  assertReceiptBounds(receipt);
  if (receipt.activation.graphHash !== receipt.graphHash) throw new Error("Mixed graph cohort");
  const artifacts = uniquePaths(receipt.artifacts.map((member) => member.path));
  const artifactMembers = new Map(receipt.artifacts.map((member) => [member.path, member]));
  uniquePaths(receipt.inputs.map((member) => member.path));
  uniquePaths(receipt.typecheckInputs.files.map((member) => member.path));
  uniquePaths(receipt.typecheckInputs.observations.map((query) => `${query.kind}:${query.path}`));
  const roots = uniquePaths(receipt.dependencies.map((dependency) => dependency.root));
  for (const dependency of receipt.dependencies) {
    const copied = dependency.root.startsWith("dependencies/");
    if (!copied && !dependency.root.startsWith("node_modules/"))
      throw new Error("Dependency must resolve inside installed modules or the immutable capsule");
    uniquePaths(dependency.members.map((member) => member.path));
    if (!copied) continue;
    for (const member of dependency.members) {
      const artifact = artifactMembers.get(`${dependency.root}/${member.path}`);
      if (
        artifact === undefined ||
        artifact.bytes !== member.bytes ||
        artifact.hash !== member.hash
      )
        throw new Error("Dependency member does not match the immutable artifact index");
    }
  }
  assertCohortReferences(receipt, artifacts);
  for (const member of [...receipt.inputs, ...receipt.typecheckInputs.files]) {
    if (
      member.path.split("/").some((segment) => segment === ".env" || segment.startsWith(".env."))
    ) {
      throw new Error("Environment cannot enter compilation inventory");
    }
    if (roots.has(member.path)) throw new Error("Dependency root overlaps a file");
  }
}

/**
 * Bounds aggregate memory capture and descriptor work, beyond each member's codec.
 * @param receipt - Individually schema-bounded inventories.
 * @returns Completion or a native expected decoding rejection before byte acquisition.
 */
function assertReceiptBounds(receipt: DevSnapshot): void {
  if (receipt.artifacts.reduce((bytes, member) => bytes + member.bytes, 0) > 134_217_728)
    throw new Error("Artifact capture exceeds memory bound");
  if (
    receipt.dependencies.reduce((count, dependency) => count + dependency.members.length, 0) >
    20_000
  )
    throw new Error("Dependency inventory exceeds member bound");
}

/**
 * Verifies the receipt's cohort and deferred references resolve to captured members.
 * @param receipt - Individually decoded metadata.
 * @param artifacts - Unique complete artifact paths.
 * @returns Completion or an expected mixed/missing/duplicate-cohort rejection.
 */
function assertCohortReferences(receipt: DevSnapshot, artifacts: ReadonlySet<string>): void {
  const cohortPaths = [
    receipt.graphFile,
    receipt.activationFile,
    receipt.manifestFile,
    receipt.runtimeIntegrationsFile,
    receipt.entrypoint,
    receipt.importIndex,
    ...(receipt.jobsManifestFile === undefined ? [] : [receipt.jobsManifestFile]),
    ...(receipt.localServicesFile === undefined ? [] : [receipt.localServicesFile]),
  ];
  if (
    (receipt.jobsManifestFile === undefined) !==
    (receipt.activation.jobsManifestHash === undefined)
  )
    throw new Error("Incomplete jobs cohort");
  if (
    (receipt.localServicesFile === undefined) !==
    (receipt.activation.localServicesPlanHash === undefined)
  )
    throw new Error("Incomplete local cohort");
  for (const path of cohortPaths) {
    if (!artifacts.has(path)) throw new Error("Unindexed runtime member");
  }
  uniquePaths(cohortPaths);
  uniquePaths(receipt.routeImports.map((route) => route.routeId));
  for (const route of receipt.routeImports) {
    uniquePaths(route.members);
    if (route.members.some((path) => !artifacts.has(path)))
      throw new Error("Unindexed deferred member");
  }
}

/**
 * Checks index uniqueness without silently coalescing conflicting declarations.
 * @param paths - Bounded decoded identities from one index.
 * @returns Their unique identity set.
 * @throws Error if the index contains a duplicate.
 */
function uniquePaths(paths: readonly string[]): ReadonlySet<string> {
  const unique = new Set(paths);
  if (unique.size !== paths.length) throw new Error("Duplicate inventory identity");
  return unique;
}
