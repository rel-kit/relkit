import type { StandardResult, StandardSchemaV1 } from "./standard-schema.types.js";

/**
 * Substitutable boundary for third-party Standard Schema validation.
 * Test Layers can provide a deterministic validator.
 * @example Layer.succeed(SchemaValidator, { validate: () => ({ value: "ok" }) });
 */
export interface SchemaValidatorService {
  /**
   * Runs one Standard Schema validation hook.
   * @param schema - Compatible validator.
   * @param value - Candidate input.
   * @returns A result or promise of a result.
   * @example validator.validate(z.string(), "ok");
   */
  readonly validate: <T>(
    schema: StandardSchemaV1<unknown, T>,
    value: unknown,
  ) => StandardResult<T> | Promise<StandardResult<T>>;
}
