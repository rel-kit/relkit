/** Reads a snapshot address and decoded receipt before granting cohort authority. */
import { join } from "node:path";
import { canonicalJson } from "@relkit/contracts";
import { Effect, Schema } from "effect";
import { SnapshotPointer } from "./snapshot.schemas.js";
import { decodeSnapshotEffect, MAX_SNAPSHOT_RECEIPT_BYTES } from "./snapshot-decode.js";
import { DevSnapshotRejected } from "./snapshot-error.js";
import { snapshotDigest, snapshotFingerprint } from "./snapshot-fingerprint.js";
import { prefixSnapshotFiles } from "./snapshot-member-prefix.js";
import type { SnapshotFileOperations } from "./snapshot-files.types.js";
import type { SnapshotTools } from "./snapshot.types.js";

/** Verifies content addressing, exact tools and complete receipt fingerprint without executable imports. */
export const readSnapshotGeneration = Effect.fn("DevSnapshot.readGeneration")(function* (
  files: SnapshotFileOperations,
  root: string,
  tools: SnapshotTools,
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
  return { pointer, capsuleRoot, capsuleFiles, receipt };
});

/**
 * Preserves the expected safe fallback classification for malformed/stale identity.
 * @param reason - Existing snapshot rejection classification used by the safe compiler fallback.
 * @param operation - Stable validation-operation label retained in the fallback diagnostic.
 * @returns A snapshot rejection preserving its supplied classification and operation label.
 */
function reject(reason: DevSnapshotRejected["reason"], operation: string) {
  return new DevSnapshotRejected({ reason, operation });
}
