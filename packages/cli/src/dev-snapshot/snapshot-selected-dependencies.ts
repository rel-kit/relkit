/** Revalidates external runtime selection before prepared code can become ready. */
import { Effect } from "effect";
import { ProductionManifest } from "../commands/build-production.schemas.js";
import { DevSnapshotRejected } from "./snapshot-error.js";
import type { DependencySourceContract } from "@relkit/provider/internal/dependencies";
import type { SnapshotFileOperations } from "./snapshot-files.types.js";
import type { DevSnapshot } from "./snapshot.types.js";
import { decodeSnapshotJson } from "./snapshot-json.js";
import { resolveProductionDependency } from "../services/production-dependency-source.js";

/**
 * Compares actual installed identities to the sealed exact-version production manifest.
 * @param source - Metadata resolver captured when the validation Layer was acquired.
 * @param files - Sealed immutable artifact authority.
 * @param root - Current consuming project root, including after relocation.
 * @param capsule - Verified snapshot capsule root.
 * @param receipt - Original bounded artifact index.
 * @returns Completion or safe fallback before acquiring any application runtime.
 */
export const verifySnapshotSelectedDependencies = Effect.fn("DevSnapshot.selectedDependencies")(
  function* (
    source: DependencySourceContract | undefined,
    files: SnapshotFileOperations,
    root: string,
    capsule: string,
    receipt: DevSnapshot,
  ) {
    if (!receipt.artifacts.some((member) => member.path === "package.json")) return;
    const manifest = yield* decodeSnapshotJson(
      ProductionManifest,
      yield* files.read(capsule, "package.json", 1_048_576),
    );
    const selected = Object.entries(manifest.dependencies);
    if (selected.length === 0) return;
    if (source === undefined) return yield* rejected("selection.authority");
    for (const [name, version] of selected) {
      const installed = yield* resolveProductionDependency(source, name, root).pipe(
        Effect.mapError(() => rejected("selection.resolution")),
      );
      if (installed === null || installed.version !== version)
        return yield* rejected("selection.identity");
    }
  },
);

/**
 * Expected divergence requests the unchanged safe compiler path.
 * @param operation - Stable validation-operation label retained in the fallback diagnostic.
 * @returns A stale snapshot rejection preserving the existing compiler fallback channel.
 */
function rejected(operation: string) {
  return new DevSnapshotRejected({ reason: "stale", operation });
}
