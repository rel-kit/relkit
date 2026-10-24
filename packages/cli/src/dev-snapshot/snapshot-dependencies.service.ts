/**
 * Captures installed dependency identity and complete consumed executable bytes
 * from pinned Bun's bundle inventory. Package manifests are included even when
 * Bun did not bundle them; original project containment rejects escaped links.
 * Preparation owns checking/publication epochs and immutable artifact capture.
 */
import { Context, Effect, Layer, Option } from "effect";
import {
  DependencySource,
  type DependencySourceContract,
} from "@relkit/provider/internal/dependencies";
import { observeExecution } from "@relkit/contracts/operation";
import { SnapshotFiles } from "./snapshot-files.service.js";
import { DevSnapshotRejected } from "./snapshot-error.js";
import { SnapshotBundleInputs, SnapshotInstalledPackage } from "./snapshot-dependencies.schemas.js";
import { decodeSnapshotJson } from "./snapshot-json.js";
import { snapshotDigest } from "./snapshot-fingerprint.js";
import type { SnapshotDependencyOperations } from "./snapshot-dependencies.types.js";
import type { SnapshotFileOperations } from "./snapshot-files.types.js";
import { stageSnapshotDependencies } from "./snapshot-dependency-capsule.js";
import {
  groupSnapshotDependencyPaths,
  selectedManifestPaths,
} from "./snapshot-dependency-paths.js";

/** Preparation dependency authority with explicit replaceable file operations. */
export class SnapshotDependencies extends Context.Service<
  SnapshotDependencies,
  SnapshotDependencyOperations
>()("relkit/DevSnapshot/Dependencies", {
  make: Effect.gen(function* () {
    const files = yield* SnapshotFiles;
    const packages = Option.getOrUndefined(yield* Effect.serviceOption(DependencySource));
    return {
      capture: Effect.fn("SnapshotDependencies.capture")(
        (
          root: string,
          metafile: Uint8Array,
          capsuleRoot?: string,
          writes?: import("../services/filesystem.types.js").FileSystemCapabilities,
          selected?: Readonly<Record<string, string>>,
        ) =>
          observeExecution(
            "cli",
            "dev.snapshot.dependencies",
            captureDependencies(files, writes, root, metafile, capsuleRoot, packages, selected),
          ),
      ),
    } satisfies SnapshotDependencyOperations;
  }),
}) {}

/** Consumers supply the same file contract through live or deterministic test Layers. */
export const snapshotDependenciesLive = Layer.effect(
  SnapshotDependencies,
  SnapshotDependencies.make,
);

/**
 * Groups consumed paths by actual installed package root, preserving nested resolution.
 * @param files - Captured bounded file authority with the project containment root.
 * @param root - Canonical physical project root used by the completed Bun bundle.
 * @param metafile - Complete bounded native bundle inventory bytes.
 * @returns Sorted portable dependency identities or typed unsafe input rejection.
 */
const captureDependencies = Effect.fn("DevSnapshot.dependencyInputs")(function* (
  files: SnapshotFileOperations,
  writes: import("../services/filesystem.types.js").FileSystemCapabilities | undefined,
  root: string,
  metafile: Uint8Array,
  capsuleRoot?: string,
  packages?: DependencySourceContract,
  selected: Readonly<Record<string, string>> = {},
) {
  if (metafile.length > 8_388_608) return yield* ineligible("dependencies.metafileBound");
  const metadata = yield* decodeSnapshotJson(SnapshotBundleInputs, metafile);
  const paths = [
    ...Object.keys(metadata.inputs),
    ...(yield* selectedManifestPaths(packages, root, selected)),
  ];
  if (paths.length > 20_000) return yield* ineligible("dependencies.memberBound");
  const { groups, external } = yield* groupSnapshotDependencyPaths(
    root,
    paths,
    capsuleRoot !== undefined && writes !== undefined,
  );
  const installed = yield* Effect.forEach(
    [...groups].sort(([left], [right]) => left.localeCompare(right)),
    ([packageRoot, paths]) => capturePackage(files, root, packageRoot, paths),
    { concurrency: 4 },
  );
  const linked =
    external.length === 0
      ? []
      : yield* stageSnapshotDependencies(files, writes!, root, capsuleRoot!, external);
  return [...installed, ...linked].sort((left, right) => left.root.localeCompare(right.root));
});

/**
 * Records package metadata and complete member content through contained reads.
 * @param files - Injected file authority; mutable parent links cannot escape the project.
 * @param root - Physical project root, never persisted.
 * @param packageRoot - Complete installed package identity relative to that root.
 * @param paths - Unique consumed members plus package.json.
 * @returns Precise package version and sorted member identities, without loaded exports.
 */
const capturePackage = Effect.fn("DevSnapshot.dependencyPackage")(function* (
  files: SnapshotFileOperations,
  root: string,
  packageRoot: string,
  paths: ReadonlySet<string>,
) {
  const packageBytes = yield* files.read(root, `${packageRoot}/package.json`, 1_048_576);
  const identity = yield* decodeSnapshotJson(SnapshotInstalledPackage, packageBytes);
  const members = yield* Effect.forEach(
    [...paths].sort((left, right) => left.localeCompare(right)),
    (path) =>
      (path === "package.json"
        ? Effect.succeed(packageBytes)
        : files.read(root, `${packageRoot}/${path}`, 67_108_864)
      ).pipe(
        Effect.map((bytes) => ({
          path,
          bytes: bytes.length,
          hash: snapshotDigest(bytes),
        })),
      ),
    { concurrency: 8 },
  );
  return { ...identity, root: packageRoot, members };
});

/**
 * Rejects native bundle inventories that cannot become a portable complete closure.
 * @param operation - Fixed safe eligibility label.
 * @returns Expected ineligibility, preserving other failure channels unchanged.
 */
function ineligible(operation: string) {
  return new DevSnapshotRejected({ reason: "ineligible", operation });
}
