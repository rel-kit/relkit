import { Effect } from "effect";
import { runEventSync } from "./event-observability.js";

/** Checks a value for a plain record shape.
 * @param value - Candidate value.
 * @returns Whether it is a non-array object.
 * @example isRecord({ key: "value" })
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return runEventSync(isRecordEffect(value));
}

/** Effect implementation of the client record predicate.
 * @param value - Candidate value.
 * @returns An Effect succeeding with a boolean and no expected failure.
 * @example Effect.runSync(isRecordEffect({ key: "value" }))
 */
export const isRecordEffect = Effect.fn("Events.clientIsRecord")((value: unknown) =>
  Effect.sync(() => value !== null && typeof value === "object" && !Array.isArray(value)),
);
