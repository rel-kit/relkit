import type { StandardResult } from "./standard-schema.types.js";

/**
 * Deferred child validation used by object, array, and union schemas.
 * @example const task: SchemaTask<number> = () => ({ value: 1 });
 */
export type SchemaTask<T> = () => StandardResult<T> | Promise<StandardResult<T>>;
