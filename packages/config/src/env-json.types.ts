/** Deeply JSON-safe value suitable for declaration metadata.
 * @example const example: JsonValue = { enabled: true };
 */
export type JsonValue =
  string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };
