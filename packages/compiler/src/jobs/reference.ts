import { normalizeIdEffect } from "@relkit/contracts";
import { Effect } from "effect";
import { isRecord } from "../normalize-utils.js";

/**
 * Resolves an optional descriptor reference using the authoritative stable-ID contract.
 * @param value - Descriptor or evaluator snapshot carrying a reference.
 * @returns A lazy effect yielding the normalized identifier, or undefined for a missing or invalid ID.
 * @remarks Only StableIdError means an unresolved reference; unexpected defects remain visible.
 */
export const taskReferenceIdEffect = Effect.fn("Jobs.referenceId")(function* (value: unknown) {
  if (!isRecord(value) || !isRecord(value.ref)) return undefined;
  return yield* normalizeIdEffect(value.ref.id).pipe(
    Effect.catchTag("StableIdError", () => Effect.succeed(undefined)),
  );
});
