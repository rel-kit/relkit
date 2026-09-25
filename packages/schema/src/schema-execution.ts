import { SchemaExecutionError } from "./standard-schema-effect.js";

/**
 * Rethrows the original cause of an Effect execution failure.
 * @param error - Tagged execution failure or unrelated error.
 * @returns Never; this helper always throws.
 * @throws The original cause.
 * @example throwCause(new SchemaExecutionError({ cause: new TypeError("bad") }));
 */
export function throwCause(error: unknown): never {
  if (error instanceof SchemaExecutionError) throw error.cause;
  throw error;
}
