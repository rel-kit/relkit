/**
 * Publishes validated immutable dev cohorts through replaceable file/mutation
 * services. Copied bytes and existing generations are verified before pointer
 * activation; input-epoch guards preserve the previous snapshot on obsolete work.
 */
import { relative } from "node:path";
import { canonicalJson } from "@relkit/contracts";
import { observeExecution } from "@relkit/contracts/operation";
import { Context, Effect, Layer, Schema } from "effect";
import { SnapshotFiles } from "./snapshot-files.service.js";
import { SnapshotPublicationNative } from "./snapshot-publication-native.js";
import { SnapshotPath } from "./snapshot.schemas.js";
import { decodeSnapshotEffect } from "./snapshot-decode.js";
import {
  snapshotDigest,
  snapshotFingerprint,
  verifySnapshotMembers,
} from "./snapshot-fingerprint.js";
import { verifySnapshotCohort } from "./snapshot-cohort.js";
import { prefixSnapshotFiles } from "./snapshot-member-prefix.js";
import { DevSnapshotRejected } from "./snapshot-error.js";
import type { DevSnapshot, SnapshotMember } from "./snapshot.types.js";
import type { SnapshotFileOperations } from "./snapshot-files.types.js";
import type {
  SnapshotPublicationNativeOperations,
  SnapshotPublicationOperations,
  SnapshotPublicationStage,
} from "./snapshot-publication.types.js";

/** Owns copying/verification/publication policy; acquisition captures shared authorities. */
export class SnapshotPublication extends Context.Service<
  SnapshotPublication,
  SnapshotPublicationOperations
>()("relkit/DevSnapshot/Publication", {
  make: Effect.gen(function* () {
    const files = yield* SnapshotFiles;
    const native = yield* SnapshotPublicationNative;
    return {
      publish: Effect.fn("SnapshotPublication.publish")(
        (...args: Parameters<SnapshotPublicationOperations["publish"]>) =>
          observeExecution("cli", "dev.snapshot.publish", publishSnapshot(files, native, ...args)),
      ),
    } satisfies SnapshotPublicationOperations;
  }),
}) {}

/** Installs policy with caller-provided native/live or deterministic test authorities. */
export const snapshotPublicationLive = Layer.effect(SnapshotPublication, SnapshotPublication.make);

/**
 * Copies exact accepted bytes and switches the pointer only after complete verification.
 * @param files - Bounded file authority captured at service acquisition.
 * @param native - Scoped mutations captured at service acquisition.
 * @param root - Current project containment root.
 * @param sourceDirectory - Owned build directory within that project.
 * @param receipt - Accepted portable cohort and complete byte indexes.
 * @param current - Epoch/byte guard owned by the preparation workflow.
 * @returns Generation identity after publication, or typed rejection/I/O failure.
 */
const publishSnapshot = Effect.fn("DevSnapshot.publish")(
  (
    files: SnapshotFileOperations,
    native: SnapshotPublicationNativeOperations,
    root: string,
    sourceDirectory: string,
    receipt: DevSnapshot,
    current: Parameters<SnapshotPublicationOperations["publish"]>[3],
  ) =>
    Effect.scoped(
      Effect.gen(function* () {
        const bytes = Buffer.from(canonicalJson(receipt) + "\n");
        const decoded = yield* decodeSnapshotEffect(bytes.toString("utf8"));
        if (
          snapshotFingerprint(decoded) !== decoded.fingerprint ||
          decoded.artifacts.some((member) => member.path === "receipt.json")
        )
          return yield* rejected("publication.receipt");
        yield* current;
        const stage = yield* native.stage(root);
        const sourcePath = relative(stage.projectRoot, sourceDirectory);
        if (!Schema.is(SnapshotPath)(sourcePath)) return yield* rejected("publication.source");
        yield* Effect.forEach(
          decoded.artifacts,
          (member) => copyMember(files, native, stage, sourcePath, member),
          { concurrency: 4, discard: true },
        );
        yield* native.write(stage, "receipt.json", bytes);
        yield* verifyPublished(
          files,
          stage.projectRoot,
          relative(stage.projectRoot, stage.directory),
          decoded,
        );
        yield* current;
        const generation = snapshotDigest(bytes);
        const path = yield* native.install(stage, generation);
        const installed = yield* files.read(stage.projectRoot, `${path}/receipt.json`, 8_388_608);
        if (snapshotDigest(installed) !== generation)
          return yield* rejected("publication.collision");
        yield* verifyPublished(files, stage.projectRoot, path, decoded);
        yield* current;
        yield* native.point(stage.projectRoot, generation);
        return generation;
      }),
    ),
);

/**
 * Verifies original build member bytes before copying them into the private stage.
 * @param files - Bounded file authority retaining the project as containment root.
 * @param native - Mutations limited to the owned stage.
 * @param stage - Current private stage and physical project root.
 * @param sourcePath - Validated project-relative build root.
 * @param member - Accepted full byte identity.
 * @returns Lazy complete copy or typed divergence; no partial member is accepted.
 */
const copyMember = Effect.fn("DevSnapshot.copyMember")(function* (
  files: SnapshotFileOperations,
  native: SnapshotPublicationNativeOperations,
  stage: SnapshotPublicationStage,
  sourcePath: string,
  member: SnapshotMember,
) {
  const bytes = yield* files.read(stage.projectRoot, `${sourcePath}/${member.path}`, 67_108_864);
  if (bytes.length !== member.bytes || snapshotDigest(bytes) !== member.hash)
    return yield* rejected("publication.sourceChanged");
  yield* native.write(stage, member.path, bytes);
});

/**
 * Rechecks every executable/plan member against the actual installed directory.
 * @param files - Bounded reads preserving project containment.
 * @param root - Physical project root.
 * @param path - Private stage or content-addressed generation below that root.
 * @param receipt - Fully decoded cohort expected in that directory.
 * @returns Complete integrity and semantic verification without importing executables.
 */
const verifyPublished = Effect.fn("DevSnapshot.verifyPublished")(function* (
  files: SnapshotFileOperations,
  root: string,
  path: string,
  receipt: DevSnapshot,
) {
  const capsuleFiles = prefixSnapshotFiles(files, root, path);
  yield* verifySnapshotMembers(capsuleFiles, root, receipt.artifacts);
  yield* verifySnapshotCohort(capsuleFiles, root, receipt);
});

/**
 * Reports expected publication divergence without retaining private bytes.
 * @param operation - Fixed publication context.
 * @returns Typed integrity rejection with no execution authority.
 */
function rejected(operation: string) {
  return new DevSnapshotRejected({ reason: "integrity", operation });
}
