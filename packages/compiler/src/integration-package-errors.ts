import { Schema } from "effect";

/** Expected integration metadata rejection, retaining the public TypeError. */
export class IntegrationPackageValidationError extends Schema.TaggedError<IntegrationPackageValidationError>()(
  "IntegrationPackageValidationError",
  { cause: Schema.Defect() },
) {}
