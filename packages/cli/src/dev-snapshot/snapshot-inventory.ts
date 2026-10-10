/**
 * Joins four independent bounded inventories before granting snapshot authority.
 * Source enumeration, current byte identities, queries and immutable capture share
 * the same watched project root. Failure interrupts and joins sibling work; the
 * caller performs semantic cohort validation only after all inventories succeed.
 */
import { Effect } from "effect";
import { DevSnapshotRejected } from "./snapshot-error.js";
import { captureSealedArtifacts } from "./snapshot-sealed-artifacts.js";
import { verifySnapshotTypecheckQueries } from "./snapshot-typecheck-inputs.js";
import { verifySnapshotCurrentMembers } from "./snapshot-current-members.js";
import type { DevSnapshotIoError } from "./snapshot-error.js";
import type { SnapshotFileOperations } from "./snapshot-files.types.js";
import type { DevSnapshot } from "./snapshot.types.js";

/**
 * Verifies current source/dependency bytes while capturing every sealed artifact.
 * @param files - Captured project authority used by both current input inventories.
 * @param root - Relocatable project root retained through its watched epoch.
 * @param capsuleFiles - Contained adapter for the content-addressed generation.
 * @param capsuleRoot - Logical capsule root whose reads still retain project containment.
 * @param receipt - Fully decoded metadata; no executable has run yet.
 * @returns Original immutable capture only after every bounded inventory succeeds.
 */
export const verifySnapshotInventory = Effect.fn("DevSnapshot.inventory")(function* (
  files: SnapshotFileOperations,
  root: string,
  capsuleFiles: SnapshotFileOperations,
  capsuleRoot: string,
  receipt: DevSnapshot,
) {
  const { artifacts } = yield* Effect.all(
    {
      current: verifySnapshotCurrentInventory(files, root, receipt),
      artifacts: captureSnapshotArtifactInventory(capsuleFiles, capsuleRoot, receipt),
    },
    { concurrency: 2 },
  );
  return artifacts;
});

/** Verifies every mutable project, compiler-resolution and dependency witness. */
export const verifySnapshotCurrentInventory = Effect.fn("DevSnapshot.currentInventory")(
  (
    files: SnapshotFileOperations,
    root: string,
    receipt: DevSnapshot,
    preverified?: Effect.Effect<void, DevSnapshotRejected | DevSnapshotIoError>,
  ) =>
    Effect.all(
      [
        verifyCurrentInputs(files, root, receipt),
        preverified ?? verifySnapshotCurrentMembers(files, root, receipt),
        verifySnapshotTypecheckQueries(files, root, receipt.typecheckInputs.observations),
      ],
      { concurrency: 3, discard: true },
    ),
);

/** Captures immutable executable members independently from mutable-current verification. */
export const captureSnapshotArtifactInventory = Effect.fn("DevSnapshot.artifactInventory")(
  (capsuleFiles: SnapshotFileOperations, capsuleRoot: string, receipt: DevSnapshot) =>
    captureSealedArtifacts(capsuleFiles, capsuleRoot, receipt.artifacts),
);

/**
 * Compares complete current source membership while the joined branch hashes bytes.
 * @param files - Captured file authority retaining project containment.
 * @param root - Current relocated project root.
 * @param receipt - Decoded receipt with a verified metadata fingerprint.
 * @returns Completion or typed staleness for additions/removals; bytes are verified separately.
 */
const verifyCurrentInputs = Effect.fn("DevSnapshot.currentInputs")(function* (
  files: SnapshotFileOperations,
  root: string,
  receipt: DevSnapshot,
) {
  const current = (yield* files.projectPaths(root)).slice().sort();
  const expected = receipt.inputs.map((member) => member.path).sort();
  if (current.length !== expected.length || current.some((path, index) => path !== expected[index]))
    return yield* new DevSnapshotRejected({ reason: "stale", operation: "inputs.identity" });
});
