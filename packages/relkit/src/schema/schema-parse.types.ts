import type { StandardResult } from "./standard-schema.types.js";

/**
 * Deferred schema check used by parsing compatibility adapters.
 * @example const check: SchemaParseCheck<string> = () => ({ value: "ok" });
 */
export type SchemaParseCheck<T> = () => StandardResult<T> | Promise<StandardResult<T>>;
