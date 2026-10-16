/**
 * Guards preparation against dynamic compilation and changed source/dependency
 * bytes. Epoch observation remains owned by its caller; these helpers perform
 * complete byte checks through captured authority and never evaluate descriptors.
 */
import { Effect, Schema } from "effect";
import { SnapshotEligibleTsConfig } from "./snapshot-eligibility.schemas.js";
import { snapshotJson } from "./snapshot-json.js";
import { SnapshotFiles } from "./snapshot-files.service.js";
import {
  captureSnapshotInputs,
  sameSnapshotMembers,
  verifySnapshotMembers,
} from "./snapshot-fingerprint.js";
import { verifyStaticSnapshotSource, isSnapshotFactoryShadow } from "./snapshot-eligibility.js";
import { DevSnapshotRejected } from "./snapshot-error.js";
import type { SnapshotFileOperations } from "./snapshot-files.types.js";
import type { SnapshotDependency, SnapshotMember } from "./snapshot.types.js";

/**
 * Checks authored backend/config construction before preparing executable bytes.
 * @param files - Captured complete file authority.
 * @param root - Physical project root.
 * @param inputs - Complete initial project inventory.
 * @returns Declarative eligibility or typed rejection; tooling remains fingerprinted outside the closed backend source roots.
 */
export const verifySnapshotProjectEligibility = Effect.fn("DevSnapshot.projectEligibility")(
  function* (files: SnapshotFileOperations, root: string, inputs: readonly SnapshotMember[]) {
    const config = yield* snapshotJson(yield* files.read(root, "tsconfig.json", 1_048_576));
    if (
      config === null ||
      typeof config !== "object" ||
      Array.isArray(config) ||
      "extends" in config ||
      "references" in config ||
      !Schema.is(SnapshotEligibleTsConfig)(config) ||
      Object.keys(config.compilerOptions.paths).length !== 1
    )
      return yield* new DevSnapshotRejected({
        reason: "ineligible",
        operation: "compilation.aliases",
      });
    if (
      inputs.some(
        (member) =>
          isSnapshotFactoryShadow(member.path) ||
          ["bunfig.toml", ".bunfig.toml"].includes(member.path.toLowerCase()) ||
          member.path.split("/").some((segment) => segment.toLowerCase() === "node_modules"),
      )
    )
      return yield* new DevSnapshotRejected({
        reason: "ineligible",
        operation: "compilation.resolution",
      });
    const packageMember = inputs.find((member) => member.path.toLowerCase() === "package.json");
    if (packageMember !== undefined) {
      const manifest = yield* snapshotJson(yield* files.read(root, packageMember.path, 1_048_576));
      if (
        manifest !== null &&
        typeof manifest === "object" &&
        "name" in manifest &&
        typeof manifest.name === "string" &&
        isSnapshotFactoryShadow(manifest.name)
      )
        return yield* new DevSnapshotRejected({
          reason: "ineligible",
          operation: "compilation.resolution",
        });
    }
    const sources = inputs.filter(
      (member) =>
        (member.path.toLowerCase().startsWith("src/") ||
          member.path.toLowerCase() === "relkit.config.ts") &&
        /\.(?:[cm]?[jt]sx?)$/i.test(member.path) &&
        !member.path.toLowerCase().endsWith(".d.ts"),
    );
    const sourceTexts = new Map(
      yield* Effect.forEach(
        sources,
        (member) =>
          files
            .read(root, member.path, 67_108_864)
            .pipe(
              Effect.map((bytes) => [member.path, Buffer.from(bytes).toString("utf8")] as const),
            ),
        { concurrency: 4 },
      ),
    );
    yield* Effect.forEach(
      sourceTexts,
      ([path, text]) => verifyStaticSnapshotSource(text, path, sourceTexts),
      { concurrency: 4, discard: true },
    );
  },
);

/**
 * Rechecks complete source and installed dependency identities before publication.
 * @param files - Captured bounded authority retaining project containment.
 * @param root - Physical project root.
 * @param dependencyRoot - Owned immutable build root containing dependency copies.
 * @param inputs - Initial inventory accepted by the successful check.
 * @param dependencies - Complete installed executable input identities from Bun.
 * @returns Completion or typed byte/inventory divergence, preserving other failure channels.
 */
export const verifyPreparationInputs = Effect.fn("DevSnapshot.preparationInputs")(function* (
  files: SnapshotFileOperations,
  root: string,
  dependencyRoot: string,
  inputs: readonly SnapshotMember[],
  dependencies: readonly SnapshotDependency[],
) {
  const current = yield* captureSnapshotInputs(root).pipe(
    Effect.provideService(SnapshotFiles, files),
  );
  if (!sameSnapshotMembers(current, inputs))
    return yield* new DevSnapshotRejected({
      reason: "stale",
      operation: "preparation.inputsChanged",
    });
  yield* Effect.forEach(
    dependencies,
    (dependency) =>
      verifySnapshotMembers(
        files,
        dependency.root.startsWith("dependencies/") ? dependencyRoot : root,
        dependency.members.map((member) => ({
          ...member,
          path: `${dependency.root}/${member.path}`,
        })),
      ),
    { concurrency: 4, discard: true },
  );
});
