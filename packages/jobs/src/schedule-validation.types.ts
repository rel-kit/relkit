import type { StandardSchemaV1 } from "@relkit/schema";
/** Schemas used to validate and canonicalize authored schedule input. */
export interface ScheduleValidationOptions {
  readonly callerSchema?: StandardSchemaV1;
  readonly canonicalSchema?: StandardSchemaV1;
}
