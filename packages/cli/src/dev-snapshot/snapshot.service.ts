/**
 * Accepts a prepared generation only after verifying its content-addressed receipt,
 * exact tools, complete current inputs, dependency bytes and every artifact. The
 * service captures file authority during Layer acquisition and returns one frozen
 * cohort for runtime consumers; it performs no evaluator, checker or bundler work.
 */
import { observeExecution } from "@relkit/contracts/operation";
import { Context, Effect, Fiber, Layer, Option } from "effect";
import {
  DependencySource,
  type DependencySourceContract,
} from "@relkit/provider/internal/dependencies";
import { SnapshotFiles } from "./snapshot-files.service.js";
import { verifySnapshotCohort } from "./snapshot-cohort.js";
import { sealedArtifactFiles } from "./snapshot-sealed-artifacts.js";
import { verifySnapshotSelectedDependencies } from "./snapshot-selected-dependencies.js";
import { readSnapshotGeneration } from "./snapshot-generation.js";
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
      const source = Option.getOrUndefined(yield* Effect.serviceOption(DependencySource));
      return {
        stage: Effect.fn("DevSnapshots.stage")(
          (root: string, tools: SnapshotTools, currentMembers?: SnapshotCurrentMemberProof) =>
            observeExecution(
              "cli",
              "dev.snapshot.stage",
              stageSnapshot(files, root, tools, currentMembers, source),
            ),
        ),
        validate: Effect.fn("DevSnapshots.validate")((root: string, tools: SnapshotTools) =>
          observeExecution(
            "cli",
            "dev.snapshot.validate",
            validateSnapshot(files, root, tools, source),
          ),
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
  source?: DependencySourceContract,
) {
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const staged = yield* stageSnapshot(files, root, tools, undefined, source);
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
  source?: DependencySourceContract,
) {
  const { pointer, capsuleRoot, capsuleFiles, receipt } = yield* readSnapshotGeneration(
    files,
    root,
    tools,
  );
  const memberVerification =
    currentMembers?.generation === pointer.generation ? currentMembers.verification : undefined;
  const current = yield* verifySnapshotCurrentInventory(
    files,
    root,
    receipt,
    memberVerification,
  ).pipe(Effect.forkScoped);
  const artifacts = yield* captureSnapshotArtifactInventory(capsuleFiles, capsuleRoot, receipt);
  const sealed = sealedArtifactFiles(capsuleFiles, capsuleRoot, artifacts);
  const graph = yield* verifySnapshotCohort(sealed, capsuleRoot, receipt);
  yield* verifySnapshotSelectedDependencies(source, sealed, root, capsuleRoot, receipt);
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
