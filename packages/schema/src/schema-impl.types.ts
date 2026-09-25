import type { Schema, StandardPathSegment, StandardResult } from "./standard-schema.types.js";

/**
 * Path-aware validation callback used by a constructed RELKIT schema.
 * @example const check: SchemaCheck<string> = (value) => ({ value: String(value) });
 */
export type SchemaCheck<T> = (
  value: unknown,
  path: readonly StandardPathSegment[],
) => StandardResult<T> | Promise<StandardResult<T>>;

/**
 * RELKIT schema with its internal path-aware validation hook.
 * The hook is only used while composing nested schemas.
 * @example const internal = schema as InternalSchema<string, string>;
 */
export interface InternalSchema<TInput, TOutput> extends Schema<TInput, TOutput> {
  readonly _run: SchemaCheck<TOutput>;
}
