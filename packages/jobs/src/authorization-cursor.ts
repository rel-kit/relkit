import { Effect, Result, Schema } from "effect";
import { observeJobs } from "./jobs-observability.js";
import type { JobCursorBinding, JobCursorOptions } from "./authorization-cursor.types.js";
export type { JobCursorBinding, JobCursorOptions } from "./authorization-cursor.types.js";
import { JobCursorError } from "./authorization-errors.js";
import { createCursorValue, readCursorValue } from "./authorization-cursor-codec.js";
/** A rejected cursor creation or verification.
 * @example if (error instanceof JobCursorFailure) console.log(error.message);
 */
export class JobCursorFailure extends Schema.TaggedError<JobCursorFailure>()("Jobs.CursorFailure", {
  operation: Schema.String,
}) {}
/** Creates a bound, optionally signed job cursor in Effect.
 * @param binding - Trusted cursor binding and position.
 * @param options - Optional signing key and key identifier.
 * @returns Encoded cursor or JobCursorFailure.
 * @example Effect.runSync(createJobCursorEffect(binding, { key: "secret" }));
 */
export const createJobCursorEffect = Effect.fn("Jobs.createJobCursor")(
  (binding: JobCursorBinding, options?: JobCursorOptions) =>
    observeJobs(
      "authorization.createCursor",
      Effect.try({
        try: () => createCursorValue(binding, options),
        catch: (error) => {
          if (error instanceof JobCursorError) return new JobCursorFailure({ operation: "create" });
          throw error;
        },
      }),
    ),
);
/** Synchronous cursor creator.
 * @param binding - Trusted cursor binding and position.
 * @param options - Optional signing key and key identifier.
 * @returns Encoded cursor.
 * @throws JobCursorError when the binding or encoded cursor is invalid.
 * @example createJobCursor(binding, { key: "secret" });
 */
export function createJobCursor(binding: JobCursorBinding, options?: JobCursorOptions): string {
  const result = Effect.runSync(Effect.result(createJobCursorEffect(binding, options)));
  if (Result.isFailure(result)) throw new JobCursorError();
  return result.success;
}
/** Reads and verifies a cursor against its expected binding in Effect.
 * @param cursor - Encoded cursor.
 * @param expected - Trusted binding to compare.
 * @param options - Optional signing key and key identifier.
 * @returns Verified binding or JobCursorFailure.
 * @example Effect.runSync(readJobCursorEffect(cursor, expected, { key: "secret" }));
 */
export const readJobCursorEffect = Effect.fn("Jobs.readJobCursor")(
  (cursor: string, expected: JobCursorBinding, options?: JobCursorOptions) =>
    observeJobs(
      "authorization.readCursor",
      Effect.try({
        try: () => readCursorValue(cursor, expected, options),
        catch: (error) => {
          if (error instanceof JobCursorError) return new JobCursorFailure({ operation: "read" });
          throw error;
        },
      }),
    ),
);
/** Synchronous bound cursor reader.
 * @param cursor - Encoded cursor.
 * @param expected - Trusted binding to compare.
 * @param options - Optional signing key and key identifier.
 * @returns Verified binding.
 * @throws JobCursorError when the cursor is invalid or has a different binding.
 * @example readJobCursor(cursor, expected, { key: "secret" });
 */
export function readJobCursor(
  cursor: string,
  expected: JobCursorBinding,
  options?: JobCursorOptions,
): JobCursorBinding {
  const result = Effect.runSync(Effect.result(readJobCursorEffect(cursor, expected, options)));
  if (Result.isFailure(result)) throw new JobCursorError();
  return result.success;
}
