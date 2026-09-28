import { JOB_NAME_MAX_LENGTH } from "@relkit/contracts/jobs";
import { Effect, Result, Schema } from "effect";
import { observeJobs } from "./jobs-observability.js";
import type { JobName, ValidJobName } from "./job-name.types.js";

export type { JobName, ValidJobName } from "./job-name.types.js";

/** ASCII job names start with a lowercase letter and continue with letters or digits.
 * @example JOB_NAME_PATTERN.test("sendEmail");
 */
export const JOB_NAME_PATTERN = /^[a-z][A-Za-z0-9]*$/u;
/** JavaScript promise and object keys that cannot name callable jobs.
 * @example JOB_NAME_RESERVED.includes("then");
 */
export const JOB_NAME_RESERVED = [
  "then",
  "constructor",
  "prototype",
  "toJSON",
  "toString",
  "valueOf",
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toLocaleString",
  "__proto__",
] as const;

/** A rejected authored job name with a stable validation tag.
 * @example new JobNameValidationError({ source: "job name", reason: "Invalid name" });
 */
export class JobNameValidationError extends Schema.TaggedError<JobNameValidationError>()(
  "Jobs.JobNameValidationError",
  { source: Schema.String, reason: Schema.String },
) {}

/** Tests a candidate against the job-name grammar in Effect.
 * @param value - Untrusted candidate.
 * @returns An Effect of a boolean with no typed failure.
 * @example Effect.runSync(isJobNameEffect("sendEmail"));
 */
export const isJobNameEffect = Effect.fn("Jobs.isJobName")(
  function* (value: unknown) {
    return (
      typeof value === "string" &&
      value.length >= 1 &&
      value.length <= JOB_NAME_MAX_LENGTH &&
      JOB_NAME_PATTERN.test(value) &&
      !JOB_NAME_RESERVED.some((reserved) => reserved === value)
    );
  },
  (effect) => observeJobs("jobName.is", effect),
);

/** Tests a candidate against the job-name grammar.
 * @param value - Untrusted candidate.
 * @returns Whether the candidate is a JobName.
 * @throws A runtime defect if the Effect cannot execute synchronously.
 * @example isJobName("sendEmail");
 */
export function isJobName(value: unknown): value is JobName {
  return Effect.runSync(isJobNameEffect(value));
}

/** Alias for isJobName.
 * @param value - Untrusted candidate.
 * @returns Whether the candidate is a JobName.
 * @throws A runtime defect if the Effect cannot execute synchronously.
 * @example isValidJobName("sendEmail");
 */
export const isValidJobName = isJobName;

/** Validates a job name in the Effect error channel.
 * @param value - Untrusted candidate.
 * @param source - Name of the field for diagnostics.
 * @returns An Effect succeeding with void or JobNameValidationError.
 * @example Effect.runPromise(assertJobNameEffect("sendEmail"));
 */
export const assertJobNameEffect = Effect.fn("Jobs.assertJobName")(
  function* (value: unknown, source = "job name") {
    if (yield* isJobNameEffect(value)) return;
    return yield* Effect.fail(
      new JobNameValidationError({
        source,
        reason: `${source} must be 1–64 ASCII characters matching ^[a-z][A-Za-z0-9]*$ and not a reserved name`,
      }),
    );
  },
  (effect) => observeJobs("jobName.assert", effect),
);

/** Asserts the job-name grammar for synchronous callers.
 * @param value - Untrusted candidate.
 * @param source - Name of the field for diagnostics.
 * @returns Nothing when valid.
 * @throws TypeError when the candidate is not a valid job name.
 * @example assertJobName("sendEmail");
 */
export function assertJobName(value: unknown, source = "job name"): asserts value is JobName {
  const result = Effect.runSync(Effect.result(assertJobNameEffect(value, source)));
  if (Result.isFailure(result)) throw new TypeError(result.failure.reason);
}

/** Validates a literal name in Effect while retaining its literal type.
 * @param value - Authored name.
 * @returns An Effect of the validated literal or JobNameValidationError.
 * @example Effect.runPromise(validateJobNameEffect("sendEmail"));
 */
export const validateJobNameEffect = Effect.fn("Jobs.validateJobName")(
  function* <const Name extends string>(value: Name) {
    yield* assertJobNameEffect(value);
    return value as ValidJobName<Name>;
  },
  (effect) => observeJobs("jobName.validate", effect),
);

/** Validates a literal job name for synchronous authors.
 * @param value - Authored name.
 * @returns The validated literal.
 * @throws TypeError when the name is invalid.
 * @example validateJobName("sendEmail");
 */
export function validateJobName<const Name extends string>(value: Name): ValidJobName<Name> {
  const result = Effect.runSync(Effect.result(validateJobNameEffect(value)));
  if (Result.isFailure(result)) throw new TypeError(result.failure.reason);
  return result.success;
}

/** Alias for validateJobName.
 * @param value - Authored name.
 * @returns The validated literal.
 * @throws TypeError when the name is invalid.
 * @example normalizeJobName("sendEmail");
 */
export const normalizeJobName = validateJobName;
