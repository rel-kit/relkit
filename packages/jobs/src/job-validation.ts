import type { StandardSchemaV1 } from "@relkit/schema";
import { Effect, Result, Schema } from "effect";
import type { JobAdmission, JobClientAccess } from "./job.types.js";
import type { ClientDeclarations } from "./job-validation.types.js";
import {
  copyAdmission as copyAdmissionValue,
  copyClient as copyClientValue,
} from "./job-validation-value.js";
import { observeJobs } from "./jobs-observability.js";
export type { ClientDeclarations } from "./job-validation.types.js";
/** Expected job policy validation failure with its original cause.
 * @example if (error instanceof JobValidationFailure) console.log(error.message);
 */
export class JobValidationFailure extends Schema.TaggedError<JobValidationFailure>()(
  "Jobs.JobValidationFailure",
  { cause: Schema.Defect() },
) {}
/** Copies job admission policy in Effect.
 * @param value - Candidate admission policy.
 * @param canonicalSchema - Optional canonical input schema for idempotency keys.
 * @returns Frozen admission policy or JobValidationFailure.
 * @example Effect.runSync(copyAdmissionEffect({ pastAt: "run" }));
 */
export const copyAdmissionEffect = Effect.fn("Jobs.copyJobAdmission")(
  <Input>(value: unknown, canonicalSchema?: StandardSchemaV1) =>
    observeJobs(
      "jobValidation.admission",
      Effect.try({
        try: () => copyAdmissionValue<Input>(value, canonicalSchema),
        catch: (cause) => new JobValidationFailure({ cause }),
      }),
    ),
);
/** Synchronous job admission policy copier.
 * @param value - Candidate admission policy.
 * @param canonicalSchema - Optional canonical input schema.
 * @returns Frozen admission policy when provided.
 * @throws Original invalid policy error.
 * @example copyAdmission({ pastAt: "run" });
 */
export function copyAdmission<Input>(
  value: unknown,
  canonicalSchema?: StandardSchemaV1,
): JobAdmission<Input> | undefined {
  const result = Effect.runSync(Effect.result(copyAdmissionEffect<Input>(value, canonicalSchema)));
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}
/** Copies job client access policy in Effect.
 * @param value - Candidate client policy.
 * @param declarations - Task progress and stream declarations.
 * @returns Frozen client access or JobValidationFailure.
 * @example Effect.runSync(copyClientEffect({ public: true, operations: ["trigger"] }, {}));
 */
export const copyClientEffect = Effect.fn("Jobs.copyJobClient")(
  (value: unknown, declarations: ClientDeclarations) =>
    observeJobs(
      "jobValidation.client",
      Effect.try({
        try: () => copyClientValue(value, declarations),
        catch: (cause) => new JobValidationFailure({ cause }),
      }),
    ),
);
/** Synchronous job client access policy copier.
 * @param value - Candidate client policy.
 * @param declarations - Task progress and stream declarations.
 * @returns Frozen client access when provided.
 * @throws Original invalid policy error.
 * @example copyClient({ public: true, operations: ["trigger"] }, {});
 */
export function copyClient(
  value: unknown,
  declarations: ClientDeclarations,
): JobClientAccess | undefined {
  const result = Effect.runSync(Effect.result(copyClientEffect(value, declarations)));
  if (Result.isFailure(result)) throw result.failure.cause;
  return result.success;
}
