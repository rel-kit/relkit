/**
 * Captures installed dependency identity and complete consumed executable bytes
 * from pinned Bun's bundle inventory. Package manifests are included even when
 * Bun did not bundle them; original project containment rejects escaped links.
 * Preparation owns checking/publication epochs and immutable artifact capture.
 */
import { isAbsolute, relative } from "node:path";
import { Context, Effect, Layer, Schema } from "effect";
import { observeExecution } from "@relkit/contracts/operation";
import { SnapshotFiles } from "./snapshot-files.service.js";
import { DevSnapshotRejected } from "./snapshot-error.js";
import { SnapshotPath } from "./snapshot.schemas.js";
import { SnapshotBundleInputs, SnapshotInstalledPackage } from "./snapshot-dependencies.schemas.js";
import { decodeSnapshotJson } from "./snapshot-json.js";
import { snapshotDigest } from "./snapshot-fingerprint.js";
import type { SnapshotDependencyOperations } from "./snapshot-dependencies.types.js";
import type { SnapshotFileOperations } from "./snapshot-files.types.js";
import { stageSnapshotDependencies } from "./snapshot-dependency-capsule.js";

/** Preparation dependency authority with explicit replaceable file operations. */
export class SnapshotDependencies extends Context.Service<
  SnapshotDependencies,
  SnapshotDependencyOperations
>()("relkit/DevSnapshot/Dependencies", {
  make: Effect.gen(function* () {
    const files = yield* SnapshotFiles;
    return {
      capture: Effect.fn("SnapshotDependencies.capture")(
        (
          root: string,
          metafile: Uint8Array,
          capsuleRoot?: string,
          writes?: import("../services/filesystem.types.js").FileSystemCapabilities,
        ) =>
          observeExecution(
            "cli",
            "dev.snapshot.dependencies",
            captureDependencies(files, writes, root, metafile, capsuleRoot),
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
) {
  if (metafile.length > 8_388_608) return yield* ineligible("dependencies.metafileBound");
  const metadata = yield* decodeSnapshotJson(SnapshotBundleInputs, metafile);
  const paths = Object.keys(metadata.inputs);
  if (paths.length > 20_000) return yield* ineligible("dependencies.memberBound");
  const groups = new Map<string, Set<string>>();
  const external: string[] = [];
  for (const nativePath of paths) {
    const path = (isAbsolute(nativePath) ? relative(root, nativePath) : nativePath).replaceAll(
      "\\",
      "/",
    );
    if (!Schema.is(SnapshotPath)(path)) {
      if (capsuleRoot === undefined || writes === undefined)
        return yield* ineligible("dependencies.path");
      external.push(nativePath);
      continue;
    }
    if (path.split("/").some((segment) => segment === ".env" || segment.startsWith(".env.")))
      return yield* ineligible("dependencies.environment");
    if (!path.startsWith("node_modules/")) continue;
    const marker = path.lastIndexOf("node_modules/") + "node_modules/".length;
    const segments = path.slice(marker).split("/");
    const packageLength = segments[0]?.startsWith("@") ? 2 : 1;
    if (segments.length <= packageLength) return yield* ineligible("dependencies.packagePath");
    const packageRoot = path.slice(0, marker) + segments.slice(0, packageLength).join("/");
    const members = groups.get(packageRoot) ?? new Set(["package.json"]);
    members.add(path.slice(packageRoot.length + 1));
    groups.set(packageRoot, members);
  }
  if (groups.size > 2_048) return yield* ineligible("dependencies.packageBound");
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
