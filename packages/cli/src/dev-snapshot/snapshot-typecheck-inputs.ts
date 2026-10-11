/**
 * Converts the successful check's text observations into portable byte identities.
 * Preparation verifies the bytes still represent exactly what TypeScript consumed.
 * Startup then hashes those bytes and replays absent/present resolution queries;
 * it does not import TypeScript, parse source or run the checker again.
 */
import { Effect, Schema } from "effect";
import type { TypecheckInputWitness } from "@relkit/compiler";
import { mapErrorCause } from "../services/map-error-cause.js";
import { SnapshotTypecheckInputs } from "./snapshot.schemas.js";
import { DevSnapshotRejected } from "./snapshot-error.js";
import { snapshotDigest, verifySnapshotMembers } from "./snapshot-fingerprint.js";
import { snapshotTypecheckObservations } from "./snapshot-typecheck-observations.js";
import { compactTypecheckObservations } from "./snapshot-typecheck-compaction.js";
import type { DevSnapshot } from "./snapshot.types.js";
import type { SnapshotFileOperations, TypecheckObservation } from "./snapshot-files.types.js";

/**
 * Captures raw bytes only after matching the original check's consumed text identity.
 * @param files - Acquired contained file authority.
 * @param root - Project root at checking/preparation time, never persisted.
 * @param witnesses - Evidence returned by that same successful TypeScript execution.
 * @returns Complete byte/query receipt or expected ineligibility/staleness.
 */
export const captureSnapshotTypecheckInputs = Effect.fn("DevSnapshot.captureTypecheckInputs")(
  function* (
    files: SnapshotFileOperations,
    root: string,
    witnesses: readonly TypecheckInputWitness[],
  ) {
    const members = yield* Effect.forEach(
      witnesses.filter((witness) => witness.kind === "read"),
      (witness) =>
        Effect.gen(function* () {
          const bytes = yield* files.read(root, witness.path, 67_108_864);
          // Unsupported encodings are ineligible rather than approximated at reuse.
          if ((bytes[0] === 255 && bytes[1] === 254) || (bytes[0] === 254 && bytes[1] === 255))
            return yield* rejected("typecheck.encoding");
          const text = Buffer.from(bytes)
            .toString("utf8")
            .replace(/^\uFEFF/, "");
          if (snapshotDigest(text) !== witness.hash) return yield* rejected("typecheck.changed");
          return { path: witness.path, bytes: bytes.length, hash: snapshotDigest(bytes) };
        }),
      { concurrency: 8 },
    );
    const observations = yield* compactTypecheckObservations(
      files,
      root,
      snapshotTypecheckObservations(witnesses),
    );
    return yield* Schema.decodeUnknownEffect(SnapshotTypecheckInputs)({
      files: members,
      observations,
    }).pipe(mapErrorCause(() => rejected("typecheck.receipt")));
  },
);

/**
 * Revalidates every consumed declaration and negative resolution witness before reuse.
 * @param files - Same injected authority used by source/dependency verification.
 * @param root - Current relocated project root.
 * @param inputs - Exact bounded evidence from the accepted prepared check.
 * @returns Completion or typed divergence; defects/interruption retain their full Cause.
 */
export const verifySnapshotTypecheckInputs = Effect.fn("DevSnapshot.verifyTypecheckInputs")(
  function* (files: SnapshotFileOperations, root: string, inputs: DevSnapshot["typecheckInputs"]) {
    yield* verifySnapshotMembers(files, root, inputs.files);
    yield* verifySnapshotTypecheckQueries(files, root, inputs.observations);
  },
);

/**
 * Verifies resolution evidence after the owning inventory has checked consumed bytes.
 * @param files - Same acquired contained filesystem authority.
 * @param root - Current relocated project root.
 * @param observations - Prepared positive/negative module-resolution metadata.
 * @returns Completion or expected staleness; no checker implementation is imported.
 */
export const verifySnapshotTypecheckQueries = Effect.fn("DevSnapshot.verifyTypecheckQueries")(
  function* (
    files: SnapshotFileOperations,
    root: string,
    observations: readonly TypecheckObservation[],
  ) {
    const actual = yield* files.observations(root, observations);
    if (!sameTypecheckObservations(actual, observations))
      return yield* rejected("typecheck.resolutionChanged");
  },
);

/**
 * Compares replayed existence and directory membership without serializing another inventory.
 * @param actual - Every observation returned by the native or test adapter.
 * @param expected - Original observations in the same decoded order.
 * @returns True only when every complete resolution witness still matches.
 */
function sameTypecheckObservations(
  actual: readonly TypecheckObservation[],
  expected: readonly TypecheckObservation[],
): boolean {
  return (
    actual.length === expected.length &&
    actual.every((current, index) => {
      const previous = expected[index];
      if (previous === undefined || current.path !== previous.path) return false;
      if (
        (current.kind === "directories" || current.kind === "entries") &&
        current.kind === previous.kind
      )
        return (
          current.entries.length === previous.entries.length &&
          current.entries.every((entry, offset) => entry === previous.entries[offset])
        );
      return (
        current.kind !== "directories" &&
        current.kind !== "entries" &&
        previous.kind !== "directories" &&
        previous.kind !== "entries" &&
        current.kind === previous.kind &&
        current.exists === previous.exists
      );
    })
  );
}

/**
 * Rejects an uncertifiable check without retaining source text or host locations.
 * @param operation - Fixed safe validation label.
 * @returns Expected rejection used by the existing safe validation fallback.
 */
function rejected(operation: string) {
  return new DevSnapshotRejected({ reason: "stale", operation });
}
