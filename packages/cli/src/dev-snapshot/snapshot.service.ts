/**
 * Accepts a prepared generation only after verifying its content-addressed receipt,
 * exact tools, complete current inputs, dependency bytes and every artifact. The
 * service captures file authority during Layer acquisition and returns one frozen
 * cohort for runtime consumers; it performs no evaluator, checker or bundler work.
 */
import { join } from "node:path";
import { canonicalJson } from "@relkit/contracts";
import { observeExecution } from "@relkit/contracts/operation";
import { Context, Effect, Fiber, Layer, Schema } from "effect";
import { SnapshotFiles } from "./snapshot-files.service.js";
import { SnapshotPointer } from "./snapshot.schemas.js";
import { decodeSnapshotEffect, MAX_SNAPSHOT_RECEIPT_BYTES } from "./snapshot-decode.js";
import { DevSnapshotRejected } from "./snapshot-error.js";
import { snapshotDigest, snapshotFingerprint } from "./snapshot-fingerprint.js";
import { verifySnapshotCohort } from "./snapshot-cohort.js";
import { prefixSnapshotFiles } from "./snapshot-member-prefix.js";
import { sealedArtifactFiles } from "./snapshot-sealed-artifacts.js";
import {
  captureSnapshotArtifactInventory,
  verifySnapshotCurrentInventory,
} from "./snapshot-inventory.js";
import type {
  DevSnapshotOperations,
  SnapshotCurrentMemberProof,
  SnapshotTools,
} from "./snapshot.types.js";
import type { SnapshotFileOperations } from "./snapshot-files.types.js";

/** Snapshot reuse policy with required file authority captured at Layer construction. */
export class DevSnapshots extends Context.Service<DevSnapshots, DevSnapshotOperations>()(
  "relkit/DevSnapshots",
  {
    make: Effect.gen(function* () {
      const files = yield* SnapshotFiles;
      return {
        stage: Effect.fn("DevSnapshots.stage")(
          (root: string, tools: SnapshotTools, currentMembers?: SnapshotCurrentMemberProof) =>
            observeExecution(
              "cli",
              "dev.snapshot.stage",
              stageSnapshot(files, root, tools, currentMembers),
            ),
        ),
        validate: Effect.fn("DevSnapshots.validate")((root: string, tools: SnapshotTools) =>
          observeExecution("cli", "dev.snapshot.validate", validateSnapshot(files, root, tools)),
        ),
      } satisfies DevSnapshotOperations;
    }),
  },
) {}

/** Supplies validation policy; callers explicitly provide live or test file authority. */
export const devSnapshotsLive = Layer.effect(DevSnapshots, DevSnapshots.make);

/**
 * Validates one generation without importing executable code.
 * @param files - File authority captured once at service acquisition.
 * @param root - Current installed project root.
 * @param tools - Actual command-edge tool identities, never persisted defaults.
 * @returns Frozen verified graph/cohort data, or typed rejection/I/O failure.
 */
const validateSnapshot = Effect.fn("DevSnapshot.validateGeneration")(function* (
  files: SnapshotFileOperations,
  root: string,
  tools: SnapshotTools,
) {
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const staged = yield* stageSnapshot(files, root, tools);
      yield* staged.verification;
      return staged.snapshot;
    }),
  );
});

/** Starts mutable verification while sealing the independently immutable cohort. */
const stageSnapshot = Effect.fn("DevSnapshot.stageGeneration")(function* (
  files: SnapshotFileOperations,
  root: string,
  tools: SnapshotTools,
  currentMembers?: SnapshotCurrentMemberProof,
) {
  const pointerBytes = yield* files.read(root, ".relkit/dev/current.json", 1024);
  const pointer = yield* Effect.try({
    try: () =>
      Schema.decodeUnknownSync(SnapshotPointer)(
        JSON.parse(Buffer.from(pointerBytes).toString("utf8")),
      ),
    catch: () => new DevSnapshotRejected({ reason: "malformed", operation: "pointer.decode" }),
  });
  const capsulePath = `.relkit/dev/generations/${pointer.generation.slice(7)}`;
  const capsuleRoot = join(root, capsulePath);
  // Every read retains the project as its containment authority. Resolving a
  // capsule/dependency directory as a new root would bless an escaped parent link.
  const capsuleFiles = prefixSnapshotFiles(files, root, capsulePath);
  const bytes = yield* capsuleFiles.read(capsuleRoot, "receipt.json", MAX_SNAPSHOT_RECEIPT_BYTES);
  if (snapshotDigest(bytes) !== pointer.generation)
    return yield* reject("integrity", "receipt.address");
  const receipt = yield* decodeSnapshotEffect(Buffer.from(bytes).toString("utf8"));
  if (canonicalJson(receipt.tools) !== canonicalJson(tools))
    return yield* reject("incompatible", "tools.identity");
  if (snapshotFingerprint(receipt) !== receipt.fingerprint)
    return yield* reject("integrity", "receipt.fingerprint");
  const memberVerification =
    currentMembers?.generation === pointer.generation ? currentMembers.verification : undefined;
  const current = yield* verifySnapshotCurrentInventory(
    files,
    root,
    receipt,
    memberVerification,
  ).pipe(Effect.forkScoped);
  const artifacts = yield* captureSnapshotArtifactInventory(capsuleFiles, capsuleRoot, receipt);
  const graph = yield* verifySnapshotCohort(
    sealedArtifactFiles(capsuleFiles, capsuleRoot, artifacts),
    capsuleRoot,
    receipt,
  );
  return {
    snapshot: freezeSnapshotValue({
      receipt,
      graph,
      artifacts,
      capsuleRoot,
      generation: pointer.generation,
    }),
    verification: Fiber.join(current),
  };
});

/**
 * Freezes schema-decoded finite JSON trees and the validated result container.
 * @typeParam T - Precise validated value preserved without widening its contract.
 * @param value - Already decoded, acyclic domain data, never native objects or clients.
 * @returns The same value with every nested object and array frozen.
 */
function freezeSnapshotValue<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeSnapshotValue(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * Rejects expected reuse divergence without hiding a defect or interruption.
 * @param reason - Stable cause understood by the safe-path dispatcher.
 * @param operation - Safe fixed validation context.
 * @returns The expected typed rejection; no executable authority was acquired.
 */
function reject(reason: DevSnapshotRejected["reason"], operation: string) {
  return new DevSnapshotRejected({ reason, operation });
}
