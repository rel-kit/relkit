/**
 * Verifies the graph and activation identities after member integrity succeeds.
 * Graph semantics remain owned by @relkit/graph; this adapter never evaluates
 * descriptors or imports application code. Its result contains immutable graph
 * data for the existing supervisor, independent from a source working directory.
 */
import { canonicalJson } from "@relkit/contracts";
import { hashGraph, validateGraphShapeEffect } from "@relkit/graph";
import type { ApplicationGraph } from "@relkit/graph";
import { Effect, Schema } from "effect";
import { mapErrorCause } from "../services/map-error-cause.js";
import { SnapshotActivation, SnapshotRouteImport } from "./snapshot.schemas.js";
import { snapshotDigest } from "./snapshot-fingerprint.js";
import {
  cohortRejected as rejected,
  decodeSnapshotJson as decodeJson,
  snapshotJson as parseJson,
} from "./snapshot-json.js";
import { verifySnapshotPlans } from "./snapshot-plan-validation.js";
import { verifySnapshotRoutes } from "./snapshot-route-validation.js";
import type { DevSnapshot } from "./snapshot.types.js";
import type { SnapshotFileOperations } from "./snapshot-files.types.js";

/**
 * Checks live cohort source documents without promoting unverified executable data.
 * @param files - Acquired bounded file authority.
 * @param root - Capsule already verified against its complete artifact index.
 * @param receipt - Receipt whose content address, tools and members passed validation.
 * @returns Lazy graph data or typed cohort rejection; no compiler or application imports.
 */
export const verifySnapshotCohort = Effect.fn("DevSnapshot.cohort")(function* (
  files: SnapshotFileOperations,
  root: string,
  receipt: DevSnapshot,
) {
  const source = yield* files.read(root, receipt.graphFile, 67_108_864);
  const parsed = yield* parseJson(source);
  const graph = yield* ownedGraph(parsed);
  if (hashGraph(graph) !== receipt.graphHash) return yield* rejected("cohort.graphHash");
  const activationBytes = yield* files.read(root, receipt.activationFile, 65_536);
  const activation = yield* decodeJson(SnapshotActivation, activationBytes);
  if (canonicalJson(activation) !== canonicalJson(receipt.activation))
    return yield* rejected("cohort.activation");
  const indexBytes = yield* files.read(root, receipt.importIndex, 8_388_608);
  const index = yield* decodeJson(Schema.Array(SnapshotRouteImport), indexBytes);
  if (canonicalJson(index) !== canonicalJson(receipt.routeImports))
    return yield* rejected("cohort.importIndex");
  yield* verifyActivationMembers(files, root, receipt);
  yield* verifySnapshotPlans(files, root, receipt);
  yield* verifySnapshotRoutes(graph, receipt);
  return graph;
});

/**
 * Connects activation hashes to their actual manifest/plan bytes.
 * @param files - Acquired bounded member authority.
 * @param root - Current immutable capsule location.
 * @param receipt - Decoded cohort requiring optional path/hash fields together.
 * @returns Complete activation verification or expected integrity rejection.
 */
const verifyActivationMembers = Effect.fn("DevSnapshot.activationMembers")(function* (
  files: SnapshotFileOperations,
  root: string,
  receipt: DevSnapshot,
) {
  const members = [
    { path: receipt.manifestFile, hash: receipt.activation.manifestHash },
    {
      path: receipt.runtimeIntegrationsFile,
      hash: receipt.activation.runtimeIntegrationsPlanHash,
    },
    ...(receipt.jobsManifestFile === undefined
      ? []
      : [{ path: receipt.jobsManifestFile, hash: receipt.activation.jobsManifestHash }]),
    ...(receipt.localServicesFile === undefined
      ? []
      : [{ path: receipt.localServicesFile, hash: receipt.activation.localServicesPlanHash }]),
  ];
  yield* Effect.forEach(
    members,
    (member) =>
      Effect.gen(function* () {
        const bytes = yield* files.read(root, member.path, 67_108_864);
        if (snapshotDigest(bytes) !== member.hash) return yield* rejected("cohort.memberHash");
        if (
          member.path === receipt.manifestFile &&
          !Buffer.from(bytes)
            .toString("utf8")
            .includes(`manifestGraphHash = ${JSON.stringify(receipt.graphHash)}`)
        )
          return yield* rejected("cohort.manifestGraph");
      }),
    { concurrency: 4, discard: true },
  );
});

/**
 * Promotes a value only after the graph owner's complete validator succeeds.
 * @typeParam T - Precise input contract retained through validation.
 * @param value - Parsed JSON that has not yet acquired graph authority.
 * @returns The validated graph or typed rejection; defects/interruption propagate.
 */
function ownedGraph<T>(value: T) {
  return validateGraphShapeEffect(value).pipe(
    mapErrorCause(() => rejected("cohort.graph")),
    // The owning validator checks every node, edge and event but returns void.
    // Its success proves the intersection; no input assertion precedes validation.
    Effect.map(() => value as T & ApplicationGraph),
  );
}
