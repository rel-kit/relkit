/** A value or a promise of that value. */
export type MaybePromise<T> = T | Promise<T>;

/** Values represented directly by JSON. Non-finite numbers are rejected at runtime. */
export type JsonPrimitive = string | number | boolean | null;

/** A recursively JSON-serializable value. */
export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };
