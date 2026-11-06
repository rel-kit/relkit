import type { StandardFailure } from "./standard-schema.types.js";

/**
 * Compatibility error thrown when parsing returns validation issues.
 * @example try { z.string().parse(1); } catch (error) { console.error(error); }
 */
export class SchemaValidationError extends TypeError {
  readonly issues: StandardFailure["issues"];

  /**
   * Creates an error from structured Standard Schema issues.
   * @param issues - Validation issues to preserve.
   * @example new SchemaValidationError([{ message: "Expected a string" }]);
   */
  constructor(issues: StandardFailure["issues"]) {
    super("Schema validation failed");
    this.name = "SchemaValidationError";
    this.issues = issues;
  }
}
