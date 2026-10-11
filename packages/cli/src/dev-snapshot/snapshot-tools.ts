/** Reads the executing CLI's pinned tool identities without filesystem discovery. */
import { Effect, Schema } from "effect";
import { mapErrorCause } from "../services/map-error-cause.js";
import manifest from "../../package.json" with { type: "json" };
import effectManifest from "effect/package.json" with { type: "json" };
import typescriptManifest from "typescript/package.json" with { type: "json" };
import { SnapshotTools } from "./snapshot.schemas.js";
import { DevSnapshotRejected } from "./snapshot-error.js";

/**
 * Captures the command's Bun version and installed package versions for reuse.
 * @param root - Installed project's physical root, including after atomic relocation.
 * @returns Exact bounded identity or ineligibility; no executable dependency is imported.
 */
export const readSnapshotTools = Effect.fn("DevSnapshot.tools")(function* (_root: string) {
  return yield* Schema.decodeUnknownEffect(SnapshotTools)({
    bun: Bun.version,
    effect: effectManifest.version,
    typescript: typescriptManifest.version,
    relkit: manifest.version,
    platform: `${process.platform}-${process.arch}`,
  }).pipe(mapErrorCause(() => incompatible("tools.platform")));
});

/**
 * Rejects an incompatible native identity without retaining absolute resolution paths.
 * @param operation - Fixed safe diagnostic label.
 * @returns Expected typed compatibility rejection, distinct from defects and interruption.
 */
function incompatible(operation: string) {
  return new DevSnapshotRejected({ reason: "incompatible", operation });
}
